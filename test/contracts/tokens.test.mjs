import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, addTokens } from '../../contracts/tokens.mjs';

test('createTokenBucket returns all-zero bucket', () => {
  const bucket = createTokenBucket();
  assert.deepEqual(bucket, {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheCreateUnknown: 0,
    cacheCreate: 0,
    cacheCreateTotal: 0,
  });
});

test('addTokens accumulates correctly', () => {
  const target = createTokenBucket();
  addTokens(target, {
    input: 10,
    output: 5,
    cacheRead: 3,
    cacheCreate5m: 2,
    cacheCreate1h: 4,
    cacheCreateUnknown: 1,
    cacheCreateTotal: 7,
  });
  assert.equal(target.input, 10);
  assert.equal(target.output, 5);
  assert.equal(target.cacheRead, 3);
  assert.equal(target.cacheCreate5m, 2);
  assert.equal(target.cacheCreate1h, 4);
  assert.equal(target.cacheCreateUnknown, 1);
  assert.equal(target.cacheCreate, 7);
  assert.equal(target.cacheCreateTotal, 7);
});

test('addTokens accumulates across multiple calls', () => {
  const target = createTokenBucket();
  const tokens = { input: 5, output: 3, cacheRead: 1, cacheCreate5m: 0, cacheCreate1h: 0, cacheCreateUnknown: 0, cacheCreateTotal: 0 };
  addTokens(target, tokens);
  addTokens(target, tokens);
  assert.equal(target.input, 10);
  assert.equal(target.output, 6);
  assert.equal(target.cacheRead, 2);
});
