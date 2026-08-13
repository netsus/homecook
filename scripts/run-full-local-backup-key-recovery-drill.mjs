#!/usr/bin/env node

import { spawnSync } from "node:child_process";

if (!process.argv.includes("--execute")) {
  throw new Error("The isolated key recovery drill requires --execute.");
}

const result = spawnSync(
  process.execPath,
  ["scripts/run-isolated-local-backup-restore-drill.mjs", "--execute", "--key-recovery"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 128 * 1024 * 1024,
  },
);
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? "The actual key recovery drill failed.\n");
  process.exit(result.status ?? 1);
}
const evidence = JSON.parse(result.stdout);
if (
  evidence?.status !== "PASS"
  || evidence?.archive_authenticated !== true
  || evidence?.clean_restore_verified !== true
  || evidence?.escrow_envelope_authenticated !== true
  || evidence?.keychain_reregistered !== true
  || evidence?.recovery_evidence_derived_from_restore !== true
  || evidence?.production_readiness_issued !== false
) {
  throw new Error("The actual key recovery drill evidence is incomplete.");
}
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
