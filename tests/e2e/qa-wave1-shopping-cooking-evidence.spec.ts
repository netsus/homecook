import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/wave1-port-shopping-cooking",
);

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

function shoppingItems() {
  return [
    {
      id: "item-1",
      ingredient_id: "ing-1",
      display_text: "돼지고기 앞다리살 300g",
      amounts_json: [{ amount: 300, unit: "g" }],
      is_checked: false,
      is_pantry_excluded: false,
      added_to_pantry: false,
      sort_order: 0,
    },
    {
      id: "item-2",
      ingredient_id: "ing-2",
      display_text: "밀가루 2컵",
      amounts_json: [{ amount: 2, unit: "컵" }],
      is_checked: false,
      is_pantry_excluded: false,
      added_to_pantry: false,
      sort_order: 100,
    },
    {
      id: "item-3",
      ingredient_id: "ing-3",
      display_text: "멸치육수 1L",
      amounts_json: [{ amount: 1, unit: "L" }],
      is_checked: false,
      is_pantry_excluded: false,
      added_to_pantry: false,
      sort_order: 200,
    },
    {
      id: "item-4",
      ingredient_id: "ing-4",
      display_text: "묵은지 1컵",
      amounts_json: [{ amount: 1, unit: "컵" }],
      is_checked: false,
      is_pantry_excluded: false,
      added_to_pantry: false,
      sort_order: 300,
    },
    {
      id: "item-5",
      ingredient_id: "ing-5",
      display_text: "찹쌀 1공기",
      amounts_json: [{ amount: 1, unit: "공기" }],
      is_checked: false,
      is_pantry_excluded: false,
      added_to_pantry: false,
      sort_order: 400,
    },
    {
      id: "item-6",
      ingredient_id: "ing-6",
      display_text: "두부 1/2모",
      amounts_json: [{ amount: 0.5, unit: "모" }],
      is_checked: false,
      is_pantry_excluded: false,
      added_to_pantry: false,
      sort_order: 500,
    },
    {
      id: "item-7",
      ingredient_id: "ing-7",
      display_text: "닭가슴살 200g",
      amounts_json: [{ amount: 200, unit: "g" }],
      is_checked: false,
      is_pantry_excluded: true,
      added_to_pantry: false,
      sort_order: 600,
    },
    {
      id: "item-8",
      ingredient_id: "ing-8",
      display_text: "대파 1대",
      amounts_json: [{ amount: 1, unit: "대" }],
      is_checked: false,
      is_pantry_excluded: true,
      added_to_pantry: false,
      sort_order: 700,
    },
  ];
}

function shoppingDetailItems() {
  return [
    {
      id: "detail-item-1",
      ingredient_id: "detail-ing-1",
      display_text: "돼지고기 400g",
      amounts_json: [{ amount: 400, unit: "g" }],
      is_checked: true,
      is_pantry_excluded: false,
      added_to_pantry: false,
      sort_order: 0,
    },
    {
      id: "detail-item-2",
      ingredient_id: "detail-ing-2",
      display_text: "양파 2개",
      amounts_json: [{ amount: 2, unit: "개" }],
      is_checked: false,
      is_pantry_excluded: false,
      added_to_pantry: false,
      sort_order: 100,
    },
    {
      id: "detail-item-3",
      ingredient_id: "detail-ing-3",
      display_text: "대파 1대",
      amounts_json: [{ amount: 1, unit: "대" }],
      is_checked: false,
      is_pantry_excluded: false,
      added_to_pantry: false,
      sort_order: 200,
    },
    {
      id: "detail-item-4",
      ingredient_id: "detail-ing-4",
      display_text: "간장 3큰술",
      amounts_json: [{ amount: 3, unit: "큰술" }],
      is_checked: true,
      is_pantry_excluded: true,
      added_to_pantry: false,
      sort_order: 300,
    },
    {
      id: "detail-item-5",
      ingredient_id: "detail-ing-5",
      display_text: "다진마늘 1큰술",
      amounts_json: [{ amount: 1, unit: "큰술" }],
      is_checked: true,
      is_pantry_excluded: true,
      added_to_pantry: false,
      sort_order: 400,
    },
  ];
}

function shoppingListDetail({
  completed = false,
  flow = false,
}: {
  completed?: boolean;
  flow?: boolean;
} = {}) {
  const createdAt = flow
    ? "2026-05-10T00:00:00.000Z"
    : "2026-04-20T00:00:00.000Z";

  return {
    id: flow ? "list-flow" : completed ? "list-completed" : "list-1",
    title: flow
      ? "2026.05.10 · 장보기 목록"
      : completed
        ? "완료된 장보기"
        : "이번 주 평일 저녁",
    date_range_start: flow ? "2026-05-10" : "2026-04-20",
    date_range_end: flow ? "2026-05-10" : "2026-04-20",
    is_completed: completed,
    completed_at: completed ? "2026-04-13T00:00:00.000Z" : null,
    created_at: createdAt,
    updated_at: createdAt,
    recipes: [
      {
        recipe_id: "recipe-1",
        recipe_name: "김치찌개",
        recipe_thumbnail: null,
        shopping_servings: 4,
        planned_servings_total: 4,
      },
    ],
    items: flow ? shoppingItems() : shoppingDetailItems(),
  };
}

async function installShoppingRoutes(page: Page) {
  await page.route("**/api/v1/shopping/preview", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          eligible_meals: [
            {
              column_id: "column-dinner",
              id: "meal-1",
              plan_date: "2026-04-20",
              recipe_id: "recipe-1",
              recipe_name: "된장찌개",
              recipe_thumbnail: null,
              planned_servings: 2,
              created_at: "2026-04-20T00:00:00.000Z",
            },
            {
              column_id: "column-breakfast",
              id: "meal-2",
              plan_date: "2026-04-21",
              recipe_id: "recipe-2",
              recipe_name: "김치볶음밥",
              recipe_thumbnail: null,
              planned_servings: 1,
              created_at: "2026-04-21T00:00:00.000Z",
            },
            {
              column_id: "column-dinner",
              id: "meal-3",
              plan_date: "2026-04-22",
              recipe_id: "recipe-3",
              recipe_name: "제육볶음",
              recipe_thumbnail: null,
              planned_servings: 2,
              created_at: "2026-04-21T00:00:00.000Z",
            },
            {
              id: "meal-4",
              recipe_id: "recipe-4",
              recipe_name: "감자 수제비",
              recipe_thumbnail: null,
              planned_servings: 2,
              created_at: "2026-04-22T00:00:00.000Z",
            },
            {
              id: "meal-5",
              recipe_id: "recipe-5",
              recipe_name: "김치볶음밥",
              recipe_thumbnail: null,
              planned_servings: 1,
              created_at: "2026-04-23T00:00:00.000Z",
            },
            {
              id: "meal-6",
              recipe_id: "recipe-6",
              recipe_name: "된장찌개",
              recipe_thumbnail: null,
              planned_servings: 2,
              created_at: "2026-04-23T00:00:00.000Z",
            },
          ],
          recipes: [
            {
              recipe_id: "recipe-1",
              recipe_name: "된장찌개",
              recipe_thumbnail: null,
              meal_ids: ["meal-1"],
              planned_servings_total: 2,
              shopping_servings: 2,
              is_selected: false,
            },
            {
              recipe_id: "recipe-2",
              recipe_name: "김치볶음밥",
              recipe_thumbnail: null,
              meal_ids: ["meal-2"],
              planned_servings_total: 1,
              shopping_servings: 1,
              is_selected: false,
            },
            {
              recipe_id: "recipe-3",
              recipe_name: "제육볶음",
              recipe_thumbnail: null,
              meal_ids: ["meal-3"],
              planned_servings_total: 2,
              shopping_servings: 2,
              is_selected: true,
            },
            {
              recipe_id: "recipe-4",
              recipe_name: "감자 수제비",
              recipe_thumbnail: null,
              meal_ids: ["meal-4"],
              planned_servings_total: 2,
              shopping_servings: 2,
              is_selected: true,
            },
            {
              recipe_id: "recipe-5",
              recipe_name: "김치볶음밥",
              recipe_thumbnail: null,
              meal_ids: ["meal-5"],
              planned_servings_total: 1,
              shopping_servings: 1,
              is_selected: true,
            },
            {
              recipe_id: "recipe-6",
              recipe_name: "된장찌개",
              recipe_thumbnail: null,
              meal_ids: ["meal-6"],
              planned_servings_total: 2,
              shopping_servings: 2,
              is_selected: true,
            },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/shopping/lists", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          id: "list-flow",
          title: "2026.05.10 · 장보기 목록",
          date_range_start: "2026-05-10",
          date_range_end: "2026-05-10",
          is_completed: false,
          item_count: shoppingItems().length,
          created_at: "2026-05-10T00:00:00.000Z",
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/shopping/lists/*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const isCompleted = route.request().url().includes("list-completed");
    const isFlow = route.request().url().includes("list-flow");
    await route.fulfill({
      json: {
        success: true,
        data: shoppingListDetail({ completed: isCompleted, flow: isFlow }),
        error: null,
      },
    });
  });
}

function cookModeData() {
  return {
    session_id: "session-abc",
    recipe: {
      id: "recipe-1",
      title: "닭가슴살 샐러드",
      cooking_servings: 2,
      ingredients: [
        {
          ingredient_id: "ing-1",
          standard_name: "닭가슴살",
          amount: 100,
          unit: "g",
          display_text: "100g",
          ingredient_type: "QUANT",
          scalable: true,
        },
        {
          ingredient_id: "ing-2",
          standard_name: "로메인",
          amount: 2,
          unit: "줌",
          display_text: "2줌",
          ingredient_type: "QUANT",
          scalable: true,
        },
        {
          ingredient_id: "ing-3",
          standard_name: "방울토마토",
          amount: 5,
          unit: "개",
          display_text: "5개",
          ingredient_type: "QUANT",
          scalable: true,
        },
        {
          ingredient_id: "ing-4",
          standard_name: "아보카도",
          amount: 0.5,
          unit: "개",
          display_text: "1/2개",
          ingredient_type: "QUANT",
          scalable: true,
        },
        {
          ingredient_id: "ing-5",
          standard_name: "발사믹 드레싱",
          amount: 2,
          unit: "T",
          display_text: "2T",
          ingredient_type: "QUANT",
          scalable: true,
        },
      ],
      steps: [
        {
          step_number: 1,
          instruction: "닭가슴살 슬라이스, 로메인 뜯기, 토마토 반 갈라요.",
          cooking_method: {
            code: "prep",
            label: "준비",
            color_key: "prep",
          },
          ingredients_used: [],
          heat_level: null,
          duration_seconds: null,
          duration_text: null,
        },
        {
          step_number: 2,
          instruction: "볼에 모두 담고 드레싱 뿌려 가볍게 버무려요.",
          cooking_method: {
            code: "mix",
            label: "무치기",
            color_key: "mix",
          },
          ingredients_used: [],
          heat_level: null,
          duration_seconds: null,
          duration_text: null,
        },
      ],
    },
  };
}

function standaloneCookModeData() {
  return {
    recipe: {
      id: "recipe-standalone",
      title: "제육볶음",
      cooking_servings: 2,
      ingredients: [
        {
          ingredient_id: "standalone-ing-1",
          standard_name: "돼지고기",
          amount: 300,
          unit: "g",
          display_text: "300g",
          ingredient_type: "QUANT",
          scalable: true,
        },
        {
          ingredient_id: "standalone-ing-2",
          standard_name: "양파",
          amount: 1,
          unit: "개",
          display_text: "1개",
          ingredient_type: "QUANT",
          scalable: true,
        },
      ],
      steps: [
        {
          step_number: 1,
          instruction: "고추장, 고춧가루, 설탕, 마늘 섞어 양념장을 만들어요.",
          cooking_method: { code: "prep", label: "준비", color_key: "prep" },
          ingredients_used: [],
          heat_level: null,
          duration_seconds: null,
          duration_text: null,
        },
        {
          step_number: 2,
          instruction: "돼지고기에 양념장 버무려 10분 재워요.",
          cooking_method: { code: "prep", label: "준비", color_key: "prep" },
          ingredients_used: [],
          heat_level: null,
          duration_seconds: null,
          duration_text: null,
        },
        {
          step_number: 3,
          instruction: "달군 팬에 재운 고기를 넣고 센불에 4분 볶아요.",
          cooking_method: {
            code: "stir_fry",
            label: "볶기",
            color_key: "stir_fry",
          },
          ingredients_used: [],
          heat_level: null,
          duration_seconds: null,
          duration_text: null,
        },
        {
          step_number: 4,
          instruction: "양파와 대파를 넣고 3분 더 볶아 마무리.",
          cooking_method: {
            code: "stir_fry",
            label: "볶기",
            color_key: "stir_fry",
          },
          ingredients_used: [],
          heat_level: null,
          duration_seconds: null,
          duration_text: null,
        },
      ],
    },
  };
}

async function installCookingRoutes(page: Page) {
  await page.route("**/api/v1/cooking/sessions/*/cook-mode", async (route) => {
    await route.fulfill({
      json: { success: true, data: cookModeData(), error: null },
    });
  });

  await page.route("**/api/v1/recipes/*/cook-mode*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: standaloneCookModeData(),
        error: null,
      },
    });
  });
}

test("capture Wave1 shopping/cooking authority evidence", async ({ browser }) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installShoppingRoutes(page);
    await page.goto(`${BASE_URL}/shopping/flow`);
    await expect(page.getByText("제육볶음")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "shopping-flow-preview.png"),
    });
    await page.getByRole("button", { name: "장보기 목록 만들기" }).click();
    await expect(page.getByText("STEP 2 / 2")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "shopping-flow-review.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installShoppingRoutes(page);
    await page.goto(`${BASE_URL}/shopping/flow`);
    await expect(page.getByText("제육볶음")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "shopping-flow-narrow.png"),
    });
    await page.getByRole("button", { name: "장보기 목록 만들기" }).click();
    await expect(page.getByText("STEP 2 / 2")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "shopping-flow-review-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installShoppingRoutes(page);
    await page.goto(`${BASE_URL}/shopping/lists/list-1`);
    await expect(page.getByText("이번 주 평일 저녁")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "shopping-detail-default.png"),
    });

    await page.getByRole("button", { name: "장보기 완료" }).click();
    await expect(
      page.getByRole("dialog", { name: /팬트리에 (추가|반영)할까요\?/ }),
    ).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "shopping-complete-pantry.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installShoppingRoutes(page);
    await page.goto(`${BASE_URL}/shopping/lists/list-1`);
    await expect(page.getByText("이번 주 평일 저녁")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "shopping-detail-narrow.png"),
    });

    await page.getByRole("button", { name: "장보기 완료" }).click();
    await expect(
      page.getByRole("dialog", { name: /팬트리에 (추가|반영)할까요\?/ }),
    ).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "shopping-complete-pantry-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installShoppingRoutes(page);
    await page.goto(`${BASE_URL}/shopping/lists/list-completed`);
    await expect(page.getByRole("heading", { name: "완료된 장보기" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "shopping-detail-readonly.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installCookingRoutes(page);
    await page.goto(`${BASE_URL}/cooking/sessions/session-abc/cook-mode`);
    await expect(page.getByTestId("step-list")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "cook-mode-scroll.png"),
    });

    await page.getByTestId("complete-button").click();
    await expect(page.getByTestId("consumed-ingredient-sheet")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "cook-mode-complete.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installCookingRoutes(page);
    await page.goto(`${BASE_URL}/cooking/sessions/session-abc/cook-mode`);
    await expect(page.getByTestId("step-list")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "cook-mode-narrow.png"),
    });

    await page.getByTestId("complete-button").click();
    await expect(page.getByTestId("consumed-ingredient-sheet")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "cook-mode-complete-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installCookingRoutes(page);
    await page.goto(`${BASE_URL}/cooking/recipes/recipe-1/cook-mode?servings=2`);
    await expect(page.getByTestId("step-list")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "standalone-cook-mode-scroll.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installCookingRoutes(page);
    await page.goto(`${BASE_URL}/cooking/recipes/recipe-1/cook-mode?servings=2`);
    await expect(page.getByTestId("step-list")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "standalone-cook-mode-narrow.png"),
    });
    await context.close();
  }
});
