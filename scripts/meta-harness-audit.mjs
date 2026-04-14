#!/usr/bin/env node

import { resolveAuditArgs, runMetaHarnessAudit } from "./lib/meta-harness-auditor.mjs";

function writeLine(text) {
  process.stdout.write(`${text}\n`);
}

async function main() {
  const args = resolveAuditArgs(process.argv.slice(2));
  const result = runMetaHarnessAudit({
    rootDir: process.cwd(),
    outputDir: args.outputDir,
    sampleSlices: args.sampleSlices,
    checkpoint: args.checkpoint,
    inFlightSlice: args.inFlightSlice,
    reason: args.reason,
    cadenceEvent: args.cadenceEvent,
  });

  writeLine(`Meta harness audit bundle: ${result.outputDir}`);
  writeLine(`Report: ${result.outputDir}/report.md`);
  writeLine(`Findings: ${result.findings.length}`);
  writeLine(`Overall score: ${result.scorecard.overall_score}/5`);
  writeLine(`Promotion readiness: ${result.promotionReadiness.verdict}`);
  writeLine(`Cadence event: ${result.auditContext.cadence_event}`);
  if (result.auditContext.checkpoint) {
    writeLine(`Checkpoint: ${result.auditContext.checkpoint}`);
  }
  if (result.auditContext.in_flight_slice) {
    writeLine(`In-flight slice: ${result.auditContext.in_flight_slice}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
