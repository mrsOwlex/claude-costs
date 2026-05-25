import type { Request } from '../contracts/request.js';
import type { TokenBucket } from '../contracts/tokens.js';
import type { ScanResult } from '../contracts/scan-result.js';
import { createTokenBucket, addTokens } from '../contracts/tokens.js';

export function totalRequestTokens(request: Request): number {
  const t = request.tokens;
  return t.input + t.output + t.cacheRead + t.cacheCreateTotal;
}

export function tokensEqual(a: TokenBucket, b: TokenBucket): boolean {
  return a.input === b.input
    && a.output === b.output
    && a.cacheRead === b.cacheRead
    && a.cacheCreate5m === b.cacheCreate5m
    && a.cacheCreate1h === b.cacheCreate1h
    && a.cacheCreateUnknown === b.cacheCreateUnknown
    && a.cacheCreateTotal === b.cacheCreateTotal;
}

export function chooseRequestEntry(current: Request | undefined, next: Request): Request {
  if (!current) return next;
  const currentTokens = totalRequestTokens(current);
  const nextTokens = totalRequestTokens(next);
  if (nextTokens > currentTokens) return next;
  if (nextTokens < currentTokens) return current;
  return next;
}

interface DeduplicateOptions {
  from?: string;
  to?: string;
}

export function deduplicateAndAggregate(
  fileMaps: Map<string, Request>[],
  { from, to }: DeduplicateOptions = {},
): ScanResult {
  const globalEntries = new Map<string, Request>();
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
  const messageIds = new Set<string>();
  const byModel: Record<string, TokenBucket> = {};
  const byDate: Record<string, Record<string, TokenBucket>> = {};
  const totals = createTokenBucket();
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const request of requests) {
    if (request.messageId) messageIds.add(request.messageId);
    if (request.date) {
      if (!minDate || request.date < minDate) minDate = request.date;
      if (!maxDate || request.date > maxDate) maxDate = request.date;
    }

    if (!byModel[request.model]) byModel[request.model] = createTokenBucket();
    addTokens(byModel[request.model]!, request.tokens);
    addTokens(totals, request.tokens);

    if (request.date) {
      if (!byDate[request.date]) byDate[request.date] = {};
      if (!byDate[request.date]![request.model]) byDate[request.date]![request.model] = createTokenBucket();
      addTokens(byDate[request.date]![request.model]!, request.tokens);
    }
  }

  return {
    requests,
    byModel,
    byDate,
    totals,
    meta: {
      totalFiles: 0,
      totalBytes: 0,
      totalEntries: requests.length,
      totalRawEntries: 0,
      totalFileEntries,
      duplicateRequests,
      conflictRequests,
      invalidEntries: 0,
      undatedSkipped,
      minDate,
      maxDate,
      projectDirs: [],
      messageCount: messageIds.size,
    },
  };
}
