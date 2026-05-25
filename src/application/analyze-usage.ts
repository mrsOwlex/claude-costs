import type { CLIArgs } from '../adapters/driving/cli.js';
import { scanSessions } from '../adapters/driven/filesystem-session-source.js';
import { CLAUDE_PRICING, getComparisonModels } from '../adapters/driven/embedded-pricing.js';
import { fetchOpenRouterModels, updateComparisonFromOpenRouter } from '../adapters/driven/openrouter-pricing-source.js';
import { setColor, heading, formatBytes, yellow, dim } from '../adapters/driven/format.js';
import { printTokenUsage, printClaudeCosts, printComparison, printSummary } from '../adapters/driven/terminal-renderer.js';
import { outputJson } from '../adapters/driven/json-renderer.js';
import { calculateClaudeTraceCost } from '../domain/claude-pricing.js';
import { daysBetween, calculateRequestStats } from '../domain/stats.js';
import { buildComparisons } from './build-comparisons.js';

export async function analyzeUsage(args: CLIArgs): Promise<void> {
  if (args.noColor) setColor(false);

  let data;
  try {
    data = scanSessions({ from: args.from ?? undefined, to: args.to ?? undefined });
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
  const traceCost = calculateClaudeTraceCost(data.requests, CLAUDE_PRICING);
  const requestStats = calculateRequestStats(data.requests, months);

  if (args.json) {
    const compModels = getComparisonModels();
    const orModels = await fetchOpenRouterModels();
    if (orModels) updateComparisonFromOpenRouter(compModels, orModels);
    const { comparisons } = buildComparisons(compModels, data.requests, args, months);
    outputJson(data, args, traceCost, requestStats, comparisons, months, days);
    return;
  }

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
