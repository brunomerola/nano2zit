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

    const systemPrompt = buildSystemPrompt(resolvedProfile);
    const userPrompt = `Convert this JSON into SFW and NSFW ZiT prompts.\n\nINPUT JSON:\n${inputJson}`;

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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof BadRequestError ? 400 : 500;
    res.status(status).json({ error: message });
  }
};
