import type { ClaudePricingRates, ComparisonModel } from '../../contracts/pricing-model.js';
import { claudeRates, perM } from '../../domain/claude-pricing.js';

export const CLAUDE_PRICING: Record<string, ClaudePricingRates> = {
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

const COMPARISON_MODELS: ComparisonModel[] = [
  { id: 'openai/gpt-5.5', name: 'GPT-5.5', input: perM(5.00), output: perM(30.00), cacheRead: null, cacheCreate: null },
  { id: 'openai/gpt-5.5-pro', name: 'GPT-5.5 Pro', input: perM(30.00), output: perM(180.00), cacheRead: null, cacheCreate: null },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', input: perM(2.50), output: perM(15.00), cacheRead: perM(0.25), cacheCreate: perM(3.125) },
  { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini', input: perM(0.75), output: perM(4.50), cacheRead: perM(0.075), cacheCreate: perM(0.9375) },
  { id: 'openai/gpt-5.4-nano', name: 'GPT-5.4 Nano', input: perM(0.20), output: perM(1.25), cacheRead: perM(0.02), cacheCreate: perM(0.25) },
  { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash', input: perM(1.50), output: perM(9.00), cacheRead: null, cacheCreate: null },
  { id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', input: perM(0.25), output: perM(1.50), cacheRead: null, cacheCreate: null },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', input: perM(0.435), output: perM(0.87), cacheRead: perM(0.004), cacheCreate: perM(0.544) },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', input: perM(0.10), output: perM(0.20), cacheRead: perM(0.02), cacheCreate: perM(0.125) },
  { id: 'qwen/qwen3.7-max', name: 'Qwen 3.7 Max', input: perM(2.50), output: perM(7.50), cacheRead: null, cacheCreate: null },
  { id: 'qwen/qwen3.6-max-preview', name: 'Qwen 3.6 Max', input: perM(1.04), output: perM(6.24), cacheRead: null, cacheCreate: null },
  { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', input: perM(0.73), output: perM(3.49), cacheRead: perM(0.25), cacheCreate: perM(0.9125) },
  { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7 (API)', input: perM(5.00), output: perM(25.00), cacheRead: perM(0.50), cacheCreate: perM(6.25) },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6 (API)', input: perM(3.00), output: perM(15.00), cacheRead: perM(0.30), cacheCreate: perM(3.75) },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5 (API)', input: perM(1.00), output: perM(5.00), cacheRead: perM(0.10), cacheCreate: perM(1.25) },
];

export function getComparisonModels(): ComparisonModel[] {
  return COMPARISON_MODELS.map(m => ({ ...m }));
}

export { COMPARISON_MODELS };
