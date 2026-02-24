# Repository Guidelines

## Project Structure & Module Organization
- `index.html`: single-file React 18 UI (CDN + Babel) for batch paste, conversion, and result management.
- `api/convert.js`: Vercel Serverless endpoint (`GET` metadata, `POST` conversion).
- `config/prompt-profiles.js`: versioned system-prompt profiles and style constraints.
- `config/fewshot-examples.json`: compact, schema-diverse few-shot excerpts derived from `prompts.csv`.
- `lib/llm-client.js` and `lib/response-parser.js`: provider abstraction and SFW/NSFW parsing.
- `scripts/`: utility scripts (`select_fewshot_examples.py`, `benchmark-models.js`).

## Build, Test, and Development Commands
- `vercel dev`: run UI + serverless API locally (primary dev mode).
- `python3 -m http.server 8080`: static-only UI check (no `/api/convert` backend).
- `python3 scripts/select_fewshot_examples.py --max-examples 4`: regenerate compact few-shot set from `prompts.csv`.
- `node scripts/benchmark-models.js --sample-size=8 --profiles=v3-balanced --targets=openai-compat:Qwen/Qwen3-32B`: run adherence/quality benchmark.

## Coding Style & Naming Conventions
- Use 2-space indentation and keep semicolons in JS/TS blocks.
- Naming: `camelCase` for functions/variables, `PascalCase` for React components, `UPPER_SNAKE_CASE` for constants.
- Keep conversion rules server-side in `config/prompt-profiles.js`; do not hardcode long system prompts in `index.html`.
- Keep prompt profile IDs versioned (`v3-*`) when modifying behavior.

## Testing Guidelines
- No automated test suite is currently configured.
- Validate manually with mixed JSON schemas (flat + nested) from `prompts.csv`.
- Confirm parser output includes both SFW/NSFW and obeys profile-specific formatting.
- Use `scripts/benchmark-models.js` before major prompt/profile changes and attach summary deltas in PR.

## Commit & Pull Request Guidelines
- Use Conventional Commit style (e.g., `feat(api): add prompt profile validation`).
- Keep commits scoped to one concern.
- PRs should include: goal, changed files, local test commands, benchmark impact (if prompt logic changed), and UI screenshots for frontend edits.

## Security & Configuration Tips
- Never commit API keys. Configure via env vars only: `ANTHROPIC_API_KEY`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_BASE_URL`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_MAX_TOKENS`, `LLM_TEMPERATURE`.
- Keep provider/model selection server-side; browser should never receive raw secret keys.
