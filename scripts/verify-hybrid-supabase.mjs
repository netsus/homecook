#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const modeIndex = process.argv.indexOf("--mode");
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : null;
const commands = {
  "local-jwks-rls": [
    ["pnpm", ["vitest", "run", "tests/hybrid-jwks-sync.test.ts", "tests/hybrid-supabase-jwt.test.ts"]],
  ],
  "postgrest-exact-claim-guard": [
    ["pnpm", ["vitest", "run", "tests/hybrid-supabase-jwt.test.ts", "tests/hybrid-supabase-migration.test.ts"]],
  ],
  "storage-loopback-gateway": [
    ["pnpm", ["vitest", "run", "tests/hybrid-isolated-runtime.test.ts", "tests/hybrid-session-authority-gateway.test.ts"]],
    ["node", ["--check", "infra/hybrid-supabase/loopback-gateway.mjs"]],
    ["docker", ["compose", "-f", "infra/hybrid-supabase/docker-compose.integration.yml", "config", "--quiet"]],
  ],
  "session-liveness-binding": [
    ["pnpm", ["vitest", "run", "tests/hybrid-session-authority-gateway.test.ts", "tests/hybrid-supabase-migration.test.ts"]],
  ],
  "remote-outage-fail-closed": [
    ["pnpm", ["vitest", "run", "tests/hybrid-session-authority-gateway.test.ts"]],
  ],
  "shadow-read-runtime": [
    ["pnpm", ["vitest", "run", "tests/hybrid-shadow-read.test.ts", "tests/supabase-server.test.ts"]],
  ],
  "existing-error-mapping": [
    ["pnpm", ["vitest", "run", "tests/hybrid-session-authority-gateway.test.ts", "tests/account-session-generation-routes.test.ts"]],
  ],
  "identity-mirror": [
    ["pnpm", ["vitest", "run", "tests/hybrid-supabase-identity-mirror.test.ts", "tests/hybrid-supabase-migration.test.ts"]],
  ],
  "route-authority-inventory": [
    ["node", ["scripts/generate-hybrid-authority-inventories.mjs", "--check"]],
    ["pnpm", ["vitest", "run", "tests/hybrid-supabase-static-gate.test.ts"]],
  ],
  "migration-rehearsal": [
    ["pnpm", ["vitest", "run", "tests/hybrid-supabase-postgres.integration.test.ts"]],
  ],
  "semantic-restore-fixture": [
    ["pnpm", ["vitest", "run", "tests/hybrid-isolated-runtime.test.ts"]],
  ],
  "isolated-runtime-measured": [
    ["pnpm", ["test:hybrid-supabase:runtime"]],
  ],
  "production-runtime-artifacts": [
    ["pnpm", ["vitest", "run", "tests/hybrid-production-runtime.test.ts"]],
    ["node", ["--check", "scripts/lib/hybrid-production-runtime.mjs"]],
    ["node", ["--check", "scripts/verify-hybrid-production-artifacts.mjs"]],
    ["node", ["scripts/verify-hybrid-production-artifacts.mjs"]],
  ],
  "production-runtime-docker": [
    ["pnpm", ["test:hybrid-production:runtime"]],
  ],
  "backup-restore-dry-run": [
    ["node", ["scripts/verify-hybrid-production-artifacts.mjs"]],
  ],
  "ordered-recovery-dry-run": [
    ["node", ["scripts/verify-hybrid-production-artifacts.mjs"]],
  ],
  "capacity-preflight-dry-run": [
    ["node", ["scripts/verify-hybrid-production-artifacts.mjs"]],
  ],
  "network-loopback-fixture": [
    ["node", ["scripts/verify-hybrid-production-artifacts.mjs"]],
  ],
  "backup-rollback-rehearsal": [
    ["pnpm", ["test:hybrid-production:runtime"]],
  ],
};
const manualOnlyModes = new Set([
  "capacity-final-preflight",
  "two-system-maintenance-barrier",
  "mac-reboot-ordered-recovery-live",
  "shadow-read",
  "final-cutover",
]);

if (!mode) {
  console.error("--mode is required");
  process.exit(1);
}
if (manualOnlyModes.has(mode)) {
  console.error(JSON.stringify({
    mode,
    status: "MANUAL_GATE_NOT_EXECUTED",
    production_writes: 0,
    cutover_writes: 0,
  }));
  process.exit(2);
}
if (!commands[mode]) {
  console.error(`Unknown hybrid verification mode: ${mode}`);
  process.exit(1);
}
if (
  mode === "migration-rehearsal"
  && !process.env.HYBRID_SUPABASE_TEST_CONTAINER
) {
  console.error(
    "HYBRID_SUPABASE_TEST_CONTAINER is required for migration-rehearsal",
  );
  process.exit(2);
}

for (const [command, args] of commands[mode]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function evidenceScopeForMode(selectedMode) {
  if (selectedMode === "migration-rehearsal") {
    return "isolated-container-transaction";
  }
  if (selectedMode === "isolated-runtime-measured") {
    return "isolated-container-measured-runtime";
  }
  if (
    [
      "backup-restore-dry-run",
      "ordered-recovery-dry-run",
      "capacity-preflight-dry-run",
      "network-loopback-fixture",
      "production-runtime-artifacts",
    ].includes(selectedMode)
  ) {
    return "deterministic-production-artifact-dry-run";
  }
  if (
    [
      "backup-rollback-rehearsal",
      "production-runtime-docker",
    ].includes(selectedMode)
  ) {
    return "isolated-production-docker-runtime";
  }
  return "deterministic-static-unit";
}

process.stdout.write(`${JSON.stringify({
  mode,
  status: "PASS",
  evidence_scope: evidenceScopeForMode(mode),
  production_writes: 0,
  cutover_writes: 0,
})}\n`);
