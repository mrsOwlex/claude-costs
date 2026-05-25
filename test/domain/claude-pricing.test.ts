import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateClaudeRequestCost, calculateClaudeTraceCost } from '../../src/domain/claude-pricing.js';
import { CLAUDE_PRICING } from '../../src/adapters/driven/embedded-pricing.js';
import type { TokenBucket } from '../../src/contracts/tokens.js';

function makeTokenBucket(overrides: Partial<TokenBucket> = {}): TokenBucket {
  return { input: 0, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0, cacheCreateUnknown: 0, cacheCreate: 0, cacheCreateTotal: 0, ...overrides };
}

test('calculates base pricing for opus 4.6', () => {
  const cost = calculateClaudeRequestCost({
    model: 'claude-opus-4-6',
    tokens: makeTokenBucket({ input: 1_000_000 }),
  }, CLAUDE_PRICING);
  assert.equal(cost!.input, 5.00);
  assert.equal(cost!.total, 5.00);
});

test('calculates output pricing for haiku 4.5', () => {
  const cost = calculateClaudeRequestCost({
    model: 'claude-haiku-4-5',
    tokens: makeTokenBucket({ output: 1_000_000 }),
  }, CLAUDE_PRICING);
  assert.equal(cost!.output, 5.00);
});

test('cache read is 10% of input price', () => {
  const cost = calculateClaudeRequestCost({
    model: 'claude-opus-4-6',
    tokens: makeTokenBucket({ cacheRead: 1_000_000 }),
  }, CLAUDE_PRICING);
  assert.equal(cost!.cacheRead, 0.50);
});

test('5m cache write is 125% of input price', () => {
  const cost = calculateClaudeRequestCost({
    model: 'claude-opus-4-6',
    tokens: makeTokenBucket({ cacheCreate5m: 1_000_000, cacheCreateTotal: 1_000_000 }),
  }, CLAUDE_PRICING);
  assert.equal(cost!.cacheCreate5m, 6.25);
});

test('1h cache write is 200% of input price', () => {
  const cost = calculateClaudeRequestCost({
    model: 'claude-opus-4-6',
    tokens: makeTokenBucket({ cacheCreate1h: 1_000_000, cacheCreateTotal: 1_000_000 }),
  }, CLAUDE_PRICING);
  assert.equal(cost!.cacheCreate1h, 10.00);
});

test('unknown TTL uses 5m price and emits warning', () => {
  const cost = calculateClaudeRequestCost({
    model: 'claude-opus-4-6',
    tokens: makeTokenBucket({ cacheCreateUnknown: 1_000_000, cacheCreateTotal: 1_000_000 }),
  }, CLAUDE_PRICING);
  assert.equal(cost!.cacheCreateUnknown, 6.25);
  assert.ok(cost!.warnings.includes('cache-write-ttl-unknown'));
});

test('unknown model returns null', () => {
  const cost = calculateClaudeRequestCost({
    model: 'nonexistent-model',
    tokens: makeTokenBucket({ input: 100, output: 50 }),
  }, CLAUDE_PRICING);
  assert.equal(cost, null);
});

test('long-context applied per request not aggregated', () => {
  const trace = calculateClaudeTraceCost([
    { key: 'r1', messageId: null, requestId: null, timestamp: null, date: null, model: 'claude-sonnet-4-5', tokens: makeTokenBucket({ input: 150_000 }) },
    { key: 'r2', messageId: null, requestId: null, timestamp: null, date: null, model: 'claude-sonnet-4-5', tokens: makeTokenBucket({ input: 250_000 }) },
  ], CLAUDE_PRICING);
  assert.equal(trace.grandTotal, 150_000 * 3 / 1_000_000 + 250_000 * 6 / 1_000_000);
});

test('trace cost tracks unknown models', () => {
  const trace = calculateClaudeTraceCost([
    { key: 'r1', messageId: null, requestId: null, timestamp: null, date: null, model: 'unknown-model', tokens: makeTokenBucket({ input: 100, output: 50 }) },
  ], CLAUDE_PRICING);
  assert.equal(trace.unknownModels['unknown-model'], 1);
  assert.ok(trace.warnings.includes('unknown-model-pricing'));
});
