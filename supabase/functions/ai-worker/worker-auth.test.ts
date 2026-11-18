import { assertEquals } from "jsr:@std/assert@1";
import { hasValidWorkerToken } from "./worker-auth.ts";

Deno.test("rejects missing internal token", async () => {
  const request = new Request("https://example.test/run", { method: "POST" });
  assertEquals(await hasValidWorkerToken(request, "a".repeat(40)), false);
});

Deno.test("rejects a short configured or supplied token", async () => {
  const request = new Request("https://example.test/run", {
    method: "POST",
    headers: { "x-worker-token": "short" },
  });
  assertEquals(await hasValidWorkerToken(request, "a".repeat(40)), false);
  assertEquals(await hasValidWorkerToken(request, "short"), false);
});

Deno.test("rejects a mismatched token", async () => {
  const request = new Request("https://example.test/run", {
    method: "POST",
    headers: { "x-worker-token": "b".repeat(40) },
  });
  assertEquals(await hasValidWorkerToken(request, "a".repeat(40)), false);
});

Deno.test("accepts the configured internal token", async () => {
  const token = "myschool-test-token-".padEnd(40, "x");
  const request = new Request("https://example.test/run", {
    method: "POST",
    headers: { "x-worker-token": token },
  });
  assertEquals(await hasValidWorkerToken(request, token), true);
});

import { isUnsettledPaidProviderError } from "./background-budget-errors.ts";

Deno.test("terminally detects paid provider calls with unsettled spend", () => {
  assertEquals(
    isUnsettledPaidProviderError(new Error("BACKGROUND_AI_SETTLEMENT_UNAVAILABLE_AFTER_PROVIDER_SUCCESS:op-123")),
    true,
  );
  assertEquals(isUnsettledPaidProviderError(new Error("temporary network error")), false);
  assertEquals(isUnsettledPaidProviderError("BACKGROUND_AI_SETTLEMENT_UNAVAILABLE_AFTER_PROVIDER_SUCCESS:op-123"), false);
  assertEquals(isUnsettledPaidProviderError(null), false);
});
