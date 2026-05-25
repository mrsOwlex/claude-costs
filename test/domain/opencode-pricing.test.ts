import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOpencodeRequestCost, calculateOpencodeTraceCost } from '../../src/domain/opencode-pricing.js';
import type { OpencodePricingRates } from '../../src/domain/opencode-pricing.js';
import type { Request } from '../../src/contracts/request.js';
import type { TokenBucket } from '../../src/contracts/tokens.js';

const perM = (usd: number) => usd / 1_000_000;

const PRICING: Record<string, OpencodePricingRates> = {
  'openai/gpt-5.5': { input: perM(5.00), output: perM(30.00) },
  'openai/gpt-5.4': { input: perM(2.50), output: perM(15.00), cacheRead: perM(0.25), cacheWrite: perM(3.125) },
};

function makeTokens(input: number, output: number, reasoning = 0, cacheRead = 0, cacheWrite = 0): TokenBucket {
  return {
    input, output, reasoning, cacheRead,
    cacheCreate5m: 0, cacheCreate1h: 0,
    cacheCreateUnknown: cacheWrite, cacheCreate: cacheWrite, cacheCreateTotal: cacheWrite,
  };
}

test('calculates cost for known opencode model', () => {
  const cost = calculateOpencodeRequestCost(
    { model: 'openai/gpt-5.5', tokens: makeTokens(1_000_000, 100_000) },
    PRICING,
  );
  assert.ok(cost);
  assert.ok(Math.abs(cost.input - 5.00) < 1e-10);
  assert.ok(Math.abs(cost.output - 3.00) < 1e-10);
});

test('returns null for unknown model', () => {
  const cost = calculateOpencodeRequestCost(
    { model: 'unknown/model', tokens: makeTokens(100, 100) },
    PRICING,
  );
  assert.equal(cost, null);
});

test('reasoning tokens priced at output rate when no reasoning rate', () => {
  const cost = calculateOpencodeRequestCost(
    { model: 'openai/gpt-5.5', tokens: makeTokens(0, 0, 1_000_000) },
    PRICING,
  );
  assert.ok(cost);
  assert.ok(Math.abs(cost.output - 30.00) < 1e-10);
});

test('cache tokens use model cache rates when available', () => {
  const cost = calculateOpencodeRequestCost(
    { model: 'openai/gpt-5.4', tokens: makeTokens(0, 0, 0, 1_000_000, 1_000_000) },
    PRICING,
  );
  assert.ok(cost);
  assert.ok(Math.abs(cost.cacheRead - 0.25) < 1e-10);
  assert.ok(Math.abs(cost.cacheCreate - 3.125) < 1e-10);
});

test('trace cost aggregates across requests', () => {
  const requests: Request[] = [
    { key: 'k1', messageId: null, requestId: null, timestamp: null, date: null, model: 'openai/gpt-5.5', tokens: makeTokens(1_000_000, 100_000), source: 'opencode' },
    { key: 'k2', messageId: null, requestId: null, timestamp: null, date: null, model: 'openai/gpt-5.5', tokens: makeTokens(500_000, 50_000), source: 'opencode' },
  ];
  const result = calculateOpencodeTraceCost(requests, PRICING);
  assert.ok(Math.abs(result.grandTotal - (5.0 + 3.0 + 2.5 + 1.5)) < 1e-10);
});

test('trace cost tracks unknown models', () => {
  const requests: Request[] = [
    { key: 'k1', messageId: null, requestId: null, timestamp: null, date: null, model: 'unknown/model', tokens: makeTokens(100, 100), source: 'opencode' },
  ];
  const result = calculateOpencodeTraceCost(requests, PRICING);
  assert.equal(result.grandTotal, 0);
  assert.equal(result.unknownModels['unknown/model'], 1);
  assert.deepEqual(result.warnings, ['unknown-model-pricing']);
});
