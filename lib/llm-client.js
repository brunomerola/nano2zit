function pickEnv(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

async function callAnthropic({ apiKey, model, maxTokens, temperature, systemPrompt, userPrompt }) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!resp.ok) {
    const error = data?.error?.message || data?.error || text.slice(0, 400);
    throw new Error(`Anthropic ${resp.status}: ${error}`);
  }

  const output = Array.isArray(data?.content)
    ? data.content.map((chunk) => chunk?.text || "").join("")
    : "";

  return {
    text: output,
    provider: "anthropic",
    model,
    usage: data?.usage || null,
    raw: data,
  };
}

async function callOpenAICompat({ baseUrl, apiKey, model, maxTokens, temperature, systemPrompt, userPrompt }) {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!resp.ok) {
    const error = data?.error?.message || data?.error || text.slice(0, 400);
    throw new Error(`OpenAI-compatible ${resp.status}: ${error}`);
  }

  const output = data?.choices?.[0]?.message?.content || "";

  return {
    text: output,
    provider: "openai-compat",
    model,
    usage: data?.usage || null,
    raw: data,
  };
}

function getRuntimeModelConfig() {
  const provider = pickEnv("LLM_PROVIDER", "anthropic").toLowerCase();
  const model = pickEnv("LLM_MODEL", provider === "anthropic" ? "claude-sonnet-4-5-20250929" : "Qwen/Qwen3-32B");
  const maxTokens = Number.parseInt(pickEnv("LLM_MAX_TOKENS", "4096"), 10);
  const temperature = Number.parseFloat(pickEnv("LLM_TEMPERATURE", "0.2"));

  return {
    provider,
    model,
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : 4096,
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    openaiCompatBaseUrl: pickEnv("OPENAI_COMPAT_BASE_URL", "https://openrouter.ai/api/v1"),
  };
}

function buildRuntimeConfig(runtimeOverride = {}) {
  const base = getRuntimeModelConfig();
  const provider = runtimeOverride.provider || base.provider;
  const model = runtimeOverride.model || base.model;
  const maxTokens = runtimeOverride.maxTokens ?? base.maxTokens;
  const temperature = runtimeOverride.temperature ?? base.temperature;
  const openaiCompatBaseUrl = runtimeOverride.openaiCompatBaseUrl || base.openaiCompatBaseUrl;
  return { provider, model, maxTokens, temperature, openaiCompatBaseUrl };
}

async function generateCompletion({ systemPrompt, userPrompt, runtime = {} }) {
  const cfg = buildRuntimeConfig(runtime);

  if (cfg.provider === "anthropic") {
    const apiKey = runtime.anthropicApiKey || pickEnv("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }
    return callAnthropic({
      apiKey,
      model: cfg.model,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
      systemPrompt,
      userPrompt,
    });
  }

  if (cfg.provider === "openai-compat") {
    const apiKey = runtime.openaiCompatApiKey || pickEnv("OPENAI_COMPAT_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_COMPAT_API_KEY not configured");
    }
    return callOpenAICompat({
      baseUrl: cfg.openaiCompatBaseUrl,
      apiKey,
      model: cfg.model,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
      systemPrompt,
      userPrompt,
    });
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${cfg.provider}`);
}

module.exports = {
  buildRuntimeConfig,
  generateCompletion,
  getRuntimeModelConfig,
};
