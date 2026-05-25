/**
 * OutputRenderer Port
 *
 * Renders analysis results to the user.
 *
 * @typedef {Object} OutputRenderer
 * @property {function(import('../scan-result.mjs').ScanResult): void} renderTokenUsage
 * @property {function(import('../scan-result.mjs').ScanResult, import('../cost.mjs').TraceCostResult, number): void} renderClaudeCosts
 * @property {function(import('../scan-result.mjs').ScanResult, Object, number, Object): Promise<void>} renderComparison
 * @property {function(import('../cost.mjs').TraceCostResult, Object, number): void} renderSummary
 */
