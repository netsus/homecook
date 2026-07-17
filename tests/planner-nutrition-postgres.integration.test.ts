import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  readPlannerNutritionSummary,
  type PlannerNutritionDbClient,
} from "@/lib/server/planner-nutrition-summary";
import type { PlannerNutritionValue } from "@/types/planner-nutrition";
import {
  bootstrapProductEntryPlannerUser,
  productEntryPsql,
  type ProductEntryPostgresConnection,
} from "@/tests/fixtures/prepared-food-planner-entry-postgres-harness";

const enabled = process.env.HOMECOOK_PLANNER_NUTRITION_PG_INTEGRATION === "1";
const connection: ProductEntryPostgresConnection = {
  host: process.env.HOMECOOK_PLANNER_NUTRITION_PGHOST ?? "",
  port: process.env.HOMECOOK_PLANNER_NUTRITION_PGPORT ?? "",
  database: process.env.HOMECOOK_PLANNER_NUTRITION_PGDATABASE ?? "",
};
const USER_A = "71000000-0000-4000-8000-000000000001";
const USER_B = "71000000-0000-4000-8000-000000000002";
const PLAN_DATE = "2026-07-17";
const FIXTURE_PREFIX = "planner-nutrition-case:";

const recipeFixtures = [
  { id: randomUUID(), snapshotId: randomUUID(), title: `${FIXTURE_PREFIX}direct` },
  { id: randomUUID(), snapshotId: randomUUID(), title: `${FIXTURE_PREFIX}estimated` },
  { id: randomUUID(), snapshotId: randomUUID(), title: `${FIXTURE_PREFIX}mixed` },
  { id: randomUUID(), snapshotId: null, title: `${FIXTURE_PREFIX}null-pin` },
  { id: randomUUID(), snapshotId: randomUUID(), title: `${FIXTURE_PREFIX}other-user` },
] as const;
let columnA = "";
let columnB = "";
let completeProduct: { id: string; nutrition_version_id: string };

function psql(sql: string) {
  const result = productEntryPsql(connection, sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function jsonSql(value: unknown) {
  const encoded = Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  return `convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb`;
}

function sqlText(value: string) {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return `convert_from(decode('${encoded}', 'base64'), 'UTF8')`;
}

function serviceSql(sql: string) {
  return `set role service_role; set request.jwt.claim.role = 'service_role'; ${sql}`;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

class MealRangeQuery implements PromiseLike<QueryResult<Record<string, unknown>>> {
  private userId = "";
  private startDate = "";
  private endDate = "";

  constructor(private readonly reads: { meals: number }) {}

  eq(column: string, value: string) {
    if (column !== "user_id") throw new Error(`unsupported meal equality: ${column}`);
    this.userId = value;
    return this;
  }
  gte(column: string, value: string) {
    if (column !== "plan_date") throw new Error(`unsupported meal lower bound: ${column}`);
    this.startDate = value;
    return this;
  }
  lte(column: string, value: string) {
    if (column !== "plan_date") throw new Error(`unsupported meal upper bound: ${column}`);
    this.endDate = value;
    return this;
  }
  order() { return this; }
  then<TResult1 = QueryResult<Record<string, unknown>>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Record<string, unknown>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.reads.meals += 1;
    const rows = parseJson<Record<string, unknown>[]>(psql(`
      select coalesce(json_agg(row_to_json(scoped) order by plan_date, column_id, id), '[]'::json)::text
      from (
        select id, plan_date::text as plan_date, column_id, planned_servings,
               recipe_nutrition_snapshot_id
        from public.meals
        where user_id = ${sqlText(this.userId)}::uuid
          and plan_date between ${sqlText(this.startDate)}::date and ${sqlText(this.endDate)}::date
      ) scoped;
    `));
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
  }
}

class SnapshotBatchQuery implements PromiseLike<QueryResult<Record<string, unknown>>> {
  private ids: string[] = [];

  constructor(private readonly reads: { snapshots: number }) {}

  in(column: string, values: string[]) {
    if (column !== "id") throw new Error(`unsupported snapshot batch: ${column}`);
    this.ids = values;
    return this;
  }
  then<TResult1 = QueryResult<Record<string, unknown>>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Record<string, unknown>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.reads.snapshots += 1;
    const ids = this.ids.map((id) => `${sqlText(id)}::uuid`).join(", ");
    const rows = parseJson<Record<string, unknown>[]>(psql(`
      select coalesce(json_agg(row_to_json(scoped) order by id), '[]'::json)::text
      from (
        select id, base_servings, scalable_values_json, fixed_values_json,
               nutrient_status_json, calculation_status, calculation_quality,
               reflected_ingredient_count, target_ingredient_count,
               warnings_json, sources_json, calculated_at::text as calculated_at
        from public.recipe_nutrition_snapshots
        where id = any(array[${ids}]::uuid[])
      ) scoped;
    `));
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
  }
}

function createPostgresReadClient() {
  const reads = { meals: 0, snapshots: 0, products: 0 };
  const client = {
    from(table: string) {
      if (table === "meals") {
        return { select: () => new MealRangeQuery(reads) };
      }
      if (table === "recipe_nutrition_snapshots") {
        return { select: () => new SnapshotBatchQuery(reads) };
      }
      throw new Error(`unexpected planner nutrition table: ${table}`);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name !== "list_product_planner_entries") throw new Error(`unexpected RPC: ${name}`);
      reads.products += 1;
      const data = parseJson<unknown[]>(psql(serviceSql(`
        select public.list_product_planner_entries(
          ${sqlText(String(args.p_user_id))}::uuid,
          ${sqlText(String(args.p_start_date))}::date,
          ${sqlText(String(args.p_end_date))}::date,
          null
        )::text;
      `)));
      return { data, error: null };
    },
  } as unknown as PlannerNutritionDbClient;
  return { client, reads };
}

function completeValues(amount: number): Record<string, PlannerNutritionValue> {
  return {
    energy_kcal: { amount, known_amount: null, status: "complete", display_mode: "total" },
    carbohydrate_g: { amount: amount / 5, known_amount: null, status: "complete", display_mode: "total" },
    protein_g: { amount: amount / 10, known_amount: null, status: "complete", display_mode: "total" },
    fat_g: { amount: amount / 20, known_amount: null, status: "complete", display_mode: "total" },
    sodium_mg: { amount: amount / 2, known_amount: null, status: "complete", display_mode: "total" },
  };
}

function insertSnapshot(options: {
  recipeId: string;
  snapshotId: string;
  baseServings: number;
  values: Record<string, unknown>;
  scalable: Record<string, number>;
  fixed: Record<string, number>;
  status: "complete" | "partial";
  quality: "direct" | "estimated" | "mixed";
  warnings: string[];
  sourceVersion: string;
  inputHashCharacter: string;
}) {
  const source = {
    provider: "MFDS",
    dataset: "planner nutrition isolated",
    source_version: options.sourceVersion,
    data_basis_date: null,
    license: "test-public",
    source_url: "https://example.test/official",
  };
  psql(`
    insert into public.recipe_nutrition_snapshots (
      id, recipe_id, base_servings, input_hash, calculation_version,
      scalable_values_json, fixed_values_json, nutrient_status_json,
      calculation_status, calculation_quality, reflected_ingredient_count,
      target_ingredient_count, missing_reasons, warnings_json, sources_json,
      is_current, calculated_at
    ) values (
      '${options.snapshotId}', '${options.recipeId}', ${options.baseServings},
      '${options.inputHashCharacter.repeat(64)}', 'planner-isolated-v1',
      ${jsonSql(options.scalable)}, ${jsonSql(options.fixed)}, ${jsonSql(options.values)},
      '${options.status}', '${options.quality}', 1, 1, '{}',
      ${jsonSql(options.warnings)}, ${jsonSql([source])}, true, now()
    );
  `);
}

function createManualProduct(
  userId: string,
  name: string,
  values: Record<string, number | null>,
) {
  return parseJson<{ id: string; nutrition_version_id: string }>(psql(serviceSql(`
    select public.create_manual_food_product(
      '${userId}', ${sqlText(name)}, null,
      ${jsonSql({ basis: { amount: 1, unit: "serving" }, values })}
    )::text;
  `)));
}

function createProductEntry(
  userId: string,
  columnId: string,
  product: { id: string; nutrition_version_id: string },
  quantity = 1,
) {
  return parseJson<Record<string, unknown>>(psql(serviceSql(`
    select public.create_product_planner_entry(
      '${userId}', '${product.id}', '${PLAN_DATE}', '${columnId}',
      ${quantity}, 'serving', '${product.nutrition_version_id}'
    )::text;
  `)));
}

function createUnavailableProduct(userId: string, columnId: string) {
  const profileId = randomUUID();
  const productId = randomUUID();
  const versionId = randomUUID();
  const entryId = randomUUID();
  psql(`
    alter table public.food_products disable trigger validate_food_product_current_version;
    begin;
    set constraints all deferred;
    insert into public.nutrition_profiles (
      id, source_item_id, profile_kind, normalization_method, basis_amount,
      basis_unit, version, review_status, is_active, created_by
    ) values (
      '${profileId}', null, 'product_label', 'as_labeled', 1,
      'serving', 1, 'self_reported', true, '${userId}'
    );
    insert into public.food_products (
      id, owner_user_id, visibility, source_type, name, brand,
      current_nutrition_version_id
    ) values (
      '${productId}', '${userId}', 'private', 'manual',
      '${FIXTURE_PREFIX}unavailable-product', null, '${versionId}'
    );
    insert into public.food_product_nutrition_versions (
      id, product_id, nutrition_profile_id, version, basis_relations_json, created_by
    ) values ('${versionId}', '${productId}', '${profileId}', 1, '[]', '${userId}');
    insert into public.product_planner_entries (
      id, user_id, plan_date, column_id, product_id, product_nutrition_version_id,
      quantity_amount, quantity_unit, product_name_snapshot, product_brand_snapshot
    ) values (
      '${entryId}', '${userId}', '${PLAN_DATE}', '${columnId}', '${productId}',
      '${versionId}', 1, 'serving', '${FIXTURE_PREFIX}unavailable-product', null
    );
    commit;
    alter table public.food_products enable trigger validate_food_product_current_version;
  `);
}

function targetStateHash() {
  return psql(`
    select md5(jsonb_build_object(
      'users', (select coalesce(jsonb_agg(to_jsonb(row_value) order by id), '[]') from
        (select * from public.users where id in ('${USER_A}', '${USER_B}')) row_value),
      'columns', (select coalesce(jsonb_agg(to_jsonb(row_value) order by id), '[]') from
        (select * from public.meal_plan_columns where user_id in ('${USER_A}', '${USER_B}')) row_value),
      'meals', (select coalesce(jsonb_agg(to_jsonb(row_value) order by id), '[]') from
        (select * from public.meals where user_id in ('${USER_A}', '${USER_B}')) row_value),
      'entries', (select coalesce(jsonb_agg(to_jsonb(row_value) order by id), '[]') from
        (select * from public.product_planner_entries where user_id in ('${USER_A}', '${USER_B}')) row_value),
      'snapshots', (select coalesce(jsonb_agg(to_jsonb(row_value) order by id), '[]') from
        (select * from public.recipe_nutrition_snapshots where recipe_id in
          (select id from public.recipes where title like '${FIXTURE_PREFIX}%')) row_value),
      'products', (select coalesce(jsonb_agg(to_jsonb(row_value) order by id), '[]') from
        (select * from public.food_products where name like '${FIXTURE_PREFIX}%') row_value),
      'versions', (select coalesce(jsonb_agg(to_jsonb(row_value) order by id), '[]') from
        (select version.* from public.food_product_nutrition_versions version
          join public.food_products product on product.id = version.product_id
          where product.name like '${FIXTURE_PREFIX}%') row_value)
    )::text);
  `);
}

describe.runIf(enabled)("planner nutrition isolated PostgreSQL 17 integration", () => {
  beforeAll(async () => {
    psql(`
      insert into public.users (id, nickname, social_provider, social_id) values
        ('${USER_A}', 'planner-nutrition-a', 'google', 'planner-nutrition-a'),
        ('${USER_B}', 'planner-nutrition-b', 'google', 'planner-nutrition-b');
    `);
    await bootstrapProductEntryPlannerUser(connection, USER_A);
    await bootstrapProductEntryPlannerUser(connection, USER_B);
    columnA = psql(`select id from public.meal_plan_columns where user_id = '${USER_A}' order by sort_order limit 1;`);
    columnB = psql(`select id from public.meal_plan_columns where user_id = '${USER_B}' order by sort_order limit 1;`);

    psql(`
      insert into public.recipes (id, title, source_type, base_servings) values
        ${recipeFixtures.map((recipe, index) =>
          `('${recipe.id}', '${recipe.title}', 'manual', ${index === 0 ? 2 : 1})`
        ).join(",\n")};
    `);
    insertSnapshot({
      recipeId: recipeFixtures[0].id,
      snapshotId: recipeFixtures[0].snapshotId!,
      baseServings: 2,
      values: completeValues(100),
      scalable: { energy_kcal: 80, carbohydrate_g: 16, protein_g: 8, fat_g: 4, sodium_mg: 40 },
      fixed: { energy_kcal: 20, carbohydrate_g: 4, protein_g: 2, fat_g: 1, sodium_mg: 10 },
      status: "complete",
      quality: "direct",
      warnings: [],
      sourceVersion: "v1",
      inputHashCharacter: "a",
    });
    const estimatedValues = completeValues(60);
    estimatedValues.energy_kcal = {
      amount: null,
      known_amount: 60,
      status: "partial",
      display_mode: "minimum",
    };
    insertSnapshot({
      recipeId: recipeFixtures[1].id,
      snapshotId: recipeFixtures[1].snapshotId!,
      baseServings: 1,
      values: estimatedValues,
      scalable: { energy_kcal: 50, carbohydrate_g: 10, protein_g: 5, fat_g: 2.5, sodium_mg: 25 },
      fixed: { energy_kcal: 10, carbohydrate_g: 2, protein_g: 1, fat_g: 0.5, sodium_mg: 5 },
      status: "partial",
      quality: "estimated",
      warnings: ["REPRESENTATIVE_VOLUME_CONVERSION_USED"],
      sourceVersion: "v1",
      inputHashCharacter: "b",
    });
    insertSnapshot({
      recipeId: recipeFixtures[2].id,
      snapshotId: recipeFixtures[2].snapshotId!,
      baseServings: 1,
      values: completeValues(50),
      scalable: { energy_kcal: 40, carbohydrate_g: 8, protein_g: 4, fat_g: 2, sodium_mg: 20 },
      fixed: { energy_kcal: 10, carbohydrate_g: 2, protein_g: 1, fat_g: 0.5, sodium_mg: 5 },
      status: "complete",
      quality: "mixed",
      warnings: ["PIECE_WEIGHT_CONVERSION_USED"],
      sourceVersion: "v2",
      inputHashCharacter: "c",
    });
    insertSnapshot({
      recipeId: recipeFixtures[4].id,
      snapshotId: recipeFixtures[4].snapshotId!,
      baseServings: 1,
      values: completeValues(999),
      scalable: { energy_kcal: 999, carbohydrate_g: 199.8, protein_g: 99.9, fat_g: 49.95, sodium_mg: 499.5 },
      fixed: { energy_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0, sodium_mg: 0 },
      status: "complete",
      quality: "direct",
      warnings: [],
      sourceVersion: "other-user-secret-source",
      inputHashCharacter: "d",
    });
    psql(`
      insert into public.meals (
        user_id, recipe_id, plan_date, column_id, planned_servings
      ) values
        ('${USER_A}', '${recipeFixtures[0].id}', '${PLAN_DATE}', '${columnA}', 4),
        ('${USER_A}', '${recipeFixtures[1].id}', '${PLAN_DATE}', '${columnA}', 1),
        ('${USER_A}', '${recipeFixtures[2].id}', '${PLAN_DATE}', '${columnA}', 1),
        ('${USER_A}', '${recipeFixtures[3].id}', '${PLAN_DATE}', '${columnA}', 1),
        ('${USER_B}', '${recipeFixtures[4].id}', '${PLAN_DATE}', '${columnB}', 1);
    `);

    completeProduct = createManualProduct(USER_A, `${FIXTURE_PREFIX}complete-product`, {
      energy_kcal: 200,
      carbohydrate_g: 40,
      protein_g: 20,
      fat_g: 10,
      sodium_mg: 100,
    });
    const partialProduct = createManualProduct(USER_A, `${FIXTURE_PREFIX}partial-product`, {
      energy_kcal: 80,
    });
    const otherProduct = createManualProduct(USER_B, `${FIXTURE_PREFIX}other-user-product`, {
      energy_kcal: 777,
      carbohydrate_g: 1,
      protein_g: 1,
      fat_g: 1,
      sodium_mg: 1,
    });
    createProductEntry(USER_A, columnA, completeProduct, 2);
    createProductEntry(USER_A, columnA, partialProduct);
    createUnavailableProduct(USER_A, columnA);
    createProductEntry(USER_B, columnB, otherProduct);
  });

  afterAll(() => {
    psql(`
      alter table public.recipe_nutrition_snapshots disable trigger protect_recipe_nutrition_snapshot;
      alter table public.food_product_nutrition_versions disable trigger protect_food_product_nutrition_version;
      alter table public.nutrition_values disable trigger protect_nutrition_values;
      alter table public.nutrition_profiles disable trigger protect_nutrition_profiles;
      begin;
      set constraints all deferred;
      create temporary table cleanup_products on commit drop as
        select id from public.food_products where name like '${FIXTURE_PREFIX}%';
      create temporary table cleanup_profiles on commit drop as
        select nutrition_profile_id as id from public.food_product_nutrition_versions
        where product_id in (select id from cleanup_products);
      delete from public.product_planner_entries where user_id in ('${USER_A}', '${USER_B}');
      delete from public.meals where user_id in ('${USER_A}', '${USER_B}');
      delete from public.recipe_nutrition_snapshots where recipe_id in
        (select id from public.recipes where title like '${FIXTURE_PREFIX}%');
      delete from public.recipes where title like '${FIXTURE_PREFIX}%';
      delete from public.food_product_nutrition_versions where product_id in (select id from cleanup_products);
      delete from public.food_products where id in (select id from cleanup_products);
      delete from public.nutrition_values where profile_id in (select id from cleanup_profiles);
      delete from public.nutrition_profiles where id in (select id from cleanup_profiles);
      delete from public.recipe_books where user_id in ('${USER_A}', '${USER_B}');
      delete from public.meal_plan_columns where user_id in ('${USER_A}', '${USER_B}');
      delete from public.users where id in ('${USER_A}', '${USER_B}');
      commit;
      alter table public.recipe_nutrition_snapshots enable trigger protect_recipe_nutrition_snapshot;
      alter table public.food_product_nutrition_versions enable trigger protect_food_product_nutrition_version;
      alter table public.nutrition_values enable trigger protect_nutrition_values;
      alter table public.nutrition_profiles enable trigger protect_nutrition_profiles;
    `);
    expect(psql(`
      select count(*) from public.users where id in ('${USER_A}', '${USER_B}');
    `)).toBe("0");
  });

  it("runs only on the isolated PostgreSQL 17 non-default-port target", () => {
    expect(process.env.HOMECOOK_PLANNER_NUTRITION_PG_VERSION).toMatch(/^17\./);
    expect(connection.host).toBe("127.0.0.1");
    expect(connection.port).not.toBe("");
    expect(connection.port).not.toBe("5432");
    expect(connection.database).toMatch(/^homecook_planner_nutrition_test$/);
    expect(psql("show server_version;")).toMatch(/^17\./);
  });

  it("bootstraps before measurement and reads old pins with bounded zero-write owner scope", async () => {
    const columnsBefore = psql(`select count(*) from public.meal_plan_columns where user_id = '${USER_A}';`);
    await bootstrapProductEntryPlannerUser(connection, USER_A);
    expect(parseJson<string[]>(psql(`
      select json_agg(name order by sort_order)::text
      from public.meal_plan_columns where user_id = '${USER_A}';
    `))).toEqual(["아침", "점심", "저녁"]);
    expect(psql(`select count(*) from public.meal_plan_columns where user_id = '${USER_A}';`)).toBe(columnsBefore);

    const before = targetStateHash();
    const { client, reads } = createPostgresReadClient();
    const result = await readPlannerNutritionSummary(client, USER_A, {
      startDate: PLAN_DATE,
      endDate: PLAN_DATE,
    });
    const after = targetStateHash();

    expect(after).toBe(before);
    expect(reads).toEqual({ meals: 1, snapshots: 1, products: 1 });
    expect(result.summary.recipe_entry_count).toBe(4);
    expect(result.summary.product_entry_count).toBe(3);
    expect(result.summary.nutrition.values.energy_kcal).toEqual({
      amount: null,
      known_amount: 770,
      status: "partial",
      display_mode: "minimum",
    });
    expect(result.summary.nutrition.incomplete_entry_count).toBe(4);
    expect(result.summary.nutrition.calculation_quality).toBe("mixed");
    expect(result.summary.nutrition.sources.map((source) => [
      source.provider,
      source.source_version,
    ])).toEqual([
      ["MFDS", "v1"],
      ["MFDS", "v2"],
      ["user_label", null],
    ]);
    expect(JSON.stringify(result)).not.toContain(USER_B);
    expect(JSON.stringify(result)).not.toContain("other-user-secret-source");
    expect(JSON.stringify(result)).not.toContain("777");

    const updated = parseJson<{ nutrition_version_id: string }>(psql(serviceSql(`
      select public.update_manual_food_product(
        '${USER_A}', '${completeProduct.id}',
        ${jsonSql({
          nutrition: {
            basis: { amount: 1, unit: "serving" },
            values: {
              energy_kcal: 999,
              carbohydrate_g: 999,
              protein_g: 999,
              fat_g: 999,
              sodium_mg: 999,
            },
          },
        })},
        '${completeProduct.nutrition_version_id}'
      )::text;
    `)));
    expect(updated.nutrition_version_id).not.toBe(completeProduct.nutrition_version_id);
    psql(serviceSql(`select public.delete_manual_food_product('${USER_A}', '${completeProduct.id}');`));

    const switchedBefore = targetStateHash();
    const switchedClient = createPostgresReadClient();
    const switched = await readPlannerNutritionSummary(switchedClient.client, USER_A, {
      startDate: PLAN_DATE,
      endDate: PLAN_DATE,
    });
    expect(targetStateHash()).toBe(switchedBefore);
    expect(switchedClient.reads).toEqual({ meals: 1, snapshots: 1, products: 1 });
    expect(switched.summary.nutrition.values.energy_kcal).toEqual(
      result.summary.nutrition.values.energy_kcal,
    );
  });
});
