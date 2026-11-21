export type DeliveryChannel = "email" | "push";

export type DeliveryPayload = {
  to?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  title?: unknown;
  body?: unknown;
  data?: unknown;
};

export function isSafeEmailAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateResendPayload(payload: DeliveryPayload): {
  to: string;
  subject: string;
  text?: string;
  html?: string;
} {
  if (!isSafeEmailAddress(payload.to)) throw new Error("INVALID_EMAIL_RECIPIENT");
  if (typeof payload.subject !== "string" || !payload.subject.trim() || payload.subject.length > 180) {
    throw new Error("INVALID_EMAIL_SUBJECT");
  }
  const text = typeof payload.text === "string" && payload.text.length <= 200_000
    ? payload.text
    : undefined;
  const html = typeof payload.html === "string" && payload.html.length <= 200_000
    ? payload.html
    : undefined;
  if (!text && !html) throw new Error("EMAIL_BODY_REQUIRED");
  return { to: payload.to, subject: payload.subject.trim(), ...(text ? { text } : {}), ...(html ? { html } : {}) };
}

export function validateExpoPayload(payload: DeliveryPayload): {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
} {
  if (typeof payload.to !== "string" || !/^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(payload.to)) {
    throw new Error("INVALID_EXPO_PUSH_TOKEN");
  }
  if (typeof payload.title !== "string" || !payload.title.trim() || payload.title.length > 120) {
    throw new Error("INVALID_PUSH_TITLE");
  }
  if (typeof payload.body !== "string" || !payload.body.trim() || payload.body.length > 1000) {
    throw new Error("INVALID_PUSH_BODY");
  }
  if (payload.data !== undefined &&
      (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data))) {
    throw new Error("INVALID_PUSH_DATA");
  }
  return {
    to: payload.to,
    title: payload.title.trim(),
    body: payload.body,
    ...(payload.data ? { data: payload.data as Record<string, unknown> } : {}),
  };
}

export function isTransientProviderStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function safeProviderError(provider: string, status: number): string {
  const allowed = provider === "resend" || provider === "expo";
  if (!allowed || !Number.isInteger(status) || status < 100 || status > 599) {
    return "PROVIDER_DELIVERY_FAILED";
  }
  return `${provider.toUpperCase()}_HTTP_${status}`;
}
