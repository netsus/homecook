import { expect, test } from "@playwright/test";

import {
  setYoutubeIngredientRegistrationAuth,
} from "./helpers/youtube-ingredient-registration";
import {
  installBulkIngredientRoutes,
  openBulkReview,
} from "./helpers/youtube-bulk-ingredient-registration";

test.describe("Slice 25: YouTube bulk ingredient registration", () => {
  test("bulk CTA visible with 5 eligible rows, sheet opens and bulk registers all @smoke-core", async ({
    page,
  }) => {
    await setYoutubeIngredientRegistrationAuth(page);
    const captured = await installBulkIngredientRoutes(page);

    await openBulkReview(page);

    // Verify bulk CTA shows count of eligible (unresolved + needs_review with draft_ingredient_id)
    const bulkCta = page.getByTestId("bulk-register-cta");
    await expect(bulkCta).toContainText("5건 일괄 등록");

    // Open bulk sheet
    await bulkCta.click();
    const sheet = page.getByTestId("bulk-register-sheet");
    await expect(sheet).toBeVisible();

    // Verify 5 rows are shown (the resolved "물" should NOT be in the sheet)
    await expect(sheet.getByTestId("bulk-row-yt-ing-0")).toBeVisible();
    await expect(sheet.getByTestId("bulk-row-yt-ing-1")).toBeVisible();
    await expect(sheet.getByTestId("bulk-row-yt-ing-2")).toBeVisible();
    await expect(sheet.getByTestId("bulk-row-yt-ing-3")).toBeVisible();
    await expect(sheet.getByTestId("bulk-row-yt-ing-4")).toBeVisible();

    // Click bulk register
    await sheet.getByRole("button", { name: /일괄 등록/ }).click();

    // Wait for completion - all rows should show "등록 완료"
    await expect(sheet.getByText("등록 완료").first()).toBeVisible();
    await expect(sheet.getByText("5건 성공")).toBeVisible();

    // Close sheet — use the bottom action button (not the ModalHeader X)
    await sheet.getByRole("button", { name: "닫기", exact: true }).last().click();

    // Verify resolved state is reflected — no more "재료를 찾지 못했어요" labels
    await expect(page.getByText("재료를 찾지 못했어요")).toHaveCount(0);
    await expect(page.getByText("확인이 필요한 재료")).toHaveCount(0);

    // Verify recipe register button is enabled
    await expect(page.getByRole("button", { name: "등록", exact: true })).toBeEnabled();

    // Register the recipe
    await page.getByRole("button", { name: "등록", exact: true }).click();
    await expect(page.getByText("레시피가 등록됐어요")).toBeVisible();

    // Verify all 5 ingredient registrations were called
    expect(captured.ingredientRegistrationBodies).toHaveLength(5);
    expect(captured.ingredientRegistrationBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          draft_ingredient_id: "draft-doenjang",
          category: "양념",
          category_code: "paste_sauce",
        }),
        expect.objectContaining({
          draft_ingredient_id: "draft-gochugaru",
          category: "양념",
          category_code: "paste_sauce",
        }),
        expect.objectContaining({
          draft_ingredient_id: "draft-tofu",
          category: "양념",
          category_code: "paste_sauce",
        }),
        expect.objectContaining({
          draft_ingredient_id: "draft-zucchini",
          category: "양념",
          category_code: "paste_sauce",
        }),
        expect.objectContaining({
          draft_ingredient_id: "draft-onion",
          category: "양념",
          category_code: "paste_sauce",
        }),
      ]),
    );
    expect(captured.recipeRegistrationBody).toMatchObject({
      extraction_id: "ext-bulk-test",
      ingredients: expect.arrayContaining([
        expect.objectContaining({ ingredient_id: "ing-doenjang", standard_name: "된장" }),
        expect.objectContaining({ ingredient_id: "ing-gochugaru", standard_name: "고춧가루" }),
        expect.objectContaining({ ingredient_id: "ing-tofu", standard_name: "두부" }),
        expect.objectContaining({ ingredient_id: "ing-zucchini", standard_name: "애호박" }),
        expect.objectContaining({ ingredient_id: "ing-onion", standard_name: "양파" }),
      ]),
    });
  });

  test("existing single-row registration flow still works (regression) @smoke-core", async ({
    page,
  }) => {
    await setYoutubeIngredientRegistrationAuth(page);
    const captured = await installBulkIngredientRoutes(page);

    await openBulkReview(page);

    // Single-row register via the existing per-row action should still work
    const registerAction = page.getByTestId("register-ingredient-action").first();
    await registerAction.click();

    const dialog = page.getByTestId("ingredient-register-modal");
    await expect(dialog).toBeVisible();

    // Submit single registration
    await dialog.getByRole("button", { name: "등록" }).click();

    // Modal should close
    await expect(dialog).not.toBeVisible();
    expect(captured.ingredientRegistrationBodies[0]).toMatchObject({
      category: "양념",
      category_code: "paste_sauce",
    });

    // Resolution label should be gone for that ingredient
    // (this just verifies the single flow didn't break — partial check)
  });

  test("bulk CTA NOT visible when fewer than 2 eligible rows", async ({
    page,
  }) => {
    await setYoutubeIngredientRegistrationAuth(page);

    // Override extract route to return only 1 unresolved ingredient
    await page.route("**/api/v1/cooking-methods", async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: { methods: [{ id: "m1", code: "boil", label: "끓이기", color_key: "red", is_system: true }] },
          error: null,
        },
      });
    });

    await page.route("**/api/v1/recipes/youtube/validate", async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      await route.fulfill({
        json: {
          success: true,
          data: {
            is_valid_url: true,
            is_recipe_video: true,
            classification_status: "recipe",
            classification_reasons: [],
            video_info: {
              video_id: "single-test",
              title: "단일 재료",
              channel: "테스트",
              thumbnail_url: "https://i.ytimg.com/vi/single-test/hqdefault.jpg",
            },
          },
          error: null,
        },
      });
    });

    await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      await route.fulfill({
        json: {
          success: true,
          data: {
            extraction_id: "ext-single",
            title: "단일 재료 레시피",
            base_servings: 1,
            extraction_methods: ["description"],
            draft_warnings: [],
            blocking_issues: ["ingredients[0].ingredient_id"],
            ingredients: [
              {
                draft_ingredient_id: "draft-single",
                ingredient_id: "",
                standard_name: "소금",
                amount: 1,
                unit: "큰술",
                ingredient_type: "QUANT",
                display_text: "소금 1큰술",
                sort_order: 1,
                scalable: true,
                confidence: 0.5,
                resolution_status: "unresolved",
                raw_text: "소금 1큰술",
                candidates: [],
              },
            ],
            steps: [
              {
                step_number: 1,
                instruction: "소금을 넣는다",
                cooking_method: { id: "m1", code: "boil", label: "끓이기", color_key: "red", is_new: false },
                duration_text: null,
                is_incomplete: false,
                missing_fields: [],
                raw_text: "소금을 넣는다",
              },
            ],
            new_cooking_methods: [],
          },
          error: null,
        },
      });
    });

    await page.goto("/menu/add/youtube");
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=single-test");
    await page.getByRole("button", { name: "가져오기" }).click();

    // Wait for the review step to render
    await page.getByText("재료를 찾지 못했어요").waitFor({ state: "visible" });

    // Bulk CTA should NOT be visible (only 1 eligible row)
    await expect(page.getByTestId("bulk-register-cta")).toHaveCount(0);
  });
});
