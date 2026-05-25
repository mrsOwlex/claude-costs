const MODEL_ALIASES = {
  'claude-opus-4-5-20251101': 'claude-opus-4-5',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5',
  'claude-opus-4-20250514': 'claude-opus-4',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-5',
};

export function normalizeModel(raw) {
  if (!raw || typeof raw !== 'string') return 'unknown';
  let m = raw.trim();
  if (m.startsWith('anthropic.')) m = m.slice('anthropic.'.length);
  m = m.replace(/-v\d+:\d+$/, '');
  if (MODEL_ALIASES[m]) return MODEL_ALIASES[m];
  const withoutDate = m.replace(/-\d{8}$/, '');
  if (MODEL_ALIASES[withoutDate]) return MODEL_ALIASES[withoutDate];
  return withoutDate || m;
}

export { MODEL_ALIASES };
