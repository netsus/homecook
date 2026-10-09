import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { isAnonymousHybridPublicReadRequest } from "@/lib/server/hybrid-auth/public-read-policy";
import { canonicalizeIngredient, expandIngredientIdentityIds, INGREDIENT_ALIAS_SEARCH_COLUMNS, loadIngredientAliases } from "@/lib/server/ingredient-canonical-search";
const row = { ingredient_id: "old", representative_ingredient_id: "root", representative_standard_name: "가루 설탕", representative_category: "양념", representative_category_code: null };
function fixture(rows: unknown[] = [row], fail = false) {
  return createClient("http://127.0.0.1:54321", "fixture-key", { auth: { persistSession: false }, global: { fetch: async input => {
    const url = new URL(String(input));
    expect(isAnonymousHybridPublicReadRequest({ scope: "ingredients", method: "GET", path: url.pathname.replace("/rest/v1", ""), search: url.search })).toBe(true);
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    return new Response(JSON.stringify(fail ? { message: "unavailable" } : rows.slice(offset, offset + limit)), { status: fail ? 500 : 200, headers: { "Content-Type": "application/json" } });
  } } });
}
describe("reviewed ingredient canonical identity", () => {
  it("resolves only reviewed IDs, retaining original input rows and legacy references", async () => {
    const aliases = await loadIngredientAliases(fixture());
    const old = { id: "old", standard_name: "슈가파우더", category: "기타" };
    expect(canonicalizeIngredient(old, aliases)).toEqual({ id: "root", standard_name: "가루 설탕", category: "양념", category_code: null });
    expect(old.standard_name).toBe("슈가파우더");
    expect(canonicalizeIngredient({ id: "different", standard_name: "슈가파우더" }, aliases).id).toBe("different");
    expect(expandIngredientIdentityIds(["root"], aliases).sort()).toEqual(["old", "root"]);
    expect(expandIngredientIdentityIds(["old"], aliases).sort()).toEqual(["old", "root"]);
    expect(expandIngredientIdentityIds(["unrelated"], aliases)).toEqual(["unrelated"]);
  });
  it("does not silently show unmerged results on metadata errors", async () => {
    await expect(loadIngredientAliases(fixture([], true))).rejects.toThrow("unavailable");
    await expect(loadIngredientAliases(fixture([{ ...row, representative_ingredient_id: "old" }]))).rejects.toThrow("invalid");
    await expect(loadIngredientAliases(fixture([row, { ...row, ingredient_id: "root", representative_ingredient_id: "another" }]))).rejects.toThrow("chain");
  });
  it("reads beyond one catalog page without dropping identities", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ ...row, ingredient_id: `old-${i}`, representative_ingredient_id: `root-${i}` }));
    expect((await loadIngredientAliases(fixture(rows))).size).toBe(1001);
  });
  it("allows only the bounded public projection, not arbitrary views, columns or writes", () => {
    const query = new URLSearchParams({ select: INGREDIENT_ALIAS_SEARCH_COLUMNS, order: "ingredient_id.asc", offset: "0", limit: "1000" });
    const allows = (q: URLSearchParams, method = "GET", path = "/ingredient_catalog_aliases") => isAnonymousHybridPublicReadRequest({ scope: "ingredients", path, method, search: q.toString() });
    expect(allows(query)).toBe(true);
    expect(allows(query, "POST")).toBe(false);
    expect(allows(query, "GET", "/ingredient_catalog_entries")).toBe(false);
    const invalidQueries: Array<Record<string, string>> = [{ select: "*" }, { select: "ingredient_id,reviewed_by" }, { limit: "1001" }, { order: "updated_at.desc" }, { extra: "anything" }];
    for (const patch of invalidQueries) {
      expect(allows(new URLSearchParams({ ...Object.fromEntries(query), ...patch }))).toBe(false);
    }
  });
});
