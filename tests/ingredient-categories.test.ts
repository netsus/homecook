import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ALL_INGREDIENT_CATEGORY,
  getFallbackIngredientSubcategoryCode,
  getIngredientCategoryByLabel,
  getIngredientCategoryEmoji,
  getIngredientCategoryGroupByCode,
  getIngredientCategoryGroupFilterOption,
  getIngredientGroupDisplayLabel,
  getIngredientGroupCodesForLegacyCategory,
  getIngredientGroupFilterValue,
  getIngredientSubcategoryByCode,
  getIngredientSubcategoryOption,
  getIngredientSubcategoryOptionsByGroup,
  getIngredientTaxonomyMetadata,
  INGREDIENT_CATEGORIES,
  INGREDIENT_CATEGORY_GROUPS,
  INGREDIENT_CATEGORY_GROUP_OPTIONS,
  INGREDIENT_CATEGORY_LABELS,
  INGREDIENT_CATEGORY_OPTIONS,
  INGREDIENT_SUBCATEGORIES,
  ingredientMatchesCategoryGroup,
  isValidIngredientCategory,
  isValidIngredientCategoryGroupCode,
  isValidIngredientSubcategoryCode,
  normalizeIngredientCategoryLabel,
} from "@/lib/ingredient-categories";

describe("ingredient category shared source", () => {
  it("keeps the expanded DB labels as the canonical active category set", () => {
    expect(INGREDIENT_CATEGORY_LABELS).toEqual([
      "채소",
      "과일",
      "육류",
      "해산물",
      "양념",
      "유제품",
      "곡류",
      "기타",
    ]);
    expect(INGREDIENT_CATEGORIES).toEqual([
      { code: "vegetable", label: "채소", display_order: 10, is_active: true, emoji: "🥬" },
      { code: "fruit", label: "과일", display_order: 20, is_active: true, emoji: "🍓" },
      { code: "meat", label: "육류", display_order: 30, is_active: true, emoji: "🥩" },
      { code: "seafood", label: "해산물", display_order: 40, is_active: true, emoji: "🐟" },
      { code: "seasoning", label: "양념", display_order: 50, is_active: true, emoji: "🧂" },
      { code: "dairy", label: "유제품", display_order: 60, is_active: true, emoji: "🥛" },
      { code: "grain", label: "곡류", display_order: 70, is_active: true, emoji: "🌾" },
      { code: "other", label: "기타", display_order: 80, is_active: true, emoji: "🥄" },
    ]);
  });

  it("preserves the all-category UI option while deriving selectable labels", () => {
    expect(INGREDIENT_CATEGORY_OPTIONS).toEqual([
      ALL_INGREDIENT_CATEGORY,
      ...INGREDIENT_CATEGORY_LABELS,
    ]);
  });

  it("validates, normalizes, and falls back through the shared category source", () => {
    expect(isValidIngredientCategory("채소")).toBe(true);
    expect(isValidIngredientCategory("과일")).toBe(true);
    expect(isValidIngredientCategory("단백질")).toBe(false);
    expect(getIngredientCategoryByLabel(" 과일 ")?.code).toBe("fruit");
    expect(getIngredientCategoryByLabel(" 양념 ")?.code).toBe("seasoning");
    expect(normalizeIngredientCategoryLabel("단백질")).toBe("기타");
    expect(normalizeIngredientCategoryLabel(" 과일 ")).toBe("과일");
    expect(normalizeIngredientCategoryLabel(" 육류 ")).toBe("육류");
    expect(getIngredientCategoryEmoji("해산물")).toBe("🐟");
    expect(getIngredientCategoryEmoji("과일")).toBe("🍓");
    expect(getIngredientCategoryEmoji("단백질")).toBe("🥄");
  });

  it("ships a migration that allows fruit registration and recategorizes fruit seeds", () => {
    const migration = readFileSync(
      "supabase/migrations/20260608090000_expand_ingredient_fruit_category.sql",
      "utf8",
    );

    expect(migration).toContain("'과일'");
    expect(migration).toMatch(/register_youtube_ingredient[\s\S]+v_category not in/);
    expect(migration).toContain("딸기");
    expect(migration).toContain("사과");
    expect(migration).toContain("바나나");
  });

  it("defines taxonomy v2 as 8 groups and 21 subcategories without dropping v1 labels", () => {
    expect(INGREDIENT_CATEGORY_GROUPS.map((group) => group.label)).toEqual([
      "곡류/면/떡",
      "채소/버섯",
      "과일/견과",
      "단백질",
      "해산물",
      "유제품/대체유",
      "양념/조미",
      "가공/기타",
    ]);
    expect(INGREDIENT_CATEGORY_GROUPS).toHaveLength(8);
    expect(INGREDIENT_SUBCATEGORIES).toHaveLength(21);
    expect(INGREDIENT_CATEGORY_LABELS).toHaveLength(8);

    expect(getIngredientCategoryGroupByCode("protein")?.label).toBe("단백질");
    expect(getIngredientSubcategoryByCode("fruit")?.legacy_category).toBe("과일");
    expect(getIngredientSubcategoryByCode("egg")).toMatchObject({
      group_code: "protein",
      legacy_category: "기타",
    });
    expect(isValidIngredientCategoryGroupCode("fruit_nut")).toBe(true);
    expect(isValidIngredientCategoryGroupCode("snack")).toBe(false);
    expect(isValidIngredientSubcategoryCode("air_fryer")).toBe(false);
  });

  it("derives v2 frontend filter and subcategory picker options from the shared source", () => {
    expect(INGREDIENT_CATEGORY_GROUP_OPTIONS.map((option) => option.label)).toEqual([
      ALL_INGREDIENT_CATEGORY,
      "곡류/면/떡",
      "채소/버섯",
      "과일/견과",
      "단백질",
      "해산물",
      "유제품/대체유",
      "양념/조미",
      "가공/기타",
    ]);
    expect(getIngredientCategoryGroupFilterOption("fruit_nut")).toMatchObject({
      label: "과일/견과",
      category_group_code: "fruit_nut",
    });
    expect(getIngredientSubcategoryOption("paste_sauce")).toMatchObject({
      label: "장류/소스",
      legacy_category: "양념",
      group_label: "양념/조미",
    });
    expect(getIngredientSubcategoryOptionsByGroup()).toHaveLength(8);
  });

  it("matches v2 group filters while falling back from legacy labels safely", () => {
    expect(getIngredientGroupFilterValue({
      category: "채소",
      category_code: "root_stem",
    })).toBe("vegetable_mushroom");
    expect(getIngredientGroupDisplayLabel({
      category: "과일",
      category_group_code: "fruit_nut",
    })).toBe("과일/견과");
    expect(ingredientMatchesCategoryGroup({
      category: "과일",
      category_code: "fruit",
    }, "fruit_nut")).toBe(true);
    expect(ingredientMatchesCategoryGroup({
      category: "과일",
      category_code: "fruit",
    }, "vegetable_mushroom")).toBe(false);
    expect(ingredientMatchesCategoryGroup({
      category: "양념",
    }, "seasoning_condiment")).toBe(true);
    expect(ingredientMatchesCategoryGroup({
      category: "단백질",
    }, "protein")).toBe(true);
  });

  it("maps v1 labels to safe taxonomy fallback metadata without pretending precision", () => {
    expect(getFallbackIngredientSubcategoryCode(" 과일 ")).toBe("fruit");
    expect(getIngredientGroupCodesForLegacyCategory("기타")).toEqual([
      "protein",
      "processed_other",
    ]);
    expect(getIngredientTaxonomyMetadata({
      category: "채소",
      categoryCode: null,
    })).toEqual({
      category_group_code: "vegetable_mushroom",
      category_group_label: "채소/버섯",
      category_code: null,
      category_label: "채소",
    });
    expect(getIngredientTaxonomyMetadata({
      category: "채소",
      categoryCode: "root_stem",
    })).toEqual({
      category_group_code: "vegetable_mushroom",
      category_group_label: "채소/버섯",
      category_code: "root_stem",
      category_label: "뿌리/줄기채소",
    });
  });

  it("ships an idempotent additive taxonomy v2 migration", () => {
    const migration = readFileSync(
      "supabase/migrations/20260609110000_taxonomy_v2_additive.sql",
      "utf8",
    );

    expect(migration).toContain("create table if not exists public.ingredient_category_groups");
    expect(migration).toContain("create table if not exists public.ingredient_categories");
    expect(migration).toContain("add column if not exists category_code");
    expect(migration).toContain("'fruit_nut', '과일/견과'");
    expect(migration).toContain("'protein', '단백질'");
    expect(migration).toContain("'egg', 'protein', '달걀', '기타'");
    expect(migration).toContain("('딸기', '과일', 'fruit')");
    expect(migration).toContain("('사과', '과일', 'fruit')");
    expect(migration).toContain("('바나나', '과일', 'fruit')");
    expect(migration).toContain("('레몬', '과일', 'fruit')");
    expect(migration).toContain("('견과류', '과일', 'nut_seed_dried_fruit')");
    expect(migration).toContain("('아몬드가루', '과일', 'nut_seed_dried_fruit')");
    expect(migration).toContain("on conflict (code) do update");
  });
});
