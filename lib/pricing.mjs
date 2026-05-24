// All prices in USD per token.

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

const CLAUDE_PRICING = {
  'claude-haiku-4-5': claudeRates(1.00, 5.00),
  'claude-sonnet-4': {
    ...claudeRates(3.00, 15.00),
    longContext: claudeRates(6.00, 22.50),
    longContextThreshold: 200_000,
  },
  'claude-sonnet-4-5': {
    ...claudeRates(3.00, 15.00),
    longContext: claudeRates(6.00, 22.50),
    longContextThreshold: 200_000,
  },
  'claude-sonnet-4-6': claudeRates(3.00, 15.00),
  'claude-opus-4-5': claudeRates(5.00, 25.00),
  'claude-opus-4-6': claudeRates(5.00, 25.00),
  'claude-opus-4-7': claudeRates(5.00, 25.00),
  'claude-opus-4': claudeRates(15.00, 75.00),
};

// Comparison models: embedded fallback prices ($/MTok), refreshed from OpenRouter at runtime.
const COMPARISON_MODELS = [
  // OpenAI
  { id: 'openai/gpt-5.5', name: 'GPT-5.5', input: perM(5.00), output: perM(30.00), cacheRead: null, cacheCreate: null },
  { id: 'openai/gpt-5.5-pro', name: 'GPT-5.5 Pro', input: perM(30.00), output: perM(180.00), cacheRead: null, cacheCreate: null },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', input: perM(2.50), output: perM(15.00), cacheRead: perM(0.25), cacheCreate: perM(3.125) },
  { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini', input: perM(0.75), output: perM(4.50), cacheRead: perM(0.075), cacheCreate: perM(0.9375) },
  { id: 'openai/gpt-5.4-nano', name: 'GPT-5.4 Nano', input: perM(0.20), output: perM(1.25), cacheRead: perM(0.02), cacheCreate: perM(0.25) },
  // Google
  { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash', input: perM(1.50), output: perM(9.00), cacheRead: null, cacheCreate: null },
  { id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', input: perM(0.25), output: perM(1.50), cacheRead: null, cacheCreate: null },
  // DeepSeek
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', input: perM(0.435), output: perM(0.87), cacheRead: perM(0.004), cacheCreate: perM(0.544) },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', input: perM(0.10), output: perM(0.20), cacheRead: perM(0.02), cacheCreate: perM(0.125) },
  // Qwen
  { id: 'qwen/qwen3.7-max', name: 'Qwen 3.7 Max', input: perM(2.50), output: perM(7.50), cacheRead: null, cacheCreate: null },
  { id: 'qwen/qwen3.6-max-preview', name: 'Qwen 3.6 Max', input: perM(1.04), output: perM(6.24), cacheRead: null, cacheCreate: null },
  // Kimi
  { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', input: perM(0.73), output: perM(3.49), cacheRead: perM(0.25), cacheCreate: perM(0.9125) },
  // Anthropic via OpenRouter
  { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7 (API)', input: perM(5.00), output: perM(25.00), cacheRead: perM(0.50), cacheCreate: perM(6.25) },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6 (API)', input: perM(3.00), output: perM(15.00), cacheRead: perM(0.30), cacheCreate: perM(3.75) },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5 (API)', input: perM(1.00), output: perM(5.00), cacheRead: perM(0.10), cacheCreate: perM(1.25) },
];

function emptyCost() {
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

function addCost(target, cost) {
  target.input += cost.input || 0;
  target.output += cost.output || 0;
  target.cacheRead += cost.cacheRead || 0;
  target.cacheCreate5m += cost.cacheCreate5m || 0;
  target.cacheCreate1h += cost.cacheCreate1h || 0;
  target.cacheCreateUnknown += cost.cacheCreateUnknown || 0;
  target.cacheCreate += cost.cacheCreate || 0;
  target.total += cost.total || 0;
}

function requestTokens(requestOrTokens) {
  return requestOrTokens.tokens || requestOrTokens;
}

export function totalInputTokens(tokens) {
  return tokens.input + tokens.cacheRead + tokens.cacheCreateTotal;
}

export function totalTokens(tokens) {
  return totalInputTokens(tokens) + tokens.output;
}

function addWarning(warnings, warning) {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function getClaudeRates(model, tokens, warnings) {
  const pricing = CLAUDE_PRICING[model];
  if (!pricing) return null;

  if (pricing.longContext && totalInputTokens(tokens) > pricing.longContextThreshold) {
    addWarning(warnings, 'long-context-pricing');
    return { ...pricing.longContext, longContext: true };
  }

  return pricing;
}

export function calculateClaudeRequestCost(request) {
  const tokens = requestTokens(request);
  const warnings = [];
  const rates = getClaudeRates(request.model, tokens, warnings);
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

export function calculateClaudeTraceCost(requests) {
  const costsByModel = {};
  const warnings = [];
  const unknownModels = {};
  const total = emptyCost();

  for (const request of requests) {
    const cost = calculateClaudeRequestCost(request);
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

// Compatibility helper for callers that still pass aggregate model token totals.
export function calculateClaudeCost(model, tokens) {
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
  return calculateClaudeRequestCost({ model, tokens: normalized });
}

function getComparisonLimits(model) {
  return {
    context: Number(model.contextLength || model.context_length || 0) || null,
    output: Number(model.maxOutputTokens || model.max_output_tokens || 0) || null,
  };
}

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

// Compatibility helper for aggregate comparisons.
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

export function getComparisonModels() {
  return COMPARISON_MODELS.map(m => ({ ...m }));
}

export function updateComparisonFromOpenRouter(models, orModels) {
  for (const m of models) {
    const orMatch = orModels.find(or => or.id === m.id);
    if (orMatch?.pricing) {
      applyOpenRouterModel(m, orMatch);
    }
  }

  const existingIds = new Set(models.map(m => m.id));
  for (const or of orModels) {
    if (existingIds.has(or.id)) continue;
    if (!isPositivePrice(or.pricing?.prompt) || !isPositivePrice(or.pricing?.completion)) continue;
    if (or.architecture?.modality && !or.architecture.modality.includes('text')) continue;

    const model = {
      id: or.id,
      name: or.name || or.id,
      input: Number(or.pricing.prompt),
      output: Number(or.pricing.completion || 0),
      cacheRead: or.pricing.input_cache_read ? Number(or.pricing.input_cache_read) : null,
      cacheCreate: or.pricing.input_cache_write ? Number(or.pricing.input_cache_write) : null,
      fromOpenRouter: true,
    };
    applyOpenRouterLimits(model, or);
    models.push(model);
  }
}

function applyOpenRouterModel(model, orModel) {
  const p = orModel.pricing;
  if (isPositivePrice(p.prompt)) model.input = Number(p.prompt);
  if (isPositivePrice(p.completion)) model.output = Number(p.completion);
  if (isPositivePrice(p.input_cache_read)) model.cacheRead = Number(p.input_cache_read);
  if (isPositivePrice(p.input_cache_write)) model.cacheCreate = Number(p.input_cache_write);
  applyOpenRouterLimits(model, orModel);
}

function isPositivePrice(value) {
  return value != null && Number(value) > 0;
}

function applyOpenRouterLimits(model, orModel) {
  if (orModel.context_length) model.contextLength = Number(orModel.context_length);
  if (orModel.top_provider?.context_length) model.contextLength = Number(orModel.top_provider.context_length);
  if (orModel.top_provider?.max_completion_tokens) model.maxOutputTokens = Number(orModel.top_provider.max_completion_tokens);
  if (orModel.max_completion_tokens) model.maxOutputTokens = Number(orModel.max_completion_tokens);
}

export { CLAUDE_PRICING };
