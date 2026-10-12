import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20261012120000_youtube_saved_recipe_canonical_bridge.sql";
const sql = readFileSync(migrationPath, "utf8");

describe("YouTube saved recipe canonical bridge migration", () => {
  it("creates an owner-private one-to-one canonical recipe bridge", () => {
    expect(sql).toContain("add column canonical_recipe_id uuid");
    expect(sql).toContain("youtube_saved_recipe_results_canonical_recipe_idx");
    expect(sql).toMatch(/created_by,\s*visibility,\s*revision/iu);
    expect(sql).toMatch(/new\.owner_user_id,\s*'private'/u);
    expect(sql).toContain("youtube_saved_draft_id");
    expect(sql).toContain("set_account_generation_internal_writer_marker");
    expect(sql).toContain("v_existing_writer_txid");
  });

  it("backfills existing rows without replacing their editable content", () => {
    expect(sql).toMatch(
      /update public\.youtube_saved_recipe_results\s+set editable_content_json = editable_content_json\s+where canonical_recipe_id is null/iu,
    );
    expect(sql).not.toMatch(/set\s+source_snapshot_json\s*=/iu);
    expect(sql).not.toMatch(/set\s+editable_content_hash\s*=/iu);
  });

  it("pins planner snapshots from saved content and keeps the legacy builder", () => {
    expect(sql).toContain(
      "build_recipe_content_snapshot_before_yt_saved_20261012",
    );
    expect(sql).toContain("project_youtube_saved_recipe_ingredient_links");
    expect(sql).toContain("youtube_saved_snapshot_ingredient_id");
    expect(sql).toMatch(/exit when not exists \(\s*select 1 from public\.ingredients/iu);
    expect(sql).toContain("catalog_resolution_status");
    expect(sql).toContain("return query");
  });

  it("keeps canonical identity immutable after its first assignment", () => {
    expect(sql).toMatch(
      /old\.canonical_recipe_id is not null\s+and new\.canonical_recipe_id is distinct from old\.canonical_recipe_id/iu,
    );
  });
});
