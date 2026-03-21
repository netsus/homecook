import { expect, test } from "@playwright/test";

test.describe("Slice 01 basic flow", () => {
  test("HOME shows list, supports search, and updates sort state", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "오늘 만들 집밥을 바로 찾으세요" }),
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

    const sortSelect = page.getByRole("combobox", { name: "정렬 기준" });
    await sortSelect.selectOption("like_count");
    await expect(sortSelect).toHaveValue("like_count");
  });

  test("Recipe detail opens from HOME and shows key sections", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /집밥 김치찌개/i }).first().click();

    await expect(page).toHaveURL(/\/recipe\/mock-kimchi-jjigae$/);
    await expect(
      page.getByRole("heading", { name: "집밥 김치찌개" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "인분에 따라 재료량이 바뀝니다" })).toBeVisible();
    await expect(page.getByRole("button", { name: "플래너에 추가" })).toBeVisible();
  });

  test("Protected action opens login gate and modal can close with button, ESC, and backdrop", async ({
    page,
  }) => {
    await page.goto("/recipe/mock-kimchi-jjigae");

    await page.getByRole("button", { name: "플래너에 추가" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "로그인이 필요한 작업이에요" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "좋아요" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "저장" }).click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog).toBeHidden();
  });

  test("Recipe detail shows callback failure feedback", async ({ page }) => {
    await page.goto("/recipe/mock-kimchi-jjigae?authError=oauth_failed");

    await expect(
      page.getByText("로그인을 완료하지 못했어요. 다시 시도해주세요."),
    ).toBeVisible();
  });
});
