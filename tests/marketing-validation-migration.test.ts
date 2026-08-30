import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260831100000_marketing_validation_sessions.sql";

describe("marketing demand validation migration contract", () => {
  it("creates exactly one marketing session table and extends the internal scope allowlist", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).toContain("create table public.marketing_validation_sessions");
    expect(sql).toContain("create unique index marketing_validation_sessions_email_unique_idx");
    expect(sql).toContain("lower(email)");
    expect(sql).toContain("where email is not null");
    expect(sql).toContain(
      "attribution_status in ('paid_allowlisted', 'organic', 'unverified')",
    );
    expect(sql).toContain("char_length(utm_source) <= 120");
    expect(sql).toContain("target_qualified boolean");
    expect(sql).not.toContain("target_qualified boolean not null");
    expect(sql).toContain("intent_choice = 'needed'");
    expect(sql).toContain("lead_submission_status in ('accepted', 'duplicate')");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("grant all privileges on public.marketing_validation_sessions to service_role");
    expect(sql).toContain("create policy marketing_validation_sessions_service_role_access");
    expect(sql).toContain("v_scope = 'marketing-validation'");
    expect(sql).toContain("/marketing_validation_sessions");
  });

  it("stays privacy-minimal and does not introduce raw request metadata columns", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).not.toMatch(/\b(ip|ip_address|user_agent|referrer_url|fingerprint)\b/u);
    expect(sql).toContain("quiz_answers jsonb");
    expect(sql).toContain("target_qualified boolean");
    expect(sql).toContain("retention_until timestamptz");
    expect(sql).not.toMatch(/create table public\.[a-z_]*marketing[a-z_]*events/u);
  });
});
