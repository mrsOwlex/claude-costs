import type { ComparisonModel } from '../contracts/pricing-model.js';
import type { Request } from '../contracts/request.js';
import type { CLIArgs } from '../adapters/driving/cli.js';
import {
  calculateComparisonTraceCost,
  calculateAgenticAdjustedRange,
  type ComparisonTraceCostResult,
  type AgenticRange,
} from '../domain/comparison-pricing.js';

export interface ComparisonRow extends ComparisonModel {
  trace: ComparisonTraceCostResult;
  noCacheTrace: ComparisonTraceCostResult;
  agenticRange: AgenticRange;
  monthlyTraceCost: number;
  monthlyNoCacheCost: number;
  monthlyAgenticRange: { min: number; max: number };
  hasCache: boolean;
  hasCacheCreate: boolean;
  warnings: string[];
  noCacheWarnings: string[];
  impossibleRequests: number;
  contextWarningCount: number;
  outputWarningCount: number;
}

export function buildComparisons(
  models: ComparisonModel[],
  requests: Request[],
  args: CLIArgs,
  months: number,
): { comparisons: ComparisonRow[] } {
  const comparisons: ComparisonRow[] = [];

  for (const model of models) {
    const providerTrace = calculateComparisonTraceCost(model, requests, { cacheMode: 'provider' });
    const noCacheTrace = calculateComparisonTraceCost(model, requests, { cacheMode: 'none' });
    if (!providerTrace.total || !isFinite(providerTrace.total) || !noCacheTrace.total || !isFinite(noCacheTrace.total)) continue;
    const monthlyTraceCost = providerTrace.total / months;
    const monthlyNoCacheCost = noCacheTrace.total / months;
    const agenticRange = calculateAgenticAdjustedRange(model, providerTrace, args.agenticMultiplier);
    const row: ComparisonRow = {
      ...model,
      trace: providerTrace,
      noCacheTrace,
      agenticRange,
      monthlyTraceCost,
      monthlyNoCacheCost,
      monthlyAgenticRange: {
        min: agenticRange.min / months,
        max: agenticRange.max / months,
      },
      hasCache: providerTrace.hasCache,
      hasCacheCreate: providerTrace.hasCacheCreate,
      warnings: providerTrace.warnings,
      noCacheWarnings: noCacheTrace.warnings,
      impossibleRequests: providerTrace.impossibleRequests,
      contextWarningCount: providerTrace.contextWarningCount,
      outputWarningCount: providerTrace.outputWarningCount,
    };

    comparisons.push(row);
  }

  comparisons.sort((a, b) => a.monthlyTraceCost - b.monthlyTraceCost);
  return { comparisons };
}
