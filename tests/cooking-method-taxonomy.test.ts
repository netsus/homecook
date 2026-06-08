import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_COOKING_METHODS,
  COOKING_METHOD_CATEGORIES,
  COOKING_METHOD_SYNONYMS,
  getCanonicalCookingMethodByCode,
  getCookingMethodCategoryByCode,
  getCookingMethodSynonyms,
  getCookingMethodTaxonomyMetadata,
  isCanonicalCookingMethodCode,
  isValidCookingMethodCategoryCode,
} from "@/lib/cooking-method-taxonomy";

describe("cooking method taxonomy v2", () => {
  it("defines 6 groups and 20 canonical methods", () => {
    expect(COOKING_METHOD_CATEGORIES.map((category) => category.label)).toEqual([
      "준비/손질",
      "전처리",
      "물/수분 조리",
      "팬/기름 조리",
      "혼합/조림",
      "기기 조리",
    ]);
    expect(COOKING_METHOD_CATEGORIES).toHaveLength(6);
    expect(CANONICAL_COOKING_METHODS).toHaveLength(20);
    expect(getCookingMethodCategoryByCode("appliance")?.label).toBe("기기 조리");
    expect(isValidCookingMethodCategoryCode("pan_oil")).toBe(true);
    expect(isValidCookingMethodCategoryCode("finish")).toBe(false);
  });

  it("excludes washing from canonical methods and includes air fryer", () => {
    const labels = CANONICAL_COOKING_METHODS.map((method) => method.label);

    expect(labels).not.toContain("씻기");
    expect(labels).toContain("에어프라이어");
    expect(isCanonicalCookingMethodCode("air_fryer")).toBe(true);
    expect(getCanonicalCookingMethodByCode("air_fryer")).toMatchObject({
      label: "에어프라이어",
      category_code: "appliance",
    });
    expect(getCanonicalCookingMethodByCode("washing")).toBeUndefined();
    expect(COOKING_METHOD_SYNONYMS.map((synonym) => synonym.synonym)).not.toContain("씻기");
    for (const nonCanonicalLabel of ["채썰기", "재우기", "핏물빼기", "중탕", "압력솥"]) {
      expect(labels).not.toContain(nonCanonicalLabel);
    }
    expect(getCookingMethodSynonyms("slice")).toContain("채썰기");
    expect(getCookingMethodSynonyms("pre_season")).toContain("재우기");
  });

  it("provides additive metadata and synonym fallback for API consumers", () => {
    expect(getCookingMethodTaxonomyMetadata({
      methodCode: "stir_fry",
    })).toEqual({
      category_code: "pan_oil",
      category_label: "팬/기름 조리",
    });
    expect(getCookingMethodTaxonomyMetadata({
      methodCode: "auto_1",
      categoryCode: "moist_heat",
    })).toEqual({
      category_code: "moist_heat",
      category_label: "물/수분 조리",
    });
    expect(getCookingMethodSynonyms("air_fryer")).toContain("에어프라이어에");
  });

  it("ships a migration that widens labels and seeds the canonical taxonomy", () => {
    const migration = readFileSync(
      "supabase/migrations/20260609110000_taxonomy_v2_additive.sql",
      "utf8",
    );

    expect(migration).toContain("alter column label type varchar(20)");
    expect(migration).toContain("create table if not exists public.cooking_method_categories");
    expect(migration).toContain("create table if not exists public.cooking_method_synonyms");
    expect(migration).toContain("('air_fryer', '에어프라이어', 'yellow', 'appliance', true, 200)");
    expect(migration).not.toMatch(/\('washing',\s*'씻기'/);
    expect(migration).not.toContain("('씻기'");
  });
});
