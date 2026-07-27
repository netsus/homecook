import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260724310000_recipe_image_compact_retention_authority.sql";

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8").catch(() => "");
}

describe("recipe image compact retention authority", () => {
  it("bounds compaction to terminal objects older than 90 days with a recent terminal recheck", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /create or replace function public\.compact_recipe_image_retention_details\(/i,
    );
    expect(migration).toMatch(
      /p_limit[\s\S]*p_limit < 1[\s\S]*p_limit > 50/i,
    );
    expect(migration).toMatch(
      /state in \('deleted', 'verified_not_found'\)[\s\S]*updated_at <= p_now - interval '90 days'[\s\S]*next_terminal_scan_at > p_now[\s\S]*next_terminal_scan_at <= p_now \+ interval '24 hours'/i,
    );
    expect(migration).toMatch(
      /order by[\s\S]*updated_at[\s\S]*object\.id[\s\S]*for update skip locked/i,
    );
  });

  it("requires the exact succeeded cleanup generation before compacting detail", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /outbox\.bucket_id = object\.bucket_id[\s\S]*outbox\.object_path = object\.object_path[\s\S]*outbox\.owner_uuid = object\.owner_uuid[\s\S]*outbox\.account_generation = object\.account_generation[\s\S]*outbox\.cleanup_generation = object\.cleanup_generation[\s\S]*outbox\.state = 'succeeded'[\s\S]*outbox\.terminal_result = object\.state/i,
    );
  });

  it("compacts only verbose attempt, lease, error, and expired quota event detail", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /update public\.mutation_idempotency_keys[\s\S]*attempt_token = null[\s\S]*attempts = 1[\s\S]*lease_expires_at = null/i,
    );
    expect(migration).toMatch(
      /operation_scope = 'recipe_image_upload'[\s\S]*result_reference = v_object\.id[\s\S]*state in \('succeeded', 'failed_terminal', 'cancelled'\)/i,
    );
    expect(migration).toMatch(
      /update public\.storage_object_deletion_outbox[\s\S]*attempts = 0[\s\S]*lease_token = null[\s\S]*lease_expires_at = null[\s\S]*last_error = null/i,
    );
    expect(migration).toMatch(
      /jsonb_array_elements\(counter\.request_events\)[\s\S]*event\.value ->> 'at'[\s\S]*> p_now - interval '90 days'/i,
    );
    expect(migration).toMatch(
      /jsonb_array_elements\(counter\.byte_events\)[\s\S]*event\.value ->> 'at'[\s\S]*> p_now - interval '90 days'/i,
    );
  });

  it("preserves compact identity and keeps the authority service-only", async () => {
    const migration = await readMigration();

    expect(migration).not.toMatch(
      /delete from public\.(recipe_image_objects|mutation_idempotency_keys|storage_object_deletion_outbox|image_upload_quota_counters)/i,
    );
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(
      /set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.compact_recipe_image_retention_details\([\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.compact_recipe_image_retention_details\([\s\S]*to service_role/i,
    );
  });
});
