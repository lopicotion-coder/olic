import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { estimateInputTokens, estimateOutputTokens, estimateUsdCost } from "./budget-math.ts";

Deno.test("input estimate includes conservative allowance for Arabic prompts", () => {
  const estimate = estimateInputTokens([
    { role: "system", content: "اشرح الدرس بشكل مبسط" },
    { role: "user", content: "ما الفرق بين التبخر والتكاثف؟" },
  ]);
  assertEquals(estimate > 128, true);
});

Deno.test("USD cost is calculated per million tokens and rounded up", () => {
  const amount = estimateUsdCost(1_000_000, 500_000, {
    inputPricePerMillion: 1,
    outputPricePerMillion: 2,
  });
  assertEquals(amount, 2);
});

Deno.test("rejects unpriced routes rather than assuming zero cost", () => {
  assertThrows(() => estimateUsdCost(100, 100, {
    inputPricePerMillion: 0,
    outputPricePerMillion: 1,
  }), Error);
});

Deno.test("rejects invalid token counts", () => {
  assertThrows(() => estimateUsdCost(-1, 20, {
    inputPricePerMillion: 1,
    outputPricePerMillion: 1,
  }), Error);
});

Deno.test("output token fallback safely estimates non-empty provider output", () => {
  assertEquals(estimateOutputTokens("123456"), 4);
  assertEquals(estimateOutputTokens(""), 0);
});
