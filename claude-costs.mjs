#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { parseArgs, HELP } from './lib/args.mjs';
import { scanSessions } from './lib/scanner.mjs';
import {
  calculateAgenticAdjustedRange,
  calculateClaudeTraceCost,
  calculateComparisonTraceCost,
  getComparisonModels,
  updateComparisonFromOpenRouter,
} from './lib/pricing.mjs';
import { fetchOpenRouterModels } from './lib/openrouter.mjs';
import { setColor, bold, dim, green, red, yellow, formatTokens, formatUSD, formatPerMTok, heading, table } from './lib/format.mjs';

async function main() {
  let args;
  try {
    args = parseArgs();
  } catch (e) {
    console.error(`Error: ${e.message}\n`);
    console.log(HELP);
    process.exit(1);
  }

  if (args.help) {
    console.log(HELP);
    return;
  }

  if (args.noColor) setColor(false);

  let data;
  try {
    data = scanSessions({ from: args.from, to: args.to });
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  if (data.requests.length === 0) {
    console.log('No usage data found for the selected period.');
    return;
  }

  if (args.json) {
    return outputJson(data, args);
  }

  const days = daysBetween(args.from, args.to);
  const months = Math.max(1, days / 30);
  const traceCost = calculateClaudeTraceCost(data.requests);
  const requestStats = calculateRequestStats(data.requests, months);

  console.log(heading('Claude Code Token Usage & Cost Analysis'));
  console.log(`Period:   ${args.from} – ${args.to} (${days} days)`);
  console.log(`Data:     ${data.meta.totalFiles.toLocaleString()} session files (${formatBytes(data.meta.totalBytes)})`);
  console.log(`Requests: ${data.meta.totalEntries.toLocaleString()} deduped (${data.meta.duplicateRequests.toLocaleString()} duplicate file entries ignored)`);
  console.log(`Messages: ${data.meta.messageCount.toLocaleString()}`);
  if (data.meta.conflictRequests > 0) {
    console.log(yellow(`Dedupe:   ${data.meta.conflictRequests.toLocaleString()} duplicate request keys had conflicting token counts; highest-token entry kept.`));
  }

  printTokenUsage(data);
  printClaudeCosts(data, traceCost, months);
  await printComparison(data, args, months, requestStats);
  printSummary(traceCost, args, months);
}

function printTokenUsage(data) {
  console.log(heading('Token Usage by Model'));

  const modelEntries = sortedModelEntries(data.byModel);
  const tokenRows = modelEntries.map(([model, t]) => [
    model,
    formatTokens(t.input),
    formatTokens(t.output),
    formatTokens(t.cacheRead),
    formatTokens(t.cacheCreate5m),
    formatTokens(t.cacheCreate1h),
    formatTokens(t.cacheCreateUnknown),
    formatTokens(totalBucketTokens(t)),
  ]);

  tokenRows.push('separator');
  tokenRows.push([
    bold('TOTAL'),
    formatTokens(data.totals.input),
    formatTokens(data.totals.output),
    formatTokens(data.totals.cacheRead),
    formatTokens(data.totals.cacheCreate5m),
    formatTokens(data.totals.cacheCreate1h),
    formatTokens(data.totals.cacheCreateUnknown),
    formatTokens(totalBucketTokens(data.totals)),
  ]);

  console.log(table(
    ['Model', 'Input', 'Output', 'Cache Read', 'Cache Wr 5m', 'Cache Wr 1h', 'Cache Wr ?', 'Total'],
    tokenRows,
  ));
}

function printClaudeCosts(data, traceCost, months) {
  console.log(heading('Estimated Cost (Anthropic API Pricing)'));

  const costRows = [];
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
    if (Object.keys(traceCost.unknownModels).length > 0) {
      const unknown = Object.entries(traceCost.unknownModels)
        .map(([model, count]) => `${model} (${count})`)
        .join(', ');
      console.log(yellow(`Unknown Claude pricing skipped: ${unknown}`));
    }
  }

  console.log(`\nMonthly average: ${bold(formatUSD(traceCost.grandTotal / months))}/month (over ${months.toFixed(1)} months)`);
}

async function printComparison(data, args, months, requestStats) {
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

  const compModels = getComparisonModels();
  process.stdout.write(dim('Fetching OpenRouter prices... '));
  const orModels = await fetchOpenRouterModels();
  if (orModels) {
    updateComparisonFromOpenRouter(compModels, orModels);
    console.log(dim(`${orModels.length} models loaded.`));
  } else {
    console.log(yellow('offline — using embedded prices.'));
  }

  const { comparisons } = buildComparisons(compModels, data.requests, args, months);
  const display = selectComparisonRows(comparisons, args);

  if (display.length === 0) {
    console.log('\nNo comparison models found.');
  } else {
    const compRows = display.map(m => [
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
  console.log(dim('\nSame-trace means the observed deduped Claude Code request trace priced against that model.'));
  console.log(dim('No-cache bills all cache read/write tokens as normal input. This is a stress case for providers or agents that cannot reproduce Claude Code cache behavior.'));
  if (args.comparison !== 'trace') {
    console.log(dim(`Agentic range applies a configurable ${args.agenticMultiplier.min}x–${args.agenticMultiplier.max}x multiplier for model-dependent loop overhead; it is a scenario, not a bill.`));
  }
  console.log(dim('Models without cache pricing treat cache read/write tokens as regular input.'));
}

function printSummary(traceCost, args, months) {
  console.log('');
  console.log(bold('Summary'));
  console.log(`  Observed Claude API-equivalent trace cost: ${bold(formatUSD(traceCost.grandTotal / months))}/month.`);
  console.log(`  OpenRouter same-trace comparison assumes identical request count and token trace.`);
  if (args.comparison !== 'trace') {
    console.log(`  Agentic-adjusted ranges use ${args.agenticMultiplier.min}x–${args.agenticMultiplier.max}x as an explicit scenario multiplier.`);
  }
}

async function outputJson(data, args) {
  const days = daysBetween(args.from, args.to);
  const months = Math.max(1, days / 30);
  const traceCost = calculateClaudeTraceCost(data.requests);
  const requestStats = calculateRequestStats(data.requests, months);

  const compModels = getComparisonModels();
  const orModels = await fetchOpenRouterModels();
  if (orModels) updateComparisonFromOpenRouter(compModels, orModels);
  const { comparisons } = buildComparisons(compModels, data.requests, args, months);

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
      assumptions: [
        'sameTrace uses provider cache pricing when available',
        'noCache bills all cache read/write tokens as regular input',
        'context/output limits are warnings and do not remove models',
        `agenticRange multiplies sameTrace by ${args.agenticMultiplier.min}x-${args.agenticMultiplier.max}x`,
      ],
    },
  }, null, 2));
}

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

function selectComparisonRows(comparisons, args) {
  const fitting = comparisons.filter(m => budgetStatusText(m, args) === 'fits');
  const overBudget = comparisons.filter(m => budgetStatusText(m, args) !== 'fits').slice(0, 8);
  const anchors = comparisons.filter(isAnchorModel);
  const seen = new Set();
  return [...fitting, ...overBudget, ...anchors].filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

function calculateRequestStats(requests, months) {
  const inputTotals = requests.map(r => r.tokens.input + r.tokens.cacheRead + r.tokens.cacheCreateTotal)
    .sort((a, b) => a - b);
  const totalInput = inputTotals.reduce((sum, n) => sum + n, 0);
  const output = requests.reduce((sum, r) => sum + r.tokens.output, 0);
  const cacheRead = requests.reduce((sum, r) => sum + r.tokens.cacheRead, 0);
  const cacheWrite = requests.reduce((sum, r) => sum + r.tokens.cacheCreateTotal, 0);

  return {
    requestCount: requests.length,
    requestsPerMonth: requests.length / months,
    avgInputPerRequest: requests.length ? totalInput / requests.length : 0,
    avgOutputPerRequest: requests.length ? output / requests.length : 0,
    p50InputPerRequest: percentile(inputTotals, 0.50),
    p95InputPerRequest: percentile(inputTotals, 0.95),
    cacheReadRatio: totalInput ? cacheRead / totalInput : 0,
    cacheWriteRatio: totalInput ? cacheWrite / totalInput : 0,
  };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const index = Math.ceil(values.length * p) - 1;
  return values[Math.max(0, Math.min(index, values.length - 1))];
}

function cacheStatus(model) {
  if (!model.hasCache) return 'none';
  if (!model.hasCacheCreate) return 'partial';
  return 'full';
}

function cacheLabel(model) {
  const status = cacheStatus(model);
  if (status === 'full') return dim('yes');
  if (status === 'partial') return yellow('partial');
  return dim('no');
}

function warningLabel(model) {
  const warnings = [];
  if (model.contextWarningCount > 0) warnings.push(`ctx:${model.contextWarningCount}`);
  if (model.outputWarningCount > 0) warnings.push(`out:${model.outputWarningCount}`);
  if (model.warnings.includes('partial-cache-pricing')) warnings.push('partial-cache');
  return warnings.length ? yellow(warnings.join(',')) : dim('—');
}

function isAnchorModel(model) {
  const text = `${model.id} ${model.name}`.toLowerCase();
  return text.includes('claude-sonnet')
    || text.includes('claude-opus')
    || text.includes('gpt-5.5')
    || text.includes('gpt-5.4')
    || text.includes('gpt-5');
}

function budgetStatus(model, args) {
  const text = budgetStatusText(model, args);
  if (text === 'fits') return green(text);
  if (text === 'maybe') return yellow(text);
  return red(text);
}

function budgetStatusText(model, args) {
  if (args.comparison === 'trace') {
    return model.monthlyTraceCost <= args.budget ? 'fits' : 'over';
  }
  if (model.monthlyAgenticRange.max <= args.budget) return 'fits';
  if (model.monthlyAgenticRange.min <= args.budget) return 'maybe';
  return 'over';
}

function formatCostRange(range) {
  if (Math.abs(range.min - range.max) < 0.000001) return formatUSD(range.min);
  return `${formatUSD(range.min)}-${formatUSD(range.max)}`;
}

function formatPercent(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function sortedModelEntries(byModel) {
  return Object.entries(byModel).sort((a, b) => totalBucketTokens(b[1]) - totalBucketTokens(a[1]));
}

function totalBucketTokens(t) {
  return t.input + t.output + t.cacheRead + (t.cacheCreateTotal ?? t.cacheCreate ?? 0);
}

function daysBetween(a, b) {
  if (!a || !b) return 1;
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
