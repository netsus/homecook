import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const runner = readFileSync(
  "scripts/run-full-local-core-owner-read-rls-postgres-integration.mjs",
  "utf8",
);

describe("full-local core owner-read PostgreSQL runner", () => {
  it("routes through the isolated full migration replay gate", () => {
    expect(runner).toContain(
      'process.env.HOMECOOK_ISOLATED_RUNTIME_INTEGRATION_TEST =\n  "tests/full-local-core-owner-read-rls-postgres.integration.test.ts";',
    );
    expect(runner).toContain('process.env.HOMECOOK_FULL_LOCAL_CORE_OWNER_READ_RLS_PG = "1";');
    expect(runner).toContain('await import("./run-isolated-local-supabase-runtime-gate.mjs");');
    expect(runner).not.toContain("HOMECOOK_ISOLATED_RUNTIME_SKIP_RESET");
  });
});
