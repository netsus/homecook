import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  bootstrapProductEntryPlannerUser,
  productEntryPsql,
  productEntryPsqlAsync,
  type ProductEntryPostgresConnection,
} from "@/tests/fixtures/prepared-food-planner-entry-postgres-harness";

const enabled = process.env.HOMECOOK_PRODUCT_ENTRY_PG_INTEGRATION === "1";
const connection: ProductEntryPostgresConnection = {
  host: process.env.HOMECOOK_PRODUCT_ENTRY_PGHOST ?? "",
  port: process.env.HOMECOOK_PRODUCT_ENTRY_PGPORT ?? "",
  database: process.env.HOMECOOK_PRODUCT_ENTRY_PGDATABASE ?? "",
};
const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "10000000-0000-4000-8000-000000000002";
let columnA = "";
let privateProduct: { id: string; nutrition_version_id: string };
let privateEntry: Record<string, unknown>;

function psql(sql: string) {
  const result = productEntryPsql(connection, sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function jsonSql(value: unknown) {
  const encoded = Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  return `convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb`;
}

function serviceSql(sql: string) {
  return `set role service_role; set request.jwt.claim.role = 'service_role'; ${sql}`;
}

function authenticatedSql(userId: string, sql: string) {
  return `set role authenticated; set request.jwt.claim.sub = '${userId}'; set request.jwt.claim.role = 'authenticated'; ${sql}`;
}

function seedPublicProduct(externalKey: string, relations: unknown[]) {
  const ids = {
    source: randomUUID(),
    item: randomUUID(),
    profile: randomUUID(),
    product: randomUUID(),
    version: randomUUID(),
    externalKey,
  };
  psql(`
    begin;
    set constraints all deferred;
    insert into public.nutrition_sources (
      id, provider_code, dataset_name, source_kind, source_version,
      fetched_at, freshness_checked_at, freshness_status, priority_rank,
      source_url, license_name, manifest_sha256, review_status,
      decision_reason, reviewed_by, reviewed_at, is_active
    ) values (
      '${ids.source}', 'MFDS', 'isolated-${externalKey}', 'nutrition_dataset', '2026-07-16',
      now(), now(), 'current', 1, 'https://example.test/official', 'test-only',
      '${ids.source}', 'approved', 'isolated test fixture only', '${USER_A}', now(), true
    );
    insert into public.nutrition_source_items (
      id, source_id, external_item_key, external_name, source_basis_text,
      source_basis_amount, source_basis_unit, stable_fingerprint, review_status,
      decision_reason, reviewed_by, reviewed_at, provenance_json
    ) values (
      '${ids.item}', '${ids.source}', '${externalKey}', '관계 제품', '100 g',
      100, 'g', '${ids.item}', 'approved', 'isolated test fixture only',
      '${USER_A}', now(), '{}'::jsonb
    );
    insert into public.nutrition_profiles (
      id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
      version, review_status, decision_reason, reviewed_by, reviewed_at, is_active
    ) values (
      '${ids.profile}', '${ids.item}', 'product_label', 'as_labeled', 100, 'g',
      1, 'approved', 'isolated test fixture only', '${USER_A}', now(), true
    );
    insert into public.nutrition_values (
      profile_id, nutrient_code, source_nutrient_code, source_unit,
      amount, value_status, source_token
    ) values
      ('${ids.profile}', 'energy_kcal', 'energy_kcal', 'kcal', 70, 'observed', '70'),
      ('${ids.profile}', 'carbohydrate_g', 'carbohydrate_g', 'g', 5, 'observed', '5'),
      ('${ids.profile}', 'protein_g', 'protein_g', 'g', 4, 'observed', '4'),
      ('${ids.profile}', 'fat_g', 'fat_g', 'g', 3, 'observed', '3'),
      ('${ids.profile}', 'sodium_mg', 'sodium_mg', 'mg', 55, 'observed', '55');
    insert into public.food_products (
      id, owner_user_id, visibility, source_type, name, brand,
      external_product_key, current_nutrition_version_id
    ) values (
      '${ids.product}', null, 'public', 'public_dataset', '관계 제품', '공개 브랜드',
      '${externalKey}', '${ids.version}'
    );
    insert into public.food_product_nutrition_versions (
      id, product_id, nutrition_profile_id, version, basis_relations_json, source_item_id
    ) values (
      '${ids.version}', '${ids.product}', '${ids.profile}', 1, ${jsonSql(relations)}, '${ids.item}'
    );
    commit;
  `);
  return ids;
}

function appendPublicVersion(
  product: ReturnType<typeof seedPublicProduct>,
  relations: unknown[],
) {
  const source = randomUUID();
  const item = randomUUID();
  const profile = randomUUID();
  const version = randomUUID();
  psql(`
    begin;
    set constraints all deferred;
    insert into public.nutrition_sources (
      id, provider_code, dataset_name, source_kind, source_version,
      fetched_at, freshness_checked_at, freshness_status, priority_rank,
      source_url, license_name, manifest_sha256, review_status,
      decision_reason, reviewed_by, reviewed_at, is_active
    ) values (
      '${source}', 'MFDS', 'isolated-${product.externalKey}-v2', 'nutrition_dataset', '2026-07-17',
      now(), now(), 'current', 1, 'https://example.test/official-v2', 'test-only',
      '${source}', 'approved', 'isolated test fixture only', '${USER_A}', now(), true
    );
    insert into public.nutrition_source_items (
      id, source_id, external_item_key, external_name, source_basis_text,
      source_basis_amount, source_basis_unit, stable_fingerprint, review_status,
      decision_reason, reviewed_by, reviewed_at, provenance_json
    ) values (
      '${item}', '${source}', '${product.externalKey}', '새 관계 제품', '100 g',
      100, 'g', '${item}', 'approved', 'isolated test fixture only',
      '${USER_A}', now(), '{}'::jsonb
    );
    insert into public.nutrition_profiles (
      id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
      version, review_status, decision_reason, reviewed_by, reviewed_at, is_active
    ) values (
      '${profile}', '${item}', 'product_label', 'as_labeled', 100, 'g',
      1, 'approved', 'isolated test fixture only', '${USER_A}', now(), true
    );
    insert into public.nutrition_values (
      profile_id, nutrient_code, source_nutrient_code, source_unit,
      amount, value_status, source_token
    ) values
      ('${profile}', 'energy_kcal', 'energy_kcal', 'kcal', 90, 'observed', '90'),
      ('${profile}', 'carbohydrate_g', 'carbohydrate_g', 'g', 6, 'observed', '6'),
      ('${profile}', 'protein_g', 'protein_g', 'g', 5, 'observed', '5'),
      ('${profile}', 'fat_g', 'fat_g', 'g', 4, 'observed', '4'),
      ('${profile}', 'sodium_mg', 'sodium_mg', 'mg', 65, 'observed', '65');
    insert into public.food_product_nutrition_versions (
      id, product_id, nutrition_profile_id, version, basis_relations_json, source_item_id
    ) values ('${version}', '${product.product}', '${profile}', 2, ${jsonSql(relations)}, '${item}');
    update public.food_products
    set name = '새 이름 관계 제품', brand = '새 브랜드',
        current_nutrition_version_id = '${version}', updated_at = now()
    where id = '${product.product}';
    commit;
  `);
  return version;
}

describe.runIf(enabled)("prepared food planner entry isolated PostgreSQL integration", () => {
  beforeAll(async () => {
    psql(`
      insert into public.users (id, nickname, social_provider, social_id) values
        ('${USER_A}', 'entry-a', 'google', 'entry-a'),
        ('${USER_B}', 'entry-b', 'google', 'entry-b');
    `);
    await bootstrapProductEntryPlannerUser(connection, USER_A);
    await bootstrapProductEntryPlannerUser(connection, USER_B);
    columnA = psql(`
      select id from public.meal_plan_columns
      where user_id = '${USER_A}' order by sort_order limit 1;
    `);
    privateProduct = JSON.parse(psql(serviceSql(`
      select public.create_manual_food_product(
        '${USER_A}', '고정 이름 요거트', '고정 브랜드',
        ${jsonSql({
          basis: { amount: 1, unit: "serving" },
          values: { energy_kcal: 120, sodium_mg: null },
        })}
      )::text;
    `)));
    privateEntry = JSON.parse(psql(serviceSql(`
      select public.create_product_planner_entry(
        '${USER_A}', '${privateProduct.id}', '2026-07-16', '${columnA}',
        1, 'serving', '${privateProduct.nutrition_version_id}'
      )::text;
    `)));
  });

  it("applies the official schema on an isolated non-default port", () => {
    expect(connection.host).toBe("127.0.0.1");
    expect(connection.port).not.toBe("");
    expect(connection.port).not.toBe("5432");
    expect(connection.database).toMatch(/^homecook_[a-z0-9_]+$/);

    const result = productEntryPsql(connection, `
      select format_type(attribute.atttypid, attribute.atttypmod)
      from pg_attribute attribute
      where attribute.attrelid = 'public.product_planner_entries'::regclass
        and attribute.attname = 'quantity_amount';
    `);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("numeric(12,4)");
  });

  it("creates the production defaults idempotently through the actual bootstrap adapter", async () => {
    const booksBefore = psql(`select count(*) from public.recipe_books where user_id = '${USER_A}';`);
    const columnsBefore = psql(`select count(*) from public.meal_plan_columns where user_id = '${USER_A}';`);
    await bootstrapProductEntryPlannerUser(connection, USER_A);

    const columns = JSON.parse(psql(`
      select json_agg(name order by sort_order)::text
      from public.meal_plan_columns where user_id = '${USER_A}';
    `));
    expect(columns).toEqual(["아침", "점심", "저녁"]);
    expect(psql(`select count(*) from public.recipe_books where user_id = '${USER_A}';`)).toBe(booksBefore);
    expect(psql(`select count(*) from public.meal_plan_columns where user_id = '${USER_A}';`)).toBe(columnsBefore);
    expect(psql(`
      select settings_json ->> 'user_bootstrap_version'
      from public.users where id = '${USER_A}';
    `)).toBe("3");
  });

  it("atomically creates and lists a pinned private product entry without false zero values", () => {
    expect(privateEntry).toMatchObject({
      entry_type: "product",
      product_id: privateProduct.id,
      product_name: "고정 이름 요거트",
      product_brand: "고정 브랜드",
      plan_date: "2026-07-16",
      column_id: columnA,
      workflow_status: null,
      product_nutrition_version_id: privateProduct.nutrition_version_id,
      quantity: { amount: 1, unit: "serving" },
    });
    const nutrition = privateEntry.nutrition as {
      values: Record<string, { amount: number | null; status: string }>;
    };
    expect(nutrition.values.energy_kcal.amount).toBe(120);
    expect(nutrition.values.sodium_mg).toEqual(expect.objectContaining({
      amount: null,
      status: "unavailable",
    }));

    const listed = JSON.parse(psql(serviceSql(`
      select public.list_product_planner_entries(
        '${USER_A}', '2026-07-14', '2026-07-20', null
      )::text;
    `)));
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(privateEntry.id);
  });

  it("rejects p_user_id spoofing and anonymous RPC execution at the real database boundary", () => {
    const spoofed = productEntryPsql(connection, authenticatedSql(USER_B, `
      set request.jwt.claim.role = 'service_role';
      select public.list_product_planner_entries(
        '${USER_A}', '2026-07-14', '2026-07-20', null
      );
    `));
    expect(spoofed.status).not.toBe(0);
    expect(spoofed.stderr).toContain("FORBIDDEN");

    const anonymous = productEntryPsql(connection, `
      set role anon;
      select public.list_product_planner_entries(
        '${USER_A}', '2026-07-14', '2026-07-20', null
      );
    `);
    expect(anonymous.status).not.toBe(0);
    expect(anonymous.stderr).toMatch(/permission denied/i);
  });

  it("enforces owner RLS, protected pin grants, precision and pinned basis on direct writes", () => {
    expect(psql(authenticatedSql(USER_A, `
      select count(*) from public.product_planner_entries;
    `))).toBe("1");
    expect(psql(authenticatedSql(USER_B, `
      select count(*) from public.product_planner_entries;
    `))).toBe("0");

    const crossOwnerUpdate = psql(authenticatedSql(USER_B, `
      update public.product_planner_entries
      set quantity_amount = 2
      where id = '${privateEntry.id}';
      select quantity_amount from public.product_planner_entries where id = '${privateEntry.id}';
    `));
    expect(crossOwnerUpdate).toBe("UPDATE 0");
    expect(psql(`select quantity_amount from public.product_planner_entries where id = '${privateEntry.id}';`)).toBe("1.0000");

    const forgedPin = productEntryPsql(connection, authenticatedSql(USER_A, `
      update public.product_planner_entries
      set product_name_snapshot = '위조 이름'
      where id = '${privateEntry.id}';
    `));
    expect(forgedPin.status).not.toBe(0);
    expect(forgedPin.stderr).toMatch(/permission denied/i);

    const roundedToZero = productEntryPsql(connection, authenticatedSql(USER_A, `
      update public.product_planner_entries
      set quantity_amount = 0.00001
      where id = '${privateEntry.id}';
    `));
    expect(roundedToZero.status).not.toBe(0);
    expect(roundedToZero.stderr).toMatch(/VALIDATION_ERROR|check constraint/i);

    const inferredUnit = productEntryPsql(connection, authenticatedSql(USER_A, `
      update public.product_planner_entries
      set quantity_amount = 100, quantity_unit = 'g'
      where id = '${privateEntry.id}';
    `));
    expect(inferredUnit.status).not.toBe(0);
    expect(inferredUnit.stderr).toContain("NUTRITION_BASIS_MISMATCH");
  });

  it("rolls a scoped probe back and leaves zero residual entry rows", () => {
    const probeDate = "2026-07-30";
    psql(serviceSql(`
      begin;
      select public.create_product_planner_entry(
        '${USER_A}', '${privateProduct.id}', '${probeDate}', '${columnA}',
        1, 'serving', '${privateProduct.nutrition_version_id}'
      );
      rollback;
    `));
    expect(psql(`
      select count(*) from public.product_planner_entries
      where user_id = '${USER_A}' and plan_date = '${probeDate}';
    `)).toBe("0");
  });

  it("allows one direct pinned relation and rejects multiple or chained candidates", () => {
    const direct = seedPublicProduct("planner-direct", [
      { from: { amount: 1, unit: "serving" }, to: { amount: 100, unit: "g" } },
    ]);
    const directEntry = JSON.parse(psql(serviceSql(`
      select public.create_product_planner_entry(
        '${USER_A}', '${direct.product}', '2026-07-21', '${columnA}',
        2, 'serving', '${direct.version}'
      )::text;
    `)));
    expect(directEntry.nutrition.values.energy_kcal.amount).toBe(140);

    const failures = [
      seedPublicProduct("planner-multiple", [
        { from: { amount: 1, unit: "serving" }, to: { amount: 100, unit: "g" } },
        { from: { amount: 1, unit: "serving" }, to: { amount: 120, unit: "g" } },
      ]),
      seedPublicProduct("planner-chained", [
        { from: { amount: 1, unit: "package" }, to: { amount: 1, unit: "serving" } },
        { from: { amount: 1, unit: "serving" }, to: { amount: 100, unit: "g" } },
      ]),
    ];
    for (const [index, product] of failures.entries()) {
      const result = productEntryPsql(connection, serviceSql(`
        select public.create_product_planner_entry(
          '${USER_A}', '${product.product}', '2026-07-${22 + index}', '${columnA}',
          1, '${index === 0 ? "serving" : "package"}', '${product.version}'
        );
      `));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("NUTRITION_BASIS_MISMATCH");
      expect(psql(`
        select count(*) from public.product_planner_entries
        where product_id = '${product.product}';
      `)).toBe("0");
    }
  });

  it("keeps the old relation and snapshots after current metadata/version change and product deletion", () => {
    const product = seedPublicProduct("planner-old-pin", [
      { from: { amount: 1, unit: "serving" }, to: { amount: 100, unit: "g" } },
    ]);
    const oldEntry = JSON.parse(psql(serviceSql(`
      select public.create_product_planner_entry(
        '${USER_A}', '${product.product}', '2026-07-24', '${columnA}',
        1, 'serving', '${product.version}'
      )::text;
    `)));
    const nextVersion = appendPublicVersion(product, []);

    const patched = JSON.parse(psql(serviceSql(`
      select public.update_product_planner_entry_quantity(
        '${USER_A}', '${oldEntry.id}', 2, 'serving'
      )::text;
    `)));
    expect(patched.product_nutrition_version_id).toBe(product.version);
    expect(patched.product_name).toBe("관계 제품");
    expect(patched.product_brand).toBe("공개 브랜드");
    expect(patched.nutrition.values.energy_kcal.amount).toBe(140);

    const currentSubstitute = productEntryPsql(connection, serviceSql(`
      select public.create_product_planner_entry(
        '${USER_A}', '${product.product}', '2026-07-25', '${columnA}',
        1, 'serving', '${nextVersion}'
      );
    `));
    expect(currentSubstitute.status).not.toBe(0);
    expect(currentSubstitute.stderr).toContain("NUTRITION_BASIS_MISMATCH");

    psql(`update public.food_products set deleted_at = now() where id = '${product.product}';`);
    const afterDelete = JSON.parse(psql(serviceSql(`
      select public.update_product_planner_entry_quantity(
        '${USER_A}', '${oldEntry.id}', 1, 'serving'
      )::text;
    `)));
    expect(afterDelete.product_nutrition_version_id).toBe(product.version);
    expect(afterDelete.nutrition.values.energy_kcal.amount).toBe(70);

    const deletedCreate = productEntryPsql(connection, serviceSql(`
      select public.create_product_planner_entry(
        '${USER_A}', '${product.product}', '2026-07-26', '${columnA}',
        100, 'g', '${nextVersion}'
      );
    `));
    expect(deletedCreate.status).not.toBe(0);
    expect(deletedCreate.stderr).toContain("PRODUCT_DELETED");

    const deleted = JSON.parse(psql(serviceSql(`
      select public.delete_product_planner_entry('${USER_A}', '${oldEntry.id}')::text;
    `)));
    expect(deleted).toEqual({ deleted: true, entry_id: oldEntry.id });
    const replay = productEntryPsql(connection, serviceSql(`
      select public.delete_product_planner_entry('${USER_A}', '${oldEntry.id}');
    `));
    expect(replay.status).not.toBe(0);
    expect(replay.stderr).toContain("RESOURCE_NOT_FOUND");
  });

  it("blocks column deletion for either Recipe Meal or ProductPlannerEntry and deletes an empty column", () => {
    const productBlocked = productEntryPsql(connection, serviceSql(`
      select public.delete_owned_planner_column('${USER_A}', '${columnA}');
    `));
    expect(productBlocked.status).not.toBe(0);
    expect(productBlocked.stderr).toContain("COLUMN_HAS_MEALS");

    const columnIds = psql(`
      select string_agg(id::text, ',' order by sort_order)
      from public.meal_plan_columns where user_id = '${USER_A}';
    `).split(",");
    const mealColumn = columnIds[1]!;
    const emptyColumn = columnIds[2]!;
    const recipeId = randomUUID();
    psql(`
      insert into public.recipes (id, title, source_type)
      values ('${recipeId}', '컬럼 보호 레시피', 'manual');
      insert into public.meals (
        user_id, recipe_id, plan_date, column_id, planned_servings,
        is_leftover, leftover_dish_id
      ) values ('${USER_A}', '${recipeId}', '2026-07-16', '${mealColumn}', 1, false, null);
    `);
    const mealBlocked = productEntryPsql(connection, serviceSql(`
      select public.delete_owned_planner_column('${USER_A}', '${mealColumn}');
    `));
    expect(mealBlocked.status).not.toBe(0);
    expect(mealBlocked.stderr).toContain("COLUMN_HAS_MEALS");

    const deleted = JSON.parse(psql(serviceSql(`
      select public.delete_owned_planner_column('${USER_A}', '${emptyColumn}')::text;
    `)));
    expect(deleted).toEqual({ deleted: true });
    expect(JSON.parse(psql(`
      select json_agg(sort_order order by sort_order)::text
      from public.meal_plan_columns where user_id = '${USER_A}';
    `))).toEqual([0, 1]);
  });

  it("serializes a current-version race and leaves zero partial entry rows", async () => {
    const product = JSON.parse(psql(serviceSql(`
      select public.create_manual_food_product(
        '${USER_A}', 'current race 제품', null,
        ${jsonSql({
          basis: { amount: 1, unit: "serving" },
          values: { energy_kcal: 100 },
        })}
      )::text;
    `)));
    const writer = productEntryPsqlAsync(connection, serviceSql(`
      begin;
      select public.update_manual_food_product(
        '${USER_A}', '${product.id}',
        ${jsonSql({
          nutrition: {
            basis: { amount: 1, unit: "serving" },
            values: { energy_kcal: 130 },
          },
        })},
        '${product.nutrition_version_id}'
      );
      select pg_sleep(0.3);
      commit;
    `));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const staleCreate = productEntryPsqlAsync(connection, serviceSql(`
      select public.create_product_planner_entry(
        '${USER_A}', '${product.id}', '2026-07-27', '${columnA}',
        1, 'serving', '${product.nutrition_version_id}'
      );
    `));
    const [writerResult, staleResult] = await Promise.all([writer, staleCreate]);
    expect(writerResult.status, writerResult.stderr).toBe(0);
    expect(staleResult.status).not.toBe(0);
    expect(staleResult.stderr).toContain("NUTRITION_VERSION_CONFLICT");
    expect(psql(`
      select count(*) from public.product_planner_entries where product_id = '${product.id}';
    `)).toBe("0");
  });

  it("serializes column delete against entry create without orphan rows", async () => {
    const product = JSON.parse(psql(serviceSql(`
      select public.create_manual_food_product(
        '${USER_B}', 'column race 제품', null,
        ${jsonSql({
          basis: { amount: 1, unit: "serving" },
          values: { energy_kcal: 80 },
        })}
      )::text;
    `)));
    const column = psql(`
      select id from public.meal_plan_columns
      where user_id = '${USER_B}' order by sort_order desc limit 1;
    `);
    const deleting = productEntryPsqlAsync(connection, serviceSql(`
      begin;
      select id from public.meal_plan_columns where id = '${column}' for update;
      select pg_sleep(0.3);
      select public.delete_owned_planner_column('${USER_B}', '${column}');
      commit;
    `));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const creating = productEntryPsqlAsync(connection, serviceSql(`
      select public.create_product_planner_entry(
        '${USER_B}', '${product.id}', '2026-07-28', '${column}',
        1, 'serving', '${product.nutrition_version_id}'
      );
    `));
    const [deleteResult, createResult] = await Promise.all([deleting, creating]);
    expect(deleteResult.status, deleteResult.stderr).toBe(0);
    expect(createResult.status).not.toBe(0);
    expect(createResult.stderr).toContain("RESOURCE_NOT_FOUND");
    expect(psql(`select count(*) from public.meal_plan_columns where id = '${column}';`)).toBe("0");
    expect(psql(`
      select count(*) from public.product_planner_entries where column_id = '${column}';
    `)).toBe("0");
  });
});
