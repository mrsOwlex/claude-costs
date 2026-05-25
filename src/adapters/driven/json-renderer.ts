import type { ScanResult } from '../../contracts/scan-result.js';
import type { TraceCostResult } from '../../contracts/cost.js';
import type { CLIArgs } from '../driving/cli.js';
import type { ComparisonRow } from '../../application/build-comparisons.js';
import type { RequestStats } from '../../domain/stats.js';
import { budgetStatusText, cacheStatus, WARNING_DESCRIPTIONS } from './terminal-renderer.js';

export function outputJson(
  data: ScanResult,
  args: CLIArgs,
  traceCost: TraceCostResult,
  requestStats: RequestStats,
  comparisons: ComparisonRow[],
  months: number,
  days: number,
): void {
  console.log(JSON.stringify({
    period: { from: args.from, to: args.to, days },
    meta: data.meta,
    requests: data.requests,
    requestStats,
    tokensByModel: data.byModel,
    tokensByDate: data.byDate,
    totals: data.totals,
    costsByModel: traceCost.costsByModel,
    grandTotal: traceCost.grandTotal,
    monthlyAverage: traceCost.grandTotal / months,
    warningDescriptions: WARNING_DESCRIPTIONS,
    budget: args.budget,
    comparison: {
      mode: args.comparison,
      models: comparisons.map(m => ({
        id: m.id,
        name: m.name,
        monthlyTraceCost: m.monthlyTraceCost,
        monthlyNoCacheCost: m.monthlyNoCacheCost,
        monthlyAgenticMin: m.monthlyAgenticRange.min,
        monthlyAgenticMax: m.monthlyAgenticRange.max,
        hasCache: m.hasCache,
        hasCacheCreate: m.hasCacheCreate,
        cacheStatus: cacheStatus(m),
        contextLength: m.contextLength,
        maxOutputTokens: m.maxOutputTokens,
        impossibleRequests: m.impossibleRequests,
        contextWarningCount: m.contextWarningCount,
        outputWarningCount: m.outputWarningCount,
        warnings: m.warnings,
        budgetStatus: budgetStatusText(m, args),
      })),
      sameTrace: comparisons.map(m => ({
        id: m.id,
        name: m.name,
        monthlyCost: m.monthlyTraceCost,
        monthlyNoCacheCost: m.monthlyNoCacheCost,
        hasCache: m.hasCache,
        hasCacheCreate: m.hasCacheCreate,
        cacheStatus: cacheStatus(m),
        warnings: m.warnings,
        fitsInBudget: m.monthlyTraceCost <= args.budget,
      })),
      agenticRange: comparisons.map(m => ({
        id: m.id,
        name: m.name,
        monthlyMin: m.monthlyAgenticRange.min,
        monthlyMax: m.monthlyAgenticRange.max,
        minMultiplier: m.agenticRange.minMultiplier,
        maxMultiplier: m.agenticRange.maxMultiplier,
        budgetStatus: budgetStatusText(m, args),
      })),
      skippedImpossible: [],
      warningDescriptions: WARNING_DESCRIPTIONS,
      assumptions: [
        'sameTrace uses provider cache pricing when available',
        'noCache bills all cache read/write tokens as regular input',
        'context/output limits are warnings and do not remove models',
        `agenticRange multiplies sameTrace by ${args.agenticMultiplier.min}x-${args.agenticMultiplier.max}x`,
      ],
    },
  }, null, 2));
}
