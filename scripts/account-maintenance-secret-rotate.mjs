#!/usr/bin/env node

import { rotateAccountMaintenanceSecret } from "./lib/account-maintenance-secret-rotation.mjs";

function requireValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${token} requires a value`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    confirmed: false,
    expectedCommit: undefined,
    rootDir: process.cwd(),
    vercelCwd: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (token === "--confirm-manual-only") {
      options.confirmed = true;
      continue;
    }
    if (token === "--expected-commit") {
      options.expectedCommit = requireValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--root-dir") {
      options.rootDir = requireValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--vercel-cwd") {
      options.vercelCwd = requireValue(argv, index, token);
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${token}`);
  }

  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const result = rotateAccountMaintenanceSecret({
    ...options,
    vercelCommand: "pnpm",
    vercelArgsPrefix: ["--silent", "dlx", "vercel@57.0.0"],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Secret rotation failed."}\n`,
  );
  process.exit(1);
}
