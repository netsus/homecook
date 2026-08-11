import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  AUTH_FLOW_COOKIE_NAME,
  AuthFlowLedgerStore,
  parseAuthFlowCookie,
} from "@/lib/server/full-local-auth/flow-ledger";

const MIGRATION_PATH =
  "supabase/migrations/20260801120000_full_local_auth_db_foundation.sql";
const SESSION_ISSUE_TIME_PRECISION_MIGRATION_PATH =
  "supabase/migrations/20260803090000_full_local_session_issue_time_precision.sql";
const MIGRATIONS_DIRECTORY = "supabase/migrations";
const SECURITY_MANIFEST_PATH =
  "docs/security/full-local-auth-db-security-function-authorization-manifest.json";
const SECURITY_FUNCTION_VALIDATOR_PATH =
  "scripts/validate-security-function-authorization.mjs";
const SECRET = "0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-08-01T10:00:00.000Z");

async function readRefreshAuthorityMigration() {
  const migrationFiles = await readdir(MIGRATIONS_DIRECTORY);
  const refreshMigrationName = migrationFiles.find((file) =>
    file.includes("full_local_session_refresh_authority"),
  );

  return {
    refreshMigrationName,
    migration: refreshMigrationName
      ? await readFile(`${MIGRATIONS_DIRECTORY}/${refreshMigrationName}`, "utf8")
      : "",
  };
}

function clientWithRpc(rpc = vi.fn()) {
  return { client: { rpc }, rpc };
}

describe("full-local Auth flow ledger", () => {
  it("stores only the attempt HMAC and keeps provider data out of the cookie", async () => {
    const { client, rpc } = clientWithRpc(vi.fn().mockResolvedValue({
      data: { inserted: true },
      error: null,
    }));
    const store = new AuthFlowLedgerStore({
      authority: "local",
      client,
      cutoverEpoch: 7,
      hmacSecret: SECRET,
      now: () => NOW,
      randomNonce: () => "nonce-value-never-stored-00000000000000000001",
    });

    const started = await store.start({
      flowKind: "login",
      provider: "custom:naver",
    });

    expect(AUTH_FLOW_COOKIE_NAME).toBe("__Host-homecook-auth-flow");
    expect(started).toMatchObject({
      expiresAt: "2026-08-01T10:15:00.000Z",
      maxAge: 900,
    });
    expect(started.cookieValue).not.toContain("custom:naver");
    expect(started.cookieValue).not.toContain("nonce-value-never-stored");
    expect(rpc).toHaveBeenCalledWith("insert_auth_flow_attempt", {
      p_attempt_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      p_authority: "local",
      p_cutover_epoch: 7,
      p_expires_at: "2026-08-01T10:15:00.000Z",
      p_flow_kind: "login",
      p_issued_at: "2026-08-01T10:00:00.000Z",
      p_provider: "custom:naver",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(
      "nonce-value-never-stored-00000000000000000001",
    );
  });

  it("verifies cookie signatures and rejects expiry before any DB lookup", async () => {
    const { client, rpc } = clientWithRpc();
    const store = new AuthFlowLedgerStore({
      authority: "local",
      client,
      cutoverEpoch: 3,
      hmacSecret: SECRET,
      now: () => NOW,
      randomNonce: () => "another-secure-nonce-000000000000000000000001",
    });
    rpc.mockResolvedValueOnce({ data: { inserted: true }, error: null });
    const started = await store.start({ flowKind: "link", provider: "google" });
    rpc.mockClear();

    expect(parseAuthFlowCookie({
      cookieValue: `${started.cookieValue}tampered`,
      hmacSecret: SECRET,
      now: () => NOW,
    })).toEqual({ ok: false, reason: "invalid" });
    expect(parseAuthFlowCookie({
      cookieValue: started.cookieValue,
      hmacSecret: SECRET,
      now: () => new Date("2026-08-01T10:16:00.000Z"),
    })).toEqual({ ok: false, reason: "expired" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the ledger row as provider and authority truth", async () => {
    const { client, rpc } = clientWithRpc();
    const store = new AuthFlowLedgerStore({
      authority: "local",
      client,
      cutoverEpoch: 11,
      hmacSecret: SECRET,
      now: () => NOW,
      randomNonce: () => "ledger-authority-nonce-0000000000000000000001",
    });
    rpc.mockResolvedValueOnce({ data: { inserted: true }, error: null });
    const started = await store.start({ flowKind: "login", provider: "kakao" });
    rpc.mockResolvedValueOnce({
      data: {
        authority: "local",
        cutover_epoch: 11,
        expires_at: "2026-08-01T10:15:00.000Z",
        flow_kind: "login",
        provider: "kakao",
        terminal_at: null,
        terminal_reason: null,
      },
      error: null,
    });

    await expect(store.read(started.cookieValue)).resolves.toEqual({
      ok: true,
      attempt: expect.objectContaining({
        authority: "local",
        cutover_epoch: 11,
        flow_kind: "login",
        provider: "kakao",
      }),
    });
    expect(rpc).toHaveBeenLastCalledWith("read_auth_flow_attempt", {
      p_attempt_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      p_flow_kind: "login",
    });
  });

  it("fails closed on an RPC error and terminalizes only the signed attempt", async () => {
    const { client, rpc } = clientWithRpc();
    const store = new AuthFlowLedgerStore({
      authority: "local",
      client,
      cutoverEpoch: 2,
      hmacSecret: SECRET,
      now: () => NOW,
      randomNonce: () => "terminal-attempt-nonce-0000000000000000000001",
    });
    rpc.mockResolvedValueOnce({ data: { inserted: true }, error: null });
    const started = await store.start({ flowKind: "login", provider: "google" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
    await expect(store.read(started.cookieValue)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    rpc.mockResolvedValueOnce({
      data: { terminal_reason: "cancelled" },
      error: null,
    });
    await expect(
      store.terminal(started.cookieValue, "cancelled"),
    ).resolves.toEqual({ ok: true, terminalReason: "cancelled" });
    expect(rpc).toHaveBeenLastCalledWith("terminal_auth_flow_attempt", {
      p_attempt_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      p_flow_kind: "login",
      p_now: "2026-08-01T10:00:00.000Z",
      p_terminal_reason: "cancelled",
    });
  });

  it("terminalizes a valid pre-cutover cookie without trusting its old authority", async () => {
    const { client, rpc } = clientWithRpc();
    const remoteStore = new AuthFlowLedgerStore({
      authority: "remote",
      client,
      cutoverEpoch: 8,
      hmacSecret: SECRET,
      now: () => NOW,
      randomNonce: () => "pre-cutover-nonce-00000000000000000000000001",
    });
    rpc.mockResolvedValueOnce({ data: { inserted: true }, error: null });
    const started = await remoteStore.start({
      flowKind: "login",
      provider: "google",
    });
    const localStore = new AuthFlowLedgerStore({
      authority: "local",
      client,
      cutoverEpoch: 9,
      hmacSecret: SECRET,
      now: () => NOW,
    });
    rpc.mockResolvedValueOnce({
      data: { terminal_reason: "cutover_rejected" },
      error: null,
    });

    await expect(
      localStore.terminal(started.cookieValue, "cutover_rejected"),
    ).resolves.toEqual({
      ok: true,
      terminalReason: "cutover_rejected",
    });
    expect(rpc).toHaveBeenLastCalledWith("terminal_auth_flow_attempt", {
      p_attempt_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      p_flow_kind: "login",
      p_now: "2026-08-01T10:00:00.000Z",
      p_terminal_reason: "cutover_rejected",
    });
  });

  it("expires and counts remote outstanding flows through the scoped RPC", async () => {
    const { client, rpc } = clientWithRpc(vi.fn().mockResolvedValue({
      data: { expired_count: 2, outstanding_count: 0 },
      error: null,
    }));
    const store = new AuthFlowLedgerStore({
      authority: "remote",
      client,
      cutoverEpoch: 1,
      hmacSecret: SECRET,
      now: () => NOW,
    });

    await expect(store.outstanding(NOW)).resolves.toEqual({
      ok: true,
      result: { expiredCount: 2, outstandingCount: 0 },
    });
    expect(rpc).toHaveBeenCalledWith("expire_and_count_remote_auth_flows", {
      p_cutover_started_at: NOW.toISOString(),
      p_now: NOW.toISOString(),
    });
    await expect(
      store.outstanding(new Date("2026-08-01T10:00:06.000Z")),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });
});

describe("full-local Auth DB migration contract", () => {
  it("compares privileged operator grants from explicit ACLs, not effective superuser access", async () => {
    const validator = await readFile(SECURITY_FUNCTION_VALIDATOR_PATH, "utf8");

    expect(validator).toContain(
      "from pg_catalog.aclexplode(procedure.proacl)",
    );
    expect(validator).toContain("grantee_role.rolname = 'supabase_admin'");
    expect(validator).not.toMatch(
      /has_function_privilege\('supabase_admin'/u,
    );
  });

  it("classifies every new database function in the security inventory", async () => {
    const manifest = JSON.parse(
      await readFile(SECURITY_MANIFEST_PATH, "utf8"),
    ) as {
      functions: Array<{
        allowed_principals: string[];
        signature: string;
      }>;
    };

    expect(manifest.functions).toHaveLength(19);
    expect(manifest.functions.map((entry) => entry.signature)).toEqual(
      expect.arrayContaining([
        "public.read_auth_flow_attempt(text, text)",
        "public.start_full_local_auth_cutover(bigint, text, timestamp with time zone)",
        "public.activate_full_local_auth_authority(bigint, integer, text, timestamp with time zone)",
        "public.record_full_local_session_authority(text, uuid, timestamp with time zone, text, integer, bigint, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone)",
        "private.protect_full_local_session_binding_identity()",
        "private.hydrate_full_local_session_token_evidence()",
        "private.revoke_full_local_bindings_on_lifecycle_exit()",
        "private.revoke_full_local_bindings_on_auth_identity_change()",
        "public.record_full_local_session_authority_v2(text, uuid, timestamp with time zone, uuid, text, integer, bigint, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone)",
        "public.assert_and_renew_full_local_session_authority_v2(text, uuid, timestamp with time zone, uuid, text, integer, bigint, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone)",
        "private.assert_full_local_session_observability_scope()",
        "public.record_full_local_session_stale_observation(text)",
        "public.read_full_local_session_observation()",
      ]),
    );
    for (const entry of manifest.functions) {
      expect(entry.allowed_principals).toEqual(
        entry.signature.startsWith("private.")
          ? []
          : entry.signature === "public.read_full_local_session_observation()"
            ? ["service_role", "supabase_admin"]
            : ["service_role"],
      );
    }
  });

  it("creates a private HMAC-only flow ledger with exact constraints", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();
    const tableDefinition = migration.match(
      /create table private\.auth_flow_attempts \([\s\S]+?\n\);/u,
    )?.[0] ?? "";

    expect(tableDefinition).not.toBe("");
    expect(tableDefinition).toMatch(
      /primary key \(attempt_hash, flow_kind\)/u,
    );
    expect(tableDefinition).toContain("attempt_hash ~ '^[0-9a-f]{64}$'");
    expect(tableDefinition).toContain("flow_kind in ('login', 'link')");
    expect(tableDefinition).toContain(
      "provider in ('google', 'kakao', 'custom:naver')",
    );
    expect(tableDefinition).toContain("authority in ('remote', 'local')");
    expect(tableDefinition).toContain(
      "expires_at = issued_at + interval '900 seconds'",
    );
    expect(tableDefinition).not.toMatch(
      /oauth_code|access_token|refresh_token|email/iu,
    );
  });

  it("keeps table access private and grants only scoped RPC execution", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    expect(migration).toMatch(
      /revoke all on table private\.auth_flow_attempts[\s\S]+?from public, anon, authenticated, service_role/u,
    );
    for (const functionName of [
      "insert_auth_flow_attempt",
      "read_auth_flow_attempt",
      "terminal_auth_flow_attempt",
      "expire_and_count_remote_auth_flows",
    ]) {
      expect(migration).toMatch(
        new RegExp(`grant execute[\\s\\S]+?${functionName}\\([\\s\\S]+?to service_role`, "u"),
      );
      expect(migration).toMatch(
        new RegExp(`revoke all[\\s\\S]+?${functionName}\\([\\s\\S]+?from public, anon, authenticated`, "u"),
      );
    }
    expect(migration).toContain("expires_at > clock_timestamp()");
    expect(migration).toContain("issued_at <= p_cutover_started_at");

    const readFunction = migration.match(
      /create or replace function public\.read_auth_flow_attempt\([\s\S]+?\$function\$;/u,
    )?.[0] ?? "";
    expect(readFunction).not.toBe("");
    expect(readFunction).not.toMatch(/\bupdate\b|for update/iu);
  });

  it("keeps one private authority state for atomic flow and session cutover", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    expect(migration).toContain("create table private.full_local_auth_control");
    expect(migration).toContain("authority text not null");
    expect(migration).toContain("cutover_epoch bigint not null");
    expect(migration).toContain("hmac_key_version integer not null");
    expect(migration).toContain("flows_open boolean not null");
    expect(migration).toContain("local_activated_at timestamptz");
    expect(migration).toContain("staged_auth_count bigint");
    expect(migration).toContain("staged_auth_digest text");
    expect(migration).toContain("create or replace function public.start_full_local_auth_cutover");
    expect(migration).toContain("create or replace function public.activate_full_local_auth_authority");
    expect(migration).toContain("lock table auth.users in share row exclusive mode");
    expect(migration).toContain("v_live_auth_count is distinct from p_expected_auth_count");
    expect(migration).toContain("v_live_auth_digest is distinct from v_control.staged_auth_digest");
    expect(migration).toContain("v_outstanding_count <> 0");
  });

  it("adds local session authority without deleting hybrid recovery artifacts", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    expect(migration).toContain("add column auth_authority text");
    expect(migration).toContain("add column local_issuer text");
    expect(migration).toContain("add column local_verified_at timestamptz");
    expect(migration).toContain("add column auth_cutover_epoch bigint");
    expect(migration).toContain("add column session_issued_at timestamptz");
    expect(migration).not.toContain(
      "drop constraint if exists user_session_generation_bindings_epoch_fkey",
    );
    expect(migration).not.toMatch(/drop table.*remote_auth_identity_epochs/iu);
    expect(migration).not.toMatch(/drop function.*hybrid/iu);
    expect(migration).toContain("local_issuer is not null");
    expect(migration).toContain("issuer is null");
    expect(migration).toContain("from auth.users as auth_user");
    expect(migration).toContain("auth_user.id = p_owner_uuid");
    expect(migration).toContain(
      "v_auth_created_at is distinct from p_identity_created_at",
    );
    expect(migration).toContain("p_session_issued_at < v_control.local_activated_at");
    expect(migration).toContain("p_session_issued_at < p_identity_created_at");
    expect(migration).toContain("p_session_issued_at <= v_generation_activated_at");
    expect(migration).toContain("v_capability_state is distinct from 'generation_active'");
    expect(migration).toContain("create trigger protect_full_local_session_binding_identity");
    expect(migration).toContain("create trigger revoke_full_local_bindings_on_lifecycle_exit");
    expect(migration).toContain("create trigger revoke_full_local_bindings_on_auth_identity_change");
  });

  it("accepts only the exact JWT second that contains the Auth identity epoch", async () => {
    const migration = (await readFile(
      SESSION_ISSUE_TIME_PRECISION_MIGRATION_PATH,
      "utf8",
    )).toLowerCase();

    expect(migration.match(
      /p_session_issued_at < date_trunc\('second', p_identity_created_at\)/gu,
    )).toHaveLength(2);
    expect(migration).not.toMatch(
      /p_session_issued_at < p_identity_created_at(?:\s|then)/u,
    );
    expect(migration).toContain(
      "v_auth_created_at is distinct from p_identity_created_at",
    );
    expect(migration).toContain(
      "v_binding.session_issued_at is distinct from p_session_issued_at",
    );
  });

  it("requires a dedicated additive v2 session refresh migration instead of mutating the old exact-iat file in place", async () => {
    const migrationFiles = await readdir(MIGRATIONS_DIRECTORY);
    const refreshMigrations = migrationFiles.filter((file) =>
      file.includes("full_local_session_refresh_authority"),
    );

    expect(refreshMigrations).toHaveLength(1);
    expect(refreshMigrations[0]).toMatch(
      /^[0-9]{14}_full_local_session_refresh_authority\.sql$/u,
    );
  });

  it("pins exact v2 local authority RPC signatures with named monotonic token evidence", async () => {
    const { refreshMigrationName, migration } = await readRefreshAuthorityMigration();
    expect(refreshMigrationName).toBeDefined();
    const normalized = migration.toLowerCase();

    expect(normalized).toContain(
      "create or replace function public.record_full_local_session_authority_v2(",
    );
    expect(normalized).toContain(
      "create or replace function public.assert_and_renew_full_local_session_authority_v2(",
    );
    expect(normalized).toContain("p_session_id uuid");
    expect(normalized).toContain("p_verified_at timestamptz");
    expect(normalized).toContain("p_last_token_issued_at timestamptz");
    expect(normalized).toContain("p_access_token_expires_at timestamptz");
    expect(normalized).toContain("p_binding_expires_at timestamptz");
    for (const signature of [
      "record_full_local_session_authority_v2",
      "assert_and_renew_full_local_session_authority_v2",
    ]) {
      const parameterBlock = normalized.match(
        new RegExp(
          `create or replace function public\\.${signature}\\(([^)]*)\\)`,
          "u",
        ),
      )?.[1] ?? "";
      expect(parameterBlock.split(",").map((part) => part.trim()).filter(Boolean)).toHaveLength(12);
    }
  });

  it("records refresh-safe fields for browser-first first request and late older token rejection only in the additive refresh migration", async () => {
    const { refreshMigrationName, migration } = await readRefreshAuthorityMigration();
    expect(refreshMigrationName).toBeDefined();
    const normalized = migration.toLowerCase();

    expect(normalized).toContain("last_token_issued_at");
    expect(normalized).toContain("binding_expires_at");
    expect(normalized).toContain("greatest");
    expect(normalized).toMatch(/binding_state[\s\S]*active/iu);
    expect(normalized).toMatch(/revoked_at[\s\S]*is null/iu);
    expect(normalized).toContain("account_session_stale");
  });

  it("replaces the legacy exact-signature assert wrapper with latest-token compatibility only in the additive refresh migration", async () => {
    const { refreshMigrationName, migration } = await readRefreshAuthorityMigration();
    expect(refreshMigrationName).toBeDefined();
    const normalized = migration.toLowerCase();

    expect(normalized).toContain(
      "create or replace function public.assert_full_local_session_authority(",
    );
    expect(normalized).toContain("v_binding.last_token_issued_at is distinct from p_session_issued_at");
    expect(normalized).toContain("p_session_issued_at < v_binding.session_issued_at");
    expect(normalized).not.toContain("v_binding.session_issued_at is distinct from p_session_issued_at");
  });

  it("exposes service-only local bind, assert, and idempotent revoke RPCs", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    for (const functionName of [
      "record_full_local_session_authority",
      "assert_full_local_session_authority",
      "revoke_full_local_session_authority",
    ]) {
      expect(migration).toMatch(
        new RegExp(`function public\\.${functionName}\\(`, "u"),
      );
      expect(migration).toMatch(
        new RegExp(`grant execute[\\s\\S]+?${functionName}\\([\\s\\S]+?to service_role`, "u"),
      );
    }
    expect(migration).toContain(
      "v_binding.binding_state is distinct from 'active'",
    );
    expect(migration).toContain(
      "v_already_revoked := v_binding.binding_state = 'revoked'",
    );
    expect(migration).toContain("binding_expires_at < clock_timestamp()");
    expect(migration).toContain(
      "v_binding.auth_cutover_epoch is distinct from v_control.cutover_epoch",
    );
    expect(migration).toContain(
      "v_binding.session_issued_at is distinct from p_session_issued_at",
    );
    expect(migration).toContain("'already_revoked'");
  });
});
