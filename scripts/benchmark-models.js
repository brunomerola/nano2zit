#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const { buildSystemPrompt, listProfiles, DEFAULT_PROMPT_PROFILE } = require(path.join(
  repoRoot,
  "config/prompt-profiles"
));
const { generateCompletion, getRuntimeModelConfig } = require(path.join(repoRoot, "lib/llm-client"));
const { parseSfwNsfw } = require(path.join(repoRoot, "lib/response-parser"));

const BANNED_TERMS_REGEX = /\b(8k|uhd|masterpiece|best quality|octane render|ray[-\s]?traced)\b/i;
const CAMERA_HINT_REGEX = /\b(camera|lens|aperture|f\/\d|shot|angle|framing|focal)\b/i;
const NEGATIVE_PROMPT_REGEX = /negative\s*prompt/i;
const DEFAULT_TARGETS = [];

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const chunk = arg.slice(2);
    const eqIdx = chunk.indexOf("=");
    if (eqIdx === -1) {
      out[chunk] = true;
    } else {
      const key = chunk.slice(0, eqIdx);
      const value = chunk.slice(eqIdx + 1);
      out[key] = value;
    }
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // Ignore CR in CRLF.
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const header = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values) => {
    const record = {};
    for (let i = 0; i < header.length; i += 1) {
      record[header[i]] = values[i] ?? "";
    }
    return record;
  });
}

function signatureFromJson(obj) {
  return Object.keys(obj).sort().join("|");
}

function deepHasKey(input, targetKeys) {
  if (!input || typeof input !== "object") {
    return false;
  }
  if (Array.isArray(input)) {
    return input.some((item) => deepHasKey(item, targetKeys));
  }
  for (const [key, value] of Object.entries(input)) {
    if (targetKeys.has(String(key).toLowerCase())) {
      return true;
    }
    if (value && typeof value === "object" && deepHasKey(value, targetKeys)) {
      return true;
    }
  }
  return false;
}

function deepFindAspectRatio(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = deepFindAspectRatio(item);
      if (found) {
        return found;
      }
    }
    return null;
  }
  for (const [key, value] of Object.entries(input)) {
    if (String(key).toLowerCase() === "aspect_ratio" && typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (value && typeof value === "object") {
      const found = deepFindAspectRatio(value);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function deepText(input) {
  if (input == null) {
    return "";
  }
  if (typeof input === "string") {
    return input;
  }
  if (typeof input === "number" || typeof input === "boolean") {
    return String(input);
  }
  if (Array.isArray(input)) {
    return input.map((v) => deepText(v)).join(" ");
  }
  return Object.values(input).map((v) => deepText(v)).join(" ");
}

function parseTargets(rawTargets, fallbackCfg) {
  const raw = rawTargets && rawTargets.trim().length > 0
    ? rawTargets.split(",").map((v) => v.trim()).filter(Boolean)
    : DEFAULT_TARGETS;

  if (raw.length === 0) {
    return [{
      id: `${fallbackCfg.provider}:${fallbackCfg.model}`,
      provider: fallbackCfg.provider,
      model: fallbackCfg.model,
      openaiCompatBaseUrl: fallbackCfg.openaiCompatBaseUrl,
    }];
  }

  return raw.map((spec) => {
    const atIdx = spec.lastIndexOf("@");
    const withProviderAndModel = atIdx === -1 ? spec : spec.slice(0, atIdx);
    const customBaseUrl = atIdx === -1 ? "" : spec.slice(atIdx + 1);
    const colonIdx = withProviderAndModel.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(`Invalid target format: ${spec}. Use provider:model or provider:model@baseUrl`);
    }
    const provider = withProviderAndModel.slice(0, colonIdx).trim();
    const model = withProviderAndModel.slice(colonIdx + 1).trim();
    if (!provider || !model) {
      throw new Error(`Invalid target format: ${spec}`);
    }
    return {
      id: `${provider}:${model}`,
      provider,
      model,
      openaiCompatBaseUrl: customBaseUrl || fallbackCfg.openaiCompatBaseUrl,
    };
  });
}

function loadSamples({ csvPath, sampleSize, maxJsonChars }) {
  const csvText = fs.readFileSync(csvPath, "latin1");
  const rawRows = parseCsv(csvText);
  const parsedRows = [];

  for (const row of rawRows) {
    const rawJson = (row.prompt_json || "").trim();
    if (!rawJson || rawJson.length > maxJsonChars) {
      continue;
    }
    let parsedJson;
    try {
      parsedJson = JSON.parse(rawJson);
    } catch {
      continue;
    }
    if (!parsedJson || typeof parsedJson !== "object" || Array.isArray(parsedJson)) {
      continue;
    }
    parsedRows.push({
      promptId: String(row.prompt_id || ""),
      tweetId: String(row.tweet_id || ""),
      promptJson: rawJson,
      parsedJson,
      signature: signatureFromJson(parsedJson),
      jsonChars: rawJson.length,
    });
  }

  parsedRows.sort((a, b) => a.jsonChars - b.jsonChars);

  const forceFamilies = [
    "image_generation_prompt",
    "image_description",
    "prompt",
    "subject",
    "scene",
  ];
  const selected = [];
  const usedSignatures = new Set();

  for (const family of forceFamilies) {
    const hit = parsedRows.find((row) => Object.prototype.hasOwnProperty.call(row.parsedJson, family) && !usedSignatures.has(row.signature));
    if (hit) {
      selected.push(hit);
      usedSignatures.add(hit.signature);
      if (selected.length >= sampleSize) {
        break;
      }
    }
  }

  if (selected.length < sampleSize) {
    for (const row of parsedRows) {
      if (selected.length >= sampleSize) {
        break;
      }
      if (usedSignatures.has(row.signature)) {
        continue;
      }
      selected.push(row);
      usedSignatures.add(row.signature);
    }
  }

  return {
    totalRows: parsedRows.length,
    samples: selected.slice(0, sampleSize),
  };
}

function wordCount(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function paragraphCount(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\n\s*\n/).filter(Boolean).length;
}

function expectedAspectRatio(parsedJson) {
  const explicit = deepFindAspectRatio(parsedJson);
  if (explicit) {
    return explicit;
  }
  const asText = deepText(parsedJson).toLowerCase();
  if (asText.includes("landscape")) {
    return "16:9";
  }
  return "4:5";
}

function evaluateOutput({ parsedJson, rawText, parsed }) {
  const hasNegativeConstraints = deepHasKey(parsedJson, new Set([
    "negative",
    "negative_prompt",
    "forbidden_elements",
    "exclude_elements",
  ]));
  const hasCameraData = deepHasKey(parsedJson, new Set([
    "camera",
    "camera_perspective",
    "lens",
    "aperture",
    "focal_length",
    "iso",
    "shutter_speed",
  ]));
  const expectedRatio = expectedAspectRatio(parsedJson);

  const sfw = parsed?.sfw || "";
  const nsfw = parsed?.nsfw || "";
  const joined = `${sfw}\n${nsfw}`;
  const hasXml = /<SFW>[\s\S]*<\/SFW>/i.test(rawText) && /<NSFW>[\s\S]*<\/NSFW>/i.test(rawText);
  const hasConstraintsSfw = /^CONSTRAINTS:/im.test(sfw);
  const hasConstraintsNsfw = /^CONSTRAINTS:/im.test(nsfw);
  const ratioRegex = new RegExp(`\\b${expectedRatio.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

  const metrics = {
    parseOk: Boolean(parsed && sfw && nsfw),
    xmlTags: hasXml,
    sfwOneParagraph: paragraphCount(sfw) === 1,
    nsfwOneParagraph: paragraphCount(nsfw) === 1,
    bannedTermsAbsent: !BANNED_TERMS_REGEX.test(joined),
    noNegativePromptLiteral: !NEGATIVE_PROMPT_REGEX.test(joined),
    constraintsRuleOk: hasNegativeConstraints
      ? hasConstraintsSfw && !hasConstraintsNsfw
      : !hasConstraintsSfw && !hasConstraintsNsfw,
    aspectRatioMentioned: ratioRegex.test(joined),
    cameraRuleOk: hasCameraData ? CAMERA_HINT_REGEX.test(joined) : true,
  };

  const weights = {
    parseOk: 30,
    xmlTags: 8,
    sfwOneParagraph: 8,
    nsfwOneParagraph: 8,
    bannedTermsAbsent: 12,
    noNegativePromptLiteral: 8,
    constraintsRuleOk: 12,
    aspectRatioMentioned: 10,
    cameraRuleOk: 4,
  };

  let score = 0;
  for (const [name, weight] of Object.entries(weights)) {
    if (metrics[name]) {
      score += weight;
    }
  }

  return {
    metrics,
    score,
    expectedRatio,
    hasNegativeConstraints,
    hasCameraData,
    sfwWords: wordCount(sfw),
    nsfwWords: wordCount(nsfw),
  };
}

function mean(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(part, total) {
  if (total === 0) {
    return 0;
  }
  return (part / total) * 100;
}

async function sleep(ms) {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`Usage:
  node scripts/benchmark-models.js [options]

Options:
  --csv=prompts.csv
  --sample-size=8
  --max-json-chars=4200
  --profiles=v3-balanced,v3-rich
  --targets=openai-compat:Qwen/Qwen3-32B,openai-compat:Qwen/Qwen2.5-72B-Instruct
  --delay-ms=250
  --out=docs/benchmark-report.json
  --dry-run`);
    return;
  }

  const csvPath = path.resolve(repoRoot, args.csv || "prompts.csv");
  const sampleSize = Number.parseInt(args["sample-size"] || "8", 10);
  const maxJsonChars = Number.parseInt(args["max-json-chars"] || "4200", 10);
  const delayMs = Number.parseInt(args["delay-ms"] || "250", 10);
  const outPath = path.resolve(repoRoot, args.out || "docs/benchmark-report.json");
  const availableProfiles = listProfiles().map((p) => p.id);
  const requestedProfiles = (args.profiles || availableProfiles.join(","))
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const profiles = requestedProfiles.filter((id) => availableProfiles.includes(id));

  if (profiles.length === 0) {
    throw new Error(`No valid profiles selected. Available: ${availableProfiles.join(", ")}`);
  }

  const runtimeCfg = getRuntimeModelConfig();
  const targets = parseTargets(args.targets || "", runtimeCfg);

  const { totalRows, samples } = loadSamples({ csvPath, sampleSize, maxJsonChars });
  if (samples.length === 0) {
    throw new Error("No benchmark samples found. Adjust --max-json-chars or verify prompts.csv.");
  }

  console.log(`Loaded ${totalRows} eligible JSON rows from prompts.csv`);
  console.log(`Selected ${samples.length} compact + schema-diverse samples`);
  console.log(`Profiles: ${profiles.join(", ")}`);
  console.log(`Targets: ${targets.map((t) => t.id).join(", ")}`);

  if (args["dry-run"]) {
    console.log("Dry run enabled: no model calls will be executed.");
    for (const sample of samples) {
      console.log(`sample prompt_id=${sample.promptId} signature=${sample.signature} json_chars=${sample.jsonChars}`);
    }
    return;
  }

  const startedAt = new Date().toISOString();
  const cases = [];

  for (const target of targets) {
    for (const profileId of profiles) {
      const systemPrompt = buildSystemPrompt(profileId);
      for (const sample of samples) {
        const userPrompt = `Convert this JSON into SFW and NSFW ZiT prompts.\n\nINPUT JSON:\n${sample.promptJson}`;
        const t0 = Date.now();
        try {
          const completion = await generateCompletion({
            systemPrompt,
            userPrompt,
            runtime: {
              provider: target.provider,
              model: target.model,
              openaiCompatBaseUrl: target.openaiCompatBaseUrl,
            },
          });
          const latencyMs = Date.now() - t0;
          const parsed = parseSfwNsfw(completion.text);
          const evalResult = evaluateOutput({
            parsedJson: sample.parsedJson,
            rawText: completion.text,
            parsed,
          });

          cases.push({
            status: "ok",
            targetId: target.id,
            profileId,
            promptId: sample.promptId,
            tweetId: sample.tweetId,
            signature: sample.signature,
            jsonChars: sample.jsonChars,
            latencyMs,
            score: evalResult.score,
            metrics: evalResult.metrics,
            expectedRatio: evalResult.expectedRatio,
            hasNegativeConstraints: evalResult.hasNegativeConstraints,
            hasCameraData: evalResult.hasCameraData,
            sfwWords: evalResult.sfwWords,
            nsfwWords: evalResult.nsfwWords,
            provider: completion.provider,
            model: completion.model,
            usage: completion.usage || null,
          });
        } catch (err) {
          const latencyMs = Date.now() - t0;
          cases.push({
            status: "error",
            targetId: target.id,
            profileId,
            promptId: sample.promptId,
            tweetId: sample.tweetId,
            signature: sample.signature,
            jsonChars: sample.jsonChars,
            latencyMs,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        await sleep(delayMs);
      }
    }
  }

  const byBucket = {};
  for (const item of cases) {
    const key = `${item.targetId}::${item.profileId}`;
    if (!byBucket[key]) {
      byBucket[key] = [];
    }
    byBucket[key].push(item);
  }

  const summary = Object.entries(byBucket).map(([key, bucket]) => {
    const [targetId, profileId] = key.split("::");
    const okCases = bucket.filter((c) => c.status === "ok");
    const errors = bucket.filter((c) => c.status === "error");
    const parseOk = okCases.filter((c) => c.metrics.parseOk).length;
    const constraintsOk = okCases.filter((c) => c.metrics.constraintsRuleOk).length;
    const bannedClean = okCases.filter((c) => c.metrics.bannedTermsAbsent).length;
    const aspectOk = okCases.filter((c) => c.metrics.aspectRatioMentioned).length;

    return {
      targetId,
      profileId,
      total: bucket.length,
      ok: okCases.length,
      errors: errors.length,
      avgScore: Number(mean(okCases.map((c) => c.score)).toFixed(2)),
      avgLatencyMs: Number(mean(okCases.map((c) => c.latencyMs)).toFixed(2)),
      avgSfwWords: Number(mean(okCases.map((c) => c.sfwWords)).toFixed(2)),
      avgNsfwWords: Number(mean(okCases.map((c) => c.nsfwWords)).toFixed(2)),
      parseSuccessPct: Number(pct(parseOk, okCases.length).toFixed(2)),
      constraintsOkPct: Number(pct(constraintsOk, okCases.length).toFixed(2)),
      bannedCleanPct: Number(pct(bannedClean, okCases.length).toFixed(2)),
      aspectOkPct: Number(pct(aspectOk, okCases.length).toFixed(2)),
    };
  });

  summary.sort((a, b) => {
    if (b.avgScore !== a.avgScore) {
      return b.avgScore - a.avgScore;
    }
    return a.avgLatencyMs - b.avgLatencyMs;
  });

  const payload = {
    startedAt,
    finishedAt: new Date().toISOString(),
    config: {
      csvPath: path.relative(repoRoot, csvPath),
      sampleSize,
      maxJsonChars,
      delayMs,
      profiles,
      targets,
      defaultProfile: DEFAULT_PROMPT_PROFILE,
      runtimeModelConfig: runtimeCfg,
    },
    dataset: {
      totalRows,
      selectedSamples: samples.map((s) => ({
        promptId: s.promptId,
        tweetId: s.tweetId,
        signature: s.signature,
        jsonChars: s.jsonChars,
      })),
    },
    summary,
    cases,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log("\nTop benchmark buckets:");
  for (const row of summary.slice(0, 8)) {
    console.log(
      `${row.targetId} | ${row.profileId} | score=${row.avgScore} | parse=${row.parseSuccessPct}% | constraints=${row.constraintsOkPct}% | aspect=${row.aspectOkPct}% | latency=${row.avgLatencyMs}ms`
    );
  }
  console.log(`\nReport written to ${path.relative(repoRoot, outPath)}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  console.error(message);
  process.exit(1);
});
