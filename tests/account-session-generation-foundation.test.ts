import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260723140000_account_session_generation_foundation.sql";

describe("account session generation foundation migration", () => {
  it("dark-ships the nine authority tables with only the legacy capability row", async () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    for (const table of [
      "user_account_generation_watermarks",
      "user_account_lifecycles",
      "user_session_generation_bindings",
      "account_generation_capability_state",
      "account_generation_cutover_attempts",
      "account_generation_cutover_staging",
      "legacy_account_delete_receipts",
      "legacy_external_write_attempts",
      "auth_identity_deletion_outbox",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }

    expect(migration).toMatch(
      /insert\s+into\s+public\.account_generation_capability_state[\s\S]+?'legacy'/,
    );
    const darkShipBootstrap = migration.slice(
      0,
      migration.indexOf(
        "create or replace function public.begin_account_generation_cutover",
      ),
    );
    expect(darkShipBootstrap).not.toMatch(
      /insert\s+into\s+public\.(?:user_account_generation_watermarks|user_account_lifecycles)/,
    );
  });

  it("makes generation watermarks monotonic and legacy delete receipts immutable", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    expect(migration).toContain(
      "function public.protect_account_generation_watermark()",
    );
    expect(migration).toContain(
      "trigger protect_account_generation_watermark",
    );
    expect(migration).toContain(
      "new.last_account_generation <> old.last_account_generation + 1",
    );
    expect(migration).toContain(
      "function public.protect_legacy_account_delete_receipt()",
    );
    expect(migration).toContain(
      "trigger protect_legacy_account_delete_receipt",
    );
  });

  it("denies direct table access to every API principal without user cascade FKs", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    for (const table of [
      "user_account_generation_watermarks",
      "user_account_lifecycles",
      "user_session_generation_bindings",
      "account_generation_capability_state",
      "account_generation_cutover_attempts",
      "account_generation_cutover_staging",
      "legacy_account_delete_receipts",
      "legacy_external_write_attempts",
      "auth_identity_deletion_outbox",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `revoke\\s+all\\s+on\\s+table\\s+public\\.${table}`
            + "\\s+from\\s+public,\\s*anon,\\s*authenticated,\\s*service_role",
        ),
      );
    }

    const authorityTableDefinitions = migration.slice(
      0,
      migration.indexOf("-- an account delete must not be blocked"),
    );
    expect(authorityTableDefinitions).not.toMatch(
      /references\s+(?:auth|public)\.users/,
    );
    expect(migration).toContain(
      "create unique index user_account_lifecycles_one_active_owner_idx",
    );
  });

  it("stores only the versioned session HMAC and its expected generation", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();
    const bindings = migration.match(
      /create table public\.user_session_generation_bindings \(([\s\S]*?)\n\);/,
    )?.[1] ?? "";

    expect(bindings).toContain("session_key_hash text not null");
    expect(bindings).toContain("hmac_key_version integer not null");
    expect(bindings).toContain("expected_account_generation bigint not null");
    expect(bindings).not.toMatch(/\b(?:raw_)?session_id\b/);
  });

  it("exposes only server-internal bind and revoke functions for session generations", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    expect(migration).toMatch(
      /function\s+public\.bind_user_session_generation\(\s*p_owner_uuid uuid,\s*p_expected_account_generation bigint,\s*p_session_key_hash text,\s*p_hmac_key_version integer,\s*p_auth_identity_created_at_snapshot timestamp with time zone\s*\)/,
    );
    expect(migration).toMatch(
      /function\s+public\.revoke_user_session_generation_binding\(\s*p_owner_uuid uuid,\s*p_expected_account_generation bigint,\s*p_session_key_hash text,\s*p_hmac_key_version integer\s*\)/,
    );
    expect(migration).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.bind_user_session_generation\(\s*uuid,\s*bigint,\s*text,\s*integer,\s*timestamp with time zone\s*\)\s+to\s+service_role/,
    );
    expect(migration).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.revoke_user_session_generation_binding\(\s*uuid,\s*bigint,\s*text,\s*integer\s*\)\s+to\s+service_role/,
    );
    expect(migration).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.bind_user_session_generation\([\s\S]+?from\s+public,\s*anon,\s*authenticated/,
    );
    expect(migration).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.revoke_user_session_generation_binding\([\s\S]+?from\s+public,\s*anon,\s*authenticated/,
    );
  });

  it("keeps post-cutover identity bootstrap service-internal and session-bound", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    expect(migration).toMatch(
      /function\s+public\.bootstrap_account_generation_identity\(\s*p_owner_uuid uuid,\s*p_auth_identity_created_at_snapshot timestamp with time zone,\s*p_session_key_hash text,\s*p_hmac_key_version integer,\s*p_session_issued_at timestamp with time zone\s*\)/,
    );
    expect(migration).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.bootstrap_account_generation_identity\(\s*uuid,\s*timestamp with time zone,\s*text,\s*integer,\s*timestamp with time zone\s*\)\s+to\s+service_role/,
    );
    expect(migration).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.bootstrap_account_generation_identity\([\s\S]+?from\s+public,\s*anon,\s*authenticated/,
    );
    expect(migration).toContain("p_session_issued_at <= v_capability.activated_at");
    expect(migration).toContain("perform public.bind_user_session_generation(");
  });
});
