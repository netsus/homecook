import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260801150000_full_local_account_bootstrap.sql", import.meta.url),
  "utf8",
);

describe("full-local account bootstrap migration", () => {
  it("reenables account bootstrap only under active local Auth control", () => {
    expect(migration).toContain("create or replace function public.bootstrap_account_generation_identity");
    expect(migration).toContain("v_control.authority is distinct from 'local'");
    expect(migration).toContain("v_control.local_issuer");
    expect(migration).not.toContain("perform public.bind_user_session_generation");
  });

  it("keeps the bootstrap RPC internal", () => {
    expect(migration).toContain("set search_path = pg_catalog, public, auth, pg_temp");
    expect(migration).not.toContain("set search_path = pg_catalog, public, private");
    expect(migration).toContain("revoke all on function public.bootstrap_account_generation_identity");
    expect(migration).toContain("grant execute on function public.bootstrap_account_generation_identity");
    expect(migration).toContain("to service_role");
  });
});
