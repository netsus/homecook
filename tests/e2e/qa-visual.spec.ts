import { expect, test, type Page } from "@playwright/test";

import {
  installDiscoveryRoutes,
  installRecipeDetailRoutes,
  RECIPE_PATH,
} from "./helpers/mock-routes";

async function stabilizeVisualSnapshot(page: Page) {
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

      body {
        font-family: sans-serif !important;
      }

      nextjs-portal,
      [data-next-badge-root],
      [aria-label="Open Next.js Dev Tools"],
      [data-nextjs-toast] {
        display: none !important;
      }
    `,
  });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

test.describe("QA visual regression", () => {
  test("home default shell matches the visual baseline", async ({ page }) => {
    await installDiscoveryRoutes(page);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "오늘 만들 집밥을 바로 찾으세요" }),
    ).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-home-default.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("ingredient filter modal matches the visual baseline", async ({
    page,
  }) => {
    await installDiscoveryRoutes(page);

    await page.goto("/");
    await page.getByRole("button", { name: "재료로 검색" }).click();
    const dialog = page.getByRole("dialog", { name: "재료로 검색" });
    await expect(dialog).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(dialog).toHaveScreenshot("qa-ingredient-filter-modal.png", {
      animations: "disabled",
    });
  });

  test("recipe detail and login gate match the visual baseline", async ({
    page,
  }) => {
    await installRecipeDetailRoutes(page);

    await page.goto(RECIPE_PATH);
    await expect(
      page.getByRole("heading", { name: "집밥 김치찌개" }),
    ).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-recipe-detail.png", {
      animations: "disabled",
      fullPage: true,
    });

    await page.getByRole("button", { name: "플래너에 추가" }).click();
    await expect(
      page.getByRole("dialog", { name: "로그인이 필요한 작업이에요" }),
    ).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-login-gate-modal.png", {
      animations: "disabled",
      fullPage: true,
    });
  });
});
