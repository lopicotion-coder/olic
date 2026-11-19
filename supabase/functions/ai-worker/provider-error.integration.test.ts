import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { assertProviderSuccess } from "./provider-http.ts";

Deno.test("a real OpenAI request with an invalid test key returns a provider auth error", async () => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer invalid-ci-only-token-never-a-real-secret",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "CI auth failure probe" }],
      max_tokens: 1,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  try {
    assertEquals(response.status, 401);
    await assertRejects(
      async () => assertProviderSuccess("openai", response),
      Error,
      "openai request failed (401)",
    );
  } finally {
    await response.body?.cancel();
  }
});

Deno.test("provider failures expose status only, not provider response bodies", () => {
  const response = new Response(JSON.stringify({
    error: { message: "secret-like provider details must not escape" },
  }), { status: 429 });

  try {
    assertProviderSuccess("openai", response);
  } catch (error) {
    assertEquals((error as Error).message, "openai request failed (429)");
    assertEquals((error as Error).message.includes("secret-like"), false);
  }
});
