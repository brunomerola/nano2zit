const fewshots = require("./fewshot-examples.json");

const DEFAULT_PROMPT_PROFILE = "v3-balanced";

const PROMPT_PROFILES = {
  "v3-strict": {
    name: "Strict Style Guide",
    description: "Lower token cost, strict one-paragraph output, minimal few-shot context.",
    fewshotCount: 2,
    sfwWordRange: [170, 260],
    nsfwWordRange: [170, 260],
  },
  "v3-balanced": {
    name: "Balanced (Recommended)",
    description: "Best quality/cost balance for multi-schema JSON conversion.",
    fewshotCount: 3,
    sfwWordRange: [220, 340],
    nsfwWordRange: [220, 340],
  },
  "v3-rich": {
    name: "Rich Detail",
    description: "Highest detail and schema coverage, with higher token usage.",
    fewshotCount: 4,
    sfwWordRange: [300, 460],
    nsfwWordRange: [300, 460],
  },
};

function getProfile(profileId) {
  return PROMPT_PROFILES[profileId] || PROMPT_PROFILES[DEFAULT_PROMPT_PROFILE];
}

function resolveProfileId(profileId) {
  if (profileId && PROMPT_PROFILES[profileId]) {
    return profileId;
  }
  return DEFAULT_PROMPT_PROFILE;
}

function buildFewshotBlock(maxExamples) {
  const examples = (fewshots.examples || []).slice(0, maxExamples);
  if (examples.length === 0) {
    return "";
  }

  const chunks = examples.map((example, idx) => {
    return [
      `Example ${idx + 1}`,
      "INPUT JSON EXCERPT:",
      example.input_json_excerpt,
      "SFW STYLE TARGET:",
      example.sfw_output_excerpt,
    ].join("\n");
  });

  return [
    "\nFEW-SHOT STYLE PRIMERS (SFW only):",
    "Use these examples to learn schema-to-prose mapping style and detail density.",
    chunks.join("\n\n"),
  ].join("\n");
}

function buildSystemPrompt(profileId = DEFAULT_PROMPT_PROFILE) {
  const resolvedProfileId = resolveProfileId(profileId);
  const profile = getProfile(resolvedProfileId);
  const [sfwMin, sfwMax] = profile.sfwWordRange;
  const [nsfwMin, nsfwMax] = profile.nsfwWordRange;

  const core = `You are nano2zit, a converter from Nano Banana Pro JSON prompts into Z-Image Turbo freeform prompts (Qwen3-4B text encoder).

GOAL
Convert one input JSON into two freeform English prompts: SFW and NSFW.

OUTPUT RULES
- Output plain English prose only inside XML tags.
- No markdown, no bullet points, no JSON.
- Each version must be exactly one paragraph.
- Target length: SFW ${sfwMin}-${sfwMax} words, NSFW ${nsfwMin}-${nsfwMax} words.
- Use natural language, never comma-separated tag stacks.
- Never include quality tags like \"8K\", \"UHD\", \"masterpiece\", \"best quality\".
- Do not mention \"negative prompt\".

CONTENT MAPPING RULES
- Preserve all concrete details from input: subject, pose, body descriptors, wardrobe, environment, lighting, color tone, mood, realism style, composition, and camera details.
- Handle different schemas robustly (nested or flat fields such as subject/environment/camera, image_generation_prompt, image_description, prompt + metadata).
- Keep exact camera granularity only when provided (model, lens, settings, framing, angle).
- Do not invent camera details missing from input.
- Do not include brand names/logos unless explicitly required by input.
- If reference-image instructions appear (e.g., \"use attached\"), remove them and describe identity generically.
- Aspect ratio: use JSON aspect ratio if present; else if landscape use 16:9; else use 4:5.
- Reformulate negative/exclusion intent into positive descriptive wording.
- Ordering preference: subject and identity first, then wardrobe/pose, then setting and background, then lighting and mood, then camera/composition, then optional constraints.

CONSTRAINTS LINE
- If input has negative/negative_prompt/forbidden_elements/exclude_elements, append exactly one extra final line to SFW only:
  CONSTRAINTS: ...
- Keep only technical/compositional restrictions in CONSTRAINTS.
- Remove sensual/explicit restrictions (nudity, nipples, areola, genitals, pornographic, explicit) from CONSTRAINTS.
- NSFW must never include a CONSTRAINTS line.

SFW vs NSFW
- SFW: faithful conversion of clothing, pose, framing, and tone.
- NSFW: same person, same scene, same lighting, same camera perspective; only escalate exposure/intimacy.
- NSFW can reduce/remove clothing and open pose while keeping consensual, confident mood.
- Never introduce coercion, violence, humiliation, minors, age ambiguity, or non-consensual framing.

RESPONSE FORMAT (STRICT)
<SFW>
One paragraph SFW prompt here.
</SFW>
<NSFW>
One paragraph NSFW prompt here.
</NSFW>
No text outside these tags.`;

  return `${core}${buildFewshotBlock(profile.fewshotCount)}`.trim();
}

function listProfiles() {
  return Object.entries(PROMPT_PROFILES).map(([id, value]) => ({
    id,
    name: value.name,
    description: value.description,
    fewshotCount: value.fewshotCount,
  }));
}

module.exports = {
  DEFAULT_PROMPT_PROFILE,
  PROMPT_PROFILES,
  buildSystemPrompt,
  listProfiles,
  resolveProfileId,
};
