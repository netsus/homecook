import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_PRODUCT_CATALOG_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_PRODUCT_CATALOG_PGHOST ?? "";
const port = process.env.HOMECOOK_PRODUCT_CATALOG_PGPORT ?? "";
const database = process.env.HOMECOOK_PRODUCT_CATALOG_PGDATABASE ?? "";

function psql(sql: string) {
  const result = spawnSync(
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
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

describe.runIf(enabled)("prepared food search indexes on isolated PostgreSQL", () => {
  it("applies all nine indexes as ready and valid after migration replay", () => {
    expect(
      psql(`
        select count(*)
        from pg_catalog.pg_index index_state
        join pg_catalog.pg_class index_class
          on index_class.oid = index_state.indexrelid
        join pg_catalog.pg_namespace index_namespace
          on index_namespace.oid = index_class.relnamespace
        where index_namespace.nspname = 'public'
          and index_class.relname = any (array[
            'ingredients_search_prefix_idx',
            'ingredients_search_compact_trgm_idx',
            'ingredients_search_short_ngram_idx',
            'food_products_public_search_prefix_idx',
            'food_products_public_search_compact_trgm_idx',
            'food_products_public_search_short_ngram_idx',
            'food_products_private_search_prefix_idx',
            'food_products_private_search_compact_trgm_idx',
            'food_products_private_search_short_ngram_idx'
          ])
          and index_state.indisready
          and index_state.indisvalid;
      `),
    ).toBe("9");
  });

  it("keeps the short-substring helper internal and deterministic", () => {
    expect(
      psql(`
        select (
          public.food_search_short_ngrams('가나 다')
            @> array['가', '가나', '나', '나다', '다']::text[]
          and cardinality(public.food_search_short_ngrams('가나 다')) = 5
        )::text;
      `),
    ).toBe("true");
    expect(
      psql(`
        select concat_ws(
          ',',
          has_function_privilege('anon', 'public.food_search_short_ngrams(text)', 'EXECUTE'),
          has_function_privilege('authenticated', 'public.food_search_short_ngrams(text)', 'EXECUTE'),
          has_function_privilege('service_role', 'public.food_search_short_ngrams(text)', 'EXECUTE')
        );
      `),
    ).toBe("f,f,f");
  });

  it("uses bounded prefix, trigram, and two-character substring indexes", () => {
    const prefixPlan = psql(`
      set enable_seqscan = off;
      explain (costs off)
      select id
      from public.ingredients
      where public.normalize_food_search_text(standard_name::text, false)
        like '검색재료0001%';
    `);
    expect(prefixPlan).toContain("ingredients_search_prefix_idx");

    const trigramPlan = psql(`
      set enable_seqscan = off;
      explain (costs off)
      select id
      from public.ingredients
      where public.normalize_food_search_text(standard_name::text, true)
        like '%재료0001%';
    `);
    expect(trigramPlan).toContain("ingredients_search_compact_trgm_idx");

    const shortPlan = psql(`
      set enable_seqscan = off;
      explain (costs off)
      select id
      from public.ingredients
      where public.food_search_short_ngrams(standard_name::text)
        @> array['재료']::text[];
    `);
    expect(shortPlan).toContain("ingredients_search_short_ngram_idx");
  });
});
