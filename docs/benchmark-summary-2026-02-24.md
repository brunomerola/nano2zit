# Benchmark Comparison (2026-02-24)

## Overview
- Total paid run cost (including smoke test): **US$ 0.016389**
- Smoke test cost: **US$ 0.000840**
- Main benchmark cost (all report files): **US$ 0.015549**
- Successful calls: **24**
- Failed calls: **12**

## Ranking (Higher score is better)

| Rank | Model | Profile | Avg Score | Parse % | Constraints % | Aspect % | Banned Tags Clean % | Avg Latency (ms) | Avg Cost / Call (USD) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | openai-compat:qwen/qwen-2.5-72b-instruct | v3-rich | 91.33 | 100 | 83.33 | 33.33 | 100 | 11934.83 | 0.000586 |
| 2 | openai-compat:Qwen/Qwen3-32B | v3-rich | 90.67 | 100 | 100 | 33.33 | 100 | 26785.83 | 0.000784 |
| 3 | openai-compat:qwen/qwen-2.5-72b-instruct | v3-balanced | 88 | 100 | 83.33 | 0 | 100 | 10693.67 | 0.000442 |
| 4 | openai-compat:Qwen/Qwen3-32B | v3-balanced | 80.67 | 83.33 | 83.33 | 16.67 | 100 | 25005.67 | 0.000780 |
| 5 | openai-compat:Qwen/Qwen2.5-72B-Instruct | v3-balanced | 0 | 0 | 0 | 0 | 0 | 0 | 0.000000 |
| 6 | openai-compat:Qwen/Qwen2.5-72B-Instruct | v3-rich | 0 | 0 | 0 | 0 | 0 | 0 | 0.000000 |

## Detailed Buckets

### openai-compat:qwen/qwen-2.5-72b-instruct + v3-rich
- Calls: 6 (ok: 6, errors: 0)
- Score: 91.33
- Parse success: 100%
- Constraints rule: 83.33%
- Aspect ratio mention: 33.33%
- Banned-tag cleanliness: 100%
- Avg latency: 11934.83 ms
- Avg words: SFW 167.67, NSFW 181.17
- Cost: total US$ 0.003515 | avg/call US$ 0.000586
- Tokens: input 11568, output 2843

### openai-compat:Qwen/Qwen3-32B + v3-rich
- Calls: 6 (ok: 6, errors: 0)
- Score: 90.67
- Parse success: 100%
- Constraints rule: 100%
- Aspect ratio mention: 33.33%
- Banned-tag cleanliness: 100%
- Avg latency: 26785.83 ms
- Avg words: SFW 170.17, NSFW 176.83
- Cost: total US$ 0.004703 | avg/call US$ 0.000784
- Tokens: input 11575, output 9153

### openai-compat:qwen/qwen-2.5-72b-instruct + v3-balanced
- Calls: 6 (ok: 6, errors: 0)
- Score: 88
- Parse success: 100%
- Constraints rule: 83.33%
- Aspect ratio mention: 0%
- Banned-tag cleanliness: 100%
- Avg latency: 10693.67 ms
- Avg words: SFW 144, NSFW 153.17
- Cost: total US$ 0.002653 | avg/call US$ 0.000442
- Tokens: input 10350, output 2477

### openai-compat:Qwen/Qwen3-32B + v3-balanced
- Calls: 6 (ok: 6, errors: 0)
- Score: 80.67
- Parse success: 83.33%
- Constraints rule: 83.33%
- Aspect ratio mention: 16.67%
- Banned-tag cleanliness: 100%
- Avg latency: 25005.67 ms
- Avg words: SFW 129.67, NSFW 138.17
- Cost: total US$ 0.004678 | avg/call US$ 0.000780
- Tokens: input 10353, output 9093

### openai-compat:Qwen/Qwen2.5-72B-Instruct + v3-balanced
- Calls: 6 (ok: 0, errors: 6)
- Score: 0
- Parse success: 0%
- Constraints rule: 0%
- Aspect ratio mention: 0%
- Banned-tag cleanliness: 0%
- Avg latency: 0 ms
- Avg words: SFW 0, NSFW 0
- Cost: total US$ 0.000000 | avg/call US$ 0.000000
- Tokens: input 0, output 0
- Errors:
  - OpenAI-compatible 400: Qwen/Qwen2.5-72B-Instruct is not a valid model ID

### openai-compat:Qwen/Qwen2.5-72B-Instruct + v3-rich
- Calls: 6 (ok: 0, errors: 6)
- Score: 0
- Parse success: 0%
- Constraints rule: 0%
- Aspect ratio mention: 0%
- Banned-tag cleanliness: 0%
- Avg latency: 0 ms
- Avg words: SFW 0, NSFW 0
- Cost: total US$ 0.000000 | avg/call US$ 0.000000
- Tokens: input 0, output 0
- Errors:
  - OpenAI-compatible 400: Qwen/Qwen2.5-72B-Instruct is not a valid model ID

