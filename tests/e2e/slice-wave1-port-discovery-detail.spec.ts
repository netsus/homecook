import { expect, test, type Page } from "@playwright/test";

import {
  installDiscoveryRoutes,
  installRecipeDetailRoutes,
  RECIPE_PATH,
} from "./helpers/mock-routes";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      value,
      url: E2E_APP_ORIGIN,
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(
    ({ key, state }: { key: string; state: string }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

test.describe("wave1 port discovery detail", () => {
  test.beforeEach(async ({ page }) => {
    await installDiscoveryRoutes(page);
    await installRecipeDetailRoutes(page);
  });

  test("HOME uses inline SortDropdown instead of bottom sheet", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("김치볶음밥, 된장찌개…")).toBeVisible();

    const sortButton = page.getByRole("button", { name: /정렬 기준/i });
    await expect(sortButton).toBeVisible();
    await expect(sortButton).toContainText("조회수순");

    await sortButton.click();

    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();

    await page.getByText("저장순").click();

    await expect(sortButton).toContainText("저장순");
  });

  test("HOME ingredient chips are positioned under the recipe list heading", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 2, name: "모든 레시피" }),
    ).toBeVisible();

    const recipeListSection = page.locator('section[aria-label="모든 레시피"]');
    await expect(recipeListSection.getByRole("button", { name: "양파" })).toBeVisible();
    await expect(
      recipeListSection.getByRole("button", { name: "재료로 검색" }),
    ).toBeVisible();
  });

  test("HOME header does not contain profile or cart icons", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("homecook_")).toBeVisible();

    await expect(
      page.getByRole("button", { name: "장보기" }),
    ).not.toBeVisible();
  });

  test("RECIPE_DETAIL shows hero action metrics and sticky bottom CTA", async ({
    page,
  }) => {
    await page.goto(RECIPE_PATH);

    await expect(page.getByRole("button", { name: "좋아요 203" })).toBeVisible();
    await expect(page.getByRole("button", { name: "저장" })).toBeVisible();
    await expect(page.getByRole("status", { name: /요리완료/ })).toBeVisible();

    const plannerCta = page.getByRole("button", { name: "플래너에 추가" });
    const cookCta = page.getByRole("button", { name: "요리하기" });

    await expect(plannerCta).toBeVisible();
    await expect(cookCta).toBeVisible();

    const ctaBar = page.locator(".wave1-recipe-cta-bar, .sticky.bottom-0").first();
    await expect(ctaBar).toBeVisible();
  });

  test("RECIPE_DETAIL planner add sheet opens from sticky CTA", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await page.goto(RECIPE_PATH);

    // Mock planner columns API
    await page.route("**/api/planner/columns**", async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            columns: [
              {
                id: "col-1",
                name: "아침",
                sort_order: 0,
                owner_id: "u1",
                created_at: "2026-05-10",
              },
            ],
          },
          error: null,
        },
      });
    });

    const plannerCta = page.getByRole("button", { name: "플래너에 추가" });
    await expect(plannerCta).toBeVisible();
    await plannerCta.click();

    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("login page shows only Naver and Google providers", async ({
    page,
  }) => {
    await page.route("**/api/v1/recipes/**", async (route) => {
      await route.fulfill({ json: { success: true, data: null, error: null } });
    });

    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: "Google로 시작하기" }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "카카오로 시작하기" }),
    ).not.toBeVisible();
  });
});
