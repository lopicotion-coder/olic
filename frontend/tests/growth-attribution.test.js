import test from "node:test";
import assert from "node:assert/strict";
import {
  captureAttributionTouch,
  mergeAttributionState,
  persistAttributionState,
  readAttributionState,
  GROWTH_ATTRIBUTION_STORAGE_KEY,
} from "../src/growth-attribution.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("captures only allow-listed campaign fields and a route key", () => {
  const touch = captureAttributionTouch({
    pageUrl:
      "https://example.test/pricing?utm_source=teacher&utm_medium=video&utm_campaign=november&utm_content=short-1&email=student%40example.com&token=secret#private",
    pageKey: "student/pricing?email=private#secret",
    siteOrigin: "https://example.test",
    capturedAt: "2026-11-20T12:00:00.000Z",
  });

  assert.deepEqual(touch, {
    capturedAt: "2026-11-20T12:00:00.000Z",
    pageKey: "student/pricingemailprivate",
    source: "teacher",
    medium: "video",
    campaign: "november",
    content: "short-1",
    term: null,
    referralCode: null,
    partnerCode: null,
    referrerHostname: null,
    touchType: "non_direct",
  });
  assert.equal(JSON.stringify(touch).includes("secret"), false);
  assert.equal(JSON.stringify(touch).includes("example.test/pricing"), false);
});

test("rejects contact details smuggled into campaign and referral values", () => {
  const touch = captureAttributionTouch({
    pageUrl:
      "https://example.test/?utm_source=person%40example.com&utm_campaign=%2B201001234567&ref=valid-code",
  });

  assert.equal(touch.source, null);
  assert.equal(touch.campaign, null);
  assert.equal(touch.referralCode, "valid-code");
});

test("external referrer hostname is retained without its path, query or fragment", () => {
  const touch = captureAttributionTouch({
    pageUrl: "https://myschool.test/",
    siteOrigin: "https://myschool.test",
    referrer: "https://search.example/results?q=student-name#private",
  });

  assert.equal(touch.referrerHostname, "search.example");
  assert.equal(touch.touchType, "non_direct");
  assert.equal(JSON.stringify(touch).includes("student-name"), false);
  assert.equal(JSON.stringify(touch).includes("/results"), false);
});

test("same-site referrer is treated as direct when no campaign is present", () => {
  const touch = captureAttributionTouch({
    pageUrl: "https://myschool.test/dashboard",
    siteOrigin: "https://myschool.test",
    referrer: "https://myschool.test/login?token=secret",
  });

  assert.equal(touch.referrerHostname, null);
  assert.equal(touch.touchType, "direct");
});

test("first non-direct touch is immutable and direct visits do not overwrite last non-direct", () => {
  const first = captureAttributionTouch({
    pageUrl: "https://myschool.test/?utm_source=teacher&utm_campaign=first",
    capturedAt: "2026-11-01T00:00:00.000Z",
  });
  const later = captureAttributionTouch({
    pageUrl: "https://myschool.test/?utm_source=search&utm_campaign=second",
    capturedAt: "2026-11-10T00:00:00.000Z",
  });
  const direct = captureAttributionTouch({
    pageUrl: "https://myschool.test/dashboard",
    capturedAt: "2026-11-20T00:00:00.000Z",
  });

  const afterFirst = mergeAttributionState(null, first);
  const afterLater = mergeAttributionState(afterFirst, later);
  const afterDirect = mergeAttributionState(afterLater, direct);

  assert.equal(afterDirect.firstTouch.source, "teacher");
  assert.equal(afterDirect.firstTouch.campaign, "first");
  assert.equal(afterDirect.latestNonDirectTouch.source, "search");
  assert.equal(afterDirect.latestNonDirectTouch.campaign, "second");
});

test("does not store attribution without explicit consent", () => {
  const storage = memoryStorage();
  const state = mergeAttributionState(
    null,
    captureAttributionTouch({
      pageUrl: "https://myschool.test/?utm_source=teacher",
    }),
  );

  assert.equal(
    persistAttributionState(storage, state, { consentGranted: false }),
    false,
  );
  assert.equal(storage.values.size, 0);
  assert.equal(
    readAttributionState(storage, { consentGranted: false }),
    null,
  );
});

test("stores and reads attribution only after consent is granted", () => {
  const storage = memoryStorage();
  const state = mergeAttributionState(
    null,
    captureAttributionTouch({
      pageUrl: "https://myschool.test/?utm_source=teacher",
    }),
  );

  assert.equal(
    persistAttributionState(storage, state, { consentGranted: true }),
    true,
  );
  assert.deepEqual(
    readAttributionState(storage, { consentGranted: true }),
    state,
  );
  assert.equal(
    storage.getItem(GROWTH_ATTRIBUTION_STORAGE_KEY) !== null,
    true,
  );
});

test("malformed storage content is ignored", () => {
  const storage = memoryStorage({
    [GROWTH_ATTRIBUTION_STORAGE_KEY]: "{not-json",
  });

  assert.equal(
    readAttributionState(storage, { consentGranted: true }),
    null,
  );
});

test("storage failures are handled without throwing", () => {
  const brokenStorage = {
    setItem() {
      throw new Error("quota exceeded");
    },
    getItem() {
      throw new Error("storage unavailable");
    },
  };

  assert.equal(
    persistAttributionState(
      brokenStorage,
      { version: 1, firstTouch: null, latestNonDirectTouch: null },
      { consentGranted: true },
    ),
    false,
  );
  assert.equal(
    readAttributionState(brokenStorage, { consentGranted: true }),
    null,
  );
});
