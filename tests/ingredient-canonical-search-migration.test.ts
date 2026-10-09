import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261009090000_ingredient_canonical_search.sql"), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

describe("canonical ingredient search migration", () => {
  it("normalizes only explicit whitespace/formatting characters and refreshes changed stored keys", () => {
    expect(sql).toContain("lower(normalize(p_value, NFKC))");
    for (const point of [65279, 8203, 8204, 8205, 8288]) expect(sql).toContain(`chr(${point})`);
    expect(sql).toContain("update public.ingredients set standard_name = standard_name");
    expect(sql).toContain("where search_name is distinct from public.normalize_ingredient_search_name(standard_name)");
    expect(sql).toContain("update public.ingredient_synonyms set synonym = synonym");
    expect(sql).not.toContain("create or replace function public.normalize_food_search_text");
  });

  it("appends representative metadata through the existing public invoker projection without private joins or grants", () => {
    const view = sql.slice(sql.indexOf("create or replace view"), sql.indexOf("do $catalog_keys$"));
    expect(view).toContain("with (security_invoker = true)");
    expect(view).toContain("select item.*,");
    for (const field of ["standard_name", "category", "category_code"]) {
      expect(view).toContain(`representative.${field} as representative_${field}`);
    }
    expect(view).not.toContain("ingredient_representative_links");
    expect(view).not.toMatch(/grant\s/i);
    expect(code).not.toMatch(/alter table|delete from|truncate /i);
    expect((code.match(/\bgrant\s+[^;]+;/gi) ?? []).map(statement => statement.replace(/\s+/g, " ").trim())).toEqual([
      "grant select (ingredient_id, presentation, representative_ingredient_id) on public.ingredient_catalog_entries to youtube_extraction_worker_rpc_owner;",
      "grant execute on function public.normalize_ingredient_search_name(text) to anon, authenticated, service_role;",
    ]);
  });

  it("adds only original standard names idempotently while preserving source identities and attached aliases", () => {
    const data = sql.slice(sql.indexOf("do $catalog_keys$"), sql.indexOf("-- The async resolver"));
    expect(data).toContain("select distinct alias.representative_ingredient_id, source.standard_name");
    expect(data).toContain("existing.search_name = public.normalize_ingredient_search_name(source.standard_name)");
    expect(data).toContain("on conflict (ingredient_id, synonym) do nothing");
    expect(data).toContain("if not coalesce(v_already_marked, false)");
    expect(data).not.toMatch(/set ingredient_id|delete from|nutrition_values|nutrition_profiles/);
  });

  it("folds direct and synonym alias IDs without arbitrary tie-breaking or fuzzy exact matching", () => {
    const exact = sql.slice(sql.indexOf("create or replace function public.match_ingredient_name_exact"), sql.indexOf("do $ranked_search$"));
    expect(exact).toContain("security invoker");
    expect(exact).toContain("coalesce(alias.representative_ingredient_id, ingredient.id)");
    expect(exact).toContain("coalesce(alias.representative_ingredient_id, synonym.ingredient_id)");
    expect(exact).toContain("select distinct resolved_id from canonical_raw where not is_alias");
    expect(exact).toContain("where is_alias and not exists (select 1 from canonical_matches)");
    expect(exact).toContain("select distinct resolved_id");
    expect(exact).not.toMatch(/limit 1|similarity\(|levenshtein\(/i);
  });

  it("limits ranked changes to ingredient candidates and formatting-only input cleanup before existing paging", () => {
    const ranked = sql.slice(sql.indexOf("do $ranked_search$"), sql.indexOf("do $scope_backup$"));
    expect(ranked).toContain("v_start text := '  ingredient_candidates as materialized ('");
    expect(ranked).toContain("v_end text := '  public_product_index_candidates as materialized ('");
    expect(ranked).toContain("canonical_alias_source.representative_ingredient_id = ingredient.id");
    expect(ranked).toContain("canonical_alias_source.ingredient_id = synonym.ingredient_id");
    expect(ranked).toContain("canonical_alias_candidate.presentation = 'alias'");
    expect(ranked).toContain("substr(v_definition, v_end_at)");
    expect(ranked).toContain("INGREDIENT_CANONICAL_SEARCH_QUERY_SHAPE_CHANGED");
    expect(ranked).not.toMatch(/replace\([^;]*owner_user_id|replace\([^;]*p_cursor/);
  });

  it("adds only ingredients GET routing for the alias view and delegates all other authority checks", () => {
    const scope = sql.slice(sql.indexOf("do $scope_backup$"), sql.indexOf("-- Restate the existing API-role privileges"));
    expect(scope).toContain("->> 'x-homecook-public-read-scope' = 'ingredients'");
    expect(scope).toContain("= 'GET'");
    expect(scope).toContain("= '/ingredient_catalog_aliases'");
    expect(scope).toContain("perform private.verify_anonymous_pre_canonical_search_20261009()");
    expect(scope).toContain("from public, anon, authenticated, service_role");
    expect(scope).not.toMatch(/grant execute|grant select/);
  });
});
