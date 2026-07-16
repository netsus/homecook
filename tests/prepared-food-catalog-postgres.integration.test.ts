import { spawn, spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { decodeProductCursor } from "@/lib/server/prepared-food-catalog";

const enabled = process.env.HOMECOOK_PRODUCT_CATALOG_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_PRODUCT_CATALOG_PGHOST ?? "";
const port = process.env.HOMECOOK_PRODUCT_CATALOG_PGPORT ?? "";
const database = process.env.HOMECOOK_PRODUCT_CATALOG_PGDATABASE ?? "";
const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";

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

function psqlAsync(sql: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [
      "-h", host, "-p", port, "-U", "postgres", "-d", database,
      "-At", "-v", "ON_ERROR_STOP=1", "-c", sql,
    ], {
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
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

function encodedJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function jsonExpression(value: unknown) {
  return `convert_from(decode('${encodedJson(value)}', 'base64'), 'UTF8')::jsonb`;
}

function textExpression(value: string) {
  return `convert_from(decode('${Buffer.from(value, "utf8").toString("base64")}', 'base64'), 'UTF8')`;
}

function serviceSql(sql: string) {
  return `set role service_role; set request.jwt.claim.role = 'service_role'; ${sql}`;
}

function nutrition(energy: number, extra: Record<string, number | null> = {}) {
  return {
    basis: { amount: 1, unit: "serving" },
    values: { energy_kcal: energy, ...extra },
  };
}

function createManual(name: string, value = nutrition(120)) {
  return JSON.parse(psql(serviceSql(`
    select public.create_manual_food_product(
      '${userA}', ${textExpression(name)}, null, ${jsonExpression(value)}
    )::text;
  `)));
}

function seedSyntheticPublicPair() {
  psql(`
    begin;
    set constraints all deferred;
    insert into public.nutrition_sources (
      id, provider_code, dataset_name, source_kind, source_version,
      fetched_at, freshness_checked_at, freshness_status, priority_rank,
      source_url, license_name, manifest_sha256, review_status,
      decision_reason, reviewed_by, reviewed_at, is_active
    ) values (
      '81000000-0000-4000-8000-000000000001', 'MFDS', 'isolated-test-only',
      'nutrition_dataset', '2026-07-16', now(), now(), 'current', 1,
      'https://example.test/official', 'test-only', 'synthetic-public-manifest',
      'approved', 'isolated test fixture only', '${userA}', now(), true
    );
    insert into public.nutrition_source_items (
      id, source_id, external_item_key, external_name, source_basis_text,
      source_basis_amount, source_basis_unit, stable_fingerprint, review_status,
      decision_reason, reviewed_by, reviewed_at, provenance_json
    ) values
      ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001',
       'stable-product-a', '동일 이름', '100 g', 100, 'g', 'synthetic-a', 'approved',
       'isolated test fixture only', '${userA}', now(), '{}'::jsonb),
      ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001',
       'stable-product-b', '동일 이름', '100 g', 100, 'g', 'synthetic-b', 'approved',
       'isolated test fixture only', '${userA}', now(), '{}'::jsonb);
    insert into public.nutrition_profiles (
      id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
      version, review_status, decision_reason, reviewed_by, reviewed_at, is_active
    ) values
      ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001',
       'product_label', 'as_labeled', 100, 'g', 1, 'approved',
       'isolated test fixture only', '${userA}', now(), true),
      ('83000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000002',
       'product_label', 'as_labeled', 100, 'g', 1, 'approved',
       'isolated test fixture only', '${userA}', now(), true);
    insert into public.nutrition_values (
      profile_id, nutrient_code, source_nutrient_code, source_unit,
      amount, value_status, source_token
    )
    select profile_id, nutrient_code, nutrient_code, unit, amount, 'observed', amount::text
    from (values
      ('83000000-0000-4000-8000-000000000001'::uuid, 70::numeric),
      ('83000000-0000-4000-8000-000000000002'::uuid, 80::numeric)
    ) profile(profile_id, base_energy)
    cross join lateral (values
      ('energy_kcal', 'kcal', base_energy),
      ('carbohydrate_g', 'g', 5::numeric),
      ('protein_g', 'g', 4::numeric),
      ('fat_g', 'g', 3::numeric),
      ('sodium_mg', 'mg', 55::numeric)
    ) nutrient(nutrient_code, unit, amount);
    insert into public.food_products (
      id, owner_user_id, visibility, source_type, name, brand,
      external_product_key, current_nutrition_version_id, created_at
    ) values
      ('84000000-0000-4000-8000-000000000001', null, 'public', 'public_dataset',
       '동일 이름', '동일 브랜드', 'stable-product-a',
       '85000000-0000-4000-8000-000000000001', '2026-07-16T01:00:00Z'),
      ('84000000-0000-4000-8000-000000000002', null, 'public', 'public_dataset',
       '동일 이름', '동일 브랜드', 'stable-product-b',
       '85000000-0000-4000-8000-000000000002', '2026-07-16T02:00:00Z');
    insert into public.food_product_nutrition_versions (
      id, product_id, nutrition_profile_id, version, basis_relations_json, source_item_id
    ) values
      ('85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001',
       '83000000-0000-4000-8000-000000000001', 1,
       '[{"from":{"amount":1,"unit":"serving"},"to":{"amount":100,"unit":"g"}}]'::jsonb,
       '82000000-0000-4000-8000-000000000001'),
      ('85000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000002',
       '83000000-0000-4000-8000-000000000002', 1, '[]'::jsonb,
       '82000000-0000-4000-8000-000000000002');
    commit;
  `);
}

describe.runIf(enabled)("prepared food catalog isolated PostgreSQL integration", () => {
  beforeAll(() => {
    expect(host).not.toBe("");
    expect(port).not.toBe("");
    expect(database).toMatch(/^homecook_[a-z0-9_]+$/);
    psql(`
      insert into public.users (id, nickname, social_provider, social_id) values
        ('${userA}', 'catalog-a', 'google', 'catalog-a'),
        ('${userB}', 'catalog-b', 'google', 'catalog-b');
    `);
  });

  it("starts with zero approved public product rows and no catalog importer surface", () => {
    expect(psql("select count(*) from public.food_products where visibility = 'public';")).toBe("0");
    expect(psql(`
      select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname ~ '(import|promote|seed).*food.*product';
    `)).toBe("0");
  });

  it("atomically creates sparse private manual nutrition without false zero values", () => {
    const created = createManual("내 요거트", nutrition(0, { sodium_mg: null, fiber_g: 1.5 }));
    expect(created.visibility).toBe("private");
    expect(created.source_type).toBe("manual");
    expect(created.basis_relations).toEqual([]);
    expect(created.nutrition.values.energy_kcal.amount).toBe(0);
    expect(created.nutrition.values.sodium_mg).toMatchObject({ amount: null, status: "unavailable" });
    expect(created.nutrition.values.fiber_g.amount).toBe(1.5);
    expect(created.nutrition.values).not.toHaveProperty("sugars_g");
    expect(created.nutrition.sources).toEqual([{
      provider: "user_label",
      dataset: null,
      source_version: null,
      data_basis_date: null,
      license: null,
      source_url: null,
    }]);
    expect(psql(`
      select count(*) from public.nutrition_values
      where profile_id = (
        select nutrition_profile_id from public.food_product_nutrition_versions
        where id = '${created.nutrition_version_id}'
      ) and nutrient_code = 'sodium_mg';
    `)).toBe("0");

    const beforeProducts = psql("select count(*) from public.food_products;");
    const beforeProfiles = psql(`select count(*) from public.nutrition_profiles where created_by = '${userA}';`);
    const beforeValues = psql(`
      select count(*) from public.nutrition_values value
      join public.nutrition_profiles profile on profile.id = value.profile_id
      where profile.created_by = '${userA}';
    `);
    const beforeVersions = psql(`select count(*) from public.food_product_nutrition_versions where created_by = '${userA}';`);
    const failedCreate = psqlResult(serviceSql(`
      select public.create_manual_food_product(
        '${userA}', 'create-rollback-probe', null,
        ${jsonExpression(nutrition(999999999999999900000))}
      );
    `));
    expect(failedCreate.status).not.toBe(0);
    expect(psql("select count(*) from public.food_products;")).toBe(beforeProducts);
    expect(psql(`select count(*) from public.nutrition_profiles where created_by = '${userA}';`)).toBe(beforeProfiles);
    expect(psql(`
      select count(*) from public.nutrition_values value
      join public.nutrition_profiles profile on profile.id = value.profile_id
      where profile.created_by = '${userA}';
    `)).toBe(beforeValues);
    expect(psql(`select count(*) from public.food_product_nutrition_versions where created_by = '${userA}';`)).toBe(beforeVersions);
    expect(psql("select count(*) from public.food_products where name = 'create-rollback-probe';")).toBe("0");
  });

  it("preserves version for metadata and appends a new immutable version for nutrition", () => {
    const created = createManual("버전 제품");
    const metadata = JSON.parse(psql(serviceSql(`
      select public.update_manual_food_product(
        '${userA}', '${created.id}', '{"brand":"새 브랜드"}'::jsonb,
        '${created.nutrition_version_id}'
      )::text;
    `)));
    expect(metadata.nutrition_version_id).toBe(created.nutrition_version_id);
    const nutritionUpdated = JSON.parse(psql(serviceSql(`
      select public.update_manual_food_product(
        '${userA}', '${created.id}',
        ${jsonExpression({ nutrition: nutrition(150, { protein_g: 8 }) })},
        '${created.nutrition_version_id}'
      )::text;
    `)));
    expect(nutritionUpdated.nutrition_version_id).not.toBe(created.nutrition_version_id);
    expect(psql(`select count(*) from public.food_product_nutrition_versions where product_id = '${created.id}';`)).toBe("2");
    expect(psql(`select count(*) from public.food_product_nutrition_versions where id = '${created.nutrition_version_id}';`)).toBe("1");
  });

  it("rejects cross-product current pointers and invalid basis relations at the database boundary", () => {
    const productA = createManual("현재 버전 제품 A");
    const productB = createManual("현재 버전 제품 B");
    const crossProductCurrent = psqlResult(`
      update public.food_products
      set current_nutrition_version_id = '${productB.nutrition_version_id}'
      where id = '${productA.id}';
    `);
    expect(crossProductCurrent.status).not.toBe(0);
    expect(psql(`
      select current_nutrition_version_id
      from public.food_products
      where id = '${productA.id}';
    `)).toBe(productA.nutrition_version_id);

    for (const relation of [
      [{ from: { amount: 1, unit: "g" }, to: { amount: 2, unit: "g" } }],
      [{ from: { amount: 0, unit: "serving" }, to: { amount: 100, unit: "g" } }],
      [
        { from: { amount: 1, unit: "serving" }, to: { amount: 100, unit: "g" } },
        { from: { amount: 1, unit: "serving" }, to: { amount: 100, unit: "g" } },
      ],
    ]) {
      expect(psql(`select public.validate_food_product_basis_relations(${jsonExpression(relation)});`)).toBe("f");
    }

    const invalidRelationInsert = psqlResult(`
      begin;
      insert into public.nutrition_profiles (
        id, profile_kind, normalization_method, basis_amount, basis_unit,
        review_status, is_active, created_by
      ) values (
        '87000000-0000-4000-8000-000000000001', 'product_label', 'as_labeled',
        1, 'serving', 'self_reported', true, '${userA}'
      );
      insert into public.nutrition_values (
        profile_id, nutrient_code, amount, value_status
      ) values (
        '87000000-0000-4000-8000-000000000001', 'energy_kcal', 100, 'observed'
      );
      insert into public.food_product_nutrition_versions (
        product_id, nutrition_profile_id, version, basis_relations_json, created_by
      ) values (
        '${productA.id}', '87000000-0000-4000-8000-000000000001', 2,
        '[{"from":{"amount":1,"unit":"g"},"to":{"amount":2,"unit":"g"}}]'::jsonb,
        '${userA}'
      );
      commit;
    `);
    expect(invalidRelationInsert.status).not.toBe(0);
    expect(psql(`select count(*) from public.nutrition_profiles where id = '87000000-0000-4000-8000-000000000001';`)).toBe("0");
    expect(psql(`select count(*) from public.food_product_nutrition_versions where product_id = '${productA.id}';`)).toBe("1");
  });

  it("allows one concurrent nutrition writer and rolls the loser and injected failure back", async () => {
    const created = createManual("경합 제품");
    const update = (energy: number) => serviceSql(`
      select public.update_manual_food_product(
        '${userA}', '${created.id}',
        ${jsonExpression({ nutrition: nutrition(energy) })},
        '${created.nutrition_version_id}'
      )::text;
    `);
    const results = await Promise.all([psqlAsync(update(201)), psqlAsync(update(202))]);
    expect(results.filter((result) => result.status === 0)).toHaveLength(1);
    const loser = results.find((result) => result.status !== 0);
    expect(loser?.stderr).toContain("NUTRITION_VERSION_CONFLICT");
    expect(psql(`select count(*) from public.food_product_nutrition_versions where product_id = '${created.id}';`)).toBe("2");

    const current = psql(`select current_nutrition_version_id from public.food_products where id = '${created.id}';`);
    const beforeProfiles = psql(`select count(*) from public.nutrition_profiles where created_by = '${userA}';`);
    const failure = psqlResult(serviceSql(`
      select public.update_manual_food_product(
        '${userA}', '${created.id}',
        ${jsonExpression({ nutrition: nutrition(999999999999999900000) })},
        '${current}'
      )::text;
    `));
    expect(failure.status).not.toBe(0);
    expect(psql(`select current_nutrition_version_id from public.food_products where id = '${created.id}';`)).toBe(current);
    expect(psql(`select count(*) from public.nutrition_profiles where created_by = '${userA}';`)).toBe(beforeProfiles);
    expect(psql(`select count(*) from public.food_product_nutrition_versions where product_id = '${created.id}';`)).toBe("2");
  });

  it("keeps isolated synthetic public stable keys distinct and returns only safe pinned attribution", () => {
    seedSyntheticPublicPair();
    const listed = JSON.parse(psql(serviceSql(`
      select public.list_food_products('${userA}', '동일 이름', null, null, 20)::text;
    `)));
    expect(listed.items).toHaveLength(2);
    expect(listed.items.map((item: { id: string }) => item.id).sort()).toEqual([
      "84000000-0000-4000-8000-000000000001",
      "84000000-0000-4000-8000-000000000002",
    ]);
    expect(Object.keys(listed.items[0].nutrition.sources[0]).sort()).toEqual([
      "data_basis_date", "dataset", "license", "provider", "source_url", "source_version",
    ]);
    expect(listed.items[0].nutrition.sources[0].source_version).toBe("2026-07-16");

    const firstPage = JSON.parse(psql(serviceSql(`
      select public.list_food_products('${userA}', '동일 이름', null, null, 1)::text;
    `)));
    expect(firstPage.has_next).toBe(true);
    expect(firstPage.items).toHaveLength(1);
    const cursor = decodeProductCursor(firstPage.next_cursor);
    expect(cursor).not.toBeNull();
    const secondPage = JSON.parse(psql(serviceSql(`
      select public.list_food_products(
        '${userA}', '동일 이름', '${cursor?.createdAt}'::timestamptz, '${cursor?.id}', 1
      )::text;
    `)));
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);

    const mismatched = psqlResult(`
      begin;
      set constraints all deferred;
      insert into public.food_products (
        id, owner_user_id, visibility, source_type, name, external_product_key,
        current_nutrition_version_id
      ) values (
        '84000000-0000-4000-8000-000000000003', null, 'public', 'public_dataset',
        '잘못 연결', 'unrelated-key', '85000000-0000-4000-8000-000000000003'
      );
      insert into public.food_product_nutrition_versions (
        id, product_id, nutrition_profile_id, version, basis_relations_json, source_item_id
      ) values (
        '85000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000003',
        '83000000-0000-4000-8000-000000000001', 1, '[]'::jsonb,
        '82000000-0000-4000-8000-000000000001'
      );
      commit;
    `);
    expect(mismatched.status).not.toBe(0);
    expect(mismatched.stderr).toContain("INVALID_PUBLIC_PRODUCT_VERSION");
    expect(psql("select count(*) from public.food_products where id = '84000000-0000-4000-8000-000000000003';")).toBe("0");

    psql(`
      update public.nutrition_sources
      set review_status = 'superseded', is_active = false
      where id = '81000000-0000-4000-8000-000000000001';
    `);
    const stale = JSON.parse(psql(serviceSql(`
      select public.list_food_products('${userA}', '동일 이름', null, null, 20)::text;
    `)));
    expect(stale.items).toEqual([]);
  });

  it("enforces owner RLS, public read-only, append-only history, and idempotent soft delete", () => {
    const created = createManual("삭제 제품");
    const hidden = psql(`
      set role authenticated;
      set request.jwt.claim.sub = '${userB}';
      select count(*) from public.food_products where id = '${created.id}';
    `);
    expect(hidden).toBe("0");

    expect(psql(`
      set role authenticated;
      set request.jwt.claim.sub = '${userB}';
      with changed as (
        update public.food_products set name = '침범'
        where id = '${created.id}' returning id
      ) select count(*) from changed;
    `)).toBe("0");
    expect(psql(`
      set role authenticated;
      set request.jwt.claim.sub = '${userB}';
      with changed as (
        update public.food_products set name = '공개 침범'
        where id = '84000000-0000-4000-8000-000000000001' returning id
      ) select count(*) from changed;
    `)).toBe("0");

    const anonRead = psqlResult(`
      set role anon;
      select count(*) from public.food_products;
    `);
    expect(anonRead.status).not.toBe(0);
    expect(anonRead.stderr).toMatch(/permission denied/i);

    for (const mutation of [
      `insert into public.food_product_nutrition_versions (
         id, product_id, nutrition_profile_id, version, basis_relations_json, created_by
       ) values (
         '86000000-0000-4000-8000-000000000001', '${created.id}',
         (select nutrition_profile_id from public.food_product_nutrition_versions where id='${created.nutrition_version_id}'),
         99, '[]'::jsonb, '${userB}'
       )`,
      `update public.food_product_nutrition_versions set version = 99 where id = '${created.nutrition_version_id}'`,
      `delete from public.food_product_nutrition_versions where id = '${created.nutrition_version_id}'`,
      `insert into public.nutrition_profiles (
         profile_kind, normalization_method, basis_amount, basis_unit, review_status, is_active, created_by
       ) values ('product_label','as_labeled',1,'serving','self_reported',true,'${userB}')`,
      `update public.nutrition_profiles set basis_amount = 2 where id = (
         select nutrition_profile_id from public.food_product_nutrition_versions where id='${created.nutrition_version_id}'
       )`,
      `delete from public.nutrition_profiles where id = (
         select nutrition_profile_id from public.food_product_nutrition_versions where id='${created.nutrition_version_id}'
       )`,
      `insert into public.nutrition_values (profile_id, nutrient_code, amount, value_status)
       values ('83000000-0000-4000-8000-000000000001','fiber_g',1,'observed')`,
      `update public.nutrition_values set amount = 999 where profile_id = '83000000-0000-4000-8000-000000000001'`,
      `delete from public.nutrition_values where profile_id = '83000000-0000-4000-8000-000000000001'`,
    ]) {
      const denied = psqlResult(`
        set role authenticated;
        set request.jwt.claim.sub = '${userB}';
        ${mutation};
      `);
      expect(denied.status).not.toBe(0);
      expect(denied.stderr).toMatch(/permission denied|IMMUTABLE/i);
    }

    const crossOwner = psqlResult(`
      set role authenticated;
      set request.jwt.claim.sub = '${userB}';
      select public.update_manual_food_product(
        '${userB}', '${created.id}', '{"name":"침범"}'::jsonb,
        '${created.nutrition_version_id}'
      );
    `);
    expect(crossOwner.status).not.toBe(0);
    expect(crossOwner.stderr).toContain("RESOURCE_NOT_FOUND");

    const publicMutation = psqlResult(serviceSql(`
      select public.delete_manual_food_product(
        '${userA}', '84000000-0000-4000-8000-000000000001'
      );
    `));
    expect(publicMutation.status).not.toBe(0);
    expect(publicMutation.stderr).toContain("FORBIDDEN");

    const immutable = psqlResult(`
      update public.food_product_nutrition_versions
      set version = version + 1 where id = '${created.nutrition_version_id}';
    `);
    expect(immutable.status).not.toBe(0);
    expect(immutable.stderr).toContain("IMMUTABLE_PRODUCT_NUTRITION_VERSION");

    expect(JSON.parse(psql(serviceSql(`
      select public.delete_manual_food_product('${userA}', '${created.id}')::text;
    `)))).toEqual({ deleted: true });
    expect(JSON.parse(psql(serviceSql(`
      select public.delete_manual_food_product('${userA}', '${created.id}')::text;
    `)))).toEqual({ deleted: true });
    expect(psql(`select count(*) from public.food_product_nutrition_versions where product_id = '${created.id}';`)).toBe("1");
    const listed = JSON.parse(psql(serviceSql(`
      select public.list_food_products('${userA}', '삭제 제품', null, null, 20)::text;
    `)));
    expect(listed.items).toEqual([]);
  });
});
