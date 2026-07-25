import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260724130000_recipe_image_upload_reservation.sql",
);

describe("recipe image upload reservation migration", () => {
  it("keeps image idempotency and generation quota authority durable", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);

    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(
      /create table if not exists public\.mutation_idempotency_keys/i,
    );
    expect(sql).toMatch(
      /unique\s*\(\s*owner_uuid,\s*account_generation,\s*operation_scope,\s*key_hash\s*\)/i,
    );
    expect(sql).toMatch(
      /create table if not exists public\.image_upload_quota_counters/i,
    );
    expect(sql).toMatch(
      /primary key\s*\(\s*owner_uuid,\s*account_generation\s*\)/i,
    );
    expect(sql).toMatch(/quota_released_at timestamp with time zone/i);
    expect(sql).toMatch(
      /revoke all on table\s+public\.mutation_idempotency_keys[\s\S]*public\.image_upload_quota_counters[\s\S]*from public, anon, authenticated, service_role/i,
    );
  });

  it("reserves exact quotas before a deterministic private upload attempt", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.reserve_recipe_image_upload\(/i,
    );
    expect(sql).toMatch(/account_generation_capability_state/i);
    expect(sql).toMatch(/user_session_generation_bindings/i);
    expect(sql).toMatch(/user_account_lifecycles/i);
    expect(sql).toMatch(/interval '10 minutes'/i);
    expect(sql).toMatch(/104857600/i);
    expect(sql).toMatch(/active_reservation_count\s*>=\s*20/i);
    expect(sql).toMatch(/storage_object_deletion_outbox/i);
    expect(sql).toMatch(/state\s*=\s*'dead_letter'/i);
    expect(sql).toMatch(/v_backlog_count\s*>=\s*500/i);
    expect(sql).toMatch(/interval '15 minutes'/i);
    expect(sql).toMatch(/interval '5 minutes'/i);
    expect(sql).toMatch(/recipe-images-private/i);
    expect(sql).toMatch(/pending_upload/i);
    expect(sql).toMatch(/p_payload_hash is null/i);
    expect(sql).toMatch(/p_raw_sha256 is null/i);
    expect(sql).toMatch(/p_actual_mime_type is null/i);
    expect(sql).toMatch(/p_extension is null/i);
  });

  it("replays live attempts, takes over expired leases, and never recharges quota", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(/IDEMPOTENCY_KEY_REUSED/i);
    expect(sql).toMatch(/in_progress/i);
    expect(sql).toMatch(/live_replay/i);
    expect(sql).toMatch(/takeover/i);
    expect(sql).toMatch(
      /update public\.mutation_idempotency_keys[\s\S]*attempt_token[\s\S]*lease_expires_at/i,
    );
    expect(sql).toMatch(
      /update public\.recipe_image_objects[\s\S]*upload_attempt_token[\s\S]*upload_lease_expires_at/i,
    );
  });

  it("finalizes and releases only the exact generation, object, and attempt once", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.finalize_recipe_image_upload\(/i,
    );
    expect(sql).toMatch(
      /idempotency\.state\s*=\s*'in_progress'[\s\S]*idempotency\.attempt_token\s*=\s*p_attempt_token/i,
    );
    expect(sql).toMatch(
      /object\.state\s*=\s*'pending_upload'[\s\S]*object\.upload_attempt_token\s*=\s*p_attempt_token[\s\S]*object\.cleanup_generation\s*=\s*p_cleanup_generation/i,
    );
    expect(sql).toMatch(/interval '24 hours'/i);
    expect(sql).toMatch(
      /create or replace function public\.release_recipe_image_upload_reservation\(/i,
    );
    expect(sql).toMatch(/quota_released_at is null/i);
    expect(sql).toMatch(
      /active_reservation_count\s*=\s*greatest\(\s*active_reservation_count\s*-\s*1,\s*0\s*\)/i,
    );
  });

  it("keeps all upload mutation functions service-internal", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    for (const signature of [
      "reserve_recipe_image_upload",
      "finalize_recipe_image_upload",
      "release_recipe_image_upload_reservation",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${signature}\\([\\s\\S]*?from public, anon, authenticated, service_role[\\s\\S]*?grant execute on function public\\.${signature}\\([\\s\\S]*?to service_role`,
          "i",
        ),
      );
    }
  });
});
