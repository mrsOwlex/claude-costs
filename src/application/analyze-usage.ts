import type { CLIArgs } from '../adapters/driving/cli.js';
import { scanSessions } from '../adapters/driven/filesystem-session-source.js';
import { scanOpencodeSessions } from '../adapters/driven/opencode-session-source.js';
import { CLAUDE_PRICING, OPENCODE_PRICING, getComparisonModels } from '../adapters/driven/embedded-pricing.js';
import { fetchOpenRouterModels, updateComparisonFromOpenRouter } from '../adapters/driven/openrouter-pricing-source.js';
import { setColor, heading, formatBytes, yellow, dim } from '../adapters/driven/format.js';
import { printTokenUsage, printClaudeCosts, printComparison, printSummary } from '../adapters/driven/terminal-renderer.js';
import { outputJson } from '../adapters/driven/json-renderer.js';
import { calculateClaudeTraceCost } from '../domain/claude-pricing.js';
import { calculateOpencodeTraceCost } from '../domain/opencode-pricing.js';
import { mergeScanResults } from '../domain/scanner.js';
import { daysBetween, calculateRequestStats } from '../domain/stats.js';
import { buildComparisons } from './build-comparisons.js';
import type { ScanResult } from '../contracts/scan-result.js';
import type { TraceCostResult } from '../contracts/cost.js';
import { emptyCost, addCost } from '../contracts/cost.js';

function scanBySource(args: CLIArgs): ScanResult {
  const opts = { from: args.from ?? undefined, to: args.to ?? undefined };

  if (args.source === 'claude') {
    return scanSessions(opts);
  }
  if (args.source === 'opencode') {
    return scanOpencodeSessions(opts);
  }

  let claudeData: ScanResult | null = null;
  try {
    claudeData = scanSessions(opts);
  } catch { /* no claude data */ }

  const opencodeData = scanOpencodeSessions(opts);

  if (!claudeData) return opencodeData;
  if (opencodeData.requests.length === 0) return claudeData;
  return mergeScanResults(claudeData, opencodeData);
}

function mergeTraceCosts(a: TraceCostResult, b: TraceCostResult): TraceCostResult {
  const costsByModel: Record<string, import('../contracts/cost.js').CostBreakdown> = { ...a.costsByModel };
  for (const [model, cost] of Object.entries(b.costsByModel)) {
    if (!costsByModel[model]) costsByModel[model] = emptyCost();
    addCost(costsByModel[model]!, cost);
  }
  const total = emptyCost();
  addCost(total, a.total);
  addCost(total, b.total);
  const unknownModels: Record<string, number> = { ...a.unknownModels };
  for (const [model, count] of Object.entries(b.unknownModels)) {
    unknownModels[model] = (unknownModels[model] || 0) + count;
  }
  return {
    costsByModel,
    total,
    grandTotal: total.total,
    warnings: [...new Set([...a.warnings, ...b.warnings])],
    unknownModels,
  };
}

function calculateTraceCost(data: ScanResult, source: CLIArgs['source']): TraceCostResult {
  if (source === 'opencode') {
    return calculateOpencodeTraceCost(data.requests, OPENCODE_PRICING);
  }

  const claudeRequests = data.requests.filter(r => r.source !== 'opencode');
  const opencodeRequests = data.requests.filter(r => r.source === 'opencode');

  const claudeCost = calculateClaudeTraceCost(claudeRequests, CLAUDE_PRICING);

  const unknownClaudeRequests = claudeRequests.filter(r => claudeCost.unknownModels[r.model]);
  const fallbackCost = calculateOpencodeTraceCost(unknownClaudeRequests, OPENCODE_PRICING);
  for (const model of Object.keys(fallbackCost.costsByModel)) {
    delete claudeCost.unknownModels[model];
  }
  if (Object.keys(claudeCost.unknownModels).length === 0) {
    claudeCost.warnings = claudeCost.warnings.filter(w => w !== 'unknown-model-pricing');
  }

  const opencodeCost = calculateOpencodeTraceCost(opencodeRequests, OPENCODE_PRICING);

  return mergeTraceCosts(mergeTraceCosts(claudeCost, fallbackCost), opencodeCost);
}

function sourceLabel(source: CLIArgs['source']): string {
  if (source === 'claude') return 'Claude Code';
  if (source === 'opencode') return 'opencode';
  return 'Agent';
}

export async function analyzeUsage(args: CLIArgs): Promise<void> {
  if (args.noColor) setColor(false);

  let data: ScanResult;
  try {
    data = scanBySource(args);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }

  if (data.requests.length === 0) {
    console.log('No usage data found for the selected period.');
    return;
  }

  const days = daysBetween(args.from, args.to);
  const months = Math.max(1, days / 30);
  const traceCost = calculateTraceCost(data, args.source);
  const requestStats = calculateRequestStats(data.requests, months);

  if (args.json) {
    const compModels = getComparisonModels();
    const orModels = await fetchOpenRouterModels();
    if (orModels) updateComparisonFromOpenRouter(compModels, orModels);
    const { comparisons } = buildComparisons(compModels, data.requests, args, months);
    outputJson(data, args, traceCost, requestStats, comparisons, months, days);
    return;
  }

  const label = sourceLabel(args.source);
  console.log(heading(`${label} Token Usage & Cost Analysis`));
  console.log(`Period:   ${args.from} – ${args.to} (${days} days)`);

  if (args.source === 'all') {
    const claudeCount = data.requests.filter(r => r.source !== 'opencode').length;
    const opencodeCount = data.requests.filter(r => r.source === 'opencode').length;
    console.log(`Sources:  Claude Code (${claudeCount} requests), opencode (${opencodeCount} requests)`);
  }

  console.log(`Data:     ${data.meta.totalFiles.toLocaleString()} session files (${formatBytes(data.meta.totalBytes)})`);
  console.log(`Requests: ${data.meta.totalEntries.toLocaleString()} deduped (${data.meta.duplicateRequests.toLocaleString()} duplicate file entries ignored)`);
  console.log(`Messages: ${data.meta.messageCount.toLocaleString()}`);
  if (data.meta.conflictRequests > 0) {
    console.log(yellow(`Dedupe:   ${data.meta.conflictRequests.toLocaleString()} duplicate request keys had conflicting token counts; highest-token entry kept.`));
  }

  printTokenUsage(data);
  printClaudeCosts(data, traceCost, months);

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
  printComparison(comparisons, args, months, requestStats, data);
  printSummary(traceCost, args, months);
}
