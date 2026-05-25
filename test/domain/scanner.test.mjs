import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRequestEntry, tokensEqual, totalRequestTokens, deduplicateAndAggregate } from '../../domain/scanner.mjs';

function makeTokens(input, output = 0, cacheRead = 0, cacheCreateTotal = 0) {
  return {
    input,
    output,
    cacheRead,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheCreateUnknown: 0,
    cacheCreateTotal,
  };
}

function makeReq(key, input, timestamp = null) {
  return {
    key,
    messageId: null,
    requestId: null,
    timestamp,
    date: timestamp ? timestamp.slice(0, 10) : null,
    model: 'claude-opus-4-6',
    tokens: makeTokens(input),
  };
}

test('chooseRequestEntry picks higher token count', () => {
  const a = makeReq('k1', 10);
  const b = makeReq('k1', 20);
  assert.equal(chooseRequestEntry(a, b), b);
  assert.equal(chooseRequestEntry(b, a), b);
});

test('chooseRequestEntry picks later entry on tie', () => {
  const a = makeReq('k1', 10, '2026-05-01T10:00:00Z');
  const b = makeReq('k1', 10, '2026-05-01T10:00:01Z');
  assert.equal(chooseRequestEntry(a, b), b);
});

test('chooseRequestEntry returns next when current is undefined', () => {
  const b = makeReq('k1', 10);
  assert.equal(chooseRequestEntry(undefined, b), b);
});

test('totalRequestTokens sums all four fields', () => {
  const req = { tokens: makeTokens(10, 5, 3, 2) };
  assert.equal(totalRequestTokens(req), 20);
});

test('tokensEqual returns true for identical buckets', () => {
  const a = makeTokens(10, 5, 3);
  const b = makeTokens(10, 5, 3);
  assert.equal(tokensEqual(a, b), true);
});

test('tokensEqual returns false for differing buckets', () => {
  const a = makeTokens(10, 5, 3);
  const b = makeTokens(10, 5, 4);
  assert.equal(tokensEqual(a, b), false);
});

test('deduplicateAndAggregate merges multiple file maps', () => {
  const map1 = new Map([['k1', makeReq('k1', 10, '2026-05-01T10:00:00Z')]]);
  const map2 = new Map([['k2', makeReq('k2', 20, '2026-05-01T11:00:00Z')]]);
  const result = deduplicateAndAggregate([map1, map2]);
  assert.equal(result.requests.length, 2);
  assert.equal(result.totals.input, 30);
});

test('deduplicateAndAggregate deduplicates across file maps', () => {
  const map1 = new Map([['k1', makeReq('k1', 10, '2026-05-01T10:00:00Z')]]);
  const map2 = new Map([['k1', makeReq('k1', 20, '2026-05-01T10:00:01Z')]]);
  const result = deduplicateAndAggregate([map1, map2]);
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].tokens.input, 20);
  assert.equal(result.meta.duplicateRequests, 1);
});

test('deduplicateAndAggregate respects date filter', () => {
  const map1 = new Map([
    ['k1', makeReq('k1', 10, '2026-05-01T10:00:00Z')],
    ['k2', makeReq('k2', 20, '2026-05-02T10:00:00Z')],
  ]);
  const result = deduplicateAndAggregate([map1], { from: '2026-05-02', to: '2026-05-02' });
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].key, 'k2');
});

test('deduplicateAndAggregate skips synthetic models', () => {
  const map1 = new Map([
    ['k1', { ...makeReq('k1', 10), model: 'synthetic' }],
    ['k2', makeReq('k2', 20, '2026-05-01T10:00:00Z')],
  ]);
  const result = deduplicateAndAggregate([map1]);
  assert.equal(result.requests.length, 1);
});

test('deduplicateAndAggregate aggregates by model', () => {
  const req1 = { ...makeReq('k1', 10, '2026-05-01T10:00:00Z'), model: 'claude-opus-4-6' };
  const req2 = { ...makeReq('k2', 5, '2026-05-01T11:00:00Z'), model: 'claude-haiku-4-5' };
  const map1 = new Map([['k1', req1], ['k2', req2]]);
  const result = deduplicateAndAggregate([map1]);
  assert.equal(result.byModel['claude-opus-4-6'].input, 10);
  assert.equal(result.byModel['claude-haiku-4-5'].input, 5);
});
