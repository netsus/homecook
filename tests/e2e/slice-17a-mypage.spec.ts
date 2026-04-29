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

function makeMockProfile() {
  return {
    id: "user-1",
    nickname: "집밥러",
    email: "user@example.com",
    profile_image_url: null,
    social_provider: "kakao",
    settings: { screen_wake_lock: false },
  };
}

function makeMockBooks() {
  return [
    { id: "book-my", name: "내가 추가한 레시피", book_type: "my_added", recipe_count: 3, sort_order: 0 },
    { id: "book-saved", name: "저장한 레시피", book_type: "saved", recipe_count: 5, sort_order: 1 },
    { id: "book-liked", name: "좋아요한 레시피", book_type: "liked", recipe_count: 10, sort_order: 2 },
    { id: "book-custom", name: "주말 파티", book_type: "custom", recipe_count: 2, sort_order: 3 },
  ];
}

function makeMockShoppingHistory() {
  return [
    {
      id: "list-1",
      title: "4/30 장보기",
      date_range_start: "2026-04-30",
      date_range_end: "2026-05-06",
      is_completed: true,
      item_count: 12,
      created_at: "2026-04-30T00:00:00Z",
    },
    {
      id: "list-2",
      title: "4/23 장보기",
      date_range_start: "2026-04-23",
      date_range_end: "2026-04-29",
      is_completed: false,
      item_count: 8,
      created_at: "2026-04-23T00:00:00Z",
    },
  ];
}

async function installMypageRoutes(
  page: Page,
  options?: {
    books?: ReturnType<typeof makeMockBooks>;
    shoppingHistory?: ReturnType<typeof makeMockShoppingHistory>;
    profile?: ReturnType<typeof makeMockProfile>;
  },
) {
  const books = options?.books ?? makeMockBooks();
  const shoppingHistory = options?.shoppingHistory ?? makeMockShoppingHistory();
  const profile = options?.profile ?? makeMockProfile();

  await page.route("**/api/v1/users/me", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: profile,
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipe-books", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const nextSortOrder = Math.max(...books.map((b) => b.sort_order)) + 1;
      const newBook = {
        id: `book-new-${Date.now()}`,
        name: body.name,
        book_type: "custom",
        recipe_count: 0,
        sort_order: nextSortOrder,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      books.push(newBook);

      await route.fulfill({
        status: 201,
        json: {
          success: true,
          data: newBook,
          error: null,
        },
      });
    } else {
      await route.fulfill({
        json: {
          success: true,
          data: { books: [...books] },
          error: null,
        },
      });
    }
  });

  await page.route("**/api/v1/recipe-books/*", async (route) => {
    const urlParts = route.request().url().split("/");
    const bookId = urlParts[urlParts.length - 1];

    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      const book = books.find((b) => b.id === bookId);
      if (book) {
        book.name = body.name;
      }
      await route.fulfill({
        json: {
          success: true,
          data: {
            ...book,
            updated_at: new Date().toISOString(),
          },
          error: null,
        },
      });
    } else if (route.request().method() === "DELETE") {
      const idx = books.findIndex((b) => b.id === bookId);
      if (idx >= 0) {
        books.splice(idx, 1);
      }
      await route.fulfill({
        json: {
          success: true,
          data: { deleted: true },
          error: null,
        },
      });
    } else {
      await route.continue();
    }
  });

  await page.route("**/api/v1/shopping/lists**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: shoppingHistory,
          next_cursor: null,
          has_next: false,
        },
        error: null,
      },
    });
  });
}

test.describe("MYPAGE screen", () => {
  test("shows profile and recipe books when authenticated", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await page.goto("/mypage");

    await expect(page.getByTestId("mypage-profile")).toBeVisible();
    await expect(page.getByText("집밥러")).toBeVisible();
    await expect(page.getByText("카카오 로그인")).toBeVisible();

    await expect(page.getByText("내가 추가한 레시피")).toBeVisible();
    await expect(page.getByText("저장한 레시피")).toBeVisible();
    await expect(page.getByText("좋아요한 레시피")).toBeVisible();
    await expect(page.getByText("주말 파티")).toBeVisible();
  });

  test("shows login gate for unauthenticated users", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await page.goto("/mypage");

    await expect(page.getByText("이 화면은 로그인이 필요해요")).toBeVisible();
    await expect(page.getByText("홈으로 돌아가기")).toBeVisible();
  });

  test("switches to shopping history tab and shows records", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await page.goto("/mypage");

    await expect(page.getByText("집밥러")).toBeVisible();
    await page.getByRole("tab", { name: "장보기 기록" }).click();

    await expect(page.getByText("4/30 장보기")).toBeVisible();
    await expect(page.getByText("4/23 장보기")).toBeVisible();
    await expect(page.getByText("완료")).toBeVisible();
    await expect(page.getByText("진행 중")).toBeVisible();
  });

  test("navigates to shopping detail when clicking a shopping history item", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await page.goto("/mypage");

    await expect(page.getByText("집밥러")).toBeVisible();
    await page.getByRole("tab", { name: "장보기 기록" }).click();

    const card = page.getByTestId("shopping-card-list-1");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("href", "/shopping/lists/list-1");
  });

  test("shows empty shopping history state with planner link", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page, { shoppingHistory: [] });
    await page.goto("/mypage");

    await expect(page.getByText("집밥러")).toBeVisible();
    await page.getByRole("tab", { name: "장보기 기록" }).click();

    await expect(page.getByText("저장된 장보기 기록이 없어요")).toBeVisible();
    await expect(page.getByText("플래너로 이동")).toBeVisible();
  });

  test("creates a new custom recipe book", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await page.goto("/mypage");

    await expect(page.getByText("집밥러")).toBeVisible();
    await page.getByLabel("새 레시피북 만들기").click();
    await page.getByPlaceholder("레시피북 이름").fill("주말 브런치");
    await page.getByRole("button", { name: /완료/ }).click();

    await expect(page.getByText("레시피북을 만들었어요")).toBeVisible();
  });

  test("renames a custom recipe book via context menu", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await page.goto("/mypage");

    await expect(page.getByText("주말 파티")).toBeVisible();
    await page.getByLabel("주말 파티 옵션 메뉴").click();
    await page.getByRole("menuitem", { name: "이름 변경" }).click();

    const input = page.getByRole("textbox");
    await expect(input).toHaveValue("주말 파티");
    await input.fill("저녁 모임");
    await page.getByRole("button", { name: "완료" }).click();

    await expect(page.getByText("이름을 변경했어요")).toBeVisible();
  });

  test("deletes a custom recipe book via context menu", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await page.goto("/mypage");

    await expect(page.getByText("주말 파티")).toBeVisible();
    await page.getByLabel("주말 파티 옵션 메뉴").click();
    await page.getByRole("menuitem", { name: "삭제" }).click();

    await expect(page.getByTestId("delete-confirm-dialog")).toBeVisible();
    await expect(page.getByText("레시피북을 삭제할까요?")).toBeVisible();

    await page.getByRole("button", { name: "삭제" }).click();

    await expect(page.getByText("삭제했어요")).toBeVisible();
  });

  test("profile fallback shows initial when no image", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await page.goto("/mypage");

    const avatar = page.getByTestId("profile-fallback-avatar");
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveText("집");
  });

  test("tab bar has correct ARIA roles", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await page.goto("/mypage");

    await expect(page.getByText("집밥러")).toBeVisible();
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.getByRole("tab", { name: "레시피북" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "장보기 기록" })).toHaveAttribute("aria-selected", "false");
  });
});
