/**
 * @typedef {Object} TokenBucket
 * @property {number} input - Uncached input tokens
 * @property {number} output - Generated output tokens
 * @property {number} cacheRead - Tokens read from prompt cache
 * @property {number} cacheCreate5m - Cache write tokens with 5-minute TTL
 * @property {number} cacheCreate1h - Cache write tokens with 1-hour TTL
 * @property {number} cacheCreateUnknown - Cache write tokens without known TTL
 * @property {number} cacheCreate - Total cache write tokens (alias for cacheCreateTotal)
 * @property {number} cacheCreateTotal - Total cache write tokens
 */

/** @returns {TokenBucket} */
export function createTokenBucket() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheCreateUnknown: 0,
    cacheCreate: 0,
    cacheCreateTotal: 0,
  };
}

/**
 * @param {TokenBucket} target
 * @param {TokenBucket} tokens
 */
export function addTokens(target, tokens) {
  target.input += tokens.input;
  target.output += tokens.output;
  target.cacheRead += tokens.cacheRead;
  target.cacheCreate5m += tokens.cacheCreate5m;
  target.cacheCreate1h += tokens.cacheCreate1h;
  target.cacheCreateUnknown += tokens.cacheCreateUnknown;
  target.cacheCreate += tokens.cacheCreateTotal;
  target.cacheCreateTotal += tokens.cacheCreateTotal;
}
