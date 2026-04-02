#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { readBranchPromptState, readBranchSession } from "./lib/branch-session.mjs";

function readCurrentBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error((result.stderr ?? "").trim() || "Unable to read current branch.");
  }

  return result.stdout.trim();
}

try {
  const currentBranch = readCurrentBranch();
  const intent = readBranchSession();
  const promptState = readBranchPromptState();

  process.stdout.write(`Current checkout: ${currentBranch || "(detached)"}\n`);

  if (!intent) {
    process.stdout.write("Recorded work branch intent: none\n");
    process.stdout.write(
      `Prompt reassert required: ${promptState.reassertRequired ? "yes" : "no"}\n`,
    );
    process.exit(0);
  }

  process.stdout.write(`Recorded work branch intent: ${intent.branch}\n`);
  process.stdout.write(`Intent source: ${intent.source}\n`);

  if (intent.slice) {
    process.stdout.write(`Slice: ${intent.slice}\n`);
  }

  if (intent.role) {
    process.stdout.write(`Role: ${intent.role}\n`);
  }

  process.stdout.write(`Updated: ${intent.updatedAt}\n`);
  process.stdout.write(
    `Prompt reassert required: ${promptState.reassertRequired ? "yes" : "no"}\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
