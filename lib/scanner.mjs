import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

// Model name normalization (ported from CodexBar CostUsagePricing.swift)
const MODEL_ALIASES = {
  'claude-opus-4-5-20251101': 'claude-opus-4-5',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5',
  'claude-opus-4-20250514': 'claude-opus-4',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-5',
};

function normalizeModel(raw) {
  if (!raw) return 'unknown';
  let m = raw.trim();
  // Strip anthropic. prefix
  if (m.startsWith('anthropic.')) m = m.slice('anthropic.'.length);
  // Strip version suffixes like -v1:0
  m = m.replace(/-v\d+:\d+$/, '');
  // Check known aliases (with date suffixes)
  if (MODEL_ALIASES[m]) return MODEL_ALIASES[m];
  // Strip date suffix -YYYYMMDD and check again
  const withoutDate = m.replace(/-\d{8}$/, '');
  if (MODEL_ALIASES[withoutDate]) return MODEL_ALIASES[withoutDate];
  return withoutDate || m;
}

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

export function scanSessions({ from, to } = {}) {
  const projectDirs = findProjectDirs();
  if (projectDirs.length === 0) {
    throw new Error('No Claude projects directory found. Expected ~/.claude/projects/');
  }

  let allFiles = [];
  for (const dir of projectDirs) {
    allFiles.push(...findJsonlFiles(dir));
  }

  const messageIds = new Set();
  const byModel = {};
  const byDate = {};
  let totalFiles = 0;
  let totalBytes = 0;
  let totalEntries = 0;
  let totalRawEntries = 0;
  let minDate = null;
  let maxDate = null;

  for (const file of allFiles) {
    totalFiles++;
    let content;
    try {
      content = readFileSync(file, 'utf8');
      totalBytes += Buffer.byteLength(content);
    } catch { continue; }

    // Per-file dedup: within each file, keep last entry per (messageId, requestId).
    // Streaming checkpoints write multiple lines per request; only the last has final counts.
    // But the SAME (messageId, requestId) in DIFFERENT files represents separate billable
    // context replays, so we must NOT dedup across files.
    const fileEntries = new Map();
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.includes('"assistant"') || !line.includes('"usage"')) continue;

      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.type !== 'assistant') continue;

      const msg = obj.message;
      if (!msg?.usage) continue;

      const dedupKey = `${msg.id || ''}:${obj.requestId || ''}`;
      fileEntries.set(dedupKey, { usage: msg.usage, model: msg.model, timestamp: obj.timestamp, msgId: msg.id });
    }

    totalRawEntries += fileEntries.size;

    for (const [, entry] of fileEntries) {
      const usage = entry.usage;
      const input = usage.input_tokens || 0;
      const output = usage.output_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const cacheCreate = usage.cache_creation_input_tokens || 0;

      if (entry.msgId) messageIds.add(entry.msgId);

      const model = normalizeModel(entry.model);
      if (model === 'synthetic' || model === '<synthetic>') continue;

      const timestamp = entry.timestamp;
      const date = timestamp ? timestamp.slice(0, 10) : null;

      if (date) {
        if (from && date < from) continue;
        if (to && date > to) continue;
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      }

      totalEntries++;

      if (!byModel[model]) byModel[model] = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      byModel[model].input += input;
      byModel[model].output += output;
      byModel[model].cacheRead += cacheRead;
      byModel[model].cacheCreate += cacheCreate;

      if (date) {
        if (!byDate[date]) byDate[date] = {};
        if (!byDate[date][model]) byDate[date][model] = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
        byDate[date][model].input += input;
        byDate[date][model].output += output;
        byDate[date][model].cacheRead += cacheRead;
        byDate[date][model].cacheCreate += cacheCreate;
      }
    }
  }

  const totals = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
  for (const m of Object.values(byModel)) {
    totals.input += m.input;
    totals.output += m.output;
    totals.cacheRead += m.cacheRead;
    totals.cacheCreate += m.cacheCreate;
  }

  return {
    byModel,
    byDate,
    totals,
    meta: {
      totalFiles,
      totalBytes,
      totalEntries,
      totalRawEntries,
      minDate,
      maxDate,
      projectDirs,
      messageCount: messageIds.size,
    },
  };
}
