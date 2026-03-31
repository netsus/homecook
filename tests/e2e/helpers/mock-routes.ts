import type { Page } from "@playwright/test";

export const ONION_ID = "550e8400-e29b-41d4-a716-446655440010";
export const GREEN_ONION_ID = "550e8400-e29b-41d4-a716-446655440011";
export const BEEF_ID = "550e8400-e29b-41d4-a716-446655440012";
export const RECIPE_ID = "mock-kimchi-jjigae";
export const RECIPE_PATH = `/recipe/${RECIPE_ID}`;

const INGREDIENTS = [
  {
    id: ONION_ID,
    standard_name: "양파",
    category: "채소",
  },
  {
    id: GREEN_ONION_ID,
    standard_name: "대파",
    category: "채소",
  },
  {
    id: BEEF_ID,
    standard_name: "소고기",
    category: "육류",
  },
] as const;

const RECIPES = [
  {
    id: RECIPE_ID,
    title: "집밥 김치찌개",
    thumbnail_url:
      "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80",
    tags: ["한식", "찌개", "저녁"],
    base_servings: 2,
    view_count: 1284,
    like_count: 203,
    save_count: 89,
    source_type: "system",
    ingredient_ids: [ONION_ID, GREEN_ONION_ID],
  },
];

function buildRecipeItems(searchUrl: URL) {
  const query = searchUrl.searchParams.get("q")?.trim() ?? "";
  const ingredientIds = (searchUrl.searchParams.get("ingredient_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return RECIPES.filter((recipe) => {
    const matchesQuery = query.length === 0 || recipe.title.includes(query);
    const matchesIngredients =
      ingredientIds.length === 0 ||
      ingredientIds.every((ingredientId) =>
        recipe.ingredient_ids.includes(ingredientId),
      );

    return matchesQuery && matchesIngredients;
  }).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    thumbnail_url: recipe.thumbnail_url,
    tags: recipe.tags,
    base_servings: recipe.base_servings,
    view_count: recipe.view_count,
    like_count: recipe.like_count,
    save_count: recipe.save_count,
    source_type: recipe.source_type,
  }));
}

function buildRecipeDetail({
  isLiked = false,
  likeCount = 203,
}: {
  isLiked?: boolean;
  likeCount?: number;
} = {}) {
  return {
    id: RECIPE_ID,
    title: "집밥 김치찌개",
    description:
      "신김치와 돼지고기만 있으면 금방 끓일 수 있는 가장 기본적인 집밥 김치찌개예요.",
    thumbnail_url:
      "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80",
    base_servings: 2,
    tags: ["한식", "찌개", "저녁"],
    source_type: "system",
    source: null,
    view_count: 1285,
    like_count: likeCount,
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
    ],
    user_status: {
      is_liked: isLiked,
      is_saved: false,
      saved_book_ids: [],
    },
  };
}

export async function installDiscoveryRoutes(page: Page) {
  await page.route("**/api/v1/recipes/themes", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          themes: [
            {
              id: "popular",
              title: "이번 주 인기 레시피",
              recipes: buildRecipeItems(new URL("http://localhost/api/v1/recipes")),
            },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/ingredients**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const query = requestUrl.searchParams.get("q")?.trim() ?? "";
    const category = requestUrl.searchParams.get("category");
    const items = INGREDIENTS.filter((ingredient) => {
      const matchesCategory = !category || ingredient.category === category;
      const matchesQuery =
        query.length === 0 || ingredient.standard_name.includes(query);

      return matchesCategory && matchesQuery;
    });

    await route.fulfill({
      json: {
        success: true,
        data: { items },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes?**", async (route) => {
    const requestUrl = new URL(route.request().url());

    await route.fulfill({
      json: {
        success: true,
        data: {
          items: buildRecipeItems(requestUrl),
          next_cursor: null,
          has_next: false,
        },
        error: null,
      },
    });
  });
}

export async function installRecipeDetailRoutes(
  page: Page,
  {
    initialLiked = false,
    initialLikeCount = 203,
  }: {
    initialLiked?: boolean;
    initialLikeCount?: number;
  } = {},
) {
  let isLiked = initialLiked;
  let likeCount = initialLikeCount;

  await page.route(`**/api/v1/recipes/${RECIPE_ID}/like`, async (route) => {
    isLiked = !isLiked;
    likeCount = isLiked ? likeCount + 1 : Math.max(0, likeCount - 1);

    await route.fulfill({
      json: {
        success: true,
        data: {
          is_liked: isLiked,
          like_count: likeCount,
        },
        error: null,
      },
    });
  });

  await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: buildRecipeDetail({ isLiked, likeCount }),
        error: null,
      },
    });
  });
}
