# Architecture + Pre-Prompt Audit

## Scope reviewed
- `index.html`
- `api/convert.js`
- `config/prompt-profiles.js`
- `config/fewshot-examples.json`
- `scripts/select_fewshot_examples.py`
- `prompts.csv`, `style_guide.txt`, and session constraints in `nano2zit-session-log.md`

## Implemented architecture changes
- Moved conversion instructions out of frontend and into server-side prompt profiles (`config/prompt-profiles.js`).
- Added profile versioning and runtime metadata endpoint (`GET /api/convert`).
- Added provider abstraction (`anthropic` or `openai-compat`) in `lib/llm-client.js`.
- Added structured response parser (`lib/response-parser.js`) with XML-first parsing.
- Added benchmark harness (`scripts/benchmark-models.js`) for model/profile adherence scoring.
- Added few-shot selector (`scripts/select_fewshot_examples.py`) to keep examples structurally diverse and token-efficient.

## Pre-prompt compliance checks
- Plain-text output requirement: enforced.
- One-paragraph SFW/NSFW: enforced.
- No JSON output instruction: enforced.
- No "Respond with valid JSON": removed from active runtime prompt.
- Camera rule (preserve when explicit, do not invent): enforced.
- Aspect-ratio fallback logic: enforced (`aspect_ratio` -> `16:9` if landscape -> `4:5`).
- CONSTRAINTS behavior: enforced only for SFW when negative keys exist; explicit-content restrictions stripped.
- Quality-tag filtering (`8k`, `uhd`, `masterpiece`, etc.): enforced in instruction layer and few-shot generation.

## Dataset-aware few-shot strategy
- Few-shot set is generated from `prompts.csv` with structural diversity + low prompt length.
- Current selected families include:
  - `image_generation_prompt`
  - `image_description`
  - `prompt + negative_prompt + model_hint`
  - `camera/composition/lighting/mood/prompt/...`

## Open risk
- A/B calibration is still needed to choose final default profile (`v3-balanced` vs `v3-rich`) under real traffic cost/quality targets.
