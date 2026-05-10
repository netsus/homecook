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
const MEAL_SCREEN_PATH = `/planner/${PLAN_DATE}/${COLUMN_ID}?slot=${encodeURIComponent(SLOT_NAME)}`;
const MENU_ADD_PATH = `/menu-add?date=${PLAN_DATE}&columnId=${COLUMN_ID}&slot=${encodeURIComponent(SLOT_NAME)}`;
const MANUAL_CREATE_PATH = `/menu/add/manual?date=${PLAN_DATE}&columnId=${COLUMN_ID}&slot=${encodeURIComponent(SLOT_NAME)}`;

const viewports = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
} as const;

async function preparePage(
  browser: Browser,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
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

async function installPlannerRoutes(page: Page) {
  await page.route("**/api/v1/planner?*", async (route) => {
    const url = new URL(route.request().url());
    const startDate = url.searchParams.get("start_date") ?? PLAN_DATE;

    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: [
            { id: COLUMN_ID, name: "아침", sort_order: 0 },
            { id: "column-lunch", name: "점심", sort_order: 1 },
            { id: "column-dinner", name: "저녁", sort_order: 2 },
          ],
          meals: [
            {
              id: "meal-1",
              recipe_id: RECIPE_ID,
              recipe_title: "김치찌개",
              recipe_thumbnail_url: null,
              plan_date: startDate,
              column_id: COLUMN_ID,
              planned_servings: 2,
              status: "registered",
              is_leftover: false,
            },
            {
              id: "meal-2",
              recipe_id: "recipe-lunch",
              recipe_title: "두부 샐러드",
              recipe_thumbnail_url: null,
              plan_date: startDate,
              column_id: "column-lunch",
              planned_servings: 1,
              status: "shopping_done",
              is_leftover: false,
            },
          ],
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
              recipe_id: RECIPE_ID,
              recipe_title: "김치찌개",
              recipe_thumbnail_url: null,
              planned_servings: 2,
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

test("capture Wave1 planner/meal-add authority evidence", async ({ browser }) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installPlannerRoutes(page);
    await page.goto(`${BASE_URL}/planner`);
    await expect(page.getByRole("heading", { name: "식단 플래너" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "planner-mobile-default.png"),
    });

    await page.getByRole("button", { name: "다음 주" }).click();
    await expect(page.getByRole("button", { name: "이번주로" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "planner-week-navigation.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installPlannerRoutes(page);
    await page.goto(`${BASE_URL}/planner`);
    await expect(page.getByRole("heading", { name: "식단 플래너" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "planner-mobile-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await page.goto(`${BASE_URL}${MENU_ADD_PATH}`);
    await expect(page.getByTestId("menu-add-option-grid")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "menu-add-option-grid.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installManualCreateRoutes(page);
    await page.goto(`${BASE_URL}${MANUAL_CREATE_PATH}`);
    await page.getByRole("button", { name: "+ 재료 추가" }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog).toBeVisible();
    await stabilize(page);
    await dialog.screenshot({
      path: path.join(EVIDENCE_DIR, "manual-create-ingredient-modal.png"),
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
    await page.getByTestId("meal-recipe-link-meal-1").click();
    await expect(page.getByRole("heading", { name: "집밥 김치찌개" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "meal-screen-recipe-click.png"),
    });
    await context.close();
  }
});
