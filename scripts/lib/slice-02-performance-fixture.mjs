import { createHash } from "node:crypto";

export const PERF_ALLOWED_CATEGORIES = [
  "채소",
  "육류",
  "해산물",
  "양념",
  "유제품",
  "곡류",
  "기타",
];

export const PERF_INGREDIENT_NAME_PREFIX = "성능재료";
export const PERF_SYNONYM_PREFIX = "성능별칭";
export const PERF_RECIPE_TITLE_PREFIX = "성능 레시피";
export const SLICE_02_PERFORMANCE_DEFAULTS = {
  ingredientCount: 280,
  recipeCount: 120,
  sharedFilterMatchCount: 18,
};

function createDeterministicUuid(scope, index) {
  const hex = createHash("sha1")
    .update(`slice-02-performance:${scope}:${index}`)
    .digest("hex")
    .slice(0, 32)
    .split("");

  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];

  return [
    hex.slice(0, 8).join(""),
    hex.slice(8, 12).join(""),
    hex.slice(12, 16).join(""),
    hex.slice(16, 20).join(""),
    hex.slice(20, 32).join(""),
  ].join("-");
}

function padIndex(index) {
  return String(index).padStart(3, "0");
}

function uniqueExtraIngredientIndexes(recipeIndex, ingredientCount, extraCount) {
  const indexes = [];

  for (let cursor = 0; indexes.length < extraCount; cursor += 1) {
    const candidate = ((recipeIndex * 7) + (cursor * 11)) % ingredientCount;

    if (candidate === 0 || candidate === 1 || indexes.includes(candidate)) {
      continue;
    }

    indexes.push(candidate);
  }

  return indexes;
}

export function buildSlice02PerformanceDataset({
  ingredientCount = SLICE_02_PERFORMANCE_DEFAULTS.ingredientCount,
  recipeCount = SLICE_02_PERFORMANCE_DEFAULTS.recipeCount,
  sharedFilterMatchCount = SLICE_02_PERFORMANCE_DEFAULTS.sharedFilterMatchCount,
} = {}) {
  if (ingredientCount < 12) {
    throw new Error("ingredientCount는 최소 12개 이상이어야 합니다.");
  }

  if (recipeCount < 12) {
    throw new Error("recipeCount는 최소 12개 이상이어야 합니다.");
  }

  if (sharedFilterMatchCount < 4 || sharedFilterMatchCount >= recipeCount) {
    throw new Error("sharedFilterMatchCount는 4 이상, recipeCount 미만이어야 합니다.");
  }

  const ingredients = Array.from({ length: ingredientCount }, (_, zeroBasedIndex) => {
    const index = zeroBasedIndex + 1;

    return {
      id: createDeterministicUuid("ingredient", index),
      standard_name: `${PERF_INGREDIENT_NAME_PREFIX} ${padIndex(index)}`,
      category:
        PERF_ALLOWED_CATEGORIES[zeroBasedIndex % PERF_ALLOWED_CATEGORIES.length],
      default_unit: zeroBasedIndex % 3 === 0 ? "g" : zeroBasedIndex % 3 === 1 ? "개" : "ml",
    };
  });

  const synonyms = ingredients.map((ingredient, zeroBasedIndex) => ({
    id: createDeterministicUuid("synonym", zeroBasedIndex + 1),
    ingredient_id: ingredient.id,
    synonym: `${PERF_SYNONYM_PREFIX}${padIndex(zeroBasedIndex + 1)}`,
  }));

  const recipes = Array.from({ length: recipeCount }, (_, zeroBasedIndex) => {
    const index = zeroBasedIndex + 1;

    return {
      id: createDeterministicUuid("recipe", index),
      title: `${PERF_RECIPE_TITLE_PREFIX} ${padIndex(index)}`,
      description: `대량 재료 필터 성능 검증용 레시피 ${padIndex(index)}`,
      thumbnail_url: null,
      tags: ["성능", "필터", zeroBasedIndex % 2 === 0 ? "집밥" : "테스트"],
      base_servings: 2 + (zeroBasedIndex % 3),
      source_type: "system",
      view_count: 300 + index,
      like_count: zeroBasedIndex % 17,
      save_count: zeroBasedIndex % 11,
      plan_count: zeroBasedIndex % 7,
      cook_count: 0,
    };
  });

  const filterIngredientIds = [ingredients[0].id, ingredients[1].id];
  const recipeIngredients = [];

  recipes.forEach((recipe, zeroBasedIndex) => {
    const ingredientIndexes = [
      0,
      ...(zeroBasedIndex < sharedFilterMatchCount ? [1] : []),
      ...uniqueExtraIngredientIndexes(zeroBasedIndex + 1, ingredientCount, 4),
    ];

    ingredientIndexes.forEach((ingredientIndex, rowIndex) => {
      recipeIngredients.push({
        id: createDeterministicUuid("recipe-ingredient", `${zeroBasedIndex + 1}-${rowIndex + 1}`),
        recipe_id: recipe.id,
        ingredient_id: ingredients[ingredientIndex].id,
        amount: rowIndex === ingredientIndexes.length - 1 ? null : 100 + rowIndex * 20,
        unit: rowIndex === ingredientIndexes.length - 1 ? null : ingredients[ingredientIndex].default_unit,
        ingredient_type: rowIndex === ingredientIndexes.length - 1 ? "TO_TASTE" : "QUANT",
        display_text:
          rowIndex === ingredientIndexes.length - 1
            ? "기호에 따라"
            : `${100 + rowIndex * 20}${ingredients[ingredientIndex].default_unit}`,
        sort_order: rowIndex + 1,
        scalable: rowIndex !== ingredientIndexes.length - 1,
      });
    });
  });

  return {
    ingredients,
    synonyms,
    recipes,
    recipeIngredients,
    scenario: {
      searchQuery: `${PERF_INGREDIENT_NAME_PREFIX} 00`,
      filterIngredientIds,
      filterIngredientNames: [
        ingredients[0].standard_name,
        ingredients[1].standard_name,
      ],
      matchedRecipeCount: sharedFilterMatchCount,
      recipeTitlePrefix: PERF_RECIPE_TITLE_PREFIX,
    },
  };
}
