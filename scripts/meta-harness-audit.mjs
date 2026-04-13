#!/usr/bin/env node

import { resolveAuditArgs, runMetaHarnessAudit } from "./lib/meta-harness-auditor.mjs";

async function main() {
  const args = resolveAuditArgs(process.argv.slice(2));
  const result = runMetaHarnessAudit({
    rootDir: process.cwd(),
    outputDir: args.outputDir,
    sampleSlices: args.sampleSlices,
    checkpoint: args.checkpoint,
    inFlightSlice: args.inFlightSlice,
    reason: args.reason,
  });

  console.log(`Meta harness audit bundle: ${result.outputDir}`);
  console.log(`Report: ${result.outputDir}/report.md`);
  console.log(`Findings: ${result.findings.length}`);
  console.log(`Overall score: ${result.scorecard.overall_score}/5`);
  console.log(`Promotion readiness: ${result.promotionReadiness.verdict}`);
  if (result.auditContext.checkpoint) {
    console.log(`Checkpoint: ${result.auditContext.checkpoint}`);
  }
  if (result.auditContext.in_flight_slice) {
    console.log(`In-flight slice: ${result.auditContext.in_flight_slice}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
