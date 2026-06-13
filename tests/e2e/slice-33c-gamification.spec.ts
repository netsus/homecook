import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/33c-badges-quests-toasts-tutorial",
);

const profile = {
  id: "user-1",
  nickname: "집밥러",
  email: "user@example.com",
  profile_image_url: null,
  social_provider: "kakao",
  settings: { screen_wake_lock: false },
};

const progress = {
  level: {
    current_level: 6,
    total_xp: 830,
    current_level_start_xp: 750,
    next_level_start_xp: 900,
    xp_into_current_level: 80,
    xp_to_next_level: 70,
    progress_ratio: 0.53,
    progress_percent: 53,
  },
  event_counts: {
    cooking_completed: 2,
    shopping_completed: 1,
    recipe_saved_distinct_ever: 4,
    custom_book_created: 1,
  },
  last_updated_at: "2026-06-10T12:00:00.000Z",
};

const gamification = {
  level: {
    current_level: 6,
    total_xp: 830,
    xp_to_next_level: 70,
    progress_percent: 53,
  },
  grade: {
    grade_key: "wood",
    label: "Wood",
    level_min: 4,
    level_max: 7,
    icon_url: "/assets/growth/grades/wood-spoon-badge.png",
    character_url: "/assets/growth/grades/wood-spoon.png",
  },
  featured_badges: [
    {
      badge_key: "first_cook_done",
      label: "첫 집밥 완성",
      description: "첫 요리 완료를 기록했어요.",
      category: "cooking",
      shape_key: "pot",
      locked_hint: null,
      earned_at: "2026-06-10T12:00:00.000Z",
      is_new: true,
    },
    {
      badge_key: "first_shopping_done",
      label: "장보기 첫걸음",
      description: "첫 장보기 완료를 기록했어요.",
      category: "shopping",
      shape_key: "bowl",
      locked_hint: null,
      earned_at: "2026-06-10T12:00:00.000Z",
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
        progress_current: 2,
        progress_target: 3,
        progress_percent: 67,
        completed_at: null,
        dismissed_at: null,
        is_new: false,
      },
    ],
    completed_recent: [],
  },
  tutorial: {
    category_key: "tutorial",
    completed_count: 0,
    total_count: 1,
    active_steps: [
      {
        achievement_key: "tutorial_recipe_saved",
        title: "레시피 5개 저장",
        current: 4,
        target: 5,
        status: "active",
      },
    ],
  },
  achievement_album: {
    summary: { earned_count: 1, total_count: 3, completed_category_count: 0 },
    categories: [
      {
        category_key: "tutorial",
        label: "튜토리얼",
        earned_count: 0,
        total_count: 1,
        milestones: [
          {
            achievement_key: "tutorial_recipe_saved",
            track_key: "tutorial",
            title: "레시피 5개 저장",
            description: "마음에 드는 레시피를 조금 더 모아보세요.",
            current: 4,
            target: 5,
            status: "active",
            earned_at: null,
            locked_hint: null,
            badge: { badge_key: "tutorial_recipe_saved", category: "tutorial", shape_key: "bookmark" },
          },
        ],
      },
      {
        category_key: "cooking",
        label: "요리",
        earned_count: 1,
        total_count: 2,
        milestones: [
          {
            achievement_key: "cooking_3",
            track_key: "cooking",
            title: "요리 루틴 3번 완성",
            description: "요리 완료를 3번 기록해 보세요.",
            current: 2,
            target: 3,
            status: "active",
            earned_at: null,
            locked_hint: null,
            badge: { badge_key: "cooking_3", category: "cooking", shape_key: "pot" },
          },
          {
            achievement_key: "first_cook_done",
            track_key: "cooking",
            title: "첫 집밥 완성",
            description: "첫 요리 완료를 기록했어요.",
            current: 1,
            target: 1,
            status: "earned",
            earned_at: "2026-06-10T12:00:00.000Z",
            locked_hint: null,
            badge: { badge_key: "first_cook_done", category: "cooking", shape_key: "pot" },
          },
        ],
      },
    ],
  },
  notifications: { unseen: [], priority_unseen: [], archive_preview: [] },
  last_updated_at: "2026-06-10T12:00:00.000Z",
};

async function setAuthOverride(page: Page) {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      sameSite: "Lax",
      url: BASE_URL,
      value: "authenticated",
    },
  ]);
  await page.addInitScript(
    ({ key, state }: { key: string; state: string }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: "authenticated" },
  );
}

async function setGuestOverride(page: Page) {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      sameSite: "Lax",
      url: BASE_URL,
      value: "guest",
    },
  ]);
  await page.addInitScript(
    ({ key, state }: { key: string; state: string }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: "guest" },
  );
}

async function stabilize(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }

      nextjs-portal,
      [data-next-badge-root],
      [aria-label="Open Next.js Dev Tools"],
      [data-nextjs-dev-tools-button],
      [data-nextjs-toast] {
        display: none !important;
        visibility: hidden !important;
      }
    `,
  });
}

async function installRoutes(
  page: Page,
  options?: {
    authenticated?: boolean;
    gamificationDelayMs?: number;
    gamificationEmpty?: boolean;
    gamificationError?: boolean;
    onNotificationSeen?: () => void;
    unseenToast?: boolean;
  },
) {
  await page.route("**/api/v1/users/me/progress", async (route) => {
    if (options?.authenticated === false) {
      await route.fulfill({
        status: 401,
        json: {
          success: false,
          data: null,
          error: { code: "UNAUTHORIZED", message: "login required", fields: [] },
        },
      });
      return;
    }

    await route.fulfill({ json: { success: true, data: progress, error: null } });
  });

  await page.route(
    (url) => url.pathname === "/api/v1/users/me/gamification",
    async (route) => {
      if (options?.authenticated === false) {
        await route.fulfill({
          status: 401,
          json: {
            success: false,
            data: null,
            error: { code: "UNAUTHORIZED", message: "login required", fields: [] },
          },
        });
        return;
      }

      if (options?.gamificationDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.gamificationDelayMs));
      }

      if (options?.gamificationError) {
        await route.fulfill({
          status: 500,
          json: {
            success: false,
            data: null,
            error: { code: "INTERNAL_ERROR", message: "failed", fields: [] },
          },
        });
        return;
      }

      if (options?.gamificationEmpty) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              ...gamification,
              featured_badges: [],
              badges: { earned: [], locked: [] },
              quests: { active: [], completed_recent: [] },
              tutorial: {
                category_key: "tutorial",
                completed_count: 0,
                total_count: 0,
                active_steps: [],
              },
              achievement_album: {
                summary: { earned_count: 0, total_count: 0, completed_category_count: 0 },
                categories: [],
              },
              notifications: { unseen: [], priority_unseen: [], archive_preview: [] },
            },
            error: null,
          },
        });
        return;
      }

      await route.fulfill({
        json: {
          success: true,
          data: options?.unseenToast
            ? {
                ...gamification,
                notifications: {
                  unseen: [
                    {
                      id: "550e8400-e29b-41d4-a716-446655440001",
                      notification_type: "xp_awarded",
                      priority: 4,
                      delivery_channel: "toast",
                      toast_eligible: true,
                      group_key: null,
                      title: "요리 완료 +50 XP",
                      body: "경험치가 반영되었어요.",
                      category: "cooking",
                      payload: { label: "요리 완료", xp_delta: 50 },
                      created_at: "2026-06-10T12:00:00.000Z",
                      seen_at: null,
                    },
                  ],
                  priority_unseen: [],
                  archive_preview: [],
                },
              }
            : gamification,
          error: null,
        },
      });
    },
  );

  await page.route("**/api/v1/users/me/gamification/notifications/seen", async (route) => {
    options?.onNotificationSeen?.();
    await route.fulfill({
      json: {
        success: true,
        data: { seen_notification_ids: ["550e8400-e29b-41d4-a716-446655440001"] },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me/gamification/archive**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { items: [], next_cursor: null, has_next: false },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me/gamification/tutorial-quests/*/dismiss", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { quest_key: "save_five_recipes", status: "dismissed" },
        error: null,
      },
    });
  });

  await page.route((url) => url.pathname === "/api/v1/users/me", async (route) => {
    if (options?.authenticated === false) {
      await route.fulfill({
        status: 401,
        json: {
          success: false,
          data: null,
          error: { code: "UNAUTHORIZED", message: "login required", fields: [] },
        },
      });
      return;
    }

    await route.fulfill({ json: { success: true, data: profile, error: null } });
  });

  await page.route("**/api/v1/recipe-books", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          books: [
            { id: "book-saved", name: "저장한 레시피", book_type: "saved", recipe_count: 4, sort_order: 0 },
            { id: "book-custom", name: "평일 저녁", book_type: "custom", recipe_count: 2, sort_order: 1 },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipe-books/*/recipes**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { items: [], next_cursor: null, has_next: false },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/shopping/lists**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { items: [], next_cursor: null, has_next: false },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/planner**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: [
            { id: "breakfast", name: "아침", sort_order: 0 },
            { id: "lunch", name: "점심", sort_order: 1 },
            { id: "dinner", name: "저녁", sort_order: 2 },
          ],
          meals: [],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/leftovers**", async (route) => {
    await route.fulfill({
      json: { success: true, data: { items: [], next_cursor: null, has_next: false }, error: null },
    });
  });
}

async function openMypage(
  browser: Browser,
  viewport: { width: number; height: number },
  options?: Parameters<typeof installRoutes>[1],
) {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
  const page = await context.newPage();
  if (options?.authenticated !== false) {
    await setAuthOverride(page);
  }
  await installRoutes(page, options);
  await page.goto("/mypage", { waitUntil: "networkidle" });
  await stabilize(page);
  if (options?.gamificationError) {
    await expect(page.getByTestId("mypage-gamification-error")).toBeVisible();
  } else if (options?.gamificationEmpty) {
    await expect(page.getByTestId("mypage-gamification-empty")).toBeVisible();
  } else {
    try {
      await expect(page.getByTestId("mypage-growth-profile")).toBeVisible({ timeout: 15_000 });
    } catch {
      await page.reload({ waitUntil: "networkidle" });
      await stabilize(page);
      await expect(page.getByTestId("mypage-growth-profile")).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.getByRole("button", { name: "업적 보기" })).toBeVisible();
  }
  return { context, page };
}

test.describe("33c gamification frontend @smoke-core", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chrome",
      "This regression opens its own mobile and desktop contexts; avoid duplicate project runs.",
    );
  });

  test("renders MYPAGE badges, quests, guide, soft-fail, and XP toast evidence", async ({ browser }) => {
    test.setTimeout(60_000);
    await mkdir(EVIDENCE_DIR, { recursive: true });

    const mobile390 = await openMypage(browser, { width: 390, height: 844 });
    await mobile390.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "mobile-390.png"),
    });
    await mobile390.page
      .getByRole("button", { name: "업적 보기" })
      .click();
    await expect(mobile390.page.getByRole("dialog", { name: "업적 앨범" })).toBeVisible();
    await mobile390.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "achievement-album-modal.png"),
    });
    await mobile390.page.keyboard.press("Escape");
    await expect(mobile390.page.getByRole("dialog", { name: "업적 앨범" })).toBeHidden();
    await expect(mobile390.page.getByRole("button", { name: /claim/i })).toHaveCount(0);
    await mobile390.context.close();

    const mobile320 = await openMypage(browser, { width: 320, height: 568 });
    await mobile320.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "mobile-320.png"),
    });
    await mobile320.context.close();

    const desktop = await openMypage(browser, { width: 1440, height: 960 });
    await desktop.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "desktop-1440.png"),
    });
    await desktop.context.close();

    let seenRequestCount = 0;
    const toastPage = await openMypage(browser, { width: 390, height: 844 }, {
      onNotificationSeen: () => {
        seenRequestCount += 1;
      },
      unseenToast: true,
    });
    await toastPage.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("homecook:gamification-refresh"));
    });
    await expect(toastPage.page.getByTestId("growth-toast")).toContainText(
      "요리 완료 +50 XP",
    );
    await toastPage.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "xp-toast.png"),
    });
    await toastPage.page.getByLabel("알림 닫기").click();
    await expect.poll(() => seenRequestCount).toBeGreaterThan(0);
    await toastPage.context.close();

    const softFail = await openMypage(browser, { width: 390, height: 844 }, { gamificationError: true });
    await expect(softFail.page.getByTestId("mypage-growth-profile")).toBeVisible();
    await expect(softFail.page.getByTestId("mypage-gamification-error")).toBeVisible();
    await softFail.context.close();
  });

  test("covers loading, empty, and unauthorized state boundaries", async ({ browser }) => {
    const loadingContext = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: 390, height: 844 },
    });
    const loadingPage = await loadingContext.newPage();
    await setAuthOverride(loadingPage);
    await installRoutes(loadingPage, { gamificationDelayMs: 10_000 });
    await loadingPage.goto("/mypage", { waitUntil: "domcontentloaded" });
    await stabilize(loadingPage);
    await expect(loadingPage.getByTestId("mypage-gamification-loading")).toBeVisible();
    await loadingContext.close();

    const empty = await openMypage(browser, { width: 390, height: 844 }, {
      gamificationEmpty: true,
    });
    await expect(empty.page.getByTestId("mypage-gamification-empty")).toBeVisible();
    await empty.context.close();

    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await setGuestOverride(page);
    await installRoutes(page, { authenticated: false });
    await page.goto("/mypage", { waitUntil: "networkidle" });
    await stabilize(page);
    await expect(page.getByRole("heading", { name: "이 화면은 로그인이 필요해요" })).toBeVisible();
    await expect(page.getByTestId("mypage-gamification-card")).toHaveCount(0);
    await context.close();
  });
});
