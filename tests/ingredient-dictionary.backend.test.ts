import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildExtractedIngredient,
  findIngredientIds,
} from "@/lib/server/youtube-import";

interface QueryError {
  code?: string;
  message: string;
}

interface IngredientRow {
  id: string;
  standard_name: string;
}

interface SynonymRow {
  synonym: string;
  ingredients: IngredientRow | IngredientRow[] | null;
}

function createFilteringTable<T extends object>(
  rows: T[],
  {
    error = null,
  }: {
    error?: QueryError | null;
  } = {},
) {
  const state = {
    column: "",
    values: [] as string[],
  };
  const query = {
    in: vi.fn((column: string, values: string[]) => {
      state.column = column;
      state.values = values;
      return query;
    }),
    then(onFulfilled?: (value: { data: T[] | null; error: QueryError | null }) => unknown, onRejected?: (reason: unknown) => unknown) {
      const data = error
        ? null
        : rows.filter((row) => state.values.includes(String((row as Record<string, unknown>)[state.column])));

      return Promise.resolve({ data, error }).then(onFulfilled, onRejected);
    },
  };

  return {
    __query: query,
    select: vi.fn(() => query),
  };
}

function createIngredientDb({
  ingredients = [],
  synonyms = [],
  synonymError = null,
}: {
  ingredients?: IngredientRow[];
  synonyms?: SynonymRow[];
  synonymError?: QueryError | null;
} = {}) {
  const ingredientsTable = createFilteringTable(ingredients);
  const synonymsTable = createFilteringTable(synonyms, { error: synonymError });
  const dbClient = {
    from: vi.fn((table: string) => {
      if (table === "ingredients") return ingredientsTable;
      if (table === "ingredient_synonyms") return synonymsTable;
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  return {
    dbClient,
    ingredientsTable,
    synonymsTable,
  };
}

function buildIngredient(
  name: string,
  matchesByName: Awaited<ReturnType<typeof findIngredientIds>>["matchesByName"],
) {
  return buildExtractedIngredient({
    matchesByName,
    name,
    amount: 1,
    unit: "T",
    ingredientType: "QUANT",
    displayText: `${name} 1T`,
    sortOrder: 1,
    scalable: true,
    confidence: 0.93,
    rawText: `${name} 1T`,
  });
}

describe("21 ingredient dictionary backend", () => {
  it("resolves a Korean synonym to the canonical ingredient name", async () => {
    const soySauceId = "00000000-0000-4000-8000-000000000001";
    const { dbClient } = createIngredientDb({
      ingredients: [{ id: soySauceId, standard_name: "간장" }],
      synonyms: [{ synonym: "진간장", ingredients: { id: soySauceId, standard_name: "간장" } }],
    });

    const lookup = await findIngredientIds(dbClient, ["진간장"]);
    const ingredient = buildIngredient("진간장", lookup.matchesByName);

    expect(lookup.error).toBeNull();
    expect(ingredient).toMatchObject({
      ingredient_id: soySauceId,
      standard_name: "간장",
      display_text: "진간장 1T",
      raw_text: "진간장 1T",
      resolution_status: "resolved",
      confidence: 0.93,
    });
  });

  it("maps a mixed-case English parsed name through a lowercase synonym row", async () => {
    const soySauceId = "00000000-0000-4000-8000-000000000002";
    const { dbClient, synonymsTable } = createIngredientDb({
      ingredients: [{ id: soySauceId, standard_name: "간장" }],
      synonyms: [{ synonym: "soy sauce", ingredients: [{ id: soySauceId, standard_name: "간장" }] }],
    });

    const lookup = await findIngredientIds(dbClient, ["Soy Sauce"]);
    const ingredient = buildIngredient("Soy Sauce", lookup.matchesByName);

    expect(synonymsTable.__query.in).toHaveBeenCalledWith("synonym", ["Soy Sauce", "soy sauce"]);
    expect(lookup.matchesByName.has("Soy Sauce")).toBe(true);
    expect(ingredient).toMatchObject({
      ingredient_id: soySauceId,
      standard_name: "간장",
      resolution_status: "resolved",
    });
  });

  it("deduplicates direct and synonym matches by ingredient id and keeps direct as source", async () => {
    const soySauceId = "00000000-0000-4000-8000-000000000003";
    const { dbClient } = createIngredientDb({
      ingredients: [{ id: soySauceId, standard_name: "간장" }],
      synonyms: [{ synonym: "간장", ingredients: { id: soySauceId, standard_name: "간장" } }],
    });

    const lookup = await findIngredientIds(dbClient, ["간장"]);
    const bucket = lookup.matchesByName.get("간장");

    expect(bucket?.size).toBe(1);
    expect(bucket?.get(soySauceId)).toEqual({ standardName: "간장", source: "direct" });
    expect(buildIngredient("간장", lookup.matchesByName)).toMatchObject({
      ingredient_id: soySauceId,
      standard_name: "간장",
      resolution_status: "resolved",
      candidates: undefined,
    });
  });

  it("returns needs_review without canonical substitution when one parsed name matches multiple ingredients", async () => {
    const genericGreenOnionId = "00000000-0000-4000-8000-000000000004";
    const largeGreenOnionId = "00000000-0000-4000-8000-000000000005";
    const chiveId = "00000000-0000-4000-8000-000000000006";
    const { dbClient } = createIngredientDb({
      ingredients: [{ id: genericGreenOnionId, standard_name: "파" }],
      synonyms: [
        { synonym: "파", ingredients: { id: chiveId, standard_name: "쪽파" } },
        { synonym: "파", ingredients: { id: largeGreenOnionId, standard_name: "대파" } },
      ],
    });

    const lookup = await findIngredientIds(dbClient, ["파"]);
    const ingredient = buildIngredient("파", lookup.matchesByName);

    expect(ingredient).toMatchObject({
      ingredient_id: "",
      standard_name: "파",
      resolution_status: "needs_review",
      confidence: 0.93,
      candidates: [
        { ingredient_id: genericGreenOnionId, standard_name: "파", confidence: 0.93 },
        { ingredient_id: largeGreenOnionId, standard_name: "대파", confidence: 0.93 },
        { ingredient_id: chiveId, standard_name: "쪽파", confidence: 0.93 },
      ],
    });
  });

  it("propagates synonym lookup errors instead of treating matches as unresolved", async () => {
    const { dbClient } = createIngredientDb({
      ingredients: [{ id: "00000000-0000-4000-8000-000000000007", standard_name: "김치" }],
      synonymError: { message: "synonym lookup failed" },
    });

    const lookup = await findIngredientIds(dbClient, ["김치"]);

    expect(lookup.error).toEqual({ message: "synonym lookup failed" });
    expect(lookup.matchesByName.size).toBe(0);
  });

  it("ignores names that become empty after trim", async () => {
    const dbClient = {
      from: vi.fn(),
    };

    const lookup = await findIngredientIds(dbClient, [" "]);

    expect(lookup.error).toBeNull();
    expect(lookup.matchesByName.size).toBe(0);
    expect(dbClient.from).not.toHaveBeenCalled();
  });

  it("adds an idempotent synonym seed migration without overwriting existing ingredients", () => {
    const migrationName = readdirSync("supabase/migrations")
      .find((name) => name.includes("21_ingredient_dictionary"));

    expect(migrationName).toBeDefined();

    const migration = readFileSync(join("supabase/migrations", migrationName ?? ""), "utf8");

    expect(migration).toContain("on conflict (standard_name) do nothing");
    expect(migration).toContain("on conflict (ingredient_id, synonym) do nothing");
    expect(migration).toContain("lower(trim(v.synonym))");
    expect(migration).not.toMatch(/on conflict \(standard_name\) do update/i);
    expect(migration).toMatch(/'간장',\s*'양념'/);
    expect(migration).toMatch(/'soy sauce'/);
  });
});
