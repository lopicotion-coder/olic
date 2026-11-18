export type BudgetMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type TokenPrices = {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
};

export function estimateInputTokens(messages: BudgetMessage[]): number {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("At least one prompt message is required");
  }
  let characters = 0;
  for (const message of messages) {
    if (!message || typeof message.content !== "string" || message.content.length === 0) {
      throw new Error("Every prompt message must contain text");
    }
    characters += message.content.length;
  }
  // Conservative allowance for Arabic tokenization and provider-side formatting.
  return Math.max(1, Math.ceil(characters / 1.5) + 128);
}

export function estimateUsdCost(
  inputTokens: number,
  outputTokens: number,
  prices: TokenPrices,
): number {
  if (!Number.isInteger(inputTokens) || inputTokens < 0 ||
      !Number.isInteger(outputTokens) || outputTokens < 0) {
    throw new Error("Token counts must be non-negative integers");
  }
  if (!Number.isFinite(prices.inputPricePerMillion) || prices.inputPricePerMillion <= 0 ||
      !Number.isFinite(prices.outputPricePerMillion) || prices.outputPricePerMillion <= 0) {
    throw new Error("Explicit positive USD prices are required");
  }
  const amount = (
    inputTokens * prices.inputPricePerMillion +
    outputTokens * prices.outputPricePerMillion
  ) / 1_000_000;
  return Math.ceil(amount * 100_000_000) / 100_000_000;
}
