/**
 * PricingDataSource Port
 *
 * Provides pricing information for Claude models and comparison models.
 *
 * @typedef {Object} PricingDataSource
 * @property {function(): Object<string, import('../pricing-model.mjs').ClaudePricingRates>} getClaudePricing
 * @property {function(): import('../pricing-model.mjs').ComparisonModel[]} getComparisonModels
 * @property {function(): Promise<Object[]|null>} [fetchLivePricing] - Optional live pricing fetch
 * @property {function(import('../pricing-model.mjs').ComparisonModel[], Object[]): void} [updateFromLive] - Merge live pricing into models
 */
