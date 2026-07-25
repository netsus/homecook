import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_PRODUCT_CATALOG_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_PRODUCT_CATALOG_PGHOST ?? "";
const port = process.env.HOMECOOK_PRODUCT_CATALOG_PGPORT ?? "";
const database = process.env.HOMECOOK_PRODUCT_CATALOG_PGDATABASE ?? "";

const userA = "31000000-0000-4000-8000-000000000001";
const userB = "31000000-0000-4000-8000-000000000002";
const privateProductId = "31000000-0000-4000-8000-000000000010";

function psqlResult(sql: string) {
  return spawnSync("psql", [
    "-h", host, "-p", port, "-U", "postgres", "-d", database,
    "-At", "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
  });
}

function psql(sql: string) {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function serviceSql(sql: string) {
  return `set role service_role; set request.jwt.claim.role = 'service_role'; ${sql}`;
}

function jsonExpression(value: unknown) {
  return `convert_from(decode('${
    Buffer.from(JSON.stringify(value), "utf8").toString("base64")
  }', 'base64'), 'UTF8')::jsonb`;
}

function createCommunity(name: string, brand: string | null) {
  const brandSql = brand === null ? "null" : `'${brand}'`;
  return JSON.parse(psql(serviceSql(`
    select public.create_manual_food_product(
      '${userA}',
      '${name}',
      ${brandSql},
      ${jsonExpression({
        basis: { amount: 100, unit: "g" },
        values: {
          energy_kcal: 100,
          carbohydrate_g: 10,
          protein_g: 3,
          fat_g: 4,
          sodium_mg: 50,
        },
      })}
    )::text;
  `))) as { id: string };
}

function search({
  actor = userA,
  q = "",
  types = ["ingredient", "food_product"],
  source = null,
  cursorVersion = null,
  cursor = null,
  limit = 20,
}: {
  actor?: string;
  q?: string;
  types?: string[];
  source?: string | null;
  cursorVersion?: number | null;
  cursor?: Record<string, unknown> | null;
  limit?: number;
}) {
  const sourceSql = source === null ? "null" : `'${source}'`;
  const cursorSql = cursor === null ? "null" : jsonExpression(cursor);
  return JSON.parse(psql(serviceSql(`
    select public.search_food_catalog_ranked(
      '${actor}',
      '${q}',
      array[${types.map((type) => `'${type}'`).join(",")}],
      ${sourceSql},
      ${cursorVersion ?? "null"},
      ${cursorSql},
      '${"a".repeat(64)}',
      ${limit}
    )::text;
  `))) as {
    items: Array<Record<string, unknown>>;
    has_next: boolean;
    next_cursor_tuple: Record<string, unknown> | null;
  };
}

describe.runIf(enabled)("prepared food unified ranked search on isolated PostgreSQL", () => {
  beforeAll(() => {
    psql(`
      insert into public.users (id, nickname, social_provider, social_id) values
        ('${userA}', 'search-a', 'google', 'search-a'),
        ('${userB}', 'search-b', 'google', 'search-b')
      on conflict (id) do nothing;
      insert into public.ingredients (
        id, standard_name, category, default_unit, created_at
      ) values (
        '31000000-0000-4000-8000-000000000020',
        '연세 크림',
        '유제품',
        'g',
        '2026-07-25T00:00:00Z'
      ) on conflict (id) do nothing;
    `);

    createCommunity("생크림빵", "연세우유");
    createCommunity("크림빵", "연세");
    createCommunity("크림빵", "일반");
    createCommunity("우유", "연세");

    psql(`
      begin;
      set constraints all deferred;
      insert into public.food_products (
        id, owner_user_id, visibility, source_type, moderation_status, name,
        brand, current_nutrition_version_id, created_at
      ) values (
        '${privateProductId}', '${userA}', 'private', 'manual', 'visible',
        '비밀 연세크림빵', '개인',
        '31000000-0000-4000-8000-000000000011',
        '2026-07-25T01:00:00Z'
      );
      insert into public.nutrition_profiles (
        id, profile_kind, normalization_method, basis_amount, basis_unit,
        version, review_status, is_active, created_by
      ) values (
        '31000000-0000-4000-8000-000000000012',
        'product_label', 'as_labeled', 100, 'g',
        1, 'self_reported', true, '${userA}'
      );
      insert into public.nutrition_values (
        profile_id, nutrient_code, amount, value_status
      ) values
        ('31000000-0000-4000-8000-000000000012', 'energy_kcal', 110, 'observed'),
        ('31000000-0000-4000-8000-000000000012', 'carbohydrate_g', 12, 'observed'),
        ('31000000-0000-4000-8000-000000000012', 'protein_g', 3, 'observed'),
        ('31000000-0000-4000-8000-000000000012', 'fat_g', 4, 'observed'),
        ('31000000-0000-4000-8000-000000000012', 'sodium_mg', 60, 'observed');
      insert into public.food_product_nutrition_versions (
        id, product_id, nutrition_profile_id, version,
        basis_relations_json, created_by
      ) values (
        '31000000-0000-4000-8000-000000000011',
        '${privateProductId}',
        '31000000-0000-4000-8000-000000000012',
        1,
        '[]'::jsonb,
        '${userA}'
      );
      commit;
    `);
  });

  it("keeps the ranked RPC executable only by service_role", () => {
    expect(psql(`
      select concat_ws(
        ',',
        has_function_privilege(
          'anon',
          'public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)',
          'EXECUTE'
        ),
        has_function_privilege(
          'authenticated',
          'public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)',
          'EXECUTE'
        )
      );
    `)).toBe("f,f,t");
  });

  it("globally ranks full no-space split coverage ahead of one-fragment matches", () => {
    const result = search({ q: "연세크림빵" });
    const labels = result.items.map((item) =>
      item.type === "ingredient"
        ? item.standard_name
        : `${item.brand ?? ""}${item.name ?? ""}`
    );

    expect(labels.slice(0, 3)).toEqual([
      "연세크림빵",
      "개인비밀 연세크림빵",
      "연세우유생크림빵",
    ]);
    expect(labels.indexOf("연세우유생크림빵")).toBeLessThan(
      labels.indexOf("연세 크림"),
    );
    expect(labels.indexOf("일반크림빵")).toBeGreaterThan(2);
  });

  it("derives community and mine scopes without exposing another owner private row", () => {
    const mineA = search({
      q: "연세크림빵",
      types: ["food_product"],
      source: "mine",
    });
    const mineB = search({
      actor: userB,
      q: "연세크림빵",
      types: ["food_product"],
      source: "mine",
    });
    const community = search({
      q: "연세크림빵",
      types: ["food_product"],
      source: "community",
    });

    expect(mineA.items.map((item) => item.id)).toEqual([privateProductId]);
    expect(mineB.items).toEqual([]);
    expect(community.items.some((item) => item.id === privateProductId)).toBe(false);
    for (const item of [...mineA.items, ...community.items]) {
      expect(item).not.toHaveProperty("owner_user_id");
      expect(item).not.toHaveProperty("moderation_status");
    }
  });

  it("paginates one v2 tuple without duplicates or omissions", () => {
    const first = search({
      q: "연세크림빵",
      types: ["food_product"],
      limit: 2,
    });
    expect(first.has_next).toBe(true);
    expect(first.next_cursor_tuple).toMatchObject({ algorithm_version: 2 });

    const second = search({
      q: "연세크림빵",
      types: ["food_product"],
      cursorVersion: 2,
      cursor: first.next_cursor_tuple,
      limit: 20,
    });
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fails closed for an out-of-range internal v2 cursor tuple", () => {
    const result = psqlResult(serviceSql(`
      select public.search_food_catalog_ranked(
        '${userA}',
        '연세크림빵',
        array['food_product'],
        null,
        2,
        ${jsonExpression({
          algorithm_version: 2,
          match_bucket: 10,
          coverage_bucket: 0,
          quantized_score: 0,
          source_partition: 0,
          type_partition: 1,
          created_at: "2026-07-25T00:00:00.000000Z",
          stable_id: privateProductId,
        })},
        '${"a".repeat(64)}',
        20
      );
    `));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("INVALID_SEARCH_FILTER");
  });

  it("runs the post-merge remote verification SQL without exposing row data", async () => {
    const verifier = await import(
      "../scripts/lib/prepared-food-search-remote-verifier.mjs"
    );
    const plan = verifier.buildPreparedFoodSearchRemoteVerificationPlan({
      mode: "post-merge-read-only",
    });
    const result = JSON.parse(psql(serviceSql(`
      set homecook.prepared_food_search_actor_id = '${userA}';
      ${plan.sql}
    `)));

    expect(
      () => verifier.assertPreparedFoodSearchRemoteVerificationResult(result),
      JSON.stringify(result),
    ).not.toThrow();
    expect(result).not.toHaveProperty("actor_id");
    expect(result).not.toHaveProperty("product_id");
  });

  it("distinguishes a missing approved actor fixture from an implementation failure", async () => {
    const verifier = await import(
      "../scripts/lib/prepared-food-search-remote-verifier.mjs"
    );
    const plan = verifier.buildPreparedFoodSearchRemoteVerificationPlan({
      mode: "post-merge-read-only",
    });
    const result = JSON.parse(psql(serviceSql(`
      set homecook.prepared_food_search_actor_id = '${userB}';
      ${plan.sql}
    `)));

    expect(result.fixture_ready).toBe(false);
    expect(() =>
      verifier.assertPreparedFoodSearchRemoteVerificationResult(result),
    ).toThrow(/smoke fixture is missing/i);
  });
});
