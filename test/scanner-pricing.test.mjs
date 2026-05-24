import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { scanSessions } from '../lib/scanner.mjs';
import {
  calculateAgenticAdjustedRange,
  calculateClaudeRequestCost,
  calculateClaudeTraceCost,
  calculateComparisonNoCacheTraceCost,
  calculateComparisonTraceCost,
} from '../lib/pricing.mjs';
import { buildComparisons } from '../claude-costs.mjs';

function usageLine({ id, requestId, timestamp, model = 'claude-opus-4-6', usage }) {
  return JSON.stringify({
    type: 'assistant',
    timestamp,
    requestId,
    message: {
      id,
      model,
      role: 'assistant',
      usage,
    },
  });
}

function withFixture(files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'claude-costs-'));
  const project = join(root, 'projects', 'fixture-project');
  mkdirSync(project, { recursive: true });
  for (const [name, lines] of Object.entries(files)) {
    writeFileSync(join(project, name), `${lines.join('\n')}\n`);
  }
  try {
    return fn(join(root, 'projects'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('scanner globally dedupes duplicate request keys and keeps highest-token streaming checkpoint', () => {
  withFixture({
    'a.jsonl': [
      usageLine({
        id: 'msg_1',
        requestId: 'req_1',
        timestamp: '2026-05-01T10:00:00.000Z',
        usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
      usageLine({
        id: 'msg_1',
        requestId: 'req_1',
        timestamp: '2026-05-01T10:00:01.000Z',
        usage: { input_tokens: 20, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
    ],
    'b.jsonl': [
      usageLine({
        id: 'msg_1',
        requestId: 'req_1',
        timestamp: '2026-05-01T10:00:01.000Z',
        usage: { input_tokens: 20, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
    ],
  }, (projectDirs) => {
    const result = scanSessions({ from: '2026-05-01', to: '2026-05-01', projectDirs: [projectDirs] });
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].tokens.input, 20);
    assert.equal(result.requests[0].tokens.output, 2);
    assert.equal(result.meta.totalRawEntries, 3);
    assert.equal(result.meta.totalFileEntries, 2);
    assert.equal(result.meta.duplicateRequests, 1);
    assert.equal(result.meta.conflictRequests, 0);
  });
});

test('scanner preserves 5m and 1h cache creation token split', () => {
  withFixture({
    'cache.jsonl': [
      usageLine({
        id: 'msg_cache',
        requestId: 'req_cache',
        timestamp: '2026-05-02T10:00:00.000Z',
        usage: {
          input_tokens: 5,
          output_tokens: 7,
          cache_read_input_tokens: 11,
          cache_creation_input_tokens: 125,
          cache_creation: {
            ephemeral_5m_input_tokens: 25,
            ephemeral_1h_input_tokens: 100,
          },
        },
      }),
    ],
  }, (projectDirs) => {
    const result = scanSessions({ from: '2026-05-02', to: '2026-05-02', projectDirs: [projectDirs] });
    assert.equal(result.requests[0].tokens.cacheCreate5m, 25);
    assert.equal(result.requests[0].tokens.cacheCreate1h, 100);
    assert.equal(result.requests[0].tokens.cacheCreateUnknown, 0);
    assert.equal(result.totals.cacheCreateTotal, 125);
  });
});

test('Claude request cost uses 1h cache write pricing', () => {
  const cost = calculateClaudeRequestCost({
    model: 'claude-opus-4-6',
    tokens: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreate5m: 0,
      cacheCreate1h: 1_000_000,
      cacheCreateUnknown: 0,
      cacheCreateTotal: 1_000_000,
    },
  });

  assert.equal(cost.total, 10);
  assert.equal(cost.cacheCreate1h, 10);
});

test('Sonnet 4.5 long-context premium is applied per request', () => {
  const trace = calculateClaudeTraceCost([
    {
      model: 'claude-sonnet-4-5',
      tokens: { input: 199_000, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0, cacheCreateUnknown: 0, cacheCreateTotal: 0 },
    },
    {
      model: 'claude-sonnet-4-5',
      tokens: { input: 201_000, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0, cacheCreateUnknown: 0, cacheCreateTotal: 0 },
    },
  ]);

  assert.equal(trace.grandTotal, 199_000 * 3 / 1_000_000 + 201_000 * 6 / 1_000_000);
  assert.deepEqual(trace.warnings, ['long-context-pricing']);
});

test('Sonnet 4.6 does not receive 200K long-context premium', () => {
  const cost = calculateClaudeRequestCost({
    model: 'claude-sonnet-4-6',
    tokens: { input: 250_000, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0, cacheCreateUnknown: 0, cacheCreateTotal: 0 },
  });

  assert.equal(cost.total, 0.75);
  assert.equal(cost.longContext, false);
});

test('comparison models without cache collapse cache tokens into regular input', () => {
  const cost = calculateComparisonTraceCost(
    { id: 'no-cache', name: 'No Cache', input: 1 / 1_000_000, output: 10 / 1_000_000, cacheRead: null, cacheCreate: null },
    [{
      model: 'claude-opus-4-6',
      tokens: { input: 100, output: 10, cacheRead: 1_000, cacheCreate5m: 500, cacheCreate1h: 1_500, cacheCreateUnknown: 0, cacheCreateTotal: 2_000 },
    }],
  );

  assert.ok(Math.abs(cost.total - (3_100 * 1 + 10 * 10) / 1_000_000) < 1e-12);
  assert.equal(cost.hasCache, false);
});

test('provider cache mode uses cache prices when available', () => {
  const cost = calculateComparisonTraceCost(
    { id: 'cache', name: 'Cache', input: 1 / 1_000_000, output: 10 / 1_000_000, cacheRead: 0.1 / 1_000_000, cacheCreate: 0.5 / 1_000_000 },
    [{
      model: 'claude-opus-4-6',
      tokens: { input: 100, output: 10, cacheRead: 1_000, cacheCreate5m: 500, cacheCreate1h: 1_500, cacheCreateUnknown: 0, cacheCreateTotal: 2_000 },
    }],
  );

  assert.ok(Math.abs(cost.total - (100 * 1 + 10 * 10 + 1_000 * 0.1 + 2_000 * 0.5) / 1_000_000) < 1e-12);
  assert.deepEqual(cost.warnings, []);
});

test('no-cache comparison mode ignores cache prices', () => {
  const cost = calculateComparisonNoCacheTraceCost(
    { id: 'cache', name: 'Cache', input: 1 / 1_000_000, output: 10 / 1_000_000, cacheRead: 0.1 / 1_000_000, cacheCreate: 0.5 / 1_000_000 },
    [{
      model: 'claude-opus-4-6',
      tokens: { input: 100, output: 10, cacheRead: 1_000, cacheCreate5m: 500, cacheCreate1h: 1_500, cacheCreateUnknown: 0, cacheCreateTotal: 2_000 },
    }],
  );

  assert.ok(Math.abs(cost.total - (3_100 * 1 + 10 * 10) / 1_000_000) < 1e-12);
  assert.deepEqual(cost.warnings, ['cache-disabled-scenario']);
});

test('context limit warnings do not invalidate comparison cost', () => {
  const cost = calculateComparisonTraceCost(
    { id: 'small', name: 'Small Context', input: 1 / 1_000_000, output: 10 / 1_000_000, cacheRead: null, cacheCreate: null, contextLength: 1_000 },
    [{
      model: 'claude-opus-4-6',
      tokens: { input: 100, output: 10, cacheRead: 1_000, cacheCreate5m: 0, cacheCreate1h: 0, cacheCreateUnknown: 0, cacheCreateTotal: 0 },
    }],
  );

  assert.ok(cost.total > 0);
  assert.deepEqual(cost.warnings, ['context-limit-exceeded']);
  assert.equal(cost.contextWarningCount, 1);
  assert.equal(cost.impossibleRequests, 1);
});

test('partial cache pricing remains distinct from no-cache scenario', () => {
  const model = { id: 'partial', name: 'Partial Cache', input: 1 / 1_000_000, output: 10 / 1_000_000, cacheRead: 0.1 / 1_000_000, cacheCreate: null };
  const requests = [{
    model: 'claude-opus-4-6',
    tokens: { input: 100, output: 10, cacheRead: 1_000, cacheCreate5m: 500, cacheCreate1h: 1_500, cacheCreateUnknown: 0, cacheCreateTotal: 2_000 },
  }];

  const provider = calculateComparisonTraceCost(model, requests);
  const noCache = calculateComparisonNoCacheTraceCost(model, requests);

  assert.deepEqual(provider.warnings, ['partial-cache-pricing']);
  assert.deepEqual(noCache.warnings, ['cache-disabled-scenario']);
});

test('comparison builder exposes no-cache monthly cost and keeps context-limited models', () => {
  const { comparisons } = buildComparisons(
    [{ id: 'small', name: 'Small Context', input: 1 / 1_000_000, output: 10 / 1_000_000, cacheRead: 0.1 / 1_000_000, cacheCreate: 0.5 / 1_000_000, contextLength: 1_000 }],
    [{
      model: 'claude-opus-4-6',
      tokens: { input: 100, output: 10, cacheRead: 1_000, cacheCreate5m: 500, cacheCreate1h: 1_500, cacheCreateUnknown: 0, cacheCreateTotal: 2_000 },
    }],
    { agenticMultiplier: { min: 1, max: 3 }, comparison: 'both', budget: 100 },
    1,
  );

  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0].contextWarningCount, 1);
  assert.ok(comparisons[0].monthlyNoCacheCost > comparisons[0].monthlyTraceCost);
});

test('agentic multiplier changes only the scenario range, not same-trace cost', () => {
  const traceCost = { total: 10 };
  const range = calculateAgenticAdjustedRange(
    { id: 'model', name: 'Model' },
    traceCost,
    { min: 1.5, max: 2.5 },
  );

  assert.equal(traceCost.total, 10);
  assert.deepEqual(range, {
    minMultiplier: 1.5,
    maxMultiplier: 2.5,
    min: 15,
    max: 25,
  });
});
