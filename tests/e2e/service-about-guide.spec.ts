import { expect, test } from "@playwright/test";

import { installDiscoveryRoutes } from "./helpers/mock-routes";

function isMobile(width: number | undefined) {
  return (width ?? 1280) < 1024;
}

test.describe("service about guide", () => {
  test.beforeEach(async ({ page }) => {
    await installDiscoveryRoutes(page);
  });

  test("desktop global nav opens the public guide and keeps legal subnav", async ({
    page,
  }, testInfo) => {
    test.skip(isMobile(testInfo.project.use.viewport?.width), "desktop navigation only");

    await page.goto("/");
    await page.getByRole("link", { name: "무먹 가이드" }).click();

    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole("heading", { level: 1, name: "무엇을 먹든, 계획은 한곳에서" })).toBeVisible();
    await expect(page.locator('a[aria-current="page"][href="/about"]')).toBeVisible();

    await page.goto("/privacy");
    await expect(page.getByRole("link", { name: "무먹 가이드" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "법적 문서" })).toBeVisible();

    await page.goto("/about");
    await page.getByRole("link", { name: "플래너 시작하기" }).click();
    await expect(page).toHaveURL(/\/planner$/);
    await expect(page.getByText("이 화면은 로그인이 필요해요")).toBeVisible();

    await page.goto("/about");
    await page.getByRole("link", { name: "레시피 둘러보기" }).first().click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("mobile HOME exposes a compact guide-first discovery rail", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.use.viewport?.width), "mobile HOME only");
    if (testInfo.project.name === "mobile-ios-small") {
      await page.setViewportSize({ height: 568, width: 320 });
    }

    await page.goto("/");
    const quickLinks = page.getByRole("navigation", { name: "홈 빠른 이동" });
    const rail = page.getByRole("region", { name: "무먹 둘러보기" });
    const guide = page.getByRole("link", { name: "무먹 가이드 보기" });

    await expect(quickLinks).toBeVisible();
    await expect(rail).toBeVisible();
    await expect(guide).toHaveAttribute("href", "/about#how-to");
    await expect(rail.getByRole("button").first()).toHaveAttribute("aria-pressed", "false");

    const geometry = await rail.evaluate((element) => {
      const cards = element.querySelectorAll<HTMLElement>(".home-mobile-theme-card");
      const card = cards.item(0);
      const nextCard = cards.item(1);
      const railElement = element.querySelector<HTMLElement>(".home-mobile-theme-rail");
      const nextCardRect = nextCard?.getBoundingClientRect();
      const railRect = railElement?.getBoundingClientRect();
      return {
        cardHeight: card?.getBoundingClientRect().height ?? 0,
        cardWidth: card?.getBoundingClientRect().width ?? 0,
        nextCardVisibleWidth:
          nextCardRect && railRect
            ? Math.max(0, Math.min(nextCardRect.right, railRect.right) - nextCardRect.left)
            : 0,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        railHeight: element.getBoundingClientRect().height,
      };
    });

    expect(geometry.cardHeight).toBeGreaterThanOrEqual(136);
    expect(geometry.cardHeight).toBeLessThanOrEqual(144);
    expect(geometry.railHeight).toBeLessThanOrEqual(220);
    expect(geometry.pageOverflow).toBe(0);
    if (page.viewportSize()?.width === 320) {
      expect(geometry.nextCardVisibleWidth).toBeGreaterThan(24);
      expect(geometry.nextCardVisibleWidth).toBeLessThan(geometry.cardWidth);
    }

    const titleSearch = page.getByRole("textbox", { name: "레시피 제목 검색" });
    await titleSearch.fill("김치");
    await expect(quickLinks).toBeHidden();
    await expect(rail).toBeHidden();
    await titleSearch.fill("");
    await expect(quickLinks).toBeVisible();
    await expect(rail).toBeVisible();

    await guide.click();
    await expect(page).toHaveURL(/\/about#how-to$/);
    await page.getByRole("button", { name: "뒤로 가기" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("mobile HOME keeps the guide when themes are empty or fail", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.use.viewport?.width), "mobile HOME only");

    await page.unroute("**/api/v1/recipes/themes");
    await page.route("**/api/v1/recipes/themes", async (route) => {
      await route.fulfill({
        json: { success: true, data: { themes: [] }, error: null },
      });
    });
    await page.goto("/");

    const emptyRail = page.getByRole("region", { name: "무먹 둘러보기" });
    await expect(emptyRail.getByRole("link", { name: "무먹 가이드 보기" })).toBeVisible();
    await expect(emptyRail.getByRole("button")).toHaveCount(0);

    await page.unroute("**/api/v1/recipes/themes");
    await page.route("**/api/v1/recipes/themes", async (route) => {
      await route.fulfill({
        status: 500,
        json: {
          success: false,
          data: null,
          error: { code: "INTERNAL_ERROR", message: "테마 오류", fields: [] },
        },
      });
    });
    await page.reload();

    const errorRail = page.getByRole("region", { name: "무먹 둘러보기" });
    await expect(errorRail.getByRole("link", { name: "무먹 가이드 보기" })).toBeVisible();
    await expect(errorRail.getByRole("button")).toHaveCount(0);
  });

  test("direct mobile guide visit falls back to HOME", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.use.viewport?.width), "mobile guide only");

    await page.goto("/about");
    await page.getByRole("button", { name: "뒤로 가기" }).click();

    await expect(page).toHaveURL(/\/$/);
  });

  test("legacy help redirects before auth and FAQ is keyboard operable", async ({ page }) => {
    await page.goto("/mypage?tab=help");

    await expect(page).toHaveURL(/\/about#faq$/);
    const trigger = page.getByRole("button", { name: "‘이미있음’은 무엇인가요?" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
