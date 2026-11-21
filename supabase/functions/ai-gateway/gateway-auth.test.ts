import { assertEquals } from "jsr:@std/assert@1";
import { hasValidGatewayToken } from "./gateway-auth.ts";

Deno.test("rejects a missing gateway token", async () => {
  const request = new Request("https://example.test/v1/chat/completions", { method: "POST" });
  assertEquals(await hasValidGatewayToken(request, "x".repeat(40)), false);
});

Deno.test("rejects short and mismatched tokens", async () => {
  const shortRequest = new Request("https://example.test/v1/chat/completions", {
    method: "POST",
    headers: { "x-gateway-token": "short" },
  });
  assertEquals(await hasValidGatewayToken(shortRequest, "x".repeat(40)), false);
  assertEquals(await hasValidGatewayToken(shortRequest, "short"), false);

  const mismatchedRequest = new Request("https://example.test/v1/chat/completions", {
    method: "POST",
    headers: { "x-gateway-token": "y".repeat(40) },
  });
  assertEquals(await hasValidGatewayToken(mismatchedRequest, "x".repeat(40)), false);
});

Deno.test("accepts only the configured server-to-server token", async () => {
  const token = "myschool-gateway-test-token".padEnd(48, "x");
  const request = new Request("https://example.test/v1/chat/completions", {
    method: "POST",
    headers: { "x-gateway-token": token },
  });
  assertEquals(await hasValidGatewayToken(request, token), true);
});
