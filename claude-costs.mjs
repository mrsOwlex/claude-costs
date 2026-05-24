#!/usr/bin/env node

import { parseArgs, HELP } from './lib/args.mjs';
import { scanSessions } from './lib/scanner.mjs';
import { calculateClaudeCost, calculateComparisonCost, getComparisonModels, updateComparisonFromOpenRouter } from './lib/pricing.mjs';
import { fetchOpenRouterModels } from './lib/openrouter.mjs';
import { setColor, bold, dim, green, red, yellow, cyan, formatTokens, formatUSD, formatPerMTok, heading, table } from './lib/format.mjs';

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

  // --- Scan JSONL files ---
  let data;
  try {
    data = scanSessions({ from: args.from, to: args.to });
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  if (Object.keys(data.byModel).length === 0) {
    console.log('No usage data found for the selected period.');
    return;
  }

  // --- JSON output ---
  if (args.json) {
    return outputJson(data, args);
  }

  // --- Section 1: Overview ---
  const periodLabel = args.from
    ? `${args.from} – ${args.to}`
    : `${data.meta.minDate} – ${data.meta.maxDate} (all time)`;

  const days = args.from
    ? daysBetween(args.from, args.to)
    : daysBetween(data.meta.minDate, data.meta.maxDate);

  console.log(heading('Claude Code Token Usage & Cost Analysis'));
  console.log(`Period:   ${periodLabel} (${days} days)`);
  console.log(`Data:     ${data.meta.totalFiles.toLocaleString()} session files (${formatBytes(data.meta.totalBytes)})`);
  console.log(`Messages: ${data.meta.messageCount.toLocaleString()}`);

  // --- Section 2: Token Usage by Model ---
  console.log(heading('Token Usage by Model'));

  const modelEntries = Object.entries(data.byModel)
    .sort((a, b) => totalTokens(b[1]) - totalTokens(a[1]));

  const tokenRows = modelEntries.map(([model, t]) => [
    model,
    formatTokens(t.input),
    formatTokens(t.output),
    formatTokens(t.cacheRead),
    formatTokens(t.cacheCreate),
    formatTokens(totalTokens(t)),
  ]);

  tokenRows.push('separator');
  tokenRows.push([
    bold('TOTAL'),
    formatTokens(data.totals.input),
    formatTokens(data.totals.output),
    formatTokens(data.totals.cacheRead),
    formatTokens(data.totals.cacheCreate),
    formatTokens(totalTokens(data.totals)),
  ]);

  console.log(table(
    ['Model', 'Input', 'Output', 'Cache Read', 'Cache Write', 'Total'],
    tokenRows,
  ));

  // --- Section 3: Cost Breakdown ---
  console.log(heading('Estimated Cost (Anthropic API Pricing)'));

  let grandTotal = 0;
  const costRows = [];
  const modelCosts = {};

  for (const [model, tokens] of modelEntries) {
    const cost = calculateClaudeCost(model, tokens);
    if (!cost) {
      costRows.push([model, dim('—'), dim('—'), dim('—'), dim('—'), dim('pricing unknown')]);
      continue;
    }
    modelCosts[model] = cost;
    grandTotal += cost.total;
    costRows.push([
      model,
      formatUSD(cost.input),
      formatUSD(cost.output),
      formatUSD(cost.cacheRead),
      formatUSD(cost.cacheCreate),
      bold(formatUSD(cost.total)),
    ]);
  }

  costRows.push('separator');
  costRows.push([bold('TOTAL'), '', '', '', '', bold(formatUSD(grandTotal))]);

  console.log(table(
    ['Model', 'Input $', 'Output $', 'Cache Rd $', 'Cache Wr $', 'Total $'],
    costRows,
  ));

  const months = Math.max(1, days / 30);
  const monthlyAvg = grandTotal / months;
  console.log(`\nMonthly average: ${bold(formatUSD(monthlyAvg))}/month (over ${months.toFixed(1)} months)`);

  // --- Section 4: Model Comparison ---
  console.log(heading(`Model Comparison (Budget: $${args.budget}/month)`));
  console.log(dim(`Your monthly volume: ~${formatTokens(data.totals.input / months)} input, ~${formatTokens(data.totals.output / months)} output, ~${formatTokens(data.totals.cacheRead / months)} cache read, ~${formatTokens(data.totals.cacheCreate / months)} cache write`));

  const compModels = getComparisonModels();

  // Try fetching live prices
  process.stdout.write(dim('Fetching OpenRouter prices... '));
  const orModels = await fetchOpenRouterModels();
  if (orModels) {
    updateComparisonFromOpenRouter(compModels, orModels);
    console.log(dim(`${orModels.length} models loaded.`));
  } else {
    console.log(yellow('offline — using embedded prices.'));
  }

  // Calculate hypothetical cost per model
  const monthlyInput = data.totals.input / months;
  const monthlyOutput = data.totals.output / months;
  const monthlyCacheRead = data.totals.cacheRead / months;
  const monthlyCacheCreate = data.totals.cacheCreate / months;

  const comparisons = compModels
    .map(m => {
      const cost = calculateComparisonCost(m, monthlyInput, monthlyOutput, monthlyCacheRead, monthlyCacheCreate);
      return { ...m, cost };
    })
    .filter(m => m.cost.total > 0 && isFinite(m.cost.total))
    .sort((a, b) => a.cost.total - b.cost.total);

  // Show top models that fit, plus a few that don't
  const fitting = comparisons.filter(m => m.cost.total <= args.budget);
  const overBudget = comparisons.filter(m => m.cost.total > args.budget).slice(0, 8);
  const display = [...fitting, ...overBudget];

  if (display.length === 0) {
    console.log('\nNo comparison models found.');
  } else {
    const compRows = display.map(m => {
      const fits = m.cost.total <= args.budget;
      const status = fits ? green('fits') : red('over');
      const cache = m.hasCache !== false && m.cacheRead != null ? dim('yes') : dim('no');
      return [
        m.name,
        formatPerMTok(m.input),
        formatPerMTok(m.output),
        cache,
        bold(formatUSD(m.cost.total) + '/mo'),
        status,
      ];
    });

    console.log('\n' + table(
      ['Model', 'In $/MTok', 'Out $/MTok', 'Cache', 'Est. Cost/mo', 'Budget'],
      compRows,
      { align: [, , , 'center'] },
    ));

    console.log(dim(`\nNote: Models without caching treat all cache tokens as regular input.`));
    console.log(dim(`Your effective input volume increases significantly for non-caching models.`));
  }

  // Summary
  console.log('');
  console.log(bold('Summary'));
  console.log(`  Your Claude Code usage costs ~${bold(formatUSD(monthlyAvg))}/month at API rates.`);
  if (fitting.length > 0) {
    console.log(`  ${green(String(fitting.length))} models fit within your $${args.budget}/month budget.`);
    console.log(`  Cheapest: ${bold(fitting[0].name)} at ${formatUSD(fitting[0].cost.total)}/month.`);
  } else {
    console.log(yellow(`  No models fit within $${args.budget}/month at your current volume.`));
  }
}

async function outputJson(data, args) {
  const days = args.from
    ? daysBetween(args.from, args.to)
    : daysBetween(data.meta.minDate, data.meta.maxDate);
  const months = Math.max(1, days / 30);

  const costs = {};
  let grandTotal = 0;
  for (const [model, tokens] of Object.entries(data.byModel)) {
    const cost = calculateClaudeCost(model, tokens);
    if (cost) {
      costs[model] = cost;
      grandTotal += cost.total;
    }
  }

  const compModels = getComparisonModels();
  const orModels = await fetchOpenRouterModels();
  if (orModels) updateComparisonFromOpenRouter(compModels, orModels);

  const monthlyInput = data.totals.input / months;
  const monthlyOutput = data.totals.output / months;
  const monthlyCacheRead = data.totals.cacheRead / months;
  const monthlyCacheCreate = data.totals.cacheCreate / months;

  const comparisons = compModels
    .map(m => ({
      id: m.id,
      name: m.name,
      monthlyCost: calculateComparisonCost(m, monthlyInput, monthlyOutput, monthlyCacheRead, monthlyCacheCreate).total,
      hasCache: m.cacheRead != null,
      fitsInBudget: calculateComparisonCost(m, monthlyInput, monthlyOutput, monthlyCacheRead, monthlyCacheCreate).total <= args.budget,
    }))
    .filter(m => m.monthlyCost > 0 && isFinite(m.monthlyCost))
    .sort((a, b) => a.monthlyCost - b.monthlyCost);

  console.log(JSON.stringify({
    period: { from: args.from || data.meta.minDate, to: args.to || data.meta.maxDate, days },
    meta: data.meta,
    tokensByModel: data.byModel,
    tokensByDate: data.byDate,
    totals: data.totals,
    costsByModel: costs,
    grandTotal,
    monthlyAverage: grandTotal / months,
    budget: args.budget,
    comparisons,
  }, null, 2));
}

function totalTokens(t) {
  return t.input + t.output + t.cacheRead + t.cacheCreate;
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

main().catch(e => {
  console.error(e);
  process.exit(1);
});
