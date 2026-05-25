import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseArgs } from '../src/adapters/driving/cli.js';
import { scanSessions } from '../src/adapters/driven/filesystem-session-source.js';

// --- args validation ---

test('rejects invalid month 2026-13', () => {
  assert.throws(() => parseArgs(['--month', '2026-13']), /invalid month/);
});

test('rejects invalid month 2026-00', () => {
  assert.throws(() => parseArgs(['--month', '2026-00']), /invalid month/);
});

test('rejects invalid date --from 2026-02-31', () => {
  assert.throws(() => parseArgs(['--from', '2026-02-31']), /invalid date/);
});

test('rejects invalid date --to 2026-04-31', () => {
  assert.throws(() => parseArgs(['--to', '2026-04-31']), /invalid date/);
});

test('rejects Infinity budget', () => {
  assert.throws(() => parseArgs(['--budget', 'Infinity']), /finite non-negative/);
});

test('rejects NaN budget', () => {
  assert.throws(() => parseArgs(['--budget', 'NaN']), /expects a number/);
});

test('rejects negative budget', () => {
  assert.throws(() => parseArgs(['--budget', '-5']), /finite non-negative/);
});

test('accepts valid month 2026-01', () => {
  const args = parseArgs(['--month', '2026-01']);
  assert.equal(args.from, '2026-01-01');
  assert.equal(args.to, '2026-01-31');
});

test('accepts valid date 2024-02-29 (leap year)', () => {
  const args = parseArgs(['--from', '2024-02-29', '--to', '2024-03-01']);
  assert.equal(args.from, '2024-02-29');
});

test('rejects invalid date 2025-02-29 (non-leap year)', () => {
  assert.throws(() => parseArgs(['--from', '2025-02-29']), /invalid date/);
});

// --- scanner validation ---

interface UsageLineParams {
  id: string;
  requestId: string;
  timestamp: string;
  model?: string;
  usage: Record<string, unknown>;
}

function usageLine({ id, requestId, timestamp, model = 'claude-opus-4-6', usage }: UsageLineParams): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp,
    requestId,
    message: { id, model, role: 'assistant', usage },
  });
}

function withFixture(files: Record<string, string[]>, fn: (projectDirs: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'claude-costs-val-'));
  const project = join(root, 'projects', 'fixture-project');
  mkdirSync(project, { recursive: true });
  for (const [name, lines] of Object.entries(files)) {
    writeFileSync(join(project, name), `${lines.join('\n')}\n`);
  }
  try {
    fn(join(root, 'projects'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('scanner treats string token values as zero', () => {
  withFixture({
    'bad.jsonl': [
      usageLine({
        id: 'msg_bad',
        requestId: 'req_bad',
        timestamp: '2026-05-01T10:00:00.000Z',
        usage: { input_tokens: 'foo', output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
    ],
  }, (projectDirs) => {
    const result = scanSessions({ from: '2026-05-01', to: '2026-05-01', projectDirs: [projectDirs] });
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0]!.tokens.input, 0);
    assert.equal(result.requests[0]!.tokens.output, 10);
  });
});

test('scanner treats negative token values as zero', () => {
  withFixture({
    'neg.jsonl': [
      usageLine({
        id: 'msg_neg',
        requestId: 'req_neg',
        timestamp: '2026-05-01T10:00:00.000Z',
        usage: { input_tokens: -100, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
    ],
  }, (projectDirs) => {
    const result = scanSessions({ from: '2026-05-01', to: '2026-05-01', projectDirs: [projectDirs] });
    assert.equal(result.requests[0]!.tokens.input, 0);
    assert.equal(result.requests[0]!.tokens.output, 5);
  });
});

test('scanner handles non-string model without crash', () => {
  withFixture({
    'model.jsonl': [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-05-01T10:00:00.000Z',
        requestId: 'req_m',
        message: {
          id: 'msg_m',
          model: 123,
          role: 'assistant',
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }),
    ],
  }, (projectDirs) => {
    const result = scanSessions({ from: '2026-05-01', to: '2026-05-01', projectDirs: [projectDirs] });
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0]!.model, 'unknown');
  });
});

test('scanner skips undated entries when date filter is active', () => {
  withFixture({
    'undated.jsonl': [
      usageLine({
        id: 'msg_dated',
        requestId: 'req_dated',
        timestamp: '2026-05-01T10:00:00.000Z',
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
      JSON.stringify({
        type: 'assistant',
        requestId: 'req_undated',
        message: {
          id: 'msg_undated',
          model: 'claude-opus-4-6',
          role: 'assistant',
          usage: { input_tokens: 99, output_tokens: 99, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }),
    ],
  }, (projectDirs) => {
    const result = scanSessions({ from: '2026-05-01', to: '2026-05-01', projectDirs: [projectDirs] });
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0]!.tokens.input, 10);
    assert.equal(result.meta.undatedSkipped, 1);
  });
});

test('scanner includes undated entries when no date filter is used', () => {
  withFixture({
    'undated.jsonl': [
      JSON.stringify({
        type: 'assistant',
        requestId: 'req_undated',
        message: {
          id: 'msg_undated',
          model: 'claude-opus-4-6',
          role: 'assistant',
          usage: { input_tokens: 42, output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }),
    ],
  }, (projectDirs) => {
    const result = scanSessions({ projectDirs: [projectDirs] });
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0]!.tokens.input, 42);
  });
});

test('scanner handles Infinity token values as zero', () => {
  withFixture({
    'inf.jsonl': [
      usageLine({
        id: 'msg_inf',
        requestId: 'req_inf',
        timestamp: '2026-05-01T10:00:00.000Z',
        usage: { input_tokens: Infinity, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
    ],
  }, (projectDirs) => {
    const result = scanSessions({ from: '2026-05-01', to: '2026-05-01', projectDirs: [projectDirs] });
    assert.equal(result.requests[0]!.tokens.input, 0);
    assert.equal(result.requests[0]!.tokens.output, 5);
  });
});
