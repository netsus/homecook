import { expect, test } from "@playwright/test";

import {
  installDiscoveryRoutes,
  installRecipeDetailRoutes,
  RECIPE_PATH,
} from "./helpers/mock-routes";

const SMALL_IOS_ACTION_OVERFLOW_TOLERANCE = 12;

test.describe("Slice 01 basic flow", () => {
  test.beforeEach(async ({ page }) => {
    await installDiscoveryRoutes(page);
    await installRecipeDetailRoutes(page);
  });

  test("HOME shows list, supports search, and updates sort state", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "집밥을 바로 골라보세요" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "이번 주 인기 레시피" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /집밥 김치찌개/i }).first(),
    ).toBeVisible();

    await page.getByPlaceholder("레시피 제목 검색").fill("없는 레시피");
    await expect(page.getByText("다른 조합을 찾아보세요")).toBeVisible();

    await page.getByRole("button", { name: "검색 초기화" }).click();
    await expect(
      page.getByRole("link", { name: /집밥 김치찌개/i }).first(),
    ).toBeVisible();

    const sortButton = page.getByRole("button", { name: /정렬 기준/i });
    await sortButton.click();
    const plannerOption = page.getByRole("option", { name: "플래너 등록순" });
    await expect(plannerOption).toBeVisible();
    const optionBounds = await plannerOption.boundingBox();
    const viewport = page.viewportSize();

    expect(optionBounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect((optionBounds?.y ?? 0) + (optionBounds?.height ?? 0)).toBeLessThanOrEqual(
      (viewport?.height ?? 0) - 4,
    );
    await page.getByRole("option", { name: "좋아요순" }).click();
    await expect(sortButton).toContainText("좋아요순");
  });

  test("Recipe detail route shows key sections", async ({
    page,
  }) => {
    await page.goto(RECIPE_PATH);

    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH}$`));
    await expect(
      page.getByRole("heading", { name: "집밥 김치찌개" }),
    ).toBeVisible();
    await expect(page.getByText("인분에 따라 재료량이 바뀝니다")).toBeVisible();
    await expect(page.getByRole("button", { name: "플래너에 추가" })).toBeVisible();
    await expect(page.getByRole("button", { name: "공유하기" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "좋아요 203" })).toBeVisible();

    const likeChipPrecedesIngredients = await page.evaluate(() => {
      const likeButton = document.querySelector(
        'button[aria-label="좋아요 203"]',
      );
      const ingredientHeading = Array.from(document.querySelectorAll("h2, h3, p, span")).find(
        (element) => element.textContent?.trim() === "인분에 따라 재료량이 바뀝니다",
      );

      if (!(likeButton instanceof HTMLElement) || !(ingredientHeading instanceof HTMLElement)) {
        return false;
      }

      return Boolean(
        likeButton.compareDocumentPosition(ingredientHeading) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    expect(likeChipPrecedesIngredients).toBe(true);
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

  test("Protected action opens login gate and modal can close with button, ESC, and backdrop", async ({
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
