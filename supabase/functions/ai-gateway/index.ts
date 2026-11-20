import { hasValidGatewayToken } from "./gateway-auth.ts";

type ProviderName = "openrouter" | "openai" | "gemini" | "xai";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
};

type GatewayRequest = {
  provider?: ProviderName;
  model?: string;
  messages?: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
  metadata?: Record<string, unknown>;
};

const DEFAULTS: Record<ProviderName, string> = {
  openrouter: Deno.env.get("AI_GATEWAY_DEFAULT_MODEL_OPENROUTER") ?? "openai/gpt-4.1-mini",
  openai: Deno.env.get("AI_GATEWAY_DEFAULT_MODEL_OPENAI") ?? "gpt-4.1-mini",
  gemini: Deno.env.get("AI_GATEWAY_DEFAULT_MODEL_GEMINI") ?? "gemini-2.5-flash",
  xai: Deno.env.get("AI_GATEWAY_DEFAULT_MODEL_XAI") ?? "grok-4.7",
};

const GATEWAY_INTERNAL_TOKEN = Deno.env.get("AI_GATEWAY_INTERNAL_TOKEN") ?? "";
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_OUTPUT_TOKENS = Math.max(
  128,
  Math.min(8192, Number(Deno.env.get("AI_GATEWAY_MAX_OUTPUT_TOKENS") ?? "2048") || 2048),
);

function allowedModels(provider: ProviderName): Set<string> {
  const envName = `AI_GATEWAY_ALLOWED_MODELS_${provider.toUpperCase()}`;
  const configured = Deno.env.get(envName) ?? DEFAULTS[provider];
  return new Set(configured.split(",").map((value) => value.trim()).filter(Boolean));
}

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function normalizeProvider(value: unknown): ProviderName | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "openrouter" || v === "openai" || v === "gemini" || v === "xai") return v;
  return null;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    if ("text" in content) return String((content as { text?: unknown }).text ?? "");
    return JSON.stringify(content);
  }
  return String(content ?? "");
}

function extractSystemPrompt(messages: ChatMessage[]): { systemPrompt: string; nonSystem: ChatMessage[] } {
  const systemParts: string[] = [];
  const nonSystem: ChatMessage[] = [];
  for (const msg of messages) {
    if (msg?.role === "system") systemParts.push(textFromContent(msg.content));
    else nonSystem.push(msg);
  }
  return { systemPrompt: systemParts.join("\n\n").trim(), nonSystem };
}

function toOpenAIMessageArray(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((msg) => ({ role: msg.role, content: textFromContent(msg.content) }));
}

function toGeminiContents(messages: ChatMessage[]): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  return messages
    .filter((msg) => msg.role !== "system")
    .map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: textFromContent(msg.content) }],
    }));
}

function openAIHeaders(apiKey: string): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("authorization", `Bearer ${apiKey}`);
  return headers;
}

async function callWithTimeout(url: string, init: RequestInit, ms = 120_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function routeOpenAICompatible(provider: ProviderName, body: GatewayRequest): Promise<Response> {
  const model = body.model?.trim() || DEFAULTS[provider];
  const apiKey =
    provider === "openrouter"
      ? Deno.env.get("OPENROUTER_API_KEY")
      : provider === "openai"
        ? Deno.env.get("OPENAI_API_KEY")
        : Deno.env.get("XAI_API_KEY");

  if (!apiKey) {
    return json({ error: `Missing API key for provider ${provider}` }, { status: 500 });
  }

  const url =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : "https://api.x.ai/v1/chat/completions";

  const messages = toOpenAIMessageArray(body.messages ?? []);
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    top_p: body.top_p,
    stop: body.stop,
    stream: false,
  };
  if (body.metadata && typeof body.metadata === "object") {
    payload.metadata = body.metadata;
  }

  const headers = openAIHeaders(apiKey);
  if (provider === "openrouter") {
    headers.set("HTTP-Referer", Deno.env.get("AI_GATEWAY_HTTP_REFERER") ?? "https://chat.openai.com/");
    headers.set("X-Title", Deno.env.get("AI_GATEWAY_APP_NAME") ?? "My School AI Gateway");
  }

  const upstream = await callWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await upstream.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = text;
  }

  if (!upstream.ok) {
    console.error("AI provider request failed", { provider, status: upstream.status });
    return json(
      { error: `Upstream ${provider} request failed`, status: upstream.status },
      { status: 502 },
    );
  }

  const normalized = raw && typeof raw === "object"
    ? raw as { choices?: unknown; usage?: unknown }
    : {};
  return json({
    provider,
    model,
    choices: Array.isArray(normalized.choices) ? normalized.choices : [],
    usage: normalized.usage ?? null,
    raw,
  });
}

async function routeGemini(body: GatewayRequest): Promise<Response> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "Missing API key for provider gemini" }, { status: 500 });

  const model = body.model?.trim() || DEFAULTS.gemini;
  const { systemPrompt, nonSystem } = extractSystemPrompt(body.messages ?? []);
  const payload: Record<string, unknown> = {
    contents: toGeminiContents(nonSystem),
    generationConfig: {
      temperature: body.temperature,
      maxOutputTokens: body.max_tokens,
      topP: body.top_p,
    },
  };
  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  if (body.stop) payload.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const upstream = await callWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await upstream.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = text;
  }

  if (!upstream.ok) {
    console.error("Gemini provider request failed", { status: upstream.status });
    return json({ error: "Upstream gemini request failed", status: upstream.status }, { status: 502 });
  }

  const geminiResponse = raw as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const responseText =
    geminiResponse.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "")
      .join("") ?? "";

  return json({
    provider: "gemini",
    model,
    choices: [{ index: 0, message: { role: "assistant", content: responseText }, finish_reason: "stop" }],
    usage: {
      prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount,
      completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount,
      total_tokens: geminiResponse.usageMetadata?.totalTokenCount,
    },
    raw,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const url = new URL(req.url);
  if (req.method === "GET") {
    if (url.pathname === "/health" || url.pathname === "/") {
      return json({ ok: true, service: "ai-gateway" });
    }
    return json({ error: "Not found" }, { status: 404 });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (url.pathname !== "/v1/chat/completions") return json({ error: "Not found" }, { status: 404 });

  if (!GATEWAY_INTERNAL_TOKEN) {
    return json({ error: "AI gateway is not configured for internal use" }, { status: 503 });
  }
  if (!(await hasValidGatewayToken(req, GATEWAY_INTERNAL_TOKEN))) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) return json({ error: "Request body too large" }, { status: 413 });

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return json({ error: "Request body too large" }, { status: 413 });
  }

  let body: GatewayRequest;
  try {
    body = JSON.parse(rawBody) as GatewayRequest;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid request body" }, { status: 400 });
  }
  if (body.stream === true) {
    return json({ error: "Streaming is not enabled in ai-gateway v1" }, { status: 400 });
  }

  const provider = normalizeProvider(body.provider);
  if (!provider) return json({ error: "A supported provider is required" }, { status: 400 });

  const model = String(body.model ?? DEFAULTS[provider]).trim();
  if (!model || model.length > 160 || !allowedModels(provider).has(model)) {
    return json({ error: "Requested model is not in the configured allowlist" }, { status: 403 });
  }

  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 40) {
    return json({ error: "messages must contain between 1 and 40 items" }, { status: 400 });
  }

  let totalCharacters = 0;
  const validatedMessages: ChatMessage[] = [];
  for (const message of body.messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return json({ error: "Invalid chat message" }, { status: 400 });
    }
    if (!["system", "user", "assistant"].includes(message.role)) {
      return json({ error: "Unsupported chat message role" }, { status: 400 });
    }
    const content = textFromContent(message.content);
    if (!content || content.length > 48_000) {
      return json({ error: "Chat message content is empty or too large" }, { status: 400 });
    }
    totalCharacters += content.length;
    validatedMessages.push({ role: message.role, content });
  }

  if (totalCharacters > 160_000) return json({ error: "Total prompt content is too large" }, { status: 413 });

  const temperature = body.temperature ?? 0.2;
  const topP = body.top_p ?? 1;
  const maxTokens = body.max_tokens ?? Math.min(1024, MAX_OUTPUT_TOKENS);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return json({ error: "temperature must be between 0 and 2" }, { status: 400 });
  }
  if (!Number.isFinite(topP) || topP <= 0 || topP > 1) {
    return json({ error: "top_p must be greater than 0 and no more than 1" }, { status: 400 });
  }
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_OUTPUT_TOKENS) {
    return json({ error: `max_tokens must be between 1 and ${MAX_OUTPUT_TOKENS}` }, { status: 400 });
  }

  const stop = body.stop;
  if (
    stop !== undefined &&
    !(
      (typeof stop === "string" && stop.length <= 200)
      || (Array.isArray(stop) && stop.length <= 4 && stop.every((item) => typeof item === "string" && item.length <= 200))
    )
  ) {
    return json({ error: "stop must be a string or an array of up to four short strings" }, { status: 400 });
  }

  const normalizedBody: GatewayRequest = {
    provider,
    model,
    messages: validatedMessages,
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    stop,
    stream: false,
  };

  try {
    if (provider === "gemini") return await routeGemini(normalizedBody);
    return await routeOpenAICompatible(provider, normalizedBody);
  } catch (err) {
    console.error("AI gateway execution failed", err);
    return json({ error: "AI gateway execution failed" }, { status: 500 });
  }
});
