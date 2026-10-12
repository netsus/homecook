import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20261012120000_youtube_saved_recipe_canonical_bridge.sql";
const sql = readFileSync(migrationPath, "utf8");

describe("YouTube saved recipe canonical bridge migration", () => {
  it("creates an owner-created public one-to-one canonical recipe bridge", () => {
    expect(sql).toContain("add column canonical_recipe_id uuid");
    expect(sql).toContain("youtube_saved_recipe_results_canonical_recipe_idx");
    expect(sql).toMatch(/created_by,\s*visibility,\s*revision/iu);
    expect(sql).toMatch(/new\.owner_user_id,\s*'public'/u);
    expect(sql).toContain("youtube_saved_canonical_bridge");
    expect(sql).not.toContain("youtube_saved_draft_id");
    expect(sql).toMatch(/where canonical_recipe_id = p_result_id/iu);
    expect(sql).toContain("set_account_generation_internal_writer_marker");
    expect(sql).toContain("v_existing_writer_txid");
    expect(sql).toContain("public.build_recipe_tag_payload(v_tags, 'system_suggested')");
    expect(sql).toContain("perform public.set_recipe_tags(");
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
    expect(sql).toContain("owner_user_id := null");
  });

  it("projects only public display data through an exact service scope", () => {
    expect(sql).toContain("read_public_youtube_saved_recipe_detail");
    expect(sql).toContain("recipe_visibility_guard.is_owner_publicly_visible");
    expect(sql).toMatch(/- 'catalog_resolution_status'/u);
    expect(sql).toMatch(/- 'food_product_id'/u);
    expect(sql).toContain("'/rpc/read_public_youtube_saved_recipe_detail'");
    expect(sql).toMatch(
      /grant execute on function public\.read_public_youtube_saved_recipe_detail\(uuid\)\s+to service_role/iu,
    );
    expect(sql).toMatch(
      /revoke all on function public\.read_public_youtube_saved_recipe_detail\(uuid\)\s+from public, anon, authenticated/iu,
    );
  });

  it("keeps canonical identity immutable after its first assignment", () => {
    expect(sql).toMatch(
      /old\.canonical_recipe_id is not null\s+and new\.canonical_recipe_id is distinct from old\.canonical_recipe_id/iu,
    );
  });

  it("retires the public bridge on account deletion without deleting planner history", () => {
    expect(sql).toContain("retire_youtube_saved_canonical_on_account_delete");
    expect(sql).toMatch(
      /current_setting\('homecook\.account_delete_user_id', true\)[\s\S]*old\.owner_user_id::text/iu,
    );
    expect(sql).toMatch(/delete from public\.recipe_book_items\s+where recipe_id = old\.canonical_recipe_id/iu);
    expect(sql).toMatch(/delete from public\.recipe_likes\s+where recipe_id = old\.canonical_recipe_id/iu);
    expect(sql).toMatch(/update public\.recipes[\s\S]*deleted_at = coalesce\(deleted_at, clock_timestamp\(\)\)/iu);
    expect(sql).not.toMatch(/delete from public\.meals\s+where recipe_id = old\.canonical_recipe_id/iu);
  });
});
