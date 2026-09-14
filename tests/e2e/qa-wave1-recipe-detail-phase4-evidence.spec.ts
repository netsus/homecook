import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  installRecipeDetailRoutes,
  RECIPE_ID,
  RECIPE_PATH,
} from "./helpers/mock-routes";
import type { RecipeDetail } from "@/types/recipe";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/wave1-mobile-phase4-recipe-detail",
);

const viewports = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
} as const;

const PROTOTYPE_RECIPE_DETAIL = {
  id: RECIPE_ID,
  title: "제육볶음",
  description: "고추장 양념에 재운 돼지고기를 센불에 볶아 완성하는 집밥 밥도둑이에요.",
  thumbnail_url: null,
  base_servings: 2,
  tags: ["밥도둑", "한식", "매콤"],
  source_type: "system",
  source: null,
  view_count: 4200,
  save_count: 3201,
  plan_count: 118,
  cook_count: 960,
  ingredients: [
    {
      id: "proto-pork",
      ingredient_id: "proto-pork",
      standard_name: "돼지고기 앞다리살",
      amount: 300,
      unit: "g",
      ingredient_type: "QUANT",
      display_text: "돼지고기 앞다리살 300g",
      scalable: true,
      sort_order: 1,
    },
    {
      id: "proto-onion",
      ingredient_id: "proto-onion",
      standard_name: "양파",
      amount: 0.5,
      unit: "개",
      ingredient_type: "QUANT",
      display_text: "양파 1/2개",
      scalable: true,
      sort_order: 2,
    },
    {
      id: "proto-green-onion",
      ingredient_id: "proto-green-onion",
      standard_name: "대파",
      amount: 1,
      unit: "대",
      ingredient_type: "QUANT",
      display_text: "대파 1대",
      scalable: true,
      sort_order: 3,
    },
    {
      id: "proto-gochujang",
      ingredient_id: "proto-gochujang",
      standard_name: "고추장",
      amount: 2,
      unit: "T",
      ingredient_type: "QUANT",
      display_text: "고추장 2T",
      scalable: true,
      sort_order: 4,
    },
    {
      id: "proto-chili",
      ingredient_id: "proto-chili",
      standard_name: "고춧가루",
      amount: 1,
      unit: "T",
      ingredient_type: "QUANT",
      display_text: "고춧가루 1T",
      scalable: true,
      sort_order: 5,
    },
    {
      id: "proto-sugar",
      ingredient_id: "proto-sugar",
      standard_name: "설탕",
      amount: 1,
      unit: "T",
      ingredient_type: "QUANT",
      display_text: "설탕 1T",
      scalable: true,
      sort_order: 6,
    },
    {
      id: "proto-garlic",
      ingredient_id: "proto-garlic",
      standard_name: "마늘",
      amount: 1,
      unit: "T",
      ingredient_type: "QUANT",
      display_text: "마늘 1T",
      scalable: true,
      sort_order: 7,
    },
  ],
  steps: [
    {
      id: "proto-step-1",
      step_number: 1,
      instruction: "고추장, 고춧가루, 설탕, 마늘 섞어 양념장을 만들어요.",
      cooking_method: {
        id: "prep",
        code: "prep",
        label: "손질",
        color_key: "green",
      },
      ingredients_used: [],
      heat_level: null,
      duration_seconds: 180,
      duration_text: "3분",
    },
    {
      id: "proto-step-2",
      step_number: 2,
      instruction: "돼지고기에 양념장 버무려 10분 재워요.",
      cooking_method: {
        id: "prep",
        code: "prep",
        label: "손질",
        color_key: "green",
      },
      ingredients_used: [],
      heat_level: null,
      duration_seconds: 600,
      duration_text: "10분",
    },
    {
      id: "proto-step-3",
      step_number: 3,
      instruction: "달군 팬에 재운 고기를 넣고 센불에 4분 볶아요.",
      cooking_method: {
        id: "stir-fry",
        code: "stir_fry",
        label: "볶기",
        color_key: "orange",
      },
      ingredients_used: [],
      heat_level: "강",
      duration_seconds: 240,
      duration_text: "4분",
    },
    {
      id: "proto-step-4",
      step_number: 4,
      instruction: "양파와 대파를 넣고 3분 더 볶아 마무리.",
      cooking_method: {
        id: "stir-fry",
        code: "stir_fry",
        label: "볶기",
        color_key: "orange",
      },
      ingredients_used: [],
      heat_level: "강",
      duration_seconds: 180,
      duration_text: "3분",
    },
  ],
} satisfies Partial<RecipeDetail>;

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
    ({ key }: { key: string }) => {
      window.localStorage.setItem(key, "authenticated");
    },
    { key: E2E_AUTH_OVERRIDE_KEY },
  );
}

async function installRecipeBookRoutes(page: Page) {
  await page.route("**/api/v1/recipe-books", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          books: [
            {
              book_type: "saved",
              id: "book-saved",
              name: "저장한 레시피",
              recipe_count: 3,
              sort_order: 0,
            },
            {
              book_type: "custom",
              id: "book-custom-weekday",
              name: "평일 저녁 빠른요리",
              recipe_count: 5,
              sort_order: 1,
            },
            {
              book_type: "custom",
              id: "book-custom-weekend",
              name: "주말 한 상 차림",
              recipe_count: 2,
              sort_order: 2,
            },
          ],
        },
        error: null,
      },
    });
  });
}

async function installPlannerRoutes(page: Page) {
  await page.route("**/api/v1/planner?*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: [
            { id: "breakfast", name: "아침", sort_order: 0 },
            { id: "lunch", name: "점심", sort_order: 1 },
            { id: "dinner", name: "저녁", sort_order: 2 },
          ],
          meals: [],
        },
        error: null,
      },
    });
  });
}

test("capture Wave1 recipe detail Phase 4 mobile evidence", async ({ browser }, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chrome",
    "Evidence capture writes shared PNG files and only needs one browser project.",
  );

  await mkdir(EVIDENCE_DIR, { recursive: true });

  for (const [name, viewport] of Object.entries(viewports)) {
    const { context, page } = await preparePage(browser, viewport);
    await installRecipeDetailRoutes(page, {
      initialLikeCount: 1921,
      recipeDetail: PROTOTYPE_RECIPE_DETAIL,
    });
    await page.goto(`${BASE_URL}${RECIPE_PATH}`);
    await expect(page.getByRole("heading", { name: "제육볶음" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, `recipe-detail-${name}.png`),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installRecipeDetailRoutes(page, {
      initialLikeCount: 1921,
      recipeDetail: PROTOTYPE_RECIPE_DETAIL,
    });
    await installPlannerRoutes(page);
    await page.goto(`${BASE_URL}${RECIPE_PATH}`);
    await page.getByRole("button", { name: "플래너에 추가" }).click();
    await expect(page.getByRole("dialog", { name: "플래너에 추가" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "planner-add-popup-mobile.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installRecipeDetailRoutes(page, {
      initialLikeCount: 1921,
      recipeDetail: PROTOTYPE_RECIPE_DETAIL,
    });
    await installRecipeBookRoutes(page);
    await page.goto(`${BASE_URL}${RECIPE_PATH}`);
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("dialog", { name: "레시피 저장" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "save-popup-mobile.png"),
    });
    await context.close();
  }
});
