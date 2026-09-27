import { spawnSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { writeRecipeNutritionSnapshot } from "@/lib/server/recipe-nutrition-snapshot";
import { calculateRecipeNutrition } from "@/lib/nutrition/recipe-nutrition-calculator";
import { addRecipeProductNutritionGuard, hydrateRecipeProductNutrition } from "@/lib/server/recipe-product-nutrition";
import { buildRecipeNutritionInputGuard, hydrateRecipeNutritionIngredients } from "@/scripts/lib/recipe-nutrition-predecessor.mjs";

const projectId = process.env.HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID?.trim();
const databaseUrl = process.env.HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL?.trim();
const container = `supabase_db_${projectId}`;
const id = (suffix: string) => `78000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const owner = id("1");
const ingredientId = id("2");
const productId = id("3");
const oldVersion = id("4");
const newVersion = id("5");
const sourceId = id("6");
const sourceItemId = id("7");
const oldProfile = id("8");
const newProfile = id("9");
const recipeId = id("10");
const rowId = id("11");
const privateProductId = id("12");
const privateVersion = id("13");

function psql(sql: string) {
  const result = spawnSync("docker", [
    "exec", "-i", container, "psql", "-X", "-U", "supabase_admin", "-d", "postgres",
    "-Atq", "-v", "ON_ERROR_STOP=1",
  ], { input: sql, encoding: "utf8", timeout: 30_000 });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}
const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const pin = {
  id: rowId, ingredient_id: ingredientId, amount: 0.5, unit: "package",
  ingredient_type: "QUANT" as const, scalable: true, sort_order: 0,
  food_product_id: productId, food_product_nutrition_version_id: oldVersion,
};
const draft = { title: "제품 고정 영양", base_servings: 2, ingredients: [pin], steps: [{ step_number: 1, instruction: "섞어요" }] };
const fixture = `
  begin;
  set local request.jwt.claim.role = 'service_role';
  set local request.jwt.claims = '{"role":"service_role","sub":"${owner}"}';
  set constraints all deferred;
  insert into public.users (id, nickname, social_provider, social_id)
    values ('${owner}', '영양 제품 검증', 'google', 'product-nutrition-test');
  insert into public.ingredients (id, standard_name, category, default_unit)
    values ('${ingredientId}', '영양 제품 검증 재료', '유제품', 'g');
  insert into public.nutrition_sources (
    id, provider_code, dataset_name, source_kind, source_version, data_basis_date,
    fetched_at, freshness_checked_at, freshness_status, priority_rank,
    source_url, license_name, license_url, manifest_sha256, review_status,
    decision_reason, reviewed_by, reviewed_at, is_active
  ) values ('${sourceId}', 'MFDS', 'Product nutrition fixture', 'nutrition_dataset', '2026-09-22', '2026-09-22',
    now(), now(), 'current', 1, 'https://example.test/product-nutrition', 'test-only',
    'https://example.test/license', repeat('b',64), 'approved', 'isolated fixture', '${owner}', now(), true);
  insert into public.nutrition_source_items (
    id, source_id, external_item_key, external_name, preparation_state,
    source_basis_text, source_basis_amount, source_basis_unit, edible_portion_percent,
    stable_fingerprint, review_status, decision_reason, reviewed_by, reviewed_at
  ) values ('${sourceItemId}', '${sourceId}', 'product-pinned-label', '제품 라벨', 'raw-edible',
    '100g', 100, 'g', 100, repeat('c',64), 'approved', 'isolated fixture', '${owner}', now());
  insert into public.nutrition_sources (
    id, provider_code, dataset_name, source_kind, source_version, data_basis_date,
    fetched_at, freshness_checked_at, freshness_status, priority_rank,
    source_url, license_name, license_url, manifest_sha256, review_status,
    decision_reason, reviewed_by, reviewed_at, is_active
  ) values ('${id("16")}', 'MFDS', 'Product nutrition fixture current label', 'nutrition_dataset', '2026-09-23', '2026-09-23',
    now(), now(), 'current', 1, 'https://example.test/product-nutrition', 'test-only',
    'https://example.test/license', repeat('e',64), 'approved', 'isolated fixture', '${owner}', now(), true);
  insert into public.nutrition_source_items (
    id, source_id, external_item_key, external_name, preparation_state,
    source_basis_text, source_basis_amount, source_basis_unit, edible_portion_percent,
    stable_fingerprint, review_status, decision_reason, reviewed_by, reviewed_at
  ) values ('${id("14")}', '${id("16")}', 'product-pinned-label', '제품 새 라벨', 'raw-edible',
    '100g', 100, 'g', 100, repeat('d',64), 'approved', 'isolated fixture', '${owner}', now());
  insert into public.nutrition_profiles (
    id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
    version, review_status, decision_reason, reviewed_by, reviewed_at, is_active
  ) values
    ('${oldProfile}', '${sourceItemId}', 'product_label', 'as_labeled', 100, 'g', 1,
      'approved', 'isolated fixture', '${owner}', now(), true),
    ('${newProfile}', '${id("14")}', 'product_label', 'as_labeled', 100, 'g', 2,
      'approved', 'isolated fixture', '${owner}', now(), true);
  insert into public.nutrition_values (profile_id, nutrient_code, source_nutrient_code, source_unit, amount, value_status)
    select profile.id, code, code, case when code='energy_kcal' then 'kcal' when code='sodium_mg' then 'mg' else 'g' end, case when code='energy_kcal' then profile.energy else 10 end, 'observed'
    from (values ('${oldProfile}'::uuid,300),('${newProfile}'::uuid,900)) profile(id,energy),
      unnest(array['energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg']) code;
  insert into public.nutrition_profiles (
    id, profile_kind, normalization_method, basis_amount, basis_unit, version,
    review_status, is_active, created_by
  ) values ('${id("15")}', 'product_label', 'as_labeled', 100, 'g', 1, 'self_reported', true, '${owner}');
  select public.insert_manual_food_product_values('${id("15")}',
    '{"energy_kcal":100,"carbohydrate_g":10,"protein_g":10,"fat_g":10,"sodium_mg":10}'::jsonb);

  insert into public.food_products (
    id, owner_user_id, visibility, source_type, moderation_status, name, current_nutrition_version_id, external_product_key
  ) values
    ('${productId}', null, 'public', 'public_dataset', 'visible', '라벨제품', '${newVersion}', 'product-pinned-label'),
    ('${privateProductId}', '${owner}', 'private', 'manual', 'visible', '비공개라벨제품', '${privateVersion}', null);
  insert into public.food_product_nutrition_versions (
    id, product_id, nutrition_profile_id, version, basis_relations_json, source_item_id, created_by
  ) values
    ('${oldVersion}', '${productId}', '${oldProfile}', 1,
      '[{"from":{"amount":1,"unit":"package"},"to":{"amount":200,"unit":"g"}}]', '${sourceItemId}', null),
    ('${newVersion}', '${productId}', '${newProfile}', 2,
      '[{"from":{"amount":1,"unit":"package"},"to":{"amount":300,"unit":"g"}}]', '${id("14")}', null),
    ('${privateVersion}', '${privateProductId}', '${id("15")}', 1, '[]', null, '${owner}');
  set constraints all immediate;
  insert into public.food_product_ingredient_links (
    id, product_id, ingredient_id, relation, review_status, is_primary, is_active, source, decision_reason, reviewed_at
  ) values
    ('${id("17")}', '${productId}', '${ingredientId}', 'represents', 'approved', true, true, 'isolated-test','isolated fixture',now()),
    ('${id("18")}', '${privateProductId}', '${ingredientId}', 'represents', 'approved', true, true, 'isolated-test','isolated fixture',now());
  insert into public.recipes (id,title,source_type,base_servings) values ('${recipeId}', '제품 영양 검증', 'system', 2);
  insert into public.recipe_ingredients (
    id, recipe_id, ingredient_id, amount, unit, ingredient_type, scalable, sort_order,
    food_product_id, food_product_nutrition_version_id
  ) values ('${rowId}', '${recipeId}', '${ingredientId}', 0.5, 'package', 'QUANT', true, 0, '${productId}', '${oldVersion}');
`;

// These tests run only inside the catalog runner's disposable container. Every
// fixture and mutation rolls back; the supplied URL is never used to connect.
describe.skipIf(!projectId && !databaseUrl)("product recipe nutrition after all migrations", () => {
  beforeAll(() => {
    expect(projectId).toMatch(/^hcg_\d+_[a-f0-9]{6}$/u);
    expect(databaseUrl).toMatch(/^postgresql:\/\/[^@\s]+@(?:127\.0\.0\.1|\[::1\]):\d+\/postgres$/u);
    const result = spawnSync("docker", ["inspect", container], { encoding: "utf8", timeout: 10_000 });
    expect(result.status, result.stderr).toBe(0);
    const [state] = JSON.parse(result.stdout);
    expect(state.Config.Labels["com.docker.compose.project"]).toBe(projectId);
    expect(state.NetworkSettings.Ports["5432/tcp"]?.map((port: { HostPort: string }) => port.HostPort))
      .toContain(new URL(databaseUrl!).port);
  });

  it("uses the old pinned label and matches both SQL predecessor guards", async () => {
    const result = JSON.parse(psql(`${fixture}
      select jsonb_build_object(
        'predecessors', public.read_recipe_product_nutrition_predecessors('${owner}', ${literal([pin])}),
        'stored_guard', public.build_recipe_nutrition_input_guard('${recipeId}'),
        'draft_guard', public.build_recipe_draft_nutrition_predecessor_guard(${literal(draft)})
      );
      rollback;
    `));
    const client = { rpc: async () => ({ data: result.predecessors, error: null }) };
    const hydrated = await hydrateRecipeProductNutrition(client, [pin], hydrateRecipeNutritionIngredients([pin], new Map()), owner);
    const calculation = calculateRecipeNutrition({ recipe_id: recipeId, recipe_version: "1", base_servings: 2, ingredients: hydrated.ingredients });
    expect(calculation.values.energy_kcal.amount).toBe(300);
    expect(calculation.scalable_values.energy_kcal).toBe(300);
    const guard = addRecipeProductNutritionGuard(buildRecipeNutritionInputGuard([pin], new Map()), [pin], hydrated.predecessors);
    expect(guard).toEqual(result.stored_guard);
    const { id: ignoredId, ...draftGuard } = guard.recipe_ingredients[0];
    void ignoredId;
    expect({ recipe_ingredients: [draftGuard] }).toEqual(result.draft_guard);
    expect(result.predecessors[0].product_predecessor.nutrition.profile.id).toBe(oldProfile);
    await writeRecipeNutritionSnapshot({ rpc: async (_name, args) => {
      const stored = JSON.parse(psql(`${fixture}
        select public.write_recipe_nutrition_snapshot('${recipeId}', ${literal(args.p_snapshot)},
          (select updated_at from public.recipes where id='${recipeId}'), ${literal(args.p_input_guard)});
        rollback;
      `));
      return { data: stored, error: null };
    } }, recipeId, calculation, { expectedRecipeVersion: "2026-09-22T00:00:00Z", inputGuard: guard });
  });

  it("does not expose another owner's private label or grant anonymous reads", () => {
    psql(`${fixture}
      do $check$ begin
        begin
          perform public.read_recipe_product_nutrition_predecessors('${id("99")}', ${literal([{ ...pin,
            food_product_id: privateProductId, food_product_nutrition_version_id: privateVersion,
          }])});
          raise exception 'accepted another owner';
        exception when insufficient_privilege then null; end;
        if has_function_privilege('anon', 'public.read_recipe_product_nutrition_predecessors(uuid,jsonb)', 'EXECUTE') then
          raise exception 'anonymous projection permission';
        end if;
      end $check$;
      rollback;
    `);
  });

  it("returns unavailable after a link is revoked and does not substitute another product's version", () => {
    const result = JSON.parse(psql(`${fixture}
      update public.food_product_ingredient_links set is_active=false,is_primary=false,review_status='revoked' where product_id='${productId}';
      select public.read_recipe_product_nutrition_predecessors('${owner}', ${literal([pin,
        { ...pin, id: "wrong", food_product_nutrition_version_id: privateVersion },
      ])});
      rollback;
    `));
    expect(result.map((entry: { product_predecessor: unknown }) => entry.product_predecessor)).toEqual([null, null]);
  });
});
