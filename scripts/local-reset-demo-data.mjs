#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { ensureDockerRunning } from "./lib/local-docker.mjs";

function runStep(command, args, label) {
  process.stdout.write(`${label}\n`);

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  const passthroughArgs = process.argv.slice(2);

  await ensureDockerRunning();
  runStep("pnpm", ["dlx", "supabase", "start"], "1/3 local Supabase 시작");
  runStep("pnpm", ["dlx", "supabase", "db", "reset"], "2/3 local Supabase reset");
  runStep("node", ["scripts/local-seed-demo-data.mjs", ...passthroughArgs], "3/3 local demo dataset seed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
