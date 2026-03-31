import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const RECIPE_ID = "mock-kimchi-jjigae";
const RECIPE_PATH = `/recipe/${RECIPE_ID}`;
const PENDING_ACTION_KEY = "homecook.pending-recipe-action";

function buildRecipeDetail({
  isLiked = false,
  likeCount = 203,
}: {
  isLiked?: boolean;
  likeCount?: number;
} = {}) {
  return {
    id: RECIPE_ID,
    title: "집밥 김치찌개",
    description:
      "신김치와 돼지고기만 있으면 금방 끓일 수 있는 가장 기본적인 집밥 김치찌개예요.",
    thumbnail_url:
      "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80",
    base_servings: 2,
    tags: ["한식", "찌개", "저녁"],
    source_type: "system",
    source: null,
    view_count: 1285,
    like_count: likeCount,
    save_count: 89,
    plan_count: 52,
    cook_count: 34,
    ingredients: [
      {
        id: "mock-ing-1",
        ingredient_id: "ingredient-kimchi",
        standard_name: "김치",
        amount: 200,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "김치 200g",
        scalable: true,
        sort_order: 1,
      },
    ],
    steps: [
      {
        id: "mock-step-1",
        step_number: 1,
        instruction: "냄비에 돼지고기와 김치를 먼저 볶아 향을 올립니다.",
        cooking_method: {
          id: "method-stir",
          code: "stir_fry",
          label: "볶기",
          color_key: "orange",
        },
        ingredients_used: [],
        heat_level: "중",
        duration_seconds: 180,
        duration_text: "3분",
      },
    ],
    user_status: {
      is_liked: isLiked,
      is_saved: false,
      saved_book_ids: [],
    },
  };
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "authenticated");
  }, E2E_AUTH_OVERRIDE_KEY);
}

async function mockRecipeLikeRoutes(
  page: Page,
  {
    initialLiked = false,
    initialLikeCount = 203,
    responseDelayMs = 0,
  }: {
    initialLiked?: boolean;
    initialLikeCount?: number;
    responseDelayMs?: number;
  } = {},
) {
  let isLiked = initialLiked;
  let likeCount = initialLikeCount;

  await page.route(`**/api/v1/recipes/${RECIPE_ID}/like`, async (route) => {
    if (responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelayMs));
    }

    isLiked = !isLiked;
    likeCount = isLiked ? likeCount + 1 : Math.max(0, likeCount - 1);

    await route.fulfill({
      json: {
        success: true,
        data: {
          is_liked: isLiked,
          like_count: likeCount,
        },
        error: null,
      },
    });
  });

  await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: buildRecipeDetail({ isLiked, likeCount }),
        error: null,
      },
    });
  });
}

test.describe("Slice 03 recipe like flow", () => {
  test("logged-in user can like a recipe and sees pending while the request is in flight", async ({
    page,
  }) => {
    await installAuthenticatedSession(page);
    await mockRecipeLikeRoutes(page, { responseDelayMs: 400 });

    await page.goto(RECIPE_PATH);

    const likeButton = page.getByRole("button", { name: "좋아요 203" });
    await expect(likeButton).toBeVisible();

    await likeButton.click();

    const pendingButton = page.getByRole("button", {
      name: "좋아요 처리 중...",
    });
    await expect(pendingButton).toBeDisabled();

    await expect(
      page.getByRole("button", { name: "좋아요 204" }),
    ).toBeVisible();
  });

  test("logged-in user can unlike a recipe and sees the count decrease", async ({
    page,
  }) => {
    await installAuthenticatedSession(page);
    await mockRecipeLikeRoutes(page, {
      initialLiked: true,
      initialLikeCount: 204,
    });

    await page.goto(RECIPE_PATH);

    await page.getByRole("button", { name: "좋아요 204" }).click();

    await expect(
      page.getByRole("button", { name: "좋아요 203" }),
    ).toBeVisible();
  });

  test("guest user can return to recipe detail after login and the like action replays once", async ({
    page,
  }) => {
    await mockRecipeLikeRoutes(page);

    await page.goto(RECIPE_PATH);
    await page.getByRole("button", { name: "좋아요 203" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "로그인이 필요한 작업이에요" }),
    ).toBeVisible();

    await installAuthenticatedSession(page);
    await page.evaluate(
      ({ authOverrideKey, recipeId, storageKey }) => {
        window.localStorage.setItem(authOverrideKey, "authenticated");
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            type: "like",
            recipeId,
            redirectTo: `/recipe/${recipeId}`,
            createdAt: Date.now(),
          }),
        );
      },
      {
        authOverrideKey: E2E_AUTH_OVERRIDE_KEY,
        recipeId: RECIPE_ID,
        storageKey: PENDING_ACTION_KEY,
      },
    );

    await page.goto(RECIPE_PATH);

    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH}$`));
    await expect(
      page.getByText("로그인 완료. 좋아요를 반영했어요."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "좋아요 204" }),
    ).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate((storageKey) => window.localStorage.getItem(storageKey), PENDING_ACTION_KEY),
      )
      .toBeNull();
  });
});
