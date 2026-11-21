import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  isTransientProviderStatus,
  safeProviderError,
  validateExpoPayload,
  validateResendPayload,
} from "./policy.ts";

type Delivery = {
  id: string;
  tenant_id: string;
  school_id: string;
  recipient_user_id: string;
  channel: "email" | "push";
  provider_key: "resend" | "expo";
  status: string;
  attempts: number;
  max_attempts: number;
  idempotency_key: string;
  payload: Record<string, unknown>;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WORKER_TOKEN = Deno.env.get("NOTIFICATION_WORKER_INTERNAL_TOKEN") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";
const MAX_BODY_BYTES = 8 * 1024;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function constantTimeMatch(candidate: string, expected: string): Promise<boolean> {
  if (expected.length < 32 || candidate.length < 32) return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(leftHash);
  const right = new Uint8Array(rightHash);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function asProviderPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_DELIVERY_PAYLOAD");
  return value as Record<string, unknown>;
}

async function providerRequest(url: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function deliverResend(delivery: Delivery): Promise<string | null> {
  if (!RESEND_API_KEY || !RESEND_FROM) throw new Error("RESEND_PROVIDER_NOT_CONFIGURED");
  let payload: ReturnType<typeof validateResendPayload>;
  try {
    payload = validateResendPayload(asProviderPayload(delivery.payload));
  } catch (error) {
    throw Object.assign(new Error((error as Error).message), { httpStatus: 400, permanent: true });
  }
  const response = await providerRequest("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": delivery.idempotency_key,
    },
    body: JSON.stringify({ from: RESEND_FROM, ...payload }),
  });
  if (!response.ok) throw Object.assign(new Error(safeProviderError("resend", response.status)), {
    httpStatus: response.status,
    permanent: !isTransientProviderStatus(response.status),
  });
  const data = await response.json().catch(() => ({}));
  return typeof data?.id === "string" ? data.id : null;
}

async function deliverExpo(delivery: Delivery): Promise<string | null> {
  if (!EXPO_ACCESS_TOKEN) throw new Error("EXPO_PROVIDER_NOT_CONFIGURED");
  let payload: ReturnType<typeof validateExpoPayload>;
  try {
    payload = validateExpoPayload(asProviderPayload(delivery.payload));
  } catch (error) {
    throw Object.assign(new Error((error as Error).message), { httpStatus: 400, permanent: true });
  }
  const response = await providerRequest("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${EXPO_ACCESS_TOKEN}`,
      "content-type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw Object.assign(new Error(safeProviderError("expo", response.status)), {
    httpStatus: response.status,
    permanent: !isTransientProviderStatus(response.status),
  });
  const data = await response.json().catch(() => ({}));
  const ticket = Array.isArray(data?.data) ? data.data[0] : data?.data;
  if (ticket?.status === "error") {
    const code = typeof ticket.details?.error === "string" ? ticket.details.error : "EXPO_TICKET_REJECTED";
    throw Object.assign(new Error(code), { httpStatus: response.status, permanent: true });
  }
  return typeof ticket?.id === "string" ? ticket.id : null;
}

async function deliver(delivery: Delivery): Promise<string | null> {
  if (delivery.channel === "email" && delivery.provider_key === "resend") return await deliverResend(delivery);
  if (delivery.channel === "push" && delivery.provider_key === "expo") return await deliverExpo(delivery);
  throw Object.assign(new Error("UNSUPPORTED_NOTIFICATION_PROVIDER"), { permanent: true });
}

Deno.serve(async (request: Request) => {
  if (request.method === "GET") return json({ ok: true, service: "notification-worker", ready: false });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (WORKER_TOKEN.length < 32) return json({ error: "NOTIFICATION_WORKER_NOT_CONFIGURED" }, 503);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "SUPABASE_WORKER_NOT_CONFIGURED" }, 503);

  const supplied = request.headers.get("x-myschool-notification-worker-token") ?? "";
  if (!(await constantTimeMatch(supplied, WORKER_TOKEN))) return json({ error: "NOT_FOUND" }, 404);

  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_BODY_BYTES) return json({ error: "REQUEST_TOO_LARGE" }, 413);
  let body: Record<string, unknown>;
  try {
    body = asProviderPayload(JSON.parse(new TextDecoder().decode(raw)));
  } catch {
    return json({ error: "INVALID_JSON_BODY" }, 400);
  }
  const requestedBatch = Number(body.batch_size ?? 20);
  if (!Number.isInteger(requestedBatch) || requestedBatch < 1 || requestedBatch > 50) {
    return json({ error: "INVALID_BATCH_SIZE" }, 400);
  }
  const enabledProviders = [
    ...(RESEND_API_KEY && RESEND_FROM ? ["resend"] : []),
    ...(EXPO_ACCESS_TOKEN ? ["expo"] : []),
  ];
  if (!enabledProviders.length) {
    return json({ error: "NO_NOTIFICATION_PROVIDER_CONFIGURED" }, 503);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const workerId = crypto.randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc("claim_notification_deliveries", {
    p_worker_id: workerId,
    p_batch_size: requestedBatch,
    p_lease_seconds: 180,
    p_provider_keys: enabledProviders,
  });
  if (claimError) {
    console.error("Notification delivery claim failed", { code: claimError.code ?? "UNKNOWN" });
    return json({ error: "QUEUE_CLAIM_FAILED" }, 503);
  }

  const deliveries = (claimed ?? []) as Delivery[];
  let sent = 0;
  let failed = 0;
  let leaseLost = 0;

  for (const delivery of deliveries) {
    try {
      const providerMessageId = await deliver(delivery);
      const { data: settled, error } = await admin.rpc("complete_notification_delivery", {
        p_delivery_id: delivery.id,
        p_worker_id: workerId,
        p_provider_message_id: providerMessageId,
      });
      if (error) throw new Error("DELIVERY_SETTLEMENT_FAILED");
      if (settled === "lease_lost") leaseLost++;
      else sent++;
    } catch (error) {
      const details = error as Error & { httpStatus?: number; permanent?: boolean };
      const errorCode = details.message?.slice(0, 160) || "PROVIDER_DELIVERY_FAILED";
      const { data: settled, error: settleError } = await admin.rpc("fail_notification_delivery", {
        p_delivery_id: delivery.id,
        p_worker_id: workerId,
        p_error_code: errorCode,
        p_http_status: details.httpStatus ?? null,
        p_permanent: details.permanent ?? false,
      });
      if (settleError) {
        console.error("Notification delivery settlement failed", { deliveryId: delivery.id, code: settleError.code ?? "UNKNOWN" });
        leaseLost++;
      } else {
        failed++;
        if (settled === "dead_letter") console.warn("Notification moved to dead letter", { deliveryId: delivery.id });
      }
    }
  }

  return json({ ok: true, claimed: deliveries.length, sent, failed, lease_lost: leaseLost });
});
