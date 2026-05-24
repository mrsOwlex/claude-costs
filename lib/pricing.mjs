// Pricing ported from CodexBar (MIT) — CostUsagePricing.swift
// All prices in USD per token

function perM(usd) {
  return usd / 1_000_000;
}

const CLAUDE_PRICING = {
  'claude-haiku-4-5': {
    input: perM(1.00),
    output: perM(5.00),
    cacheRead: perM(0.10),
    cacheCreate: perM(1.25),
  },
  'claude-sonnet-4-5': {
    input: perM(3.00),
    output: perM(15.00),
    cacheRead: perM(0.30),
    cacheCreate: perM(3.75),
    threshold: 200_000,
    inputAbove: perM(6.00),
    outputAbove: perM(22.50),
    cacheReadAbove: perM(0.60),
    cacheCreateAbove: perM(7.50),
  },
  'claude-sonnet-4-6': {
    input: perM(3.00),
    output: perM(15.00),
    cacheRead: perM(0.30),
    cacheCreate: perM(3.75),
    threshold: 200_000,
    inputAbove: perM(6.00),
    outputAbove: perM(22.50),
    cacheReadAbove: perM(0.60),
    cacheCreateAbove: perM(7.50),
  },
  'claude-opus-4-5': {
    input: perM(5.00),
    output: perM(25.00),
    cacheRead: perM(0.50),
    cacheCreate: perM(6.25),
  },
  'claude-opus-4-6': {
    input: perM(5.00),
    output: perM(25.00),
    cacheRead: perM(0.50),
    cacheCreate: perM(6.25),
  },
  'claude-opus-4-7': {
    input: perM(5.00),
    output: perM(25.00),
    cacheRead: perM(0.50),
    cacheCreate: perM(6.25),
  },
  'claude-opus-4': {
    input: perM(15.00),
    output: perM(75.00),
    cacheRead: perM(1.50),
    cacheCreate: perM(18.75),
  },
};

// Comparison models — embedded fallback prices ($/MTok)
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

// Tiered cost calculation (ported from CodexBar)
function tieredCost(tokens, baseRate, aboveRate, threshold) {
  if (!threshold || !aboveRate) return tokens * baseRate;
  const below = Math.min(tokens, threshold);
  const above = Math.max(tokens - threshold, 0);
  return below * baseRate + above * aboveRate;
}

export function calculateClaudeCost(model, tokens) {
  const pricing = CLAUDE_PRICING[model];
  if (!pricing) return null;

  const inputCost = tieredCost(tokens.input, pricing.input, pricing.inputAbove, pricing.threshold);
  const outputCost = tieredCost(tokens.output, pricing.output, pricing.outputAbove, pricing.threshold);
  const cacheReadCost = tieredCost(tokens.cacheRead, pricing.cacheRead, pricing.cacheReadAbove, pricing.threshold);
  const cacheCreateCost = tieredCost(tokens.cacheCreate, pricing.cacheCreate, pricing.cacheCreateAbove, pricing.threshold);

  return {
    input: inputCost,
    output: outputCost,
    cacheRead: cacheReadCost,
    cacheCreate: cacheCreateCost,
    total: inputCost + outputCost + cacheReadCost + cacheCreateCost,
  };
}

export function calculateComparisonCost(compModel, inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens) {
  const hasCache = compModel.cacheRead != null;

  // Models without caching: all cache tokens become regular input
  const effectiveInput = hasCache
    ? inputTokens
    : inputTokens + cacheReadTokens + cacheCreateTokens;

  const inputCost = effectiveInput * compModel.input;
  const outputCost = outputTokens * compModel.output;
  const cacheReadCost = hasCache ? cacheReadTokens * compModel.cacheRead : 0;

  let cacheCreateCost = 0;
  if (hasCache) {
    const cacheCreateRate = compModel.cacheCreate ?? compModel.input * 1.25;
    cacheCreateCost = cacheCreateTokens * cacheCreateRate;
  }

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheCreateCost,
    total: inputCost + outputCost + cacheReadCost + cacheCreateCost,
    hasCache,
  };
}

export function getComparisonModels() {
  return COMPARISON_MODELS.map(m => ({ ...m }));
}

export function updateComparisonFromOpenRouter(models, orModels) {
  for (const m of models) {
    const orMatch = orModels.find(or => or.id === m.id);
    if (orMatch?.pricing) {
      const p = orMatch.pricing;
      if (p.prompt) m.input = Number(p.prompt);
      if (p.completion) m.output = Number(p.completion);
      if (p.input_cache_read) m.cacheRead = Number(p.input_cache_read);
      if (p.input_cache_write) m.cacheCreate = Number(p.input_cache_write);
    }
  }

  // Add popular OpenRouter models not in our embedded list
  const existingIds = new Set(models.map(m => m.id));
  for (const or of orModels) {
    if (existingIds.has(or.id)) continue;
    if (!or.pricing?.prompt || Number(or.pricing.prompt) === 0) continue;
    if (or.architecture?.modality && !or.architecture.modality.includes('text')) continue;

    models.push({
      id: or.id,
      name: or.name || or.id,
      input: Number(or.pricing.prompt),
      output: Number(or.pricing.completion),
      cacheRead: or.pricing.input_cache_read ? Number(or.pricing.input_cache_read) : null,
      cacheCreate: or.pricing.input_cache_write ? Number(or.pricing.input_cache_write) : null,
      fromOpenRouter: true,
    });
  }
}

export { CLAUDE_PRICING };
