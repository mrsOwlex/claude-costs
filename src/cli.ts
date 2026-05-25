import { parseArgs, HELP } from './adapters/driving/cli.js';
import { analyzeUsage } from './application/analyze-usage.js';

async function main(): Promise<void> {
  let args;
  try {
    args = parseArgs();
  } catch (e) {
    console.error(`Error: ${(e as Error).message}\n`);
    console.log(HELP);
    process.exit(1);
  }

  if (args.help) {
    console.log(HELP);
    return;
  }

  await analyzeUsage(args);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
