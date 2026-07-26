import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260724160000_recipe_image_cancel_cas.sql",
);
const LIFECYCLE_ERROR_MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260724170000_recipe_image_cancel_lifecycle_errors.sql",
);

describe("recipe image cancel CAS authority", () => {
  it("requires active session-generation authority and a generation-scoped key", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(
      /create or replace function public\.cancel_recipe_image_upload\(/i,
    );
    expect(sql).toMatch(/transaction_isolation[\s\S]*read committed/i);
    expect(sql).toMatch(
      /pg_advisory_xact_lock_shared[\s\S]*account_generation_capability_state[\s\S]*generation_active/i,
    );
    expect(sql).toMatch(
      /user_account_lifecycles[\s\S]*status is distinct from 'active'[\s\S]*user_session_generation_bindings/i,
    );
    expect(sql).toMatch(
      /operation_scope\s*=\s*'recipe_image_cancel'[\s\S]*key_hash[\s\S]*payload_hash/i,
    );
  });

  it("lets only the exact owner cancel an unreferenced live object", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(
      /object\.id\s*=\s*p_image_object_id[\s\S]*object\.owner_uuid\s*=\s*p_owner_uuid[\s\S]*object\.account_generation\s*=\s*v_lifecycle\.account_generation[\s\S]*object\.visibility\s*=\s*'private'/i,
    );
    expect(sql).toMatch(
      /object\.state in \('pending_upload', 'uploaded_unlinked'\)/i,
    );
    expect(sql).toMatch(
      /v_object\.state = 'pending_upload'[\s\S]*v_upload_idempotency\.state <> 'in_progress'[\s\S]*v_upload_idempotency\.attempt_token\s+is distinct from v_object\.upload_attempt_token/i,
    );
    expect(sql).toMatch(
      /v_object\.state = 'uploaded_unlinked'[\s\S]*v_upload_idempotency\.state <> 'succeeded'/i,
    );
    expect(sql).toMatch(
      /not exists \([\s\S]*recipe_image_object_references[\s\S]*image_object_id\s*=\s*p_image_object_id/i,
    );
    expect(sql).toMatch(
      /state\s*=\s*'cleanup_pending'[\s\S]*cleanup_generation\s*=\s*v_next_cleanup_generation[\s\S]*upload_attempt_token\s*=\s*null[\s\S]*unlinked_cleanup_after\s*=\s*null/i,
    );
    expect(sql).toMatch(
      /update public\.mutation_idempotency_keys[\s\S]*state\s*=\s*'cancelled'[\s\S]*terminal_result\s*=\s*'cleanup_pending'[\s\S]*v_object\.state = 'uploaded_unlinked'[\s\S]*idempotency\.state = 'succeeded'/i,
    );
  });

  it("persists replay, enqueues cleanup, and releases the upload reservation", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/public\.enqueue_recipe_image_cleanup\(/i);
    expect(sql).toMatch(/'owner_cancelled'/i);
    expect(sql).toMatch(
      /public\.release_recipe_image_upload_reservation\(/i,
    );
    expect(sql).toMatch(
      /insert into public\.mutation_idempotency_keys[\s\S]*'recipe_image_cancel'[\s\S]*'succeeded'[\s\S]*v_result/i,
    );
    expect(sql).toMatch(
      /v_idempotency\.state = 'succeeded'[\s\S]*return v_idempotency\.durable_result/i,
    );
  });

  it("keeps cancel service-only with a hardened search path", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(
      /set search_path\s*=\s*pg_catalog,\s*public,\s*extensions,\s*pg_temp/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.cancel_recipe_image_upload\([\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.cancel_recipe_image_upload\([\s\S]*to service_role/i,
    );
  });

  it("preserves exact lifecycle errors before any image mutation", () => {
    expect(existsSync(LIFECYCLE_ERROR_MIGRATION_PATH)).toBe(true);
    if (!existsSync(LIFECYCLE_ERROR_MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(LIFECYCLE_ERROR_MIGRATION_PATH, "utf8");
    expect(sql).toMatch(
      /owner_uuid is null[\s\S]*ACCOUNT_CUTOVER_UNCLASSIFIED/i,
    );
    expect(sql).toMatch(
      /status = 'quarantined'[\s\S]*ACCOUNT_CUTOVER_QUARANTINED/i,
    );
    expect(sql).toMatch(
      /status in \('deleting', 'cleanup_pending', 'complete'\)[\s\S]*ACCOUNT_DELETING/i,
    );
    expect(sql).toMatch(
      /status is distinct from 'active'[\s\S]*ACCOUNT_SESSION_STALE/i,
    );
  });
});
