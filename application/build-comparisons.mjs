import { calculateComparisonTraceCost, calculateAgenticAdjustedRange } from '../domain/comparison-pricing.mjs';

export function buildComparisons(models, requests, args, months) {
  const comparisons = [];

  for (const model of models) {
    const providerTrace = calculateComparisonTraceCost(model, requests, { cacheMode: 'provider' });
    const noCacheTrace = calculateComparisonTraceCost(model, requests, { cacheMode: 'none' });
    if (!providerTrace.total || !isFinite(providerTrace.total) || !noCacheTrace.total || !isFinite(noCacheTrace.total)) continue;
    const monthlyTraceCost = providerTrace.total / months;
    const monthlyNoCacheCost = noCacheTrace.total / months;
    const agenticRange = calculateAgenticAdjustedRange(model, providerTrace, args.agenticMultiplier);
    const row = {
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
