import { expect, test } from "@playwright/test";

import {
  installYoutubeIngredientRegistrationRoutes,
  openYoutubeIngredientRegistrationReview,
  setYoutubeIngredientRegistrationAuth,
} from "./helpers/youtube-ingredient-registration";

test.describe("Slice 22: YouTube ingredient registration", () => {
  test("unresolved ingredient can be user-registered and then saved @smoke-core", async ({
    page,
  }) => {
    await setYoutubeIngredientRegistrationAuth(page);
    const captured = await installYoutubeIngredientRegistrationRoutes(page);

    await openYoutubeIngredientRegistrationReview(page);

    await expect(page.getByText("재료를 찾지 못했어요")).toBeVisible();
    await expect(page.getByRole("button", { name: "등록", exact: true })).toBeDisabled();

    await page.getByTestId("register-ingredient-action").click();
    const dialog = page.getByTestId("ingredient-register-modal");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("register-standard-name")).toHaveValue("연겨자");

    await dialog.getByRole("button", { name: "등록" }).click();

    await expect(page.getByText("재료를 찾지 못했어요")).toHaveCount(0);
    await expect(page.getByLabel("연겨자 수량")).toHaveValue("0.2");
    await expect(page.getByRole("button", { name: "연겨자 스푼" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    expect(captured.ingredientRegistrationBody).toMatchObject({
      extraction_id: "ext-ingredient-registration",
      draft_ingredient_id: "draft-mustard",
      standard_name: "연겨자",
      category: "양념",
      category_code: "paste_sauce",
      default_unit: null,
      synonym: "연겨자",
    });

    await expect(page.getByRole("button", { name: "등록", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "등록", exact: true }).click();

    await expect(page.getByText("레시피가 등록됐어요")).toBeVisible();
    expect(captured.recipeRegistrationBody).toMatchObject({
      extraction_id: "ext-ingredient-registration",
      ingredients: [
        expect.objectContaining({
          ingredient_id: "ing-registered-mustard",
          standard_name: "연겨자",
          amount: 0.2,
          unit: "스푼",
        }),
      ],
    });
  });
});
