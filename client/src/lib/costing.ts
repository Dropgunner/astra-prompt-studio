/**
 * Astra Prompt Studio cost model: publishes pricing assumptions in the UI and
 * keeps all estimates deterministic, editable, and separate from API billing.
 * Rates verified against OpenAI documentation on 2026-09-06.
 */
export type ServiceTier = "standard" | "batch_flex" | "fast";

export const ASTRA_PRICING = {
  model: "gpt-6-astra",
  effectiveDate: "2026-09-06",
  sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-astra",
  perMillion: {
    input: 10,
    cachedInput: 1,
    cacheWrite: 12.5,
    output: 50,
  },
  longContextThreshold: 272_000,
  longContextMultipliers: {
    input: 2,
    output: 1.5,
  },
  tierMultipliers: {
    standard: 1,
    batch_flex: 0.5,
    fast: 2,
  } satisfies Record<ServiceTier, number>,
} as const;

export interface CostEstimateInput {
  inputTokens: number;
  expectedOutputTokens: number;
  cacheReadShare: number;
  cacheWriteTokens?: number;
  serviceTier: ServiceTier;
}

export interface CostEstimate {
  uncachedInputTokens: number;
  cachedInputTokens: number;
  inputCost: number;
  outputCost: number;
  cacheWriteCost: number;
  totalCost: number;
  firstRunCost: number;
  longContext: boolean;
  tierMultiplier: number;
  longContextNote: string | null;
}

export function estimateAstraCost({ inputTokens, expectedOutputTokens, cacheReadShare, cacheWriteTokens = 0, serviceTier }: CostEstimateInput): CostEstimate {
  const safeInputTokens = Math.max(0, Math.round(inputTokens));
  const safeOutputTokens = Math.max(0, Math.round(expectedOutputTokens));
  const safeCacheReadShare = Math.max(0, Math.min(1, cacheReadShare));
  const longContext = safeInputTokens > ASTRA_PRICING.longContextThreshold;
  const tierMultiplier = ASTRA_PRICING.tierMultipliers[serviceTier];
  const inputMultiplier = (longContext ? ASTRA_PRICING.longContextMultipliers.input : 1) * tierMultiplier;
  const outputMultiplier = (longContext ? ASTRA_PRICING.longContextMultipliers.output : 1) * tierMultiplier;
  const cachedInputTokens = Math.round(safeInputTokens * safeCacheReadShare);
  const uncachedInputTokens = safeInputTokens - cachedInputTokens;
  const safeCacheWriteTokens = Math.max(0, Math.round(cacheWriteTokens));
  const inputCost =
    ((uncachedInputTokens * ASTRA_PRICING.perMillion.input + cachedInputTokens * ASTRA_PRICING.perMillion.cachedInput) / 1_000_000) *
    inputMultiplier;
  const outputCost = (safeOutputTokens * ASTRA_PRICING.perMillion.output / 1_000_000) * outputMultiplier;
  const cacheWriteCost = (safeCacheWriteTokens * ASTRA_PRICING.perMillion.cacheWrite / 1_000_000) * inputMultiplier;

  return {
    uncachedInputTokens,
    cachedInputTokens,
    inputCost,
    outputCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost,
    firstRunCost: inputCost + outputCost + cacheWriteCost,
    longContext,
    tierMultiplier,
    longContextNote: longContext
      ? "This input exceeds 272K tokens. OpenAI applies long-context multipliers to the full request."
      : null,
  };
}

export function formatUsd(value: number, maximumFractionDigits = 4) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits,
  }).format(value);
}
