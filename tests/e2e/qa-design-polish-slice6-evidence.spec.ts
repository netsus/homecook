import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/design-polish-slice6-shopping-cooking-pantry",
);

const PLAN_DATE = "2026-04-18";
const COLUMN_ID = "550e8400-e29b-41d4-a716-446655440050";
const SLOT_NAME = "아침";
const MEAL_SCREEN_PATH = `/planner/${PLAN_DATE}/${COLUMN_ID}?slot=${encodeURIComponent(SLOT_NAME)}`;

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

async function installMealScreenRoutes(page: Page) {
  await page.route("**/api/v1/meals?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              id: "meal-1",
              recipe_id: "recipe-1",
              recipe_title: "김치찌개",
              recipe_thumbnail_url: null,
              planned_servings: 2,
              status: "shopping_done",
              is_leftover: false,
            },
            {
              id: "meal-2",
              recipe_id: "recipe-1",
              recipe_title: "김치찌개",
              recipe_thumbnail_url: null,
              planned_servings: 3,
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

async function installCookModeRoutes(page: Page) {
  await page.route("**/api/v1/cooking/sessions/*/cook-mode", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          session_id: "session-slice6",
          recipe: {
            id: "recipe-1",
            title: "김치찌개",
            cooking_servings: 3,
            ingredients: [
              {
                ingredient_id: "ing-1",
                standard_name: "김치",
                amount: 300,
                unit: "g",
                display_text: "김치 300g",
                ingredient_type: "QUANT",
                scalable: true,
              },
              {
                ingredient_id: "ing-2",
                standard_name: "돼지고기",
                amount: 180,
                unit: "g",
                display_text: "돼지고기 180g",
                ingredient_type: "QUANT",
                scalable: true,
              },
              {
                ingredient_id: "ing-3",
                standard_name: "양파",
                amount: 50,
                unit: "g",
                display_text: "양파 50g",
                ingredient_type: "QUANT",
                scalable: true,
              },
            ],
            steps: [
              {
                step_number: 1,
                instruction: "재료를 먹기 좋은 크기로 썰어주세요.",
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
                instruction: "냄비에 넣고 중불에서 끓여주세요.",
                cooking_method: {
                  code: "boil",
                  label: "끓이기",
                  color_key: "boil",
                },
                ingredients_used: [],
                heat_level: "medium",
                duration_seconds: 600,
                duration_text: null,
              },
            ],
          },
        },
        error: null,
      },
    });
  });
}

async function expectCompactCookMode(page: Page) {
  await expect(page.getByTestId("mobile-ingredient-summary")).toBeVisible();
  await expect(page.getByTestId("cook-mode-servings")).toContainText("3인분");
  await expect(page.getByTestId("step-list")).toBeVisible();

  const order = await page
    .locator('[data-testid="mobile-ingredient-summary"], [data-testid="step-list"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-testid")),
    );
  expect(order).toEqual(["mobile-ingredient-summary", "step-list"]);

  const gap = await page.evaluate(() => {
    const ingredients = document
      .querySelector('[data-testid="mobile-ingredient-summary"]')
      ?.getBoundingClientRect();
    const steps = document
      .querySelector('[data-testid="step-list"]')
      ?.getBoundingClientRect();

    if (!ingredients || !steps) {
      return Number.POSITIVE_INFINITY;
    }

    return steps.top - ingredients.bottom;
  });
  expect(gap).toBeLessThanOrEqual(16);
}

test("capture design polish slice6 authority evidence", async ({ browser }) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installMealScreenRoutes(page);
    await page.goto(`${BASE_URL}${MEAL_SCREEN_PATH}`);
    await expect(
      page.getByRole("button", { name: "김치찌개 요리하기" }).first(),
    ).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "MEAL_SCREEN-cook-shortcut-mobile.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installMealScreenRoutes(page);
    await page.goto(`${BASE_URL}${MEAL_SCREEN_PATH}`);
    await expect(
      page.getByRole("button", { name: "김치찌개 요리하기" }).first(),
    ).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "MEAL_SCREEN-cook-shortcut-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installCookModeRoutes(page);
    await page.goto(`${BASE_URL}/cooking/sessions/session-slice6/cook-mode`);
    await expectCompactCookMode(page);
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "COOK_MODE-ingredients-steps-mobile.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installCookModeRoutes(page);
    await page.goto(`${BASE_URL}/cooking/sessions/session-slice6/cook-mode`);
    await expectCompactCookMode(page);
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "COOK_MODE-ingredients-steps-narrow.png"),
    });
    await context.close();
  }
});
