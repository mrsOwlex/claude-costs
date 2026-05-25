import { createTokenBucket, addTokens } from '../contracts/tokens.mjs';

/**
 * @param {import('../contracts/request.mjs').Request} request
 * @returns {number}
 */
export function totalRequestTokens(request) {
  const t = request.tokens;
  return t.input + t.output + t.cacheRead + t.cacheCreateTotal;
}

/**
 * @param {import('../contracts/tokens.mjs').TokenBucket} a
 * @param {import('../contracts/tokens.mjs').TokenBucket} b
 * @returns {boolean}
 */
export function tokensEqual(a, b) {
  return a.input === b.input
    && a.output === b.output
    && a.cacheRead === b.cacheRead
    && a.cacheCreate5m === b.cacheCreate5m
    && a.cacheCreate1h === b.cacheCreate1h
    && a.cacheCreateUnknown === b.cacheCreateUnknown
    && a.cacheCreateTotal === b.cacheCreateTotal;
}

/**
 * @param {import('../contracts/request.mjs').Request|undefined} current
 * @param {import('../contracts/request.mjs').Request} next
 * @returns {import('../contracts/request.mjs').Request}
 */
export function chooseRequestEntry(current, next) {
  if (!current) return next;
  const currentTokens = totalRequestTokens(current);
  const nextTokens = totalRequestTokens(next);
  if (nextTokens > currentTokens) return next;
  if (nextTokens < currentTokens) return current;
  return next;
}

/**
 * Pure deduplication and aggregation of parsed request entries.
 * No filesystem I/O — receives pre-parsed per-file entry maps.
 *
 * @param {Map<string, import('../contracts/request.mjs').Request>[]} fileMaps - Per-file deduped entry maps
 * @param {Object} [options]
 * @param {string} [options.from] - Start date filter (inclusive)
 * @param {string} [options.to] - End date filter (inclusive)
 * @returns {import('../contracts/scan-result.mjs').ScanResult}
 */
export function deduplicateAndAggregate(fileMaps, { from, to } = {}) {
  const globalEntries = new Map();
  let duplicateRequests = 0;
  let conflictRequests = 0;
  let undatedSkipped = 0;
  let totalFileEntries = 0;
  const hasDateFilter = Boolean(from || to);

  for (const fileEntries of fileMaps) {
    totalFileEntries += fileEntries.size;

    for (const [key, request] of fileEntries) {
      if (request.model === 'synthetic' || request.model === '<synthetic>') continue;
      if (request.date) {
        if (from && request.date < from) continue;
        if (to && request.date > to) continue;
      } else if (hasDateFilter) {
        undatedSkipped++;
        continue;
      }

      const existing = globalEntries.get(key);
      if (existing) {
        duplicateRequests++;
        if (!tokensEqual(existing.tokens, request.tokens)) conflictRequests++;
      }
      globalEntries.set(key, chooseRequestEntry(existing, request));
    }
  }

  const requests = [...globalEntries.values()]
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
  const messageIds = new Set();
  const byModel = {};
  const byDate = {};
  const totals = createTokenBucket();
  let minDate = null;
  let maxDate = null;

  for (const request of requests) {
    if (request.messageId) messageIds.add(request.messageId);
    if (request.date) {
      if (!minDate || request.date < minDate) minDate = request.date;
      if (!maxDate || request.date > maxDate) maxDate = request.date;
    }

    if (!byModel[request.model]) byModel[request.model] = createTokenBucket();
    addTokens(byModel[request.model], request.tokens);
    addTokens(totals, request.tokens);

    if (request.date) {
      if (!byDate[request.date]) byDate[request.date] = {};
      if (!byDate[request.date][request.model]) byDate[request.date][request.model] = createTokenBucket();
      addTokens(byDate[request.date][request.model], request.tokens);
    }
  }

  return {
    requests,
    byModel,
    byDate,
    totals,
    meta: {
      totalFileEntries,
      duplicateRequests,
      conflictRequests,
      undatedSkipped,
      minDate,
      maxDate,
      messageCount: messageIds.size,
    },
  };
}
