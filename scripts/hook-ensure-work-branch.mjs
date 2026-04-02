#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { ensureEditWorkBranch } from "./lib/edit-branch-guard.mjs";

function readHookInput() {
  const raw = readFileSync(0, "utf8");
  return raw.trim().length > 0 ? JSON.parse(raw) : {};
}

function printAllow(message) {
  process.stdout.write(
    `${JSON.stringify(
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: message,
        },
      },
      null,
      2,
    )}\n`,
  );
}

function printDeny(message) {
  process.stdout.write(
    `${JSON.stringify(
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: message,
        },
      },
      null,
      2,
    )}\n`,
  );
}

try {
  const hookInput = readHookInput();
  const rootDir = process.env.CLAUDE_PROJECT_DIR ?? hookInput.cwd ?? process.cwd();
  const result = ensureEditWorkBranch({ rootDir, hookInput });

  if (result.outcome === "deny") {
    printDeny(result.reason);
    process.exit(0);
  }

  if (result.branchChanged) {
    printAllow(
      `Auto-switched worktree from \`${result.currentBranch}\` to recorded work branch \`${result.targetBranch}\` before editing.`,
    );
  }
} catch (error) {
  printDeny(
    error instanceof Error
      ? `Work branch guard failed: ${error.message}`
      : `Work branch guard failed: ${String(error)}`,
  );
}
