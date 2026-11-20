import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { fetchCurriculumPdf, isPublicAddress } from "./source-url.ts";

const resolver = async (_host: string, record: "A" | "AAAA") =>
  record === "A" ? ["93.184.216.34"] : [];

Deno.test("blocks private and reserved IPv4 ranges", () => {
  assertEquals(isPublicAddress("93.184.216.34"), true);
  assertEquals(isPublicAddress("10.0.0.8"), false);
  assertEquals(isPublicAddress("172.20.1.1"), false);
  assertEquals(isPublicAddress("192.168.1.1"), false);
  assertEquals(isPublicAddress("127.0.0.1"), false);
  assertEquals(isPublicAddress("169.254.169.254"), false);
});

Deno.test("blocks non-global IPv6 ranges", () => {
  assertEquals(isPublicAddress("2606:4700:4700::1111"), true);
  assertEquals(isPublicAddress("::1"), false);
  assertEquals(isPublicAddress("fc00::1"), false);
  assertEquals(isPublicAddress("fe80::1"), false);
  assertEquals(isPublicAddress("2001:db8::1"), false);
});

Deno.test("downloads a PDF in memory", async () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\nactual document bytes");
  const result = await fetchCurriculumPdf("https://example.org/books/math.pdf", {
    resolver,
    fetcher: async () => new Response(pdf, {
      status: 200,
      headers: { "content-type": "application/pdf", "content-length": String(pdf.byteLength) },
    }),
    allowedHosts: ["example.org"],
  });
  assertEquals(result.fileName, "math.pdf");
  assertEquals(result.mimeType, "application/pdf");
  assertEquals(result.bytes.byteLength, pdf.byteLength);
});

Deno.test("blocks a private DNS answer before fetching", async () => {
  let requested = false;
  await assertRejects(
    () => fetchCurriculumPdf("https://example.org/books/math.pdf", {
      resolver: async () => ["10.0.0.2"],
      allowedHosts: ["example.org"],
      fetcher: async () => { requested = true; return new Response("not used"); },
    }),
    Error,
    "SOURCE_URL_DNS_NOT_PUBLIC",
  );
  assertEquals(requested, false);
});

Deno.test("rejects an HTML response", async () => {
  await assertRejects(
    () => fetchCurriculumPdf("https://example.org/books/math.pdf", {
      resolver,
      allowedHosts: ["example.org"],
      fetcher: async () => new Response("<html>login</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    }),
    Error,
    "SOURCE_URL_DID_NOT_RETURN_A_PDF",
  );
});

Deno.test("validates every redirect target", async () => {
  let calls = 0;
  await assertRejects(
    () => fetchCurriculumPdf("https://example.org/books/math.pdf", {
      allowedHosts: ["example.org"],
      resolver: async (host, record) => host === "example.org"
        ? (record === "A" ? ["93.184.216.34"] : [])
        : (record === "A" ? ["127.0.0.1"] : []),
      fetcher: async () => {
        calls += 1;
        return new Response(null, { status: 302, headers: { location: "https://localhost/private.pdf" } });
      },
    }),
    Error,
    "SOURCE_URL_PRIVATE_HOST_BLOCKED",
  );
  assertEquals(calls, 1);
});
