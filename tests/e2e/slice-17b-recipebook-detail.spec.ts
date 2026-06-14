import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      value,
      url: E2E_APP_ORIGIN,
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

function makeMockRecipeItems() {
  return [
    {
      recipe_id: "recipe-1",
      title: "된장찌개",
      thumbnail_url: "https://example.com/img1.jpg",
      tags: ["한식", "찌개"],
      view_count: 12,
      total_duration_seconds: 1200,
      total_duration_text: "20분",
      base_servings: 2,
      added_at: "2026-04-30T09:00:00.000Z",
    },
    {
      recipe_id: "recipe-2",
      title: "김치볶음밥",
      thumbnail_url: null,
      tags: ["한식"],
      view_count: 8,
      total_duration_seconds: 900,
      total_duration_text: "15분",
      base_servings: 1,
      added_at: "2026-04-29T09:00:00.000Z",
    },
  ];
}

function makeMockRecipeDetail(
  recipeId: string,
  items: ReturnType<typeof makeMockRecipeItems>,
) {
  const item = items.find((recipe) => recipe.recipe_id === recipeId) ?? items[0];

  return {
    ...item,
    ingredients: [
      {
        id: `${recipeId}-ingredient-1`,
        ingredient_id: "ingredient-1",
        standard_name: "두부",
        amount: 1,
        unit: "모",
        ingredient_type: "QUANT",
        display_text: "두부 1모",
        scalable: true,
        sort_order: 0,
      },
    ],
    steps: [
      {
        id: `${recipeId}-step-1`,
        step_number: 1,
        instruction: "재료를 손질해요.",
        cooking_method: null,
        ingredients_used: [],
        heat_level: null,
        duration_seconds: null,
        duration_text: null,
      },
    ],
  };
}

function getDetailRecipeId(url: URL) {
  const match = url.pathname.match(
    /^\/api\/v1\/recipe-books\/[^/]+\/recipes\/([^/]+)$/,
  );

  return match ? decodeURIComponent(match[1]) : null;
}

async function installDetailRoutes(
  page: Page,
  options?: {
    items?: ReturnType<typeof makeMockRecipeItems>;
  },
) {
  const items = options?.items ?? makeMockRecipeItems();

  // Handle both GET /recipe-books/{book_id}/recipes
  // and DELETE /recipe-books/{book_id}/recipes/{recipe_id}
  await page.route("**/api/v1/recipe-books/*/recipes**", async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    const parsedUrl = new URL(url);
    const detailRecipeId = getDetailRecipeId(parsedUrl);

    if (method === "GET" && detailRecipeId) {
      await route.fulfill({
        json: {
          success: true,
          data: makeMockRecipeDetail(detailRecipeId, items),
          error: null,
        },
      });
      return;
    }

    if (method === "GET") {
      await route.fulfill({
        json: {
          success: true,
          data: {
            items: [...items],
            next_cursor: null,
            has_next: false,
          },
          error: null,
        },
      });
      return;
    }

    if (method === "DELETE") {
      const urlParts = url.split("/");
      const recipeId = urlParts[urlParts.length - 1];
      const idx = items.findIndex((item) => item.recipe_id === recipeId);
      if (idx >= 0) {
        items.splice(idx, 1);
      }

      await route.fulfill({
        json: {
          success: true,
          data: { deleted: true },
          error: null,
        },
      });
      return;
    }

    await route.continue();
  });
}

async function installBookActionRoutes(page: Page) {
  await page.route(
    (url) => /^\/api\/v1\/recipe-books\/[^/]+$/.test(url.pathname),
    async (route) => {
      const bookId = route.request().url().split("/").pop() ?? "book-custom";

      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON() as { name: string };
        await route.fulfill({
          json: {
            success: true,
            data: {
              id: bookId,
              name: body.name,
              book_type: "custom",
              recipe_count: 2,
              sort_order: 3,
              created_at: "2026-04-30T00:00:00.000Z",
              updated_at: "2026-04-30T01:00:00.000Z",
            },
            error: null,
          },
        });
        return;
      }

      if (route.request().method() === "DELETE") {
        await route.fulfill({
          json: {
            success: true,
            data: { deleted: true },
            error: null,
          },
        });
        return;
      }

      await route.continue();
    },
  );
}

const BOOK_ID = "book-saved";

function detailUrl(bookType: string, bookName: string) {
  return detailUrlForBook(BOOK_ID, bookType, bookName);
}

function detailUrlForBook(bookId: string, bookType: string, bookName: string) {
  const params = new URLSearchParams({ type: bookType, name: bookName });
  return `/mypage/recipe-books/${bookId}?${params.toString()}`;
}

function visibleText(page: Page, text: string) {
  return page.getByText(text).filter({ visible: true }).first();
}

function recipeItem(page: Page, recipeId: string) {
  return page.getByTestId(`recipe-item-${recipeId}`);
}

function isDesktopViewport(page: Page) {
  return (page.viewportSize()?.width ?? 0) >= 1024;
}

test.describe("RECIPEBOOK_DETAIL screen", () => {
  test("shows error when recipebook does not exist", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await page.route("**/api/v1/recipe-books/*/recipes**", async (route) => {
      await route.fulfill({
        status: 404,
        json: {
          success: false,
          data: null,
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "레시피북을 찾을 수 없어요.",
            fields: [],
          },
        },
      });
    });

    await page.goto(detailUrl("saved", "없는 레시피북"));

    await expect(page.getByText("레시피북을 찾을 수 없어요.")).toBeVisible();
    await expect(page.getByText("아직 이 레시피북에 레시피가 없어요")).not.toBeVisible();
  });

  test("shows recipe list for saved book with remove buttons", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(
      page.getByTestId("recipebook-detail-header"),
    ).toBeVisible();
    await expect(visibleText(page, "저장한 레시피")).toBeVisible();

    await expect(recipeItem(page, "recipe-1")).toBeVisible();
    await expect(page.getByLabel("된장찌개 제거")).toBeVisible();

    if (isDesktopViewport(page)) {
      await expect(page.getByTestId("recipebook-open-book")).toBeVisible();
      await expect(page.getByTestId("recipebook-detail-toc")).toBeVisible();
      await expect(
        page.getByTestId("recipebook-detail-toc").getByRole("button", {
          name: /김치볶음밥/,
        }),
      ).toBeVisible();

      // Book mode shows one page at a time; list mode exposes all cards.
      await page.getByRole("button", { name: "목록" }).click();
      await expect(recipeItem(page, "recipe-2")).toBeVisible();
    } else {
      await page
        .getByRole("navigation", { name: /목차/ })
        .getByRole("button", { name: /김치볶음밥/ })
        .click();
      await expect(recipeItem(page, "recipe-2")).toBeVisible();
    }

    await expect(page.getByLabel("김치볶음밥 제거")).toBeVisible();
    await expect(page.getByLabel("저장한 레시피 옵션 메뉴")).toHaveCount(0);
  });

  test("renames a custom book from the book-level menu", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await installBookActionRoutes(page);
    await page.goto(detailUrlForBook("book-custom", "custom", "주말 파티"));

    await expect(recipeItem(page, "recipe-1")).toBeVisible();
    await page.getByLabel("주말 파티 옵션 메뉴").click();
    await page.getByRole("menuitem", { name: "이름 변경" }).click();

    const input = page.getByRole("textbox");
    await input.fill("주말 모임");
    await page.getByRole("button", { name: "완료" }).click();

    await expect(page.getByText("레시피북 이름을 변경했어요")).toBeVisible();
    await expect(visibleText(page, "주말 모임")).toBeVisible();
  });

  test("deletes a custom book from the book-level menu", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await installBookActionRoutes(page);
    await page.goto(detailUrlForBook("book-custom", "custom", "주말 파티"));

    await expect(recipeItem(page, "recipe-1")).toBeVisible();
    await page.getByLabel("주말 파티 옵션 메뉴").click();
    await page.getByRole("menuitem", { name: "삭제" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "삭제" }).click();

    await page.waitForURL("/mypage");
  });

  test("shows 좋아요 해제 label for liked books", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("liked", "좋아요한 레시피"));

    await expect(recipeItem(page, "recipe-1")).toBeVisible();
    await expect(page.getByLabel("된장찌개 좋아요 해제")).toBeVisible();
  });

  test("hides remove button for my_added books", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("my_added", "내가 추가한 레시피"));

    await expect(recipeItem(page, "recipe-1")).toBeVisible();

    // No remove button at all
    const removeButtons = page.getByRole("button", {
      name: /제거|좋아요 해제/,
    });
    await expect(removeButtons).toHaveCount(0);
  });

  test("loads next page without duplicate recipe cards", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await page.route("**/api/v1/recipe-books/*/recipes**", async (route) => {
      const url = new URL(route.request().url());
      const detailRecipeId = getDetailRecipeId(url);

      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      if (detailRecipeId) {
        const allItems = [
          ...makeMockRecipeItems(),
          {
            recipe_id: "recipe-3",
            title: "비빔국수",
            thumbnail_url: null,
            tags: ["면"],
            view_count: 4,
            total_duration_seconds: 600,
            total_duration_text: "10분",
            base_servings: 1,
            added_at: "2026-04-28T09:00:00.000Z",
          },
        ];
        await route.fulfill({
          json: {
            success: true,
            data: makeMockRecipeDetail(detailRecipeId, allItems),
            error: null,
          },
        });
        return;
      }

      const hasCursor = url.searchParams.has("cursor");
      await route.fulfill({
        json: {
          success: true,
          data: hasCursor
            ? {
                items: [
                  {
                    recipe_id: "recipe-2",
                    title: "김치볶음밥",
                    thumbnail_url: null,
                    tags: ["한식"],
                    view_count: 8,
                    total_duration_seconds: 900,
                    total_duration_text: "15분",
                    base_servings: 1,
                    added_at: "2026-04-29T09:00:00.000Z",
                  },
                  {
                    recipe_id: "recipe-3",
                    title: "비빔국수",
                    thumbnail_url: null,
                    tags: ["면"],
                    view_count: 4,
                    total_duration_seconds: 600,
                    total_duration_text: "10분",
                    base_servings: 1,
                    added_at: "2026-04-28T09:00:00.000Z",
                  },
                ],
                next_cursor: null,
                has_next: false,
              }
            : {
                items: makeMockRecipeItems(),
                next_cursor: "cursor-1",
                has_next: true,
              },
          error: null,
        },
      });
    });

    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(recipeItem(page, "recipe-1")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    if (isDesktopViewport(page)) {
      await page.getByRole("button", { name: "목록" }).click();
    }

    if (isDesktopViewport(page)) {
      await expect(recipeItem(page, "recipe-3")).toBeVisible();
      await expect(recipeItem(page, "recipe-2")).toHaveCount(1);
    } else {
      const mobileToc = page.getByRole("navigation", { name: /목차/ });
      await expect(
        mobileToc.getByRole("button", { name: /비빔국수/ }),
      ).toBeVisible();
      await expect(
        mobileToc.getByRole("button", { name: /김치볶음밥/ }),
      ).toHaveCount(1);
      await mobileToc.getByRole("button", { name: /비빔국수/ }).click();
      await expect(recipeItem(page, "recipe-3")).toBeVisible();
    }
  });

  test("removes item from saved book with optimistic UI", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(recipeItem(page, "recipe-1")).toBeVisible();
    await page.getByLabel("된장찌개 제거").click();
    const dialog = page.getByRole("alertdialog", { name: "레시피를 제거할까요?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "제거", exact: true }).click();

    // Optimistic: item gone
    await expect(recipeItem(page, "recipe-1")).toHaveCount(0);
    // Toast shows
    await expect(page.getByText("레시피를 제거했어요")).toBeVisible();
    // Other item still there
    await expect(recipeItem(page, "recipe-2")).toBeVisible();
  });

  test("restores optimistic UI and shows error when remove fails", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await page.route("**/api/v1/recipe-books/*/recipes**", async (route) => {
      const url = new URL(route.request().url());
      const detailRecipeId = getDetailRecipeId(url);

      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 500,
          json: {
            success: false,
            data: null,
            error: {
              code: "INTERNAL_ERROR",
              message: "제거에 실패했어요.",
              fields: [],
            },
          },
        });
        return;
      }

      if (route.request().method() === "GET" && detailRecipeId) {
        await route.fulfill({
          json: {
            success: true,
            data: makeMockRecipeDetail(detailRecipeId, makeMockRecipeItems()),
            error: null,
          },
        });
        return;
      }

      await route.fulfill({
        json: {
          success: true,
          data: {
            items: makeMockRecipeItems(),
            next_cursor: null,
            has_next: false,
          },
          error: null,
        },
      });
    });

    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(recipeItem(page, "recipe-1")).toBeVisible();
    await page.getByLabel("된장찌개 제거").click();
    const dialog = page.getByRole("alertdialog", { name: "레시피를 제거할까요?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "제거", exact: true }).click();

    await expect(page.getByText("제거에 실패했어요.")).toBeVisible();
    if (!isDesktopViewport(page)) {
      await page
        .getByRole("navigation", { name: /목차/ })
        .getByRole("button", { name: /된장찌개/ })
        .click();
    }
    await expect(recipeItem(page, "recipe-1")).toBeVisible();
  });

  test("shows empty state after removing all items", async ({ page }) => {
    const singleItem = [makeMockRecipeItems()[0]];
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page, { items: singleItem });
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(recipeItem(page, "recipe-1")).toBeVisible();
    await page.getByLabel("된장찌개 제거").click();
    const dialog = page.getByRole("alertdialog", { name: "레시피를 제거할까요?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "제거", exact: true }).click();

    await expect(
      page.getByText("아직 이 레시피북에 레시피가 없어요"),
    ).toBeVisible();
  });

  test("shows empty state when book has no items", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page, { items: [] });
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(
      page.getByText("아직 이 레시피북에 레시피가 없어요"),
    ).toBeVisible();
  });

  test("recipe card shows reader actions", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(recipeItem(page, "recipe-1")).toBeVisible();

    const plannerAction = isDesktopViewport(page)
      ? page.getByRole("button", { name: "플래너에 추가" }).first()
      : page
          .getByTestId("recipe-item-recipe-1")
          .getByRole("button", { name: "플래너에 추가" });
    await expect(plannerAction).toBeVisible();
    await expect(page.getByRole("link", { name: "요리하기" }).first()).toBeVisible();
  });

  test("back button links to mypage", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(visibleText(page, "저장한 레시피")).toBeVisible();

    if (isDesktopViewport(page)) {
      await expect(page.getByRole("heading", { name: "레시피북 리더" })).toBeVisible();
      await expect(page.getByLabel("뒤로 가기")).toHaveCount(0);
      return;
    }

    const backLink = page.getByLabel("뒤로 가기");
    await expect(backLink).toHaveAttribute("href", "/mypage");
  });

  test("shows login gate for unauthenticated users", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(
      page.getByText("이 화면은 로그인이 필요해요"),
    ).toBeVisible();
    await expect(page.getByText("마이페이지로 돌아가기")).toBeVisible();
  });
});
