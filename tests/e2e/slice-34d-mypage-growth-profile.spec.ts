import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/34d-mypage-growth-profile-assets",
);

const profile = {
  id: "user-growth-34d",
  nickname: "프로필러",
  email: "growth34d@example.com",
  profile_image_url: null,
  social_provider: "kakao",
  settings: { screen_wake_lock: false },
};

const progress = {
  level: {
    current_level: 9,
    total_xp: 1240,
    current_level_start_xp: 1100,
    next_level_start_xp: 1450,
    xp_into_current_level: 140,
    xp_to_next_level: 210,
    progress_ratio: 0.4,
    progress_percent: 40,
  },
  event_counts: {
    cooking_completed: 4,
    shopping_completed: 3,
    recipe_saved_distinct_ever: 8,
    custom_book_created: 1,
    planner_registered_first: 1,
    planner_registered_repeat: 2,
  },
  last_updated_at: "2026-06-11T00:00:00.000Z",
};

const allShapeBadges = [
  ["first_recipe_saved", "첫 저장", "recipe", "bookmark"],
  ["first_shopping_done", "장보기 첫걸음", "shopping", "leaf"],
  ["first_cook_done", "첫 집밥 완성", "cooking", "pot"],
  ["first_custom_book_created", "나만의 책", "recipebook", "plate"],
  ["shopping_rhythm", "장보기 리듬", "shopping", "shield"],
  ["recipe_collector", "레시피 컬렉터", "recipe", "ribbon"],
  ["kitchen_routine_starter", "집밥 루틴", "cooking", "bowl"],
] as const;

function makeBadge(
  [badge_key, label, category, shape_key]: (typeof allShapeBadges)[number],
  earned: boolean,
) {
  return {
    badge_key,
    label,
    description: `${label} 배지예요.`,
    category,
    shape_key,
    locked_hint: earned ? null : `${label} 활동을 한 번 더 기록해 보세요.`,
    earned_at: earned ? "2026-06-11T00:00:00.000Z" : null,
    is_new: badge_key === "first_shopping_done",
    progress_current: earned ? undefined : 1,
    progress_target: earned ? undefined : 3,
    progress_percent: earned ? undefined : 33,
  };
}

function buildGamification() {
  const earned = allShapeBadges.slice(0, 4).map((badge) => makeBadge(badge, true));
  const locked = allShapeBadges.slice(4).map((badge) => makeBadge(badge, false));

  return {
    level: {
      current_level: 9,
      total_xp: 1240,
      xp_to_next_level: 210,
      progress_percent: 40,
    },
    grade: {
      grade_key: "kitchen_explorer",
      label: "주방 탐험가",
      level_min: 8,
      level_max: 12,
    },
    featured_badges: earned,
    badges: { earned, locked },
    quests: {
      active: [
        {
          quest_key: "shopping_list_completed",
          quest_type: "standard",
          status: "active",
          title: "장보기 리스트 3회 완료",
          description: "리스트 기준 장보기 완료를 기록해 보세요.",
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
    tutorial: { active_steps: [] },
    notifications: { unseen: [], priority_unseen: [], archive_preview: [] },
    last_updated_at: "2026-06-11T00:00:00.000Z",
  };
}

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
  options: {
    gamificationError?: boolean;
    progressError?: boolean;
  } = {},
) {
  await page.route("**/api/v1/users/me/progress", async (route) => {
    if (options.progressError) {
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

    await route.fulfill({ json: { success: true, data: progress, error: null } });
  });

  await page.route((url) => url.pathname === "/api/v1/users/me/gamification", async (route) => {
    if (options.gamificationError) {
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

    await route.fulfill({
      json: { success: true, data: buildGamification(), error: null },
    });
  });

  await page.route("**/api/v1/users/me/gamification/notifications/seen", async (route) => {
    await route.fulfill({
      json: { success: true, data: { seen_notification_ids: [] }, error: null },
    });
  });

  await page.route("**/api/v1/users/me/gamification/archive**", async (route) => {
    await route.fulfill({
      json: { success: true, data: { items: [], next_cursor: null, has_next: false }, error: null },
    });
  });

  await page.route("**/api/v1/users/me/gamification/tutorial-quests/*/dismiss", async (route) => {
    await route.fulfill({
      json: { success: true, data: { quest_key: "shopping_list_completed", status: "dismissed" }, error: null },
    });
  });

  await page.route((url) => url.pathname === "/api/v1/users/me", async (route) => {
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
      json: { success: true, data: { items: [], next_cursor: null, has_next: false }, error: null },
    });
  });

  await page.route("**/api/v1/shopping/lists**", async (route) => {
    await route.fulfill({
      json: { success: true, data: { items: [], next_cursor: null, has_next: false }, error: null },
    });
  });

  await page.route("**/api/v1/planner**", async (route) => {
    await route.fulfill({
      json: { success: true, data: { columns: [], meals: [] }, error: null },
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
  await setAuthOverride(page);
  await installRoutes(page, options);
  await page.goto("/mypage", { waitUntil: "networkidle" });
  await stabilize(page);
  await expect(page.getByTestId("mypage-growth-profile")).toBeVisible();
  return { context, page };
}

test.describe("34d MYPAGE growth profile assets @smoke-core", () => {
  test("captures profile integration, badge shapes, locked hints, and soft-fail evidence", async ({ browser }) => {
    await mkdir(EVIDENCE_DIR, { recursive: true });

    const mobile390 = await openMypage(browser, { width: 390, height: 844 });
    await expect(mobile390.page.getByTestId("mypage-profile-grade-row")).toContainText("주방 탐험가");
    await expect(mobile390.page.getByTestId("mypage-profile-grade-row")).toContainText("Lv.9");
    await expect(mobile390.page.getByTestId("mypage-growth-featured-badges")).toHaveCount(0);
    await mobile390.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "mobile-390.png"),
    });

    await mobile390.page.getByRole("button", { name: "업적 보기" }).click();
    await expect(mobile390.page.getByRole("dialog", { name: "업적 앨범" })).toBeVisible();
    await expect(mobile390.page.getByText("획득한 스탬프")).toBeVisible();
    await mobile390.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "badge-shapes.png"),
    });
    await expect(mobile390.page.getByText("아직 표시할 업적이 없어요")).toBeVisible();
    await mobile390.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "locked-badge-hints.png"),
    });
    await mobile390.context.close();

    const mobile320 = await openMypage(browser, { width: 320, height: 568 });
    await expect(mobile320.page.getByRole("heading", { name: "저장한 레시피" })).toBeVisible();
    const hasHorizontalOverflow = await mobile320.page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    await mobile320.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "mobile-320.png"),
    });
    await mobile320.context.close();

    const desktop = await openMypage(browser, { width: 1440, height: 960 });
    await expect(desktop.page.getByTestId("mypage-profile-grade-row")).toContainText("주방 탐험가");
    await expect(desktop.page.getByTestId("mypage-profile-grade-row")).toContainText("Lv.9");
    await desktop.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "desktop-1440.png"),
    });
    await desktop.context.close();

    const progressSoftFail = await openMypage(browser, { width: 390, height: 844 }, { progressError: true });
    await expect(progressSoftFail.page.getByTestId("mypage-growth-progress-error")).toBeVisible();
    await expect(progressSoftFail.page.getByText("주방 탐험가")).toBeVisible();
    await progressSoftFail.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "soft-fail-progress.png"),
    });
    await progressSoftFail.context.close();

    const gamificationSoftFail = await openMypage(browser, { width: 390, height: 844 }, { gamificationError: true });
    await expect(gamificationSoftFail.page.getByTestId("mypage-growth-gamification-error")).toBeVisible();
    await expect(gamificationSoftFail.page.getByText("Lv.9")).toBeVisible();
    await gamificationSoftFail.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "soft-fail-gamification.png"),
    });
    await gamificationSoftFail.context.close();
  });
});
