import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_COMMUNITY_PRODUCT_CATALOG_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_COMMUNITY_PRODUCT_CATALOG_PGHOST ?? "";
const port = process.env.HOMECOOK_COMMUNITY_PRODUCT_CATALOG_PGPORT ?? "";
const database = process.env.HOMECOOK_COMMUNITY_PRODUCT_CATALOG_PGDATABASE ?? "";

const userA = "20000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000002";
const userC = "20000000-0000-4000-8000-000000000003";

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

function jsonExpression(value: unknown) {
  return `convert_from(decode('${Buffer.from(JSON.stringify(value), "utf8").toString("base64")}', 'base64'), 'UTF8')::jsonb`;
}

function serviceSql(sql: string) {
  return `set role service_role; set request.jwt.claim.role = 'service_role'; ${sql}`;
}

function authenticatedSql(userId: string, sql: string) {
  return `set role authenticated; set request.jwt.claim.role = 'authenticated'; set request.jwt.claim.sub = '${userId}'; ${sql}`;
}

describe.runIf(enabled)("community prepared food catalog isolated PostgreSQL integration", () => {
  beforeAll(() => {
    expect(host).not.toBe("");
    expect(port).not.toBe("");
    expect(database).toMatch(/^homecook_[a-z0-9_]+$/);

    psql(`
      insert into public.users (id, nickname, social_provider, social_id) values
        ('${userA}', 'community-a', 'google', 'community-a'),
        ('${userB}', 'community-b', 'google', 'community-b'),
        ('${userC}', 'community-c', 'google', 'community-c');
    `);
  });

  it("creates shared manual products as visible public rows with label text", () => {
    const created = JSON.parse(psql(serviceSql(`
      select public.create_manual_food_product(
        '${userA}',
        '공동 요거트',
        null,
        ${jsonExpression({
          basis: { amount: 150, unit: "g" },
          label_basis_text: "1회(150g)",
          values: { energy_kcal: 120, sodium_mg: null },
        })}
      )::text;
    `)));

    expect(created.visibility).toBe("public");
    expect(created.source_type).toBe("manual");
    expect(created.nutrition.label_basis_text).toBe("1회(150g)");
  });

  it("installs visible trigram indexes and replaces the list function body without public_dataset EXISTS scans", () => {
    expect(psql(`
      select count(*) from pg_indexes
      where schemaname = 'public'
        and tablename = 'food_products'
        and indexname = 'food_products_visible_brand_trgm_idx';
    `)).toBe("1");
    expect(psql(`
      select count(*) from pg_indexes
      where schemaname = 'public'
        and tablename = 'food_products'
        and indexname = 'food_products_visible_name_trgm_idx';
    `)).toBe("1");

    const nameIndexDef = psql(`
      select indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'food_products'
        and indexname = 'food_products_visible_name_trgm_idx';
    `);
    const brandIndexDef = psql(`
      select indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'food_products'
        and indexname = 'food_products_visible_brand_trgm_idx';
    `);

    expect(nameIndexDef).toMatch(/using gin \(lower\(\(name\)::text\) gin_trgm_ops\)/i);
    expect(brandIndexDef).toMatch(/using gin \(lower\(\(coalesce\(brand, ''::character varying\)\)::text\) gin_trgm_ops\)/i);

    expect(psql(`
      select (
        position(
          'lower(product.name) like'
          in lower(pg_get_functiondef(
            'public.list_food_products(uuid,text,text,timestamptz,uuid,integer)'::regprocedure
          ))
        ) > 0
      )::text;
    `)).toBe("true");
    expect(psql(`
      select (
        position(
          'lower(coalesce(product.brand'
          in lower(pg_get_functiondef(
            'public.list_food_products(uuid,text,text,timestamptz,uuid,integer)'::regprocedure
          ))
        ) > 0
      )::text;
    `)).toBe("true");
    expect(psql(`
      select (
        position(
          'join lateral ('
          in lower(pg_get_functiondef(
            'public.list_food_products(uuid,text,text,timestamptz,uuid,integer)'::regprocedure
          ))
        ) > 0
      )::text;
    `)).toBe("true");
    expect(psql(`
      select (
        position(
          'from public.food_product_nutrition_versions admitted_version'
          in lower(pg_get_functiondef(
            'public.list_food_products(uuid,text,text,timestamptz,uuid,integer)'::regprocedure
          ))
        ) > 0
      )::text;
    `)).toBe("true");
    expect(psql(`
      select (
        position(
          'with admitted_public_dataset as materialized'
          in lower(pg_get_functiondef(
            'public.list_food_products(uuid,text,text,timestamptz,uuid,integer)'::regprocedure
          ))
        ) > 0
      )::text;
    `)).toBe("false");
  });

  it("orders shared manual before self legacy private and never exposes authority fields", () => {
    const shared = JSON.parse(psql(serviceSql(`
      select public.create_manual_food_product(
        '${userA}', '커뮤니티 정렬 공유', null,
        ${jsonExpression({ basis: { amount: 100, unit: "g" }, values: { energy_kcal: 91 } })}
      )::text;
    `)));
    psql(`
      begin;
      set constraints all deferred;
      insert into public.food_products (
        id, owner_user_id, visibility, source_type, moderation_status, name,
        current_nutrition_version_id
      ) values (
        '26000000-0000-4000-8000-000000000001', '${userB}', 'private', 'manual',
        'visible', '커뮤니티 정렬 비공개', '26000000-0000-4000-8000-000000000002'
      );
      insert into public.nutrition_profiles (
        id, profile_kind, normalization_method, basis_amount, basis_unit,
        version, review_status, is_active, created_by
      ) values (
        '26000000-0000-4000-8000-000000000003', 'product_label', 'as_labeled',
        1, 'serving', 1, 'self_reported', true, '${userB}'
      );
      insert into public.nutrition_values (
        profile_id, nutrient_code, amount, value_status
      ) values (
        '26000000-0000-4000-8000-000000000003', 'energy_kcal', 92, 'observed'
      );
      insert into public.food_product_nutrition_versions (
        id, product_id, nutrition_profile_id, version, basis_relations_json, created_by
      ) values (
        '26000000-0000-4000-8000-000000000002',
        '26000000-0000-4000-8000-000000000001',
        '26000000-0000-4000-8000-000000000003', 1, '[]'::jsonb, '${userB}'
      );
      commit;
    `);

    const result = JSON.parse(psql(serviceSql(`
      select public.list_food_products(
        '${userB}', '커뮤니티 정렬', 'manual', null, null, 20
      )::text;
    `)));
    expect(result.items.map((item: { id: string }) => item.id)).toEqual([
      shared.id,
      "26000000-0000-4000-8000-000000000001",
    ]);
    for (const item of result.items) {
      expect(item).not.toHaveProperty("owner_user_id");
      expect(item).not.toHaveProperty("moderation_status");
      expect(item).not.toHaveProperty("external_product_key");
    }
  });

  it("accepts the six report reasons once and blocks self, duplicate, private, hidden, and deleted reports", () => {
    const reasons = ["spam", "incorrect_nutrition", "duplicate", "rights", "unsafe", "other"];
    const productIds = reasons.map((reason, index) => JSON.parse(psql(serviceSql(`
      select public.create_manual_food_product(
        '${userA}', '신고 제품 ${index}', null,
        ${jsonExpression({ basis: { amount: 100, unit: "g" }, values: { energy_kcal: 100 + index } })}
      )::text;
    `))).id as string);

    reasons.forEach((reason, index) => {
      expect(JSON.parse(psql(serviceSql(`
        select public.report_food_product(
          '${userB}', '${productIds[index]}', '${reason}', null
        )::text;
      `)))).toEqual({ reported: true });
    });
    const self = psqlResult(serviceSql(`
      select public.report_food_product('${userA}', '${productIds[0]}', 'spam', null);
    `));
    expect(self.status).not.toBe(0);
    expect(self.stderr).toContain("FORBIDDEN");
    const duplicate = psqlResult(serviceSql(`
      select public.report_food_product('${userB}', '${productIds[0]}', 'spam', null);
    `));
    expect(duplicate.status).not.toBe(0);
    expect(duplicate.stderr).toContain("PRODUCT_ALREADY_REPORTED");

    const privateReport = psqlResult(serviceSql(`
      select public.report_food_product(
        '${userA}', '26000000-0000-4000-8000-000000000001', 'spam', null
      );
    `));
    expect(privateReport.status).not.toBe(0);
    expect(privateReport.stderr).toContain("PRODUCT_REPORT_NOT_ALLOWED");

    psql(`
      set session_replication_role = replica;
      update public.food_products set moderation_status = 'hidden_by_report'
      where id = '${productIds[1]}';
      set session_replication_role = origin;
    `);
    const hidden = psqlResult(serviceSql(`
      select public.report_food_product('${userC}', '${productIds[1]}', 'spam', null);
    `));
    expect(hidden.status).not.toBe(0);
    expect(hidden.stderr).toContain("PRODUCT_REPORT_NOT_ALLOWED");

    const deletedProduct = JSON.parse(psql(serviceSql(`
      select public.create_manual_food_product(
        '${userA}', '삭제 신고 금지', null,
        ${jsonExpression({ basis: { amount: 100, unit: "g" }, values: { energy_kcal: 99 } })}
      )::text;
    `)));
    psql(serviceSql(`select public.delete_manual_food_product('${userA}', '${deletedProduct.id}');`));
    const deleted = psqlResult(serviceSql(`
      select public.report_food_product('${userB}', '${deletedProduct.id}', 'spam', null);
    `));
    expect(deleted.status).not.toBe(0);
    expect(deleted.stderr).toContain("PRODUCT_REPORT_NOT_ALLOWED");
  });

  it("allows authenticated report inserts but reserves review transitions for service role", () => {
    const product = JSON.parse(psql(serviceSql(`
      select public.create_manual_food_product(
        '${userA}', '직접 신고 권한 제품', null,
        ${jsonExpression({ basis: { amount: 100, unit: "g" }, values: { energy_kcal: 101 } })}
      )::text;
    `)));

    expect(psql(authenticatedSql(userB, `
      insert into public.food_product_reports (
        product_id, reporter_user_id, reason_code, detail_text
      ) values (
        '${product.id}', '${userB}', 'incorrect_nutrition', '표시값 확인 필요'
      );
      select 'inserted';
    `))).toBe("inserted");
    expect(psql(serviceSql(`
      select count(*) from public.food_product_reports
      where product_id = '${product.id}' and reporter_user_id = '${userB}';
    `))).toBe("1");

    const authorityInjection = psqlResult(authenticatedSql(userC, `
      insert into public.food_product_reports (
        product_id, reporter_user_id, reason_code, report_status
      ) values (
        '${product.id}', '${userC}', 'spam', 'resolved'
      );
    `));
    expect(authorityInjection.status).not.toBe(0);
    expect(authorityInjection.stderr).toMatch(/permission denied/i);

    const userReview = psqlResult(authenticatedSql(userB, `
      update public.food_product_reports
      set report_status = 'acknowledged', reviewed_by = '${userA}', reviewed_at = now()
      where product_id = '${product.id}' and reporter_user_id = '${userB}';
    `));
    expect(userReview.status).not.toBe(0);
    expect(userReview.stderr).toMatch(/permission denied/i);

    expect(psql(serviceSql(`
      update public.food_product_reports
      set report_status = 'acknowledged', reviewed_by = '${userA}', reviewed_at = now()
      where product_id = '${product.id}' and reporter_user_id = '${userB}';
      select report_status || ':' || (reviewed_by is not null)::text || ':' || (reviewed_at is not null)::text
      from public.food_product_reports
      where product_id = '${product.id}' and reporter_user_id = '${userB}';
    `))).toBe("acknowledged:true:true");
  });

  it("rejects moderation states that conflict with visibility or source authority", () => {
    const privateHidden = psqlResult(serviceSql(`
      update public.food_products
      set moderation_status = 'hidden_by_report'
      where id = '26000000-0000-4000-8000-000000000001';
    `));
    expect(privateHidden.status).not.toBe(0);
    expect(privateHidden.stderr).toMatch(/check constraint/i);

    const datasetReportHidden = psqlResult(`
      insert into public.food_products (
        visibility, source_type, moderation_status, name,
        external_product_key, current_nutrition_version_id
      ) values (
        'public', 'public_dataset', 'hidden_by_report', '금지된 공공 신고 숨김',
        'test:forbidden-hidden', gen_random_uuid()
      );
    `);
    expect(datasetReportHidden.status).not.toBe(0);
    expect(datasetReportHidden.stderr).toMatch(/check constraint/i);
  });

  it("rejects missing actor and required JSON values at the SQL RPC boundary", () => {
    const cases = [
      `select public.create_manual_food_product(
        null, '익명 제품', null,
        ${jsonExpression({ basis: { amount: 100, unit: "g" }, values: { energy_kcal: 100 } })}
      )`,
      `select public.create_manual_food_product('${userA}', '영양 누락 제품', null, null)`,
      `select public.update_manual_food_product(
        '${userB}', '26000000-0000-4000-8000-000000000001',
        '{"nutrition":null}'::jsonb, '26000000-0000-4000-8000-000000000002'
      )`,
      `select public.report_food_product('${userB}', gen_random_uuid(), null, null)`,
      `select public.list_food_products('${userA}', null, null, null, null, 20)`,
      `select public.list_food_products('${userA}', null, 'all', null, null, null)`,
    ];

    for (const statement of cases) {
      const rejected = psqlResult(serviceSql(statement));
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain("VALIDATION_ERROR");
    }
  });

  it("preserves an existing planner pin while locking hidden products from every new admission", () => {
    const product = JSON.parse(psql(serviceSql(`
      select public.create_manual_food_product(
        '${userA}', '핀 보존 제품', null,
        ${jsonExpression({ basis: { amount: 100, unit: "g" }, values: { energy_kcal: 120 } })}
      )::text;
    `)));
    const columnId = "27000000-0000-4000-8000-000000000001";
    psql(`insert into public.meal_plan_columns (id, user_id) values ('${columnId}', '${userB}');`);
    const entry = JSON.parse(psql(serviceSql(`
      select public.create_product_planner_entry(
        '${userB}', '${product.id}', '2026-07-18', '${columnId}', 100, 'g',
        '${product.nutrition_version_id}'
      )::text;
    `)));
    const updated = JSON.parse(psql(serviceSql(`
      select public.update_manual_food_product(
        '${userA}', '${product.id}',
        ${jsonExpression({ nutrition: { basis: { amount: 100, unit: "g" }, values: { energy_kcal: 140 } } })},
        '${product.nutrition_version_id}'
      )::text;
    `)));
    expect(updated.nutrition_version_id).not.toBe(product.nutrition_version_id);
    expect(psql(`
      select product_nutrition_version_id::text || ':' || product_name_snapshot
      from public.product_planner_entries where id = '${entry.id}';
    `)).toBe(`${product.nutrition_version_id}:핀 보존 제품`);

    psql(`
      set session_replication_role = replica;
      update public.food_products set moderation_status = 'hidden_by_operator'
      where id = '${product.id}';
      set session_replication_role = origin;
    `);
    const addHidden = psqlResult(serviceSql(`
      select public.create_product_planner_entry(
        '${userB}', '${product.id}', '2026-07-19', '${columnId}', 100, 'g',
        '${updated.nutrition_version_id}'
      );
    `));
    expect(addHidden.status).not.toBe(0);
    expect(addHidden.stderr).toContain("PRODUCT_HIDDEN");
    for (const statement of [
      `select public.update_manual_food_product('${userA}', '${product.id}', '{"brand":"잠금"}'::jsonb, '${updated.nutrition_version_id}')`,
      `select public.delete_manual_food_product('${userA}', '${product.id}')`,
    ]) {
      const locked = psqlResult(serviceSql(statement));
      expect(locked.status).not.toBe(0);
      expect(locked.stderr).toContain("PRODUCT_MODERATION_LOCKED");
    }
    expect(psql(`select count(*) from public.product_planner_entries where id = '${entry.id}';`)).toBe("1");
  });

  it("keeps shared manual rows and another user's planner pin after account deletion", () => {
    const created = JSON.parse(psql(serviceSql(`
      select public.create_manual_food_product(
        '${userC}',
        '탈퇴 보존 제품',
        null,
        ${jsonExpression({
          basis: { amount: 100, unit: "g" },
          values: { energy_kcal: 88 },
        })}
      )::text;
    `)));
    const columnId = "27000000-0000-4000-8000-000000000002";
    psql(`insert into public.meal_plan_columns (id, user_id) values ('${columnId}', '${userB}');`);
    const entry = JSON.parse(psql(serviceSql(`
      select public.create_product_planner_entry(
        '${userB}', '${created.id}', '2026-07-20', '${columnId}', 100, 'g',
        '${created.nutrition_version_id}'
      )::text;
    `)));
    psql(`
      begin;
      set constraints all deferred;
      insert into public.food_products (
        id, owner_user_id, visibility, source_type, moderation_status, name,
        current_nutrition_version_id
      ) values (
        '26000000-0000-4000-8000-000000000011', '${userC}', 'private', 'manual',
        'visible', '탈퇴 비공개 삭제', '26000000-0000-4000-8000-000000000012'
      );
      insert into public.nutrition_profiles (
        id, profile_kind, normalization_method, basis_amount, basis_unit,
        version, review_status, is_active, created_by
      ) values (
        '26000000-0000-4000-8000-000000000013', 'product_label', 'as_labeled',
        1, 'serving', 1, 'self_reported', true, '${userC}'
      );
      insert into public.nutrition_values (
        profile_id, nutrient_code, amount, value_status
      ) values (
        '26000000-0000-4000-8000-000000000013', 'energy_kcal', 77, 'observed'
      );
      insert into public.food_product_nutrition_versions (
        id, product_id, nutrition_profile_id, version, basis_relations_json, created_by
      ) values (
        '26000000-0000-4000-8000-000000000012',
        '26000000-0000-4000-8000-000000000011',
        '26000000-0000-4000-8000-000000000013', 1, '[]'::jsonb, '${userC}'
      );
      commit;
    `);

    psql(serviceSql(`select public.delete_user_private_data('${userC}')::text;`));

    expect(psql(`
      select owner_user_id::text
      from public.food_products
      where id = '${created.id}';
    `)).toBe("");
    expect(psql(`
      select visibility || ':' || source_type
      from public.food_products
      where id = '${created.id}';
    `)).toBe("public:manual");
    expect(psql(`
      select count(*) from public.food_product_nutrition_versions version
      join public.nutrition_profiles profile on profile.id = version.nutrition_profile_id
      where version.product_id = '${created.id}'
        and version.created_by is null and profile.created_by is null;
    `)).toBe("1");
    expect(psql(`
      select product_nutrition_version_id::text from public.product_planner_entries
      where id = '${entry.id}';
    `)).toBe(created.nutrition_version_id);
    expect(psql(`
      select
        (select count(*) from public.food_products where id = '26000000-0000-4000-8000-000000000011')
        + (select count(*) from public.food_product_nutrition_versions where id = '26000000-0000-4000-8000-000000000012')
        + (select count(*) from public.nutrition_profiles where id = '26000000-0000-4000-8000-000000000013')
        + (select count(*) from public.nutrition_values where profile_id = '26000000-0000-4000-8000-000000000013');
    `)).toBe("0");
    const readonly = psqlResult(serviceSql(`
      select public.update_manual_food_product(
        '${userB}', '${created.id}', '{"brand":"침범"}'::jsonb,
        '${created.nutrition_version_id}'
      );
    `));
    expect(readonly.status).not.toBe(0);
    expect(readonly.stderr).toContain("FORBIDDEN");
  });
});
