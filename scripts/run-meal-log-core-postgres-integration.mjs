#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["exec", "vitest", "run", "tests/meal-log-core-postgres.integration.test.ts"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: { ...process.env, HOMECOOK_MEAL_LOG_PG: "1" },
});
process.exit(result.status ?? 1);
