import type { Page } from "@playwright/test";
import type { LeftoverListItemData } from "@/types/leftover";
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
export const PANTRY_VISUAL_PATH = "/pantry";
export const SHOPPING_FLOW_VISUAL_PATH = "/shopping/flow";
export const SHOPPING_DETAIL_VISUAL_LIST_ID = "shopping-visual-active";
export const SHOPPING_DETAIL_COMPLETED_VISUAL_LIST_ID = "shopping-visual-completed";
export const SHOPPING_DETAIL_VISUAL_PATH = `/shopping/lists/${SHOPPING_DETAIL_VISUAL_LIST_ID}`;
export const SHOPPING_DETAIL_COMPLETED_VISUAL_PATH = `/shopping/lists/${SHOPPING_DETAIL_COMPLETED_VISUAL_LIST_ID}`;
export const MYPAGE_VISUAL_PATH = "/mypage";
export const SETTINGS_VISUAL_PATH = "/settings";
export const LOGIN_VISUAL_PATH = "/login";
export const RECIPEBOOK_DETAIL_VISUAL_BOOK_ID = "book-custom";
export const RECIPEBOOK_DETAIL_VISUAL_PATH =
  `/mypage/recipe-books/${RECIPEBOOK_DETAIL_VISUAL_BOOK_ID}?type=custom&name=${encodeURIComponent("주말 파티")}`;
export const COOK_MODE_VISUAL_SESSION_ID = "session-visual";
export const COOK_MODE_VISUAL_PATH =
  `/cooking/sessions/${COOK_MODE_VISUAL_SESSION_ID}/cook-mode`;
export const STANDALONE_COOK_MODE_VISUAL_PATH =
  `/cooking/recipes/${RECIPE_ID}/cook-mode?servings=2`;
export const LEFTOVERS_VISUAL_PATH = "/leftovers";
export const ATE_LIST_VISUAL_PATH = "/leftovers/ate";

const PLANNER_COLUMNS = [
  { id: "col-breakfast", name: "아침", sort_order: 0 },
  { id: "col-lunch", name: "점심", sort_order: 1 },
  { id: MEAL_VISUAL_COLUMN_ID, name: "저녁", sort_order: 2 },
] as const;

const ACCOUNT_VISUAL_PROFILE = {
  email: "user@example.com",
  id: "user-1",
  nickname: "집밥러",
  profile_image_url: null,
  settings: { screen_wake_lock: false },
  social_provider: "kakao",
} as const;

const ACCOUNT_VISUAL_BOOKS = [
  {
    book_type: "my_added",
    id: "book-my",
    name: "내가 추가한 레시피",
    recipe_count: 3,
    sort_order: 0,
  },
  {
    book_type: "saved",
    id: "book-saved",
    name: "저장한 레시피",
    recipe_count: 5,
    sort_order: 1,
  },
  {
    book_type: "liked",
    id: "book-liked",
    name: "좋아요한 레시피",
    recipe_count: 10,
    sort_order: 2,
  },
  {
    book_type: "custom",
    id: RECIPEBOOK_DETAIL_VISUAL_BOOK_ID,
    name: "주말 파티",
    recipe_count: 4,
    sort_order: 3,
  },
] as const;

const LEFTOVERS_VISUAL_ITEMS = [
  {
    cooking_servings: 2,
    cooked_at: "2026-05-13T09:00:00.000Z",
    eaten_at: null,
    id: "leftover-visual-1",
    recipe_id: RECIPE_ID,
    recipe_thumbnail_url: createQaFoodThumbDataUri("🍚", "#FFE2CF"),
    recipe_title: "김치볶음밥",
    source_meal_label: "저녁",
    source_planned_servings: 2,
    status: "leftover",
  },
  {
    cooking_servings: 1,
    cooked_at: "2026-05-12T09:00:00.000Z",
    eaten_at: null,
    id: "leftover-visual-2",
    recipe_id: "recipe-soondubu",
    recipe_thumbnail_url: createQaFoodThumbDataUri("🍲", "#FFC6CA"),
    recipe_title: "순두부찌개",
    source_meal_label: "점심",
    source_planned_servings: 1,
    status: "leftover",
  },
  {
    cooking_servings: 2,
    cooked_at: "2026-05-11T09:00:00.000Z",
    eaten_at: null,
    id: "leftover-visual-3",
    recipe_id: "recipe-bibimbap",
    recipe_thumbnail_url: createQaFoodThumbDataUri("🥗", "#DDF4CF"),
    recipe_title: "비빔밥",
    source_meal_label: "직접 기록",
    source_planned_servings: 2,
    status: "leftover",
  },
] as const satisfies ReadonlyArray<LeftoverListItemData>;

const ATE_LIST_VISUAL_ITEMS = [
  {
    cooking_servings: 2,
    cooked_at: "2026-05-10T09:00:00.000Z",
    eaten_at: "2026-05-14T12:00:00.000Z",
    id: "ate-visual-1",
    recipe_id: RECIPE_ID,
    recipe_thumbnail_url: createQaFoodThumbDataUri("🍚", "#FFE2CF"),
    recipe_title: "김치볶음밥",
    source_meal_label: "저녁",
    source_planned_servings: 2,
    status: "eaten",
  },
  {
    cooking_servings: 1,
    cooked_at: "2026-05-09T09:00:00.000Z",
    eaten_at: "2026-05-13T12:00:00.000Z",
    id: "ate-visual-2",
    recipe_id: "recipe-soondubu",
    recipe_thumbnail_url: createQaFoodThumbDataUri("🍲", "#FFC6CA"),
    recipe_title: "순두부찌개",
    source_meal_label: "점심",
    source_planned_servings: 1,
    status: "eaten",
  },
] as const satisfies ReadonlyArray<LeftoverListItemData>;

const ACCOUNT_VISUAL_SHOPPING_HISTORY = [
  {
    completed_at: "2026-05-01T09:30:00.000Z",
    created_at: "2026-04-30T00:00:00.000Z",
    date_range_end: "2026-05-06",
    date_range_start: "2026-04-30",
    id: "list-account-1",
    is_completed: true,
    item_count: 12,
    title: "4/30 장보기",
  },
  {
    completed_at: null,
    created_at: "2026-04-23T00:00:00.000Z",
    date_range_end: "2026-04-29",
    date_range_start: "2026-04-23",
    id: "list-account-2",
    is_completed: false,
    item_count: 8,
    title: "4/23 장보기",
  },
] as const;

const ACCOUNT_VISUAL_RECIPEBOOK_ITEMS = [
  {
    added_at: "2026-04-30T09:00:00.000Z",
    base_servings: 2,
    recipe_id: "recipe-doenjang",
    tags: ["한식", "찌개"],
    thumbnail_url: createQaFoodThumbDataUri("🍲", "#FFE2CF"),
    title: "된장찌개",
    total_duration_text: "35분",
    view_count: 128,
  },
  {
    added_at: "2026-04-29T09:00:00.000Z",
    base_servings: 1,
    recipe_id: "recipe-kimchi-rice",
    tags: ["한식"],
    thumbnail_url: createQaFoodThumbDataUri("🍚", "#FFD7C2"),
    title: "김치볶음밥",
    total_duration_text: "20분",
    view_count: 87,
  },
  {
    added_at: "2026-04-28T09:00:00.000Z",
    base_servings: 2,
    recipe_id: "recipe-jeyuk",
    tags: ["한식", "볶음"],
    thumbnail_url: createQaFoodThumbDataUri("🥩", "#FFAC87"),
    title: "제육볶음",
    total_duration_text: "25분",
    view_count: 96,
  },
  {
    added_at: "2026-04-27T09:00:00.000Z",
    base_servings: 2,
    recipe_id: "recipe-salmon-steak",
    tags: ["양식", "구이"],
    thumbnail_url: createQaFoodThumbDataUri("🐟", "#FFC19F"),
    title: "연어 스테이크",
    total_duration_text: "22분",
    view_count: 74,
  },
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

const PANTRY_VISUAL_ITEMS = [
  {
    category: "채소",
    created_at: "2026-05-10T09:00:00.000Z",
    id: "pantry-visual-1",
    ingredient_id: "ingredient-kimchi",
    standard_name: "김치",
  },
  {
    category: "채소",
    created_at: "2026-05-10T09:01:00.000Z",
    id: "pantry-visual-2",
    ingredient_id: "ingredient-onion",
    standard_name: "양파",
  },
  {
    category: "채소",
    created_at: "2026-05-10T09:02:00.000Z",
    id: "pantry-visual-3",
    ingredient_id: "ingredient-green-onion",
    standard_name: "대파",
  },
  {
    category: "육류",
    created_at: "2026-05-10T09:03:00.000Z",
    id: "pantry-visual-4",
    ingredient_id: "ingredient-pork",
    standard_name: "돼지고기",
  },
  {
    category: "해산물",
    created_at: "2026-05-10T09:04:00.000Z",
    id: "pantry-visual-5",
    ingredient_id: "ingredient-anchovy",
    standard_name: "멸치",
  },
  {
    category: "양념",
    created_at: "2026-05-10T09:05:00.000Z",
    id: "pantry-visual-6",
    ingredient_id: "ingredient-garlic",
    standard_name: "다진 마늘",
  },
  {
    category: "양념",
    created_at: "2026-05-10T09:06:00.000Z",
    id: "pantry-visual-7",
    ingredient_id: "ingredient-gochujang",
    standard_name: "고추장",
  },
  {
    category: "곡류",
    created_at: "2026-05-10T09:07:00.000Z",
    id: "pantry-visual-8",
    ingredient_id: "ingredient-rice",
    standard_name: "쌀",
  },
  {
    category: "유제품",
    created_at: "2026-05-10T09:08:00.000Z",
    id: "pantry-visual-9",
    ingredient_id: "ingredient-butter",
    standard_name: "버터",
  },
  {
    category: "기타",
    created_at: "2026-05-10T09:09:00.000Z",
    id: "pantry-visual-10",
    ingredient_id: "ingredient-tofu",
    standard_name: "두부",
  },
] as const;

const PANTRY_VISUAL_INGREDIENTS = [
  ...PANTRY_VISUAL_ITEMS.map((item) => ({
    category: item.category,
    default_unit: item.category === "양념" ? "큰술" : "g",
    id: item.ingredient_id,
    standard_name: item.standard_name,
  })),
  {
    category: "채소",
    default_unit: "개",
    id: "ingredient-potato",
    standard_name: "감자",
  },
  {
    category: "양념",
    default_unit: "큰술",
    id: "ingredient-soy-sauce",
    standard_name: "간장",
  },
  {
    category: "기타",
    default_unit: "개",
    id: "ingredient-egg",
    standard_name: "달걀",
  },
] as const;

const PANTRY_VISUAL_BUNDLES = [
  {
    display_order: 1,
    id: "bundle-soup",
    name: "국물 요리 세트",
    ingredients: [
      { ingredient_id: "ingredient-kimchi", is_in_pantry: true, standard_name: "김치" },
      { ingredient_id: "ingredient-tofu", is_in_pantry: true, standard_name: "두부" },
      { ingredient_id: "ingredient-anchovy", is_in_pantry: true, standard_name: "멸치" },
      { ingredient_id: "ingredient-soy-sauce", is_in_pantry: false, standard_name: "간장" },
    ],
  },
  {
    display_order: 2,
    id: "bundle-stir-fry",
    name: "볶음 요리 세트",
    ingredients: [
      { ingredient_id: "ingredient-pork", is_in_pantry: true, standard_name: "돼지고기" },
      { ingredient_id: "ingredient-green-onion", is_in_pantry: true, standard_name: "대파" },
      { ingredient_id: "ingredient-onion", is_in_pantry: true, standard_name: "양파" },
      { ingredient_id: "ingredient-egg", is_in_pantry: false, standard_name: "달걀" },
    ],
  },
] as const;

const SHOPPING_VISUAL_ITEMS = [
  {
    added_to_pantry: false,
    amounts_json: [{ amount: 300, unit: "g" }],
    display_text: "돼지고기 300g",
    id: "shopping-item-pork",
    ingredient_id: "ingredient-pork",
    is_checked: false,
    is_pantry_excluded: false,
    sort_order: 10,
  },
  {
    added_to_pantry: false,
    amounts_json: [{ amount: 1, unit: "개" }],
    display_text: "감자 1개",
    id: "shopping-item-potato",
    ingredient_id: "ingredient-potato",
    is_checked: true,
    is_pantry_excluded: false,
    sort_order: 20,
  },
  {
    added_to_pantry: false,
    amounts_json: [{ amount: 2, unit: "큰술" }],
    display_text: "간장 2큰술",
    id: "shopping-item-soy",
    ingredient_id: "ingredient-soy-sauce",
    is_checked: false,
    is_pantry_excluded: false,
    sort_order: 30,
  },
  {
    added_to_pantry: false,
    amounts_json: [{ amount: 1, unit: "대" }],
    display_text: "대파 1대",
    id: "shopping-item-green-onion",
    ingredient_id: "ingredient-green-onion",
    is_checked: false,
    is_pantry_excluded: true,
    sort_order: 40,
  },
] as const;

function buildShoppingVisualDetail({
  completed = false,
  id = SHOPPING_DETAIL_VISUAL_LIST_ID,
}: {
  completed?: boolean;
  id?: string;
} = {}) {
  return {
    completed_at: completed ? "2026-05-18T10:30:00.000Z" : null,
    created_at: "2026-05-18T09:30:00.000Z",
    date_range_end: "2026-05-24",
    date_range_start: "2026-05-18",
    id,
    is_completed: completed,
    items: SHOPPING_VISUAL_ITEMS.map((item) => ({
      ...item,
      added_to_pantry: completed && item.is_checked && !item.is_pantry_excluded,
      is_checked: completed && !item.is_pantry_excluded ? true : item.is_checked,
    })),
    recipes: [
      {
        planned_servings_total: 2,
        recipe_id: "recipe-jeyuk",
        recipe_name: "제육볶음",
        recipe_thumbnail: createQaFoodThumbDataUri("🥩", "#FFAC87"),
        shopping_servings: 2,
      },
      {
        planned_servings_total: 2,
        recipe_id: "recipe-sujebi",
        recipe_name: "감자 수제비",
        recipe_thumbnail: createQaFoodThumbDataUri("🥟", "#E7D9B7"),
        shopping_servings: 2,
      },
    ],
    title: completed ? "지난 주 장보기" : "이번 주 장보기",
    updated_at: "2026-05-18T09:30:00.000Z",
  };
}

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
  await page.route("**/api/v1/meals**", async (route) => {
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
      await route.fallback();
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

function cookingVisualRecipe(title = "김치볶음밥") {
  return {
    id: "recipe-cooking-visual",
    title,
    cooking_servings: 2,
    ingredients: [
      {
        amount: 1,
        display_text: "1 공기",
        ingredient_id: "cook-ing-rice",
        ingredient_type: "QUANT",
        scalable: true,
        standard_name: "쌀",
        unit: "공기",
      },
      {
        amount: 100,
        display_text: "100 g",
        ingredient_id: "cook-ing-kimchi",
        ingredient_type: "QUANT",
        scalable: true,
        standard_name: "배추김치",
        unit: "g",
      },
      {
        amount: 1,
        display_text: "1 개",
        ingredient_id: "cook-ing-egg",
        ingredient_type: "QUANT",
        scalable: true,
        standard_name: "계란",
        unit: "개",
      },
      {
        amount: 0.5,
        display_text: "0.5 대",
        ingredient_id: "cook-ing-scallion",
        ingredient_type: "QUANT",
        scalable: true,
        standard_name: "대파",
        unit: "대",
      },
      {
        amount: 1,
        display_text: "1 작은술",
        ingredient_id: "cook-ing-oil",
        ingredient_type: "QUANT",
        scalable: true,
        standard_name: "참기름",
        unit: "작은술",
      },
      {
        amount: 1,
        display_text: "1 작은술",
        ingredient_id: "cook-ing-soy",
        ingredient_type: "QUANT",
        scalable: true,
        standard_name: "간장",
        unit: "작은술",
      },
    ],
    steps: [
      {
        cooking_method: { code: "stir_fry", label: "볶기", color_key: "stir_fry" },
        duration_seconds: null,
        duration_text: null,
        heat_level: null,
        ingredients_used: [],
        instruction: "팬에 김치를 잘게 썰어 강불에 충분히 볶습니다.",
        step_number: 1,
      },
      {
        cooking_method: { code: "stir_fry", label: "볶기", color_key: "stir_fry" },
        duration_seconds: null,
        duration_text: null,
        heat_level: null,
        ingredients_used: [],
        instruction: "밥을 넣고 김치와 잘 섞어가며 2분 더 볶습니다.",
        step_number: 2,
      },
      {
        cooking_method: { code: "boil", label: "굽기", color_key: "boil" },
        duration_seconds: null,
        duration_text: null,
        heat_level: null,
        ingredients_used: [],
        instruction: "옆에 계란 후라이를 부쳐 올립니다.",
        step_number: 3,
      },
      {
        cooking_method: { code: "mix", label: "무치기", color_key: "mix" },
        duration_seconds: null,
        duration_text: null,
        heat_level: null,
        ingredients_used: [],
        instruction: "참기름과 다진 파로 마무리합니다.",
        step_number: 4,
      },
    ],
  };
}

export async function installLeftoversVisualRoutes(
  page: Page,
  options: {
    ateItems?: ReadonlyArray<LeftoverListItemData>;
    leftoverItems?: ReadonlyArray<LeftoverListItemData>;
  } = {},
) {
  const leftoverItems = [...(options.leftoverItems ?? LEFTOVERS_VISUAL_ITEMS)];
  const ateItems = [...(options.ateItems ?? ATE_LIST_VISUAL_ITEMS)];

  await page.route("**/api/v1/leftovers?*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const status = requestUrl.searchParams.get("status") ?? "leftover";

    await route.fulfill({
      json: {
        success: true,
        data: {
          items: status === "eaten" ? ateItems : leftoverItems,
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/leftovers/*/eat", async (route) => {
    const id = route.request().url().split("/leftovers/")[1]?.split("/")[0];
    await route.fulfill({
      json: {
        success: true,
        data: {
          auto_hide_at: "2026-06-14T00:00:00.000Z",
          eaten_at: "2026-05-14T12:00:00.000Z",
          id,
          status: "eaten",
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/leftovers/*/uneat", async (route) => {
    const id = route.request().url().split("/leftovers/")[1]?.split("/")[0];
    await route.fulfill({
      json: {
        success: true,
        data: {
          auto_hide_at: null,
          eaten_at: null,
          id,
          status: "leftover",
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/planner?*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: PLANNER_COLUMNS,
          meals: [],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/meals", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const body = route.request().postDataJSON() as {
      column_id: string;
      leftover_dish_id?: string;
      plan_date: string;
      planned_servings?: number;
      recipe_id: string;
    };

    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          column_id: body.column_id,
          id: "meal-leftover-visual",
          is_leftover: true,
          leftover_dish_id: body.leftover_dish_id,
          plan_date: body.plan_date,
          planned_servings: body.planned_servings ?? 1,
          recipe_id: body.recipe_id,
          status: "registered",
        },
        error: null,
      },
    });
  });
}

export async function installCookingVisualRoutes(page: Page) {
  await page.route("**/api/v1/cooking/sessions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          cooking_servings: 2,
          meals: [{ is_cooked: false, meal_id: "meal-cook-1" }],
          recipe_id: "recipe-kimchi-rice",
          session_id: COOK_MODE_VISUAL_SESSION_ID,
          status: "in_progress",
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/cooking/sessions/*/cook-mode", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          recipe: cookingVisualRecipe(),
          session_id: COOK_MODE_VISUAL_SESSION_ID,
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/cooking/sessions/*/complete", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          cook_count: 12,
          leftover_dish_id: "leftover-cook-visual",
          meals_updated: 1,
          pantry_removed: 2,
          session_id: COOK_MODE_VISUAL_SESSION_ID,
          status: "completed",
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/cooking/sessions/*/cancel", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { session_id: COOK_MODE_VISUAL_SESSION_ID, status: "cancelled" },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes/*/cook-mode*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { recipe: cookingVisualRecipe("김치볶음밥") },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/cooking/standalone-complete", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          cook_count: 13,
          leftover_dish_id: "leftover-standalone-visual",
          pantry_removed: 2,
        },
        error: null,
      },
    });
  });
}

export async function installPantryShoppingVisualRoutes(page: Page) {
  await page.route("**/api/v1/pantry/bundles", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { bundles: PANTRY_VISUAL_BUNDLES },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/pantry**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();

    if (requestUrl.pathname === "/api/v1/pantry/bundles") {
      await route.fulfill({
        json: {
          success: true,
          data: { bundles: PANTRY_VISUAL_BUNDLES },
          error: null,
        },
      });
      return;
    }

    if (method === "POST") {
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          data: {
            added: 2,
            items: PANTRY_VISUAL_ITEMS.slice(0, 2),
          },
          error: null,
        },
      });
      return;
    }

    if (method === "DELETE") {
      await route.fulfill({
        json: {
          success: true,
          data: { removed: 1 },
          error: null,
        },
      });
      return;
    }

    const query = requestUrl.searchParams.get("q")?.trim() ?? "";
    const category = requestUrl.searchParams.get("category")?.trim() ?? "";
    const items = PANTRY_VISUAL_ITEMS.filter((item) => {
      const matchesQuery = query === "" || item.standard_name.includes(query);
      const matchesCategory = category === "" || item.category === category;
      return matchesQuery && matchesCategory;
    });

    await route.fulfill({
      json: {
        success: true,
        data: { items },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/ingredients**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const query = requestUrl.searchParams.get("q")?.trim() ?? "";
    const category = requestUrl.searchParams.get("category")?.trim() ?? "";
    const items = PANTRY_VISUAL_INGREDIENTS.filter((item) => {
      const matchesQuery = query === "" || item.standard_name.includes(query);
      const matchesCategory = category === "" || item.category === category;
      return matchesQuery && matchesCategory;
    });

    await route.fulfill({
      json: {
        success: true,
        data: { items },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/shopping/preview", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          eligible_meals: [
            {
              column_id: "column-breakfast",
              created_at: "2026-05-18T08:30:00.000Z",
              id: "meal-shopping-visual-1",
              plan_date: "2026-05-18",
              planned_servings: 2,
              recipe_id: "recipe-jeyuk",
              recipe_name: "제육볶음",
              recipe_thumbnail: createQaFoodThumbDataUri("🥩", "#FFAC87"),
            },
            {
              column_id: "column-dinner",
              created_at: "2026-05-19T08:30:00.000Z",
              id: "meal-shopping-visual-2",
              plan_date: "2026-05-19",
              planned_servings: 2,
              recipe_id: "recipe-sujebi",
              recipe_name: "감자 수제비",
              recipe_thumbnail: createQaFoodThumbDataUri("🥟", "#E7D9B7"),
            },
            {
              column_id: "column-lunch",
              created_at: "2026-05-20T08:30:00.000Z",
              id: "meal-shopping-visual-3",
              plan_date: "2026-05-20",
              planned_servings: 1,
              recipe_id: "recipe-salad",
              recipe_name: "닭가슴살 샐러드",
              recipe_thumbnail: createQaFoodThumbDataUri("🥗", "#DDF4CF"),
            },
          ],
          recipes: [
            {
              is_selected: true,
              meal_ids: ["meal-shopping-visual-1"],
              planned_servings_total: 2,
              recipe_id: "recipe-jeyuk",
              recipe_name: "제육볶음",
              recipe_thumbnail: createQaFoodThumbDataUri("🥩", "#FFAC87"),
              shopping_servings: 2,
            },
            {
              is_selected: true,
              meal_ids: ["meal-shopping-visual-2"],
              planned_servings_total: 2,
              recipe_id: "recipe-sujebi",
              recipe_name: "감자 수제비",
              recipe_thumbnail: createQaFoodThumbDataUri("🥟", "#E7D9B7"),
              shopping_servings: 2,
            },
            {
              is_selected: true,
              meal_ids: ["meal-shopping-visual-3"],
              planned_servings_total: 1,
              recipe_id: "recipe-salad",
              recipe_name: "닭가슴살 샐러드",
              recipe_thumbnail: createQaFoodThumbDataUri("🥗", "#DDF4CF"),
              shopping_servings: 1,
            },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/shopping/lists**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.pathname;
    const method = route.request().method();

    if (method === "POST" && path === "/api/v1/shopping/lists") {
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          data: {
            created_at: "2026-05-18T09:30:00.000Z",
            date_range_end: "2026-05-24",
            date_range_start: "2026-05-18",
            id: SHOPPING_DETAIL_VISUAL_LIST_ID,
            is_completed: false,
            item_count: SHOPPING_VISUAL_ITEMS.length,
            title: "이번 주 장보기",
          },
          error: null,
        },
      });
      return;
    }

    if (method === "GET" && path === "/api/v1/shopping/lists") {
      await route.fulfill({
        json: {
          success: true,
          data: {
            has_next: false,
            items: [
              {
                completed_at: null,
                created_at: "2026-05-18T09:30:00.000Z",
                date_range_end: "2026-05-24",
                date_range_start: "2026-05-18",
                id: SHOPPING_DETAIL_VISUAL_LIST_ID,
                is_completed: false,
                item_count: SHOPPING_VISUAL_ITEMS.length,
                title: "이번 주 장보기",
              },
              {
                completed_at: "2026-05-11T10:30:00.000Z",
                created_at: "2026-05-11T09:30:00.000Z",
                date_range_end: "2026-05-17",
                date_range_start: "2026-05-11",
                id: SHOPPING_DETAIL_COMPLETED_VISUAL_LIST_ID,
                is_completed: true,
                item_count: SHOPPING_VISUAL_ITEMS.length,
                title: "지난 주 장보기",
              },
            ],
            next_cursor: null,
          },
          error: null,
        },
      });
      return;
    }

    if (path.endsWith("/share-text")) {
      await route.fulfill({
        json: {
          success: true,
          data: { text: "이번 주 장보기\n- 돼지고기 300g\n- 감자 1개" },
          error: null,
        },
      });
      return;
    }

    if (path.endsWith("/complete")) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            completed: true,
            meals_updated: 2,
            pantry_added: 1,
            pantry_added_item_ids: ["shopping-item-potato"],
          },
          error: null,
        },
      });
      return;
    }

    if (path.includes("/items/")) {
      const itemId = path.split("/items/")[1]?.split("/")[0] ?? "";
      const item =
        SHOPPING_VISUAL_ITEMS.find((candidate) => candidate.id === itemId) ??
        SHOPPING_VISUAL_ITEMS[0];

      await route.fulfill({
        json: {
          success: true,
          data: item,
          error: null,
        },
      });
      return;
    }

    const listId = path.split("/").at(-1) ?? SHOPPING_DETAIL_VISUAL_LIST_ID;
    await route.fulfill({
      json: {
        success: true,
        data: buildShoppingVisualDetail({
          completed: listId === SHOPPING_DETAIL_COMPLETED_VISUAL_LIST_ID,
          id: listId,
        }),
        error: null,
      },
    });
  });
}

export async function installAccountLibraryVisualRoutes(page: Page) {
  await page.route("**/api/v1/users/me/settings", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { settings: ACCOUNT_VISUAL_PROFILE.settings },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me", async (route) => {
    const method = route.request().method();

    if (method === "PATCH") {
      const body = route.request().postDataJSON() as { nickname?: string };
      await route.fulfill({
        json: {
          success: true,
          data: {
            ...ACCOUNT_VISUAL_PROFILE,
            nickname: body.nickname ?? ACCOUNT_VISUAL_PROFILE.nickname,
          },
          error: null,
        },
      });
      return;
    }

    if (method === "DELETE") {
      await route.fulfill({
        json: {
          success: true,
          data: { deleted: true },
          error: null,
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: ACCOUNT_VISUAL_PROFILE,
        error: null,
      },
    });
  });

  await page.route("**/api/v1/auth/logout", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { logged_out: true },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/planner/columns", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { columns: PLANNER_COLUMNS },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipe-books/*/recipes**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          has_next: false,
          items: ACCOUNT_VISUAL_RECIPEBOOK_ITEMS,
          next_cursor: null,
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipe-books/*", async (route) => {
    const method = route.request().method();

    if (method === "PATCH") {
      const body = route.request().postDataJSON() as { name?: string };
      await route.fulfill({
        json: {
          success: true,
          data: {
            book_type: "custom",
            id: RECIPEBOOK_DETAIL_VISUAL_BOOK_ID,
            name: body.name ?? "주말 파티",
            recipe_count: 4,
            sort_order: 3,
          },
          error: null,
        },
      });
      return;
    }

    if (method === "DELETE") {
      await route.fulfill({
        json: {
          success: true,
          data: { deleted: true },
          error: null,
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: ACCOUNT_VISUAL_BOOKS.at(-1),
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipe-books", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { name?: string };
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          data: {
            book_type: "custom",
            id: "book-new",
            name: body.name ?? "주말 브런치",
            recipe_count: 0,
            sort_order: ACCOUNT_VISUAL_BOOKS.length,
          },
          error: null,
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: { books: ACCOUNT_VISUAL_BOOKS },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/shopping/lists**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          has_next: false,
          items: ACCOUNT_VISUAL_SHOPPING_HISTORY,
          next_cursor: null,
        },
        error: null,
      },
    });
  });
}
