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

  it.each([
    ["청도반시", "연시", "00000000-0000-4000-8000-000000000021"],
    ["국수", "소면", "00000000-0000-4000-8000-000000000022"],
    ["레몬착즙", "레몬즙", "00000000-0000-4000-8000-000000000023"],
    ["멥쌀밥", "쌀밥", "00000000-0000-4000-8000-000000000024"],
  ])("resolves reviewed synonym %s to canonical ingredient %s", async (
    parsedName,
    canonicalName,
    ingredientId,
  ) => {
    const { dbClient } = createIngredientDb({
      ingredients: [{ id: ingredientId, standard_name: canonicalName }],
      synonyms: [{ synonym: parsedName, ingredients: { id: ingredientId, standard_name: canonicalName } }],
    });

    const lookup = await findIngredientIds(dbClient, [parsedName]);
    const ingredient = buildIngredient(parsedName, lookup.matchesByName);

    expect(lookup.error).toBeNull();
    expect(ingredient).toMatchObject({
      ingredient_id: ingredientId,
      standard_name: canonicalName,
      display_text: `${parsedName} 1T`,
      raw_text: `${parsedName} 1T`,
      resolution_status: "resolved",
      candidates: undefined,
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

  it("prefers an exact non-ambiguous standard-name match over legacy synonyms", async () => {
    const eggId = "00000000-0000-4000-8000-000000000017";
    const legacyEggId = "00000000-0000-4000-8000-000000000018";
    const { dbClient } = createIngredientDb({
      ingredients: [{ id: eggId, standard_name: "계란" }],
      synonyms: [
        { synonym: "계란", ingredients: { id: legacyEggId, standard_name: "달걀" } },
      ],
    });

    const lookup = await findIngredientIds(dbClient, ["계란"]);
    const ingredient = buildIngredient("계란", lookup.matchesByName);

    expect(ingredient).toMatchObject({
      ingredient_id: eggId,
      standard_name: "계란",
      resolution_status: "resolved",
      candidates: undefined,
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

  it("promotes only missing approved external seed ingredients without overwriting existing rows", () => {
    const migration = readFileSync(
      "supabase/migrations/20260530001000_28_external_ingredient_seed_promotion.sql",
      "utf8",
    );

    expect(migration).toContain("on conflict (standard_name) do nothing");
    expect(migration).not.toMatch(/on conflict \(standard_name\) do update/i);

    for (const [name, category] of [
      ["귀리", "곡류"],
      ["기장", "곡류"],
      ["강낭콩", "곡류"],
      ["녹두", "곡류"],
      ["도토리", "곡류"],
      ["도토리묵", "곡류"],
      ["가지", "채소"],
      ["다랑어", "해산물"],
      ["고등어", "해산물"],
      ["고추기름", "양념"],
      ["땅콩 버터", "양념"],
      ["겨자", "양념"],
    ]) {
      expect(migration).toMatch(new RegExp(`'${name}',\\s*'${category}'`));
    }

    for (const existingOrHeldName of [
      "감자",
      "달걀",
      "햄",
      "김",
      "들기름",
      "간장",
      "다시마 육수",
    ]) {
      expect(migration).not.toContain(`'${existingOrHeldName}'`);
    }
  });

  it("seeds remaining YouTube register-blocker ingredients without overwriting existing rows", () => {
    const migration = readFileSync(
      "supabase/migrations/20260530020000_29_youtube_register_blocker_dictionary_seed.sql",
      "utf8",
    );

    expect(migration).toContain("on conflict (standard_name) do nothing");
    expect(migration).not.toMatch(/on conflict \(standard_name\) do update/i);

    for (const [name, category] of [
      ["중력분", "곡류"],
      ["허브솔트", "양념"],
      ["배", "기타"],
    ]) {
      expect(migration).toMatch(new RegExp(`'${name}',\\s*'${category}'`));
    }
  });

  it("keeps reviewed external synonym mappings for recipe import resolution", () => {
    const migrationFiles = readdirSync("supabase/migrations")
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const migrations = migrationFiles
      .map((name) => readFileSync(join("supabase/migrations", name), "utf8"))
      .join("\n");

    for (const [canonicalName, synonym] of [
      ["연시", "청도반시"],
      ["소면", "국수"],
      ["레몬즙", "레몬착즙"],
      ["쌀밥", "멥쌀밥"],
    ]) {
      expect(migrations).toContain(`'${canonicalName}', '${synonym}'`);
    }
  });

  it("ships user-requested ingredient dictionary corrections without re-seeding deleted sesame rows", () => {
    const migration = readFileSync(
      "supabase/migrations/20260702034500_ingredient_dictionary_user_corrections.sql",
      "utf8",
    );
    const seed = readFileSync("supabase/seed.sql", "utf8");

    for (const [canonicalName, synonym] of [
      ["방울토마토", "체리토마토"],
      ["오리엔탈 소스", "오리엔탈"],
      ["참깨", "통깨"],
      ["참깨", "깨"],
      ["발사믹 식초", "발사믹"],
    ]) {
      expect(migration).toContain(`('${canonicalName}', '${synonym}')`);
    }

    expect(migration).toContain("('크림 소스', '양념', 'paste_sauce', null)");

    for (const removedName of [
      "견과류",
      "가공당",
      "과당",
      "감미료",
      "고기 소스",
      "굴 소스",
      "껌",
      "돼지불고기 양념",
      "발사믹 소스",
      "바닐라빈 페이스트",
      "샐러드 드레싱",
      "소불고기 양념",
      "쇠기름",
      "쇼트닝",
      "스파게티 소스",
      "양념닭 소스",
      "연어기름",
      "월계수",
    ]) {
      expect(migration).toContain(`'${removedName}'`);
    }

    expect(migration).toContain("select pg_temp.merge_ingredient_name('깨', '참깨', true)");
    expect(migration).toContain("select pg_temp.merge_ingredient_name('통깨', '참깨', true)");
    expect(migration).toContain("select pg_temp.merge_ingredient_name('오리엔탈', '오리엔탈 소스', true)");
    expect(migration).toContain("select pg_temp.merge_ingredient_name('발사믹 소스', '발사믹 식초', false)");

    expect(seed).toContain("'550e8400-e29b-41d4-a716-446655440021', '참깨'");
    expect(seed).toContain("'660e8400-e29b-41d4-a716-446655440517'::uuid, '660e8400-e29b-41d4-a716-446655440501'::uuid, '참깨'");
    expect(seed).not.toContain("'깨', '양념', 'spice_herb'");
    expect(seed).not.toContain("'660e8400-e29b-41d4-a716-446655440501'::uuid, '깨'");
  });
});
