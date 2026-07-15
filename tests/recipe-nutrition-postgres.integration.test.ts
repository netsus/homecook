import { spawn, spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { deriveRecipeNutritionSnapshotId } from "@/scripts/lib/recipe-nutrition-backfill.mjs";

const enabled = process.env.HOMECOOK_RECIPE_NUTRITION_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_RECIPE_NUTRITION_PGHOST ?? "";
const port = process.env.HOMECOOK_RECIPE_NUTRITION_PGPORT ?? "";
const database = process.env.HOMECOOK_RECIPE_NUTRITION_PGDATABASE ?? "";
const actorId = "10000000-0000-4000-8000-000000000001";
const guardIngredientId = "60000000-0000-4000-8000-000000000001";
const guardSourceId = "61000000-0000-4000-8000-000000000001";
const guardSourceItemId = "62000000-0000-4000-8000-000000000001";
const guardProfileId = "63000000-0000-4000-8000-000000000001";
const guardLinkId = "64000000-0000-4000-8000-000000000001";
const alternateSourceItemId = "62000000-0000-4000-8000-000000000002";
const alternateProfileId = "63000000-0000-4000-8000-000000000002";
const alternateLinkId = "64000000-0000-4000-8000-000000000002";
const measurementSourceId = "65000000-0000-4000-8000-000000000001";
const measurementEvidenceId = "66000000-0000-4000-8000-000000000001";
const pendingAssignmentId = "67000000-0000-4000-8000-000000000001";

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

function psqlAsync(
  sql: string,
  applicationName = "recipe-nutrition-test-async",
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [
      "-h", host,
      "-p", port,
      "-U", "postgres",
      "-d", database,
      "-At",
      "-v", "ON_ERROR_STOP=1",
      "-c", sql,
    ], {
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        PGAPPNAME: applicationName,
      },
    });
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

function openPsqlSession(applicationName: string) {
  const child = spawn("psql", [
    "-h", host,
    "-p", port,
    "-U", "postgres",
    "-d", database,
    "-At",
    "-v", "ON_ERROR_STOP=1",
  ], {
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test",
      PGAPPNAME: applicationName,
    },
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stderr = "";
  let markerSequence = 0;
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const run = (sql: string) => new Promise<void>((resolve, reject) => {
    const marker = `__homecook_psql_marker_${markerSequence += 1}__`;
    let stdout = "";
    const onData = (chunk: string) => {
      stdout += chunk;
      if (!stdout.includes(marker)) return;
      child.stdout.off("data", onData);
      child.off("close", onClose);
      resolve();
    };
    const onClose = (status: number | null) => {
      child.stdout.off("data", onData);
      reject(new Error(`psql session closed (${status}): ${stderr}`));
    };
    child.once("close", onClose);
    child.stdout.on("data", onData);
    child.stdin.write(`${sql}\n\\echo ${marker}\n`, (error) => {
      if (!error) return;
      child.stdout.off("data", onData);
      child.off("close", onClose);
      reject(error);
    });
  });

  const close = () => new Promise<void>((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("close", () => resolve());
    child.stdin.end("\\q\n");
  });

  return { run, close };
}

async function waitForDatabaseLock(applicationName: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (psql(`
      select count(*)
      from pg_stat_activity
      where application_name = '${applicationName}' and wait_event_type = 'Lock';
    `) === "1") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for database lock: ${applicationName}`);
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

function writeSnapshotSql(
  recipeId: string,
  value: unknown,
  expectedRecipeVersion?: string,
  inputGuard?: unknown,
) {
  const version = expectedRecipeVersion ??
    psql(`select updated_at from public.recipes where id = '${recipeId}';`);
  const guard = inputGuard ?? JSON.parse(psql(
    `select public.build_recipe_nutrition_input_guard('${recipeId}')::text;`,
  ));
  const expectedVersionSql = `'${version}'::timestamptz`;
  return `set role service_role; select public.write_recipe_nutrition_snapshot('${recipeId}', ${jsonExpression(value)}, ${expectedVersionSql}, ${jsonExpression(guard)})::text;`;
}

function seedRecipe(recipeId: string, title: string) {
  psql(`
    insert into public.recipes (id, title, base_servings) values ('${recipeId}', '${title}', 2);
    insert into public.recipe_ingredients (
      recipe_id, ingredient_id, amount, unit, ingredient_type, scalable, sort_order
    ) values ('${recipeId}', '${guardIngredientId}', 100, 'g', 'QUANT', true, 0);
  `);
}

async function expectMutationWinsSnapshotRace(options: {
  recipeId: string;
  title: string;
  barrierKey: number;
  mutationSql: string;
  snapshotSeed: string;
}) {
  seedRecipe(options.recipeId, options.title);
  const staleVersion = psql(
    `select updated_at from public.recipes where id = '${options.recipeId}';`,
  );
  const staleGuard = JSON.parse(psql(
    `select public.build_recipe_nutrition_input_guard('${options.recipeId}')::text;`,
  ));
  const suffix = options.recipeId.slice(-4);
  const mutationApplication = `recipe-nutrition-race-mutation-${suffix}`;
  const writerApplication = `recipe-nutrition-race-writer-${suffix}`;
  const barrier = openPsqlSession(`recipe-nutrition-race-barrier-${suffix}`);
  let barrierReleased = false;
  let mutationPromise: ReturnType<typeof psqlAsync> | null = null;
  let writerPromise: ReturnType<typeof psqlAsync> | null = null;

  try {
    await barrier.run(`select pg_advisory_lock(${options.barrierKey});`);
    mutationPromise = psqlAsync(`
      begin;
      ${options.mutationSql}
      select pg_advisory_xact_lock(${options.barrierKey});
      commit;
    `, mutationApplication);
    await waitForDatabaseLock(mutationApplication);

    writerPromise = psqlAsync(
      writeSnapshotSql(
        options.recipeId,
        snapshot(options.snapshotSeed),
        staleVersion,
        staleGuard,
      ),
      writerApplication,
    );
    await waitForDatabaseLock(writerApplication);
    expect(Number(psql(`
      select count(*)
      from pg_locks mutation_lock
      join pg_stat_activity mutation_activity on mutation_activity.pid = mutation_lock.pid
      join pg_locks writer_lock
        on writer_lock.locktype = mutation_lock.locktype
        and writer_lock.database = mutation_lock.database
        and writer_lock.classid = mutation_lock.classid
        and writer_lock.objid = mutation_lock.objid
        and writer_lock.objsubid = mutation_lock.objsubid
      join pg_stat_activity writer_activity on writer_activity.pid = writer_lock.pid
      where mutation_activity.application_name = '${mutationApplication}'
        and writer_activity.application_name = '${writerApplication}'
        and mutation_lock.locktype = 'advisory'
        and mutation_lock.mode = 'ExclusiveLock'
        and mutation_lock.granted
        and writer_lock.mode = 'ShareLock'
        and not writer_lock.granted;
    `))).toBe(1);

    await barrier.run(`select pg_advisory_unlock(${options.barrierKey});`);
    barrierReleased = true;
    const [mutation, writer] = await Promise.all([mutationPromise, writerPromise]);

    expect(mutation.status, mutation.stderr).toBe(0);
    expect(writer.status).not.toBe(0);
    expect(writer.stderr).toContain("RECIPE_NUTRITION_INPUT_STALE");
    expect(psql(
      `select count(*) from public.recipe_nutrition_snapshots where recipe_id = '${options.recipeId}';`,
    )).toBe("0");
  } finally {
    if (!barrierReleased) {
      await barrier.run(`select pg_advisory_unlock(${options.barrierKey});`).catch(() => undefined);
    }
    await barrier.close();
    await Promise.allSettled([
      ...(mutationPromise ? [mutationPromise] : []),
      ...(writerPromise ? [writerPromise] : []),
    ]);
  }
}

async function expectWriterWinsSnapshotRace(options: {
  recipeId: string;
  title: string;
  mutationSql: string;
  snapshotSeed: string;
}) {
  seedRecipe(options.recipeId, options.title);
  const recipeVersion = psql(
    `select updated_at from public.recipes where id = '${options.recipeId}';`,
  );
  const inputGuard = JSON.parse(psql(
    `select public.build_recipe_nutrition_input_guard('${options.recipeId}')::text;`,
  ));
  const suffix = options.recipeId.slice(-4);
  const writerApplication = `recipe-nutrition-writer-first-${suffix}`;
  const mutationApplication = `recipe-nutrition-writer-first-mutation-${suffix}`;
  const writer = openPsqlSession(writerApplication);
  let writerCommitted = false;
  let mutationPromise: ReturnType<typeof psqlAsync> | null = null;

  try {
    await writer.run(`
      begin;
      set role service_role;
      select public.write_recipe_nutrition_snapshot(
        '${options.recipeId}',
        ${jsonExpression(snapshot(options.snapshotSeed))},
        '${recipeVersion}'::timestamptz,
        ${jsonExpression(inputGuard)}
      )::text;
    `);
    expect(psql(`
      select count(*)
      from pg_locks lock
      join pg_stat_activity activity on activity.pid = lock.pid
      where activity.application_name = '${writerApplication}'
        and lock.locktype = 'advisory'
        and lock.granted;
    `)).toBe("2");
    expect(psql(`
      select string_agg(lock.mode, ',' order by lock.mode collate "C")
      from pg_locks lock
      join pg_stat_activity activity on activity.pid = lock.pid
      where activity.application_name = '${writerApplication}'
        and lock.locktype = 'advisory'
        and lock.granted;
    `)).toBe("ExclusiveLock,ShareLock");

    mutationPromise = psqlAsync(options.mutationSql, mutationApplication);
    await waitForDatabaseLock(mutationApplication);
    expect(psql(`
      select count(*)
      from pg_locks writer_lock
      join pg_stat_activity writer_activity on writer_activity.pid = writer_lock.pid
      join pg_locks mutation_lock
        on mutation_lock.locktype = writer_lock.locktype
        and mutation_lock.database = writer_lock.database
        and mutation_lock.classid = writer_lock.classid
        and mutation_lock.objid = writer_lock.objid
        and mutation_lock.objsubid = writer_lock.objsubid
      join pg_stat_activity mutation_activity on mutation_activity.pid = mutation_lock.pid
      where writer_activity.application_name = '${writerApplication}'
        and mutation_activity.application_name = '${mutationApplication}'
        and writer_lock.locktype = 'advisory'
        and writer_lock.mode = 'ExclusiveLock'
        and writer_lock.granted
        and mutation_lock.mode = 'ExclusiveLock'
        and not mutation_lock.granted;
    `)).toBe("1");

    await writer.run("commit;");
    writerCommitted = true;
    const mutation = await mutationPromise;
    expect(mutation.status, mutation.stderr).toBe(0);

    const staleReplay = psqlResult(writeSnapshotSql(
      options.recipeId,
      snapshot("1"),
      recipeVersion,
      inputGuard,
    ));
    expect(staleReplay.status).not.toBe(0);
    expect(staleReplay.stderr).toContain("RECIPE_NUTRITION_INPUT_STALE");
    expect(psql(
      `select count(*) from public.recipe_nutrition_snapshots where recipe_id = '${options.recipeId}';`,
    )).toBe("1");
  } finally {
    if (!writerCommitted) await writer.run("rollback;").catch(() => undefined);
    await writer.close();
    if (mutationPromise) await Promise.allSettled([mutationPromise]);
  }
}

describe.runIf(enabled)("recipe nutrition isolated PostgreSQL integration", () => {
  beforeAll(() => {
    psql(`
      insert into public.users (id, nickname, social_provider, social_id)
      values ('${actorId}', 'reviewer', 'test', 'recipe-nutrition-reviewer');
      insert into public.nutrition_sources (
        id, provider_code, dataset_name, source_kind, source_version, data_basis_date,
        fetched_at, freshness_checked_at, freshness_status, priority_rank,
        source_url, license_name, license_url, manifest_sha256, review_status,
        decision_reason, reviewed_by, reviewed_at, is_active
      ) values (
        '${guardSourceId}', 'MFDS', 'Recipe snapshot fixture', 'nutrition_dataset', '2026-07-01', '2026-07-01',
        now(), now(), 'current', 1, 'https://example.test/nutrition', 'test-only',
        'https://example.test/license', repeat('a', 64), 'approved',
        'isolated integration fixture', '${actorId}', now(), true
      );
      insert into public.nutrition_sources (
        id, provider_code, dataset_name, source_kind, source_version, data_basis_date,
        fetched_at, freshness_checked_at, freshness_status, priority_rank,
        source_url, license_name, license_url, manifest_sha256, review_status,
        decision_reason, reviewed_by, reviewed_at, is_active
      ) values (
        '${measurementSourceId}', 'MEASURE', 'Recipe measurement fixture', 'measurement_reference',
        '2026-07-02', '2026-07-02', now(), now(), 'current', 2,
        'https://example.test/measurement', 'test-only', 'https://example.test/license',
        repeat('f', 64), 'approved', 'isolated integration fixture',
        '${actorId}', now(), true
      );
      insert into public.ingredients (id, standard_name, category, default_unit)
      values ('${guardIngredientId}', 'writer guard fixture ingredient', 'test', 'g');
      insert into public.measurement_source_evidence (
        id, source_id, evidence_kind, source_subject, preparation_state,
        source_observed_unit, source_observed_amount, observed_volume_ml, observed_weight_g,
        normalized_g_per_15ml, source_url, source_accessed_at, evidence_fingerprint,
        review_status, decision_reason, reviewed_by, reviewed_at, version, is_active
      ) values (
        '${measurementEvidenceId}', '${measurementSourceId}', 'volume_weight',
        'writer guard fixture ingredient', 'raw-edible', 'tbsp', 1, 15, 15, 15,
        'https://example.test/measurement', '2026-07-02', repeat('9', 64),
        'approved', 'isolated integration fixture', '${actorId}', now(), 1, true
      );
      insert into public.ingredient_conversion_assignments (
        id, ingredient_id, conversion_profile_id, evidence_id, preparation_state,
        distance_g_per_15ml, candidate_rank, confidence_score, assignment_reason,
        review_status, version, is_active
      ) values (
        '${pendingAssignmentId}', '${guardIngredientId}',
        '71000000-0000-4000-8000-000000000015', '${measurementEvidenceId}',
        'raw-edible', 0, 1, 1, null, 'pending', 1, false
      );
      insert into public.nutrition_source_items (
        id, source_id, external_item_key, external_name, preparation_state,
        source_basis_text, source_basis_amount, source_basis_unit, edible_portion_percent,
        stable_fingerprint, review_status, decision_reason, reviewed_by, reviewed_at
      ) values
        ('${guardSourceItemId}', '${guardSourceId}', 'writer-guard-raw', 'writer guard fixture ingredient', 'raw-edible',
          '100 g', 100, 'g', 100, repeat('d', 64), 'approved',
          'isolated integration fixture', '${actorId}', now()),
        ('${alternateSourceItemId}', '${guardSourceId}', 'writer-guard-cooked', 'writer guard fixture ingredient', 'cooked',
          '100 g', 100, 'g', 100, repeat('e', 64), 'approved',
          'isolated integration fixture', '${actorId}', now());
      insert into public.nutrition_profiles (
        id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
        version, review_status, decision_reason, reviewed_by, reviewed_at, is_active
      ) values
        ('${guardProfileId}', '${guardSourceItemId}', 'ingredient_source', 'mass_100g', 100, 'g',
          1, 'approved', 'isolated integration fixture', '${actorId}', now(), true),
        ('${alternateProfileId}', '${alternateSourceItemId}', 'ingredient_source', 'mass_100g', 100, 'g',
          1, 'approved', 'isolated integration fixture', '${actorId}', now(), true);
      insert into public.nutrition_values (
        profile_id, nutrient_code, source_nutrient_code, source_unit, amount, value_status
      )
      select profile_id, nutrient_code, nutrient_code, source_unit, amount, 'observed'
      from (values
        ('${guardProfileId}'::uuid, 'energy_kcal', 'kcal', 100::numeric),
        ('${guardProfileId}'::uuid, 'carbohydrate_g', 'g', 20::numeric),
        ('${guardProfileId}'::uuid, 'protein_g', 'g', 10::numeric),
        ('${guardProfileId}'::uuid, 'fat_g', 'g', 5::numeric),
        ('${guardProfileId}'::uuid, 'sodium_mg', 'mg', 50::numeric),
        ('${alternateProfileId}'::uuid, 'energy_kcal', 'kcal', 110::numeric),
        ('${alternateProfileId}'::uuid, 'carbohydrate_g', 'g', 21::numeric),
        ('${alternateProfileId}'::uuid, 'protein_g', 'g', 11::numeric),
        ('${alternateProfileId}'::uuid, 'fat_g', 'g', 6::numeric),
        ('${alternateProfileId}'::uuid, 'sodium_mg', 'mg', 55::numeric)
      ) values(profile_id, nutrient_code, source_unit, amount);
      insert into public.ingredient_nutrition_profiles (
        id, ingredient_id, nutrition_profile_id, preparation_state, match_method,
        is_primary, review_status, decision_reason, reviewed_by, reviewed_at, version, is_active
      ) values
        ('${guardLinkId}', '${guardIngredientId}', '${guardProfileId}', 'raw-edible', 'exact_standard_name',
          true, 'approved', 'isolated integration fixture', '${actorId}', now(), 1, true),
        ('${alternateLinkId}', '${guardIngredientId}', '${alternateProfileId}', 'cooked', 'exact_standard_name',
          false, 'pending', null, null, null, 1, false);
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

  it("persists optional-only nutrients as partial with non-null provenance", () => {
    const recipeId = "20000000-0000-4000-8000-00000000000c";
    seedRecipe(recipeId, "optional-only fixture");
    const value = snapshot("c") as unknown as {
      nutrient_status: Record<string, {
        status: string;
        amount: number | null;
        known_amount: number | null;
        display_mode: string | null;
      }>;
      scalable_values: Record<string, number>;
      fixed_values: Record<string, number>;
      calculation_status: string;
    };
    value.nutrient_status = Object.fromEntries([
      "energy_kcal", "carbohydrate_g", "protein_g", "fat_g", "sodium_mg",
    ].map((code) => [code, {
      status: "unavailable",
      amount: null,
      known_amount: null,
      display_mode: null,
    }]));
    value.nutrient_status.sugars_g = {
      status: "complete",
      amount: 3,
      known_amount: null,
      display_mode: "total",
    };
    value.scalable_values = { sugars_g: 3 };
    value.fixed_values = { sugars_g: 0 };
    value.calculation_status = "partial";

    psql(writeSnapshotSql(recipeId, value));

    expect(psql(`
      select calculation_status || ':' || calculation_quality || ':' ||
        jsonb_array_length(sources_json)::text
      from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';
    `)).toBe("partial:direct:1");
  });

  it("derives only the exact sources that contributed an observed nutrient", () => {
    const nutritionSource = snapshot("0").sources[0];
    const measurementSource = {
      provider: "MEASURE",
      dataset: "Recipe measurement fixture",
      source_version: "2026-07-02",
      data_basis_date: "2026-07-02",
      license: "test-only",
      source_url: "https://example.test/measurement",
    };
    const inputGuard = (
      unit: string | null,
      basisUnit: "g" | "ml",
      values: Array<{ nutrient_code: string; amount: number | null; value_status: string }>,
      options: { ingredientType?: "QUANT" | "TO_TASTE"; conversion?: boolean } = {},
    ) => ({
      recipe_ingredients: [{
        id: "source-matrix-recipe-ingredient",
        ingredient_id: "source-matrix-ingredient",
        amount: options.ingredientType === "TO_TASTE" ? null : 1,
        unit: options.ingredientType === "TO_TASTE" ? null : unit,
        ingredient_type: options.ingredientType ?? "QUANT",
        scalable: true,
        sort_order: 0,
        nutrition_candidates: [{
          link_id: "source-matrix-link",
          profile_id: "source-matrix-profile",
          source_item_id: "source-matrix-item",
          source_id: guardSourceId,
          preparation_state: "raw-edible",
          normalization_method: basisUnit === "g" ? "mass_100g" : "volume_100ml",
          basis_amount: 100,
          basis_unit: basisUnit,
          nutrition_values: values,
          source: nutritionSource,
        }],
        conversion_candidates: options.conversion ? [{
          assignment_id: "source-matrix-assignment",
          profile_id: "source-matrix-conversion-profile",
          evidence_id: "source-matrix-evidence",
          source_id: measurementSourceId,
          preparation_state: "raw-edible",
          profile_code: "VOLUME_G15",
          basis_volume_ml: 15,
          representative_weight_g: 15,
          evidence_preparation_state: "raw-edible",
          source: measurementSource,
        }] : [],
        selected_nutrition_link_id: "source-matrix-link",
        selected_conversion_assignment_id: options.conversion
          ? "source-matrix-assignment"
          : null,
      }],
    });
    const observed = [{ nutrient_code: "energy_kcal", amount: 0, value_status: "observed" }];
    const optionalOnly = [{ nutrient_code: "sugars_g", amount: 3, value_status: "observed" }];
    const missingOnly = [{ nutrient_code: "energy_kcal", amount: null, value_status: "missing" }];
    const contributingSources = (guard: unknown) => JSON.parse(psql(
      `select public.build_recipe_nutrition_contributing_sources(${jsonExpression(guard)})::text;`,
    ));

    expect(contributingSources(inputGuard("g", "g", observed))).toEqual([nutritionSource]);
    expect(contributingSources(inputGuard("ml", "ml", observed))).toEqual([nutritionSource]);
    expect(contributingSources(inputGuard("tbsp", "g", observed, { conversion: true })))
      .toEqual([measurementSource, nutritionSource]);
    expect(contributingSources(inputGuard("g", "g", optionalOnly))).toEqual([nutritionSource]);
    expect(contributingSources(inputGuard("g", "g", missingOnly))).toEqual([]);
    expect(contributingSources(inputGuard("개", "g", observed))).toEqual([]);
    expect(contributingSources(inputGuard(null, "g", observed, { ingredientType: "TO_TASTE" })))
      .toEqual([]);
  });

  it("rejects an approved source that did not contribute to this snapshot", () => {
    const recipeId = "20000000-0000-4000-8000-00000000000d";
    seedRecipe(recipeId, "unrelated source fixture");
    const forged = snapshot("d");
    forged.sources = [{
      provider: "MEASURE",
      dataset: "Recipe measurement fixture",
      source_version: "2026-07-02",
      data_basis_date: "2026-07-02",
      license: "test-only",
      source_url: "https://example.test/measurement",
    }];

    const result = psqlResult(writeSnapshotSql(recipeId, forged));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SNAPSHOT_SOURCE_MISMATCH");
    expect(psql(`select count(*) from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`))
      .toBe("0");
  });

  // Each malformed payload uses a fresh psql process so no failed transaction can mask the next case;
  // 15 seconds covers that process isolation while remaining far below the two-minute command budget.
  it("fails closed for extra source fields, unsafe URLs, vector drift, and status contradictions", () => {
    const recipeId = "20000000-0000-4000-8000-000000000002";
    seedRecipe(recipeId, "validator fixture");
    const extraSource = snapshot("c") as ReturnType<typeof snapshot> & { sources: Array<Record<string, unknown>> };
    extraSource.sources[0].raw_provider_row = "forbidden";
    const unsafeUrl = snapshot("d");
    unsafeUrl.sources[0].source_url = "https://example.test/nutrition?api_key=secret";
    const subscriptionUrl = snapshot("a");
    subscriptionUrl.sources[0].source_url =
      "https://example.test/nutrition?subscription-key=redacted-value";
    const percentEncodedUrl = snapshot("1");
    percentEncodedUrl.sources[0].source_url =
      "https://example.test/nutrition?%70%61%73%73%77%6f%72%64=redacted-value";
    const doubleEncodedUrl = snapshot("2");
    doubleEncodedUrl.sources[0].source_url =
      "https://example.test/nutrition?%2570%2561%2573%2573%2577%256f%2572%2564=redacted-value";
    const partialEncodedUrl = snapshot("3");
    partialEncodedUrl.sources[0].source_url =
      "https://example.test/nutrition?p%2561ssword=redacted-value";
    const vectorDrift = snapshot("e");
    vectorDrift.scalable_values.energy_kcal = 99;
    const contradiction = snapshot("f");
    contradiction.calculation_status = "unavailable";

    for (const [value, error] of [
      [extraSource, "UNSAFE_SNAPSHOT_SOURCE"],
      [unsafeUrl, "UNSAFE_SNAPSHOT_SOURCE"],
      [subscriptionUrl, "UNSAFE_SNAPSHOT_SOURCE"],
      [percentEncodedUrl, "UNSAFE_SNAPSHOT_SOURCE"],
      [doubleEncodedUrl, "UNSAFE_SNAPSHOT_SOURCE"],
      [partialEncodedUrl, "UNSAFE_SNAPSHOT_SOURCE"],
      [vectorDrift, "SNAPSHOT_VECTOR_SUM_MISMATCH"],
      [contradiction, "INVALID_SNAPSHOT_STATUS"],
    ] as const) {
      const result = psqlResult(writeSnapshotSql(recipeId, value));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(error);
    }
    expect(psql(`select count(*) from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`)).toBe("0");
  }, 15_000);

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

  it("rejects link revocation, a new eligible candidate, and recipe ingredient mutation after load", () => {
    const recipeId = "20000000-0000-4000-8000-00000000000b";
    seedRecipe(recipeId, "input guard race fixture");
    const staleVersion = psql(`select updated_at from public.recipes where id = '${recipeId}';`);
    const staleGuard = JSON.parse(psql(
      `select public.build_recipe_nutrition_input_guard('${recipeId}')::text;`,
    ));
    const expectStaleWrite = (mutationSql: string) => {
      const result = psqlResult(
        `begin; ${mutationSql} ${writeSnapshotSql(recipeId, snapshot("b"), staleVersion, staleGuard)}`,
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("RECIPE_NUTRITION_INPUT_STALE");
      expect(psql(`select count(*) from public.recipe_nutrition_snapshots where recipe_id = '${recipeId}';`)).toBe("0");
    };

    expectStaleWrite(`
      update public.ingredient_nutrition_profiles
      set review_status = 'revoked', is_active = false, is_primary = false,
        decision_reason = 'race fixture revocation', reviewed_at = now()
      where id = '${guardLinkId}';
    `);

    expectStaleWrite(`
      update public.ingredient_nutrition_profiles
      set review_status = 'approved', is_active = true, is_primary = true,
        decision_reason = 'new eligible race fixture', reviewed_by = '${actorId}', reviewed_at = now()
      where id = '${alternateLinkId}';
    `);

    expectStaleWrite(`
      update public.ingredient_conversion_assignments
      set review_status = 'approved', is_active = true,
        assignment_reason = 'new eligible assignment race fixture',
        reviewed_by = '${actorId}', reviewed_at = now()
      where id = '${pendingAssignmentId}';
    `);

    expectStaleWrite(`
      insert into public.nutrition_values (
        profile_id, nutrient_code, source_nutrient_code, source_unit, amount, value_status
      ) values ('${guardProfileId}', 'sugars_g', 'sugars_g', 'g', 3, 'observed');
    `);

    expectStaleWrite(
      `update public.recipe_ingredients set amount = 125 where recipe_id = '${recipeId}';`,
    );

    expect(psql(
      `select (public.build_recipe_nutrition_input_guard('${recipeId}') = ${jsonExpression(staleGuard)})::text;`,
    )).toBe("true");
  });

  it("holds the writer recipe lock through insert so a phantom ingredient waits and later guard reuse is stale", async () => {
    const recipeId = "20000000-0000-4000-8000-00000000000e";
    await expectWriterWinsSnapshotRace({
      recipeId,
      title: "phantom recipe ingredient race fixture",
      snapshotSeed: "e",
      mutationSql: `
        insert into public.ingredients (id, standard_name, category, default_unit)
        values (
          '60000000-0000-4000-8000-000000000002',
          'phantom recipe ingredient race canonical ingredient', 'test', 'g'
        );
        insert into public.recipe_ingredients (
          id, recipe_id, ingredient_id, amount, unit, ingredient_type, scalable, sort_order
        ) values (
          '68000000-0000-4000-8000-000000000001', '${recipeId}',
          '60000000-0000-4000-8000-000000000002', 25, 'g', 'QUANT', true, 1
        );
      `,
    });
    expect(psql(
      `select count(*) from public.recipe_ingredients where recipe_id = '${recipeId}';`,
    )).toBe("2");
  }, 15_000);

  it("makes a writer wait for a concurrent nutrition value insert and leaves zero snapshots", async () => {
    const recipeId = "20000000-0000-4000-8000-00000000000f";
    await expectMutationWinsSnapshotRace({
      recipeId,
      title: "nutrition value race fixture",
      barrierKey: 701607160002,
      snapshotSeed: "f",
      mutationSql: `
        insert into public.nutrition_values (
          profile_id, nutrient_code, source_nutrient_code, source_unit, amount, value_status
        ) values (
          '${guardProfileId}', 'sugars_g', 'sugars_g', 'g', 3, 'observed'
        );
      `,
    });
    expect(psql(`
      select count(*) from public.nutrition_values
      where profile_id = '${guardProfileId}' and nutrient_code = 'sugars_g';
    `)).toBe("1");
  }, 15_000);

  it("denies service-role TRUNCATE bypasses on every guarded input table", () => {
    expect(psql(`
      select bool_and(not has_table_privilege('service_role', relation, 'TRUNCATE'))::text
      from unnest(array[
        'public.recipe_ingredients',
        'public.nutrition_sources',
        'public.nutrition_source_items',
        'public.nutrition_profiles',
        'public.nutrition_values',
        'public.ingredient_nutrition_profiles',
        'public.measurement_conversion_profiles',
        'public.measurement_source_evidence',
        'public.ingredient_conversion_assignments',
        'public.piece_unit_weights'
      ]) relation;
    `)).toBe("true");
  });
});
