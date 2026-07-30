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
};
const manualOnlyModes = new Set([
  "two-system-maintenance-barrier",
  "backup-rollback-rehearsal",
  "capacity-final-preflight",
  "shadow-read",
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

process.stdout.write(`${JSON.stringify({
  mode,
  status: "PASS",
  evidence_scope: mode === "migration-rehearsal"
    ? "isolated-container-transaction"
    : mode === "isolated-runtime-measured"
      ? "isolated-container-measured-runtime"
    : "deterministic-static-unit",
  production_writes: 0,
  cutover_writes: 0,
})}\n`);
