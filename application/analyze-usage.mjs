import { scanSessions } from '../adapters/driven/filesystem-session-source.mjs';
import { CLAUDE_PRICING, getComparisonModels } from '../adapters/driven/embedded-pricing.mjs';
import { fetchOpenRouterModels, updateComparisonFromOpenRouter } from '../adapters/driven/openrouter-pricing-source.mjs';
import { setColor, heading, formatTokens, formatBytes, yellow, dim } from '../adapters/driven/format.mjs';
import { printTokenUsage, printClaudeCosts, printComparison, printSummary } from '../adapters/driven/terminal-renderer.mjs';
import { outputJson } from '../adapters/driven/json-renderer.mjs';
import { calculateClaudeTraceCost } from '../domain/claude-pricing.mjs';
import { daysBetween, calculateRequestStats } from '../domain/stats.mjs';
import { buildComparisons } from './build-comparisons.mjs';

export async function analyzeUsage(args) {
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

  const days = daysBetween(args.from, args.to);
  const months = Math.max(1, days / 30);
  const traceCost = calculateClaudeTraceCost(data.requests, CLAUDE_PRICING);
  const requestStats = calculateRequestStats(data.requests, months);

  if (args.json) {
    const compModels = getComparisonModels();
    const orModels = await fetchOpenRouterModels();
    if (orModels) updateComparisonFromOpenRouter(compModels, orModels);
    const { comparisons } = buildComparisons(compModels, data.requests, args, months);
    return outputJson(data, args, traceCost, requestStats, comparisons, months, days);
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
