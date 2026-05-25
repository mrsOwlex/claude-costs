const MODEL_ALIASES: Record<string, string> = {
  'claude-opus-4-5-20251101': 'claude-opus-4-5',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5',
  'claude-opus-4-20250514': 'claude-opus-4',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-5',
};

export function normalizeModel(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return 'unknown';
  let m = raw.trim();
  if (m.startsWith('anthropic.')) m = m.slice('anthropic.'.length);
  m = m.replace(/-v\d+:\d+$/, '');
  const alias = MODEL_ALIASES[m];
  if (alias) return alias;
  const withoutDate = m.replace(/-\d{8}$/, '');
  const dateAlias = MODEL_ALIASES[withoutDate];
  if (dateAlias) return dateAlias;
  return withoutDate || m;
}

export { MODEL_ALIASES };
