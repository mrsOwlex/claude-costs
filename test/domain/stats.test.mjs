import test from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, percentile, calculateRequestStats } from '../../domain/stats.mjs';

test('daysBetween returns 1 for same date', () => {
  assert.equal(daysBetween('2026-05-01', '2026-05-01'), 1);
});

test('daysBetween counts inclusive days', () => {
  assert.equal(daysBetween('2026-05-01', '2026-05-10'), 10);
});

test('daysBetween returns 1 for null inputs', () => {
  assert.equal(daysBetween(null, null), 1);
  assert.equal(daysBetween('2026-05-01', null), 1);
});

test('daysBetween returns minimum 1', () => {
  assert.equal(daysBetween('2026-05-10', '2026-05-01'), 1);
});

test('percentile returns 0 for empty array', () => {
  assert.equal(percentile([], 0.5), 0);
});

test('percentile returns correct p50', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
});

test('percentile returns correct p95', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(values, 0.95), 95);
});

test('percentile returns single element', () => {
  assert.equal(percentile([42], 0.5), 42);
});

test('calculateRequestStats computes averages', () => {
  const requests = [
    { tokens: { input: 100, output: 50, cacheRead: 200, cacheCreate5m: 0, cacheCreate1h: 0, cacheCreateUnknown: 0, cacheCreateTotal: 0 } },
    { tokens: { input: 200, output: 100, cacheRead: 300, cacheCreate5m: 0, cacheCreate1h: 0, cacheCreateUnknown: 0, cacheCreateTotal: 0 } },
  ];
  const stats = calculateRequestStats(requests, 1);
  assert.equal(stats.requestCount, 2);
  assert.equal(stats.requestsPerMonth, 2);
  assert.equal(stats.avgInputPerRequest, 400);
  assert.equal(stats.avgOutputPerRequest, 75);
});

test('calculateRequestStats handles empty requests', () => {
  const stats = calculateRequestStats([], 1);
  assert.equal(stats.requestCount, 0);
  assert.equal(stats.avgInputPerRequest, 0);
  assert.equal(stats.avgOutputPerRequest, 0);
});

test('calculateRequestStats computes cache ratios', () => {
  const requests = [
    { tokens: { input: 100, output: 50, cacheRead: 100, cacheCreate5m: 0, cacheCreate1h: 0, cacheCreateUnknown: 0, cacheCreateTotal: 0 } },
  ];
  const stats = calculateRequestStats(requests, 1);
  assert.equal(stats.cacheReadRatio, 0.5);
  assert.equal(stats.cacheWriteRatio, 0);
});
