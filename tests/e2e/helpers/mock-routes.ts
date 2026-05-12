import type { Page } from "@playwright/test";
import type { RecipeCardItem, RecipeDetail } from "@/types/recipe";

import {
  getMockIngredientList,
  getMockRecipeList,
  getMockRecipeThemes,
  getQaFixtureRecipePath,
  MOCK_DISCOVERY_FILTER_BEEF_ID,
  MOCK_DISCOVERY_FILTER_GREEN_ONION_ID,
  MOCK_DISCOVERY_FILTER_ONION_ID,
  MOCK_RECIPE_DETAIL,
  MOCK_RECIPE_ID,
} from "../../../lib/mock/recipes";

export const ONION_ID = MOCK_DISCOVERY_FILTER_ONION_ID;
export const GREEN_ONION_ID = MOCK_DISCOVERY_FILTER_GREEN_ONION_ID;
export const BEEF_ID = MOCK_DISCOVERY_FILTER_BEEF_ID;
export const RECIPE_ID = MOCK_RECIPE_ID;
export const RECIPE_PATH = `/recipe/${RECIPE_ID}`;

function buildRecipeItems(searchUrl: URL) {
  const query = searchUrl.searchParams.get("q")?.trim() ?? "";
  const ingredientIds = (searchUrl.searchParams.get("ingredient_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const baseItems = getMockRecipeList(query, ingredientIds).items;

  if (baseItems.length === 0) {
    return [];
  }

  return buildDenseDiscoveryItems(baseItems[0]!);
}

function buildDenseDiscoveryItems(primaryItem: RecipeCardItem) {
  const primary = {
    ...primaryItem,
    thumbnail_url: null,
    view_count: 1921,
    save_count: 89,
  };
  const variants: RecipeCardItem[] = [
    primary,
    {
      ...primary,
      id: `${primary.id}-soy-stew`,
      title: "된장찌개 기본",
      tags: ["집밥", "찌개", "한식"],
      view_count: 1520,
      save_count: 980,
    },
    {
      ...primary,
      id: `${primary.id}-spicy-pork`,
      title: "매콤 돼지고기 볶음",
      tags: ["육류", "매콤", "저녁"],
      view_count: 1418,
      save_count: 860,
    },
    {
      ...primary,
      id: `${primary.id}-rice-bowl`,
      title: "남은 밥 한 그릇",
      tags: ["밥", "간단식", "혼밥"],
      view_count: 1260,
      save_count: 740,
    },
    {
      ...primary,
      id: `${primary.id}-tofu`,
      title: "두부 채소조림",
      tags: ["채소", "두부", "반찬"],
      view_count: 1014,
      save_count: 522,
    },
    {
      ...primary,
      id: `${primary.id}-noodle`,
      title: "빠른 잔치국수",
      tags: ["면", "간단식", "점심"],
      view_count: 884,
      save_count: 420,
    },
  ];

  return variants;
}

function buildRecipeDetail({
  isLiked = false,
  likeCount = 203,
  recipeDetail,
}: {
  isLiked?: boolean;
  likeCount?: number;
  recipeDetail?: Partial<RecipeDetail>;
} = {}) {
  return {
    ...MOCK_RECIPE_DETAIL,
    ...recipeDetail,
    like_count: likeCount,
    user_status: recipeDetail?.user_status ?? {
      is_liked: isLiked,
      is_saved: false,
      saved_book_ids: [],
    },
  };
}

export async function installDiscoveryRoutes(page: Page) {
  await page.route("**/api/v1/recipes/themes", async (route) => {
    const recipes = buildRecipeItems(new URL("http://localhost/api/v1/recipes"));

    await route.fulfill({
      json: {
        success: true,
        data: {
          themes: [
            {
              ...getMockRecipeThemes().themes[0],
              id: "solo",
              title: "자취생 간단식",
              recipes,
            },
            {
              id: "home-basic",
              title: "집밥 기본기",
              recipes,
            },
            {
              id: "light",
              title: "다이어트 식단",
              recipes,
            },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/ingredients**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const items = getMockIngredientList(
      requestUrl.searchParams.get("q"),
      requestUrl.searchParams.get("category"),
    ).items;

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
    recipeDetail,
  }: {
    initialLiked?: boolean;
    initialLikeCount?: number;
    recipeDetail?: Partial<RecipeDetail>;
  } = {},
) {
  let isLiked = initialLiked;
  let likeCount = initialLikeCount;
  const recipePath = getQaFixtureRecipePath();

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
        data: buildRecipeDetail({ isLiked, likeCount, recipeDetail }),
        error: null,
      },
    });
  });

  if (RECIPE_PATH !== recipePath) {
    throw new Error(`Fixture recipe path drift detected: ${recipePath}`);
  }
}
