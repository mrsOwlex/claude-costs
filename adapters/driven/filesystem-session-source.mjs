import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

import { makeRequest } from '../../contracts/request.mjs';
import { chooseRequestEntry, deduplicateAndAggregate } from '../../domain/scanner.mjs';

function findProjectDirs() {
  const dirs = [];
  const envDir = process.env.CLAUDE_CONFIG_DIR;
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

function findJsonlFiles(dir) {
  const files = [];
  function walk(d) {
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

/**
 * @param {Object} [options]
 * @param {string} [options.from]
 * @param {string} [options.to]
 * @param {string[]} [options.projectDirs]
 * @returns {import('../../contracts/scan-result.mjs').ScanResult}
 */
export function scanSessions({ from, to, projectDirs: overrideProjectDirs } = {}) {
  const projectDirs = overrideProjectDirs || findProjectDirs();
  if (projectDirs.length === 0) {
    throw new Error('No Claude projects directory found. Expected ~/.claude/projects/');
  }

  let allFiles = [];
  for (const dir of projectDirs) {
    allFiles.push(...findJsonlFiles(dir));
  }

  let totalFiles = 0;
  let totalBytes = 0;
  let totalRawEntries = 0;
  const fileMaps = [];

  for (const file of allFiles) {
    totalFiles++;
    let content;
    try {
      content = readFileSync(file, 'utf8');
      totalBytes += Buffer.byteLength(content);
    } catch { continue; }

    const fileEntries = new Map();
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('"assistant"') || !line.includes('"usage"')) continue;

      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.type !== 'assistant') continue;

      const msg = obj.message;
      if (!msg?.usage || typeof msg.usage !== 'object') continue;

      totalRawEntries++;
      const hasGlobalKey = Boolean(msg.id && obj.requestId);
      const key = hasGlobalKey ? `${msg.id}:${obj.requestId}` : `file:${file}:${i}`;
      const request = makeRequest({
        key,
        messageId: msg.id || null,
        requestId: obj.requestId || null,
        timestamp: obj.timestamp || null,
        model: msg.model,
        usage: msg.usage,
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
