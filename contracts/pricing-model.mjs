/**
 * @typedef {Object} ClaudePricingRates
 * @property {number} input - USD per token for uncached input
 * @property {number} output - USD per token for output
 * @property {number} cacheRead - USD per token for cache reads (10% of input)
 * @property {number} cacheCreate5m - USD per token for 5-minute cache writes (125% of input)
 * @property {number} cacheCreate1h - USD per token for 1-hour cache writes (200% of input)
 * @property {ClaudePricingRates} [longContext] - Optional long-context rates
 * @property {number} [longContextThreshold] - Input token threshold for long-context pricing
 */

/**
 * @typedef {Object} ComparisonModel
 * @property {string} id - Model identifier (e.g. 'openai/gpt-5.5')
 * @property {string} name - Human-readable model name
 * @property {number} input - USD per token for input
 * @property {number} output - USD per token for output
 * @property {number|null} cacheRead - USD per token for cache reads (null if unsupported)
 * @property {number|null} cacheCreate - USD per token for cache writes (null if unsupported)
 * @property {number} [contextLength] - Max context window size in tokens
 * @property {number} [maxOutputTokens] - Max output tokens
 * @property {boolean} [fromOpenRouter] - Whether this model was discovered via OpenRouter
 */
