import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  installRecipeDetailRoutes,
  RECIPE_ID,
} from "./helpers/mock-routes";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/wave1-port-planner-meal-add",
);

const PLAN_DATE = "2026-04-18";
const COLUMN_ID = "column-breakfast";
const SLOT_NAME = "아침";
const MEAL_SCREEN_PLAN_DATE = "2026-04-23";
const MENU_ADD_PLAN_DATE = "2026-04-23";
const MENU_ADD_SLOT_NAME = "점심";
const MEAL_SCREEN_PATH = `/planner/${MEAL_SCREEN_PLAN_DATE}/${COLUMN_ID}?slot=${encodeURIComponent(SLOT_NAME)}`;
const MENU_ADD_PATH = `/menu-add?date=${MENU_ADD_PLAN_DATE}&columnId=${COLUMN_ID}&slot=${encodeURIComponent(MENU_ADD_SLOT_NAME)}`;
const MANUAL_CREATE_PATH = `/menu/add/manual?date=${PLAN_DATE}&columnId=${COLUMN_ID}&slot=${encodeURIComponent(SLOT_NAME)}`;
const FIXED_NOW = "2026-04-23T09:00:00.000+09:00";

const viewports = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
} as const;

async function preparePage(
  browser: Browser,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport,
  });
  const page = await context.newPage();
  return { context, page };
}

async function stabilize(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }

      nextjs-portal,
      [data-next-badge-root],
      [aria-label="Open Next.js Dev Tools"],
      [data-nextjs-dev-tools-button],
      [data-nextjs-toast] {
        display: none !important;
        visibility: hidden !important;
      }
    `,
  });
}

async function setFixedDate(page: Page) {
  await page.addInitScript(({ fixedNow }: { fixedNow: string }) => {
    const RealDate = Date;
    const fixedTime = new RealDate(fixedNow).getTime();

    class FixedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixedTime);
          return;
        }

        super(...(args as [number]));
      }

      static now() {
        return fixedTime;
      }
    }

    Object.setPrototypeOf(FixedDate, RealDate);
    globalThis.Date = FixedDate as DateConstructor;
  }, { fixedNow: FIXED_NOW });
}

async function setAuthOverride(page: Page) {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      sameSite: "Lax",
      url: BASE_URL,
      value: "authenticated",
    },
  ]);
  await page.addInitScript(
    ({ key, state }: { key: string; state: string }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: "authenticated" },
  );
}

function addDaysDateKey(dateKey: string, dayOffset: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function createFoodThumbDataUri(emoji: string, background: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 34 46">
      <rect width="34" height="46" fill="${background}"/>
      <text x="17" y="29" text-anchor="middle" font-size="18">${emoji}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function installPlannerRoutes(page: Page) {
  await page.route("**/api/v1/planner?*", async (route) => {
    const url = new URL(route.request().url());
    const startDate = url.searchParams.get("start_date") ?? PLAN_DATE;
    const meals = [
      {
        id: "meal-1",
        recipe_id: RECIPE_ID,
        recipe_title: "된장찌개",
        recipe_thumbnail_url: createFoodThumbDataUri("🍲", "#FFE1E1"),
        plan_date: startDate,
        column_id: "column-dinner",
        planned_servings: 2,
        status: "registered",
        is_leftover: false,
      },
      {
        id: "meal-2",
        recipe_id: "recipe-lunch",
        recipe_title: "김치볶음밥",
        recipe_thumbnail_url: createFoodThumbDataUri("🍚", "#FFE2CF"),
        plan_date: addDaysDateKey(startDate, 1),
        column_id: "column-lunch",
        planned_servings: 1,
        status: "registered",
        is_leftover: false,
      },
      {
        id: "meal-3",
        recipe_id: "recipe-dinner",
        recipe_title: "제육볶음",
        recipe_thumbnail_url: createFoodThumbDataUri("🥘", "#FFDDD8"),
        plan_date: addDaysDateKey(startDate, 1),
        column_id: "column-dinner",
        planned_servings: 2,
        status: "registered",
        is_leftover: false,
      },
      {
        id: "meal-4",
        recipe_id: "recipe-breakfast",
        recipe_title: "토스트",
        recipe_thumbnail_url: createFoodThumbDataUri("🍞", "#FFE9C9"),
        plan_date: addDaysDateKey(startDate, 2),
        column_id: COLUMN_ID,
        planned_servings: 1,
        status: "shopping_done",
        is_leftover: false,
      },
      {
        id: "meal-5",
        recipe_id: "recipe-mid",
        recipe_title: "비빔밥",
        recipe_thumbnail_url: createFoodThumbDataUri("🍛", "#DFF5E7"),
        plan_date: addDaysDateKey(startDate, 2),
        column_id: "column-lunch",
        planned_servings: 2,
        status: "cook_done",
        is_leftover: false,
      },
      {
        id: "meal-6",
        recipe_id: "recipe-thu-a",
        recipe_title: "오트밀",
        recipe_thumbnail_url: createFoodThumbDataUri("🥣", "#E6F8F7"),
        plan_date: addDaysDateKey(startDate, 3),
        column_id: COLUMN_ID,
        planned_servings: 1,
        status: "registered",
        is_leftover: false,
      },
      {
        id: "meal-7",
        recipe_id: "recipe-thu-l",
        recipe_title: "카레라이스",
        recipe_thumbnail_url: createFoodThumbDataUri("🍛", "#FFE9C9"),
        plan_date: addDaysDateKey(startDate, 3),
        column_id: "column-lunch",
        planned_servings: 2,
        status: "shopping_done",
        is_leftover: false,
      },
      {
        id: "meal-8",
        recipe_id: "recipe-thu-d",
        recipe_title: "닭가슴살 샐러드",
        recipe_thumbnail_url: createFoodThumbDataUri("🥗", "#DFF5E7"),
        plan_date: addDaysDateKey(startDate, 3),
        column_id: "column-dinner",
        planned_servings: 1,
        status: "cook_done",
        is_leftover: false,
      },
      {
        id: "meal-9",
        recipe_id: "recipe-fri",
        recipe_title: "파스타",
        recipe_thumbnail_url: createFoodThumbDataUri("🍝", "#FFE2CF"),
        plan_date: addDaysDateKey(startDate, 4),
        column_id: "column-dinner",
        planned_servings: 2,
        status: "registered",
        is_leftover: false,
      },
      {
        id: "meal-10",
        recipe_id: "recipe-sun",
        recipe_title: "계란말이",
        recipe_thumbnail_url: createFoodThumbDataUri("🍳", "#FFF3BF"),
        plan_date: addDaysDateKey(startDate, 6),
        column_id: COLUMN_ID,
        planned_servings: 1,
        status: "registered",
        is_leftover: false,
      },
    ];

    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: [
            { id: COLUMN_ID, name: "아침", sort_order: 0 },
            { id: "column-lunch", name: "점심", sort_order: 1 },
            { id: "column-dinner", name: "저녁", sort_order: 2 },
          ],
          meals,
        },
        error: null,
      },
    });
  });
}

async function installMealRoutes(page: Page) {
  await page.route("**/api/v1/meals?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              id: "meal-1",
              recipe_id: "recipe-kimchi-rice",
              recipe_title: "김치볶음밥",
              recipe_thumbnail_url: createFoodThumbDataUri("🍚", "#FFE2CF"),
              planned_servings: 1,
              status: "registered",
              is_leftover: false,
            },
            {
              id: "meal-2",
              recipe_id: RECIPE_ID,
              recipe_title: "된장찌개",
              recipe_thumbnail_url: createFoodThumbDataUri("🍲", "#FFE1E1"),
              planned_servings: 2,
              status: "registered",
              is_leftover: false,
            },
            {
              id: "meal-3",
              recipe_id: "recipe-salad",
              recipe_title: "닭가슴살 샐러드",
              recipe_thumbnail_url: createFoodThumbDataUri("🥗", "#DFF5E7"),
              planned_servings: 1,
              status: "registered",
              is_leftover: false,
            },
          ],
        },
        error: null,
      },
    });
  });
}

async function installManualCreateRoutes(page: Page) {
  await page.route("**/api/v1/cooking-methods", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            { id: "method-boil", code: "BOIL", label: "끓이기", sort_order: 0 },
            { id: "method-mix", code: "MIX", label: "무치기", sort_order: 1 },
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
          ],
        },
        error: null,
      },
    });
  });
}

async function installMenuAddPickerRoutes(page: Page) {
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
          items: [
            {
              base_servings: 1,
              id: "recipe-kimchi-rice",
              like_count: 420,
              save_count: 154,
              source_type: "system",
              tags: ["15분", "자취생 간단식", "볶기", "묵은지"],
              thumbnail_url: createFoodThumbDataUri("🍚", "#FFE2CF"),
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
              thumbnail_url: createFoodThumbDataUri("🍲", "#FFC6CA"),
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
              thumbnail_url: createFoodThumbDataUri("🥗", "#DDF4CF"),
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
              thumbnail_url: createFoodThumbDataUri("🥩", "#FFAC87"),
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
              thumbnail_url: createFoodThumbDataUri("🐟", "#FFC19F"),
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
              thumbnail_url: createFoodThumbDataUri("🥟", "#E7D9B7"),
              title: "감자 수제비",
              view_count: 2464,
            },
          ],
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
              id: "book-custom",
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
          items: [
            {
              added_at: "2026-04-22T12:00:00.000Z",
              recipe_id: "recipe-kimchi-rice",
              tags: ["15분", "1인분"],
              thumbnail_url: createFoodThumbDataUri("🍚", "#FFE2CF"),
              title: "김치볶음밥",
            },
            {
              added_at: "2026-04-21T12:00:00.000Z",
              recipe_id: "recipe-doenjang",
              tags: ["25분", "2인분"],
              thumbnail_url: createFoodThumbDataUri("🍲", "#FFC6CA"),
              title: "된장찌개",
            },
            {
              added_at: "2026-04-20T12:00:00.000Z",
              recipe_id: "recipe-salad",
              tags: ["10분", "1인분"],
              thumbnail_url: createFoodThumbDataUri("🥗", "#DDF4CF"),
              title: "닭가슴살 샐러드",
            },
            {
              added_at: "2026-04-19T12:00:00.000Z",
              recipe_id: "recipe-jeyuk",
              tags: ["20분", "2인분"],
              thumbnail_url: createFoodThumbDataUri("🥩", "#FFAC87"),
              title: "제육볶음",
            },
            {
              added_at: "2026-04-18T12:00:00.000Z",
              recipe_id: "recipe-salmon",
              tags: ["20분", "2인분"],
              thumbnail_url: createFoodThumbDataUri("🐟", "#FFC19F"),
              title: "연어 스테이크",
            },
            {
              added_at: "2026-04-17T12:00:00.000Z",
              recipe_id: "recipe-sujebi",
              tags: ["30분", "2인분"],
              thumbnail_url: createFoodThumbDataUri("🥟", "#E7D9B7"),
              title: "감자 수제비",
            },
          ],
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
          items: [
            {
              id: "recipe-kimchi-rice",
              match_score: 0.57,
              matched_ingredients: 4,
              missing_ingredients: [
                { id: "ingredient-aged-kimchi", standard_name: "묵은지" },
                { id: "ingredient-rice", standard_name: "찬밥" },
                { id: "ingredient-scallion", standard_name: "대파" },
              ],
              thumbnail_url: createFoodThumbDataUri("🍚", "#FFE2CF"),
              title: "김치볶음밥",
              total_ingredients: 7,
            },
            {
              id: "recipe-jeyuk",
              match_score: 0.57,
              matched_ingredients: 4,
              missing_ingredients: [
                { id: "ingredient-pork", standard_name: "돼지고기 앞다리살" },
                { id: "ingredient-garlic", standard_name: "대파" },
                { id: "ingredient-garlic-2", standard_name: "마늘" },
              ],
              thumbnail_url: createFoodThumbDataUri("🥩", "#FFAC87"),
              title: "제육볶음",
              total_ingredients: 7,
            },
            {
              id: "recipe-doenjang",
              match_score: 0.5,
              matched_ingredients: 3,
              missing_ingredients: [
                { id: "ingredient-pumpkin", standard_name: "애호박" },
                { id: "ingredient-tofu", standard_name: "두부" },
                { id: "ingredient-anchovy", standard_name: "멸치육수" },
              ],
              thumbnail_url: createFoodThumbDataUri("🍲", "#FFC6CA"),
              title: "된장찌개",
              total_ingredients: 6,
            },
            {
              id: "recipe-sujebi",
              match_score: 0.2,
              matched_ingredients: 1,
              missing_ingredients: [
                { id: "ingredient-flour", standard_name: "밀가루" },
                { id: "ingredient-pumpkin-2", standard_name: "애호박" },
                { id: "ingredient-anchovy-2", standard_name: "멸치육수 외 1" },
              ],
              thumbnail_url: createFoodThumbDataUri("🥟", "#E7D9B7"),
              title: "감자 수제비",
              total_ingredients: 5,
            },
            {
              id: "recipe-salad",
              match_score: 0,
              matched_ingredients: 0,
              missing_ingredients: [
                { id: "ingredient-chicken", standard_name: "닭가슴살" },
                { id: "ingredient-romaine", standard_name: "로메인" },
                { id: "ingredient-tomato", standard_name: "방울토마토 외 2" },
              ],
              thumbnail_url: createFoodThumbDataUri("🥗", "#DDF4CF"),
              title: "닭가슴살 샐러드",
              total_ingredients: 5,
            },
            {
              id: "recipe-salmon",
              match_score: 0,
              matched_ingredients: 0,
              missing_ingredients: [
                { id: "ingredient-salmon", standard_name: "연어" },
                { id: "ingredient-asparagus", standard_name: "아스파라거스" },
                { id: "ingredient-lemon", standard_name: "레몬 외 2" },
              ],
              thumbnail_url: createFoodThumbDataUri("🐟", "#FFC19F"),
              title: "연어 스테이크",
              total_ingredients: 5,
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
      json: {
        success: true,
        data: {
          column_id: COLUMN_ID,
          id: "meal-created",
          is_leftover: false,
          leftover_dish_id: null,
          plan_date: PLAN_DATE,
          planned_servings: 2,
          recipe_id: "recipe-kimchi-rice",
          status: "registered",
        },
        error: null,
      },
      status: 201,
    });
  });
}

test("capture Wave1 planner/meal-add authority evidence", async ({ browser }, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chrome",
    "Evidence capture writes deterministic Chromium screenshots once.",
  );

  await mkdir(EVIDENCE_DIR, { recursive: true });

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setFixedDate(page);
    await setAuthOverride(page);
    await installPlannerRoutes(page);
    await page.goto(`${BASE_URL}/planner`);
    await expect(page.getByRole("heading", { name: "플래너" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "planner-mobile-default.png"),
    });

    await page.getByRole("button", { name: "다음 주" }).click();
    await expect(page.getByText(/다음주에요/)).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "planner-week-navigation.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setFixedDate(page);
    await setAuthOverride(page);
    await installPlannerRoutes(page);
    await page.goto(`${BASE_URL}/planner`);
    await expect(page.getByRole("heading", { name: "플래너" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "planner-mobile-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setFixedDate(page);
    await setAuthOverride(page);
    await installPlannerRoutes(page);
    await page.goto(`${BASE_URL}/planner`);
    await page.getByRole("button", { name: "+ 식사 추가" }).first().click();
    await expect(page.getByTestId("planner-meal-add-sheet")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "planner-meal-add-sheet.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setFixedDate(page);
    await setAuthOverride(page);
    await installPlannerRoutes(page);
    await page.goto(`${BASE_URL}/planner`);
    await page.getByRole("button", { name: "+ 식사 추가" }).first().click();
    await expect(page.getByTestId("planner-meal-add-sheet")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "planner-meal-add-sheet-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installMenuAddPickerRoutes(page);
    await page.goto(`${BASE_URL}${MENU_ADD_PATH}&source=search`);
    await expect(page.getByRole("heading", { name: "검색으로 추가" })).toBeVisible();
    await expect(page.getByText("김치볶음밥")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "recipe-search-picker.png"),
    });

    await page.getByRole("button", { name: /김치볶음밥/ }).click();
    await expect(page.getByRole("dialog", { name: "플래너에 추가" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "planned-servings-input.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installMenuAddPickerRoutes(page);
    await page.goto(`${BASE_URL}${MENU_ADD_PATH}&source=search`);
    await expect(page.getByRole("heading", { name: "검색으로 추가" })).toBeVisible();
    await expect(page.getByText("김치볶음밥")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "recipe-search-picker-narrow.png"),
    });

    await page.getByRole("button", { name: /김치볶음밥/ }).click();
    await expect(page.getByRole("dialog", { name: "플래너에 추가" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "planned-servings-input-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installMenuAddPickerRoutes(page);
    await page.goto(`${BASE_URL}${MENU_ADD_PATH}&source=recipebook`);
    await expect(page.getByRole("heading", { name: "레시피북에서 추가" })).toBeVisible();
    await expect(page.getByText("좋아요").first()).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "recipe-book-selector.png"),
    });

    await page.getByRole("button", { name: /평일 저녁 빠른요리/ }).click();
    await expect(page.getByRole("heading", { name: "평일 저녁 빠른요리" })).toBeVisible();
    await expect(page.getByText("된장찌개")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "recipe-book-detail-picker.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installMenuAddPickerRoutes(page);
    await page.goto(`${BASE_URL}${MENU_ADD_PATH}&source=recipebook`);
    await expect(page.getByRole("heading", { name: "레시피북에서 추가" })).toBeVisible();
    await expect(page.getByText("좋아요").first()).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "recipe-book-selector-narrow.png"),
    });

    await page.getByRole("button", { name: /평일 저녁 빠른요리/ }).click();
    await expect(page.getByRole("heading", { name: "평일 저녁 빠른요리" })).toBeVisible();
    await expect(page.getByText("된장찌개")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "recipe-book-detail-picker-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installMenuAddPickerRoutes(page);
    await page.goto(`${BASE_URL}${MENU_ADD_PATH}&source=pantry`);
    await expect(page.getByRole("heading", { name: "팬트리 기반 추천" })).toBeVisible();
    await expect(page.getByText("김치볶음밥")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "pantry-match-picker.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installMenuAddPickerRoutes(page);
    await page.goto(`${BASE_URL}${MENU_ADD_PATH}&source=pantry`);
    await expect(page.getByRole("heading", { name: "팬트리 기반 추천" })).toBeVisible();
    await expect(page.getByText("김치볶음밥")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "pantry-match-picker-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installManualCreateRoutes(page);
    await page.goto(`${BASE_URL}${MANUAL_CREATE_PATH}`);
    await expect(page.getByRole("heading", { name: "직접 등록" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "manual-recipe-create.png"),
    });

    await page.getByRole("button", { name: /재료 추가/ }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog).toBeVisible();
    await stabilize(page);
    await dialog.screenshot({
      path: path.join(EVIDENCE_DIR, "manual-create-ingredient-modal.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installManualCreateRoutes(page);
    await page.goto(`${BASE_URL}${MANUAL_CREATE_PATH}`);
    await expect(page.getByRole("heading", { name: "직접 등록" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "manual-recipe-create-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installMealRoutes(page);
    await page.goto(`${BASE_URL}${MEAL_SCREEN_PATH}`);
    await expect(page.getByTestId("meal-recipe-link-meal-1")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "meal-screen-default.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installMealRoutes(page);
    await page.goto(`${BASE_URL}${MEAL_SCREEN_PATH}`);
    await expect(page.getByTestId("meal-recipe-link-meal-1")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "meal-screen-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installMealRoutes(page);
    await installRecipeDetailRoutes(page);
    await page.goto(`${BASE_URL}${MEAL_SCREEN_PATH}`);
    await page.getByTestId("meal-recipe-link-meal-2").click();
    await expect(page.getByRole("heading", { name: "집밥 김치찌개" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "meal-screen-recipe-click.png"),
    });
    await context.close();
  }
});
