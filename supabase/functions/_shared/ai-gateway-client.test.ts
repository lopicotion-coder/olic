import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  callAiGateway,
  parseAiGatewayResponse,
} from "./ai-gateway-client.ts";

Deno.test("normalizes OpenAI-compatible gateway response and token usage", () => {
  const raw = { id: "provider-response", choices: [{ message: { content: "Hello" } }] };
  const result = parseAiGatewayResponse("openai", "gpt-4.1-mini", {
    provider: "openai",
    model: "gpt-4.1-mini",
    choices: [{ message: { content: "Hello" } }],
    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
    raw,
  });

  assertEquals(result.provider, "openai");
  assertEquals(result.model, "gpt-4.1-mini");
  assertEquals(result.content, "Hello");
  assertEquals(result.promptTokens, 12);
  assertEquals(result.completionTokens, 7);
  assertEquals(result.totalTokens, 19);
  assertEquals(result.raw, raw);
});

Deno.test("normalizes Gemini response through the same gateway contract", () => {
  const result = parseAiGatewayResponse("gemini", "gemini-2.5-flash", {
    provider: "gemini",
    model: "gemini-2.5-flash",
    choices: [{ message: { content: "شرح مبسط" } }],
    usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
    raw: { candidates: [] },
  });

  assertEquals(result.content, "شرح مبسط");
  assertEquals(result.promptTokens, 20);
  assertEquals(result.completionTokens, 30);
});

Deno.test("rejects a provider or model mismatch before billing attribution", () => {
  let error: unknown;
  try {
    parseAiGatewayResponse("openai", "gpt-4.1-mini", {
      provider: "gemini",
      model: "gemini-2.5-flash",
      choices: [{ message: { content: "wrong route" } }],
    });
  } catch (caught) {
    error = caught;
  }
  assertEquals((error as Error).message, "AI_GATEWAY_ROUTE_MISMATCH");
});

Deno.test("calls only the internal Supabase gateway with server credentials", async () => {
  let capturedUrl = "";
  let capturedRequest: Request | null = null;
  const token = "gateway-internal-test-token".padEnd(48, "x");
  const result = await callAiGateway({
    supabaseUrl: "https://example.supabase.co/",
    serviceRoleKey: "server-only-service-role-key",
    internalToken: token,
    provider: "gemini",
    model: "gemini-2.5-flash",
    messages: [{ role: "user", content: "Explain fractions" }],
    maxOutputTokens: 128,
    fetcher: async (input, init) => {
      capturedUrl = String(input);
      capturedRequest = new Request(input, init);
      return new Response(JSON.stringify({
        provider: "gemini",
        model: "gemini-2.5-flash",
        choices: [{ message: { content: "Fractions explained" } }],
        usage: { prompt_tokens: 8, completion_tokens: 16, total_tokens: 24 },
        raw: { candidates: [] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assertEquals(
    capturedUrl,
    "https://example.supabase.co/functions/v1/ai-gateway/v1/chat/completions",
  );
  assertEquals(capturedRequest?.headers.get("x-gateway-token"), token);
  assertEquals(capturedRequest?.headers.get("authorization"), "Bearer server-only-service-role-key");
  assertEquals(result.content, "Fractions explained");
});

Deno.test("does not expose provider response bodies when gateway fails", async () => {
  await assertRejects(
    () => callAiGateway({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "server-only-service-role-key",
      internalToken: "gateway-internal-test-token".padEnd(48, "x"),
      provider: "openai",
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "test" }],
      maxOutputTokens: 16,
      fetcher: async () => new Response("private provider error body", { status: 502 }),
    }),
    Error,
    "ai-gateway request failed (502)",
  );
});
