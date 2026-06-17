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

async function gotoMypageReady(page: Page) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/mypage", { waitUntil: "networkidle" });

    try {
      await expect(
        page.locator("main").getByText("집밥러").first(),
      ).toBeVisible({ timeout: 15_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
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

function makeMockProgress() {
  return {
    level: {
      current_level: 6,
      total_xp: 520,
      current_level_start_xp: 500,
      next_level_start_xp: 650,
      xp_into_current_level: 20,
      xp_to_next_level: 130,
      progress_ratio: 0.1333,
      progress_percent: 13,
    },
    event_counts: {
      cooking_completed: 3,
      shopping_completed: 2,
      recipe_saved_distinct_ever: 7,
      custom_book_created: 1,
    },
    last_updated_at: "2026-06-10T00:00:00.000Z",
  };
}

function makeMockGamification() {
  return {
    level: {
      current_level: 6,
      total_xp: 520,
      xp_to_next_level: 130,
      progress_percent: 13,
    },
    featured_badges: [
      {
        badge_key: "first_cook_done",
        label: "첫 집밥 완성",
        description: "첫 요리 완료를 기록했어요.",
        earned_at: "2026-06-10T00:00:00.000Z",
        is_new: false,
      },
    ],
    badges: { earned: [], locked: [] },
    quests: {
      active: [
        {
          quest_key: "cook_three_meals",
          quest_type: "standard",
          status: "active",
          title: "요리 루틴 3번 완성",
          description: "요리 완료를 3번 기록해 보세요.",
          progress_current: 1,
          progress_target: 3,
          progress_percent: 33,
          completed_at: null,
          dismissed_at: null,
          is_new: false,
        },
      ],
      completed_recent: [],
    },
    tutorial: { active_steps: [] },
    notifications: { unseen: [] },
    last_updated_at: "2026-06-10T00:00:00.000Z",
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
      completed_at: "2026-04-30T10:00:00Z",
      item_count: 12,
      created_at: "2026-04-30T00:00:00Z",
    },
    {
      id: "list-2",
      title: "4/23 장보기",
      date_range_start: "2026-04-23",
      date_range_end: "2026-04-29",
      is_completed: false,
      completed_at: null,
      item_count: 8,
      created_at: "2026-04-23T00:00:00Z",
    },
    {
      id: "list-3",
      title: "3/18 장보기",
      date_range_start: "2026-03-18",
      date_range_end: "2026-03-24",
      is_completed: true,
      completed_at: "2026-03-18T10:00:00Z",
      item_count: 10,
      created_at: "2026-03-18T00:00:00Z",
    },
  ];
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
  recipeItems: ReturnType<typeof makeMockRecipeItems>,
) {
  const item = recipeItems.find((recipe) => recipe.recipe_id === recipeId) ?? recipeItems[0];

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

function makeMockShoppingDetail() {
  return {
    id: "list-1",
    title: "4/30 장보기",
    date_range_start: "2026-04-30",
    date_range_end: "2026-05-06",
    is_completed: true,
    completed_at: "2026-04-30T10:00:00.000Z",
    created_at: "2026-04-30T00:00:00.000Z",
    updated_at: "2026-04-30T10:00:00.000Z",
    recipes: [
      {
        recipe_id: "recipe-1",
        recipe_name: "된장찌개",
        recipe_thumbnail: null,
        shopping_servings: 2,
        planned_servings_total: 2,
      },
    ],
    items: [
      {
        id: "item-1",
        ingredient_id: "ing-1",
        display_text: "두부 1모",
        amounts_json: [{ amount: 1, unit: "모" }],
        is_checked: true,
        is_pantry_excluded: false,
        added_to_pantry: false,
        sort_order: 0,
      },
    ],
  };
}

async function installMypageRoutes(
  page: Page,
  options?: {
    books?: ReturnType<typeof makeMockBooks>;
    shoppingHistory?: ReturnType<typeof makeMockShoppingHistory>;
    profile?: ReturnType<typeof makeMockProfile>;
    progress?: ReturnType<typeof makeMockProgress>;
    progressError?: boolean;
    gamification?: ReturnType<typeof makeMockGamification>;
    recipeItems?: ReturnType<typeof makeMockRecipeItems>;
    shoppingDetail?: ReturnType<typeof makeMockShoppingDetail>;
  },
) {
  const books = options?.books ?? makeMockBooks();
  const shoppingHistory = options?.shoppingHistory ?? makeMockShoppingHistory();
  const profile = options?.profile ?? makeMockProfile();
  const progress = options?.progress ?? makeMockProgress();
  const gamification = options?.gamification ?? makeMockGamification();
  const recipeItems = options?.recipeItems ?? makeMockRecipeItems();
  const shoppingDetail = options?.shoppingDetail ?? makeMockShoppingDetail();

  await page.route("**/api/v1/users/me/progress", async (route) => {
    if (options?.progressError) {
      await route.fulfill({
        status: 500,
        json: {
          success: false,
          data: null,
          error: {
            code: "INTERNAL_ERROR",
            message: "진도 정보를 불러오지 못했어요.",
            fields: [],
          },
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: progress,
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me/gamification", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: gamification,
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me/gamification/notifications/seen", async (route) => {
    await route.fulfill({
      json: { success: true, data: { seen_notification_ids: [] }, error: null },
    });
  });

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

  await page.route("**/api/v1/recipe-books/*/recipes**", async (route) => {
    const url = new URL(route.request().url());
    const detailMatch = url.pathname.match(
      /^\/api\/v1\/recipe-books\/[^/]+\/recipes\/([^/]+)$/,
    );

    if (route.request().method() === "GET" && detailMatch) {
      await route.fulfill({
        json: {
          success: true,
          data: makeMockRecipeDetail(decodeURIComponent(detailMatch[1]), recipeItems),
          error: null,
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [...recipeItems],
          next_cursor: null,
          has_next: false,
        },
        error: null,
      },
    });
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
    const url = new URL(route.request().url());
    if (/\/api\/v1\/shopping\/lists\/[^/]+$/.test(url.pathname)) {
      await route.fulfill({
        json: {
          success: true,
          data: shoppingDetail,
          error: null,
        },
      });
      return;
    }

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

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1024) < 1024;
}

async function openRecipebookSurface(page: Page) {
  if (isMobileViewport(page)) {
    await page.getByRole("button", { name: /레시피북/ }).click();
    await expect(
      page.getByRole("heading", { name: "레시피북", exact: true }),
    ).toBeVisible();
    return;
  }

  await page.getByRole("tab", { name: "레시피북" }).click();
  await expect(
    page.getByRole("heading", { name: "레시피북", exact: true }),
  ).toBeVisible();
}

async function openShoppingSurface(page: Page) {
  if (isMobileViewport(page)) {
    await page.getByRole("button", { name: /장보기 기록/ }).click();
    await expect(page.getByRole("heading", { name: "장보기 기록" })).toBeVisible();
    return;
  }

  await page.getByRole("tab", { name: "장보기 기록" }).click();
  await expect(
    page.locator('[data-testid="shopping-tab"], [data-testid="shopping-empty"]'),
  ).toBeVisible();
}

test.describe("MYPAGE screen", () => {
  test("shows profile and recipe books when authenticated @smoke-core", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await gotoMypageReady(page);

    await expect(page.getByTestId("mypage-profile")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("main")).toContainText("집밥러", { timeout: 15000 });
    await expect(page.getByTestId("mypage-growth-profile")).toBeVisible();
    await expect(page.getByText("Lv.6")).toBeVisible();
    await expect(page.getByText("다음 레벨까지 130 XP")).toBeVisible();
    await expect(page.getByText("집밥 러너 · 레벨 5")).toHaveCount(0);
    if (isMobileViewport(page)) {
      await expect(page.getByText("Lv.6")).toBeVisible();
      await expect(page.getByText("다음 레벨까지 130 XP")).toBeVisible();
      await expect(page.getByRole("progressbar", {
        name: "Lv.6, 다음 레벨까지 130 XP, 진행률 13%",
      })).toBeVisible();
    } else {
      await expect(page.getByTestId("mypage-profile-edit-button")).toBeVisible();
    }
    await expect(page.getByLabel("설정", { exact: true })).toHaveCount(0);

    await expect(page.getByRole("tab", { name: "계정 관리" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "알림 설정" })).toHaveCount(0);

    await page.getByTestId("mypage-profile-edit-button").click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "닉네임 변경" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "취소" }).click();

    await openRecipebookSurface(page);
    await expect(page.getByText("내가 추가한 레시피")).toBeVisible();
    await expect(page.getByTestId("system-book-saved").getByText("저장한 레시피")).toBeVisible();
    await expect(page.getByText("좋아요한 레시피")).toBeVisible();
    await expect(page.getByText("주말 파티")).toBeVisible();
  });

  test("keeps MYPAGE usable when the progress endpoint fails", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page, { progressError: true });
    await gotoMypageReady(page);

    await expect(page.getByTestId("mypage-profile")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("main").getByText("집밥러").first()).toBeVisible();
    await expect(page.getByTestId("mypage-growth-progress-error")).toContainText(
      "XP를 잠시 불러오지 못했어요",
    );
    await expect(
      page.getByRole("heading", { name: "데이터를 불러오지 못했어요" }),
    ).toHaveCount(0);
    if (isMobileViewport(page)) {
      await expect(page.getByRole("button", { name: /레시피북/ })).toBeVisible();
    } else {
      await expect(page.getByRole("tab", { name: "레시피북" })).toBeVisible();
    }
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
    await gotoMypageReady(page);

    await expect(page.getByText("집밥러")).toBeVisible();
    await openShoppingSurface(page);

    await expect(
      page.getByRole("heading", { name: "4월 30일 만든 장보기" }),
    ).toBeVisible();
    await expect(page.getByText("다시열기")).toHaveCount(0);
    await expect(page.getByText("완료 4/30")).toBeVisible();
    const calendar = page.getByTestId("shopping-history-calendar");
    await expect(calendar.getByText("장보기 달력")).toBeVisible();
    await expect(calendar.getByText("2026년 3월")).toHaveCount(0);
    await expect(
      calendar.getByRole("button", {
        name: "4월 30일 만든 장보기 1개, 완료 1개",
      }),
    ).toBeVisible();
    await calendar.getByRole("button", { name: "이전 달" }).click();
    await expect(calendar.getByText("2026년 3월")).toBeVisible();
    await expect(calendar.getByText("2026년 4월")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "3월 18일 만든 장보기" }),
    ).toBeVisible();
    await calendar.getByRole("button", { name: "다음 달" }).click();
    await expect(calendar.getByText("2026년 4월")).toBeVisible();
    await calendar
      .getByRole("button", {
        name: "4월 23일 만든 장보기 1개, 진행 중 1개",
      })
      .click();

    await expect(
      page.getByRole("heading", { name: "4월 23일 만든 장보기" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("shopping-card-list-2").getByText("진행 중"),
    ).toBeVisible();
  });

  test("navigates to shopping detail when clicking a shopping history item", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await gotoMypageReady(page);

    await expect(page.getByText("집밥러")).toBeVisible();
    await openShoppingSurface(page);

    const card = page.getByTestId("shopping-card-list-1");
    await expect(card).toBeVisible();

    if (!isMobileViewport(page)) {
      await card.click();
      await expect(page.getByTestId("shopping-detail-embedded")).toBeVisible();
      await expect(
        page.getByText("완료된 장보기 기록은 수정할 수 없어요"),
      ).toBeVisible();
      return;
    }

    const href = await card.getAttribute("href");
    expect(href).toContain("/shopping/lists/list-1");
    expect(href).toContain("returnTo=");
    expect(href).toContain("returnSurface=mypage.shopping-history");
    expect(href).toContain("restore=shopping-history-tab");
  });

  test("opens recipebook detail in the correct mypage context", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await gotoMypageReady(page);

    await openRecipebookSurface(page);
    await page.getByTestId("system-book-saved").filter({ visible: true }).first().click();

    if (!isMobileViewport(page)) {
      await expect(page).toHaveURL(/\/mypage/);
      await expect(page.getByTestId("recipebook-inline-detail")).toBeVisible();
      await expect(page.getByTestId("recipebook-detail-header")).toBeVisible();
      await expect(page.getByRole("heading", { name: "저장한 레시피" })).toBeVisible();
      return;
    }

    await page.waitForURL(/\/mypage\/recipe-books\/book-saved/);
    await expect(page.getByTestId("recipebook-detail-header")).toBeVisible();
    await page
      .locator('[aria-label="뒤로 가기"]:visible')
      .first()
      .click();
    await page.waitForURL(/\/mypage\?.*restore=recipebook-tab/);

    await expect(page.getByRole("heading", { name: "레시피북" })).toBeVisible();
    await expect(page.getByTestId("system-book-saved").getByText("저장한 레시피")).toBeVisible();
    await expect(page.getByRole("heading", { name: "저장한 레시피" })).toHaveCount(0);
  });

  test("returns directly from shopping detail to the shopping history context", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await gotoMypageReady(page);

    await openShoppingSurface(page);
    await page.getByTestId("shopping-card-list-1").click();
    if (isMobileViewport(page)) {
      await page.waitForURL(/\/shopping\/lists\/list-1/);
    } else {
      await expect(page.getByTestId("shopping-detail-embedded")).toBeVisible();
    }
    await expect(
      page.getByText("완료된 장보기 기록은 수정할 수 없어요"),
    ).toBeVisible();

    if (isMobileViewport(page)) {
      await page
        .getByLabel(/뒤로 가기|이전 화면으로 돌아가기/)
        .first()
        .click();
      await page.waitForURL(/\/mypage\?.*restore=shopping-history-tab/);
    } else {
      await page.getByRole("button", { name: "목록으로" }).first().click();
    }

    await expect(
      page.getByRole("heading", { name: "장보기 기록" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "4월 30일 만든 장보기" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "저장한 레시피" })).toHaveCount(0);
  });

  test("shows empty shopping history state with planner link", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page, { shoppingHistory: [] });
    await gotoMypageReady(page);

    await expect(page.getByText("집밥러")).toBeVisible();
    await openShoppingSurface(page);

    await expect(
      page.getByText(
        isMobileViewport(page)
          ? "아직 장보기 기록이 없어요"
          : "저장된 장보기 기록이 없어요",
      ),
    ).toBeVisible();
    await expect(page.getByText("플래너로 이동")).toBeVisible();
  });

  test("creates a new custom recipe book", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await gotoMypageReady(page);

    await expect(page.getByText("집밥러")).toBeVisible();
    await openRecipebookSurface(page);
    await page.getByLabel("새 레시피북 만들기").click();
    await page.getByPlaceholder("레시피북 이름").fill("주말 브런치");
    await page.getByRole("button", { name: /완료/ }).click();

    await expect(page.getByText("레시피북을 만들었어요")).toBeVisible();
  });

  test("renames a custom recipe book via context menu", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await gotoMypageReady(page);

    await openRecipebookSurface(page);
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
    await gotoMypageReady(page);

    await openRecipebookSurface(page);
    await expect(page.getByText("주말 파티")).toBeVisible();
    await page.getByLabel("주말 파티 옵션 메뉴").click();
    await page.getByRole("menuitem", { name: "삭제" }).click();

    await expect(page.getByTestId("delete-confirm-dialog")).toBeVisible();
    await expect(page.getByText("레시피북을 삭제할까요?")).toBeVisible();

    await page
      .getByTestId("delete-confirm-dialog")
      .getByRole("button", { name: "삭제" })
      .click();

    await expect(page.getByText("삭제했어요")).toBeVisible();
  });

  test("profile fallback shows initial when no image", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await gotoMypageReady(page);

    const avatar = page.getByTestId("profile-fallback-avatar");
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveText("집");
  });

  test("tab bar has correct ARIA roles", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await gotoMypageReady(page);

    if (isMobileViewport(page)) {
      await expect(page.getByTestId("mypage-menu-card")).toBeVisible();
      await expect(page.getByRole("button", { name: /레시피북/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /장보기 기록/ })).toBeVisible();
    } else {
      await expect(page.getByRole("tablist")).toBeVisible();
      await expect(page.getByRole("tab", { name: "저장한 레시피" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tab", { name: "환경설정" })).toHaveAttribute("aria-selected", "false");
    }
  });

  test("no content overlaps bottom nav at scrollY=0", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await setAuthOverride(page, "authenticated");
    await installMypageRoutes(page);
    await gotoMypageReady(page);

    await expect(page.getByText("집밥러")).toBeVisible();

    const geometry = await page.evaluate(() => {
      const nav = document.querySelector("nav.fixed");
      if (!nav) return { navTop: 9999, navBottom: 9999, overlaps: [] };

      const navRect = nav.getBoundingClientRect();
      const candidates = [
        ...document.querySelectorAll('[role="listitem"]'),
        ...document.querySelectorAll('[data-testid="recipebook-tab"] > p'),
        ...document.querySelectorAll('[aria-label="새 레시피북 만들기"]'),
      ];

      const exposedOverlaps = candidates
        .filter((el) => {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          if (!(rect.top < navRect.bottom && rect.bottom > navRect.top)) return false;

          const overlapTop = Math.max(rect.top, navRect.top);
          const overlapBottom = Math.min(rect.bottom, navRect.bottom);
          const sampleX = Math.min(
            Math.max(rect.left + rect.width / 2, navRect.left + 1),
            navRect.right - 1,
          );
          const sampleY = (overlapTop + overlapBottom) / 2;
          const topElement = document.elementFromPoint(sampleX, sampleY);

          return topElement === el || Boolean(topElement && el.contains(topElement));
        })
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            text: el.textContent?.trim().slice(0, 80) ?? "",
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
          };
        });

      return { navTop: navRect.top, navBottom: navRect.bottom, overlaps: exposedOverlaps };
    });

    expect(geometry.overlaps).toEqual([]);
  });
});
