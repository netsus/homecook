#!/usr/bin/env node

import { runManualSchedulerCli } from "./lib/account-maintenance-scheduler-manual.mjs";

try {
  runManualSchedulerCli("install", process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
