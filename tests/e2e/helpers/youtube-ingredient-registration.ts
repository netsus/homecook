import type { Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

export const YOUTUBE_INGREDIENT_REGISTRATION_URL = "/menu/add/youtube";

export interface CapturedYoutubeRegistrationRequests {
  ingredientRegistrationBody: Record<string, unknown> | null;
  recipeRegistrationBody: Record<string, unknown> | null;
}

export async function setYoutubeIngredientRegistrationAuth(page: Page) {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      value: "authenticated",
      url: E2E_APP_ORIGIN,
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(key, "authenticated");
    },
    { key: E2E_AUTH_OVERRIDE_KEY },
  );
}

export async function installYoutubeIngredientRegistrationRoutes(page: Page) {
  const captured: CapturedYoutubeRegistrationRequests = {
    ingredientRegistrationBody: null,
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
              id: "method-mix",
              code: "mix",
              label: "섞기",
              color_key: "gray",
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
            video_id: "mustard123",
            title: "목살 양념구이",
            channel: "집밥 테스트",
            thumbnail_url: "https://i.ytimg.com/vi/mustard123/hqdefault.jpg",
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
          extraction_id: "ext-ingredient-registration",
          title: "목살 양념구이",
          base_servings: 2,
          extraction_methods: ["description"],
          draft_warnings: [],
          blocking_issues: ["ingredients[0].ingredient_id"],
          ingredients: [
            {
              draft_ingredient_id: "draft-mustard",
              ingredient_id: "",
              standard_name: "연겨자",
              amount: 0.2,
              unit: "스푼",
              ingredient_type: "QUANT",
              display_text: "연겨자 0.2스푼",
              sort_order: 1,
              scalable: true,
              confidence: 0.72,
              resolution_status: "unresolved",
              raw_text: "연겨자 0.2스푼",
              candidates: [],
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "양념을 섞어 고기에 바른다",
              cooking_method: {
                id: "method-mix",
                code: "mix",
                label: "섞기",
                color_key: "gray",
                is_new: false,
              },
              duration_text: null,
              is_incomplete: false,
              missing_fields: [],
              raw_text: "양념을 섞어 고기에 바른다",
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
    captured.ingredientRegistrationBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      json: {
        success: true,
        data: {
          ingredient: {
            ingredient_id: "ing-registered-mustard",
            standard_name: "연겨자",
            category: "양념",
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
          recipe_id: "recipe-registered-mustard",
          title: "목살 양념구이",
        },
        error: null,
      },
    });
  });

  return captured;
}

export async function openYoutubeIngredientRegistrationReview(page: Page) {
  await page.goto(YOUTUBE_INGREDIENT_REGISTRATION_URL);
  await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=mustard123");
  await page.getByRole("button", { name: "가져오기" }).click();
  await page.getByTestId("register-ingredient-action").waitFor({ state: "visible" });
}
