import { emptyCost, addCost, addWarning } from '../contracts/cost.mjs';

function perM(usd) {
  return usd / 1_000_000;
}

function claudeRates(inputPerM, outputPerM) {
  return {
    input: perM(inputPerM),
    output: perM(outputPerM),
    cacheRead: perM(inputPerM * 0.1),
    cacheCreate5m: perM(inputPerM * 1.25),
    cacheCreate1h: perM(inputPerM * 2),
  };
}

export function totalInputTokens(tokens) {
  return tokens.input + tokens.cacheRead + tokens.cacheCreateTotal;
}

export function totalTokens(tokens) {
  return totalInputTokens(tokens) + tokens.output;
}

function requestTokens(requestOrTokens) {
  return requestOrTokens.tokens || requestOrTokens;
}

/**
 * @param {string} model
 * @param {import('../contracts/tokens.mjs').TokenBucket} tokens
 * @param {string[]} warnings
 * @param {Object<string, import('../contracts/pricing-model.mjs').ClaudePricingRates>} pricing
 */
function getClaudeRates(model, tokens, warnings, pricing) {
  const rates = pricing[model];
  if (!rates) return null;

  if (rates.longContext && totalInputTokens(tokens) > rates.longContextThreshold) {
    addWarning(warnings, 'long-context-pricing');
    return { ...rates.longContext, longContext: true };
  }

  return rates;
}

/**
 * @param {import('../contracts/request.mjs').Request} request
 * @param {Object<string, import('../contracts/pricing-model.mjs').ClaudePricingRates>} pricing
 */
export function calculateClaudeRequestCost(request, pricing) {
  const tokens = requestTokens(request);
  const warnings = [];
  const rates = getClaudeRates(request.model, tokens, warnings, pricing);
  if (!rates) return null;
  if (tokens.cacheCreateUnknown) addWarning(warnings, 'cache-write-ttl-unknown');

  const input = tokens.input * rates.input;
  const output = tokens.output * rates.output;
  const cacheRead = tokens.cacheRead * rates.cacheRead;
  const cacheCreate5m = tokens.cacheCreate5m * rates.cacheCreate5m;
  const cacheCreate1h = tokens.cacheCreate1h * rates.cacheCreate1h;
  const cacheCreateUnknown = tokens.cacheCreateUnknown * rates.cacheCreate5m;
  const cacheCreate = cacheCreate5m + cacheCreate1h + cacheCreateUnknown;

  return {
    input,
    output,
    cacheRead,
    cacheCreate5m,
    cacheCreate1h,
    cacheCreateUnknown,
    cacheCreate,
    total: input + output + cacheRead + cacheCreate,
    longContext: Boolean(rates.longContext),
    warnings,
  };
}

/**
 * @param {import('../contracts/request.mjs').Request[]} requests
 * @param {Object<string, import('../contracts/pricing-model.mjs').ClaudePricingRates>} pricing
 */
export function calculateClaudeTraceCost(requests, pricing) {
  const costsByModel = {};
  const warnings = [];
  const unknownModels = {};
  const total = emptyCost();

  for (const request of requests) {
    const cost = calculateClaudeRequestCost(request, pricing);
    if (!cost) {
      unknownModels[request.model] = (unknownModels[request.model] || 0) + 1;
      continue;
    }
    if (!costsByModel[request.model]) costsByModel[request.model] = emptyCost();
    addCost(costsByModel[request.model], cost);
    addCost(total, cost);
    for (const warning of cost.warnings || []) addWarning(warnings, warning);
  }

  if (Object.keys(unknownModels).length > 0) addWarning(warnings, 'unknown-model-pricing');

  return {
    costsByModel,
    total,
    grandTotal: total.total,
    warnings,
    unknownModels,
  };
}

/**
 * @param {string} model
 * @param {import('../contracts/tokens.mjs').TokenBucket} tokens
 * @param {Object<string, import('../contracts/pricing-model.mjs').ClaudePricingRates>} pricing
 */
export function calculateClaudeCost(model, tokens, pricing) {
  const normalized = {
    input: tokens.input || 0,
    output: tokens.output || 0,
    cacheRead: tokens.cacheRead || 0,
    cacheCreate5m: tokens.cacheCreate5m || 0,
    cacheCreate1h: tokens.cacheCreate1h || 0,
    cacheCreateUnknown: tokens.cacheCreateUnknown ?? tokens.cacheCreate ?? tokens.cacheCreateTotal ?? 0,
    cacheCreateTotal: tokens.cacheCreateTotal ?? tokens.cacheCreate ?? 0,
  };
  if (!('cacheCreateTotal' in tokens)) {
    normalized.cacheCreateTotal = normalized.cacheCreate5m + normalized.cacheCreate1h + normalized.cacheCreateUnknown;
  }
  return calculateClaudeRequestCost({ model, tokens: normalized }, pricing);
}

export { perM, claudeRates };
