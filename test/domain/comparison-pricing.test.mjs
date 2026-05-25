import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateComparisonTraceCost, calculateComparisonNoCacheTraceCost, calculateAgenticAdjustedRange } from '../../domain/comparison-pricing.mjs';

const TOKENS = { input: 100, output: 10, cacheRead: 1_000, cacheCreate5m: 500, cacheCreate1h: 1_500, cacheCreateUnknown: 0, cacheCreateTotal: 2_000 };
const REQUEST = { model: 'test', tokens: TOKENS };

test('provider cache mode uses both cache read and write prices', () => {
  const model = { id: 'full', name: 'Full Cache', input: 1e-6, output: 10e-6, cacheRead: 0.1e-6, cacheCreate: 0.5e-6 };
  const cost = calculateComparisonTraceCost(model, [REQUEST]);
  const expected = (100 * 1 + 10 * 10 + 1_000 * 0.1 + 2_000 * 0.5) / 1_000_000;
  assert.ok(Math.abs(cost.total - expected) < 1e-12);
  assert.equal(cost.hasCache, true);
  assert.equal(cost.hasCacheCreate, true);
});

test('partial cache mode prices reads but bills writes as input', () => {
  const model = { id: 'partial', name: 'Partial', input: 1e-6, output: 10e-6, cacheRead: 0.1e-6, cacheCreate: null };
  const cost = calculateComparisonTraceCost(model, [REQUEST]);
  assert.ok(cost.warnings.includes('partial-cache-pricing'));
  assert.equal(cost.hasCache, true);
  assert.equal(cost.hasCacheCreate, false);
});

test('no-cache mode bills everything as regular input', () => {
  const model = { id: 'full', name: 'Full', input: 1e-6, output: 10e-6, cacheRead: 0.1e-6, cacheCreate: 0.5e-6 };
  const cost = calculateComparisonNoCacheTraceCost(model, [REQUEST]);
  const expected = (3_100 * 1 + 10 * 10) / 1_000_000;
  assert.ok(Math.abs(cost.total - expected) < 1e-12);
  assert.ok(cost.warnings.includes('cache-disabled-scenario'));
});

test('model without any cache prices collapses cache into input', () => {
  const model = { id: 'none', name: 'No Cache', input: 1e-6, output: 10e-6, cacheRead: null, cacheCreate: null };
  const cost = calculateComparisonTraceCost(model, [REQUEST]);
  assert.equal(cost.hasCache, false);
  assert.equal(cost.hasCacheCreate, false);
});

test('context limit exceeded emits warning', () => {
  const model = { id: 'small', name: 'Small', input: 1e-6, output: 10e-6, cacheRead: null, cacheCreate: null, contextLength: 500 };
  const cost = calculateComparisonTraceCost(model, [REQUEST]);
  assert.ok(cost.warnings.includes('context-limit-exceeded'));
  assert.equal(cost.contextWarningCount, 1);
});

test('output limit exceeded emits warning', () => {
  const model = { id: 'limited', name: 'Limited', input: 1e-6, output: 10e-6, cacheRead: null, cacheCreate: null, maxOutputTokens: 5 };
  const cost = calculateComparisonTraceCost(model, [REQUEST]);
  assert.ok(cost.warnings.includes('output-limit-exceeded'));
  assert.equal(cost.outputWarningCount, 1);
});

test('agentic range multiplier preserves original cost', () => {
  const traceCost = { total: 100 };
  const range = calculateAgenticAdjustedRange({}, traceCost, { min: 2, max: 5 });
  assert.equal(traceCost.total, 100);
  assert.equal(range.min, 200);
  assert.equal(range.max, 500);
  assert.equal(range.minMultiplier, 2);
  assert.equal(range.maxMultiplier, 5);
});

test('agentic range defaults to 1x-3x', () => {
  const range = calculateAgenticAdjustedRange({}, { total: 10 });
  assert.equal(range.min, 10);
  assert.equal(range.max, 30);
});
