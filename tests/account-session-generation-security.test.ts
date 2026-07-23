import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260723140000_account_session_generation_foundation.sql";

describe("account session generation security boundary", () => {
  it("splits the invoker auth hook wrapper from its NOLOGIN definer guard", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();
    const guard = migration.match(
      /function account_generation_auth_hook\.assert_identity_creation_allowed\(\)([\s\S]*?)\$function\$;/,
    )?.[1] ?? "";
    const wrapper = migration.match(
      /function account_generation_auth_hook\.before_user_created\(event jsonb\)([\s\S]*?)\$function\$;/,
    )?.[1] ?? "";

    expect(migration).toContain("create role homecook_auth_hook_guard_owner nologin");
    expect(guard).toContain("security definer");
    expect(guard).toContain("pg_advisory_xact_lock_shared");
    expect(guard).toContain("from public.account_generation_capability_state");
    expect(guard).not.toContain("for key share");
    expect(wrapper).toContain("returns jsonb");
    expect(wrapper).toContain("security invoker");
    expect(wrapper).toContain(
      "account_generation_auth_hook.assert_identity_creation_allowed()",
    );
    expect(migration).toMatch(
      /alter\s+function\s+account_generation_auth_hook\.assert_identity_creation_allowed\(\)\s+owner\s+to\s+homecook_auth_hook_guard_owner/,
    );

    const temporaryMembershipGrant = migration.search(
      /execute\s+format\(\s*'grant homecook_auth_hook_guard_owner to %i with inherit false, set true granted by %i',\s*current_user,\s*current_user\s*\)/,
    );
    const guardExecuteRevoke = migration.search(
      /revoke\s+execute\s+on\s+function\s+account_generation_auth_hook\.assert_identity_creation_allowed\(\)\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/,
    );
    const guardExecuteGrant = migration.search(
      /grant\s+execute\s+on\s+function\s+account_generation_auth_hook\.assert_identity_creation_allowed\(\)\s+to\s+supabase_auth_admin/,
    );
    const temporarySchemaCreateGrant = migration.indexOf(
      "grant create on schema account_generation_auth_hook\n  to homecook_auth_hook_guard_owner;",
    );
    const ownerTransfer = migration.indexOf(
      "alter function account_generation_auth_hook.assert_identity_creation_allowed()\n  owner to homecook_auth_hook_guard_owner;",
    );
    const temporarySchemaCreateRevoke = migration.indexOf(
      "revoke create on schema account_generation_auth_hook\n  from homecook_auth_hook_guard_owner;",
    );
    const temporaryMembershipRevoke = migration.search(
      /execute\s+format\(\s*'revoke homecook_auth_hook_guard_owner from %i granted by %i',\s*current_user,\s*current_user\s*\)/,
    );

    expect(guardExecuteRevoke).toBeGreaterThan(-1);
    expect(guardExecuteGrant).toBeGreaterThan(guardExecuteRevoke);
    expect(temporaryMembershipGrant).toBeGreaterThan(guardExecuteGrant);
    expect(temporarySchemaCreateGrant).toBeGreaterThan(
      temporaryMembershipGrant,
    );
    expect(ownerTransfer).toBeGreaterThan(temporarySchemaCreateGrant);
    expect(temporarySchemaCreateRevoke).toBeGreaterThan(ownerTransfer);
    expect(temporaryMembershipRevoke).toBeGreaterThan(
      temporarySchemaCreateRevoke,
    );
    expect(migration).toMatch(
      /server_version_num[\s\S]+?pg_has_role\([\s\S]+?'set'[\s\S]+?'usage'[\s\S]+?'member'[\s\S]+?raise\s+exception\s+'migration runner retained set-capable auth hook membership'/,
    );
    expect(migration).toMatch(
      /has_schema_privilege\(\s*'homecook_auth_hook_guard_owner',\s*'account_generation_auth_hook',\s*'create'\s*\)[\s\S]+?raise exception 'auth hook guard owner retained schema create'/,
    );
  });

  it("rejects an unsafe preexisting hook owner without privileged role mutation", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    expect(migration).not.toMatch(
      /alter\s+role\s+homecook_auth_hook_guard_owner[\s\S]{0,160}(?:nosuperuser|noreplication|nobypassrls)/,
    );
    expect(migration).toMatch(
      /rolname\s*=\s*'homecook_auth_hook_guard_owner'[\s\S]+?rolcanlogin[\s\S]+?rolsuper[\s\S]+?rolcreatedb[\s\S]+?rolcreaterole[\s\S]+?rolinherit[\s\S]+?rolreplication[\s\S]+?rolbypassrls[\s\S]+?raise exception 'homecook auth hook guard owner has unsafe attributes'/,
    );
  });

  it("grants the exact hook calls only to supabase_auth_admin", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    expect(migration).toMatch(
      /grant\s+execute\s+on\s+function\s+account_generation_auth_hook\.before_user_created\(jsonb\)\s+to\s+supabase_auth_admin/,
    );
    expect(migration).toMatch(
      /grant\s+execute\s+on\s+function\s+account_generation_auth_hook\.assert_identity_creation_allowed\(\)\s+to\s+supabase_auth_admin/,
    );
    expect(migration).toMatch(
      /revoke\s+execute\s+on\s+function\s+account_generation_auth_hook\.before_user_created\(jsonb\)[\s\S]+?from\s+public,\s*anon,\s*authenticated,\s*service_role/,
    );
    expect(migration).toMatch(
      /revoke\s+execute\s+on\s+function\s+account_generation_auth_hook\.assert_identity_creation_allowed\(\)[\s\S]+?from\s+public,\s*anon,\s*authenticated,\s*service_role/,
    );
  });

  it("locks legacy mutations before reading the singleton for key share", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();
    const guard = migration.match(
      /function public\.assert_legacy_account_generation_write\(\)([\s\S]*?)\$function\$;/,
    )?.[1] ?? "";

    expect(guard).toContain("volatile");
    expect(guard).toContain("security definer");
    expect(guard).toContain("current_setting('transaction_isolation')");
    expect(guard).toContain("pg_advisory_xact_lock_shared");
    expect(guard).toMatch(
      /pg_advisory_xact_lock_shared[\s\S]+?from public\.account_generation_capability_state[\s\S]+?for key share/,
    );
    expect(guard).toContain("v_state <> 'legacy'");
    expect(migration).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.assert_legacy_account_generation_write\(\)[\s\S]+?from\s+public,\s*anon,\s*authenticated,\s*service_role/,
    );
  });

  it("exposes a fail-closed capability read without restoring direct table access", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();
    const reader = migration.match(
      /function public\.get_account_generation_capability\(\)([\s\S]*?)\$function\$;/,
    )?.[1] ?? "";

    expect(reader).toContain("returns jsonb");
    expect(reader).toContain("stable");
    expect(reader).toContain("security definer");
    expect(reader).toContain("set search_path = pg_catalog, public, pg_temp");
    expect(reader).toContain("from public.account_generation_capability_state");
    expect(reader).toContain("capability state is unavailable");
    expect(migration).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.get_account_generation_capability\(\)[\s\S]+?from\s+public,\s*anon,\s*authenticated/,
    );
    expect(migration).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.get_account_generation_capability\(\)\s+to\s+service_role/,
    );
  });

  it("preserves the historical service-role cleanup grant until joint activation", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    expect(migration).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.delete_user_private_data\(uuid\)\s+from\s+public,\s*anon,\s*authenticated\s*;/,
    );
    expect(migration).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.delete_user_private_data\(uuid\)\s+to\s+service_role\s*;/,
    );
    expect(migration).not.toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.delete_user_private_data\(uuid\)[\s\S]{0,120}from[\s\S]{0,80}service_role/,
    );
  });
});
