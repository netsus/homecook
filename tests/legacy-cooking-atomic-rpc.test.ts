import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260815120000_legacy_product_compat_atomic_completion.sql",
);
const securityManifestPath = join(
  process.cwd(),
  "docs/security/legacy-product-compat-security-function-authorization-manifest.json",
);

function readMigration() {
  expect(existsSync(migrationPath), "#13 additive RPC migration is missing").toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("legacy cooking atomic compatibility RPC", () => {
  it("creates only the two exact additive service-role signatures", () => {
    const sql = readMigration();

    expect(sql).toMatch(/complete_cooking_session\s*\(\s*p_owner_uuid uuid,\s*p_auth_identity_created_at_snapshot timestamptz,\s*p_session_key_hash text,\s*p_hmac_key_version integer,\s*p_session_issued_at timestamptz,\s*p_session_id uuid,\s*p_consumed_ingredient_ids uuid\[\],\s*p_idempotency_key uuid,\s*p_now timestamptz/iu);
    expect(sql).toMatch(/complete_standalone_cooking\s*\(\s*p_owner_uuid uuid,\s*p_auth_identity_created_at_snapshot timestamptz,\s*p_session_key_hash text,\s*p_hmac_key_version integer,\s*p_session_issued_at timestamptz,\s*p_recipe_id uuid,\s*p_cooking_servings integer,\s*p_consumed_ingredient_ids uuid\[\],\s*p_idempotency_key uuid,\s*p_now timestamptz/iu);
    expect(sql).not.toMatch(/create\s+table|alter\s+table[\s\S]*add\s+column/iu);
  });

  it("checks role, input, session authority, and stored version before every writer", () => {
    const sql = readMigration();
    const authority = sql.indexOf("assert_recipe_future_session_authority");
    const bootstrap = sql.indexOf("bootstrap_account_generation_identity");
    const claim = sql.indexOf("claim_cooked_batch_operation");
    const completionWrite = sql.indexOf("insert into public.leftover_dishes");
    const progressWrite = sql.indexOf("project_cooked_batch_progress_activity");

    expect(sql).toMatch(/auth\.role\(\)[\s\S]*service_role/iu);
    expect(sql).toMatch(/contract_version\s*=\s*'legacy_v1'/iu);
    expect(authority).toBeGreaterThanOrEqual(0);
    expect(claim).toBeGreaterThan(authority);
    expect(bootstrap).toBeGreaterThan(claim);
    expect(completionWrite).toBeGreaterThan(bootstrap);
    expect(progressWrite).toBeGreaterThan(completionWrite);
  });

  it("keeps completion, progress, and durable receipt finish in one transaction", () => {
    const sql = readMigration();

    expect(sql).toMatch(/project_cooked_batch_progress_activity\s*\(/iu);
    expect(sql).toMatch(/finish_cooked_batch_operation\s*\(/iu);
    expect(sql).toMatch(/cooking_completed/iu);
    expect(sql).toMatch(/claim_cooked_batch_operation[\s\S]*finish_cooked_batch_operation/iu);
    expect(sql).toMatch(/p_idempotency_key is null[\s\S]*record_internal_operational_event[\s\S]*legacy_cooking_completion_missing_idempotency_key/iu);
  });

  it("rejects deleted and other-owner private standalone recipes before claim or bootstrap", () => {
    const sql = readMigration();
    const standaloneRecipeRead = sql.indexOf("select recipe.* into v_recipe");
    const deletedGuard = sql.indexOf("v_recipe.deleted_at is not null", standaloneRecipeRead);
    const privateGuard = sql.indexOf("v_recipe.visibility = 'private'", standaloneRecipeRead);
    const ownerGuard = sql.indexOf(
      "v_recipe.created_by is distinct from p_owner_uuid",
      standaloneRecipeRead,
    );
    const claim = sql.indexOf("claim_cooked_batch_operation", standaloneRecipeRead);
    const bootstrap = sql.indexOf(
      "bootstrap_account_generation_identity",
      standaloneRecipeRead,
    );

    expect(standaloneRecipeRead).toBeGreaterThanOrEqual(0);
    expect(deletedGuard).toBeGreaterThan(standaloneRecipeRead);
    expect(privateGuard).toBeGreaterThan(deletedGuard);
    expect(ownerGuard).toBeGreaterThan(privateGuard);
    expect(claim).toBeGreaterThan(ownerGuard);
    expect(bootstrap).toBeGreaterThan(claim);
  });

  it("applies the recipe-owner lifecycle visibility upper bound before claim", () => {
    const sql = readMigration();
    const standaloneRecipeRead = sql.indexOf("select recipe.* into v_recipe");
    const lifecycleRead = sql.indexOf(
      "from public.user_account_lifecycles as recipe_owner_lifecycle",
      standaloneRecipeRead,
    );
    const activeGuard = sql.indexOf(
      "v_recipe_owner_lifecycle_status is distinct from 'active'",
      lifecycleRead,
    );
    const claim = sql.indexOf("claim_cooked_batch_operation", standaloneRecipeRead);

    expect(lifecycleRead).toBeGreaterThan(standaloneRecipeRead);
    expect(activeGuard).toBeGreaterThan(lifecycleRead);
    expect(claim).toBeGreaterThan(activeGuard);
  });

  it("locks both new functions to postgres-owned service_role execution", () => {
    const sql = readMigration();

    expect(sql).toMatch(/create or replace function public\.complete_cooking_session[\s\S]*?language sql volatile security definer[\s\S]*?set search_path = pg_catalog, public, private, pg_temp/iu);
    expect(sql).toMatch(/create or replace function public\.complete_standalone_cooking[\s\S]*?language sql volatile security definer[\s\S]*?set search_path = pg_catalog, public, private, pg_temp/iu);
    expect(sql).toMatch(/alter function public\.complete_cooking_session\([^;]+\) owner to postgres/iu);
    expect(sql).toMatch(/alter function public\.complete_standalone_cooking\([^;]+\) owner to postgres/iu);
    expect(sql).toMatch(/revoke all on function public\.complete_cooking_session\([^;]+\)[\s\S]*?from public, anon, authenticated, service_role/iu);
    expect(sql).toMatch(/revoke all on function public\.complete_standalone_cooking\([^;]+\)[\s\S]*?from public, anon, authenticated, service_role/iu);
    expect(sql).toMatch(/grant execute on function public\.complete_cooking_session\([^;]+\)[\s\S]*?to service_role/iu);
    expect(sql).toMatch(/grant execute on function public\.complete_standalone_cooking\([^;]+\)[\s\S]*?to service_role/iu);
  });

  it("registers every new or replaced function in the central security contract", () => {
    expect(
      existsSync(securityManifestPath),
      "#13 security function manifest is missing",
    ).toBe(true);
    if (!existsSync(securityManifestPath)) return;

    const manifest = JSON.parse(readFileSync(securityManifestPath, "utf8")) as {
      functions: Array<{
        signature: string;
        allowed_principals: string[];
        owner: string;
      }>;
    };
    const bySignature = new Map(
      manifest.functions.map((entry) => [entry.signature, entry]),
    );
    const planner = bySignature.get(
      "public.complete_cooking_session(uuid, timestamp with time zone, text, integer, timestamp with time zone, uuid, uuid[], uuid, timestamp with time zone)",
    );
    const standalone = bySignature.get(
      "public.complete_standalone_cooking(uuid, timestamp with time zone, text, integer, timestamp with time zone, uuid, integer, uuid[], uuid, timestamp with time zone)",
    );

    expect(planner).toMatchObject({
      allowed_principals: ["service_role"],
      owner: "postgres",
    });
    expect(standalone).toMatchObject({
      allowed_principals: ["service_role"],
      owner: "postgres",
    });

    const validator = readFileSync(
      join(process.cwd(), "scripts/validate-security-function-authorization.mjs"),
      "utf8",
    );
    expect(validator).toContain(
      "legacy-product-compat-security-function-authorization-manifest.json",
    );
  });
});
