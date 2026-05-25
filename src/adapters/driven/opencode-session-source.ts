import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import type { ScanResult } from '../../contracts/scan-result.js';
import type { Request } from '../../contracts/request.js';
import { createTokenBucket } from '../../contracts/tokens.js';
import { safeNonNegInt } from '../../contracts/request.js';
import { normalizeOpencodeModel } from '../../contracts/model-normalization.js';
import { deduplicateAndAggregate } from '../../domain/scanner.js';

function findOpencodeDb(): string | null {
  const envDir = process.env['OPENCODE_DATA_DIR'];
  if (envDir) {
    const p = join(envDir, 'opencode.db');
    return existsSync(p) ? p : null;
  }
  const defaultPath = join(homedir(), '.local', 'share', 'opencode', 'opencode.db');
  return existsSync(defaultPath) ? defaultPath : null;
}

interface ScanOptions {
  from?: string;
  to?: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  model_id: string | null;
  provider_id: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_reasoning: number | null;
  tokens_cache_read: number | null;
  tokens_cache_write: number | null;
  time_created: number | null;
}

export function scanOpencodeSessions({ from, to }: ScanOptions = {}): ScanResult {
  const dbPath = findOpencodeDb();
  if (!dbPath) {
    return {
      requests: [],
      byModel: {},
      byDate: {},
      totals: createTokenBucket(),
      meta: {
        totalFiles: 0,
        totalBytes: 0,
        totalEntries: 0,
        totalRawEntries: 0,
        totalFileEntries: 0,
        duplicateRequests: 0,
        conflictRequests: 0,
        invalidEntries: 0,
        undatedSkipped: 0,
        minDate: null,
        maxDate: null,
        projectDirs: [],
        messageCount: 0,
        source: 'opencode',
      },
    };
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const conditions = ["json_extract(data, '$.role') = 'assistant'"];
    const params: Record<string, unknown> = {};

    if (from) {
      conditions.push("json_extract(data, '$.time.created') >= :fromMs");
      params['fromMs'] = new Date(`${from}T00:00:00`).getTime();
    }
    if (to) {
      conditions.push("json_extract(data, '$.time.created') < :toMs");
      params['toMs'] = new Date(`${to}T00:00:00`).getTime() + 86400000;
    }

    const sql = `
      SELECT
        id,
        session_id,
        json_extract(data, '$.modelID') as model_id,
        json_extract(data, '$.providerID') as provider_id,
        json_extract(data, '$.tokens.input') as tokens_input,
        json_extract(data, '$.tokens.output') as tokens_output,
        json_extract(data, '$.tokens.reasoning') as tokens_reasoning,
        json_extract(data, '$.tokens.cache.read') as tokens_cache_read,
        json_extract(data, '$.tokens.cache.write') as tokens_cache_write,
        json_extract(data, '$.time.created') as time_created
      FROM message
      WHERE ${conditions.join(' AND ')}
    `;

    const rows = db.prepare(sql).all(params) as MessageRow[];

    const entries = new Map<string, Request>();
    let totalRawEntries = 0;

    for (const row of rows) {
      const tokensOutput = safeNonNegInt(row.tokens_output);
      if (tokensOutput === 0) continue;

      totalRawEntries++;
      const key = `opencode:${row.id}`;
      const modelId = row.model_id || 'unknown';
      const providerId = row.provider_id || 'unknown';
      const cacheWrite = safeNonNegInt(row.tokens_cache_write);

      let timestamp: string | null = null;
      let date: string | null = null;
      if (row.time_created && typeof row.time_created === 'number') {
        const d = new Date(row.time_created);
        timestamp = d.toISOString();
        date = timestamp.slice(0, 10);
      }

      const request: Request = {
        key,
        messageId: row.id,
        requestId: row.session_id,
        timestamp,
        date,
        model: normalizeOpencodeModel(modelId, providerId),
        tokens: {
          input: safeNonNegInt(row.tokens_input),
          output: tokensOutput,
          reasoning: safeNonNegInt(row.tokens_reasoning),
          cacheRead: safeNonNegInt(row.tokens_cache_read),
          cacheCreate5m: 0,
          cacheCreate1h: 0,
          cacheCreateUnknown: cacheWrite,
          cacheCreate: cacheWrite,
          cacheCreateTotal: cacheWrite,
        },
        source: 'opencode',
      };

      entries.set(key, request);
    }

    const result = deduplicateAndAggregate([entries], { from, to });

    return {
      ...result,
      meta: {
        ...result.meta,
        totalFiles: 1,
        totalBytes: 0,
        totalRawEntries,
        projectDirs: [dbPath],
        source: 'opencode',
      },
    };
  } finally {
    db.close();
  }
}
