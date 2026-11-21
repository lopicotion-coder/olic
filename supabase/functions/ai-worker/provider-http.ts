export function assertProviderSuccess(
  provider: string,
  response: Pick<Response, "ok" | "status">,
): void {
  if (!response.ok) throw new Error(provider + " request failed (" + response.status + ")");
}
