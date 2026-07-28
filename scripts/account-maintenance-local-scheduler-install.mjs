#!/usr/bin/env node

import { runLocalSchedulerInstallCli } from "./lib/account-maintenance-scheduler-local.mjs";

try {
  runLocalSchedulerInstallCli(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
