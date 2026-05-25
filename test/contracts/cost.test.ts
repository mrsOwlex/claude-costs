import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCost, addCost, addWarning } from '../../src/contracts/cost.js';
import type { CostBreakdown } from '../../src/contracts/cost.js';

test('emptyCost returns all-zero cost', () => {
  const cost = emptyCost();
  assert.deepEqual(cost, {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheCreateUnknown: 0,
    cacheCreate: 0,
    total: 0,
  });
});

test('addCost accumulates correctly', () => {
  const target = emptyCost();
  addCost(target, { input: 1, output: 2, cacheRead: 3, cacheCreate5m: 4, cacheCreate1h: 5, cacheCreateUnknown: 6, cacheCreate: 7, total: 28 });
  assert.equal(target.input, 1);
  assert.equal(target.output, 2);
  assert.equal(target.cacheRead, 3);
  assert.equal(target.cacheCreate5m, 4);
  assert.equal(target.cacheCreate1h, 5);
  assert.equal(target.cacheCreateUnknown, 6);
  assert.equal(target.cacheCreate, 7);
  assert.equal(target.total, 28);
});

test('addCost handles missing fields gracefully', () => {
  const target = emptyCost();
  addCost(target, { input: 5, total: 5 } as CostBreakdown);
  assert.equal(target.input, 5);
  assert.equal(target.output, 0);
  assert.equal(target.total, 5);
});

test('addWarning deduplicates warnings', () => {
  const warnings: string[] = [];
  addWarning(warnings, 'test-warning');
  addWarning(warnings, 'test-warning');
  addWarning(warnings, 'other-warning');
  assert.deepEqual(warnings, ['test-warning', 'other-warning']);
});

test('addWarning adds unique warnings', () => {
  const warnings = ['existing'];
  addWarning(warnings, 'new');
  assert.deepEqual(warnings, ['existing', 'new']);
});
