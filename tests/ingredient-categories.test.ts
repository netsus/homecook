import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ALL_INGREDIENT_CATEGORY,
  getIngredientCategoryByLabel,
  getIngredientCategoryEmoji,
  INGREDIENT_CATEGORIES,
  INGREDIENT_CATEGORY_LABELS,
  INGREDIENT_CATEGORY_OPTIONS,
  isValidIngredientCategory,
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
});
