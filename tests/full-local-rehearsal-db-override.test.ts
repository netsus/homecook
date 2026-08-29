import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const SCRIPTS = [
  {
    executable: "auth",
    path: "infra/full-local-supabase/start-auth.sh",
    variable: "GOTRUE_DB_DATABASE_URL",
  },
  {
    executable: "postgrest",
    path: "infra/full-local-supabase/start-postgrest.sh",
    variable: "PGRST_DB_URI",
  },
  {
    executable: "docker-entrypoint.sh",
    path: "infra/full-local-supabase/start-storage.sh",
    variable: "DATABASE_URL",
  },
] as const;

function execute(script: typeof SCRIPTS[number], databaseName?: string, runId = "11111111-2222-4333-8444-555555555555") {
  const bin = mkdtempSync(join(tmpdir(), "homecook-r2-db-override-"));
  const executable = join(bin, script.executable);
  writeFileSync(executable, `#!/bin/sh\nprintf '%s' \"\${${script.variable}}\"\n`, { mode: 0o700 });
  chmodSync(executable, 0o700);
  return spawnSync("/bin/sh", [script.path], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      NODE_ENV: "test",
      PATH: `${bin}:/usr/bin:/bin`,
      POSTGRES_PASSWORD: "synthetic-password",
      ...(databaseName ? {
        HOMECOOK_REHEARSAL_DB_NAME: databaseName,
        HOMECOOK_REHEARSAL_RUN_ID: runId,
      } : {}),
    } as NodeJS.ProcessEnv,
  });
}

describe("full-local rehearsal database override", () => {
  it.each(SCRIPTS)("keeps production default postgres for $path", (script) => {
    const result = execute(script);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/:5432\/postgres$/u);
  });

  it.each(SCRIPTS)("routes $path to the exact namespaced rehearsal DB", (script) => {
    const result = execute(script, "hc_r2_1111111122224333");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/:5432\/hc_r2_1111111122224333$/u);
  });

  it.each(SCRIPTS)("rejects unsafe rehearsal DB override in $path", (script) => {
    const result = execute(script, "postgres;drop database postgres");
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it.each(SCRIPTS)("rejects DB/run identity mismatch in $path", (script) => {
    const result = execute(
      script,
      "hc_r2_1111111122224333",
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );
    expect(result.status).not.toBe(0);
  });
});
