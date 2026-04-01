import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const PENDING_ACTION_KEY = "homecook.pending-recipe-action";
const RECIPE_ID = "mock-kimchi-jjigae";
const RECIPE_PATH = `/recipe/${RECIPE_ID}`;

interface SaveBook {
  id: string;
  name: string;
  book_type: "saved" | "custom";
  recipe_count: number;
  sort_order: number;
}

function buildRecipeDetail({
  saveCount,
  savedBookIds,
}: {
  saveCount: number;
  savedBookIds: string[];
}) {
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
    like_count: 203,
    save_count: saveCount,
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
      is_liked: false,
      is_saved: savedBookIds.length > 0,
      saved_book_ids: savedBookIds,
    },
  };
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "authenticated");
  }, E2E_AUTH_OVERRIDE_KEY);
}

async function mockRecipeSaveRoutes(page: Page) {
  let saveCount = 89;
  let savedBookIds: string[] = [];
  let nextSortOrder = 3;

  const books: SaveBook[] = [
    {
      id: "book-saved",
      name: "저장한 레시피",
      book_type: "saved",
      recipe_count: 8,
      sort_order: 1,
    },
    {
      id: "book-custom",
      name: "주말 파티",
      book_type: "custom",
      recipe_count: 2,
      sort_order: 2,
    },
  ];

  await page.route("**/api/v1/recipe-books", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      await route.fulfill({
        json: {
          success: true,
          data: {
            books,
          },
          error: null,
        },
      });
      return;
    }

    if (method === "POST") {
      const body = route.request().postDataJSON() as { name?: string };
      const name = body.name?.trim() ?? "";

      const createdBook: SaveBook = {
        id: `book-custom-${nextSortOrder}`,
        name,
        book_type: "custom",
        recipe_count: 0,
        sort_order: nextSortOrder,
      };

      nextSortOrder += 1;
      books.push(createdBook);

      await route.fulfill({
        json: {
          success: true,
          data: {
            ...createdBook,
            created_at: "2026-03-27T10:00:00Z",
            updated_at: "2026-03-27T10:00:00Z",
          },
          error: null,
        },
      });
      return;
    }

    await route.continue();
  });

  await page.route(`**/api/v1/recipes/${RECIPE_ID}/save`, async (route) => {
    const body = route.request().postDataJSON() as { book_id?: string };
    const bookId = body.book_id ?? "";

    if (savedBookIds.includes(bookId)) {
      await route.fulfill({
        status: 409,
        json: {
          success: false,
          data: null,
          error: {
            code: "CONFLICT",
            message: "이미 저장된 레시피예요.",
            fields: [],
          },
        },
      });
      return;
    }

    savedBookIds = [...savedBookIds, bookId];
    saveCount += 1;

    await route.fulfill({
      json: {
        success: true,
        data: {
          saved: true,
          save_count: saveCount,
          book_id: bookId,
        },
        error: null,
      },
    });
  });

  await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: buildRecipeDetail({
          saveCount,
          savedBookIds,
        }),
        error: null,
      },
    });
  });
}

test.describe("Slice 04 recipe save flow", () => {
  test("logged-in user can save to an existing recipe book", async ({ page }) => {
    await installAuthenticatedSession(page);
    await mockRecipeSaveRoutes(page);

    await page.goto(RECIPE_PATH);
    const saveActionButton = page.locator('button[aria-label="저장"][aria-pressed]');
    await expect(saveActionButton.getByText("89")).toBeVisible();

    await page.getByRole("button", { name: "저장" }).click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(
      modal.getByRole("heading", { name: "저장할 레시피북을 선택하세요" }),
    ).toBeVisible();

    await modal.getByRole("button", { name: /저장한 레시피/ }).click();
    await modal.getByRole("button", { name: /^저장$/ }).click();

    await expect(modal).not.toBeVisible();
    await expect(saveActionButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("레시피를 저장했어요.")).toBeVisible();
    await expect(saveActionButton.getByText("90")).toBeVisible();
  });

  test("logged-in user can quick-create a custom book and save", async ({ page }) => {
    await installAuthenticatedSession(page);
    await mockRecipeSaveRoutes(page);

    await page.goto(RECIPE_PATH);
    const saveActionButton = page.locator('button[aria-label="저장"][aria-pressed]');
    await expect(saveActionButton.getByText("89")).toBeVisible();

    await page.getByRole("button", { name: "저장" }).click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    await modal.getByPlaceholder("예: 주말 파티").fill("오늘 저녁");
    await modal.getByRole("button", { name: "생성" }).click();

    await expect(modal.getByRole("button", { name: /오늘 저녁/ })).toBeVisible();
    await modal.getByRole("button", { name: /오늘 저녁/ }).click();
    await modal.getByRole("button", { name: /^저장$/ }).click();

    await expect(modal).not.toBeVisible();
    await expect(saveActionButton).toHaveAttribute("aria-pressed", "true");
    await expect(saveActionButton.getByText("90")).toBeVisible();
  });

  test("guest user sees login gate and save modal reopens after return-to-action", async ({
    page,
  }) => {
    await mockRecipeSaveRoutes(page);

    await page.goto(RECIPE_PATH);
    await page.getByRole("button", { name: "저장" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "로그인이 필요한 작업이에요" }),
    ).toBeVisible();

    await page.evaluate(
      ({ authOverrideKey, pendingActionKey, recipeId }) => {
        window.localStorage.setItem(authOverrideKey, "authenticated");
        window.localStorage.setItem(
          pendingActionKey,
          JSON.stringify({
            type: "save",
            recipeId,
            redirectTo: `/recipe/${recipeId}`,
            createdAt: Date.now(),
          }),
        );
      },
      {
        authOverrideKey: E2E_AUTH_OVERRIDE_KEY,
        pendingActionKey: PENDING_ACTION_KEY,
        recipeId: RECIPE_ID,
      },
    );

    await page.goto(RECIPE_PATH);

    const modal = page.getByRole("dialog");
    await expect(
      modal.getByRole("heading", { name: "저장할 레시피북을 선택하세요" }),
    ).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(
          (pendingActionKey) => window.localStorage.getItem(pendingActionKey),
          PENDING_ACTION_KEY,
        ),
      )
      .toBeNull();
  });

  test("small iOS viewport keeps title and save CTA above the fold", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-ios-small");

    await mockRecipeSaveRoutes(page);
    await page.goto(RECIPE_PATH);
    await expect(
      page.getByRole("heading", { name: "집밥 김치찌개" }),
    ).toBeVisible();

    const metrics = await page.evaluate(() => {
      const title = document.querySelector("section h2");
      const saveButton = document.querySelector('button[aria-label="저장"][aria-pressed]');
      const titleRect = title?.getBoundingClientRect();
      const saveRect = saveButton?.getBoundingClientRect();

      return {
        viewportHeight: window.innerHeight,
        titleTop: titleRect?.top ?? null,
        saveButtonTop: saveRect?.top ?? null,
      };
    });

    expect(metrics.titleTop).not.toBeNull();
    expect(metrics.saveButtonTop).not.toBeNull();
    expect(metrics.titleTop!).toBeLessThan(metrics.viewportHeight);
    expect(metrics.saveButtonTop!).toBeLessThan(metrics.viewportHeight);
  });
});
