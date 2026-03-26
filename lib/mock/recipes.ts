import type {
  IngredientItem,
  IngredientListData,
  RecipeCardItem,
  RecipeDetail,
  RecipeListData,
  RecipeThemesData,
} from "@/types/recipe";

export const MOCK_RECIPE_ID = "mock-kimchi-jjigae";
export const MOCK_DISCOVERY_FILTER_ONION_ID = "550e8400-e29b-41d4-a716-446655440010";
export const MOCK_DISCOVERY_FILTER_GREEN_ONION_ID = "550e8400-e29b-41d4-a716-446655440011";
export const MOCK_DISCOVERY_FILTER_BEEF_ID = "550e8400-e29b-41d4-a716-446655440012";

const MOCK_DISCOVERY_FILTER_INGREDIENTS: IngredientItem[] = [
  {
    id: MOCK_DISCOVERY_FILTER_ONION_ID,
    standard_name: "양파",
    category: "채소",
  },
  {
    id: MOCK_DISCOVERY_FILTER_GREEN_ONION_ID,
    standard_name: "대파",
    category: "채소",
  },
  {
    id: MOCK_DISCOVERY_FILTER_BEEF_ID,
    standard_name: "소고기",
    category: "육류",
  },
];

const MOCK_RECIPE_INGREDIENT_IDS = [
  MOCK_DISCOVERY_FILTER_ONION_ID,
  MOCK_DISCOVERY_FILTER_GREEN_ONION_ID,
];

export const MOCK_RECIPE_CARD: RecipeCardItem = {
  id: MOCK_RECIPE_ID,
  title: "집밥 김치찌개",
  thumbnail_url:
    "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80",
  tags: ["한식", "찌개", "저녁"],
  base_servings: 2,
  view_count: 1284,
  like_count: 203,
  save_count: 89,
  source_type: "system",
};

export const MOCK_RECIPE_DETAIL: RecipeDetail = {
  id: MOCK_RECIPE_ID,
  title: "집밥 김치찌개",
  description:
    "신김치와 돼지고기만 있으면 금방 끓일 수 있는 가장 기본적인 집밥 김치찌개예요.",
  thumbnail_url: MOCK_RECIPE_CARD.thumbnail_url,
  base_servings: 2,
  tags: MOCK_RECIPE_CARD.tags,
  source_type: "system",
  source: null,
  view_count: 1285,
  like_count: 203,
  save_count: 89,
  plan_count: 52,
  cook_count: 34,
  ingredients: [
    {
      id: "mock-ing-1",
      ingredient_id: "ingredient-kimchi",
      standard_name: "김치",
      amount: 200,
      unit: "g",
      ingredient_type: "QUANT",
      display_text: "김치 200g",
      scalable: true,
      sort_order: 1,
    },
    {
      id: "mock-ing-2",
      ingredient_id: "ingredient-pork",
      standard_name: "돼지고기",
      amount: 180,
      unit: "g",
      ingredient_type: "QUANT",
      display_text: "돼지고기 180g",
      scalable: true,
      sort_order: 2,
    },
    {
      id: "mock-ing-3",
      ingredient_id: "ingredient-onion",
      standard_name: "양파",
      amount: 0.5,
      unit: "개",
      ingredient_type: "QUANT",
      display_text: "양파 1/2개",
      scalable: true,
      sort_order: 3,
    },
    {
      id: "mock-ing-4",
      ingredient_id: "ingredient-green-onion",
      standard_name: "대파",
      amount: 0.5,
      unit: "대",
      ingredient_type: "QUANT",
      display_text: "대파 1/2대",
      scalable: true,
      sort_order: 4,
    },
    {
      id: "mock-ing-5",
      ingredient_id: "ingredient-salt",
      standard_name: "소금",
      amount: null,
      unit: null,
      ingredient_type: "TO_TASTE",
      display_text: "소금 약간",
      scalable: false,
      sort_order: 5,
    },
  ],
  steps: [
    {
      id: "mock-step-1",
      step_number: 1,
      instruction: "냄비에 돼지고기와 김치를 먼저 볶아 향을 올립니다.",
      cooking_method: {
        id: "method-stir",
        code: "stir_fry",
        label: "볶기",
        color_key: "orange",
      },
      ingredients_used: [],
      heat_level: "중",
      duration_seconds: 180,
      duration_text: "3분",
    },
    {
      id: "mock-step-2",
      step_number: 2,
      instruction: "물을 붓고 양파를 넣은 뒤 10분 정도 끓입니다.",
      cooking_method: {
        id: "method-boil",
        code: "boil",
        label: "끓이기",
        color_key: "red",
      },
      ingredients_used: [],
      heat_level: "중",
      duration_seconds: 600,
      duration_text: "10분",
    },
    {
      id: "mock-step-3",
      step_number: 3,
      instruction: "대파를 올리고 소금으로 간을 마무리합니다.",
      cooking_method: {
        id: "method-finish",
        code: "finish",
        label: "마무리",
        color_key: "green",
      },
      ingredients_used: [],
      heat_level: null,
      duration_seconds: 60,
      duration_text: "1분",
    },
  ],
  user_status: null,
};

export function isDiscoveryFilterManualMockEnabled() {
  return process.env.HOMECOOK_ENABLE_DISCOVERY_FILTER_MOCK === "1";
}

export function getMockIngredientList(
  query?: string | null,
  category?: string | null,
): IngredientListData {
  const normalizedQuery = query?.trim() ?? "";
  const normalizedCategory = category?.trim() ?? "";

  const items = MOCK_DISCOVERY_FILTER_INGREDIENTS.filter((ingredient) => {
    const matchesCategory =
      normalizedCategory.length === 0 || ingredient.category === normalizedCategory;
    const matchesQuery =
      normalizedQuery.length === 0 || ingredient.standard_name.includes(normalizedQuery);

    return matchesCategory && matchesQuery;
  });

  return { items };
}

export function getMockRecipeList(
  query?: string | null,
  ingredientIds?: string[] | null,
): RecipeListData {
  const normalized = query?.trim().toLowerCase() ?? "";
  const hasRequiredIngredients = !ingredientIds?.length
    || ingredientIds.every((ingredientId) =>
      MOCK_RECIPE_INGREDIENT_IDS.includes(ingredientId),
    );

  const items =
    hasRequiredIngredients
    && (
      !normalized
      || MOCK_RECIPE_CARD.title.toLowerCase().includes(normalized)
      || MOCK_RECIPE_CARD.tags.some((tag) => tag.toLowerCase().includes(normalized))
    )
      ? [MOCK_RECIPE_CARD]
      : [];

  return {
    items,
    next_cursor: null,
    has_next: false,
  };
}

export function getMockRecipeThemes(): RecipeThemesData {
  return {
    themes: [
      {
        id: "popular",
        title: "이번 주 인기 레시피",
        recipes: [MOCK_RECIPE_CARD],
      },
    ],
  };
}
