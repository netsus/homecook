import { expect, test } from "@playwright/test";

import {
  installDiscoveryRoutes,
  installRecipeDetailRoutes,
  RECIPE_PATH,
} from "./helpers/mock-routes";

const SMALL_IOS_ACTION_OVERFLOW_TOLERANCE = 12;

function isMobileViewport(page: { viewportSize: () => { width: number } | null }) {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

test.describe("Slice 01 basic flow", () => {
  test.beforeEach(async ({ page }) => {
    await installDiscoveryRoutes(page);
    await installRecipeDetailRoutes(page);
  });

  test("HOME shows list, supports search, and updates sort state @smoke-core", async ({
    page,
  }) => {
    await page.goto("/");

    const searchInput = page.locator('input[placeholder="레시피 제목 검색"]:visible').first();
    await expect(searchInput).toBeVisible();
    await expect(
      page.locator('a[href="/recipe/mock-kimchi-jjigae"]:visible').first(),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page
        .locator("h2:visible")
        .filter({
          hasText: isMobileViewport(page) ? "이번 주 인기 테마" : "모든 레시피",
        })
        .first(),
    ).toBeVisible({ timeout: 15000 });

    await searchInput.fill("없는 레시피");
    await expect(
      page
        .locator("h2:visible")
        .filter({
          hasText: "조건에 맞는 레시피가 없어요",
        })
        .first(),
    ).toBeVisible();

    await page
      .locator("button:visible")
      .filter({ hasText: "초기화" })
      .click();
    await expect(searchInput).toHaveValue("");
    await expect(
      page.locator('a[href="/recipe/mock-kimchi-jjigae"]:visible').first(),
    ).toBeVisible();

    const sortButton = page
      .locator("button:visible")
      .filter({ hasText: /조회수순|최신순|저장순|플래너 등록순|정렬 기준/i })
      .first();
    await sortButton.click();
    const plannerOption = page
      .locator('[role="option"]:visible')
      .filter({ hasText: "플래너 등록순" })
      .first();
    await expect(plannerOption).toBeVisible({ timeout: 15000 });
    const optionBounds = await plannerOption.boundingBox();
    const viewport = page.viewportSize();

    expect(optionBounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect((optionBounds?.y ?? 0) + (optionBounds?.height ?? 0)).toBeLessThanOrEqual(
      (viewport?.height ?? 0) - 4,
    );
    await expect(
      page.locator('[role="option"]:visible').filter({ hasText: "좋아요순" }),
    ).toHaveCount(0);
    await page
      .locator('[role="option"]:visible')
      .filter({ hasText: "최신순" })
      .click();
    await expect(sortButton).toContainText("최신순");
  });

  test("Recipe detail route shows key sections @smoke-core", async ({
    page,
  }) => {
    await page.goto(RECIPE_PATH);

    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH}$`));
    await expect(
      page.getByRole("heading", { name: "집밥 김치찌개" }),
    ).toBeVisible();
    await expect(
      page.locator("li:visible").filter({ hasText: /^김치/ }).first(),
    ).toBeVisible();
    await expect(
      page.locator("li:visible").filter({ hasText: /^돼지고기/ }).first(),
    ).toBeVisible();
    if (isMobileViewport(page)) {
      await expect(
        page.locator("div:visible").filter({ hasText: /^인분 조절$/ }).first(),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", { name: "인분 조절" }),
      ).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "플래너에 추가" })).toBeVisible();
    await expect(page.getByRole("button", { name: "공유하기" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "좋아요 203" })).toBeVisible();

    const likeChipPrecedesFirstIngredient = await page.evaluate(() => {
      const likeButton = Array.from(
        document.querySelectorAll('button[aria-label="좋아요 203"]'),
      ).find((element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }

        const style = window.getComputedStyle(element);
        return style.display !== "none" && element.getClientRects().length > 0;
      });
      const firstIngredient = Array.from(document.querySelectorAll("li, span")).find(
        (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          const style = window.getComputedStyle(element);
          return (
            element.textContent?.trim() === "김치" &&
            style.display !== "none" &&
            element.getClientRects().length > 0
          );
        },
      );

      if (!(likeButton instanceof HTMLElement) || !(firstIngredient instanceof HTMLElement)) {
        return false;
      }

      return Boolean(
        likeButton.compareDocumentPosition(firstIngredient) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    expect(likeChipPrecedesFirstIngredient).toBe(true);
  });

  test("small iOS viewport keeps detail actions above the fold with touch-friendly targets", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-ios-small");

    await page.goto(RECIPE_PATH);

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    for (const name of ["좋아요 203", "저장", "플래너에 추가"]) {
      const button = page.getByRole("button", { name });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();

      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.y + box!.height).toBeLessThanOrEqual(
        (viewport?.height ?? 0) + SMALL_IOS_ACTION_OVERFLOW_TOLERANCE - 4,
      );
    }
  });

  test("Protected action opens login gate and modal can close with button, ESC, and backdrop @smoke-core", async ({
    page,
  }) => {
    await page.goto(RECIPE_PATH);

    await page.getByRole("button", { name: "플래너에 추가" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "로그인이 필요한 작업이에요" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: /좋아요/ }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "저장" }).click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog).toBeHidden();
  });

  test("Recipe detail shows callback failure feedback", async ({ page }) => {
    await page.goto(`${RECIPE_PATH}?authError=oauth_failed`);

    await expect(
      page.getByText("로그인을 완료하지 못했어요. 다시 시도해주세요."),
    ).toBeVisible();
  });
});
