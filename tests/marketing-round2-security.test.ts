import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("includes every new r2 helper and RPC in the existing authorization gate", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-security-function-authorization.mjs", "--contract-only"], { encoding: "utf8", env: { ...process.env } });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout + result.stderr).toContain("marketing-demand-validation-round2:10");
});
it("keeps the r2 migration additive and revokes all direct table access", () => {
  const sql = readFileSync("supabase/migrations/20260911100000_marketing_round2.sql", "utf8");
  expect(sql).not.toMatch(/(?:alter table|update|delete from)\s+public\.marketing_validation_sessions/i);
  for (const table of ["participations", "events", "lead_requests"]) {
    expect(sql).toContain(`alter table public.marketing_round2_${table} force row level security`);
  }
  expect(sql).toMatch(/revoke all on public\.marketing_round2_participations[^;]+from public, anon, authenticated, service_role/i);
});
