const STORAGE_KEY = "myschool:growth-attribution:v1";
const MAX_VALUE_LENGTH = 100;
const CAMPAIGN_KEYS = [
  ["utm_source", "source"],
  ["utm_medium", "medium"],
  ["utm_campaign", "campaign"],
  ["utm_content", "content"],
  ["utm_term", "term"],
];

function sanitizeValue(value, maxLength = MAX_VALUE_LENGTH) {
  if (typeof value !== "string") return null;

  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

  if (!normalized) return null;

  // Campaign metadata must never become a place to smuggle contact details.
  const looksLikeEmail = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(normalized);
  const looksLikePhone = /(?:^|\D)\+?\d[\d\s().-]{7,}\d(?:$|\D)/.test(normalized);
  if (looksLikeEmail || looksLikePhone) return null;

  return normalized;
}

function sanitizePageKey(pageKey) {
  if (typeof pageKey !== "string") return null;
  const value = pageKey
    .normalize("NFKC")
    .split(/[?#]/, 1)[0]
    .trim()
    .replace(/[^\p{L}\p{N}._/-]/gu, "")
    .slice(0, 80);
  return value || null;
}

function parseUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

function safeTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/**
 * Build a minimal attribution touch from an incoming URL.
 *
 * The full URL, query string, fragment, IP address, device fingerprint,
 * user-agent and personal/academic information are never returned.
 * This function does not persist or transmit anything.
 */
export function captureAttributionTouch({
  pageUrl,
  pageKey = null,
  referrer = null,
  siteOrigin = null,
  capturedAt = new Date(),
} = {}) {
  const page = parseUrl(pageUrl, "https://myschool.invalid");
  if (!page) return null;

  const campaign = {};
  for (const [queryKey, property] of CAMPAIGN_KEYS) {
    campaign[property] = sanitizeValue(page.searchParams.get(queryKey));
  }

  const referralCode = sanitizeValue(
    page.searchParams.get("ref") ?? page.searchParams.get("referral_code"),
    64,
  );
  const partnerCode = sanitizeValue(page.searchParams.get("partner_code"), 64);

  const referrerUrl = parseUrl(referrer);
  const site = parseUrl(siteOrigin);
  const referrerHostname =
    referrerUrl &&
    (!site || referrerUrl.hostname !== site.hostname)
      ? sanitizeValue(referrerUrl.hostname, 120)
      : null;

  const hasCampaign = Object.values(campaign).some(Boolean);
  const hasReferral = Boolean(referralCode || partnerCode);
  const isDirect = !hasCampaign && !hasReferral && !referrerHostname;

  return Object.freeze({
    capturedAt: safeTimestamp(capturedAt),
    pageKey: sanitizePageKey(pageKey),
    ...campaign,
    referralCode,
    partnerCode,
    referrerHostname,
    touchType: isDirect ? "direct" : "non_direct",
  });
}

function isTouch(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.capturedAt === "string" &&
      (value.touchType === "direct" || value.touchType === "non_direct"),
  );
}

/**
 * Keep the first eligible non-direct touch immutable. Direct visits never
 * erase or replace the last eligible non-direct touch.
 */
export function mergeAttributionState(existingState, incomingTouch) {
  const current =
    existingState && existingState.version === 1
      ? existingState
      : { version: 1, firstTouch: null, latestNonDirectTouch: null };

  if (!isTouch(incomingTouch) || incomingTouch.touchType === "direct") {
    return {
      version: 1,
      firstTouch: isTouch(current.firstTouch) ? current.firstTouch : null,
      latestNonDirectTouch: isTouch(current.latestNonDirectTouch)
        ? current.latestNonDirectTouch
        : null,
    };
  }

  const firstTouch = isTouch(current.firstTouch)
    ? current.firstTouch
    : incomingTouch;

  return {
    version: 1,
    firstTouch,
    latestNonDirectTouch: incomingTouch,
  };
}

/**
 * Persist only after explicit, affirmative consent. Storage is injected so
 * this module remains testable and does not depend on browser globals.
 */
export function persistAttributionState(
  storage,
  state,
  { consentGranted = false, storageKey = STORAGE_KEY } = {},
) {
  if (!consentGranted || !storage || typeof storage.setItem !== "function") {
    return false;
  }

  if (!state || state.version !== 1) return false;

  try {
    storage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function readAttributionState(
  storage,
  { consentGranted = false, storageKey = STORAGE_KEY } = {},
) {
  if (!consentGranted || !storage || typeof storage.getItem !== "function") {
    return null;
  }

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      parsed.version !== 1 ||
      !(parsed.firstTouch === null || isTouch(parsed.firstTouch)) ||
      !(parsed.latestNonDirectTouch === null || isTouch(parsed.latestNonDirectTouch))
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export { STORAGE_KEY as GROWTH_ATTRIBUTION_STORAGE_KEY };
