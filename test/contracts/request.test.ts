import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNonNegInt, parseUsageTokens, makeRequest } from '../../src/contracts/request.js';

test('safeNonNegInt returns 0 for string', () => {
  assert.equal(safeNonNegInt('foo'), 0);
});

test('safeNonNegInt returns 0 for negative', () => {
  assert.equal(safeNonNegInt(-5), 0);
});

test('safeNonNegInt returns 0 for Infinity', () => {
  assert.equal(safeNonNegInt(Infinity), 0);
});

test('safeNonNegInt returns 0 for NaN', () => {
  assert.equal(safeNonNegInt(NaN), 0);
});

test('safeNonNegInt returns 0 for undefined', () => {
  assert.equal(safeNonNegInt(undefined), 0);
});

test('safeNonNegInt floors valid floats', () => {
  assert.equal(safeNonNegInt(3.7), 3);
});

test('safeNonNegInt passes valid integers', () => {
  assert.equal(safeNonNegInt(42), 42);
});

test('parseUsageTokens extracts all buckets', () => {
  const tokens = parseUsageTokens({
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 200,
    cache_creation_input_tokens: 300,
    cache_creation: {
      ephemeral_5m_input_tokens: 100,
      ephemeral_1h_input_tokens: 150,
    },
  });
  assert.equal(tokens.input, 100);
  assert.equal(tokens.output, 50);
  assert.equal(tokens.cacheRead, 200);
  assert.equal(tokens.cacheCreate5m, 100);
  assert.equal(tokens.cacheCreate1h, 150);
  assert.equal(tokens.cacheCreateUnknown, 50);
  assert.equal(tokens.cacheCreateTotal, 300);
});

test('parseUsageTokens computes cacheCreateUnknown as remainder', () => {
  const tokens = parseUsageTokens({
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 500,
    cache_creation: {
      ephemeral_5m_input_tokens: 200,
      ephemeral_1h_input_tokens: 100,
    },
  });
  assert.equal(tokens.cacheCreateUnknown, 200);
  assert.equal(tokens.cacheCreateTotal, 500);
});

test('parseUsageTokens uses max of total and known sum', () => {
  const tokens = parseUsageTokens({
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 10,
    cache_creation: {
      ephemeral_5m_input_tokens: 50,
      ephemeral_1h_input_tokens: 50,
    },
  });
  assert.equal(tokens.cacheCreateTotal, 100);
  assert.equal(tokens.cacheCreateUnknown, 0);
});

test('makeRequest normalizes model and extracts date', () => {
  const req = makeRequest({
    key: 'k1',
    messageId: 'msg_1',
    requestId: 'req_1',
    timestamp: '2026-05-15T10:30:00.000Z',
    model: 'anthropic.claude-opus-4-6',
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  });
  assert.equal(req.model, 'claude-opus-4-6');
  assert.equal(req.date, '2026-05-15');
  assert.equal(req.tokens.input, 10);
});

test('makeRequest handles null timestamp', () => {
  const req = makeRequest({
    key: 'k2',
    messageId: null,
    requestId: null,
    timestamp: null,
    model: 'claude-opus-4-6',
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  });
  assert.equal(req.timestamp, null);
  assert.equal(req.date, null);
});
