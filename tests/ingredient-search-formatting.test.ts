import { describe, expect, it } from "vitest";
import { normalizeIngredientSearchName, ingredientSearchPattern } from "@/lib/ingredient-search";
import { normalizeFoodCatalogSearchQuery } from "@/lib/server/food-catalog-search";

describe("ingredient spelling-layout normalization", () => {
  it("matches ordinary Korean spacing, Unicode composition and case without aliases", () => {
    for (const value of [" 다진 마늘 ", "다진\t마늘", "다진\u00a0마늘", "다진　마늘", "다진마늘".normalize("NFD")]) {
      expect(normalizeIngredientSearchName(value)).toBe("다진마늘");
    }
    expect(normalizeIngredientSearchName("ＯＬＩＶＥ Oil")).toBe("oliveoil");
  });
  it.each(["\u200b", "\u200c", "\u200d", "\u2060", "\ufeff"])("ignores invisible pasted formatting %j", (format) => {
    expect(normalizeIngredientSearchName(`다진${format}마늘`)).toBe("다진마늘");
    expect(normalizeFoodCatalogSearchQuery(`올리브${format} 오일`)).toBe("올리브 오일");
  });
  it("retains food states and meaningful punctuation instead of fuzzy-merging identities", () => {
    expect(normalizeIngredientSearchName("말린 표고버섯")).not.toBe(normalizeIngredientSearchName("생 표고버섯"));
    expect(normalizeIngredientSearchName("우유(저지방)")).toBe("우유(저지방)");
    expect(ingredientSearchPattern("a_%\\")).toBe("%a\\_\\%\\\\%");
  });
  it("recomposes Hangul after removing invisible separators between its Unicode parts", () => {
    const pasted = "\u1106\u200b\u1161늘";
    expect(normalizeIngredientSearchName(pasted)).toBe("마늘");
    expect(normalizeFoodCatalogSearchQuery(pasted)).toBe("마늘");
  });
});
