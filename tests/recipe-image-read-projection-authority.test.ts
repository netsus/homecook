import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260725170000_recipe_image_read_projection_authority.sql";

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8").catch(() => "");
}

describe("recipe image read projection authority", () => {
  it("projects durable registry identity without issuing or persisting read URLs", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /create or replace function public\.read_recipe_image_projections\(\s*p_recipe_ids uuid\[\]\s*\)/i,
    );
    expect(migration).toMatch(
      /returns table\s*\([\s\S]*recipe_id uuid[\s\S]*legacy_thumbnail_url text[\s\S]*image_object_id uuid[\s\S]*bucket_id text[\s\S]*object_path text[\s\S]*visibility text[\s\S]*state text/i,
    );
    expect(migration).not.toMatch(/\b(signed_url|read_url|expires_at)\b/i);
  });

  it("preserves caller order and exposes malformed managed evidence for fail-closed validation", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /unnest\(p_recipe_ids\)\s+with ordinality/i,
    );
    expect(migration).toMatch(
      /left join public\.recipe_image_object_references[\s\S]*reference_type = 'recipe_thumbnail'/i,
    );
    expect(migration).toMatch(
      /left join public\.recipe_image_objects/i,
    );
    expect(migration).toMatch(/order by[\s\S]*ordinality/i);
    expect(migration).not.toMatch(
      /image_object\.state\s+in\s*\(\s*'attached_private'\s*,\s*'attached_public_shared'\s*\)/i,
    );
  });

  it("rejects unbounded or ambiguous input and is service-role only", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(/cardinality\(p_recipe_ids\)[\s\S]*between 1 and 100/i);
    expect(migration).toMatch(/array_position\(p_recipe_ids,\s*null\)/i);
    expect(migration).toMatch(
      /count\(\*\)[\s\S]*count\(distinct (?:input\.)?recipe_id\)[\s\S]*duplicate/i,
    );
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(
      /set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(migration).toMatch(
      /revoke all[\s\S]*read_recipe_image_projections\(uuid\[\]\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to service_role/i,
    );
  });
});
