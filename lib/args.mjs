const HELP = `
Claude Code Token Usage & Cost Analyzer

Usage: claude-costs [options]

Options:
  --month YYYY-MM       Filter to a specific month
  --from  YYYY-MM-DD    Start date (inclusive)
  --to    YYYY-MM-DD    End date (inclusive)
  --budget N            Compare models within budget (default: 100)
  --json                Output raw JSON
  --no-color            Disable terminal colors
  --help                Show this help

Default: last 30 days. Claude Code may delete older session files.
`.trim();

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    month: null,
    from: null,
    to: null,
    budget: 100,
    json: false,
    noColor: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--month':
        if (!next || !/^\d{4}-\d{2}$/.test(next))
          throw new Error('--month expects YYYY-MM');
        args.month = next;
        i++;
        break;
      case '--from':
        if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next))
          throw new Error('--from expects YYYY-MM-DD');
        args.from = next;
        i++;
        break;
      case '--to':
        if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next))
          throw new Error('--to expects YYYY-MM-DD');
        args.to = next;
        i++;
        break;
      case '--budget':
        if (!next || isNaN(Number(next)))
          throw new Error('--budget expects a number');
        args.budget = Number(next);
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
    const [y, m] = args.month.split('-').map(Number);
    args.from = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    args.to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  // Default: last 30 days
  if (!args.from && !args.to) {
    const now = new Date();
    args.to = now.toISOString().slice(0, 10);
    now.setDate(now.getDate() - 29);
    args.from = now.toISOString().slice(0, 10);
  }

  if (args.from && args.to && args.from > args.to) {
    throw new Error('--from must be before --to');
  }

  return args;
}

export { HELP };
