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
        from public.select_pantry_effective_ingredients('${ownerA}');
      `))).toBe("1");
      expect(psql(authenticatedSql(ownerB, `
        select count(*)::text
        from public.select_pantry_effective_ingredients('${ownerA}');
      `))).toBe("0");
      expectSqlFailure(serviceSql(`
        select * from public.select_pantry_effective_ingredients('${ownerA}');
      `), /permission denied/i);
    });

    it("keeps the effective reader bounded by owner and product lookup indexes", () => {
      const explain = psqlResult(`
        set enable_seqscan = off;
        explain (costs off)
        select distinct effective.ingredient_id
        from (
          select pantry.ingredient_id
          from public.pantry_items as pantry
          where pantry.user_id = '${ownerA}'
            and pantry.ingredient_id is not null
          union
          select link.ingredient_id
          from public.pantry_items as pantry
          join public.food_product_ingredient_links as link
            on link.product_id = pantry.food_product_id
           and link.relation = 'represents'
           and link.review_status = 'approved'
           and link.is_primary
           and link.is_active
          where pantry.user_id = '${ownerA}'
            and pantry.food_product_id is not null
        ) as effective;
      `);

      expect(explain.status, explain.stderr).toBe(0);
      expect(explain.stdout).toMatch(
        /pantry_items_user_ingredient_unique|pantry_items_user_ingredient_idx/i,
      );
      expect(explain.stdout).toMatch(/pantry_items_user_product_lookup_idx/i);
      expect(explain.stdout).toMatch(/food_product_ingredient_links/i);
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
