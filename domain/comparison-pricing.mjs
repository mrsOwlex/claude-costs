import { emptyCost, addWarning } from '../contracts/cost.mjs';
import { totalInputTokens } from './claude-pricing.mjs';

function getComparisonLimits(model) {
  return {
    context: Number(model.contextLength || model.context_length || 0) || null,
    output: Number(model.maxOutputTokens || model.max_output_tokens || 0) || null,
  };
}

/**
 * @param {import('../contracts/pricing-model.mjs').ComparisonModel} model
 * @param {import('../contracts/request.mjs').Request} request
 * @param {Object} [options]
 * @param {string} [options.cacheMode='provider']
 */
function priceComparisonRequest(model, request, { cacheMode = 'provider' } = {}) {
  const t = request.tokens;
  const warnings = [];
  const limits = getComparisonLimits(model);
  if (limits.context && totalInputTokens(t) + t.output > limits.context) addWarning(warnings, 'context-limit-exceeded');
  if (limits.output && t.output > limits.output) addWarning(warnings, 'output-limit-exceeded');

  const hasCacheRead = model.cacheRead != null;
  const hasCacheCreate = model.cacheCreate != null;
  let inputTokens = t.input;
  let cacheRead = 0;
  let cacheCreate = 0;

  if (cacheMode === 'none') {
    inputTokens += t.cacheRead + t.cacheCreateTotal;
    addWarning(warnings, 'cache-disabled-scenario');
  } else {
    if (hasCacheRead) {
      cacheRead = t.cacheRead * model.cacheRead;
    } else {
      inputTokens += t.cacheRead;
    }

    if (hasCacheRead && hasCacheCreate) {
      cacheCreate = t.cacheCreateTotal * model.cacheCreate;
    } else {
      inputTokens += t.cacheCreateTotal;
      if (hasCacheRead && !hasCacheCreate && t.cacheCreateTotal > 0) addWarning(warnings, 'partial-cache-pricing');
    }
  }

  const input = inputTokens * model.input;
  const output = t.output * model.output;

  return {
    input,
    output,
    cacheRead,
    cacheCreate,
    total: input + output + cacheRead + cacheCreate,
    warnings,
  };
}

/**
 * @param {import('../contracts/pricing-model.mjs').ComparisonModel} model
 * @param {import('../contracts/request.mjs').Request[]} requests
 * @param {Object} [options]
 * @param {string} [options.cacheMode='provider']
 */
export function calculateComparisonTraceCost(model, requests, { cacheMode = 'provider' } = {}) {
  const cost = emptyCost();
  const warnings = [];
  let impossibleRequests = 0;
  let contextWarningCount = 0;
  let outputWarningCount = 0;

  for (const request of requests) {
    const requestCost = priceComparisonRequest(model, request, { cacheMode });
    cost.input += requestCost.input;
    cost.output += requestCost.output;
    cost.cacheRead += requestCost.cacheRead;
    cost.cacheCreate += requestCost.cacheCreate;
    cost.total += requestCost.total;
    const hasContextWarning = requestCost.warnings.includes('context-limit-exceeded');
    const hasOutputWarning = requestCost.warnings.includes('output-limit-exceeded');
    if (hasContextWarning) contextWarningCount++;
    if (hasOutputWarning) outputWarningCount++;
    if (hasContextWarning || hasOutputWarning) impossibleRequests++;
    for (const warning of requestCost.warnings) {
      addWarning(warnings, warning);
    }
  }

  return {
    ...cost,
    cacheMode,
    hasCache: model.cacheRead != null,
    hasCacheCreate: model.cacheCreate != null,
    impossibleRequests,
    contextWarningCount,
    outputWarningCount,
    warnings,
  };
}

export function calculateComparisonNoCacheTraceCost(model, requests) {
  return calculateComparisonTraceCost(model, requests, { cacheMode: 'none' });
}

export function calculateAgenticAdjustedRange(model, traceCost, { min = 1, max = 3 } = {}) {
  return {
    minMultiplier: min,
    maxMultiplier: max,
    min: traceCost.total * min,
    max: traceCost.total * max,
  };
}

export function calculateComparisonCost(compModel, inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens) {
  const request = {
    model: 'aggregate',
    tokens: {
      input: inputTokens,
      output: outputTokens,
      cacheRead: cacheReadTokens,
      cacheCreate5m: 0,
      cacheCreate1h: 0,
      cacheCreateUnknown: cacheCreateTokens,
      cacheCreateTotal: cacheCreateTokens,
    },
  };
  return calculateComparisonTraceCost(compModel, [request]);
}
