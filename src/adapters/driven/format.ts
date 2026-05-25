import { styleText } from 'node:util';

let colorEnabled = true;

export function setColor(enabled: boolean): void {
  colorEnabled = enabled;
}

function style(s: string, ...styles: string[]): string {
  if (!colorEnabled) return s;
  try {
    return styleText(styles as Parameters<typeof styleText>[0], s);
  } catch {
    return s;
  }
}

export const bold = (s: string): string => style(s, 'bold');
export const dim = (s: string): string => style(s, 'dim');
export const green = (s: string): string => style(s, 'green');
export const red = (s: string): string => style(s, 'red');
export const yellow = (s: string): string => style(s, 'yellow');
export const cyan = (s: string): string => style(s, 'cyan');

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null || n === 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function formatUSD(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n === 0) return '$0.00';
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPerMTok(n: number | null | undefined): string {
  if (n == null) return '—';
  const perM = n * 1_000_000;
  if (perM < 0.01) return `$${perM.toFixed(4)}`;
  return `$${perM.toFixed(2)}`;
}

export function table(
  headers: string[],
  rows: (string[] | 'separator')[],
  { align }: { align?: string[] } = {},
): string {
  const allRows = [headers, ...rows.filter((r): r is string[] => r !== 'separator')];
  const colWidths = headers.map((_, i) =>
    Math.max(...allRows.map(r => stripAnsi(String(r[i] ?? '')).length))
  );

  const sep = '─';
  const topLine = '┌' + colWidths.map(w => sep.repeat(w + 2)).join('┬') + '┐';
  const midLine = '├' + colWidths.map(w => sep.repeat(w + 2)).join('┼') + '┤';
  const botLine = '└' + colWidths.map(w => sep.repeat(w + 2)).join('┴') + '┘';

  function fmtRow(cells: string[]): string {
    return '│' + cells.map((c, i) => {
      const s = String(c ?? '');
      const pad = colWidths[i]! - stripAnsi(s).length;
      const a = align?.[i] ?? (i === 0 ? 'left' : 'right');
      if (a === 'right') return ' '.repeat(pad + 1) + s + ' ';
      return ' ' + s + ' '.repeat(pad + 1);
    }).join('│') + '│';
  }

  const lines = [topLine, fmtRow(headers.map(h => bold(h))), midLine];
  for (const row of rows) {
    if (row === 'separator') {
      lines.push(midLine);
    } else {
      lines.push(fmtRow(row));
    }
  }
  lines.push(botLine);
  return lines.join('\n');
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export function heading(text: string): string {
  return '\n' + bold(text) + '\n' + '═'.repeat(stripAnsi(text).length);
}

export function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function formatCostRange(range: { min: number; max: number }): string {
  if (Math.abs(range.min - range.max) < 0.000001) return formatUSD(range.min);
  return `${formatUSD(range.min)}-${formatUSD(range.max)}`;
}
