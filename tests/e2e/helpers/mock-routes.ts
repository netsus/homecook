import type { Page } from "@playwright/test";

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

  return getMockRecipeList(query, ingredientIds).items;
}

function buildRecipeDetail({
  isLiked = false,
  likeCount = 203,
}: {
  isLiked?: boolean;
  likeCount?: number;
} = {}) {
  return {
    ...MOCK_RECIPE_DETAIL,
    like_count: likeCount,
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
              ...getMockRecipeThemes().themes[0],
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
  }: {
    initialLiked?: boolean;
    initialLikeCount?: number;
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
        data: buildRecipeDetail({ isLiked, likeCount }),
        error: null,
      },
    });
  });

  if (RECIPE_PATH !== recipePath) {
    throw new Error(`Fixture recipe path drift detected: ${recipePath}`);
  }
}
