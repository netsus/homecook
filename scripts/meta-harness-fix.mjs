#!/usr/bin/env node

import { resolveFixArgs, runMetaHarnessFix } from "./lib/meta-harness-auditor.mjs";

function writeLine(text) {
  process.stdout.write(`${text}\n`);
}

async function main() {
  const args = resolveFixArgs(process.argv.slice(2));
  const result = runMetaHarnessFix({
    rootDir: process.cwd(),
    findingId: args.findingId,
    outputDir: args.outputDir,
    reason: args.reason,
  });

  writeLine(`Meta harness fix bundle: ${result.outputDir}`);
  writeLine(`Fix result: ${result.outputDir}/fix-result.json`);
  writeLine(`Finding: ${result.result.finding_id}`);
  writeLine(`Status: ${result.result.status}`);
  writeLine(`Changed files: ${result.result.changed_files.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
