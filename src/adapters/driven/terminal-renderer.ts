import type { ScanResult } from '../../contracts/scan-result.js';
import type { TraceCostResult } from '../../contracts/cost.js';
import type { TokenBucket } from '../../contracts/tokens.js';
import type { CLIArgs } from '../driving/cli.js';
import type { ComparisonRow } from '../../application/build-comparisons.js';
import type { RequestStats } from '../../domain/stats.js';
import { bold, dim, green, red, yellow, formatTokens, formatUSD, formatPerMTok, heading, table, formatPercent, formatCostRange } from './format.js';

const WARNING_DESCRIPTIONS: Record<string, string> = {
  'unknown-model-pricing': 'one or more observed local models have no known Claude API price and are excluded from the Claude total',
  'cache-write-ttl-unknown': 'cache write tokens did not include a 5m/1h TTL split and were priced as 5m cache writes',
  'long-context-pricing': 'at least one request exceeded the long-context threshold and used long-context rates',
  'context-limit-exceeded': 'observed request input plus output exceeds the comparison model context window',
  'output-limit-exceeded': 'observed request output exceeds the comparison model max output limit',
  'partial-cache-pricing': 'provider exposes cache-read pricing but no cache-write price; cache writes are billed as regular input',
  'cache-disabled-scenario': 'no-cache scenario ignores provider cache prices and bills all cache tokens as regular input',
};

function sortedModelEntries(byModel: Record<string, TokenBucket>): [string, TokenBucket][] {
  return Object.entries(byModel).sort((a, b) => totalBucketTokens(b[1]) - totalBucketTokens(a[1]));
}

function totalBucketTokens(t: TokenBucket): number {
  return t.input + t.output + t.reasoning + t.cacheRead + (t.cacheCreateTotal ?? t.cacheCreate ?? 0);
}

function cacheStatus(model: ComparisonRow): string {
  if (!model.hasCache) return 'none';
  if (!model.hasCacheCreate) return 'partial';
  return 'full';
}

function cacheLabel(model: ComparisonRow): string {
  const status = cacheStatus(model);
  if (status === 'full') return dim('yes');
  if (status === 'partial') return yellow('partial');
  return dim('no');
}

function warningLabel(model: ComparisonRow): string {
  const warnings: string[] = [];
  if (model.contextWarningCount > 0) warnings.push(`ctx:${model.contextWarningCount}`);
  if (model.outputWarningCount > 0) warnings.push(`out:${model.outputWarningCount}`);
  if (model.warnings.includes('partial-cache-pricing')) warnings.push('partial-cache');
  return warnings.length ? yellow(warnings.join(',')) : dim('—');
}

function budgetStatus(model: ComparisonRow, args: CLIArgs): string {
  const text = budgetStatusText(model, args);
  if (text === 'fits') return green(text);
  if (text === 'maybe') return yellow(text);
  return red(text);
}

export function budgetStatusText(model: ComparisonRow, args: CLIArgs): string {
  if (args.comparison === 'trace') {
    return model.monthlyTraceCost <= args.budget ? 'fits' : 'over';
  }
  if (model.monthlyAgenticRange.max <= args.budget) return 'fits';
  if (model.monthlyAgenticRange.min <= args.budget) return 'maybe';
  return 'over';
}

function printWarningDetails(warnings: string[]): void {
  const uniqueWarnings = [...new Set(warnings)];
  for (const warning of uniqueWarnings) {
    console.log(dim(`  ${warning}: ${WARNING_DESCRIPTIONS[warning] || 'no description available'}`));
  }
}

function printComparisonWarningLegend(comparisons: ComparisonRow[]): void {
  const hasContext = comparisons.some(m => m.contextWarningCount > 0);
  const hasOutput = comparisons.some(m => m.outputWarningCount > 0);
  const hasPartialCache = comparisons.some(m => m.warnings.includes('partial-cache-pricing'));
  if (!hasContext && !hasOutput && !hasPartialCache) return;

  console.log(dim('\nWarn legend:'));
  if (hasContext) console.log(dim(`  ctx:N = ${WARNING_DESCRIPTIONS['context-limit-exceeded']}; N is the affected request count`));
  if (hasOutput) console.log(dim(`  out:N = ${WARNING_DESCRIPTIONS['output-limit-exceeded']}; N is the affected request count`));
  if (hasPartialCache) console.log(dim(`  partial-cache = ${WARNING_DESCRIPTIONS['partial-cache-pricing']}`));
}

function isAnchorModel(model: ComparisonRow): boolean {
  const text = `${model.id} ${model.name}`.toLowerCase();
  return text.includes('claude-sonnet')
    || text.includes('claude-opus')
    || text.includes('gpt-5.5')
    || text.includes('gpt-5.4')
    || text.includes('gpt-5');
}

export function selectComparisonRows(comparisons: ComparisonRow[], args: CLIArgs): ComparisonRow[] {
  const fitting = comparisons.filter(m => budgetStatusText(m, args) === 'fits');
  const overBudget = comparisons.filter(m => budgetStatusText(m, args) !== 'fits').slice(0, 8);
  const anchors = comparisons.filter(isAnchorModel);
  const seen = new Set<string>();
  return [...fitting, ...overBudget, ...anchors].filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export function printTokenUsage(data: ScanResult): void {
  console.log(heading('Token Usage by Model'));

  const hasReasoning = data.totals.reasoning > 0;
  const modelEntries = sortedModelEntries(data.byModel);
  const tokenRows: (string[] | 'separator')[] = modelEntries.map(([model, t]) => {
    const row = [
      model,
      formatTokens(t.input),
      formatTokens(t.output),
    ];
    if (hasReasoning) row.push(formatTokens(t.reasoning));
    row.push(
      formatTokens(t.cacheRead),
      formatTokens(t.cacheCreate5m),
      formatTokens(t.cacheCreate1h),
      formatTokens(t.cacheCreateUnknown),
      formatTokens(totalBucketTokens(t)),
    );
    return row;
  });

  tokenRows.push('separator');
  const totalRow = [
    bold('TOTAL'),
    formatTokens(data.totals.input),
    formatTokens(data.totals.output),
  ];
  if (hasReasoning) totalRow.push(formatTokens(data.totals.reasoning));
  totalRow.push(
    formatTokens(data.totals.cacheRead),
    formatTokens(data.totals.cacheCreate5m),
    formatTokens(data.totals.cacheCreate1h),
    formatTokens(data.totals.cacheCreateUnknown),
    formatTokens(totalBucketTokens(data.totals)),
  );
  tokenRows.push(totalRow);

  const headers = ['Model', 'Input', 'Output'];
  if (hasReasoning) headers.push('Reasoning');
  headers.push('Cache Read', 'Cache Wr 5m', 'Cache Wr 1h', 'Cache Wr ?', 'Total');

  console.log(table(headers, tokenRows));
}

export function printClaudeCosts(data: ScanResult, traceCost: TraceCostResult, months: number): void {
  console.log(heading('Estimated Cost (API Pricing)'));

  const costRows: (string[] | 'separator')[] = [];
  for (const [model] of sortedModelEntries(data.byModel)) {
    const cost = traceCost.costsByModel[model];
    if (!cost) {
      costRows.push([model, dim('—'), dim('—'), dim('—'), dim('—'), dim('—'), dim('—'), dim('pricing unknown')]);
      continue;
    }
    costRows.push([
      model,
      formatUSD(cost.input),
      formatUSD(cost.output),
      formatUSD(cost.cacheRead),
      formatUSD(cost.cacheCreate5m),
      formatUSD(cost.cacheCreate1h),
      formatUSD(cost.cacheCreateUnknown),
      bold(formatUSD(cost.total)),
    ]);
  }

  costRows.push('separator');
  costRows.push([
    bold('TOTAL'),
    '',
    '',
    '',
    '',
    '',
    '',
    bold(formatUSD(traceCost.grandTotal)),
  ]);

  console.log(table(
    ['Model', 'Input $', 'Output $', 'Cache Rd $', 'Wr 5m $', 'Wr 1h $', 'Wr ? $', 'Total $'],
    costRows,
  ));

  if (traceCost.warnings.length > 0) {
    console.log(yellow(`Warnings: ${traceCost.warnings.join(', ')}`));
    printWarningDetails(traceCost.warnings);
    if (Object.keys(traceCost.unknownModels).length > 0) {
      const unknown = Object.entries(traceCost.unknownModels)
        .map(([model, count]) => `${model} (${count})`)
        .join(', ');
      console.log(yellow(`Unknown Claude pricing skipped: ${unknown}`));
    }
  }

  console.log(`\nMonthly average: ${bold(formatUSD(traceCost.grandTotal / months))}/month (over ${months.toFixed(1)} months)`);
}

export function printComparison(
  comparisons: ComparisonRow[],
  args: CLIArgs,
  months: number,
  requestStats: RequestStats,
  data: ScanResult,
): void {
  console.log(heading(`Model Comparison (Budget: $${args.budget}/month)`));
  console.log(dim(`Trace volume/month: ~${formatTokens(data.totals.input / months)} uncached input, ~${formatTokens(data.totals.output / months)} output, ~${formatTokens(data.totals.cacheRead / months)} cache read, ~${formatTokens(data.totals.cacheCreateTotal / months)} cache write`));

  console.log(table(
    ['Requests/mo', 'Avg input/req', 'Avg output/req', 'p50 input', 'p95 input', 'Cache read', 'Cache write'],
    [[
      requestStats.requestsPerMonth.toFixed(0),
      formatTokens(Math.round(requestStats.avgInputPerRequest)),
      formatTokens(Math.round(requestStats.avgOutputPerRequest)),
      formatTokens(requestStats.p50InputPerRequest),
      formatTokens(requestStats.p95InputPerRequest),
      formatPercent(requestStats.cacheReadRatio),
      formatPercent(requestStats.cacheWriteRatio),
    ]],
  ));

  const display = selectComparisonRows(comparisons, args);

  if (display.length === 0) {
    console.log('\nNo comparison models found.');
  } else {
    const compRows: string[][] = display.map(m => [
      m.name,
      formatPerMTok(m.input),
      formatPerMTok(m.output),
      cacheLabel(m),
      args.comparison === 'agentic' ? dim('—') : bold(formatUSD(m.monthlyTraceCost) + '/mo'),
      bold(formatUSD(m.monthlyNoCacheCost) + '/mo'),
      args.comparison === 'trace' ? dim('—') : bold(formatCostRange(m.monthlyAgenticRange) + '/mo'),
      warningLabel(m),
      budgetStatus(m, args),
    ]);

    console.log('\n' + table(
      ['Model', 'In $/MTok', 'Out $/MTok', 'Cache', 'Same-trace', 'No-cache', 'Agentic range', 'Warn', 'Budget'],
      compRows,
      { align: ['left', 'right', 'right', 'center', 'right', 'right', 'right', 'left', 'center'] },
    ));
  }

  const limitWarningCount = comparisons.filter(m => m.contextWarningCount > 0 || m.outputWarningCount > 0).length;
  if (limitWarningCount > 0) {
    console.log(yellow(`${limitWarningCount} models exceed context/output limits for at least one observed request; they remain listed with ctx/out warnings.`));
  }
  const partialCacheCount = comparisons.filter(m => m.warnings.includes('partial-cache-pricing')).length;
  if (partialCacheCount > 0) {
    console.log(yellow(`${partialCacheCount} comparison models expose cache reads but not cache writes; cache writes were priced as regular input.`));
  }
  printComparisonWarningLegend(comparisons);
  console.log(dim('\nSame-trace means the observed deduped Claude Code request trace priced against that model.'));
  console.log(dim('No-cache bills all cache read/write tokens as normal input. This is a stress case for providers or agents that cannot reproduce Claude Code cache behavior.'));
  if (args.comparison !== 'trace') {
    console.log(dim(`Agentic range applies a configurable ${args.agenticMultiplier.min}x–${args.agenticMultiplier.max}x multiplier for model-dependent loop overhead; it is a scenario, not a bill.`));
  }
  console.log(dim('Models without cache pricing treat cache read/write tokens as regular input.'));
}

export function printSummary(traceCost: TraceCostResult, args: CLIArgs, months: number): void {
  console.log('');
  console.log(bold('Summary'));
  console.log(`  Observed API-equivalent trace cost: ${bold(formatUSD(traceCost.grandTotal / months))}/month.`);
  console.log(`  OpenRouter same-trace comparison assumes identical request count and token trace.`);
  if (args.comparison !== 'trace') {
    console.log(`  Agentic-adjusted ranges use ${args.agenticMultiplier.min}x–${args.agenticMultiplier.max}x as an explicit scenario multiplier.`);
  }
}

export { WARNING_DESCRIPTIONS, cacheStatus };
