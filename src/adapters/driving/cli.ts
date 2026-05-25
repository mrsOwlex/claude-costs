export interface CLIArgs {
  month: string | null;
  from: string | null;
  to: string | null;
  budget: number;
  comparison: 'trace' | 'agentic' | 'both';
  agenticMultiplier: { min: number; max: number };
  json: boolean;
  noColor: boolean;
  help: boolean;
}

const HELP = `
Claude Code Token Usage & Cost Analyzer

Usage: claude-costs [options]

Options:
  --month YYYY-MM       Filter to a specific month
  --from  YYYY-MM-DD    Start date (inclusive)
  --to    YYYY-MM-DD    End date (inclusive)
  --budget N            Compare models within budget (default: 100)
  --comparison MODE     trace, agentic, or both (default: both)
  --agentic-multiplier MIN:MAX
                         Agentic scenario range (default: 1:3)
  --json                Output raw JSON
  --no-color            Disable terminal colors
  --help                Show this help

Default: last 30 days. Claude Code may delete older session files.
`.trim();

export function parseArgs(argv: string[] = process.argv.slice(2)): CLIArgs {
  const args: CLIArgs = {
    month: null,
    from: null,
    to: null,
    budget: 100,
    comparison: 'both',
    agenticMultiplier: { min: 1, max: 3 },
    json: false,
    noColor: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];

    switch (arg) {
      case '--month':
        if (!next || !/^\d{4}-\d{2}$/.test(next))
          throw new Error('--month expects YYYY-MM');
        validateMonth(next);
        args.month = next;
        i++;
        break;
      case '--from':
        if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next))
          throw new Error('--from expects YYYY-MM-DD');
        validateDate(next, '--from');
        args.from = next;
        i++;
        break;
      case '--to':
        if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next))
          throw new Error('--to expects YYYY-MM-DD');
        validateDate(next, '--to');
        args.to = next;
        i++;
        break;
      case '--budget':
        if (!next || isNaN(Number(next)))
          throw new Error('--budget expects a number');
        { const b = Number(next);
          if (!isFinite(b) || b < 0)
            throw new Error('--budget must be a finite non-negative number');
          args.budget = b;
        }
        i++;
        break;
      case '--comparison':
        if (!next || !['trace', 'agentic', 'both'].includes(next))
          throw new Error('--comparison expects trace, agentic, or both');
        args.comparison = next as CLIArgs['comparison'];
        i++;
        break;
      case '--agentic-multiplier':
        if (!next) throw new Error('--agentic-multiplier expects MIN:MAX');
        args.agenticMultiplier = parseAgenticMultiplier(next);
        i++;
        break;
      case '--json':
        args.json = true;
        break;
      case '--no-color':
        args.noColor = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (args.month) {
    const [y, m] = args.month.split('-').map(Number) as [number, number];
    args.from = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    args.to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  if (!args.from && !args.to) {
    args.to = formatDate(new Date());
    args.from = addDays(args.to, -29);
  } else if (args.from && !args.to) {
    args.to = formatDate(new Date());
  } else if (!args.from && args.to) {
    args.from = addDays(args.to, -29);
  }

  if (args.from && args.to && args.from > args.to) {
    throw new Error('--from must be before --to');
  }

  return args;
}

function parseAgenticMultiplier(value: string): { min: number; max: number } {
  const match = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) throw new Error('--agentic-multiplier expects MIN:MAX');
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!isFinite(min) || !isFinite(max) || min <= 0 || max <= 0 || min > max) {
    throw new Error('--agentic-multiplier expects positive MIN:MAX with MIN <= MAX');
  }
  return { min, max };
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function validateMonth(value: string): void {
  const [, m] = value.split('-').map(Number) as [number, number];
  if (m < 1 || m > 12) throw new Error(`--month: invalid month ${value}`);
}

function validateDate(value: string, flag: string): void {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12) throw new Error(`${flag}: invalid date ${value}`);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw new Error(`${flag}: invalid date ${value}`);
  }
}

export { HELP };
