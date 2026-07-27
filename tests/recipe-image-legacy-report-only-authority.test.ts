import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260725160000_recipe_image_legacy_report_only.sql";

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8").catch(() => "");
}

describe("recipe image legacy report-only authority", () => {
  it("recognizes only exact trusted-origin recipe and recipe-book references", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /p_storage_origin[\s\S]*\^https:\/\/\[a-z0-9\]/i,
    );
    expect(migration).toMatch(
      /join public\.recipes[\s\S]*recipe\.thumbnail_url =[\s\S]*p_storage_origin[\s\S]*\/storage\/v1\/object\/public\/recipe-images\//i,
    );
    expect(migration).toMatch(
      /join public\.recipe_books[\s\S]*recipe_book\.cover_image_url =[\s\S]*p_storage_origin[\s\S]*\/storage\/v1\/object\/public\/recipe-images\//i,
    );
    expect(migration).toMatch(
      /where inventory\.strict_path/i,
    );
    expect(migration).toMatch(
      /owner_id is null[\s\S]*owner_id = split_part\(object\.name, '\/', 1\)[\s\S]*where inventory\.strict_path[\s\S]*inventory\.owner_signal_consistent/i,
    );
  });

  it("stores only path hashes for unverified and suspicious candidates", async () => {
    const migration = await readMigration();
    const candidateTable = migration.match(
      /create table if not exists\s+public\.recipe_image_legacy_candidate_reports \(([\s\S]*?)\n\);/i,
    )?.[1] ?? "";

    expect(candidateTable).toContain("path_hash text not null");
    expect(candidateTable).not.toMatch(
      /\b(bucket_id|object_path|owner_uuid)\b/i,
    );
    expect(migration).toMatch(
      /'deletion_candidate_unverified'[\s\S]*'suspicious_unclassified'/i,
    );
  });

  it("makes enqueue and delete structurally impossible in this authority", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /check \(enqueue_count = 0 and delete_count = 0\)/i,
    );
    expect(migration).not.toMatch(
      /\b(insert into|update|delete from)\s+public\.storage_object_deletion_outbox\b/i,
    );
    expect(migration).not.toMatch(
      /\b(update|delete from)\s+storage\.objects\b/i,
    );
  });

  it("is replay-safe, service-only, and bound to one snapshot", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /inventory_key uuid not null unique/i,
    );
    expect(migration).toMatch(
      /snapshot_hash is distinct from v_snapshot_hash[\s\S]*key reused with different snapshot/i,
    );
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(
      /set search_path = pg_catalog, public, extensions, pg_temp/i,
    );
    expect(migration).toMatch(
      /revoke all[\s\S]*inventory_recipe_image_legacy_objects\(uuid, text\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to service_role/i,
    );
  });
});
