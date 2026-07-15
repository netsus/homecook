import { spawn, spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { deriveRecipeNutritionSnapshotId } from "@/scripts/lib/recipe-nutrition-backfill.mjs";

const enabled = process.env.HOMECOOK_RECIPE_NUTRITION_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_RECIPE_NUTRITION_PGHOST ?? "";
const port = process.env.HOMECOOK_RECIPE_NUTRITION_PGPORT ?? "";
const database = process.env.HOMECOOK_RECIPE_NUTRITION_PGDATABASE ?? "";
const actorId = "10000000-0000-4000-8000-000000000001";

function psqlResult(sql: string) {
  return spawnSync("psql", [
    "-h", host,
    "-p", port,
    "-U", "postgres",
    "-d", database,
    "-At",
    "-v", "ON_ERROR_STOP=1",
    "-c", sql,
  ], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
  });
}

function psql(sql: string): string {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function psqlAsync(sql: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [
      "-h", host,
      "-p", port,
      "-U", "postgres",
      "-d", database,
      "-At",
      "-v", "ON_ERROR_STOP=1",
      "-c", sql,
    ], { env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function encodedJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function jsonExpression(value: unknown): string {
  return `convert_from(decode('${encodedJson(value)}', 'base64'), 'UTF8')::jsonb`;
}

function snapshot(seed: string, energy = 100) {
  const nutrient = (amount: number) => ({
    status: "complete",
    amount,
    known_amount: null,
    display_mode: "total",
  });
  return {
    base_servings: 2,
    calculated_at: "2026-07-16T00:00:00.000Z",
    calculation_quality: "direct",
    calculation_status: "complete",
    calculation_version: "recipe-nutrition-v1",
    fixed_values: {
      energy_kcal: 0,
      carbohydrate_g: 0,
      protein_g: 0,
      fat_g: 0,
      sodium_mg: 0,
    },
    input_hash: seed.repeat(64).slice(0, 64),
    missing_reasons: [],
    nutrient_status: {
      energy_kcal: nutrient(energy),
      carbohydrate_g: nutrient(20),
      protein_g: nutrient(10),
      fat_g: nutrient(5),
      sodium_mg: nutrient(50),
    },
    reflected_ingredient_count: 1,
    scalable_values: {
      energy_kcal: energy,
      carbohydrate_g: 20,
      protein_g: 10,
      fat_g: 5,
      sodium_mg: 50,
    },
    sources: [{
      provider: "MFDS",
      dataset: "Recipe snapshot fixture",
      source_version: "2026-07-01",
      data_basis_date: "2026-07-01",
      license: "test-only",
      source_url: "https://example.test/nutrition",
    }],
    target_ingredient_count: 1,
    warnings: [],
  };
}

function writeSnapshotSql(recipeId: string, value: unknown, expectedRecipeVersion?: string) {
  const version = expectedRecipeVersion ??
    psql(`select updated_at from public.recipes where id = '${recipeId}';`);
  const expectedVersionSql = `'${version}'::timestamptz`;
  return `set role service_role; select public.write_recipe_nutrition_snapshot('${recipeId}', ${jsonExpression(value)}, ${expectedVersionSql})::text;`;
}

function seedRecipe(recipeId: string, title: string) {
  psql(`insert into public.recipes (id, title, base_servings) values ('${recipeId}', '${title}', 2);`);
}

describe.runIf(enabled)("recipe nutrition isolated PostgreSQL integration", () => {
  beforeAll(() => {
    psql(`
      insert into public.users (id, nickname, social_provider, social_id)
      values ('${actorId}', 'reviewer', 'test', 'recipe-nutrition-reviewer');
      insert into public.nutrition_sources (
        provider_code, dataset_name, source_kind, source_version, data_basis_date,
        fetched_at, freshness_checked_at, freshness_status, priority_rank,
        source_url, license_name, license_url, manifest_sha256, review_status,
        decision_reason, reviewed_by, reviewed_at, is_active
      ) values (
        'MFDS', 'Recipe snapshot fixture', 'nutrition_dataset', '2026-07-01', '2026-07-01',
        now(), now(), 'current', 1, 'https://example.test/nutrition', 'test-only',
        'https://example.test/license', repeat('a', 64), 'approved',
        'isolated integration fixture', '${actorId}', now(), true
      );
    `);
  });

  it("counts only one complete approved ingredient chain and exposes ambiguity or revocation", () => {
    const ingredientId = "40000000-0000-4000-8000-000000000001";
    const rawItemId = "41000000-0000-4000-8000-000000000001";
    const cookedItemId = "41000000-0000-4000-8000-000000000002";
    const rawProfileId = "42000000-0000-4000-8000-000000000001";
    const cookedProfileId = "42000000-0000-4000-8000-000000000002";
    const rawLinkId = "43000000-0000-4000-8000-000000000001";
    const cookedLinkId = "43000000-0000-4000-8000-000000000002";
    const sourceId = psql("select id from public.nutrition_sources where provider_code = 'MFDS';");
    const eligibleCountSql = `
      select count(*)
      from public.ingredient_nutrition_profiles link
      join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
      join public.nutrition_source_items item on item.id = profile.source_item_id
      join public.nutrition_sources source on source.id = item.source_id
      where link.ingredient_id = '${ingredientId}'
        and link.review_status = 'approved' and link.is_active and link.is_primary
        and profile.profile_kind = 'ingredient_source'
        and profile.normalization_method in ('mass_100g', 'volume_100ml')
        and profile.review_status = 'approved' and profile.is_active
        and item.review_status = 'approved'
        and source.review_status = 'approved' and source.is_active
        and source.freshness_status = 'current';
    `;

    psql(`
      insert into public.ingredients (id, standard_name, category, default_unit)
      values ('${ingredientId}', '통합 테스트 재료', '채소', 'g');
      insert into public.nutrition_source_items (
        id, source_id, external_item_key, external_name, preparation_state,
        source_basis_text, source_basis_amount, source_basis_unit, edible_portion_percent,
        stable_fingerprint, review_status, decision_reason, reviewed_by, reviewed_at
      ) values
        ('${rawItemId}', '${sourceId}', 'integration-raw', '통합 테스트 재료', 'raw',
          '100 g', 100, 'g', 100, repeat('b', 64), 'approved',
          'isolated integration fixture', '${actorId}', now()),
        ('${cookedItemId}', '${sourceId}', 'integration-cooked', '통합 테스트 재료', 'cooked',
          '100 g', 100, 'g', 100, repeat('c', 64), 'approved',
          'isolated integration fixture', '${actorId}', now());
      insert into public.nutrition_profiles (
        id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
        version, review_status, decision_reason, reviewed_by, reviewed_at, is_active
      ) values
        ('${rawProfileId}', '${rawItemId}', 'ingredient_source', 'mass_100g', 100, 'g',
          1, 'approved', 'isolated integration fixture', '${actorId}', now(), true),
        ('${cookedProfileId}', '${cookedItemId}', 'ingredient_source', 'mass_100g', 100, 'g',
          1, 'approved', 'isolated integration fixture', '${actorId}', now(), true);
      insert into public.nutrition_values (
        profile_id, nutrient_code, source_nutrient_code, source_unit, amount, value_status
      )
      select profile_id, nutrient_code, nutrient_code, source_unit, amount, 'observed'
      from (values
        ('${rawProfileId}'::uuid, 'energy_kcal', 'kcal', 20::numeric),
        ('${rawProfileId}'::uuid, 'carbohydrate_g', 'g', 4::numeric),
        ('${rawProfileId}'::uuid, 'protein_g', 'g', 1::numeric),
        ('${rawProfileId}'::uuid, 'fat_g', 'g', 0::numeric),
        ('${rawProfileId}'::uuid, 'sodium_mg', 'mg', 5::numeric),
        ('${cookedProfileId}'::uuid, 'energy_kcal', 'kcal', 25::numeric),
        ('${cookedProfileId}'::uuid, 'carbohydrate_g', 'g', 5::numeric),
        ('${cookedProfileId}'::uuid, 'protein_g', 'g', 1::numeric),
        ('${cookedProfileId}'::uuid, 'fat_g', 'g', 0::numeric),
        ('${cookedProfileId}'::uuid, 'sodium_mg', 'mg', 6::numeric)
      ) values(profile_id, nutrient_code, source_unit, amount);
      insert into public.ingredient_nutrition_profiles (
        id, ingredient_id, nutrition_profile_id, preparation_state, match_method,
        is_primary, review_status, decision_reason, reviewed_by, reviewed_at, version, is_active
      ) values (
        '${rawLinkId}', '${ingredientId}', '${rawProfileId}', 'raw', 'exact_standard_name',
        true, 'approved', 'isolated integration fixture', '${actorId}', now(), 1, true
      );
    `);
    expect(psql(eligibleCountSql)).toBe("1");

    psql(`
      insert into public.ingredient_nutrition_profiles (
        id, ingredient_id, nutrition_profile_id, preparation_state, match_method,
        is_primary, review_status, decision_reason, reviewed_by, reviewed_at, version, is_active
      ) values (
        '${cookedLinkId}', '${ingredientId}', '${cookedProfileId}', 'cooked', 'exact_standard_name',
        true, 'approved', 'isolated integration fixture', '${actorId}', now(), 1, true
      );
    `);
    expect(psql(eligibleCountSql)).toBe("2");

    psql(`
      update public.ingredient_nutrition_profiles
      set review_status = 'revoked', is_active = false, is_primary = false,
        decision_reason = 'isolated integration revocation', reviewed_at = now()
      where id = '${cookedLinkId}';
    `);
    expect(psql(eligibleCountSql)).toBe("1");

    psql(`
      update public.ingredient_nutrition_profiles
      set review_status = 'revoked', is_active = false, is_primary = false,
        decision_reason = 'isolated integration revocation', reviewed_at = now()
      where id = '${rawLinkId}';
    `);
    expect(psql(eligibleCountSql)).toBe("0");
  });

  it("writes idempotently, supersedes atomically, and restores without deleting history", () => {
    const recipeId = "20000000-0000-4000-8000-000000000001";
    seedRecipe(recipeId, "writer fixture");
    const first = JSON.parse(psql(writeSnapshotSql(recipeId, snapshot("a"))));
    const replay = JSON.parse(psql(writeSnapshotSql(recipeId, snapshot("a"))));

    expect(first.created).toBe(true);
    expect(first.snapshot_id).toBe(deriveRecipeNutritionSnapshotId(
      recipeId,
      "a".repeat(64),
      "recipe-nutrition-v1",
    ));
    expect(replay).toMatchObject({ snapshot_id: first.snapshot_id, created: false, is_current: true });
    expect(psql(`select count(*) || ':' || count(*) filter (where is_current) from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`)).toBe("1:1");

    const second = JSON.parse(psql(writeSnapshotSql(recipeId, snapshot("b", 120))));
    expect(second.created).toBe(true);
    expect(psql(`select count(*) || ':' || count(*) filter (where is_current) from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`)).toBe("2:1");

    const restored = JSON.parse(psql(`set role service_role; select public.restore_recipe_nutrition_snapshot_current('${recipeId}', '${first.snapshot_id}', '${second.snapshot_id}')::text;`));
    expect(restored).toMatchObject({ snapshot_id: first.snapshot_id, is_current: true });
    expect(psql(`select id from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}' and is_current;`)).toBe(first.snapshot_id);
    expect(psql(`select count(*) from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`)).toBe("2");
  });

  it("rejects a stale writer after the recipe revision changes", () => {
    const recipeId = "20000000-0000-4000-8000-00000000000a";
    seedRecipe(recipeId, "stale writer fixture");
    const staleVersion = psql(`select updated_at from public.recipes where id = '${recipeId}';`);
    psql(`update public.recipes set updated_at = updated_at + interval '1 second' where id = '${recipeId}';`);

    const result = psqlResult(writeSnapshotSql(recipeId, snapshot("a"), staleVersion));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("RECIPE_NUTRITION_INPUT_STALE");
    expect(psql(`select count(*) from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`)).toBe("0");
  });

  it("fails closed for extra source fields, unsafe URLs, vector drift, and status contradictions", () => {
    const recipeId = "20000000-0000-4000-8000-000000000002";
    seedRecipe(recipeId, "validator fixture");
    const extraSource = snapshot("c") as ReturnType<typeof snapshot> & { sources: Array<Record<string, unknown>> };
    extraSource.sources[0].raw_provider_row = "forbidden";
    const unsafeUrl = snapshot("d");
    unsafeUrl.sources[0].source_url = "https://example.test/nutrition?api_key=secret";
    const vectorDrift = snapshot("e");
    vectorDrift.scalable_values.energy_kcal = 99;
    const contradiction = snapshot("f");
    contradiction.calculation_status = "unavailable";

    for (const [value, error] of [
      [extraSource, "UNSAFE_SNAPSHOT_SOURCE"],
      [unsafeUrl, "UNSAFE_SNAPSHOT_SOURCE"],
      [vectorDrift, "SNAPSHOT_VECTOR_SUM_MISMATCH"],
      [contradiction, "INVALID_SNAPSHOT_STATUS"],
    ] as const) {
      const result = psqlResult(writeSnapshotSql(recipeId, value));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(error);
    }
    expect(psql(`select count(*) from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`)).toBe("0");
  });

  it("denies direct client access and keeps snapshot rows append-only", () => {
    const recipeId = "20000000-0000-4000-8000-000000000003";
    seedRecipe(recipeId, "security fixture");
    const written = JSON.parse(psql(writeSnapshotSql(recipeId, snapshot("1"))));

    const anonymousRead = psqlResult("set role authenticated; select * from public.recipe_nutrition_snapshots;");
    expect(anonymousRead.status).not.toBe(0);
    expect(anonymousRead.stderr).toContain("permission denied");
    const serviceInsert = psqlResult(`set role service_role; insert into public.recipe_nutrition_snapshots (recipe_id) values ('${recipeId}');`);
    expect(serviceInsert.status).not.toBe(0);
    expect(serviceInsert.stderr).toContain("permission denied");
    const directUpdate = psqlResult(`update public.recipe_nutrition_snapshots set calculated_at = now() where id = '${written.snapshot_id}';`);
    expect(directUpdate.status).not.toBe(0);
    expect(directUpdate.stderr).toContain("IMMUTABLE_RECIPE_NUTRITION_SNAPSHOT");
    const directDelete = psqlResult(`delete from public.recipe_nutrition_snapshots where id = '${written.snapshot_id}';`);
    expect(directDelete.status).not.toBe(0);
    expect(directDelete.stderr).toContain("IMMUTABLE_RECIPE_NUTRITION_SNAPSHOT");
  });

  it("pins only the server current snapshot on Meal creation and never silently repins", () => {
    const pinnedRecipeId = "20000000-0000-4000-8000-000000000004";
    const emptyRecipeId = "20000000-0000-4000-8000-000000000005";
    seedRecipe(pinnedRecipeId, "meal pin fixture");
    seedRecipe(emptyRecipeId, "meal null fixture");
    const first = JSON.parse(psql(writeSnapshotSql(pinnedRecipeId, snapshot("2"))));
    const mealId = "30000000-0000-4000-8000-000000000001";
    psql(`insert into public.meals (id, recipe_id) values ('${mealId}', '${pinnedRecipeId}');`);
    expect(psql(`select recipe_nutrition_snapshot_id || ':' || nutrition_snapshot_origin from public.meals where id = '${mealId}';`)).toBe(`${first.snapshot_id}:created`);

    psql(writeSnapshotSql(pinnedRecipeId, snapshot("3", 130)));
    expect(psql(`select recipe_nutrition_snapshot_id from public.meals where id = '${mealId}';`)).toBe(first.snapshot_id);
    psql(`insert into public.meals (id, recipe_id) values ('30000000-0000-4000-8000-000000000002', '${emptyRecipeId}');`);
    expect(psql(`select (recipe_nutrition_snapshot_id is null and nutrition_snapshot_origin is null)::text from public.meals where id = '30000000-0000-4000-8000-000000000002';`)).toBe("true");

    const clientPin = psqlResult(`insert into public.meals (id, recipe_id, recipe_nutrition_snapshot_id, nutrition_snapshot_origin) values ('30000000-0000-4000-8000-000000000003', '${pinnedRecipeId}', '${first.snapshot_id}', 'created');`);
    expect(clientPin.status).not.toBe(0);
    expect(clientPin.stderr).toContain("CLIENT_SELECTED_NUTRITION_SNAPSHOT_NOT_ALLOWED");

    const recipeSwap = psqlResult(`update public.meals set recipe_id = '${emptyRecipeId}' where id = '${mealId}';`);
    expect(recipeSwap.status).not.toBe(0);
    expect(recipeSwap.stderr).toContain("IMMUTABLE_MEAL_NUTRITION_SNAPSHOT_PIN");
  });

  it("backfills only FoodSafety-30 null pins with dry-run and replay safety", () => {
    const scopedRecipeId = "20000000-0000-4000-8000-000000000006";
    const otherRecipeId = "20000000-0000-4000-8000-000000000007";
    seedRecipe(scopedRecipeId, "scoped backfill fixture");
    seedRecipe(otherRecipeId, "other backfill fixture");
    psql(`
      insert into public.recipes (id, title, base_servings)
      select ('21000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
        'exact scope filler ' || value,
        2
      from generate_series(1, 29) value;
      insert into public.recipe_sources (recipe_id, extraction_meta_json)
      select id, '{"reviewed_scope":"pilot_30_quality_corrected","source_provider":"foodsafety-cookrcp"}'::jsonb
      from public.recipes
      where title like 'exact scope filler %';
      insert into public.recipe_sources (recipe_id, extraction_meta_json) values
        ('${scopedRecipeId}', '{"reviewed_scope":"pilot_30_quality_corrected","source_provider":"foodsafety-cookrcp"}'::jsonb),
        ('${otherRecipeId}', '{}'::jsonb);
      insert into public.meals (id, recipe_id) values
        ('30000000-0000-4000-8000-000000000004', '${scopedRecipeId}'),
        ('30000000-0000-4000-8000-000000000005', '${otherRecipeId}');
    `);
    psql(writeSnapshotSql(scopedRecipeId, snapshot("4")));
    psql(writeSnapshotSql(otherRecipeId, snapshot("5")));

    const dryRun = JSON.parse(psql("set role service_role; select public.backfill_foodsafety_recipe_nutrition_meal_pins(true, null, 250)::text;"));
    expect(dryRun).toMatchObject({ scope: "foodsafety-30", dry_run: true, processed_count: 1 });
    expect(psql("select count(*) from public.meals where nutrition_snapshot_origin = 'backfill';")).toBe("0");
    const apply = JSON.parse(psql("set role service_role; select public.backfill_foodsafety_recipe_nutrition_meal_pins(false, null, 250)::text;"));
    expect(apply).toMatchObject({ scope: "foodsafety-30", dry_run: false, processed_count: 1 });
    const replay = JSON.parse(psql("set role service_role; select public.backfill_foodsafety_recipe_nutrition_meal_pins(false, null, 250)::text;"));
    expect(replay.processed_count).toBe(0);
    expect(psql(`select nutrition_snapshot_origin from public.meals where recipe_id = '${scopedRecipeId}';`)).toBe("backfill");
    expect(psql(`select (recipe_nutrition_snapshot_id is null)::text from public.meals where recipe_id = '${otherRecipeId}';`)).toBe("true");
  });

  it("serializes concurrent writers and rolls back a failed transaction cleanly", async () => {
    const recipeId = "20000000-0000-4000-8000-000000000008";
    seedRecipe(recipeId, "concurrency fixture");
    const results = await Promise.all([
      psqlAsync(writeSnapshotSql(recipeId, snapshot("6", 140))),
      psqlAsync(writeSnapshotSql(recipeId, snapshot("7", 150))),
    ]);
    for (const result of results) expect(result.status, result.stderr).toBe(0);
    expect(psql(`select count(*) || ':' || count(*) filter (where is_current) from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`)).toBe("2:1");
    const before = psql(`select id from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}' and is_current;`);
    const rollback = psqlResult(`begin; ${writeSnapshotSql(recipeId, snapshot("8", 160))} rollback;`);
    expect(rollback.status, rollback.stderr).toBe(0);
    expect(psql(`select id from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}' and is_current;`)).toBe(before);
    expect(psql(`select count(*) from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`)).toBe("2");
  });

  it("rolls a first snapshot back to no current row without deleting history", () => {
    const recipeId = "20000000-0000-4000-8000-000000000009";
    seedRecipe(recipeId, "first snapshot rollback fixture");
    const written = JSON.parse(psql(writeSnapshotSql(recipeId, snapshot("9", 170))));

    const rolledBack = JSON.parse(psql(
      `set role service_role; select public.restore_recipe_nutrition_snapshot_current('${recipeId}', null, '${written.snapshot_id}')::text;`,
    ));

    expect(rolledBack).toMatchObject({ snapshot_id: null, is_current: false });
    expect(psql(`select count(*) || ':' || count(*) filter (where is_current) from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`)).toBe("1:0");
    expect(psql(`select id from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`)).toBe(written.snapshot_id);
  });
});
