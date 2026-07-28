#!/usr/bin/env node

import { runLocalSchedulerUninstallCli } from "./lib/account-maintenance-scheduler-local.mjs";

try {
  runLocalSchedulerUninstallCli(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
