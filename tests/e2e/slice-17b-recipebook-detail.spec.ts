import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
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
      added_at: "2026-04-30T09:00:00.000Z",
    },
    {
      recipe_id: "recipe-2",
      title: "김치볶음밥",
      thumbnail_url: null,
      tags: ["한식"],
      added_at: "2026-04-29T09:00:00.000Z",
    },
  ];
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

const BOOK_ID = "book-saved";

function detailUrl(bookType: string, bookName: string) {
  const params = new URLSearchParams({ type: bookType, name: bookName });
  return `/mypage/recipe-books/${BOOK_ID}?${params.toString()}`;
}

test.describe("RECIPEBOOK_DETAIL screen", () => {
  test("shows recipe list for saved book with remove buttons", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(
      page.getByTestId("recipebook-detail-header"),
    ).toBeVisible();
    await expect(page.getByText("저장한 레시피")).toBeVisible();

    await expect(page.getByText("된장찌개")).toBeVisible();
    await expect(page.getByText("김치볶음밥")).toBeVisible();

    // Remove buttons visible for saved type
    await expect(page.getByLabel("된장찌개 제거")).toBeVisible();
    await expect(page.getByLabel("김치볶음밥 제거")).toBeVisible();
  });

  test("shows 좋아요 해제 label for liked books", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("liked", "좋아요한 레시피"));

    await expect(page.getByText("된장찌개")).toBeVisible();
    await expect(page.getByLabel("된장찌개 좋아요 해제")).toBeVisible();
  });

  test("hides remove button for my_added books", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("my_added", "내가 추가한 레시피"));

    await expect(page.getByText("된장찌개")).toBeVisible();

    // No remove button at all
    const removeButtons = page.getByRole("button", {
      name: /제거|좋아요 해제/,
    });
    await expect(removeButtons).toHaveCount(0);
  });

  test("removes item from saved book with optimistic UI", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(page.getByText("된장찌개")).toBeVisible();
    await page.getByLabel("된장찌개 제거").click();

    // Optimistic: item gone
    await expect(page.getByText("된장찌개")).not.toBeVisible();
    // Toast shows
    await expect(page.getByText("레시피를 제거했어요")).toBeVisible();
    // Other item still there
    await expect(page.getByText("김치볶음밥")).toBeVisible();
  });

  test("shows empty state after removing all items", async ({ page }) => {
    const singleItem = [makeMockRecipeItems()[0]];
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page, { items: singleItem });
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(page.getByText("된장찌개")).toBeVisible();
    await page.getByLabel("된장찌개 제거").click();

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

  test("recipe card navigates to RECIPE_DETAIL", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(page.getByText("된장찌개")).toBeVisible();

    const recipeCard = page.getByTestId("recipe-item-recipe-1");
    const link = recipeCard.locator("a[href='/recipe/recipe-1']");
    await expect(link).toBeVisible();
  });

  test("back button links to mypage", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installDetailRoutes(page);
    await page.goto(detailUrl("saved", "저장한 레시피"));

    await expect(page.getByText("저장한 레시피")).toBeVisible();

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
