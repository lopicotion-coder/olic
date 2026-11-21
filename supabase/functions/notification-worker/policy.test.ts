import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  isSafeEmailAddress,
  isTransientProviderStatus,
  safeProviderError,
  validateExpoPayload,
  validateResendPayload,
} from "./policy.ts";

Deno.test("email provider payload requires a valid bounded recipient and content", () => {
  assertEquals(validateResendPayload({
    to: "parent@example.com", subject: "Attendance", text: "Student absent",
  }), {
    to: "parent@example.com", subject: "Attendance", text: "Student absent",
  });
  assertEquals(isSafeEmailAddress("parent@example.com"), true);
  assertEquals(isSafeEmailAddress("javascript:alert(1)"), false);
  assertThrows(() => validateResendPayload({ to: "invalid", subject: "A", text: "B" }), Error, "INVALID_EMAIL_RECIPIENT");
  assertThrows(() => validateResendPayload({ to: "a@example.com", subject: "", text: "B" }), Error, "INVALID_EMAIL_SUBJECT");
  assertThrows(() => validateResendPayload({ to: "a@example.com", subject: "A" }), Error, "EMAIL_BODY_REQUIRED");
});

Deno.test("email provider payload rejects oversized body fields", () => {
  assertThrows(() => validateResendPayload({
    to: "a@example.com", subject: "A", text: "x".repeat(200_001),
  }), Error, "EMAIL_BODY_REQUIRED");
});

Deno.test("Expo push payload requires an Expo token and bounded title/body", () => {
  assertEquals(validateExpoPayload({
    to: "ExpoPushToken[abc_123]", title: "New grade", body: "A grade was published",
    data: { route: "grades" },
  }), {
    to: "ExpoPushToken[abc_123]", title: "New grade", body: "A grade was published",
    data: { route: "grades" },
  });
  assertThrows(() => validateExpoPayload({ to: "device-token", title: "A", body: "B" }), Error, "INVALID_EXPO_PUSH_TOKEN");
  assertThrows(() => validateExpoPayload({ to: "ExpoPushToken[a]", title: "", body: "B" }), Error, "INVALID_PUSH_TITLE");
  assertThrows(() => validateExpoPayload({ to: "ExpoPushToken[a]", title: "A", body: "" }), Error, "INVALID_PUSH_BODY");
});

Deno.test("provider retry classification honors common rate limit and transient codes", () => {
  for (const status of [408, 425, 429, 500, 502, 503, 599]) assertEquals(isTransientProviderStatus(status), true);
  for (const status of [200, 201, 400, 401, 403, 404]) assertEquals(isTransientProviderStatus(status), false);
});

Deno.test("provider errors are redacted to safe codes without body or secret leakage", () => {
  assertEquals(safeProviderError("resend", 429), "RESEND_HTTP_429");
  assertEquals(safeProviderError("expo", 503), "EXPO_HTTP_503");
  assertEquals(safeProviderError("unknown", 503), "PROVIDER_DELIVERY_FAILED");
});
