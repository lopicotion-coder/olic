type ProviderName = "openrouter" | "openai" | "gemini" | "xai";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
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

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "authorization, content-type, x-request-id");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
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
    return json(
      {
        error: `Upstream ${provider} request failed`,
        status: upstream.status,
        details: raw,
      },
      { status: 502 },
    );
  }

  return json({ provider, model, raw });
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
    return json({ error: "Upstream gemini request failed", status: upstream.status, details: raw }, { status: 502 });
  }

  const responseText =
    (raw as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      .candidates?.[0]?.content?.parts?.map((p) => p.text ?? "")
      .join("") ?? "";

  return json({
    provider: "gemini",
    model,
    choices: [{ index: 0, message: { role: "assistant", content: responseText }, finish_reason: "stop" }],
    raw,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true }, { status: 204 });
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.pathname === "/health" || url.pathname === "/") {
      return json({ ok: true, service: "ai-gateway", providers: ["openrouter", "openai", "gemini", "xai"] });
    }
    return json({ error: "Not found" }, { status: 404 });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const url = new URL(req.url);
  if (!(url.pathname === "/" || url.pathname === "/v1/chat/completions")) {
    return json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as GatewayRequest | null;
  if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
  if (body.stream) {
    return json({ error: "Streaming is not enabled in ai-gateway v1" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "`messages` must be a non-empty array" }, { status: 400 });
  }

  const provider = normalizeProvider(body.provider) ?? "openrouter";

  try {
    if (provider === "gemini") return await routeGemini(body);
    return await routeOpenAICompatible(provider, body);
  } catch (err) {
    return json(
      {
        error: "AI gateway execution failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
});
