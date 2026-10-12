import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
}));

type Row = Record<string, unknown>;

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function projectIngredient(row: Row, includeTaxonomy: boolean) {
  return {
    id: row.id,
    standard_name: row.standard_name,
    category: row.category,
    ...(includeTaxonomy ? { category_code: row.category_code } : {}),
  };
}

function projectSynonym(row: Row, includeTaxonomy: boolean) {
  const projected: Row = {
    ingredient_id: row.ingredient_id,
    synonym: row.synonym,
  };
  if (Object.hasOwn(row, "ingredients")) {
    const ingredient = row.ingredients as Row | null;
    projected.ingredients = ingredient ? projectIngredient(ingredient, includeTaxonomy) : null;
  }
  return projected;
}

function createIngredientSearchClient({
  ingredients = [],
  synonyms = [],
  aliases = [],
  taxonomySchemaMiss = false,
}: {
  ingredients?: Row[];
  synonyms?: Row[];
  aliases?: Row[];
  taxonomySchemaMiss?: boolean;
}) {
  const rangeReads: Array<{ table: string; from: number; to: number }> = [];
  const selectCalls: Array<{ table: string; columns: string }> = [];

  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          selectCalls.push({ table, columns });
          const includeTaxonomy = columns.includes("category_code");
          const sourceRows = table === "ingredients"
            ? ingredients
            : table === "ingredient_synonyms"
              ? synonyms
              : aliases;
          let filteredRows = sourceRows;
          let from = 0;
          let to = 999;
          const query = {
            order: vi.fn(() => query),
            range: vi.fn((start: number, end: number) => {
              from = start;
              to = end;
              return query;
            }),
            like: vi.fn((_column: string, pattern: string) => {
              const searchName = pattern.slice(1, -1);
              filteredRows = filteredRows.filter((row) =>
                String(row.search_name).includes(searchName));
              return query;
            }),
            then(
              onFulfilled?: (value: { data: unknown[] | null; error: { message: string } | null }) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) {
              rangeReads.push({ table, from, to });
              const schemaMiss = taxonomySchemaMiss
                && table !== "ingredient_catalog_aliases"
                && includeTaxonomy;
              const data = schemaMiss
                ? null
                : filteredRows.slice(from, to + 1).map((row) => {
                  if (table === "ingredients") return projectIngredient(row, includeTaxonomy);
                  if (table === "ingredient_synonyms") return projectSynonym(row, includeTaxonomy);
                  return row;
                });
              return Promise.resolve({
                data,
                error: schemaMiss
                  ? { message: "column category_code does not exist in schema cache" }
                  : null,
              }).then(onFulfilled, onRejected);
            },
          };
          return query;
        },
      };
    },
  };

  createRouteHandlerClient.mockResolvedValue(client);
  return { rangeReads, selectCalls };
}

function ingredientRow(
  ingredientId: string,
  standardName: unknown,
  categoryCode: string | null = null,
): Row {
  return {
    id: ingredientId,
    standard_name: standardName,
    category: "양념",
    category_code: categoryCode,
    search_name: typeof standardName === "string"
      ? standardName.replaceAll(" ", "")
      : "슈가",
  };
}

function expectedIngredient(ingredientId: string, standardName: string) {
  return {
    id: ingredientId,
    standard_name: standardName,
    category: "양념",
    category_group_code: "seasoning_condiment",
    category_code: null,
    category_label: "양념",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
  delete process.env.HOMECOOK_ENABLE_DISCOVERY_FILTER_MOCK;
  delete process.env.NEXT_PUBLIC_DISCOVERY_FILTER_MANUAL_MOCK;
});

describe("ingredient search result parsing and ranking", () => {
  it("keeps exact, exact synonym, prefix, and remaining tiers with canonical-first dedupe", async () => {
    const exactId = id(1);
    const oldAliasId = id(2);
    const canonicalAliasId = id(3);
    const firstPrefixId = id(4);
    const secondPrefixId = id(5);
    const remainingId = id(6);
    const synonymExactId = id(7);
    const canonicalAlias = ingredientRow(canonicalAliasId, "가루 설탕");
    const remaining = ingredientRow(remainingId, "가루 장식");
    const synonymExact = ingredientRow(synonymExactId, "분당");

    createIngredientSearchClient({
      ingredients: [
        ingredientRow(exactId, "슈가"),
        ingredientRow(oldAliasId, "슈가"),
        ingredientRow(firstPrefixId, "슈가 토핑"),
        ingredientRow(secondPrefixId, "슈가 토핑"),
      ],
      synonyms: [
        {
          ingredient_id: exactId,
          synonym: "슈가 중복",
          search_name: "슈가중복",
          ingredients: ingredientRow(exactId, "후행 중복 이름"),
        },
        {
          ingredient_id: synonymExactId,
          synonym: "슈가",
          search_name: "슈가",
          ingredients: synonymExact,
        },
        {
          ingredient_id: oldAliasId,
          synonym: "슈가 별칭",
          search_name: "슈가별칭",
          ingredients: ingredientRow(oldAliasId, "슈가"),
        },
        {
          ingredient_id: remainingId,
          synonym: "슈가용",
          search_name: "슈가용",
          ingredients: remaining,
        },
      ],
      aliases: [{
        ingredient_id: oldAliasId,
        representative_ingredient_id: canonicalAliasId,
        representative_standard_name: canonicalAlias.standard_name,
        representative_category: canonicalAlias.category,
        representative_category_code: canonicalAlias.category_code,
      }],
    });

    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(new NextRequest(
      "http://localhost/api/v1/ingredients?q=%EC%8A%88%EA%B0%80",
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        items: [
          expectedIngredient(exactId, "슈가"),
          expectedIngredient(canonicalAliasId, "가루 설탕"),
          expectedIngredient(synonymExactId, "분당"),
          expectedIngredient(firstPrefixId, "슈가 토핑"),
          expectedIngredient(secondPrefixId, "슈가 토핑"),
          expectedIngredient(remainingId, "가루 장식"),
        ],
      },
      error: null,
    });
  });

  it("reads every ingredient page before ranking the response", async () => {
    const ingredients = Array.from({ length: 1001 }, (_, index) =>
      ingredientRow(id(1000 + index), `테스트 재료 ${String(index).padStart(4, "0")}`));
    const synonyms = Array.from({ length: 1001 }, (_, index) => ({
      ingredient_id: id(3000 + index),
      synonym: `테스트 별칭 ${String(index).padStart(4, "0")}`,
      search_name: `테스트별칭${String(index).padStart(4, "0")}`,
      ingredients: ingredientRow(
        id(3000 + index),
        `별칭 재료 ${String(index).padStart(4, "0")}`,
      ),
    }));
    const { rangeReads } = createIngredientSearchClient({ ingredients, synonyms });

    const { GET } = await import("@/app/api/v1/ingredients/route");
    const body = await (await GET(new NextRequest(
      "http://localhost/api/v1/ingredients?q=%ED%85%8C%EC%8A%A4%ED%8A%B8",
    ))).json();

    expect(body.data.items).toHaveLength(2002);
    expect(body.data.items.some((item: { id: string }) => item.id === id(2000))).toBe(true);
    expect(body.data.items.some((item: { id: string }) => item.id === id(4000))).toBe(true);
    expect(rangeReads.filter((read) => read.table === "ingredients")).toEqual([
      { table: "ingredients", from: 0, to: 999 },
      { table: "ingredients", from: 1000, to: 1999 },
    ]);
    expect(rangeReads.filter((read) => read.table === "ingredient_synonyms")).toEqual([
      { table: "ingredient_synonyms", from: 0, to: 999 },
      { table: "ingredient_synonyms", from: 1000, to: 1999 },
    ]);
  });

  it("retries without category_code when the schema cache is legacy", async () => {
    const onion = {
      ...ingredientRow(id(10), "양파", "root_stem"),
      category: "채소",
      search_name: "양파",
    };
    const { selectCalls } = createIngredientSearchClient({
      ingredients: [onion],
      taxonomySchemaMiss: true,
    });

    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(new NextRequest(
      "http://localhost/api/v1/ingredients?q=%EC%96%91%ED%8C%8C",
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        items: [{
          id: id(10),
          standard_name: "양파",
          category: "채소",
          category_group_code: "vegetable_mushroom",
          category_code: null,
          category_label: "채소",
        }],
      },
      error: null,
    });
    expect(selectCalls).toContainEqual({
      table: "ingredients",
      columns: "id, standard_name, category, category_code",
    });
    expect(selectCalls).toContainEqual({
      table: "ingredients",
      columns: "id, standard_name, category",
    });
  });

  it.each([
    {
      label: "ingredient",
      ingredients: [ingredientRow(id(20), 7)],
      synonyms: [],
    },
    {
      label: "synonym",
      ingredients: [],
      synonyms: [{
        ingredient_id: id(21),
        synonym: 7,
        search_name: "슈가",
        ingredients: ingredientRow(id(21), "분당"),
      }],
    },
    {
      label: "missing synonym relation",
      ingredients: [],
      synonyms: [{
        ingredient_id: id(22),
        synonym: "슈가",
        search_name: "슈가",
      }],
    },
  ])("fails closed on a malformed $label row", async ({ ingredients, synonyms }) => {
    createIngredientSearchClient({ ingredients, synonyms });

    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(new NextRequest(
      "http://localhost/api/v1/ingredients?q=%EC%8A%88%EA%B0%80",
    ));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR", fields: [] },
    });
  });
});
