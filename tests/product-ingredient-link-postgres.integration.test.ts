import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled =
  process.env.HOMECOOK_PRODUCT_LINK_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_PRODUCT_LINK_PGHOST ?? "";
const port = process.env.HOMECOOK_PRODUCT_LINK_PGPORT ?? "";
const database = process.env.HOMECOOK_PRODUCT_LINK_PGDATABASE ?? "";
const databaseMode = process.env.HOMECOOK_PRODUCT_LINK_PGMODE ?? "";
const replaySeedProductName =
  process.env.HOMECOOK_PRODUCT_LINK_REPLAY_SEED_NAME ?? "";

const ownerA = "14000000-0000-4000-8000-000000000001";
const ownerB = "14000000-0000-4000-8000-000000000002";

function psqlResult(sql: string) {
  return spawnSync(
    "psql",
    [
      "-h",
      host,
      "-p",
      port,
      "-U",
      "postgres",
      "-d",
      database,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
    },
  );
}

function psql(sql: string): string {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0
        && !/^(?:BEGIN|COMMIT|DELETE \d+|INSERT \d+ \d+|SELECT \d+|SET|UPDATE \d+)$/
          .test(line),
    )
    .at(-1) ?? "";
}

function psqlAsync(sql: string): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "psql",
      [
        "-h",
        host,
        "-p",
        port,
        "-U",
        "postgres",
        "-d",
        database,
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ],
      { env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function waitForPgSleep(applicationName: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sleeping = psql(`
      select exists (
        select 1
        from pg_catalog.pg_stat_activity
        where application_name = '${applicationName}'
          and wait_event = 'PgSleep'
      )::text;
    `);

    if (sleeping === "true") {
      return;
    }
  }

  throw new Error(`Timed out waiting for ${applicationName} to enter pg_sleep`);
}

function expectSqlFailure(sql: string, pattern: RegExp) {
  const result = psqlResult(sql);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(pattern);
}

function serviceSql(sql: string) {
  return `set role service_role; set request.jwt.claim.role = 'service_role'; ${sql}`;
}

function authenticatedSql(userId: string, sql: string) {
  return `set role authenticated; set request.jwt.claim.sub = '${userId}'; set request.jwt.claim.role = 'authenticated'; ${sql}`;
}

function untrustedRoleSql(role: "anon" | "public_probe", sql: string) {
  const claimRole = role === "anon" ? "anon" : "";
  return `set role ${role}; set request.jwt.claim.role = '${claimRole}'; ${sql}`;
}

function jsonSql(value: unknown) {
  const encoded = Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  return `convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb`;
}

function createIngredient(label: string) {
  const ingredientId = randomUUID();
  psql(serviceSql(`
    insert into public.ingredients (id, standard_name, category, default_unit)
    values (
      '${ingredientId}',
      'product-link:${label}:${ingredientId}',
      '기타',
      'g'
    );
  `));
  return ingredientId;
}

function createManualProduct(userId: string, label: string) {
  return JSON.parse(psql(serviceSql(`
    select public.create_manual_food_product(
      '${userId}',
      'product-link:${label}:${randomUUID()}',
      'brand:${label}',
      ${jsonSql({
        basis: { amount: 100, unit: "g" },
        values: {
          energy_kcal: 120,
          carbohydrate_g: 10,
          protein_g: 8,
          fat_g: 3,
          sodium_mg: 40,
        },
      })}
    )::text;
  `))) as { id: string; nutrition_version_id: string };
}

function createPrivateProduct(userId: string, label: string) {
  const productId = randomUUID();
  const profileId = randomUUID();
  const versionId = randomUUID();
  psql(`
    begin;
    set constraints food_products_current_version_fk deferred;
    insert into public.food_products (
      id,
      owner_user_id,
      visibility,
      source_type,
      moderation_status,
      name,
      brand,
      external_product_key,
      current_nutrition_version_id
    ) values (
      '${productId}',
      '${userId}',
      'private',
      'manual',
      'visible',
      'product-link:${label}:${productId}',
      'brand:${label}',
      null,
      '${versionId}'
    );
    insert into public.nutrition_profiles (
      id,
      source_item_id,
      profile_kind,
      normalization_method,
      basis_amount,
      basis_unit,
      version,
      review_status,
      is_active,
      created_by
    ) values (
      '${profileId}',
      null,
      'product_label',
      'as_labeled',
      100,
      'g',
      1,
      'self_reported',
      true,
      '${userId}'
    );
    select public.insert_manual_food_product_values(
      '${profileId}',
      '{"energy_kcal":120,"carbohydrate_g":10,"protein_g":8,"fat_g":3,"sodium_mg":40}'::jsonb
    );
    insert into public.food_product_nutrition_versions (
      id,
      product_id,
      nutrition_profile_id,
      version,
      label_basis_text,
      basis_relations_json,
      source_item_id,
      created_by
    ) values (
      '${versionId}',
      '${productId}',
      '${profileId}',
      1,
      null,
      '[]'::jsonb,
      null,
      '${userId}'
    );
    commit;
  `);
  return { id: productId, nutrition_version_id: versionId };
}

function createCandidate(options: {
  ingredientId: string;
  productId: string;
  provenance?: Record<string, unknown>;
  relation?: "represents" | "contains" | "substitute";
}) {
  return psql(serviceSql(`
    select public.create_food_product_ingredient_link_candidate(
      '${options.productId}',
      '${options.ingredientId}',
      '${options.relation ?? "represents"}',
      'integration-fixture',
      ${jsonSql(
        options.provenance ?? {
          algorithm_version: `integration-${databaseMode}`,
          candidate_rank: 1,
          evidence_codes: ["fixture"],
        },
      )}
    )::text;
  `));
}

function createShoppingMealFixture(
  userId: string,
  label: string,
  ingredientId?: string,
) {
  const recipeId = randomUUID();
  const columnId = randomUUID();
  const mealId = randomUUID();
  const columnSortOrder = Number.parseInt(columnId.slice(0, 6), 16);

  psql(serviceSql(`
    insert into public.user_account_lifecycles (
      owner_uuid,
      account_generation,
      status
    )
    select
      '${userId}',
      coalesce(max(account_generation), 0) + 1,
      'active'
    from public.user_account_lifecycles
    where owner_uuid = '${userId}';
    insert into public.recipes (
      id,
      title,
      base_servings,
      source_type,
      created_by,
      visibility
    ) values (
      '${recipeId}',
      'shopping-rpc:${label}',
      2,
      'manual',
      '${userId}',
      'private'
    );
    insert into public.meal_plan_columns (
      id,
      user_id,
      name,
      sort_order
    ) values (
      '${columnId}',
      '${userId}',
      'rpc:${label.slice(0, 20)}',
      ${columnSortOrder}
    );
    ${ingredientId ? `
      insert into public.recipe_ingredients (
        recipe_id,
        ingredient_id,
        amount,
        unit,
        ingredient_type,
        display_text,
        scalable
      ) values (
        '${recipeId}',
        '${ingredientId}',
        1,
        'g',
        'QUANT',
        'shopping fixture ingredient',
        true
      );
    ` : ""}
    insert into public.meals (
      id,
      user_id,
      recipe_id,
      plan_date,
      column_id,
      planned_servings
    ) values (
      '${mealId}',
      '${userId}',
      '${recipeId}',
      current_date,
      '${columnId}',
      2
    );
  `));

  return { recipeId, columnId, mealId };
}

function shoppingCreateCall(options: {
  userId: string;
  title: string;
  mealIds?: string[];
  splitRemainders?: unknown[];
  splitOriginals?: unknown[];
  recipeRows?: unknown[];
  itemRows?: unknown[];
}) {
  return `
    select public.create_shopping_list_from_payload(
      '${options.userId}',
      '${options.title}',
      current_date,
      current_date,
      false,
      array[${(options.mealIds ?? []).map((id) => `'${id}'::uuid`).join(",")}],
      ${jsonSql(options.splitRemainders ?? [])},
      ${jsonSql(options.splitOriginals ?? [])},
      ${jsonSql(options.recipeRows ?? [])},
      ${jsonSql(options.itemRows ?? [])},
      0
    )::text;
  `;
}

function selectEffectiveIngredient(productId: string, requestingUserId = ownerA) {
  return psql(serviceSql(`
    select coalesce(
      public.select_food_product_effective_ingredient(
        '${productId}',
        '${requestingUserId}'
      )::text,
      'null'
    );
  `));
}

describe.runIf(enabled)(
  "product ingredient link isolated PostgreSQL integration",
  () => {
    beforeAll(() => {
      expect(host).toBe("127.0.0.1");
      expect(port).not.toBe("");
      expect(port).not.toBe("5432");
      expect(database).toMatch(/^homecook_product_link_(fresh|replay)$/);
      expect(["fresh", "replay"]).toContain(databaseMode);

      psql(`
        insert into public.users (id, nickname, social_provider, social_id)
        values
          ('${ownerA}', 'product-link-a', 'google', 'product-link-a'),
          ('${ownerB}', 'product-link-b', 'google', 'product-link-b')
        on conflict (id) do nothing;
      `);
    });

    it("applies the target migration on both fresh and replay databases", () => {
      expect(psql(`
        select to_regclass('public.food_product_ingredient_links')::text;
      `)).toBe("food_product_ingredient_links");

      if (databaseMode === "replay") {
        expect(psql(`
          select count(*)::text
          from public.food_products
          where name = '${replaySeedProductName}';
        `)).toBe("1");
      }
    });

    it("fails closed until an approved active primary represents link exists", () => {
      const ingredientId = createIngredient("fail-closed");
      const product = createManualProduct(ownerA, "fail-closed");

      expect(selectEffectiveIngredient(product.id)).toBe("null");

      const containsCandidateId = createCandidate({
        productId: product.id,
        ingredientId,
        relation: "contains",
      });
      psql(serviceSql(`
        select public.promote_food_product_ingredient_link(
          '${containsCandidateId}',
          null,
          'reviewed non-representative relation'
        );
      `));
      expect(selectEffectiveIngredient(product.id)).toBe("null");

      createCandidate({
        productId: product.id,
        ingredientId,
        relation: "represents",
      });
      expect(selectEffectiveIngredient(product.id)).toBe("null");
    });

    it("allows only service_role to promote and denies normal-role DML", () => {
      const ingredientId = createIngredient("acl");
      const product = createPrivateProduct(ownerA, "acl");
      const candidateId = createCandidate({
        productId: product.id,
        ingredientId,
      });

      expectSqlFailure(
        authenticatedSql(
          ownerA,
          `select public.promote_food_product_ingredient_link('${candidateId}', null, 'nope');`,
        ),
        /permission denied|42501/i,
      );
      expectSqlFailure(
        authenticatedSql(
          ownerA,
          `
            insert into public.food_product_ingredient_links (
              product_id, ingredient_id, relation, review_status, is_primary, is_active, source
            ) values (
              '${product.id}', '${ingredientId}', 'represents', 'pending', false, false, 'user-attempt'
            );
          `,
        ),
        /permission denied/i,
      );
      expectSqlFailure(
        serviceSql(`
          select public.create_food_product_ingredient_link_candidate(
            '${product.id}',
            '${ingredientId}',
            'represents',
            'integration-fixture',
            '{"nested":{"email":"must-not-persist@example.test"}}'::jsonb
          );
        `),
        /provenance contains an unsupported key or value/i,
      );
      expectSqlFailure(
        serviceSql(`
          select public.create_food_product_ingredient_link_candidate(
            '${product.id}',
            '${ingredientId}',
            'represents',
            'integration-fixture',
            '{"authorization":"Bearer must-not-persist"}'::jsonb
          );
        `),
        /provenance contains an unsupported key or value/i,
      );

      psql(serviceSql(`
        select public.promote_food_product_ingredient_link(
          '${candidateId}',
          null,
          'human approved representative ingredient'
        );
      `));
      expect(selectEffectiveIngredient(product.id)).toBe(ingredientId);
      expect(selectEffectiveIngredient(product.id, ownerB)).toBe("null");
      expect(psql(`
        select review_status || '|' || is_active::text || '|' || is_primary::text
        from public.food_product_ingredient_links
        where id = '${candidateId}';
      `)).toBe("approved|true|true");
    });

    it("denies PUBLIC/anon/authenticated and locks function owner plus search_path", () => {
      const product = createManualProduct(ownerA, "negative-matrix");
      const ingredientId = createIngredient("negative-matrix");
      const candidateId = createCandidate({
        productId: product.id,
        ingredientId,
      });

      for (const role of ["anon", "public_probe"] as const) {
        expectSqlFailure(
          untrustedRoleSql(
            role,
            `select public.select_food_product_effective_ingredient('${product.id}', '${ownerA}');`,
          ),
          /permission denied/i,
        );
        expectSqlFailure(
          untrustedRoleSql(
            role,
            `select public.promote_food_product_ingredient_link('${candidateId}', null, 'denied');`,
          ),
          /permission denied/i,
        );
        expectSqlFailure(
          untrustedRoleSql(
            role,
            `select * from public.food_product_ingredient_links where product_id = '${product.id}';`,
          ),
          /permission denied/i,
        );
      }

      expectSqlFailure(
        authenticatedSql(
          ownerA,
          `select public.select_food_product_effective_ingredient('${product.id}', '${ownerA}');`,
        ),
        /permission denied/i,
      );

      expect(psql(`
        select bool_and(
          not has_function_privilege(role_name, signature, 'EXECUTE')
        )::text
        from (
          values
            ('anon', 'public.create_food_product_ingredient_link_candidate(uuid, uuid, text, text, jsonb)'),
            ('authenticated', 'public.create_food_product_ingredient_link_candidate(uuid, uuid, text, text, jsonb)'),
            ('public_probe', 'public.create_food_product_ingredient_link_candidate(uuid, uuid, text, text, jsonb)'),
            ('anon', 'public.select_food_product_effective_ingredient(uuid, uuid)'),
            ('authenticated', 'public.select_food_product_effective_ingredient(uuid, uuid)'),
            ('public_probe', 'public.select_food_product_effective_ingredient(uuid, uuid)'),
            ('anon', 'public.promote_food_product_ingredient_link(uuid, uuid, text)'),
            ('authenticated', 'public.promote_food_product_ingredient_link(uuid, uuid, text)'),
            ('public_probe', 'public.promote_food_product_ingredient_link(uuid, uuid, text)')
        ) denied(role_name, signature);
      `)).toBe("true");
      expect(psql(`
        select bool_and(
          not has_table_privilege(
            role_name,
            'public.food_product_ingredient_links',
            privilege_name
          )
        )::text
        from (
          values
            ('anon', 'SELECT'), ('anon', 'INSERT'),
            ('anon', 'UPDATE'), ('anon', 'DELETE'),
            ('authenticated', 'SELECT'), ('authenticated', 'INSERT'),
            ('authenticated', 'UPDATE'), ('authenticated', 'DELETE'),
            ('public_probe', 'SELECT'), ('public_probe', 'INSERT'),
            ('public_probe', 'UPDATE'), ('public_probe', 'DELETE'),
            ('service_role', 'SELECT'), ('service_role', 'INSERT'),
            ('service_role', 'UPDATE'), ('service_role', 'DELETE')
        ) denied(role_name, privilege_name);
      `)).toBe("true");
      expect(psql(`
        select bool_and(
          owner_role = 'postgres'
          and function_config @> array['search_path=pg_catalog, public, pg_temp']
        )::text
        from (
          select
            function.proowner::regrole::text as owner_role,
            coalesce(function.proconfig, array[]::text[]) as function_config
          from pg_proc as function
          join pg_namespace as namespace on namespace.oid = function.pronamespace
          where namespace.nspname = 'public'
            and function.proname in (
              'create_food_product_ingredient_link_candidate',
              'select_food_product_effective_ingredient',
              'promote_food_product_ingredient_link'
            )
        ) locked_functions;
      `)).toBe("true");
    });

    it("keeps at most one winner under concurrent primary promotion", async () => {
      const product = createManualProduct(ownerA, "concurrent");
      const ingredientA = createIngredient("concurrent-a");
      const ingredientB = createIngredient("concurrent-b");
      const candidateA = createCandidate({
        productId: product.id,
        ingredientId: ingredientA,
      });
      const candidateB = createCandidate({
        productId: product.id,
        ingredientId: ingredientB,
      });

      const winner = psqlAsync(serviceSql(`
        begin;
        select public.promote_food_product_ingredient_link(
          '${candidateA}',
          null,
          'winner'
        );
        select pg_sleep(1);
        commit;
      `));

      await new Promise((resolve) => setTimeout(resolve, 100));

      const loser = psqlAsync(serviceSql(`
        begin;
        select public.promote_food_product_ingredient_link(
          '${candidateB}',
          null,
          'loser'
        );
        commit;
      `));

      const [winnerResult, loserResult] = await Promise.all([winner, loser]);
      const results = [winnerResult, loserResult];
      const successCount = results.filter((result) => result.status === 0).length;
      const failureCount = results.filter((result) => result.status !== 0).length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);
      expect(
        results.some((result) =>
          /authority changed during promotion|serialization/i.test(result.stderr)
        ),
      ).toBe(true);
      expect(psql(`
        select count(*)::text
        from public.food_product_ingredient_links
        where product_id = '${product.id}'
          and relation = 'represents'
          and review_status = 'approved'
          and is_primary
          and is_active;
      `)).toBe("1");
    }, 10_000);

    it("enforces exact pantry and shopping provenance constraints", () => {
      const ingredientId = createIngredient("exact-identity");
      const product = createPrivateProduct(ownerA, "exact-identity");
      const listId = randomUUID();

      psql(serviceSql(`
        insert into public.shopping_lists (
          id, user_id, title, date_range_start, date_range_end
        ) values (
          '${listId}', '${ownerA}', 'exact identity', current_date, current_date
        );
      `));

      expectSqlFailure(serviceSql(`
        insert into public.pantry_items (
          user_id, ingredient_id, food_product_id, food_product_nutrition_version_id
        ) values (
          '${ownerA}', '${ingredientId}', '${product.id}', '${product.nutrition_version_id}'
        );
      `), /pantry_items_identity_xor_check/i);

      expectSqlFailure(serviceSql(`
        insert into public.pantry_items (user_id, food_product_id)
        values ('${ownerA}', '${product.id}');
      `), /pantry_items_identity_xor_check/i);

      expectSqlFailure(serviceSql(`
        insert into public.pantry_items (
          user_id, food_product_id, food_product_nutrition_version_id
        ) values (
          '${ownerA}', '${product.id}', '${randomUUID()}'
        );
      `), /pantry_items_product_version_fkey|foreign key/i);

      psql(serviceSql(`
        insert into public.pantry_items (
          user_id, food_product_id, food_product_nutrition_version_id
        ) values (
          '${ownerA}', '${product.id}', '${product.nutrition_version_id}'
        );
      `));
      expectSqlFailure(serviceSql(`
        insert into public.pantry_items (
          user_id, food_product_id, food_product_nutrition_version_id
        ) values (
          '${ownerA}', '${product.id}', '${product.nutrition_version_id}'
        );
      `), /pantry_items_user_product_version_unique|duplicate key/i);

      expectSqlFailure(serviceSql(`
        insert into public.shopping_list_items (
          shopping_list_id,
          ingredient_id,
          food_product_id,
          food_product_nutrition_version_id,
          display_text,
          amounts_json
        ) values (
          '${listId}',
          '${ingredientId}',
          '${product.id}',
          '${product.nutrition_version_id}',
          'invalid dual',
          '[]'::jsonb
        );
      `), /shopping_list_items_identity_xor_check/i);

      expectSqlFailure(serviceSql(`
        insert into public.shopping_list_items (
          shopping_list_id,
          display_text,
          amounts_json
        ) values (
          '${listId}',
          'new all-null provenance is forbidden',
          '[]'::jsonb
        );
      `), /shopping_list_items_identity_xor_check/i);

      psql(serviceSql(`
        insert into public.shopping_list_items (
          shopping_list_id,
          food_product_id,
          food_product_nutrition_version_id,
          display_text,
          amounts_json
        ) values (
          '${listId}',
          '${product.id}',
          '${product.nutrition_version_id}',
          'pinned product',
          '[]'::jsonb
        );
      `));

      expectSqlFailure(serviceSql(`
        delete from public.food_product_nutrition_versions
        where id = '${product.nutrition_version_id}';
      `), /permission denied|IMMUTABLE_PRODUCT_NUTRITION_VERSION|violates foreign key/i);
    });

    it("projects distinct generic plus approved product links for authenticated self only", () => {
      const ingredientId = createIngredient("effective-reader");
      const product = createPrivateProduct(ownerA, "effective-reader");
      const candidateId = createCandidate({
        productId: product.id,
        ingredientId,
      });

      psql(serviceSql(`
        select public.promote_food_product_ingredient_link(
          '${candidateId}', null, 'reader fixture'
        );
        insert into public.pantry_items (user_id, ingredient_id)
        values ('${ownerA}', '${ingredientId}');
        insert into public.pantry_items (
          user_id, food_product_id, food_product_nutrition_version_id
        ) values (
          '${ownerA}', '${product.id}', '${product.nutrition_version_id}'
        );
      `));

      expect(psql(authenticatedSql(ownerA, `
        select count(*)::text
        from public.select_pantry_effective_ingredients('${ownerA}')
        where ingredient_id = '${ingredientId}';
      `))).toBe("1");
      expect(psql(authenticatedSql(ownerB, `
        select count(*)::text
        from public.select_pantry_effective_ingredients('${ownerA}');
      `))).toBe("0");
      expectSqlFailure(serviceSql(`
        select * from public.select_pantry_effective_ingredients('${ownerA}');
      `), /permission denied/i);
    });

    it("records the reader support indexes without claiming a production query plan", () => {
      const indexNames = psql(`
        select string_agg(indexname, ',' order by indexname)
        from pg_catalog.pg_indexes
        where schemaname = 'public'
          and indexname in (
            'pantry_items_user_ingredient_idx',
            'pantry_items_user_ingredient_unique',
            'pantry_items_user_product_lookup_idx',
            'food_product_ingredient_links_product_idx',
            'food_product_ingredient_links_primary_represents_idx'
          );
      `);

      expect(indexNames).toContain("pantry_items_user_ingredient_unique");
      expect(indexNames).toContain("pantry_items_user_product_lookup_idx");
      expect(indexNames).toContain("food_product_ingredient_links_product_idx");
      expect(indexNames).toContain(
        "food_product_ingredient_links_primary_represents_idx",
      );
    });

    it("excludes hidden products and non-public owners from the effective reader", () => {
      const ingredientId = createIngredient("reader-visibility");
      const product = createManualProduct(ownerA, "reader-visibility");
      const candidateId = createCandidate({
        ingredientId,
        productId: product.id,
      });

      psql(serviceSql(`
        select public.promote_food_product_ingredient_link(
          '${candidateId}',
          null,
          'visibility fixture'
        );
        insert into public.pantry_items (
          user_id,
          food_product_id,
          food_product_nutrition_version_id
        ) values (
          '${ownerA}',
          '${product.id}',
          '${product.nutrition_version_id}'
        );
      `));

      expect(psql(authenticatedSql(ownerA, `
        select count(*)::text
        from public.select_pantry_effective_ingredients('${ownerA}')
        where ingredient_id = '${ingredientId}';
      `))).toBe("1");

      psql(serviceSql(`
        update public.food_products
        set moderation_status = 'hidden_by_operator'
        where id = '${product.id}';
      `));
      expect(psql(authenticatedSql(ownerA, `
        select count(*)::text
        from public.select_pantry_effective_ingredients('${ownerA}')
        where ingredient_id = '${ingredientId}';
      `))).toBe("0");

      psql(serviceSql(`
        update public.food_products
        set moderation_status = 'visible'
        where id = '${product.id}';
        insert into public.user_account_lifecycles (
          owner_uuid,
          account_generation,
          status
        ) values ('${ownerA}', 1, 'quarantined');
      `));
      expect(psql(authenticatedSql(ownerA, `
        select count(*)::text
        from public.select_pantry_effective_ingredients('${ownerA}')
        where ingredient_id = '${ingredientId}';
      `))).toBe("0");
    });

    it("denies auth-null and service-role direct shopping mutations", () => {
      const createCall = `
        select public.create_shopping_list_from_payload(
          '${ownerA}',
          'authorization fixture',
          current_date,
          current_date,
          true,
          '{}'::uuid[]
        )::text;
      `;
      expect(JSON.parse(psql(createCall))).toMatchObject({
        error_code: "FORBIDDEN",
      });
      expectSqlFailure(serviceSql(createCall), /permission denied/i);

      const completeCall = `
        select public.complete_shopping_list(
          gen_random_uuid(),
          '${ownerA}',
          null
        )::text;
      `;
      expect(JSON.parse(psql(completeCall))).toMatchObject({
        error_code: "FORBIDDEN",
      });
      expectSqlFailure(serviceSql(completeCall), /permission denied/i);
    });

    it("rejects cross-owner create payloads before any shopping or meal write", () => {
      const attackerMeal = createShoppingMealFixture(ownerA, `attacker-${randomUUID()}`);
      const victimMeal = createShoppingMealFixture(ownerB, `victim-${randomUUID()}`);
      const hiddenProduct = createManualProduct(ownerB, "create-owner-boundary");

      psql(serviceSql(`
        update public.food_products
        set moderation_status = 'hidden_by_operator'
        where id = '${hiddenProduct.id}';
      `));

      const maliciousTitle = `owner-boundary:${randomUUID()}`;
      const result = JSON.parse(psql(authenticatedSql(ownerA, shoppingCreateCall({
        userId: ownerA,
        title: maliciousTitle,
        mealIds: [attackerMeal.mealId],
        splitRemainders: [{
          user_id: ownerB,
          recipe_id: victimMeal.recipeId,
          plan_date: "2026-07-31",
          column_id: victimMeal.columnId,
          planned_servings: 1,
          is_leftover: false,
        }],
        splitOriginals: [{
          meal_id: attackerMeal.mealId,
          planned_servings: 1,
        }],
        recipeRows: [{
          recipe_id: victimMeal.recipeId,
          shopping_servings: 1,
          planned_servings_total: 1,
        }],
        itemRows: [{
          ingredient_id: null,
          food_product_id: hiddenProduct.id,
          food_product_nutrition_version_id: hiddenProduct.nutrition_version_id,
          display_text: "hidden victim product",
          amounts_json: [],
          is_pantry_excluded: false,
          sort_order: 0,
        }],
      }))));

      expect(result).toMatchObject({ error_code: expect.any(String) });
      expect(psql(serviceSql(`
        select count(*)::text
        from public.shopping_lists
        where title = '${maliciousTitle}';
      `))).toBe("0");
      expect(psql(serviceSql(`
        select count(*)::text
        from public.meals
        where id <> '${victimMeal.mealId}'
          and user_id = '${ownerB}'
          and recipe_id = '${victimMeal.recipeId}';
      `))).toBe("0");
      expect(psql(serviceSql(`
        select count(*)::text
        from public.meals
        where user_id = '${ownerA}'
          and column_id = '${victimMeal.columnId}';
      `))).toBe("0");
      expect(psql(serviceSql(`
        select count(*)::text
        from public.shopping_list_items as item
        join public.shopping_lists as list
          on list.id = item.shopping_list_id
        where list.title = '${maliciousTitle}'
          and item.food_product_id = '${hiddenProduct.id}';
      `))).toBe("0");
      expect(psql(serviceSql(`
        select count(*)::text
        from public.shopping_list_recipes as list_recipe
        join public.shopping_lists as list
          on list.id = list_recipe.shopping_list_id
        where list.title = '${maliciousTitle}'
          and list_recipe.recipe_id = '${victimMeal.recipeId}';
      `))).toBe("0");
    });

    it("independently rejects foreign remainder, column, recipe, and product inputs with zero writes", () => {
      const ingredientId = createIngredient("create-isolated-boundaries");
      const attackerMeal = createShoppingMealFixture(
        ownerA,
        `isolated-a-${randomUUID()}`,
        ingredientId,
      );
      const victimMeal = createShoppingMealFixture(ownerB, `isolated-b-${randomUUID()}`);

      const recipeRows = [{
        recipe_id: attackerMeal.recipeId,
        shopping_servings: 1,
        planned_servings_total: 2,
      }];
      const genericItems = [{
        ingredient_id: ingredientId,
        food_product_id: null,
        food_product_nutrition_version_id: null,
        display_text: "isolated ingredient",
        amounts_json: [],
        is_pantry_excluded: false,
        sort_order: 0,
      }];
      const splitOriginals = [{
        meal_id: attackerMeal.mealId,
        planned_servings: 1,
      }];
      const baseRemainder = {
        user_id: ownerA,
        recipe_id: attackerMeal.recipeId,
        plan_date: "2026-07-31",
        column_id: attackerMeal.columnId,
        planned_servings: 1,
        is_leftover: false,
      };

      const boundaryCalls = [
        {
          title: `foreign-user:${randomUUID()}`,
          call: shoppingCreateCall({
            userId: ownerA,
            title: `foreign-user:${randomUUID()}`,
            mealIds: [attackerMeal.mealId],
            splitRemainders: [{ ...baseRemainder, user_id: ownerB }],
            splitOriginals,
            recipeRows,
            itemRows: genericItems,
          }),
        },
        {
          title: `foreign-column:${randomUUID()}`,
          call: shoppingCreateCall({
            userId: ownerA,
            title: `foreign-column:${randomUUID()}`,
            mealIds: [attackerMeal.mealId],
            splitRemainders: [{
              ...baseRemainder,
              column_id: victimMeal.columnId,
            }],
            splitOriginals,
            recipeRows,
            itemRows: genericItems,
          }),
        },
        {
          title: `foreign-recipe:${randomUUID()}`,
          call: shoppingCreateCall({
            userId: ownerA,
            title: `foreign-recipe:${randomUUID()}`,
            mealIds: [attackerMeal.mealId],
            recipeRows: [{
              recipe_id: victimMeal.recipeId,
              shopping_servings: 1,
              planned_servings_total: 2,
            }],
            itemRows: genericItems,
          }),
        },
      ];

      for (const boundary of boundaryCalls) {
        const result = JSON.parse(psql(authenticatedSql(ownerA, boundary.call)));
        expect(result).toMatchObject({ error_code: expect.any(String) });
      }

      const privateProduct = createPrivateProduct(ownerB, "create-private-input");
      const hiddenProduct = createManualProduct(ownerB, "create-hidden-input");
      psql(serviceSql(`
        update public.food_products
        set moderation_status = 'hidden_by_operator'
        where id = '${hiddenProduct.id}';
      `));

      for (const [label, product] of [
        ["private", privateProduct],
        ["hidden", hiddenProduct],
      ] as const) {
        const snapshotId = randomUUID();
        const title = `${label}-product:${randomUUID()}`;
        psql(`
          begin;
          insert into public.recipe_content_snapshots (
            id,
            owner_user_id,
            recipe_id,
            title,
            base_servings,
            ingredients_json,
            steps_json,
            content_hash
          ) values (
            '${snapshotId}',
            '${ownerA}',
            '${attackerMeal.recipeId}',
            '${label} product snapshot',
            2,
            ${jsonSql([{
              ingredient_id: null,
              food_product_id: product.id,
              food_product_nutrition_version_id:
                product.nutrition_version_id,
              display_text: `${label} product`,
            }])},
            '[]'::jsonb,
            '${randomUUID()}'
          );
          set session_replication_role = replica;
          delete from public.meals
          where id = '${attackerMeal.mealId}';
          insert into public.meals (
            id,
            user_id,
            recipe_id,
            plan_date,
            column_id,
            planned_servings
          ) values (
            '${attackerMeal.mealId}',
            '${ownerA}',
            '${attackerMeal.recipeId}',
            current_date,
            '${attackerMeal.columnId}',
            2
          );
          set session_replication_role = origin;
          select set_config(
            'homecook.recipe_content_backfill',
            'on',
            true
          );
          update public.meals
          set recipe_content_snapshot_id = '${snapshotId}',
              recipe_content_snapshot_origin = 'legacy_backfill'
          where id = '${attackerMeal.mealId}';
          commit;
        `);

        const result = JSON.parse(psql(authenticatedSql(ownerA, shoppingCreateCall({
          userId: ownerA,
          title,
          mealIds: [attackerMeal.mealId],
          recipeRows,
          itemRows: [{
            ingredient_id: null,
            food_product_id: product.id,
            food_product_nutrition_version_id:
              product.nutrition_version_id,
            display_text: `${label} product`,
            amounts_json: [],
            is_pantry_excluded: false,
            sort_order: 0,
          }],
        }))));
        expect(result).toMatchObject({ error_code: "FORBIDDEN" });
        expect(psql(serviceSql(`
          select count(*)::text
          from public.shopping_lists
          where title = '${title}';
        `))).toBe("0");
      }

      expect(psql(serviceSql(`
        select count(*)::text
        from public.shopping_lists
        where title like 'foreign-user:%'
           or title like 'foreign-column:%'
           or title like 'foreign-recipe:%';
      `))).toBe("0");
      expect(psql(serviceSql(`
        select count(*)::text
        from public.meals
        where id not in ('${attackerMeal.mealId}', '${victimMeal.mealId}')
          and (
            (
              user_id = '${ownerB}'
              and recipe_id = '${attackerMeal.recipeId}'
            )
            or (
              user_id = '${ownerA}'
              and column_id = '${victimMeal.columnId}'
            )
          );
      `))).toBe("0");
    });

    it("serializes concurrent shopping creation without an orphan list", async () => {
      const ingredientId = createIngredient("create-race");
      const fixture = createShoppingMealFixture(
        ownerA,
        `race-${randomUUID()}`,
        ingredientId,
      );
      const title = `create-race:${randomUUID()}`;
      const call = shoppingCreateCall({
        userId: ownerA,
        title,
        mealIds: [fixture.mealId],
        recipeRows: [{
          recipe_id: fixture.recipeId,
          shopping_servings: 2,
          planned_servings_total: 2,
        }],
        itemRows: [{
          ingredient_id: ingredientId,
          food_product_id: null,
          food_product_nutrition_version_id: null,
          display_text: "race ingredient",
          amounts_json: [],
          is_pantry_excluded: false,
          sort_order: 0,
        }],
      });

      const first = psqlAsync(authenticatedSql(ownerA, `
        begin;
        set application_name = 'shopping-create-race-winner';
        ${call}
        select pg_sleep(1);
        commit;
      `));
      waitForPgSleep("shopping-create-race-winner");
      const second = psqlAsync(authenticatedSql(ownerA, call));
      const results = await Promise.all([first, second]);
      const payloads = results.flatMap((result) =>
        result.stdout
          .trim()
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("{"))
          .map((line) => JSON.parse(line) as Record<string, unknown>),
      );

      expect(results.every((result) => result.status === 0)).toBe(true);
      expect(
        payloads.filter((payload) => typeof payload.id === "string"),
        JSON.stringify(payloads),
      ).toHaveLength(1);
      expect(payloads.filter((payload) => payload.error_code === "CONFLICT")).toHaveLength(1);
      expect(psql(serviceSql(`
        select count(*)::text
        from public.shopping_lists
        where title = '${title}';
      `))).toBe("1");
      expect(psql(serviceSql(`
        select count(*)::text
        from public.shopping_lists as list
        where list.title = '${title}'
          and not exists (
            select 1
            from public.meals as meal
            where meal.shopping_list_id = list.id
          );
      `))).toBe("0");
    }, 10_000);

    it("recomputes pantry exclusion and refuses spoofed complete-without-list input", () => {
      const ingredientId = createIngredient("create-pantry-spoof");
      const fixture = createShoppingMealFixture(
        ownerA,
        `pantry-spoof-${randomUUID()}`,
        ingredientId,
      );
      const title = `pantry-spoof:${randomUUID()}`;

      const result = JSON.parse(psql(authenticatedSql(ownerA, `
        select public.create_shopping_list_from_payload(
          '${ownerA}',
          '${title}',
          current_date,
          current_date,
          true,
          array['${fixture.mealId}'::uuid],
          '[]'::jsonb,
          '[]'::jsonb,
          ${jsonSql([{
            recipe_id: fixture.recipeId,
            shopping_servings: 2,
            planned_servings_total: 2,
          }])},
          ${jsonSql([{
            ingredient_id: ingredientId,
            food_product_id: null,
            food_product_nutrition_version_id: null,
            display_text: "not owned ingredient",
            amounts_json: [],
            is_pantry_excluded: true,
            sort_order: 0,
          }])},
          999
        )::text;
      `)));

      expect(result).toMatchObject({
        id: expect.any(String),
        is_completed: false,
        items: [
          expect.objectContaining({
            ingredient_id: ingredientId,
            is_pantry_excluded: false,
          }),
        ],
      });
      expect(result).not.toHaveProperty("completed_without_list", true);
      expect(psql(serviceSql(`
        select status::text || '|' || (shopping_list_id is not null)::text
        from public.meals
        where id = '${fixture.mealId}';
      `))).toBe("registered|true");
    });

    it("creates a valid split from the locked meal while preserving the selected serving total", () => {
      const ingredientId = createIngredient("create-split-success");
      const fixture = createShoppingMealFixture(
        ownerA,
        `split-success-${randomUUID()}`,
        ingredientId,
      );
      const title = `split-success:${randomUUID()}`;

      const result = JSON.parse(psql(authenticatedSql(ownerA, shoppingCreateCall({
        userId: ownerA,
        title,
        mealIds: [fixture.mealId],
        splitRemainders: [{
          user_id: ownerA,
          recipe_id: fixture.recipeId,
          plan_date: "2026-07-31",
          column_id: fixture.columnId,
          planned_servings: 1,
          is_leftover: false,
        }],
        splitOriginals: [{
          meal_id: fixture.mealId,
          planned_servings: 1,
        }],
        recipeRows: [{
          recipe_id: fixture.recipeId,
          shopping_servings: 1,
          planned_servings_total: 1,
        }],
        itemRows: [{
          ingredient_id: ingredientId,
          food_product_id: null,
          food_product_nutrition_version_id: null,
          display_text: "split ingredient",
          amounts_json: [],
          is_pantry_excluded: false,
          sort_order: 0,
        }],
      }))));

      expect(result).toMatchObject({
        id: expect.any(String),
        is_completed: false,
      });
      expect(psql(serviceSql(`
        select planned_servings::text || '|' || (shopping_list_id is not null)::text
        from public.meals
        where id = '${fixture.mealId}';
      `))).toBe("1|true");
      expect(psql(serviceSql(`
        select count(*)::text
        from public.meals
        where id <> '${fixture.mealId}'
          and user_id = '${ownerA}'
          and recipe_id = '${fixture.recipeId}'
          and column_id = '${fixture.columnId}'
          and planned_servings = 1
          and shopping_list_id is null;
      `))).toBe("1");
      expect(psql(serviceSql(`
        select count(*)::text
        from public.meals as remainder
        join public.meals as source
          on source.id = '${fixture.mealId}'
        where remainder.id <> source.id
          and remainder.user_id = source.user_id
          and remainder.recipe_id = source.recipe_id
          and remainder.column_id = source.column_id
          and remainder.recipe_content_snapshot_id
            is not distinct from source.recipe_content_snapshot_id
          and remainder.recipe_content_snapshot_origin
            is not distinct from source.recipe_content_snapshot_origin
          and remainder.recipe_nutrition_snapshot_id
            is not distinct from source.recipe_nutrition_snapshot_id
          and remainder.nutrition_snapshot_origin
            is not distinct from source.nutrition_snapshot_origin;
      `))).toBe("1");
      expect(psql(`
        select count(*)::text
        from public.shopping_meal_snapshot_clone_tokens;
      `)).toBe("0");
      expect(psql(serviceSql(`
        select planned_servings_total::text
        from public.shopping_list_recipes
        where shopping_list_id = '${String(result.id)}';
      `))).toBe("1");
    });

    it("keeps snapshot clone authority one-time and unavailable to direct callers", () => {
      const fixture = createShoppingMealFixture(
        ownerA,
        `clone-authority-${randomUUID()}`,
      );
      const unreadable = psqlResult(authenticatedSql(ownerA, `
        select count(*)::text
        from public.shopping_meal_snapshot_clone_tokens;
      `));
      expect(unreadable.status).not.toBe(0);

      const forged = psqlResult(`
        begin;
        select set_config(
          'homecook.shopping_meal_snapshot_clone_token',
          '${randomUUID()}',
          true
        );
        insert into public.meals (
          id,
          user_id,
          recipe_id,
          plan_date,
          column_id,
          planned_servings,
          recipe_nutrition_snapshot_id,
          nutrition_snapshot_origin,
          recipe_content_snapshot_id,
          recipe_content_snapshot_origin
        )
        select
          gen_random_uuid(),
          source.user_id,
          source.recipe_id,
          source.plan_date,
          source.column_id,
          source.planned_servings,
          source.recipe_nutrition_snapshot_id,
          source.nutrition_snapshot_origin,
          source.recipe_content_snapshot_id,
          source.recipe_content_snapshot_origin
        from public.meals as source
        where source.id = '${fixture.mealId}';
        rollback;
      `);
      expect(forged.status).not.toBe(0);
      expect(forged.stderr).toContain(
        "CLIENT_SELECTED_CONTENT_OR_NUTRITION_SNAPSHOT_NOT_ALLOWED",
      );
    });

    it("completes pinned product items for null, empty, selected, and retry semantics", () => {
      const defaultProduct = createPrivateProduct(ownerA, "complete-default");
      const emptyProduct = createPrivateProduct(ownerA, "complete-empty");
      const selectedProduct = createPrivateProduct(ownerA, "complete-selected");
      const defaultListId = randomUUID();
      const emptyListId = randomUUID();
      const selectedListId = randomUUID();
      const defaultItemId = randomUUID();
      const emptyItemId = randomUUID();
      const selectedItemId = randomUUID();

      psql(serviceSql(`
        insert into public.shopping_lists (
          id,
          user_id,
          title,
          date_range_start,
          date_range_end
        ) values
          ('${defaultListId}', '${ownerA}', 'complete default', current_date, current_date),
          ('${emptyListId}', '${ownerA}', 'complete empty', current_date, current_date),
          ('${selectedListId}', '${ownerA}', 'complete selected', current_date, current_date);
        insert into public.shopping_list_items (
          id,
          shopping_list_id,
          food_product_id,
          food_product_nutrition_version_id,
          display_text,
          amounts_json,
          is_checked
        ) values
          (
            '${defaultItemId}',
            '${defaultListId}',
            '${defaultProduct.id}',
            '${defaultProduct.nutrition_version_id}',
            'default pinned product',
            '[]'::jsonb,
            true
          ),
          (
            '${emptyItemId}',
            '${emptyListId}',
            '${emptyProduct.id}',
            '${emptyProduct.nutrition_version_id}',
            'empty pinned product',
            '[]'::jsonb,
            true
          ),
          (
            '${selectedItemId}',
            '${selectedListId}',
            '${selectedProduct.id}',
            '${selectedProduct.nutrition_version_id}',
            'selected pinned product',
            '[]'::jsonb,
            true
          );
      `));

      const defaultResult = JSON.parse(psql(authenticatedSql(ownerA, `
        select public.complete_shopping_list(
          '${defaultListId}',
          '${ownerA}',
          null
        )::text;
      `)));
      expect(defaultResult).toMatchObject({
        completed: true,
        pantry_added: 1,
        pantry_added_item_ids: [defaultItemId],
        newly_completed: true,
      });
      expect(psql(serviceSql(`
        select food_product_id || '|' || food_product_nutrition_version_id
        from public.pantry_items
        where user_id = '${ownerA}'
          and food_product_id = '${defaultProduct.id}';
      `))).toBe(
        `${defaultProduct.id}|${defaultProduct.nutrition_version_id}`,
      );

      const retryResult = JSON.parse(psql(authenticatedSql(ownerA, `
        select public.complete_shopping_list(
          '${defaultListId}',
          '${ownerA}',
          array['${emptyItemId}'::uuid]
        )::text;
      `)));
      expect(retryResult).toMatchObject({
        completed: true,
        pantry_added: 1,
        pantry_added_item_ids: [defaultItemId],
        newly_completed: false,
      });
      expect(psql(serviceSql(`
        select count(*)::text
        from public.pantry_items
        where user_id = '${ownerA}'
          and food_product_id = '${defaultProduct.id}';
      `))).toBe("1");

      const emptyResult = JSON.parse(psql(authenticatedSql(ownerA, `
        select public.complete_shopping_list(
          '${emptyListId}',
          '${ownerA}',
          '{}'::uuid[]
        )::text;
      `)));
      expect(emptyResult).toMatchObject({
        completed: true,
        pantry_added: 0,
        pantry_added_item_ids: [],
      });
      expect(psql(serviceSql(`
        select count(*)::text
        from public.pantry_items
        where user_id = '${ownerA}'
          and food_product_id = '${emptyProduct.id}';
      `))).toBe("0");

      const selectedResult = JSON.parse(psql(authenticatedSql(ownerA, `
        select public.complete_shopping_list(
          '${selectedListId}',
          '${ownerA}',
          array['${selectedItemId}'::uuid, '${randomUUID()}'::uuid]
        )::text;
      `)));
      expect(selectedResult).toMatchObject({
        completed: true,
        pantry_added: 1,
        pantry_added_item_ids: [selectedItemId],
      });
      expect(psql(serviceSql(`
        select food_product_id || '|' || food_product_nutrition_version_id
        from public.pantry_items
        where user_id = '${ownerA}'
          and food_product_id = '${selectedProduct.id}';
      `))).toBe(
        `${selectedProduct.id}|${selectedProduct.nutrition_version_id}`,
      );
    });

    it("preserves cross-owner product references and blocks private cleanup", () => {
      const product = createManualProduct(ownerA, "cross-owner-cleanup");
      const shoppingListId = randomUUID();
      const columnId = randomUUID();

      psql(serviceSql(`
        insert into public.pantry_items (
          user_id,
          food_product_id,
          food_product_nutrition_version_id
        ) values (
          '${ownerB}',
          '${product.id}',
          '${product.nutrition_version_id}'
        );
        insert into public.shopping_lists (
          id,
          user_id,
          title,
          date_range_start,
          date_range_end
        ) values (
          '${shoppingListId}',
          '${ownerB}',
          'cross-owner fixture',
          current_date,
          current_date
        );
        insert into public.shopping_list_items (
          shopping_list_id,
          ingredient_id,
          food_product_id,
          food_product_nutrition_version_id,
          display_text,
          amounts_json
        ) values (
          '${shoppingListId}',
          null,
          '${product.id}',
          '${product.nutrition_version_id}',
          'cross-owner fixture',
          '[]'::jsonb
        );
        insert into public.meal_plan_columns (
          id,
          user_id,
          name,
          sort_order
        ) values (
          '${columnId}',
          '${ownerB}',
          '교차 소유자',
          99
        );
        insert into public.product_planner_entries (
          user_id,
          plan_date,
          column_id,
          product_id,
          product_nutrition_version_id,
          quantity_amount,
          quantity_unit,
          product_name_snapshot,
          product_brand_snapshot
        ) values (
          '${ownerB}',
          current_date,
          '${columnId}',
          '${product.id}',
          '${product.nutrition_version_id}',
          100,
          'g',
          (select name from public.food_products where id = '${product.id}'),
          (select brand from public.food_products where id = '${product.id}')
        );
      `));
      psql(`
        alter table public.food_products
          disable trigger protect_food_product_identity;
      `);
      psql(`
        update public.food_products
        set visibility = 'private'
        where id = '${product.id}';
      `);
      psql(`
        alter table public.food_products
          enable trigger protect_food_product_identity;
      `);

      expectSqlFailure(
        serviceSql(`select public.delete_user_private_data('${ownerA}');`),
        /private product references remain/i,
      );

      expect(psql(serviceSql(`
        select (
          (select count(*) from public.pantry_items
           where user_id = '${ownerB}' and food_product_id = '${product.id}')
          +
          (select count(*) from public.shopping_list_items as item
           join public.shopping_lists as list
             on list.id = item.shopping_list_id
           where list.user_id = '${ownerB}'
             and item.food_product_id = '${product.id}')
          +
          (select count(*) from public.product_planner_entries
           where user_id = '${ownerB}' and product_id = '${product.id}')
        )::text;
      `))).toBe("3");
    });

    it("enforces ingredient restrict and product cleanup cascade", () => {
      const ingredientId = createIngredient("fk");
      const product = createPrivateProduct(ownerA, "fk");
      const candidateId = createCandidate({
        productId: product.id,
        ingredientId,
      });

      expectSqlFailure(
        serviceSql(`
          delete from public.ingredients where id = '${ingredientId}';
        `),
        /violates foreign key constraint|food_product_ingredient_links/i,
      );

      psql(`
        begin;
        select set_config(
          'homecook.private_product_cleanup_user_id',
          '${ownerA}',
          true
        );
        set constraints food_products_current_version_fk deferred;
        delete from public.food_products where id = '${product.id}';
        commit;
      `);

      expect(psql(`
        select count(*)::text
        from public.food_product_ingredient_links
        where id = '${candidateId}';
      `)).toBe("0");
    });
  },
);
