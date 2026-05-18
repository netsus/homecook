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
export const MENU_ADD_VISUAL_PLAN_DATE = "2026-05-20";
export const MENU_ADD_VISUAL_COLUMN_ID = "col-lunch";
export const MENU_ADD_VISUAL_SLOT_NAME = "점심";
export const MENU_ADD_VISUAL_PATH = `/menu-add?date=${MENU_ADD_VISUAL_PLAN_DATE}&columnId=${MENU_ADD_VISUAL_COLUMN_ID}&slot=${encodeURIComponent(MENU_ADD_VISUAL_SLOT_NAME)}`;
export const MANUAL_CREATE_VISUAL_PATH = `/menu/add/manual?date=${MENU_ADD_VISUAL_PLAN_DATE}&columnId=${MENU_ADD_VISUAL_COLUMN_ID}&slot=${encodeURIComponent(MENU_ADD_VISUAL_SLOT_NAME)}`;
export const YOUTUBE_IMPORT_VISUAL_PATH = `/menu/add/youtube?date=${MENU_ADD_VISUAL_PLAN_DATE}&columnId=${MENU_ADD_VISUAL_COLUMN_ID}&slot=${encodeURIComponent(MENU_ADD_VISUAL_SLOT_NAME)}`;

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

function createQaFoodThumbDataUri(emoji: string, background: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180">
      <rect width="240" height="180" fill="${background}"/>
      <circle cx="120" cy="82" r="54" fill="rgba(255,255,255,0.52)"/>
      <text x="120" y="104" text-anchor="middle" font-size="54">${emoji}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const MENU_ADD_RECIPE_ITEMS = [
  {
    base_servings: 1,
    id: "recipe-kimchi-rice",
    like_count: 420,
    save_count: 154,
    source_type: "system",
    tags: ["15분", "자취생 간단식", "볶기", "묵은지"],
    thumbnail_url: createQaFoodThumbDataUri("🍚", "#FFE2CF"),
    title: "김치볶음밥",
    view_count: 5036,
  },
  {
    base_servings: 2,
    id: "recipe-doenjang",
    like_count: 352,
    save_count: 98,
    source_type: "system",
    tags: ["25분", "집밥 기본기", "끓이기", "된장"],
    thumbnail_url: createQaFoodThumbDataUri("🍲", "#FFC6CA"),
    title: "된장찌개",
    view_count: 8252,
  },
  {
    base_servings: 1,
    id: "recipe-salad",
    like_count: 219,
    save_count: 62,
    source_type: "system",
    tags: ["10분", "다이어트 식단", "무치기", "닭가슴살"],
    thumbnail_url: createQaFoodThumbDataUri("🥗", "#DDF4CF"),
    title: "닭가슴살 샐러드",
    view_count: 3357,
  },
  {
    base_servings: 2,
    id: "recipe-jeyuk",
    like_count: 380,
    save_count: 120,
    source_type: "system",
    tags: ["20분", "밥도둑", "볶기", "돼지고기 앞다리살"],
    thumbnail_url: createQaFoodThumbDataUri("🥩", "#FFAC87"),
    title: "제육볶음",
    view_count: 12000,
  },
  {
    base_servings: 2,
    id: "recipe-salmon",
    like_count: 190,
    save_count: 66,
    source_type: "system",
    tags: ["20분", "주말 특식", "굽기", "연어"],
    thumbnail_url: createQaFoodThumbDataUri("🐟", "#FFC19F"),
    title: "연어 스테이크",
    view_count: 3788,
  },
  {
    base_servings: 2,
    id: "recipe-sujebi",
    like_count: 160,
    save_count: 52,
    source_type: "system",
    tags: ["30분", "비오는 날", "끓이기", "밀가루"],
    thumbnail_url: createQaFoodThumbDataUri("🥟", "#E7D9B7"),
    title: "감자 수제비",
    view_count: 2464,
  },
];

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

export async function installMenuAddVisualRoutes(page: Page) {
  await page.route("**/api/v1/recipes", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          id: "recipe-manual-created",
          title: "새 집밥 레시피",
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes?*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || url.pathname !== "/api/v1/recipes") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          items: MENU_ADD_RECIPE_ITEMS,
          has_next: false,
          next_cursor: null,
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipe-books", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          books: [
            {
              book_type: "saved",
              id: "book-saved",
              name: "저장한 레시피",
              recipe_count: 8,
              sort_order: 1,
            },
            {
              book_type: "custom",
              id: "book-quick",
              name: "평일 저녁 빠른요리",
              recipe_count: 12,
              sort_order: 2,
            },
            {
              book_type: "custom",
              id: "book-weekend",
              name: "주말 한 상 차림",
              recipe_count: 5,
              sort_order: 3,
            },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipe-books/book-quick/recipes*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          items: MENU_ADD_RECIPE_ITEMS.map((recipe, index) => ({
            added_at: `2026-05-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`,
            recipe_id: recipe.id,
            tags: recipe.tags.slice(0, 2),
            thumbnail_url: recipe.thumbnail_url,
            title: recipe.title,
          })),
          has_next: false,
          next_cursor: null,
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes/pantry-match*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          items: MENU_ADD_RECIPE_ITEMS.slice(0, 5).map((recipe, index) => ({
            id: recipe.id,
            match_score: [0.86, 0.68, 0.5, 0.28, 0.12][index] ?? 0,
            matched_ingredients: [6, 4, 3, 2, 1][index] ?? 0,
            missing_ingredients: [
              { id: `missing-${index}-1`, standard_name: "대파" },
              { id: `missing-${index}-2`, standard_name: "마늘" },
            ],
            thumbnail_url: recipe.thumbnail_url,
            title: recipe.title,
            total_ingredients: 7,
          })),
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/cooking-methods", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          methods: [
            {
              id: "method-prep",
              code: "prep",
              label: "손질",
              color_key: "prep",
              sort_order: 0,
            },
            {
              id: "method-stir-fry",
              code: "stir_fry",
              label: "볶기",
              color_key: "stir_fry",
              sort_order: 1,
            },
            {
              id: "method-boil",
              code: "boil",
              label: "끓이기",
              color_key: "boil",
              sort_order: 2,
            },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/ingredients**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              category: "vegetable",
              default_unit: "g",
              id: "ingredient-kimchi",
              standard_name: "김치",
            },
            {
              category: "protein",
              default_unit: "g",
              id: "ingredient-pork",
              standard_name: "돼지고기",
            },
            {
              category: "vegetable",
              default_unit: "개",
              id: "ingredient-onion",
              standard_name: "양파",
            },
            {
              category: "seasoning",
              default_unit: "큰술",
              id: "ingredient-garlic",
              standard_name: "다진 마늘",
            },
            {
              category: "grain",
              default_unit: "공기",
              id: "ingredient-rice",
              standard_name: "찬밥",
            },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/meals", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          column_id: MENU_ADD_VISUAL_COLUMN_ID,
          id: "meal-created",
          is_leftover: false,
          leftover_dish_id: null,
          plan_date: MENU_ADD_VISUAL_PLAN_DATE,
          planned_servings: 2,
          recipe_id: "recipe-kimchi-rice",
          status: "registered",
        },
        error: null,
      },
    });
  });
}

export async function installYoutubeImportVisualRoutes(page: Page) {
  await installMenuAddVisualRoutes(page);

  await page.route("**/api/v1/recipes/youtube/validate", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          is_valid_url: true,
          is_recipe_video: true,
          video_info: {
            video_id: "recipe12345",
            title: "백종원 김치찌개",
            channel: "백종원의 요리비책",
            thumbnail_url: createQaFoodThumbDataUri("🍲", "#FFC6CA"),
          },
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          extraction_id: "ext-visual-001",
          title: "백종원 김치찌개",
          base_servings: 2,
          extraction_methods: ["description", "ocr"],
          ingredients: [
            {
              ingredient_id: "ingredient-kimchi",
              standard_name: "김치",
              amount: 200,
              unit: "g",
              ingredient_type: "QUANT",
              display_text: "김치 200g",
              sort_order: 1,
              scalable: true,
              confidence: 0.9,
            },
            {
              ingredient_id: "ingredient-pork",
              standard_name: "돼지고기",
              amount: 300,
              unit: "g",
              ingredient_type: "QUANT",
              display_text: "돼지고기 300g",
              sort_order: 2,
              scalable: true,
              confidence: 0.85,
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "김치를 한입 크기로 썬다",
              cooking_method: {
                id: "method-prep",
                code: "prep",
                label: "손질",
                color_key: "prep",
                is_new: false,
              },
              duration_text: null,
            },
            {
              step_number: 2,
              instruction: "돼지고기를 중불에서 볶는다",
              cooking_method: {
                id: "method-stir-fry",
                code: "stir_fry",
                label: "볶기",
                color_key: "stir_fry",
                is_new: false,
              },
              duration_text: "5분",
            },
            {
              step_number: 3,
              instruction: "물을 넣고 끓인다",
              cooking_method: {
                id: "method-boil",
                code: "boil",
                label: "끓이기",
                color_key: "boil",
                is_new: false,
              },
              duration_text: "20분",
            },
          ],
          new_cooking_methods: [],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes/youtube/register", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          recipe_id: "recipe-yt-001",
          title: "백종원 김치찌개",
        },
        error: null,
      },
    });
  });
}
