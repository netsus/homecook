import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20261010010000_youtube_saved_ingredient_links.sql";

describe("YouTube saved ingredient link projection migration", () => {
  it("adds a row-keyed read-only projection without changing durable content", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("project_youtube_saved_recipe_ingredient_links");
    expect(sql).toContain("'ingredient_links'");
    expect(sql).toContain("jsonb_build_object(v_row_id, v_link)");
    expect(sql).not.toMatch(/update\s+public\.youtube_saved_recipe_results/iu);
    expect(sql).not.toMatch(/set\s+editable_content_json|set\s+source_snapshot_json|set\s+revision/iu);
  });

  it("rechecks only unchanged source-bound unresolved rows with their own occurrence context", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("v_current_name = v_source_name");
    expect(sql).toContain("v_source_status is null or v_source_status = 'unresolved'");
    expect(sql).toContain("v_source ->> 'original_name'");
    expect(sql).toContain("v_source ->> 'amount'");
    expect(sql).toContain("v_source ->> 'unit'");
    expect(sql).toContain("match_ingredient_name_exact_with_context");
    expect(sql).not.toMatch(/v_source\s*->>\s*'display_text'/u);
    expect(sql).not.toMatch(/v_source\s*->>\s*'quantity_raw_text'/u);
  });

  it("keeps ambiguity for review and preserves the private authority boundary", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("v_source_status = 'needs_review'");
    expect(sql).toContain("'resolution_status', 'needs_review'");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).not.toMatch(/grant\s+execute/iu);
  });
});
