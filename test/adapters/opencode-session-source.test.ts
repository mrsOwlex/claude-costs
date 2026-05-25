import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { scanOpencodeSessions } from '../../src/adapters/driven/opencode-session-source.js';

function createTestDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      data TEXT NOT NULL
    )
  `);
  return db;
}

function insertMessage(db: Database.Database, opts: {
  id: string;
  sessionId: string;
  modelID?: string;
  providerID?: string;
  tokensInput?: number;
  tokensOutput?: number;
  tokensReasoning?: number;
  tokensCacheRead?: number;
  tokensCacheWrite?: number;
  timeCreated?: number;
  role?: string;
}): void {
  const data = JSON.stringify({
    role: opts.role ?? 'assistant',
    modelID: opts.modelID ?? 'gpt-5.5',
    providerID: opts.providerID ?? 'openai',
    tokens: {
      input: opts.tokensInput ?? 100,
      output: opts.tokensOutput ?? 50,
      reasoning: opts.tokensReasoning ?? 0,
      cache: {
        read: opts.tokensCacheRead ?? 0,
        write: opts.tokensCacheWrite ?? 0,
      },
    },
    time: {
      created: opts.timeCreated ?? new Date('2026-05-20T10:00:00Z').getTime(),
    },
  });
  db.prepare('INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)').run(opts.id, opts.sessionId, data);
}

function withTestDb(fn: (dbPath: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'agent-costs-oc-'));
  const dbPath = join(dir, 'opencode.db');
  try {
    fn(dbPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('scanOpencodeSessions returns empty result when DB does not exist', () => {
  const original = process.env['OPENCODE_DATA_DIR'];
  process.env['OPENCODE_DATA_DIR'] = '/nonexistent/path';
  try {
    const result = scanOpencodeSessions();
    assert.equal(result.requests.length, 0);
    assert.equal(result.meta.source, 'opencode');
  } finally {
    if (original !== undefined) process.env['OPENCODE_DATA_DIR'] = original;
    else delete process.env['OPENCODE_DATA_DIR'];
  }
});

test('scanOpencodeSessions reads messages from SQLite', () => {
  withTestDb((dbPath) => {
    const db = createTestDb(dbPath);
    insertMessage(db, { id: 'msg1', sessionId: 'sess1', tokensInput: 200, tokensOutput: 30, tokensReasoning: 10 });
    insertMessage(db, { id: 'msg2', sessionId: 'sess1', tokensInput: 100, tokensOutput: 50 });
    db.close();

    const original = process.env['OPENCODE_DATA_DIR'];
    process.env['OPENCODE_DATA_DIR'] = dbPath.replace('/opencode.db', '');
    try {
      const result = scanOpencodeSessions();
      assert.equal(result.requests.length, 2);
      assert.equal(result.requests[0]!.source, 'opencode');
      assert.equal(result.totals.input, 300);
      assert.equal(result.totals.output, 80);
      assert.equal(result.totals.reasoning, 10);
    } finally {
      if (original !== undefined) process.env['OPENCODE_DATA_DIR'] = original;
      else delete process.env['OPENCODE_DATA_DIR'];
    }
  });
});

test('scanOpencodeSessions skips user role messages', () => {
  withTestDb((dbPath) => {
    const db = createTestDb(dbPath);
    insertMessage(db, { id: 'msg1', sessionId: 'sess1', role: 'user', tokensOutput: 50 });
    insertMessage(db, { id: 'msg2', sessionId: 'sess1', role: 'assistant', tokensOutput: 30 });
    db.close();

    const original = process.env['OPENCODE_DATA_DIR'];
    process.env['OPENCODE_DATA_DIR'] = dbPath.replace('/opencode.db', '');
    try {
      const result = scanOpencodeSessions();
      assert.equal(result.requests.length, 1);
      assert.equal(result.requests[0]!.key, 'opencode:msg2');
    } finally {
      if (original !== undefined) process.env['OPENCODE_DATA_DIR'] = original;
      else delete process.env['OPENCODE_DATA_DIR'];
    }
  });
});

test('scanOpencodeSessions applies date filter', () => {
  withTestDb((dbPath) => {
    const db = createTestDb(dbPath);
    insertMessage(db, { id: 'msg1', sessionId: 'sess1', timeCreated: new Date('2026-05-19T10:00:00Z').getTime() });
    insertMessage(db, { id: 'msg2', sessionId: 'sess1', timeCreated: new Date('2026-05-20T10:00:00Z').getTime() });
    insertMessage(db, { id: 'msg3', sessionId: 'sess1', timeCreated: new Date('2026-05-21T10:00:00Z').getTime() });
    db.close();

    const original = process.env['OPENCODE_DATA_DIR'];
    process.env['OPENCODE_DATA_DIR'] = dbPath.replace('/opencode.db', '');
    try {
      const result = scanOpencodeSessions({ from: '2026-05-20', to: '2026-05-20' });
      assert.equal(result.requests.length, 1);
      assert.equal(result.requests[0]!.key, 'opencode:msg2');
    } finally {
      if (original !== undefined) process.env['OPENCODE_DATA_DIR'] = original;
      else delete process.env['OPENCODE_DATA_DIR'];
    }
  });
});

test('scanOpencodeSessions normalizes model names', () => {
  withTestDb((dbPath) => {
    const db = createTestDb(dbPath);
    insertMessage(db, { id: 'msg1', sessionId: 'sess1', modelID: 'glm-5.1', providerID: 'zai-coding-plan' });
    db.close();

    const original = process.env['OPENCODE_DATA_DIR'];
    process.env['OPENCODE_DATA_DIR'] = dbPath.replace('/opencode.db', '');
    try {
      const result = scanOpencodeSessions();
      assert.equal(result.requests[0]!.model, 'zai-coding-plan/glm-5.1');
    } finally {
      if (original !== undefined) process.env['OPENCODE_DATA_DIR'] = original;
      else delete process.env['OPENCODE_DATA_DIR'];
    }
  });
});

test('scanOpencodeSessions skips messages with zero output tokens', () => {
  withTestDb((dbPath) => {
    const db = createTestDb(dbPath);
    insertMessage(db, { id: 'msg1', sessionId: 'sess1', tokensOutput: 0 });
    insertMessage(db, { id: 'msg2', sessionId: 'sess1', tokensOutput: 10 });
    db.close();

    const original = process.env['OPENCODE_DATA_DIR'];
    process.env['OPENCODE_DATA_DIR'] = dbPath.replace('/opencode.db', '');
    try {
      const result = scanOpencodeSessions();
      assert.equal(result.requests.length, 1);
      assert.equal(result.requests[0]!.key, 'opencode:msg2');
    } finally {
      if (original !== undefined) process.env['OPENCODE_DATA_DIR'] = original;
      else delete process.env['OPENCODE_DATA_DIR'];
    }
  });
});

test('scanOpencodeSessions maps cache write to cacheCreateUnknown', () => {
  withTestDb((dbPath) => {
    const db = createTestDb(dbPath);
    insertMessage(db, { id: 'msg1', sessionId: 'sess1', tokensCacheWrite: 500 });
    db.close();

    const original = process.env['OPENCODE_DATA_DIR'];
    process.env['OPENCODE_DATA_DIR'] = dbPath.replace('/opencode.db', '');
    try {
      const result = scanOpencodeSessions();
      assert.equal(result.requests[0]!.tokens.cacheCreateUnknown, 500);
      assert.equal(result.requests[0]!.tokens.cacheCreateTotal, 500);
      assert.equal(result.requests[0]!.tokens.cacheCreate5m, 0);
      assert.equal(result.requests[0]!.tokens.cacheCreate1h, 0);
    } finally {
      if (original !== undefined) process.env['OPENCODE_DATA_DIR'] = original;
      else delete process.env['OPENCODE_DATA_DIR'];
    }
  });
});
