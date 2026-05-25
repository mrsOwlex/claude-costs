import { normalizeModel } from '../domain/model-normalization.mjs';

/**
 * @typedef {Object} Request
 * @property {string} key - Unique dedup key (messageId:requestId or file-local)
 * @property {string|null} messageId
 * @property {string|null} requestId
 * @property {string|null} timestamp - ISO 8601 timestamp
 * @property {string|null} date - YYYY-MM-DD extracted from timestamp
 * @property {string} model - Normalized model name
 * @property {import('./tokens.mjs').TokenBucket} tokens
 */

/**
 * @param {*} v
 * @returns {number}
 */
export function safeNonNegInt(v) {
  if (typeof v !== 'number') return 0;
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

/**
 * @param {Object} usage - Raw usage object from JSONL
 * @returns {import('./tokens.mjs').TokenBucket}
 */
export function parseUsageTokens(usage) {
  const cacheCreateTotal = safeNonNegInt(usage.cache_creation_input_tokens);
  const cacheCreate5m = safeNonNegInt(usage.cache_creation?.ephemeral_5m_input_tokens);
  const cacheCreate1h = safeNonNegInt(usage.cache_creation?.ephemeral_1h_input_tokens);
  const knownCacheCreate = cacheCreate5m + cacheCreate1h;

  return {
    input: safeNonNegInt(usage.input_tokens),
    output: safeNonNegInt(usage.output_tokens),
    cacheRead: safeNonNegInt(usage.cache_read_input_tokens),
    cacheCreate5m,
    cacheCreate1h,
    cacheCreateUnknown: Math.max(cacheCreateTotal - knownCacheCreate, 0),
    cacheCreateTotal: Math.max(cacheCreateTotal, knownCacheCreate),
  };
}

/**
 * @param {Object} params
 * @returns {Request}
 */
export function makeRequest({ key, messageId, requestId, timestamp, model, usage }) {
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
  };
}
