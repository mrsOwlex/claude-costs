import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

import type { ScanResult } from '../../contracts/scan-result.js';
import type { Request } from '../../contracts/request.js';
import { makeRequest } from '../../contracts/request.js';
import { chooseRequestEntry, deduplicateAndAggregate } from '../../domain/scanner.js';

function findProjectDirs(): string[] {
  const dirs: string[] = [];
  const envDir = process.env['CLAUDE_CONFIG_DIR'];
  if (envDir) {
    for (const d of envDir.split(',')) {
      const p = resolve(d.trim(), 'projects');
      try { statSync(p); dirs.push(p); } catch {}
    }
  }
  const home = homedir();
  for (const base of [
    join(home, '.config', 'claude', 'projects'),
    join(home, '.claude', 'projects'),
  ]) {
    try { statSync(base); dirs.push(base); } catch {}
  }
  return [...new Set(dirs)];
}

function findJsonlFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.jsonl')) files.push(full);
    }
  }
  walk(dir);
  return files;
}

interface ScanOptions {
  from?: string;
  to?: string;
  projectDirs?: string[];
}

export function scanSessions({ from, to, projectDirs: overrideProjectDirs }: ScanOptions = {}): ScanResult {
  const projectDirs = overrideProjectDirs || findProjectDirs();
  if (projectDirs.length === 0) {
    throw new Error('No Claude projects directory found. Expected ~/.claude/projects/');
  }

  const allFiles: string[] = [];
  for (const dir of projectDirs) {
    allFiles.push(...findJsonlFiles(dir));
  }

  let totalFiles = 0;
  let totalBytes = 0;
  let totalRawEntries = 0;
  const fileMaps: Map<string, Request>[] = [];

  for (const file of allFiles) {
    totalFiles++;
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
      totalBytes += Buffer.byteLength(content);
    } catch { continue; }

    const fileEntries = new Map<string, Request>();
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.includes('"assistant"') || !line.includes('"usage"')) continue;

      let obj: Record<string, unknown>;
      try { obj = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
      if (obj['type'] !== 'assistant') continue;

      const msg = obj['message'] as Record<string, unknown> | undefined;
      if (!msg?.['usage'] || typeof msg['usage'] !== 'object') continue;

      totalRawEntries++;
      const msgId = msg['id'] as string | undefined;
      const reqId = obj['requestId'] as string | undefined;
      const hasGlobalKey = Boolean(msgId && reqId);
      const key = hasGlobalKey ? `${msgId}:${reqId}` : `file:${file}:${i}`;
      const request = makeRequest({
        key,
        messageId: msgId || null,
        requestId: reqId || null,
        timestamp: obj['timestamp'],
        model: msg['model'],
        usage: msg['usage'] as Record<string, unknown>,
      });

      fileEntries.set(key, chooseRequestEntry(fileEntries.get(key), request));
    }

    fileMaps.push(fileEntries);
  }

  const result = deduplicateAndAggregate(fileMaps, { from, to });

  return {
    ...result,
    meta: {
      totalFiles,
      totalBytes,
      totalEntries: result.requests.length,
      totalRawEntries,
      totalFileEntries: result.meta.totalFileEntries,
      duplicateRequests: result.meta.duplicateRequests,
      conflictRequests: result.meta.conflictRequests,
      invalidEntries: 0,
      undatedSkipped: result.meta.undatedSkipped,
      minDate: result.meta.minDate,
      maxDate: result.meta.maxDate,
      projectDirs,
      messageCount: result.meta.messageCount,
    },
  };
}
