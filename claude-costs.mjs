#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { parseArgs, HELP } from './adapters/driving/cli.mjs';
import { analyzeUsage } from './application/analyze-usage.mjs';

async function main() {
  let args;
  try {
    args = parseArgs();
  } catch (e) {
    console.error(`Error: ${e.message}\n`);
    console.log(HELP);
    process.exit(1);
  }

  if (args.help) {
    console.log(HELP);
    return;
  }

  await analyzeUsage(args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
