#!/usr/bin/env node

import { validateWave1PrototypeLock } from "./lib/validate-wave1-prototype-lock.mjs";

function parseArgs(argv) {
  const args = {
    manifest: null,
    prBody: null,
    slice: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--manifest":
        args.manifest = next;
        index += 1;
        break;
      case "--pr-body":
      case "--pr-body-file":
        args.prBody = next;
        index += 1;
        break;
      case "--slice":
        args.slice = next;
        index += 1;
        break;
      default:
        if (!arg.startsWith("--") && !args.prBody) {
          args.prBody = arg;
        }
        break;
    }
  }

  args.slice = args.slice ?? process.env.SLICE ?? null;
  args.prBody = args.prBody ?? process.env.PR_BODY_FILE ?? null;

  return args;
}

function printResults(results) {
  const failed = results.filter((result) => result.errors.length > 0);
  if (failed.length === 0) {
    process.stdout.write("Wave1 prototype lock validation passed\n");
    return 0;
  }

  for (const result of failed) {
    console.error(`Wave1 prototype lock validation failed for ${result.name}`);
    for (const error of result.errors) {
      console.error(`- ${error.path}: ${error.message}`);
    }
  }

  return 1;
}

const args = parseArgs(process.argv.slice(2));
const exitCode = printResults(
  validateWave1PrototypeLock({
    rootDir: process.cwd(),
    manifestPath: args.manifest ?? undefined,
    prBodyPath: args.prBody,
    slice: args.slice,
  }),
);

process.exit(exitCode);
