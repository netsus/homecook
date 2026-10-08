import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261008092000_ai_nutrition_recipe_refresh.sql", "utf8");
function body(name: string) {
  const start = sql.indexOf(`create function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("$function$;", start));
}

describe("AI recipe refresh SQL authority contract", () => {
  it("exports only two service-role RPCs without adding general table access", () => {
    expect([...sql.matchAll(/create function public\.([a-z_]+)\(/g)].map((match) => match[1]))
      .toEqual(["get_ingredient_ai_recipe_refresh_input", "write_ingredient_ai_recipe_refresh"]);
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\b/i);
    expect(sql).toMatch(/revoke all on function public\.get_ingredient_ai_recipe_refresh_input[\s\S]+from public,anon,authenticated,service_role;/);
    expect(sql).toMatch(/grant execute on function public\.get_ingredient_ai_recipe_refresh_input[\s\S]+to service_role;/);
    const scope = body("private.verify_full_local_internal_scope");
    expect(scope).toContain("auth.role() = 'service_role'");
    expect(scope).toContain("= 'ingredient-ai-nutrition'");
    expect(scope).toContain("= 'POST'");
    expect([...scope.matchAll(/'\/rpc\/([a-z_]+)'/g)].map((match) => match[1]))
      .toEqual(["get_ingredient_ai_recipe_refresh_input", "write_ingredient_ai_recipe_refresh"]);
    expect(scope).toContain("perform private.verify_scope_pre_ai_refresh_20261008()");
  });

  it("checks enabled and succeeded pending membership under shared locks on both RPCs", () => {
    const authority = body("private.require_ingredient_ai_recipe_refresh");
    expect(authority).toContain("where singleton and enabled for share");
    expect(authority).toContain("where id = p_job_id and status = 'succeeded'");
    expect(authority).toContain("p_recipe_id = any(pending_recipe_ids)");
    for (const name of ["get_ingredient_ai_recipe_refresh_input", "write_ingredient_ai_recipe_refresh"]) {
      const rpc = body(`public.${name}`);
      expect(rpc.indexOf(`private.require_ingredient_ai_scope('${name}')`)).toBeLessThan(rpc.indexOf("private.require_ingredient_ai_recipe_refresh(p_job_id, p_recipe_id)"));
      expect(rpc.indexOf("private.require_ingredient_ai_recipe_refresh(p_job_id, p_recipe_id)")).toBeLessThan(rpc.indexOf("from public.recipes"));
      expect(rpc).toContain("deleted_at is null for share");
    }
  });

  it("uses scoped predecessor arrays and the existing owner-checked product reader and guard", () => {
    const reader = body("public.get_ingredient_ai_recipe_refresh_input");
    expect(reader).toContain("where ingredient.recipe_id = p_recipe_id");
    expect(reader).toContain("link.ingredient_id = any(v_ids)");
    expect(reader).toContain("assignment.ingredient_id = any(v_ids)");
    expect(reader).toContain("piece.ingredient_id = any(v_ids)");
    expect(reader).toContain("public.read_recipe_product_nutrition_predecessors(v_recipe.created_by, v_product_pins)");
    expect(reader).toContain("public.build_recipe_nutrition_input_guard(p_recipe_id)");
    expect(reader).toContain("'food_product_nutrition_version_id', ingredient.food_product_nutrition_version_id");
    expect(reader).not.toMatch(/to_jsonb\((source|profile|item|ingredient)\)/);
  });

  it("delegates snapshot guards/idempotency and restores the writer marker without acknowledging or rewriting history", () => {
    const writer = body("public.write_ingredient_ai_recipe_refresh");
    expect(writer).toMatch(/public\.write_recipe_nutrition_snapshot\(\s*p_recipe_id, p_snapshot, p_expected_recipe_updated_at, p_input_guard\s*\)/);
    expect(writer.match(/coalesce\(v_previous_writer, ''\)/g)).toHaveLength(2);
    expect(writer).toContain("exception when others then");
    expect(writer).not.toMatch(/acknowledge_ingredient_ai_nutrition_refresh\(/);
    expect(sql).not.toMatch(/\b(insert into|update|delete from)\s+(public\.|private\.)?(recipe_ingredients|recipe_nutrition_snapshots|meals|meal_log_entries|ingredient_ai_nutrition_jobs)\b/i);
  });
});
