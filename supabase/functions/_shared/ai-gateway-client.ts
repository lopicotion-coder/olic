export type GatewayProvider = "openrouter" | "openai" | "gemini" | "xai";

export type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GatewayProviderResult = {
  provider: GatewayProvider;
  model: string;
  content: string;
  raw: unknown;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type GatewayPayload = {
  provider?: unknown;
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  } | null;
  raw?: unknown;
};

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function parseAiGatewayResponse(
  expectedProvider: GatewayProvider,
  expectedModel: string,
  payload: unknown,
): GatewayProviderResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("AI_GATEWAY_INVALID_RESPONSE");
  }

  const body = payload as GatewayPayload;
  if (body.provider !== expectedProvider || body.model !== expectedModel) {
    throw new Error("AI_GATEWAY_ROUTE_MISMATCH");
  }

  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("AI_GATEWAY_RESPONSE_HAS_NO_TEXT_CONTENT");
  }

  return {
    provider: expectedProvider,
    model: expectedModel,
    content,
    raw: body.raw ?? payload,
    promptTokens: finiteNonNegative(body.usage?.prompt_tokens),
    completionTokens: finiteNonNegative(body.usage?.completion_tokens),
    totalTokens: finiteNonNegative(body.usage?.total_tokens),
  };
}

export type CallAiGatewayOptions = {
  supabaseUrl: string;
  endpoint?: string;
  serviceRoleKey: string;
  internalToken: string;
  provider: GatewayProvider;
  model: string;
  messages: GatewayMessage[];
  maxOutputTokens: number;
  timeoutMs?: number;
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export async function callAiGateway(
  options: CallAiGatewayOptions,
): Promise<GatewayProviderResult> {
  const supabaseUrl = options.supabaseUrl.trim().replace(/\/+$/, "");
  if (!supabaseUrl || !options.serviceRoleKey) {
    throw new Error("AI_GATEWAY_SUPABASE_SERVICE_CREDENTIALS_MISSING");
  }
  if (options.internalToken.length < 32) {
    throw new Error("AI_GATEWAY_INTERNAL_TOKEN_MISSING_OR_TOO_SHORT");
  }

  const endpoint = options.endpoint?.trim() ||
    `${supabaseUrl}/functions/v1/ai-gateway/v1/chat/completions`;
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error("AI_GATEWAY_URL_INVALID");
  }
  if (parsedEndpoint.protocol !== "https:" && parsedEndpoint.hostname !== "localhost" && parsedEndpoint.hostname !== "127.0.0.1") {
    throw new Error("AI_GATEWAY_URL_MUST_USE_HTTPS");
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort("AI gateway timeout"),
    options.timeoutMs ?? 120_000,
  );
  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(parsedEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: options.serviceRoleKey,
        authorization: `Bearer ${options.serviceRoleKey}`,
        "x-gateway-token": options.internalToken,
      },
      body: JSON.stringify({
        provider: options.provider,
        model: options.model,
        messages: options.messages,
        max_tokens: options.maxOutputTokens,
        temperature: 0.2,
        top_p: 0.95,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`ai-gateway request failed (${response.status})`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("AI_GATEWAY_RESPONSE_IS_NOT_JSON");
    }

    return parseAiGatewayResponse(options.provider, options.model, payload);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ai-gateway request failed (")) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI_GATEWAY_REQUEST_TIMED_OUT");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
