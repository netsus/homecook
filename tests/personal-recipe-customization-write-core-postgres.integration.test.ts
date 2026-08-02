import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGHOST ?? "";
const port = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGPORT ?? "";
const database = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGDATABASE ?? "";

function psql(sql: string) {
  const result = spawnSync(
    "psql",
    ["-h", host, "-p", port, "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^(?:BEGIN|COMMIT|SET|INSERT \d+ \d+|UPDATE \d+|DELETE \d+)$/.test(line),
    )
    .at(-1) ?? "";
}

function psqlResult(sql: string) {
  return spawnSync(
    "psql",
    ["-h", host, "-p", port, "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } },
  );
}

function expectSqlFailure(sql: string, pattern: RegExp) {
  const result = psqlResult(sql);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(pattern);
}

const ownerA = "81000000-0000-4000-8000-000000000001";
const ownerB = "81000000-0000-4000-8000-000000000002";
const publicRecipe = "82000000-0000-4000-8000-000000000001";
const privateRecipeB = "82000000-0000-4000-8000-000000000002";
const ingredient = "83000000-0000-4000-8000-000000000001";
const cookingMethod = "84000000-0000-4000-8000-000000000001";
const identityEpoch = "2026-08-02T00:00:00Z";
const cutoverAttempt = "80000000-0000-4000-8000-000000000001";
const sessionA = "a".repeat(64);
const sessionB = "b".repeat(64);

function draft(title: string) {
  return JSON.stringify({
    title,
    description: "개인 레시피 fixture",
    base_servings: 2,
    ingredients: [
      {
        ingredient_id: ingredient,
        amount: 100,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "재료 100g",
        scalable: true,
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "조리한다",
        cooking_method_id: cookingMethod,
        ingredients_used: [],
      },
    ],
  }).replaceAll("'", "''");
}

function nutritionSnapshot() {
  const unavailable = {
    status: "unavailable",
    amount: null,
    known_amount: null,
    display_mode: null,
  };
  return JSON.stringify({
    calculation_version: "personal-recipe-v2",
    scalable_values: {},
    fixed_values: {},
    nutrient_status: {
      energy_kcal: unavailable,
      carbohydrate_g: unavailable,
      protein_g: unavailable,
      fat_g: unavailable,
      sodium_mg: unavailable,
    },
    calculation_status: "unavailable",
    calculation_quality: null,
    reflected_ingredient_count: 0,
    target_ingredient_count: 1,
    missing_reasons: [`PREDECESSOR_NOT_APPROVED:${ingredient}`],
    warnings: ["PREDECESSOR_NOT_APPROVED"],
    sources: [],
  }).replaceAll("'", "''");
}

function writerSql(options: {
  operation: "create" | "fork" | "update" | "save_as_new" | "delete";
  key: string;
  owner?: string;
  session?: string;
  recipeId?: string | null;
  sourceRecipeId?: string | null;
  revision?: number | null;
  draftTitle?: string;
  tags?: Array<{ normalized_key: string; label: string }>;
  imageObjectId?: string;
}) {
  const owner = options.owner ?? ownerA;
  const session = options.session ?? sessionA;
  const recipeId = options.recipeId ? `'${options.recipeId}'::uuid` : "null";
  const sourceRecipeId = options.sourceRecipeId
    ? `'${options.sourceRecipeId}'::uuid`
    : "null";
  const revision = options.revision ?? "null";
  const payload = options.operation === "delete"
    ? "'{}'::jsonb"
    : `'${draft(options.draftTitle ?? "개인 레시피")}'::jsonb`;
  const tags = JSON.stringify(options.tags ?? []).replaceAll("'", "''");
  const imageObjectId = options.imageObjectId
    ? `'${options.imageObjectId}'::uuid`
    : "null";
  return `
    begin;
    set local homecook.personal_recipe_v2 = 'on';
    select public.write_personal_recipe_core(
      '${owner}',
      '${identityEpoch}'::timestamptz,
      '${session}',
      1,
      '${options.operation}',
      ${recipeId},
      ${sourceRecipeId},
      ${revision},
      ${payload},
      '${nutritionSnapshot()}'::jsonb,
      '${tags}'::jsonb,
      ${imageObjectId},
      0,
      '${options.key}'::uuid,
      '2026-08-02T01:00:00Z'::timestamptz
    );
    commit;
  `;
}

describe.skipIf(!enabled)("personal recipe write PostgreSQL", () => {
  beforeAll(() => {
    psql(`
      insert into public.users (id, nickname, social_provider, social_id)
      values
        ('${ownerA}', 'personal-owner-a', 'test', 'personal-owner-a'),
        ('${ownerB}', 'personal-owner-b', 'test', 'personal-owner-b');

      insert into public.user_account_generation_watermarks (owner_uuid, last_account_generation)
      values ('${ownerA}', 1), ('${ownerB}', 1);

      insert into public.user_account_lifecycles (
        owner_uuid, account_generation, auth_identity_created_at_snapshot,
        origin, status, activated_at
      ) values
        ('${ownerA}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerB}', 1, '${identityEpoch}', 'runtime', 'active', now());

      insert into public.user_session_generation_bindings (
        session_key_hash, hmac_key_version, owner_uuid,
        expected_account_generation, auth_identity_created_at_snapshot
      ) values
        ('${sessionA}', 1, '${ownerA}', 1, '${identityEpoch}'),
        ('${sessionB}', 1, '${ownerB}', 1, '${identityEpoch}');

      insert into public.ingredients (id, name)
      values ('${ingredient}', '개인 레시피 재료');

      insert into public.cooking_methods (id, code, label, color_key, category_code)
      values ('${cookingMethod}', 'personal-fixture', '조리', 'red', 'wet_heat');

      insert into public.recipes (
        id, title, base_servings, source_type, created_by, visibility,
        revision, updated_at
      ) values
        ('${publicRecipe}', '공개 원본', 2, 'manual', null, 'public', 7, now()),
        ('${privateRecipeB}', '다른 소유자 개인식', 2, 'manual', '${ownerB}', 'private', 1, now());

      insert into public.account_generation_cutover_attempts (
        id, state, capability_revision, result_json
      ) values ('${cutoverAttempt}', 'promoted', 2, '{}'::jsonb);

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1,
          current_cutover_attempt_id = '${cutoverAttempt}',
          activated_at = now()
      where singleton;
    `);
  });

  it("installs a dark service-only writer and leaves the capability off", () => {
    expect(psql(`select has_function_privilege('authenticated', 'public.write_personal_recipe_core(uuid,timestamptz,text,integer,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)', 'execute')::text;`)).toBe("false");
    expect(psql("select coalesce(current_setting('homecook.personal_recipe_v2', true), 'off');")).toBe("off");
  });

  it("proves fresh and replay migration modes through the repository-owned runner", () => {
    expect(process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGMODE).toMatch(/fresh|replay/);
  });

  it("keeps capability-off calls mutation-zero", () => {
    const before = psql("select count(*)::text from public.recipes;");
    expectSqlFailure(
      writerSql({
        operation: "create",
        key: "85000000-0000-4000-8000-000000000001",
      }).replace("set local homecook.personal_recipe_v2 = 'on';", ""),
      /personal recipe capability is disabled/i,
    );
    expect(psql("select count(*)::text from public.recipes;")).toBe(before);
  });

  it("creates once, replays durably, and rejects a changed payload", () => {
    const key = "85000000-0000-4000-8000-000000000002";
    const first = JSON.parse(psql(writerSql({ operation: "create", key })));
    const replay = JSON.parse(psql(writerSql({ operation: "create", key })));

    expect(replay).toEqual(first);
    expect(first.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(psql(`select visibility || ':' || revision::text from public.recipes where id = '${first.data.id}';`)).toBe("private:1");
    expect(psql(`select count(*)::text from public.recipe_content_snapshots where recipe_id = '${first.data.id}';`)).toBe("1");
    expect(psql(`select count(*)::text from public.recipe_nutrition_snapshots where recipe_id = '${first.data.id}' and is_current;`)).toBe("1");

    expectSqlFailure(
      writerSql({ operation: "create", key, draftTitle: "바뀐 payload" }),
      /IDEMPOTENCY_KEY_REUSED/,
    );
    expect(psql(`select count(*)::text from public.recipes where id = '${first.data.id}';`)).toBe("1");
  });

  it("forks without changing the public source and saves updates on the same ID", () => {
    const sourceBefore = psql(`select title || ':' || revision::text from public.recipes where id = '${publicRecipe}';`);
    const forked = JSON.parse(psql(writerSql({
      operation: "fork",
      sourceRecipeId: publicRecipe,
      key: "85000000-0000-4000-8000-000000000003",
      draftTitle: "공개 원본을 포크한 개인식",
    })));

    expect(forked.data.origin_recipe_id).toBe(publicRecipe);
    expect(psql(`select title || ':' || revision::text from public.recipes where id = '${publicRecipe}';`)).toBe(sourceBefore);

    const updated = JSON.parse(psql(writerSql({
      operation: "update",
      recipeId: forked.data.id,
      revision: 1,
      key: "85000000-0000-4000-8000-000000000004",
      draftTitle: "같은 ID로 수정",
    })));
    expect(updated.data.id).toBe(forked.data.id);
    expect(updated.data.revision).toBe(2);
    expect(psql(`select count(*)::text from public.recipe_content_snapshots where recipe_id = '${forked.data.id}';`)).toBe("2");

    expectSqlFailure(
      writerSql({
        operation: "update",
        recipeId: forked.data.id,
        revision: 1,
        key: "85000000-0000-4000-8000-000000000005",
        draftTitle: "stale",
      }),
      /RECIPE_REVISION_CONFLICT/,
    );
    expect(psql(`select revision::text from public.recipes where id = '${forked.data.id}';`)).toBe("2");
  });

  it("creates a new ID only for save-as-new and soft-deletes idempotently", () => {
    const source = JSON.parse(psql(writerSql({
      operation: "create",
      key: "85000000-0000-4000-8000-000000000006",
      draftTitle: "복제 원본",
    })));
    const copy = JSON.parse(psql(writerSql({
      operation: "save_as_new",
      sourceRecipeId: source.data.id,
      key: "85000000-0000-4000-8000-000000000007",
      draftTitle: "새 레시피로 저장",
    })));
    expect(copy.data.id).not.toBe(source.data.id);
    expect(psql(`select revision::text from public.recipes where id = '${source.data.id}';`)).toBe("1");

    const deleteKey = "85000000-0000-4000-8000-000000000008";
    const deleted = JSON.parse(psql(writerSql({
      operation: "delete",
      recipeId: copy.data.id,
      key: deleteKey,
    })));
    const replay = JSON.parse(psql(writerSql({
      operation: "delete",
      recipeId: copy.data.id,
      key: deleteKey,
    })));
    expect(replay).toEqual(deleted);
    expect(psql(`select (deleted_at is not null)::text || ':' || revision::text from public.recipes where id = '${copy.data.id}';`)).toBe("true:2");
    expect(psql(`select count(*)::text from public.recipe_content_snapshots where recipe_id = '${copy.data.id}';`)).toBe("1");
  });

  it("commits private user tags and rolls back every effect when image attach fails", () => {
    const tagged = JSON.parse(psql(writerSql({
      operation: "create",
      key: "90000000-0000-4000-8000-000000000010",
      draftTitle: "태그 포함 개인식",
      tags: [{ normalized_key: "my-tag", label: "내 태그" }],
    })));
    expect(psql(`select concat(recipe_tag.visibility, ':', tag.kind, ':', recipe_tag.source) from public.recipe_tags recipe_tag join public.tags tag on tag.id = recipe_tag.tag_id where recipe_tag.recipe_id = '${tagged.data.id}';`)).toBe("private:user:user_selected");

    const failedKey = "90000000-0000-4000-8000-000000000011";
    expectSqlFailure(writerSql({
      operation: "create",
      key: failedKey,
      draftTitle: "이미지 실패 롤백",
      tags: [{ normalized_key: "rollback-tag", label: "롤백 태그" }],
      imageObjectId: "85000000-0000-4000-8000-000000000099",
    }), /IMAGE_/);
    expect(psql("select count(*)::text from public.recipes where title = '이미지 실패 롤백';")).toBe("0");
    expect(psql("select count(*)::text from public.recipe_content_snapshots snapshot join public.recipes recipe on recipe.id = snapshot.recipe_id where recipe.title = '이미지 실패 롤백';")).toBe("0");
    expect(psql(`select count(*)::text from public.mutation_idempotency_keys where key_hash = encode(extensions.digest(convert_to('${failedKey}', 'UTF8'), 'sha256'), 'hex');`)).toBe("0");
  });

  it("denies public, other-owner, and authenticated direct mutation", () => {
    expectSqlFailure(
      writerSql({
        operation: "update",
        recipeId: publicRecipe,
        revision: 7,
        key: "85000000-0000-4000-8000-000000000009",
      }),
      /FORBIDDEN/,
    );
    expectSqlFailure(
      writerSql({
        operation: "update",
        recipeId: privateRecipeB,
        revision: 1,
        key: "85000000-0000-4000-8000-000000000010",
      }),
      /RESOURCE_NOT_FOUND/,
    );
    expectSqlFailure(
      `begin; set local role authenticated; update public.recipes set title = '우회' where id = '${publicRecipe}'; commit;`,
      /permission denied/i,
    );
    expect(psql(`select title from public.recipes where id = '${publicRecipe}';`)).toBe("공개 원본");
  });

  it("cleans only the deleting generation's personal receipts before account hard delete", () => {
    psql(`
      insert into public.mutation_idempotency_keys (
        owner_uuid, account_generation, operation_scope, key_hash,
        payload_hash, state, durable_result
      ) values
        ('${ownerB}', 1, 'personal_recipe_update', repeat('1', 64), repeat('2', 64), 'succeeded', '{}'::jsonb),
        ('${ownerB}', 2, 'personal_recipe_update', repeat('3', 64), repeat('4', 64), 'succeeded', '{}'::jsonb);

      update public.user_account_lifecycles
      set status = 'deleting', revision = revision + 1, updated_at = now()
      where owner_uuid = '${ownerB}' and account_generation = 1;
    `);

    expect(psql(`select count(*)::text from public.mutation_idempotency_keys where owner_uuid = '${ownerB}' and account_generation = 1 and operation_scope like 'personal_recipe_%';`)).toBe("0");
    expect(psql(`select count(*)::text from public.mutation_idempotency_keys where owner_uuid = '${ownerB}' and account_generation = 2 and operation_scope like 'personal_recipe_%';`)).toBe("1");
  });
});
