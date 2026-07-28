import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260725190000_recipe_image_legacy_visibility_migration_authority.sql";

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8").catch(() => "");
}

describe("recipe image legacy visibility migration authority", () => {
  it("binds every plan to one report-only inventory and exact maintenance attempt", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /create table if not exists\s+public\.recipe_image_legacy_visibility_migration_runs/i,
    );
    expect(migration).toMatch(
      /inventory_run_id uuid not null[\s\S]*references public\.recipe_image_legacy_inventory_runs/i,
    );
    expect(migration).toMatch(
      /cutover_attempt_id uuid not null[\s\S]*references public\.account_generation_cutover_attempts/i,
    );
    expect(migration).toMatch(
      /capability\.state is distinct from 'cutover_maintenance'[\s\S]*capability\.current_cutover_attempt_id[\s\S]*is distinct from p_cutover_attempt_id[\s\S]*capability\.revision[\s\S]*is distinct from p_expected_capability_revision/i,
    );
    expect(migration).toMatch(
      /inventory\.enqueue_count <> 0[\s\S]*inventory\.delete_count <> 0/i,
    );
  });

  it("splits mixed visibility into private generation paths and owner-neutral shared paths", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /expected_visibility = 'private'[\s\S]*staging\.attempt_id = p_cutover_attempt_id[\s\S]*staging\.proposed_account_generation/i,
    );
    expect(migration).toMatch(
      /'recipe-images-private'[\s\S]*owner_uuid::text[\s\S]*account_generation::text[\s\S]*target_object_id::text/i,
    );
    expect(migration).toMatch(
      /'recipe-images'[\s\S]*'shared\/'[\s\S]*target_object_id::text/i,
    );
    expect(migration).toMatch(
      /unique nulls not distinct \(\s*migration_run_id,\s*source_storage_object_id,\s*expected_visibility,\s*owner_uuid,\s*account_generation\s*\)/i,
    );
  });

  it("fails closed when a recipe or recipe-book owner, visibility, URL, or managed reference drifts", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /recipe\.thumbnail_url is distinct from[\s\S]*v_inventory\.storage_origin[\s\S]*v_positive\.object_path/i,
    );
    expect(migration).toMatch(
      /recipe_book\.cover_image_url is distinct from[\s\S]*v_inventory\.storage_origin[\s\S]*v_positive\.object_path/i,
    );
    expect(migration).toMatch(
      /recipe\.created_by is distinct from v_positive\.owner_uuid/i,
    );
    expect(migration).toMatch(
      /recipe_book\.user_id is distinct from v_positive\.owner_uuid/i,
    );
    expect(migration).toMatch(
      /from public\.recipe_image_object_references as reference[\s\S]*reference\.reference_type = v_positive\.reference_type[\s\S]*reference\.consumer_id = v_positive\.consumer_id/i,
    );
    expect(migration).toMatch(/legacy visibility migration source drifted/i);
  });

  it("requires copied target evidence before atomically inserting durable objects and references", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /create or replace function\s+public\.finalize_recipe_image_legacy_visibility_target\(/i,
    );
    expect(migration).toMatch(
      /p_raw_sha256 !~ '\^\[0-9a-f\]\{64\}\$'[\s\S]*p_byte_size not between 1 and 5242880[\s\S]*p_actual_mime_type not in/i,
    );
    expect(migration).toMatch(
      /from storage\.objects as target_object[\s\S]*target_object\.bucket_id = v_target\.target_bucket_id[\s\S]*target_object\.name = v_target\.target_object_path/i,
    );
    expect(migration).toMatch(
      /insert into public\.recipe_image_objects[\s\S]*insert into public\.recipe_image_object_references[\s\S]*update public\.recipe_image_legacy_visibility_targets[\s\S]*state = 'finalized'/i,
    );
  });

  it("keeps the old URL as the rollback floor and never enqueues or deletes legacy objects", async () => {
    const migration = await readMigration();

    expect(migration).not.toMatch(
      /\bupdate\s+public\.recipes\s+set\s+thumbnail_url\b/i,
    );
    expect(migration).not.toMatch(
      /\bupdate\s+public\.recipe_books\s+set\s+cover_image_url\b/i,
    );
    expect(migration).not.toMatch(
      /\b(insert into|update|delete from)\s+public\.storage_object_deletion_outbox\b/i,
    );
    expect(migration).not.toMatch(
      /\b(update|delete from)\s+storage\.objects\b/i,
    );
  });

  it("is replay-safe, bounded, and service-role only", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(/migration_key uuid not null unique/i);
    expect(migration).toMatch(
      /cardinality\(p_positive_reference_ids\)[\s\S]*between 1 and 100/i,
    );
    expect(migration).toMatch(
      /snapshot_hash is distinct from v_snapshot_hash[\s\S]*migration key reused with different snapshot/i,
    );
    expect(migration).toMatch(/security definer/gi);
    expect(migration).toMatch(
      /set search_path = pg_catalog, public, extensions, pg_temp/i,
    );
    expect(migration).toMatch(
      /revoke all on function[\s\S]*prepare_recipe_image_legacy_visibility_migration[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function[\s\S]*prepare_recipe_image_legacy_visibility_migration[\s\S]*to service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function[\s\S]*finalize_recipe_image_legacy_visibility_target[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function[\s\S]*finalize_recipe_image_legacy_visibility_target[\s\S]*to service_role/i,
    );
  });
});
