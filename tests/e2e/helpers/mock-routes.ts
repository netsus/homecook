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
export const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
export const E2E_APP_ORIGIN =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
export const PLANNER_VISUAL_PATH = "/planner";
export const MEAL_VISUAL_PLAN_DATE = "2026-05-18";
export const MEAL_VISUAL_COLUMN_ID = "col-dinner";
export const MEAL_VISUAL_SLOT_NAME = "저녁";
export const MEAL_VISUAL_PATH = `/planner/${MEAL_VISUAL_PLAN_DATE}/${MEAL_VISUAL_COLUMN_ID}?slot=${encodeURIComponent(MEAL_VISUAL_SLOT_NAME)}`;

const PLANNER_COLUMNS = [
  { id: "col-breakfast", name: "아침", sort_order: 0 },
  { id: "col-lunch", name: "점심", sort_order: 1 },
  { id: MEAL_VISUAL_COLUMN_ID, name: "저녁", sort_order: 2 },
] as const;

const FOOD_IMAGES = {
  bibimbap:
    "https://images.unsplash.com/photo-1553163147-622ab57be1c7?w=900&h=675&fit=crop&q=80",
  kimchi:
    "https://images.unsplash.com/photo-1583224944844-5b268c057b72?w=900&h=675&fit=crop&q=80",
  jjigae:
    "https://images.unsplash.com/photo-1582450871972-ab5ca641643d?w=900&h=675&fit=crop&q=80",
  salad:
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900&h=675&fit=crop&q=80",
  soup:
    "https://images.unsplash.com/photo-1604152135912-04a022e23696?w=900&h=675&fit=crop&q=80",
} as const;

const MEAL_VISUAL_ITEMS = [
  {
    id: "meal-visual-1",
    recipe_id: RECIPE_ID,
    recipe_title: "김치찌개",
    recipe_thumbnail_url: FOOD_IMAGES.jjigae,
    planned_servings: 2,
    status: "shopping_done",
    is_leftover: false,
  },
  {
    id: "meal-visual-2",
    recipe_id: `${RECIPE_ID}-side`,
    recipe_title: "미역국",
    recipe_thumbnail_url: FOOD_IMAGES.soup,
    planned_servings: 3,
    status: "registered",
    is_leftover: false,
  },
] as const;

export async function setE2EAuthOverride(
  page: Page,
  value: "authenticated" | "guest" = "authenticated",
) {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_KEY,
      sameSite: "Lax",
      url: E2E_APP_ORIGIN,
      value,
    },
  ]);
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

function shiftDateKey(dateKey: string, dayDelta: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return date.toISOString().slice(0, 10);
}

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

export async function installPlannerWeekRoutes(page: Page) {
  await page.route("**/api/v1/planner?*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const startDate =
      requestUrl.searchParams.get("start_date") ?? MEAL_VISUAL_PLAN_DATE;

    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: PLANNER_COLUMNS,
          meals: [
            {
              id: "planner-meal-1",
              recipe_id: RECIPE_ID,
              recipe_title: "김치찌개",
              recipe_thumbnail_url: FOOD_IMAGES.jjigae,
              plan_date: startDate,
              column_id: MEAL_VISUAL_COLUMN_ID,
              planned_servings: 2,
              status: "registered",
              is_leftover: false,
              shopping_list_id: null,
              shopping_list_title: null,
            },
            {
              id: "planner-meal-2",
              recipe_id: `${RECIPE_ID}-doenjang`,
              recipe_title: "된장찌개",
              recipe_thumbnail_url: FOOD_IMAGES.soup,
              plan_date: shiftDateKey(startDate, 1),
              column_id: "col-lunch",
              planned_servings: 3,
              status: "shopping_done",
              is_leftover: false,
              shopping_list_id: "shopping-visual-1",
              shopping_list_title: "이번 주 장보기",
            },
            {
              id: "planner-meal-3",
              recipe_id: `${RECIPE_ID}-salad`,
              recipe_title: "닭가슴살 샐러드",
              recipe_thumbnail_url: FOOD_IMAGES.salad,
              plan_date: shiftDateKey(startDate, 2),
              column_id: MEAL_VISUAL_COLUMN_ID,
              planned_servings: 1,
              status: "cook_done",
              is_leftover: false,
              shopping_list_id: "shopping-visual-1",
              shopping_list_title: "이번 주 장보기",
            },
            {
              id: "planner-meal-4",
              recipe_id: `${RECIPE_ID}-fried-rice`,
              recipe_title: "김치볶음밥",
              recipe_thumbnail_url: FOOD_IMAGES.kimchi,
              plan_date: shiftDateKey(startDate, 4),
              column_id: "col-breakfast",
              planned_servings: 2,
              status: "registered",
              is_leftover: true,
              shopping_list_id: null,
              shopping_list_title: null,
            },
          ],
        },
        error: null,
      },
    });
  });
}

export async function installMealDetailRoutes(page: Page) {
  await page.route("**/api/v1/meals?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: { items: MEAL_VISUAL_ITEMS },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/meals/*", async (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      await route.fulfill({
        json: {
          success: true,
          data: {
            id: "meal-visual-1",
            planned_servings: 3,
            status: "shopping_done",
          },
          error: null,
        },
      });
      return;
    }

    if (method === "DELETE") {
      await route.fulfill({ status: 204 });
      return;
    }

    await route.continue();
  });
}
