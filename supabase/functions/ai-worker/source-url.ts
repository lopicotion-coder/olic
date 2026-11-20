const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 60_000;

export type PublicPdfDownload = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: "application/pdf";
  finalUrl: string;
};

type DnsResolver = (hostname: string, recordType: "A" | "AAAA") => Promise<string[]>;
type DownloadOptions = {
  maxBytes?: number;
  fetcher?: typeof fetch;
  resolver?: DnsResolver;
  allowedHosts?: string[];
};

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0];
  if (value.includes(".") || !value.includes(":")) return false;
  const first = Number.parseInt(value.split(":")[0] || "0", 16);
  if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return false;
  if (value.startsWith("2001:db8:") || value.startsWith("2001:0:")) return false;
  return true;
}

export function isPublicAddress(address: string): boolean {
  return address.includes(":") ? isPublicIpv6(address) : isPublicIpv4(address);
}

function hostIsAllowed(hostname: string, allowedHosts: string[]): boolean {
  if (allowedHosts.length === 0) return true;
  const host = hostname.toLowerCase();
  return allowedHosts.some((entry) => host === entry || host.endsWith("." + entry));
}

async function defaultResolve(hostname: string, recordType: "A" | "AAAA"): Promise<string[]> {
  return await Deno.resolveDns(hostname, recordType);
}

async function validatePublicHttpsUrl(value: string, resolver: DnsResolver, allowedHosts: string[]): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SOURCE_URL_INVALID");
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      (url.port !== "" && url.port !== "443") || !url.hostname ||
      url.hostname.endsWith(".") || url.hostname.length > 253) {
    throw new Error("SOURCE_URL_MUST_BE_PUBLIC_HTTPS");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal") ||
      hostname.endsWith(".test") || hostname.endsWith(".invalid") ||
      !hostname.includes(".")) {
    throw new Error("SOURCE_URL_PRIVATE_HOST_BLOCKED");
  }
  if (!hostIsAllowed(hostname, allowedHosts)) throw new Error("SOURCE_URL_HOST_NOT_ALLOWLISTED");
  if (/^[0-9.]+$/.test(hostname) || hostname.includes(":")) {
    throw new Error("SOURCE_URL_IP_LITERAL_BLOCKED");
  }

  const results = await Promise.allSettled([
    resolver(hostname, "A"),
    resolver(hostname, "AAAA"),
  ]);
  const addresses = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
    throw new Error("SOURCE_URL_DNS_NOT_PUBLIC");
  }
  return url;
}

function fileNameFromUrl(url: URL): string {
  const segment = url.pathname.split("/").filter(Boolean).pop() ?? "curriculum.pdf";
  try {
    const decoded = decodeURIComponent(segment).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
    return decoded.toLowerCase().endsWith(".pdf") ? decoded.slice(0, 180) : "curriculum.pdf";
  } catch {
    return "curriculum.pdf";
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > maxBytes) throw new Error("SOURCE_FILE_TOO_LARGE");
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("SOURCE_FILE_TOO_LARGE");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("SOURCE_FILE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function fetchCurriculumPdf(sourceUrl: string, options: DownloadOptions = {}): Promise<PublicPdfDownload> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 100 * 1024 * 1024) {
    throw new Error("INVALID_SOURCE_DOWNLOAD_LIMIT");
  }
  const fetcher = options.fetcher ?? fetch;
  const resolver = options.resolver ?? defaultResolve;
  const allowedHosts = (options.allowedHosts ?? (Deno.env.get("CURRICULUM_SOURCE_ALLOWED_HOSTS") ?? "").split(","))
    .map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (allowedHosts.length === 0) {
    throw new Error("SOURCE_HOST_ALLOWLIST_REQUIRED: configure trusted PDF domains in CURRICULUM_SOURCE_ALLOWED_HOSTS");
  }

  let currentUrl = sourceUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const validatedUrl = await validatePublicHttpsUrl(currentUrl, resolver, allowedHosts);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetcher(validatedUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "application/pdf,application/octet-stream;q=0.8" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirect === MAX_REDIRECTS) throw new Error("SOURCE_REDIRECT_LIMIT");
        currentUrl = new URL(location, validatedUrl).toString();
        continue;
      }
      if (!response.ok) throw new Error("SOURCE_DOWNLOAD_HTTP_" + response.status);
      const bytes = await readBoundedBody(response, maxBytes);
      if (bytes.byteLength < 8 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
        throw new Error("SOURCE_URL_DID_NOT_RETURN_A_PDF");
      }
      return {
        bytes,
        fileName: fileNameFromUrl(validatedUrl),
        mimeType: "application/pdf",
        finalUrl: validatedUrl.toString(),
      };
    } catch (error) {
      if (controller.signal.aborted) throw new Error("SOURCE_DOWNLOAD_TIMEOUT");
      if (error instanceof Error && /^(SOURCE_|INVALID_)/.test(error.message)) throw error;
      throw new Error("SOURCE_DOWNLOAD_FAILED:" + (error instanceof Error ? error.message : "network error"));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("SOURCE_REDIRECT_LIMIT");
}
