# nano2zit — Session Log

**Date:** February 24, 2026  
**Project:** nano2zit — Nano Banana Pro JSON → Z-Image Turbo Freeform Prompt Converter  
**Participants:** Bruno Merola + Claude Opus 4.6

---

## 1. Project Brief

**Objective:** Create an application that receives a list of Nano Banana Pro (Google Gemini) JSON prompts for image generation and converts them into Z-Image Turbo freeform natural language prompts (English), optimized for the Qwen-3 4B text encoder. Each prompt must have a SFW version and an NSFW escalation.

**Input format:** Structured JSON prompts (6+ different schemas observed across 81 examples)

**Output format:** Dense, descriptive English paragraphs — no tags, no JSON, no negative prompts

**Key constraints:**
- ZiT has no negative prompt support; restrictions must be reformulated as positive descriptions
- Quality tags like "8K", "UHD", "masterpiece" are discouraged — describe the scene instead
- Prompts should be long and detailed (512–1024 tokens) to leverage Qwen-3 4B's capacity
- NSFW version = same scene escalated (remove/minimize clothing, open pose), never adding discomfort or coercion

---

## 2. Reference Materials Provided

### 2.1. prompts.csv
- 81 rows with columns: `prompt_id`, `tweet_id`, `prompt_json`, `prompt_gpt`, `prompt_zit`
- All 81 rows had existing ZiT and GPT conversions (used as few-shot examples)
- JSON schemas varied widely: some with `meta/scene/lighting/camera_perspective/subject`, others with flat `image_generation_prompt`, others with `scene_type/description/subject/secondary_subjects`, etc.
- Average JSON length: ~2,887 chars; average ZiT length: ~1,681 chars

### 2.2. Melhores Práticas de Prompting para Z-Image Turbo + Qwen-3 4B (PDF)
12-page deep dive covering:
- ZiT architecture (S3-DiT, ~6B params, 8 NFEs)
- Qwen-3 4B as text encoder replacing CLIP (better semantic understanding)
- 8 best practices for ZiT prompting (long/detailed, natural language, no quality tags, no negative prompts, logical ordering, etc.)
- Comparison: JSON structured prompts vs. freeform text
- Practical guide for JSON→text conversion (nano2zit adapter)
- Full worked example: JSON Prompt 1 → freeform text

### 2.3. style_guide.txt
Concise formatting rules:
- Output plain English text only, 1 paragraph
- Preserve camera specifics if explicitly in input; don't invent them
- Aspect ratio: from JSON > "landscape" → 16:9 > default 4:5
- CONSTRAINTS line: only technical/compositional restrictions; strip sensual/explicit restrictions
- Remove reference-image instructions, describe identity generically

---

## 3. Architecture Decisions

### Why LLM over deterministic logic?
The 6+ different JSON schemas across the 81 prompts make rule-based parsing fragile. An LLM naturally adapts to any structure and extracts semantic meaning regardless of key names.

### Model choice: Claude Sonnet 4.5
`claude-sonnet-4-5-20250929` — fast enough for batch processing (50+ prompts), strong in creative writing and instruction following. Sweet spot between quality and speed/cost.

Note: Sonnet 4.6 does not exist. The Claude 4.5 family is: Opus 4.6, Sonnet 4.5, Haiku 4.5.

### Platform: React artifact (claude.ai) + Vercel deployment
- **Artifact:** Works inside Claude conversations using the built-in API proxy (no key needed, included in plan)
- **Vercel deployment:** Standalone web app at a permanent URL with serverless function as API proxy

### API cost
Inside claude.ai artifacts, API calls consume the user's plan message allowance (not billed separately). Each prompt conversion = ~1 Sonnet message.

---

## 4. System Prompt (nano2zit converter)

The system prompt encodes all conversion rules in a single instruction set:

**Core rules (14 total):**
1. Output plain English text only
2. Write 1–3 dense paragraphs
3. Long, detailed prompts (512–1024 tokens)
4. Natural language, not tag lists
5. No quality tags (8K, UHD, masterpiece)
6. No negative prompt output
7. CONSTRAINTS line only for technical/compositional restrictions (strip explicit content restrictions)
8. Preserve all details: subject, pose, body, outfit, environment, lighting, mood, camera
9. Keep camera specifics if in input; don't invent
10. Remove reference-image instructions
11. Aspect ratio handling
12. Logical information ordering
13. Reformulate negatives as positives
14. Adapt to any JSON schema

**SFW vs NSFW rules:**
- SFW: faithful conversion of JSON as-is
- NSFW: same scene escalated — remove/minimize clothing, open concealing poses, add explicit body visibility, maintain mood and environment unchanged, no CONSTRAINTS line

**Response format:** `{"sfw": "...", "nsfw": "..."}`

**Few-shot examples:** 2 real examples from the CSV (one detailed schema, one simple/flat schema)

---

## 5. Application Features

### Core functionality
- Paste one or more JSON prompts → auto-detect individual JSON blocks
- Convert via Sonnet 4.5 API (one call per prompt, returns SFW + NSFW)
- Cards with SFW/NSFW tabs, individual copy buttons
- Progress bar, stop button, error handling

### Reference links
- Optional URL on the line before each JSON block (e.g., tweet URL)
- Auto-detected during parsing
- Displayed as clickable "↗ src" button on each card
- Included in CSV export and Copy All output

### Auto-numbering
- Persistent auto-increment counter (survives across sessions)
- Numbers don't change when deleting prompts (#7 stays #7 even if #3 is deleted)
- Resets only with "Clear all"

### Persistence
- **Artifact (claude.ai):** `window.storage` API
- **Vercel deployment:** `localStorage`
- Results + counter persist across sessions

### Export
- **Copy all SFW / Copy all NSFW:** bulk copy to clipboard
- **↓ CSV:** exports `num, label, ref, sfw, nsfw, json_input` as downloadable file
- **Clear all:** wipes results and resets counter

### Batch processing
- 500ms delay between API calls to avoid rate limits
- Append mode: new conversions are added to existing results
- Stop button to abort mid-batch

---

## 6. Deployment

### Vercel structure
```
nano2zit-vercel/
├── vercel.json              ← routing config
├── public/index.html        ← complete React app (CDN imports)
└── api/convert.js           ← serverless function (API proxy)
```

### Setup steps
1. Upload folder to Vercel (vercel.com/new → Upload)
2. Add environment variable: `ANTHROPIC_API_KEY` = `sk-ant-...`
3. Redeploy

### API modes
- **Server proxy** (default): calls `/api/convert` serverless function which uses env var key — secure, key never exposed to browser
- **Direct mode**: user enters API key in browser — stored in localStorage, calls Anthropic API directly

### Also available as Netlify deployment
Same architecture with edge function instead of serverless function. Zip package provided.

---

## 7. Key Technical Details

### JSON block parser
Detects top-level `{}` blocks by tracking brace depth. Looks backwards from each block's start for a URL on the preceding line (regex: `^https?://\S+$`).

### Label extraction
Attempts to extract a meaningful label from JSON by checking common key paths: `scene.location`, `environment.setting`, `image_generation_prompt.environment.setting`, `subject.description`, `subject.gender`, etc.

### CSV escaping
Double-quote fields containing commas, newlines, or quotes. Escape internal quotes by doubling them.

---

## 8. Files Produced

| File | Purpose |
|------|---------|
| `nano2zit.jsx` | React artifact for claude.ai (window.storage, Claude API proxy) |
| `nano2zit-vercel.zip` | Vercel deployment package (localStorage, serverless proxy) |
| `nano2zit-deploy.zip` | Netlify deployment package (localStorage, edge function proxy) |

---

## 9. Open Items / Next Steps

- Deploy to Vercel (manual upload pending)
- Test with full 81-prompt batch from CSV
- Evaluate output quality vs. existing `prompt_zit` column
- Iterate on system prompt if needed (NSFW escalation intensity, specific style tweaks)
- Consider adding Qwen open-source model as alternative to Sonnet for cost optimization
