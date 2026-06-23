import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/35c-mypage-achievement-album-ui",
);

const profile = {
  id: "user-35c",
  nickname: "김지은",
  email: "user35c@example.com",
  profile_image_url: null,
  social_provider: "kakao",
  settings: { screen_wake_lock: false },
};

const progress = {
  level: {
    current_level: 46,
    total_xp: 7760,
    current_level_start_xp: 7000,
    next_level_start_xp: 11000,
    xp_into_current_level: 760,
    xp_to_next_level: 3240,
    progress_ratio: 0.69,
    progress_percent: 69,
  },
  event_counts: {
    cooking_completed: 327,
    shopping_completed: 214,
    recipe_saved_distinct_ever: 50,
    custom_book_created: 2,
    planner_registered_first: 1,
    planner_registered_repeat: 127,
  },
  last_updated_at: "2026-06-14T00:00:00.000Z",
};

const notifications = [
  {
    id: "notice-level",
    notification_type: "level_up",
    priority: 100,
    delivery_channel: "archive_only",
    toast_eligible: false,
    group_key: null,
    title: "레벨업!",
    body: "Lv.46 달성",
    category: "cooking",
    payload: {},
    created_at: "2026-06-14T10:15:00.000Z",
    seen_at: null,
  },
  {
    id: "notice-achievement",
    notification_type: "achievement_unlocked",
    priority: 80,
    delivery_channel: "archive_only",
    toast_eligible: false,
    group_key: null,
    title: "업적 달성!",
    body: "요리 100회 배지를 획득했어요.",
    category: "cooking",
    payload: {},
    created_at: "2026-06-14T10:06:00.000Z",
    seen_at: null,
  },
  {
    id: "notice-xp",
    notification_type: "xp_awarded",
    priority: 4,
    delivery_channel: "archive_only",
    toast_eligible: false,
    group_key: null,
    title: "+120 XP 획득",
    body: "레시피 XP",
    category: "recipe",
    payload: {},
    created_at: "2026-06-14T09:58:00.000Z",
    seen_at: null,
  },
];

function milestone(
  achievement_key: string,
  title: string,
  status: "earned" | "active" | "locked",
  current: number,
  target: number,
  shape_key: "plate" | "shield" | "ribbon" | "bookmark" | "pot" | "leaf" | "bowl",
) {
  return {
    achievement_key,
    track_key: achievement_key.split("_")[0],
    title,
    description: `${title} 기록을 채워요.`,
    current,
    target,
    status,
    earned_at: status === "earned" ? "2026-06-14T00:00:00.000Z" : null,
    locked_hint: status === "locked" ? `${title} 활동을 시작하면 열려요.` : null,
    badge: { badge_key: achievement_key, category: achievement_key.split("_")[0], shape_key },
  };
}

function buildGamification(archivePreview = notifications) {
  const featured = [
    {
      badge_key: "tutorial_recipe_saved",
      label: "첫 저장 완료",
      description: "첫 레시피를 저장했어요.",
      category: "tutorial",
      shape_key: "bookmark",
      locked_hint: null,
      earned_at: "2026-06-10T00:00:00.000Z",
      is_new: false,
    },
    {
      badge_key: "cooking_completed_100",
      label: "요리 100회",
      description: "요리 완료를 100번 기록했어요.",
      category: "cooking",
      shape_key: "pot",
      locked_hint: null,
      earned_at: "2026-06-11T00:00:00.000Z",
      is_new: true,
    },
  ];

  return {
    level: {
      current_level: 46,
      total_xp: 7760,
      xp_to_next_level: 3240,
      progress_percent: 69,
    },
    grade: {
      grade_key: "diamond",
      label: "Diamond",
      level_min: 35,
      level_max: 49,
      icon_url: "/assets/growth/grades/diamond-spoon-badge.png",
      character_url: "/assets/growth/grades/diamond-spoon.png",
    },
    featured_badges: featured,
    badges: { earned: featured, locked: [] },
    quests: { active: [], completed_recent: [] },
    tutorial: {
      category_key: "tutorial",
      completed_count: 2,
      total_count: 7,
      active_steps: [
        {
          achievement_key: "tutorial_planner_registered",
          title: "첫 식단 등록하기",
          current: 3,
          target: 5,
          status: "active",
        },
      ],
    },
    achievement_album: {
      summary: { earned_count: 3, total_count: 9, completed_category_count: 0 },
      categories: [
        {
          category_key: "tutorial",
          label: "튜토리얼",
          earned_count: 2,
          total_count: 7,
          milestones: [
            milestone("tutorial_recipe_saved", "첫 레시피 저장하기", "earned", 1, 1, "bookmark"),
            milestone("tutorial_planner_registered", "첫 식단 등록하기", "active", 3, 5, "ribbon"),
            milestone("tutorial_shopping_list_complete", "첫 장보기 완료하기", "locked", 0, 1, "bowl"),
            milestone("tutorial_shopping_list_create", "첫 장보기 목록 만들기", "locked", 0, 1, "leaf"),
            milestone("tutorial_cooking_complete", "첫 집밥 완료하기", "locked", 0, 1, "pot"),
            milestone("tutorial_recipebook_created", "첫 레시피북 만들기", "locked", 0, 1, "plate"),
            milestone("tutorial_complete", "튜토리얼 완료", "earned", 6, 6, "ribbon"),
          ],
        },
        {
          category_key: "cooking",
          label: "요리",
          earned_count: 1,
          total_count: 2,
          milestones: [
            milestone("cooking_completed_100", "요리 100회", "earned", 100, 100, "pot"),
            milestone("cooking_completed_300", "요리 300회", "active", 120, 300, "plate"),
          ],
        },
      ],
    },
    notifications: {
      unseen: [],
      priority_unseen: [],
      archive_preview: archivePreview,
    },
    last_updated_at: "2026-06-14T10:15:00.000Z",
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
    archiveError?: boolean;
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
      json: {
        success: true,
        data: buildGamification(options.archiveError ? [] : notifications),
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me/gamification/archive**", async (route) => {
    if (options.archiveError) {
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
      json: {
        success: true,
        data: { items: notifications, next_cursor: null, has_next: false },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me/gamification/notifications/seen", async (route) => {
    await route.fulfill({ json: { success: true, data: { seen_notification_ids: [] }, error: null } });
  });

  await page.route("**/api/v1/users/me/gamification/tutorial-quests/*/dismiss", async (route) => {
    await route.fulfill({ json: { success: true, data: { quest_key: "first_planner_registered", status: "dismissed" }, error: null } });
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
      json: {
        success: true,
        data: {
          columns: [],
          meals: [
            { id: "m1", status: "cook_done" },
            { id: "m2", status: "shopping_done" },
            { id: "m3", status: "registered" },
          ],
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
  await setAuthOverride(page);
  await installRoutes(page, options);
  await page.goto(`${BASE_URL}/mypage`, { waitUntil: "domcontentloaded" });
  await stabilize(page);
  try {
    await expect(page.getByTestId("mypage-growth-profile")).toBeVisible({ timeout: 15_000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await stabilize(page);
    await expect(page.getByTestId("mypage-growth-profile")).toBeVisible({ timeout: 30_000 });
  }
  return { context, page };
}

test.describe("35c MYPAGE achievement album UI @smoke-core", () => {
  test("opens grade, achievement, and notification panels from the integrated profile", async ({ browser }) => {
    await mkdir(EVIDENCE_DIR, { recursive: true });

    const mobile = await openMypage(browser, { width: 390, height: 844 });
    await expect(mobile.page.getByTestId("mypage-profile-grade-row").getByText("다이아")).toBeVisible();
    await expect(mobile.page.getByTestId("mypage-profile-grade-row").getByText("Lv.46")).toBeVisible();
    await expect(mobile.page.getByTestId("growth-archive-surface")).toHaveCount(0);
    await expect(mobile.page.getByRole("button", { name: "등급 보기" })).toBeVisible();
    await expect(mobile.page.getByRole("button", { name: "업적 보기" })).toBeVisible();
    await expect(mobile.page.getByRole("button", { name: "튜토리얼 보기" })).toHaveCount(0);
    await expect(mobile.page.getByRole("button", { name: "알림 보기" })).toBeVisible();
    await expect(mobile.page.getByText("760 / 4,000 XP")).toBeVisible();
    await expect(mobile.page.getByTestId("mypage-growth-featured-badges")).toHaveCount(0);
    await mobile.page.screenshot({ fullPage: true, path: path.join(EVIDENCE_DIR, "mobile-390-profile.png") });

    await mobile.page.getByRole("button", { name: "등급 보기" }).click();
    const gradeDialog = mobile.page.getByRole("dialog", { name: "전체 등급" });
    await expect(gradeDialog).toBeVisible();
    await expect(mobile.page.getByText("현재 등급")).toBeVisible();
    await expect(mobile.page.getByText("티타늄")).toBeVisible();
    await mobile.page.waitForFunction(() =>
      Array.from(document.querySelectorAll('[data-testid^="grade-panel-grade-image-"]'))
        .slice(0, 5)
        .every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
    );
    await mobile.page.screenshot({ fullPage: true, path: path.join(EVIDENCE_DIR, "mobile-grade-modal.png") });
    await gradeDialog.getByRole("button", { exact: true, name: "닫기" }).click();

    await mobile.page.getByRole("button", { name: "업적 보기" }).click();
    const achievementDialog = mobile.page.getByRole("dialog", { name: "업적 앨범" });
    await expect(achievementDialog).toBeVisible();
    await expect(mobile.page.getByRole("tab", { name: "튜토리얼" })).toBeVisible();
    await expect(mobile.page.getByRole("tab", { name: "식단·장보기·요리" })).toBeVisible();
    await expect(mobile.page.getByRole("tab", { exact: true, name: "요리" })).toHaveCount(0);
    await expect(mobile.page.getByTestId("achievement-track-tutorial")).toContainText("2 / 7");
    await expect(mobile.page.getByTestId("achievement-track-tutorial")).toContainText("완료");
    await expect(mobile.page.getByTestId("achievement-badge-row-tutorial").locator("> *")).toHaveCount(7);
    await mobile.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "mobile-achievement-tutorial-category.png"),
    });
    await mobile.page.getByRole("tab", { name: "식단·장보기·요리" }).click();
    await expect(mobile.page.getByTestId("achievement-track-cooking")).toContainText("100회");
    await expect(mobile.page.getByTestId("achievement-track-cooking")).toContainText("300회");
    await expect(mobile.page.getByTestId("growth-badge-image-cooking_completed_100")).toHaveAttribute(
      "src",
      "/assets/growth/achievement-icons-v3-4/cooking_completed_100.png",
    );
    await expect(mobile.page.getByTestId("growth-badge-image-cooking_completed_300")).toBeVisible();
    await expect(mobile.page.getByTestId("achievement-stamp-cooking_completed_300")).toHaveCount(0);
    await mobile.page.screenshot({ fullPage: true, path: path.join(EVIDENCE_DIR, "mobile-achievement-modal.png") });
    await achievementDialog.getByRole("button", { exact: true, name: "닫기" }).click();

    await mobile.page.getByRole("button", { name: "알림 보기" }).click();
    const notificationDialog = mobile.page.getByRole("dialog", { name: "알림 기록" });
    await expect(notificationDialog).toBeVisible();
    await expect(notificationDialog.getByText("레벨업!")).toBeVisible();
    await expect(notificationDialog.getByText("Lv.46 달성")).toBeVisible();
    await notificationDialog.getByRole("tab", { name: "업적" }).click();
    await expect(notificationDialog.getByText("업적 달성!")).toBeVisible();
    await expect(notificationDialog.getByText("+120 XP 획득")).toHaveCount(0);
    await mobile.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "mobile-notification-archive-modal.png"),
    });
    await mobile.context.close();

    const mobile320 = await openMypage(browser, { width: 320, height: 568 });
    const overflow = await mobile320.page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await mobile320.page.screenshot({ fullPage: true, path: path.join(EVIDENCE_DIR, "mobile-320-profile.png") });
    await mobile320.context.close();

    const desktop = await openMypage(browser, { width: 1440, height: 960 });
    await expect(desktop.page.getByLabel("마이페이지 통계")).toContainText("요리기록");
    await expect(desktop.page.getByRole("button", { name: "알림 보기" })).toBeVisible();
    await expect(desktop.page.getByTestId("growth-archive-surface")).toHaveCount(0);
    await desktop.page.screenshot({ fullPage: true, path: path.join(EVIDENCE_DIR, "desktop-1440-profile.png") });
    await desktop.context.close();

    const wideDesktop = await openMypage(browser, { width: 1920, height: 1080 });
    await expect(wideDesktop.page.getByTestId("mypage-profile-grade-row")).toContainText("다이아");
    await expect(wideDesktop.page.getByTestId("mypage-profile-grade-row")).toContainText("Lv.46");
    await wideDesktop.page.screenshot({ fullPage: true, path: path.join(EVIDENCE_DIR, "desktop-1920-profile.png") });
    await wideDesktop.context.close();

    const progressSoftFail = await openMypage(browser, { width: 390, height: 844 }, { progressError: true });
    await expect(progressSoftFail.page.getByTestId("mypage-growth-progress-error")).toBeVisible();
    await progressSoftFail.page.screenshot({ fullPage: true, path: path.join(EVIDENCE_DIR, "soft-fail-progress.png") });
    await progressSoftFail.context.close();

    const gamificationSoftFail = await openMypage(browser, { width: 390, height: 844 }, { gamificationError: true });
    await expect(gamificationSoftFail.page.getByTestId("mypage-growth-gamification-error")).toBeVisible();
    await gamificationSoftFail.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "soft-fail-gamification.png"),
    });
    await gamificationSoftFail.context.close();

    const archiveSoftFail = await openMypage(browser, { width: 390, height: 844 }, { archiveError: true });
    await archiveSoftFail.page.getByRole("button", { name: "알림 보기" }).click();
    await expect(archiveSoftFail.page.getByTestId("mypage-notification-archive-error")).toBeVisible();
    await archiveSoftFail.page.screenshot({ fullPage: true, path: path.join(EVIDENCE_DIR, "soft-fail-archive.png") });
    await archiveSoftFail.context.close();
  });
});
