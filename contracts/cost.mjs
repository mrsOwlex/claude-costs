/**
 * @typedef {Object} CostBreakdown
 * @property {number} input
 * @property {number} output
 * @property {number} cacheRead
 * @property {number} cacheCreate5m
 * @property {number} cacheCreate1h
 * @property {number} cacheCreateUnknown
 * @property {number} cacheCreate
 * @property {number} total
 */

/**
 * @typedef {Object} TraceCostResult
 * @property {Object<string, CostBreakdown>} costsByModel
 * @property {CostBreakdown} total
 * @property {number} grandTotal
 * @property {string[]} warnings
 * @property {Object<string, number>} unknownModels
 */

/** @returns {CostBreakdown} */
export function emptyCost() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheCreateUnknown: 0,
    cacheCreate: 0,
    total: 0,
  };
}

/**
 * @param {CostBreakdown} target
 * @param {CostBreakdown} cost
 */
export function addCost(target, cost) {
  target.input += cost.input || 0;
  target.output += cost.output || 0;
  target.cacheRead += cost.cacheRead || 0;
  target.cacheCreate5m += cost.cacheCreate5m || 0;
  target.cacheCreate1h += cost.cacheCreate1h || 0;
  target.cacheCreateUnknown += cost.cacheCreateUnknown || 0;
  target.cacheCreate += cost.cacheCreate || 0;
  target.total += cost.total || 0;
}

/**
 * @param {string[]} warnings
 * @param {string} warning
 */
export function addWarning(warnings, warning) {
  if (!warnings.includes(warning)) warnings.push(warning);
}
