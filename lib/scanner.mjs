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

export function normalizeModel(raw) {
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

function totalRequestTokens(request) {
  const t = request.tokens;
  return t.input + t.output + t.cacheRead + t.cacheCreateTotal;
}

function tokensEqual(a, b) {
  return a.input === b.input
    && a.output === b.output
    && a.cacheRead === b.cacheRead
    && a.cacheCreate5m === b.cacheCreate5m
    && a.cacheCreate1h === b.cacheCreate1h
    && a.cacheCreateUnknown === b.cacheCreateUnknown
    && a.cacheCreateTotal === b.cacheCreateTotal;
}

function parseUsageTokens(usage) {
  const cacheCreateTotal = usage.cache_creation_input_tokens || 0;
  const cacheCreate5m = usage.cache_creation?.ephemeral_5m_input_tokens || 0;
  const cacheCreate1h = usage.cache_creation?.ephemeral_1h_input_tokens || 0;
  const knownCacheCreate = cacheCreate5m + cacheCreate1h;

  return {
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheRead: usage.cache_read_input_tokens || 0,
    cacheCreate5m,
    cacheCreate1h,
    cacheCreateUnknown: Math.max(cacheCreateTotal - knownCacheCreate, 0),
    cacheCreateTotal: Math.max(cacheCreateTotal, knownCacheCreate),
  };
}

function makeRequest({ key, messageId, requestId, timestamp, model, usage }) {
  const date = timestamp ? timestamp.slice(0, 10) : null;
  return {
    key,
    messageId,
    requestId,
    timestamp,
    date,
    model: normalizeModel(model),
    tokens: parseUsageTokens(usage),
  };
}

function chooseRequestEntry(current, next) {
  if (!current) return next;
  const currentTokens = totalRequestTokens(current);
  const nextTokens = totalRequestTokens(next);
  if (nextTokens > currentTokens) return next;
  if (nextTokens < currentTokens) return current;
  return next;
}

function createTokenBucket() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheCreateUnknown: 0,
    cacheCreate: 0,
    cacheCreateTotal: 0,
  };
}

function addTokens(target, tokens) {
  target.input += tokens.input;
  target.output += tokens.output;
  target.cacheRead += tokens.cacheRead;
  target.cacheCreate5m += tokens.cacheCreate5m;
  target.cacheCreate1h += tokens.cacheCreate1h;
  target.cacheCreateUnknown += tokens.cacheCreateUnknown;
  target.cacheCreate += tokens.cacheCreateTotal;
  target.cacheCreateTotal += tokens.cacheCreateTotal;
}

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
  let totalFileEntries = 0;
  const globalEntries = new Map();
  let duplicateRequests = 0;
  let conflictRequests = 0;

  for (const file of allFiles) {
    totalFiles++;
    let content;
    try {
      content = readFileSync(file, 'utf8');
      totalBytes += Buffer.byteLength(content);
    } catch { continue; }

    // Per-file dedup: streaming checkpoints write multiple lines per request.
    // Keep the highest-token entry, with later lines winning ties.
    const fileEntries = new Map();
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('"assistant"') || !line.includes('"usage"')) continue;

      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.type !== 'assistant') continue;

      const msg = obj.message;
      if (!msg?.usage) continue;

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

    totalFileEntries += fileEntries.size;

    for (const [key, request] of fileEntries) {
      if (request.model === 'synthetic' || request.model === '<synthetic>') continue;
      if (request.date) {
        if (from && request.date < from) continue;
        if (to && request.date > to) continue;
      }

      const existing = globalEntries.get(key);
      if (existing) {
        duplicateRequests++;
        if (!tokensEqual(existing.tokens, request.tokens)) conflictRequests++;
      }
      globalEntries.set(key, chooseRequestEntry(existing, request));
    }
  }

  const requests = [...globalEntries.values()]
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
  const messageIds = new Set();
  const byModel = {};
  const byDate = {};
  const totals = createTokenBucket();
  let minDate = null;
  let maxDate = null;

  for (const request of requests) {
    if (request.messageId) messageIds.add(request.messageId);
    if (request.date) {
      if (!minDate || request.date < minDate) minDate = request.date;
      if (!maxDate || request.date > maxDate) maxDate = request.date;
    }

    if (!byModel[request.model]) byModel[request.model] = createTokenBucket();
    addTokens(byModel[request.model], request.tokens);
    addTokens(totals, request.tokens);

    if (request.date) {
      if (!byDate[request.date]) byDate[request.date] = {};
      if (!byDate[request.date][request.model]) byDate[request.date][request.model] = createTokenBucket();
      addTokens(byDate[request.date][request.model], request.tokens);
    }
  }

  return {
    requests,
    byModel,
    byDate,
    totals,
    meta: {
      totalFiles,
      totalBytes,
      totalEntries: requests.length,
      totalRawEntries,
      totalFileEntries,
      duplicateRequests,
      conflictRequests,
      minDate,
      maxDate,
      projectDirs,
      messageCount: messageIds.size,
    },
  };
}
