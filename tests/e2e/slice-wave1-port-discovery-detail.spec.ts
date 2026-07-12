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

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

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
    await expect(
      page.locator('input[placeholder="레시피 제목 검색"]:visible').first(),
    ).toBeVisible();

    const sortButton = page
      .locator("button:visible")
      .filter({ hasText: /조회수순|최신순|저장순|플래너 등록순|정렬 기준/i })
      .first();
    await expect(sortButton).toBeVisible();
    await expect(sortButton).toContainText("조회수순");

    await sortButton.click();

    const listbox = page.locator('[role="listbox"]:visible');
    await expect(listbox).toBeVisible({ timeout: 15000 });

    await page
      .locator('[role="option"]:visible')
      .filter({ hasText: "저장순" })
      .click();

    await expect(sortButton).toContainText("저장순");
  });

  test("HOME filter controls match app and desktop layouts", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.locator('a[href="/recipe/mock-kimchi-jjigae"]:visible').first(),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator("h2:visible").filter({ hasText: "모든 레시피" }).first(),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByLabel("태그 필터").getByRole("button", { name: "한식" }),
    ).toBeVisible();

    if (isMobileViewport(page)) {
      const recipeListSection = page.locator('section[aria-label="모든 레시피"]');
      const discoveryRail = page.locator('section[aria-label="집밥 둘러보기"]');
      await expect(
        page.locator("button:visible").filter({ hasText: "재료로 검색" }).first(),
      ).toBeVisible();
      await expect(
        recipeListSection.getByRole("button", { name: /^전체$/ }),
      ).toHaveCount(0);
      await expect(
        recipeListSection.getByRole("button", { name: /^다이어트$/ }),
      ).toHaveCount(0);
      await expect(
        discoveryRail.getByRole("button", { name: /다이어트 식단/ }),
      ).toBeVisible();
    } else {
      await expect(
        page.locator("button:visible").filter({ hasText: "재료로 검색" }).first(),
      ).toBeVisible();
    }
  });

  test("HOME header does not contain profile or cart icons", async ({
    page,
  }) => {
    await page.goto("/");
    if (isMobileViewport(page)) {
      await expect(page.getByRole("heading", { name: "집밥" })).toBeVisible();
    } else {
      await expect(
        page.getByRole("link", { name: "집밥", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "데스크탑 주요 메뉴" }),
      ).toBeVisible();
    }

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
    const visibleSummary = page.locator('[aria-label="레시피 요약"]:visible').first();
    await expect(visibleSummary).toContainText("요리완료");
    await expect(visibleSummary).toContainText("34");

    const plannerCta = page.getByRole("button", { name: "플래너에 추가" }).first();
    const cookCta = page.getByRole("button", { name: "요리하기" }).first();

    await expect(plannerCta).toBeVisible();
    await expect(cookCta).toBeVisible();

    if (isMobileViewport(page)) {
      const ctaBar = page.locator(".wave1-recipe-cta-bar").first();
      await expect(ctaBar).toBeVisible();
    } else {
      await expect(page.getByText("요리모드 진입 후에는 인분을 바꿀 수 없어요.")).toBeVisible();
    }
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

  test("login page shows Kakao, Naver, and Google providers", async ({
    page,
  }) => {
    await page.route("**/api/v1/recipes/**", async (route) => {
      await route.fulfill({ json: { success: true, data: null, error: null } });
    });

    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: "Google로 시작하기" }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("button", { name: "카카오로 시작하기" }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "네이버로 시작하기" }),
    ).toBeVisible();
  });
});
