import type { Page } from "@playwright/test";

import { YOUTUBE_INGREDIENT_REGISTRATION_URL } from "./youtube-ingredient-registration";

export interface CapturedBulkRequests {
  ingredientRegistrationBodies: Record<string, unknown>[];
  recipeRegistrationBody: Record<string, unknown> | null;
}

export async function installBulkIngredientRoutes(page: Page) {
  const captured: CapturedBulkRequests = {
    ingredientRegistrationBodies: [],
    recipeRegistrationBody: null,
  };

  await page.route("**/api/v1/cooking-methods", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          methods: [
            {
              id: "method-boil",
              code: "boil",
              label: "끓이기",
              color_key: "red",
              is_system: true,
            },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes/youtube/validate", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          is_valid_url: true,
          is_recipe_video: true,
          classification_status: "recipe",
          classification_reasons: [],
          video_info: {
            video_id: "bulktest123",
            title: "된장찌개 레시피",
            channel: "집밥 테스트",
            thumbnail_url: "https://i.ytimg.com/vi/bulktest123/hqdefault.jpg",
          },
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          extraction_id: "ext-bulk-test",
          title: "된장찌개 레시피",
          base_servings: 2,
          extraction_methods: ["description"],
          draft_warnings: [],
          blocking_issues: [
            "ingredients[0].ingredient_id",
            "ingredients[1].ingredient_id",
            "ingredients[2].ingredient_id",
            "ingredients[3].ingredient_id",
            "ingredients[4].ingredient_id",
          ],
          ingredients: [
            {
              draft_ingredient_id: "draft-doenjang",
              ingredient_id: "",
              standard_name: "된장",
              amount: 2,
              unit: "큰술",
              ingredient_type: "QUANT",
              display_text: "된장 2큰술",
              sort_order: 1,
              scalable: true,
              confidence: 0.65,
              resolution_status: "unresolved",
              raw_text: "된장 2큰술",
              candidates: [],
            },
            {
              draft_ingredient_id: "draft-gochugaru",
              ingredient_id: "",
              standard_name: "고춧가루",
              amount: 1,
              unit: "큰술",
              ingredient_type: "QUANT",
              display_text: "고춧가루 1큰술",
              sort_order: 2,
              scalable: true,
              confidence: 0.6,
              resolution_status: "unresolved",
              raw_text: "고춧가루 1큰술",
              candidates: [],
            },
            {
              draft_ingredient_id: "draft-tofu",
              ingredient_id: "",
              standard_name: "두부",
              amount: 0.5,
              unit: "모",
              ingredient_type: "QUANT",
              display_text: "두부 반 모",
              sort_order: 3,
              scalable: true,
              confidence: 0.7,
              resolution_status: "needs_review",
              raw_text: "두부 반 모",
              candidates: [],
            },
            {
              draft_ingredient_id: "draft-zucchini",
              ingredient_id: "",
              standard_name: "애호박",
              amount: 0.5,
              unit: "개",
              ingredient_type: "QUANT",
              display_text: "애호박 반 개",
              sort_order: 4,
              scalable: true,
              confidence: 0.62,
              resolution_status: "unresolved",
              raw_text: "애호박 반 개",
              candidates: [],
            },
            {
              draft_ingredient_id: "draft-onion",
              ingredient_id: "",
              standard_name: "양파",
              amount: 0.5,
              unit: "개",
              ingredient_type: "QUANT",
              display_text: "양파 반 개",
              sort_order: 5,
              scalable: true,
              confidence: 0.64,
              resolution_status: "unresolved",
              raw_text: "양파 반 개",
              candidates: [],
            },
            {
              draft_ingredient_id: null,
              ingredient_id: "ing-water",
              standard_name: "물",
              amount: 500,
              unit: "ml",
              ingredient_type: "QUANT",
              display_text: "물 500ml",
              sort_order: 6,
              scalable: true,
              confidence: 1,
              resolution_status: "resolved",
              raw_text: "물 500ml",
              candidates: [],
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "냄비에 물을 끓인다",
              cooking_method: {
                id: "method-boil",
                code: "boil",
                label: "끓이기",
                color_key: "red",
                is_new: false,
              },
              duration_text: null,
              is_incomplete: false,
              missing_fields: [],
              raw_text: "냄비에 물을 끓인다",
            },
          ],
          new_cooking_methods: [],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes/youtube/ingredient-registration", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const body = route.request().postDataJSON();
    captured.ingredientRegistrationBodies.push(body);

    const nameMap: Record<string, { id: string; name: string }> = {
      "draft-doenjang": { id: "ing-doenjang", name: "된장" },
      "draft-gochugaru": { id: "ing-gochugaru", name: "고춧가루" },
      "draft-tofu": { id: "ing-tofu", name: "두부" },
      "draft-zucchini": { id: "ing-zucchini", name: "애호박" },
      "draft-onion": { id: "ing-onion", name: "양파" },
    };

    const match = nameMap[body.draft_ingredient_id as string];
    if (!match) {
      await route.fulfill({
        status: 400,
        json: {
          success: false,
          data: null,
          error: { code: "UNKNOWN_ERROR", message: "알 수 없는 재료", fields: [] },
        },
      });
      return;
    }

    await route.fulfill({
      status: 200,
      json: {
        success: true,
        data: {
          ingredient: {
            ingredient_id: match.id,
            standard_name: match.name,
            category: body.category ?? "양념",
            default_unit: null,
            resolution_status: "resolved",
          },
          synonym_status: "attached",
          warnings: [],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes/youtube/register", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    captured.recipeRegistrationBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          recipe_id: "recipe-bulk-test",
          title: "된장찌개 레시피",
        },
        error: null,
      },
    });
  });

  return captured;
}

export async function openBulkReview(page: Page) {
  await page.goto(YOUTUBE_INGREDIENT_REGISTRATION_URL);
  await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=bulktest123");
  await page.getByRole("button", { name: "가져오기" }).click();
  await page.getByTestId("bulk-register-cta").waitFor({ state: "visible" });
}
