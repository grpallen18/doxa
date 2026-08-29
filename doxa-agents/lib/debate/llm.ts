/**
 * OpenAI-compatible chat JSON helper (Deno Edge + Node scripts).
 * Env: LLM_API_KEY / OPENAI_API_KEY, LLM_BASE_URL, LLM_MODEL / OPENAI_MODEL.
 */

export type LlmConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export function llmConfigFromEnv(
  env: Record<string, string | undefined>
): LlmConfig | null {
  const apiKey = (env.LLM_API_KEY ?? env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return null;
  const baseUrl = (env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = (env.LLM_MODEL ?? env.OPENAI_MODEL ?? "grok-4.6").trim();
  return { apiKey, baseUrl, model };
}

export function llmConfigFromDeno(getEnv: (k: string) => string | undefined): LlmConfig | null {
  return llmConfigFromEnv({
    LLM_API_KEY: getEnv("LLM_API_KEY"),
    OPENAI_API_KEY: getEnv("OPENAI_API_KEY"),
    LLM_BASE_URL: getEnv("LLM_BASE_URL"),
    LLM_MODEL: getEnv("LLM_MODEL"),
    OPENAI_MODEL: getEnv("OPENAI_MODEL"),
  });
}

export type ChatUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type ChatJsonResult<T> = {
  parsed: T;
  raw: string;
  usage: ChatUsage;
  model: string;
};

export async function chatJson<T = Record<string, unknown>>(
  config: LlmConfig,
  system: string,
  user: unknown,
  opts?: { temperature?: number }
): Promise<ChatJsonResult<T>> {
  const resp = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: opts?.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: typeof user === "string" ? user : JSON.stringify(user) },
      ],
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`LLM ${resp.status}: ${err.slice(0, 400)}`);
  }
  const data = (await resp.json()) as {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    parsed = {} as T;
  }
  const usage: ChatUsage = {
    prompt_tokens: Number(data.usage?.prompt_tokens) || 0,
    completion_tokens: Number(data.usage?.completion_tokens) || 0,
    total_tokens: Number(data.usage?.total_tokens) || 0,
  };
  return { parsed, raw, usage, model: data.model ?? config.model };
}

export function estimateCostUsd(usage: ChatUsage): number {
  const inRate = 2 / 1_000_000;
  const outRate = 6 / 1_000_000;
  return usage.prompt_tokens * inRate + usage.completion_tokens * outRate;
}
