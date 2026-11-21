export async function hasValidGatewayToken(
  request: Request,
  expectedToken: string,
): Promise<boolean> {
  const suppliedToken = request.headers.get("x-gateway-token") ?? "";
  if (expectedToken.length < 32 || suppliedToken.length < 32) return false;

  const encoder = new TextEncoder();
  const [expectedDigest, suppliedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expectedToken)),
    crypto.subtle.digest("SHA-256", encoder.encode(suppliedToken)),
  ]);

  const expectedBytes = new Uint8Array(expectedDigest);
  const suppliedBytes = new Uint8Array(suppliedDigest);
  let mismatch = expectedToken.length ^ suppliedToken.length;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    mismatch |= expectedBytes[index] ^ suppliedBytes[index];
  }
  return mismatch === 0;
}
