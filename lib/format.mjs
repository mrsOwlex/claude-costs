import { styleText } from 'node:util';

let colorEnabled = true;

export function setColor(enabled) {
  colorEnabled = enabled;
}

function style(s, ...styles) {
  if (!colorEnabled) return s;
  try {
    return styleText(styles, s);
  } catch {
    return s;
  }
}

export const bold = s => style(s, 'bold');
export const dim = s => style(s, 'dim');
export const green = s => style(s, 'green');
export const red = s => style(s, 'red');
export const yellow = s => style(s, 'yellow');
export const cyan = s => style(s, 'cyan');

export function formatNumber(n) {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

export function formatTokens(n) {
  if (n == null || n === 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function formatUSD(n) {
  if (n == null) return '—';
  if (n === 0) return '$0.00';
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPerMTok(n) {
  if (n == null) return '—';
  const perM = n * 1_000_000;
  if (perM < 0.01) return `$${perM.toFixed(4)}`;
  return `$${perM.toFixed(2)}`;
}

export function table(headers, rows, { align } = {}) {
  const allRows = [headers, ...rows];
  const colWidths = headers.map((h, i) =>
    Math.max(...allRows.map(r => stripAnsi(String(r[i] ?? '')).length))
  );

  const sep = '─';
  const topLine = '┌' + colWidths.map(w => sep.repeat(w + 2)).join('┬') + '┐';
  const midLine = '├' + colWidths.map(w => sep.repeat(w + 2)).join('┼') + '┤';
  const botLine = '└' + colWidths.map(w => sep.repeat(w + 2)).join('┴') + '┘';

  function fmtRow(cells, isSep) {
    return '│' + cells.map((c, i) => {
      const s = String(c ?? '');
      const pad = colWidths[i] - stripAnsi(s).length;
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

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export function heading(text) {
  return '\n' + bold(text) + '\n' + '═'.repeat(stripAnsi(text).length);
}
