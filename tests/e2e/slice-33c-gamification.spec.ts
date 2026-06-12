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
  featured_badges: [
    {
      badge_key: "first_cook_done",
      label: "첫 집밥 완성",
      description: "첫 요리 완료를 기록했어요.",
      earned_at: "2026-06-10T12:00:00.000Z",
      is_new: true,
    },
    {
      badge_key: "first_shopping_done",
      label: "장보기 첫걸음",
      description: "첫 장보기 완료를 기록했어요.",
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
    active_steps: [
      {
        quest_key: "save_five_recipes",
        quest_type: "tutorial",
        status: "active",
        title: "레시피 5개 저장",
        description: "마음에 드는 레시피를 조금 더 모아보세요.",
        progress_current: 4,
        progress_target: 5,
        progress_percent: 80,
        completed_at: null,
        dismissed_at: null,
        is_new: false,
      },
    ],
  },
  notifications: { unseen: [] },
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
              tutorial: { active_steps: [] },
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
                      payload: { label: "요리 완료", xp_delta: 50 },
                      created_at: "2026-06-10T12:00:00.000Z",
                    },
                  ],
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
    await expect(page.getByTestId("mypage-gamification-card")).toBeVisible({ timeout: 15_000 });
  }
  return { context, page };
}

test.describe("33c gamification frontend @smoke-core", () => {
  test("renders MYPAGE badges, quests, guide, soft-fail, and XP toast evidence", async ({ browser }) => {
    await mkdir(EVIDENCE_DIR, { recursive: true });

    const mobile390 = await openMypage(browser, { width: 390, height: 844 });
    await mobile390.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "mobile-390.png"),
    });
    await mobile390.page
      .getByTestId("mypage-gamification-card")
      .getByRole("button", { name: "안내" })
      .click();
    await expect(mobile390.page.getByRole("dialog", { name: "배지 안내" })).toBeVisible();
    await mobile390.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "badge-guide-modal.png"),
    });
    await mobile390.page.keyboard.press("Escape");
    await expect(mobile390.page.getByRole("dialog", { name: "배지 안내" })).toBeHidden();
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
