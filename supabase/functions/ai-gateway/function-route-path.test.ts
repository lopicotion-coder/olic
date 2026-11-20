import { assertEquals } from "jsr:@std/assert@1";
import { functionRoutePath } from "./function-route-path.ts";

Deno.test("accepts local Edge Function subroutes", () => {
  assertEquals(functionRoutePath("/v1/chat/completions", "ai-gateway"), "/v1/chat/completions");
  assertEquals(functionRoutePath("/v1/embeddings", "ai-gateway"), "/v1/embeddings");
});

Deno.test("strips the hosted Supabase Edge Function prefix", () => {
  assertEquals(
    functionRoutePath("/functions/v1/ai-gateway/v1/chat/completions", "ai-gateway"),
    "/v1/chat/completions",
  );
  assertEquals(
    functionRoutePath("/functions/v1/ai-gateway/v1/embeddings", "ai-gateway"),
    "/v1/embeddings",
  );
});

Deno.test("does not match a similarly named function route", () => {
  assertEquals(
    functionRoutePath("/functions/v1/ai-gateway-evil/v1/embeddings", "ai-gateway"),
    "/__invalid__",
  );
});
