import type { TokenBucket } from '../contracts/tokens.js';
import type { Request } from '../contracts/request.js';
import type { CostBreakdown, TraceCostResult } from '../contracts/cost.js';
import type { ClaudePricingRates } from '../contracts/pricing-model.js';
import { emptyCost, addCost, addWarning } from '../contracts/cost.js';

export function perM(usd: number): number {
  return usd / 1_000_000;
}

export function claudeRates(inputPerM: number, outputPerM: number): ClaudePricingRates {
  return {
    input: perM(inputPerM),
    output: perM(outputPerM),
    cacheRead: perM(inputPerM * 0.1),
    cacheCreate5m: perM(inputPerM * 1.25),
    cacheCreate1h: perM(inputPerM * 2),
  };
}

export function totalInputTokens(tokens: TokenBucket): number {
  return tokens.input + tokens.cacheRead + tokens.cacheCreateTotal;
}

export function totalTokens(tokens: TokenBucket): number {
  return totalInputTokens(tokens) + tokens.output;
}

function requestTokens(requestOrTokens: Request | TokenBucket): TokenBucket {
  return 'tokens' in requestOrTokens ? requestOrTokens.tokens : requestOrTokens;
}

interface RequestCostResult extends CostBreakdown {
  longContext: boolean;
  warnings: string[];
}

interface EffectiveRates extends ClaudePricingRates {
  isLongContext?: boolean;
}

function getClaudeRates(
  model: string,
  tokens: TokenBucket,
  warnings: string[],
  pricing: Record<string, ClaudePricingRates>,
): EffectiveRates | null {
  const rates = pricing[model];
  if (!rates) return null;

  if (rates.longContext && rates.longContextThreshold && totalInputTokens(tokens) > rates.longContextThreshold) {
    addWarning(warnings, 'long-context-pricing');
    return { ...rates.longContext, isLongContext: true };
  }

  return rates;
}

export function calculateClaudeRequestCost(
  request: { model: string; tokens: TokenBucket },
  pricing: Record<string, ClaudePricingRates>,
): RequestCostResult | null {
  const tokens = requestTokens(request as Request);
  const warnings: string[] = [];
  const rates = getClaudeRates(request.model, tokens, warnings, pricing);
  if (!rates) return null;
  if (tokens.cacheCreateUnknown) addWarning(warnings, 'cache-write-ttl-unknown');

  const input = tokens.input * rates.input;
  const output = tokens.output * rates.output;
  const cacheRead = tokens.cacheRead * rates.cacheRead;
  const cacheCreate5m = tokens.cacheCreate5m * rates.cacheCreate5m;
  const cacheCreate1h = tokens.cacheCreate1h * rates.cacheCreate1h;
  const cacheCreateUnknown = tokens.cacheCreateUnknown * rates.cacheCreate5m;
  const cacheCreate = cacheCreate5m + cacheCreate1h + cacheCreateUnknown;

  return {
    input,
    output,
    cacheRead,
    cacheCreate5m,
    cacheCreate1h,
    cacheCreateUnknown,
    cacheCreate,
    total: input + output + cacheRead + cacheCreate,
    longContext: Boolean(rates.isLongContext),
    warnings,
  };
}

export function calculateClaudeTraceCost(
  requests: Request[],
  pricing: Record<string, ClaudePricingRates>,
): TraceCostResult {
  const costsByModel: Record<string, CostBreakdown> = {};
  const warnings: string[] = [];
  const unknownModels: Record<string, number> = {};
  const total = emptyCost();

  for (const request of requests) {
    const cost = calculateClaudeRequestCost(request, pricing);
    if (!cost) {
      unknownModels[request.model] = (unknownModels[request.model] || 0) + 1;
      continue;
    }
    if (!costsByModel[request.model]) costsByModel[request.model] = emptyCost();
    addCost(costsByModel[request.model]!, cost);
    addCost(total, cost);
    for (const warning of cost.warnings) addWarning(warnings, warning);
  }

  if (Object.keys(unknownModels).length > 0) addWarning(warnings, 'unknown-model-pricing');

  return {
    costsByModel,
    total,
    grandTotal: total.total,
    warnings,
    unknownModels,
  };
}

export function calculateClaudeCost(
  model: string,
  tokens: TokenBucket,
  pricing: Record<string, ClaudePricingRates>,
): RequestCostResult | null {
  const normalized: TokenBucket = {
    input: tokens.input || 0,
    output: tokens.output || 0,
    reasoning: tokens.reasoning || 0,
    cacheRead: tokens.cacheRead || 0,
    cacheCreate5m: tokens.cacheCreate5m || 0,
    cacheCreate1h: tokens.cacheCreate1h || 0,
    cacheCreateUnknown: tokens.cacheCreateUnknown ?? tokens.cacheCreate ?? tokens.cacheCreateTotal ?? 0,
    cacheCreate: tokens.cacheCreate ?? 0,
    cacheCreateTotal: tokens.cacheCreateTotal ?? tokens.cacheCreate ?? 0,
  };
  if (!tokens.cacheCreateTotal && !tokens.cacheCreate) {
    normalized.cacheCreateTotal = normalized.cacheCreate5m + normalized.cacheCreate1h + normalized.cacheCreateUnknown;
  }
  return calculateClaudeRequestCost({ model, tokens: normalized }, pricing);
}
