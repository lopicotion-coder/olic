export function isUnsettledPaidProviderError(error: unknown): boolean {
  return error instanceof Error &&
    error.message.startsWith("BACKGROUND_AI_SETTLEMENT_UNAVAILABLE_AFTER_PROVIDER_SUCCESS:");
}
