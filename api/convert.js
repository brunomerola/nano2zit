const {
  buildSystemPrompt,
  DEFAULT_PROMPT_PROFILE,
  listProfiles,
  resolveProfileId,
  PROMPT_PROFILES,
} = require("../config/prompt-profiles");
const { generateCompletion, getRuntimeModelConfig } = require("../lib/llm-client");
const { parseSfwNsfw } = require("../lib/response-parser");

const MAX_INPUT_JSON_CHARS = 60000;
const STRONG_CONSTRAINT_KEYS = new Set([
  "negative",
  "negative_prompt",
  "negative_prompt_strict",
  "negative_prompt_string",
  "forbidden_elements",
  "forbidden_content",
  "exclude_elements",
  "constraints",
  "realism_constraints",
  "crop_restriction",
  "no_filters",
]);
const CONSTRAINT_KEY_TOKENS = new Set([
  "negative",
  "constraint",
  "constraints",
  "forbid",
  "forbidden",
  "exclude",
  "excluded",
  "avoid",
  "ban",
  "banned",
  "prohibit",
  "prohibited",
  "restrict",
  "restriction",
  "disallow",
  "blacklist",
  "forbidden_elements",
  "exclude_elements",
  "forbidden_content",
  "crop_restriction",
  "no_filters",
]);
const CONSTRAINT_VALUE_CUE_REGEX = /\b(no\s+[^,.;]{1,48}|without\s+[^,.;]{1,48}|avoid\b|exclude\b|forbid\b|forbidden\b|ban\b|banned\b|prohibit\b|prohibited\b|disallow\b|do\s+not\b|must\s+not\b|never\b|constraint[s]?\b)\b/i;
const NSFW_SIGNAL_REGEX = /\b(nsfw|nude|nudity|naked|nipples?|areola|genitals?|vagina|penis|sex|sexual|erotic|explicit|lingerie|see[-\s]?through|thong)\b/i;

class BadRequestError extends Error {}

function parseBody(req) {
  if (!req.body) {
    return {};
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestError(`Invalid JSON request body: ${message}`);
    }
  }
  return req.body;
}

function validateInputJson(inputJson) {
  if (typeof inputJson !== "string" || inputJson.trim().length === 0) {
    throw new BadRequestError("input_json is required");
  }
  if (inputJson.length > MAX_INPUT_JSON_CHARS) {
    throw new BadRequestError(`input_json exceeds ${MAX_INPUT_JSON_CHARS} characters`);
  }
  try {
    JSON.parse(inputJson);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BadRequestError(`Invalid JSON input: ${message}`);
  }
}

function collectLeafText(value, output) {
  if (value == null) {
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      output.push(trimmed);
    }
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectLeafText(item, output);
    }
    return;
  }
  if (typeof value === "object") {
    for (const nested of Object.values(value)) {
      collectLeafText(nested, output);
    }
  }
}

function keyTokens(key) {
  return String(key)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isStrongConstraintKey(key) {
  return STRONG_CONSTRAINT_KEYS.has(String(key).toLowerCase());
}

function isConstraintLikeKey(key) {
  const tokens = keyTokens(key);
  if (tokens.some((token) => CONSTRAINT_KEY_TOKENS.has(token))) {
    return true;
  }
  // Includes key forms like no_filters, no_blur, no_artifacts.
  if (tokens.some((token) => token.startsWith("no") && token.length > 2)) {
    return true;
  }
  return false;
}

function looksConstraintLikeText(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }
  return CONSTRAINT_VALUE_CUE_REGEX.test(normalized);
}

function shouldIncludeStrongKeyString(key, value) {
  if (isStrongConstraintKey(key)) {
    return true;
  }
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }
  if (looksConstraintLikeText(normalized)) {
    return true;
  }
  // Handles list-like negatives such as "cartoon, blurry, low-res, ...".
  if (normalized.length <= 420 && normalized.split(",").length >= 3) {
    return true;
  }
  return false;
}

function collectConstraintHints(value, keyBasedHints, ambientHints) {
  if (value == null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectConstraintHints(item, keyBasedHints, ambientHints);
    }
    return;
  }
  if (typeof value === "string") {
    if (looksConstraintLikeText(value)) {
      ambientHints.push(value);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }

  for (const [rawKey, nested] of Object.entries(value)) {
    const key = String(rawKey);
    if (isConstraintLikeKey(key)) {
      if (typeof nested === "string") {
        if (shouldIncludeStrongKeyString(key, nested)) {
          keyBasedHints.push(nested);
        }
      } else {
        collectLeafText(nested, keyBasedHints);
      }
    }
    if (typeof nested === "string") {
      if (looksConstraintLikeText(nested)) {
        ambientHints.push(nested);
      }
    } else if (nested && typeof nested === "object") {
      collectConstraintHints(nested, keyBasedHints, ambientHints);
    }
  }
}

function uniqueHints(items, maxItems = 24) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const normalized = item.replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(item.replace(/\s+/g, " ").trim());
    if (out.length >= maxItems) {
      break;
    }
  }
  return out;
}

function buildConversionDirectives(inputJson) {
  let parsed;
  try {
    parsed = JSON.parse(inputJson);
  } catch {
    return { directives: "", hasNegativeHints: false, hasExplicitSignals: false };
  }

  const keyBasedHints = [];
  const ambientHints = [];
  collectConstraintHints(parsed, keyBasedHints, ambientHints);
  const constraintHints = uniqueHints([...keyBasedHints, ...ambientHints]);
  const hasExplicitSignals = NSFW_SIGNAL_REGEX.test(inputJson);
  const hasConstraintHints = constraintHints.length > 0;

  const lines = [
    "DIRECTIVES (MUST FOLLOW)",
    `- constraint_hints_found: ${hasConstraintHints ? "yes" : "no"}`,
    `- explicit_or_nsfw_cues_found: ${hasExplicitSignals ? "yes" : "no"}`,
  ];

  if (hasConstraintHints) {
    lines.push("- Convert every constraint hint into positive guidance.");
    lines.push("- Append one final CONSTRAINTS line to BOTH <SFW> and <NSFW>.");
    lines.push("- Cover all constraint hints across those two CONSTRAINTS lines.");
    lines.push("CONSTRAINT_HINTS:");
    for (const hint of constraintHints) {
      lines.push(`- ${hint}`);
    }
  }

  if (hasExplicitSignals) {
    lines.push("- SFW must attenuate explicitness while preserving composition, scene, and camera intent.");
  }

  return {
    directives: lines.join("\n"),
    hasConstraintHints,
    hasExplicitSignals,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    const cfg = getRuntimeModelConfig();
    res.status(200).json({
      ok: true,
      provider: cfg.provider,
      model: cfg.model,
      default_prompt_profile: DEFAULT_PROMPT_PROFILE,
      prompt_profiles: listProfiles(),
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = parseBody(req);
    const inputJson = String(body.input_json || "");
    const requestedProfile = String(body.prompt_version || DEFAULT_PROMPT_PROFILE);
    const resolvedProfile = resolveProfileId(requestedProfile);
    if (!PROMPT_PROFILES[requestedProfile] && requestedProfile !== DEFAULT_PROMPT_PROFILE) {
      res.status(400).json({
        error: `Unknown prompt_version: ${requestedProfile}`,
        valid_prompt_versions: listProfiles().map((p) => p.id),
      });
      return;
    }

    validateInputJson(inputJson);

    const directives = buildConversionDirectives(inputJson);
    const systemPrompt = buildSystemPrompt(resolvedProfile);
    const userPrompt = [
      "Convert this JSON into SFW and NSFW ZiT prompts.",
      directives.directives,
      "",
      "INPUT JSON:",
      inputJson,
    ].join("\n");

    const completion = await generateCompletion({ systemPrompt, userPrompt });
    const parsed = parseSfwNsfw(completion.text);

    if (!parsed || !parsed.sfw || !parsed.nsfw) {
      res.status(422).json({
        error: "Could not parse SFW/NSFW from model output",
        preview: completion.text.slice(0, 500),
        provider: completion.provider,
        model: completion.model,
      });
      return;
    }

    res.status(200).json({
      sfw: parsed.sfw,
      nsfw: parsed.nsfw,
      provider: completion.provider,
      model: completion.model,
      prompt_version: resolvedProfile,
      usage: completion.usage || null,
      conversion_directives: {
        negative_hints_found: directives.hasConstraintHints,
        constraint_hints_found: directives.hasConstraintHints,
        explicit_or_nsfw_cues_found: directives.hasExplicitSignals,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof BadRequestError ? 400 : 500;
    res.status(status).json({ error: message });
  }
};
