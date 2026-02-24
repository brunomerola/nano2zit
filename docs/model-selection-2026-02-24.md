# Open-Source Model Selection (2026-02-24)

## Task profile
`nano2zit` is a JSON-to-freeform conversion task with strict instruction adherence, stable formatting, and strong natural-English generation. Input schema varies heavily across `prompts.csv` (81 rows, 6+ families), so instruction-following is more important than pure raw creativity.

## Candidates reviewed

| Model | Strengths | Risks | Pricing signal |
|---|---|---|---|
| `Qwen/Qwen3-32B` | Best balance of quality + adherence + context (131k); official Qwen3 card is strong for instruction tasks | Official safety alignment can still refuse some NSFW cases | OpenRouter: ~$0.08/M input, ~$0.30/M output |
| `Qwen/Qwen3-30B-A3B` | Similar quality tier with strong throughput and low cost | Slightly less deterministic than 32B in strict formatting | OpenRouter: ~$0.08/M input, ~$0.28/M output |
| `Qwen/Qwen2.5-72B-Instruct` | Highest consistency among official Qwen instruct families | Higher latency/cost; smaller context on some hosted routes | OpenRouter: ~$0.18/M input and output |
| `Qwen/Qwen3-14B` | Cheaper and fast for bulk conversion | More formatting drift in harder schema variants | OpenRouter: ~$0.05/M input, ~$0.22/M output |
| `grimjim/qwen3-32b-uncensored` / `mlabonne/Qwen3-32B-abliterated` | Minimal refusal behavior | Lower reliability for strict formatting; abliterated branch explicitly marked as rough/PoC | Mostly self-host path (vLLM/TGI), no stable managed pricing |

## Cost/volume estimate for this repo
Using current `v3-balanced` prompt budget (~2.35k input tokens + ~0.75k output tokens per conversion), estimated per 50 prompts:
- Qwen3-32B: ~`$0.02`
- Qwen3-30B-A3B: ~`$0.02`
- Qwen2.5-72B-Instruct: ~`$0.028`

## Recommendation
1. Primary model: `Qwen/Qwen3-32B` (open-source official instruct) for best quality/cost and adherence.
2. Fallback path for refusal-heavy NSFW batches: self-host `qwen3-32b-uncensored` behind `openai-compat` and use only when the primary model refuses.
3. Keep `Qwen2.5-72B-Instruct` as QA/reference model for periodic benchmark runs, not as default.

## Sources
- Qwen3-32B model card: https://huggingface.co/Qwen/Qwen3-32B
- Qwen2.5-72B-Instruct card: https://huggingface.co/Qwen/Qwen2.5-72B-Instruct
- OpenRouter pricing/activity: https://openrouter.ai/qwen/qwen3-32b/activity, https://openrouter.ai/qwen/qwen3-30b-a3b/activity, https://openrouter.ai/qwen/qwen2.5-72b-instruct/activity, https://openrouter.ai/qwen/qwen3-14b/activity
- Groq pricing/rate limits: https://console.groq.com/docs/models, https://console.groq.com/docs/rate-limits
- Uncensored variants: https://huggingface.co/grimjim/qwen3-32b-uncensored, https://huggingface.co/mlabonne/Qwen3-32B-abliterated
