#!/usr/bin/env node

import { startWorkBranch } from "./lib/start-work-branch.mjs";

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  pnpm branch:start -- --branch <name>",
      "  pnpm branch:start -- --slice <slice-id> --role <docs|be|fe>",
      "",
      "Examples:",
      "  pnpm branch:start -- --branch feature/branch-switch-guard",
      "  pnpm branch:start -- --slice 06-recipe-to-planner --role be",
      "  pnpm branch:start -- --slice 06-recipe-to-planner --role fe",
      "  pnpm branch:start -- --slice 06-recipe-to-planner --role docs",
      "",
      "Notes:",
      "  - New branches are created from origin/master.",
      "  - feature/be-* and feature/fe-* branches require merged workpack docs on origin/master.",
      "  - The current worktree must be clean before switching branches.",
      "  - The selected work branch is recorded as the active edit intent for general-session hooks.",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {
    branch: null,
    slice: null,
    role: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--":
        break;
      case "--branch":
        args.branch = argv[index + 1] ?? null;
        index += 1;
        break;
      case "--slice":
        args.slice = argv[index + 1] ?? null;
        index += 1;
        break;
      case "--role":
        args.role = argv[index + 1] ?? null;
        index += 1;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

try {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const result = startWorkBranch({
    branch: args.branch,
    slice: args.slice,
    role: args.role,
  });

  process.stdout.write(
    `${result.created ? "Created and checked out" : result.changed ? "Checked out" : "Already on"} ${result.branch}\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
