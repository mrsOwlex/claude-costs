import type { TokenBucket } from './tokens.js';
import { normalizeModel } from './model-normalization.js';

export interface Request {
  key: string;
  messageId: string | null;
  requestId: string | null;
  timestamp: string | null;
  date: string | null;
  model: string;
  tokens: TokenBucket;
  source?: 'claude' | 'opencode';
}

export function safeNonNegInt(v: unknown): number {
  if (typeof v !== 'number') return 0;
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

interface RawUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_creation?: {
    ephemeral_5m_input_tokens?: unknown;
    ephemeral_1h_input_tokens?: unknown;
  };
}

export function parseUsageTokens(usage: RawUsage): TokenBucket {
  const cacheCreateTotal = safeNonNegInt(usage.cache_creation_input_tokens);
  const cacheCreate5m = safeNonNegInt(usage.cache_creation?.ephemeral_5m_input_tokens);
  const cacheCreate1h = safeNonNegInt(usage.cache_creation?.ephemeral_1h_input_tokens);
  const knownCacheCreate = cacheCreate5m + cacheCreate1h;

  return {
    input: safeNonNegInt(usage.input_tokens),
    output: safeNonNegInt(usage.output_tokens),
    reasoning: 0,
    cacheRead: safeNonNegInt(usage.cache_read_input_tokens),
    cacheCreate5m,
    cacheCreate1h,
    cacheCreateUnknown: Math.max(cacheCreateTotal - knownCacheCreate, 0),
    cacheCreate: Math.max(cacheCreateTotal, knownCacheCreate),
    cacheCreateTotal: Math.max(cacheCreateTotal, knownCacheCreate),
  };
}

interface MakeRequestParams {
  key: string;
  messageId: string | null;
  requestId: string | null;
  timestamp: unknown;
  model: unknown;
  usage: RawUsage;
}

export function makeRequest({ key, messageId, requestId, timestamp, model, usage }: MakeRequestParams): Request {
  const ts = typeof timestamp === 'string' ? timestamp : null;
  const date = ts ? ts.slice(0, 10) : null;
  return {
    key,
    messageId,
    requestId,
    timestamp: ts,
    date,
    model: normalizeModel(model),
    tokens: parseUsageTokens(usage),
    source: 'claude',
  };
}
