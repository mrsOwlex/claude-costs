import type { CostBreakdown } from '../contracts/cost.js';
import type { ComparisonModel } from '../contracts/pricing-model.js';
import type { Request } from '../contracts/request.js';
import type { TokenBucket } from '../contracts/tokens.js';
import { emptyCost, addWarning } from '../contracts/cost.js';
import { totalInputTokens } from './claude-pricing.js';

function getComparisonLimits(model: ComparisonModel): { context: number | null; output: number | null } {
  return {
    context: Number(model.contextLength || 0) || null,
    output: Number(model.maxOutputTokens || 0) || null,
  };
}

interface RequestPriceResult {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  total: number;
  warnings: string[];
}

function priceComparisonRequest(
  model: ComparisonModel,
  request: { tokens: TokenBucket },
  { cacheMode = 'provider' }: { cacheMode?: string } = {},
): RequestPriceResult {
  const t = request.tokens;
  const warnings: string[] = [];
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
      cacheRead = t.cacheRead * model.cacheRead!;
    } else {
      inputTokens += t.cacheRead;
    }

    if (hasCacheRead && hasCacheCreate) {
      cacheCreate = t.cacheCreateTotal * model.cacheCreate!;
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

export interface ComparisonTraceCostResult extends CostBreakdown {
  cacheMode: string;
  hasCache: boolean;
  hasCacheCreate: boolean;
  impossibleRequests: number;
  contextWarningCount: number;
  outputWarningCount: number;
  warnings: string[];
}

export function calculateComparisonTraceCost(
  model: ComparisonModel,
  requests: Array<{ tokens: TokenBucket }>,
  { cacheMode = 'provider' }: { cacheMode?: string } = {},
): ComparisonTraceCostResult {
  const cost = emptyCost();
  const warnings: string[] = [];
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

export function calculateComparisonNoCacheTraceCost(
  model: ComparisonModel,
  requests: Array<{ tokens: TokenBucket }>,
): ComparisonTraceCostResult {
  return calculateComparisonTraceCost(model, requests, { cacheMode: 'none' });
}

export interface AgenticRange {
  minMultiplier: number;
  maxMultiplier: number;
  min: number;
  max: number;
}

export function calculateAgenticAdjustedRange(
  _model: ComparisonModel,
  traceCost: ComparisonTraceCostResult,
  { min = 1, max = 3 }: { min?: number; max?: number } = {},
): AgenticRange {
  return {
    minMultiplier: min,
    maxMultiplier: max,
    min: traceCost.total * min,
    max: traceCost.total * max,
  };
}

export function calculateComparisonCost(
  compModel: ComparisonModel,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreateTokens: number,
): ComparisonTraceCostResult {
  const request = {
    model: 'aggregate',
    tokens: {
      input: inputTokens,
      output: outputTokens,
      cacheRead: cacheReadTokens,
      cacheCreate5m: 0,
      cacheCreate1h: 0,
      cacheCreateUnknown: cacheCreateTokens,
      cacheCreate: cacheCreateTokens,
      cacheCreateTotal: cacheCreateTokens,
    },
  };
  return calculateComparisonTraceCost(compModel, [request]);
}
