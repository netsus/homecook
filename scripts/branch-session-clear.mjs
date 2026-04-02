#!/usr/bin/env node

import { clearBranchSession } from "./lib/branch-session.mjs";

try {
  const result = clearBranchSession();
  process.stdout.write(
    result.cleared
      ? `Cleared recorded work branch intent at ${result.filePath}\n`
      : `No recorded work branch intent found at ${result.filePath}\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
