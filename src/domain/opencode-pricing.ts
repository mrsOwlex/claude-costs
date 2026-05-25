import type { TokenBucket } from '../contracts/tokens.js';
import type { Request } from '../contracts/request.js';
import type { CostBreakdown, TraceCostResult } from '../contracts/cost.js';
import { emptyCost, addCost, addWarning } from '../contracts/cost.js';

export interface OpencodePricingRates {
  input: number;
  output: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export function calculateOpencodeRequestCost(
  request: { model: string; tokens: TokenBucket },
  pricing: Record<string, OpencodePricingRates>,
): CostBreakdown | null {
  const rates = pricing[request.model];
  if (!rates) return null;

  const t = request.tokens;
  const input = t.input * rates.input;
  const output = t.output * rates.output;
  const reasoning = rates.reasoning ? t.reasoning * rates.reasoning : t.reasoning * rates.output;
  const cacheRead = rates.cacheRead ? t.cacheRead * rates.cacheRead : t.cacheRead * rates.input;
  const cacheWrite = rates.cacheWrite ? t.cacheCreateTotal * rates.cacheWrite : t.cacheCreateTotal * rates.input;
  const total = input + output + reasoning + cacheRead + cacheWrite;

  return {
    input,
    output: output + reasoning,
    cacheRead,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheCreateUnknown: cacheWrite,
    cacheCreate: cacheWrite,
    total,
  };
}

export function calculateOpencodeTraceCost(
  requests: Request[],
  pricing: Record<string, OpencodePricingRates>,
): TraceCostResult {
  const costsByModel: Record<string, CostBreakdown> = {};
  const warnings: string[] = [];
  const unknownModels: Record<string, number> = {};
  const total = emptyCost();

  for (const request of requests) {
    const cost = calculateOpencodeRequestCost(request, pricing);
    if (!cost) {
      unknownModels[request.model] = (unknownModels[request.model] || 0) + 1;
      continue;
    }
    if (!costsByModel[request.model]) costsByModel[request.model] = emptyCost();
    addCost(costsByModel[request.model]!, cost);
    addCost(total, cost);
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
