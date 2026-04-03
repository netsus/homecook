#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const seedArgs = [];
  const playwrightArgs = [];
  let help = false;
  let writeToPlaywright = false;

  for (const token of argv) {
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }

    if (token === "--") {
      writeToPlaywright = true;
      continue;
    }

    if (writeToPlaywright) {
      playwrightArgs.push(token);
      continue;
    }

    seedArgs.push(token);
  }

  return {
    help,
    playwrightArgs,
    seedArgs,
  };
}

function runStep(command, args, label, env = process.env) {
  process.stdout.write(`${label}\n`);

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(
      [
        "Usage:",
        "  pnpm qa:perf:02",
        "  pnpm qa:perf:02 -- --ingredient-count 360 --recipe-count 180",
        "  pnpm qa:perf:02 -- --ingredient-count 360 -- --headed",
        "",
        "Requirements:",
        "  1. `pnpm dlx supabase start`",
        "  2. `pnpm dev:demo` running at http://localhost:3000",
        "",
        "Notes:",
        "  - 첫 `--` 앞의 인자는 bulk seed 설정으로 전달됩니다.",
        "  - 첫 `--` 뒤의 인자는 Playwright에 그대로 전달됩니다.",
      ].join("\n") + "\n",
    );
    return;
  }

  runStep(
    "node",
    ["scripts/local-seed-slice-02-performance.mjs", ...args.seedArgs],
    "1/2 slice 02 성능 fixture seed",
  );

  runStep(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "tests/e2e/qa-slice-02-performance.spec.ts",
      "--project=desktop-chrome",
      ...args.playwrightArgs,
    ],
    "2/2 slice 02 성능 smoke",
    {
      ...process.env,
      HOMECOOK_RUN_LOCAL_PERF_QA: "1",
      PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
      PLAYWRIGHT_REUSE_EXISTING_SERVER: "1",
    },
  );
}

main();
