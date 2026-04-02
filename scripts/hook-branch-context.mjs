#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { buildUserPromptBranchContext } from "./lib/edit-branch-guard.mjs";

function readHookInput() {
  const raw = readFileSync(0, "utf8");
  return raw.trim().length > 0 ? JSON.parse(raw) : {};
}

try {
  const hookInput = readHookInput();
  const rootDir = process.env.CLAUDE_PROJECT_DIR ?? hookInput.cwd ?? process.cwd();
  const context = buildUserPromptBranchContext({
    rootDir,
    prompt: hookInput.prompt,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: context.additionalContext,
        },
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  process.stdout.write(
    `${JSON.stringify(
      {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext:
            error instanceof Error
              ? `Branch context hook could not read the current work branch state: ${error.message}`
              : `Branch context hook could not read the current work branch state: ${String(error)}`,
        },
      },
      null,
      2,
    )}\n`,
  );
}
