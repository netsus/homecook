import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/34e-growth-profile-visual-polish",
);

const profile = {
  id: "user-growth-34e",
  nickname: "김집밥",
  email: "growth34e@example.com",
  profile_image_url: null,
  social_provider: "kakao",
  settings: { screen_wake_lock: false },
};

const progress = {
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
    cooking_completed: 5,
    shopping_completed: 3,
    recipe_saved_distinct_ever: 9,
    custom_book_created: 2,
    planner_registered_first: 1,
    planner_registered_repeat: 4,
  },
  last_updated_at: "2026-06-12T00:00:00.000Z",
};

const badges = [
  ["first_cook_done", "첫 집밥 완성", "cooking", "pot"],
  ["first_planner_registered", "식단 계획", "planner", "shield"],
  ["first_shopping_done", "첫 장보기 완료", "shopping", "bowl"],
  ["first_recipe_saved", "레시피 저장", "recipebook", "bookmark"],
] as const;

function makeBadge([badge_key, label, category, shape_key]: (typeof badges)[number]) {
  return {
    badge_key,
    label,
    description: `${label} 배지예요.`,
    category,
    shape_key,
    locked_hint: null,
    earned_at: "2026-06-12T00:00:00.000Z",
    is_new: badge_key === "first_shopping_done",
  };
}

function buildGamification(gradeKey = "homecook_runner") {
  const grade =
    gradeKey === "homecook_artisan"
      ? { grade_key: "homecook_artisan", label: "집밥 장인", level_min: 21, level_max: 34 }
      : { grade_key: "homecook_runner", label: "집밥 러너", level_min: 4, level_max: 7 };
  const earned = badges.map(makeBadge);

  return {
    level: {
      current_level: 6,
      total_xp: 520,
      xp_to_next_level: 130,
      progress_percent: 13,
    },
    grade,
    featured_badges: earned,
    badges: {
      earned,
      locked: [
        {
          badge_key: "shopping_rhythm",
          label: "장보기 리듬",
          description: "장보기 완료를 꾸준히 기록해요.",
          category: "shopping",
          shape_key: "ribbon",
          locked_hint: "장보기 완료를 한 번 더 기록해 보세요.",
          earned_at: null,
          is_new: false,
          progress_current: 1,
          progress_target: 3,
          progress_percent: 33,
        },
      ],
    },
    quests: {
      active: [
        {
          quest_key: "shopping_three_lists",
          quest_type: "standard",
          status: "active",
          title: "장보기 3회",
          description: "리스트를 만들고 장보기를 완료해요.",
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
    last_updated_at: "2026-06-12T00:00:00.000Z",
  };
}

function archiveItems(count = 12) {
  return Array.from({ length: count }, (_, index) => ({
    id: `archive-${index}`,
    notification_type: index === 0 ? "level_up" : index % 2 === 0 ? "quest_completed" : "xp_awarded",
    priority: index === 0 ? 100 : 10,
    delivery_channel: "archive_only",
    toast_eligible: false,
    group_key: null,
    title: index === 0 ? "레벨 업!" : `성장 기록 ${index}`,
    body: index === 0 ? "집밥 러너 Lv.6 달성" : "집밥 활동을 기록했어요.",
    category: "cooking",
    payload: {},
    created_at: `2026-06-${String(12 - Math.min(index, 10)).padStart(2, "0")}T00:00:00.000Z`,
    seen_at: null,
  }));
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
    gradeKey?: string;
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
      json: { success: true, data: buildGamification(options.gradeKey), error: null },
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
      json: { success: true, data: { items: archiveItems(), next_cursor: null, has_next: false }, error: null },
    });
  });

  await page.route("**/api/v1/users/me/gamification/notifications/seen", async (route) => {
    await route.fulfill({
      json: { success: true, data: { seen_notification_ids: [] }, error: null },
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

test.describe("34e growth profile visual polish @smoke-core", () => {
  test.setTimeout(90_000);

  test("captures integrated header, archive separation, grade marks, and soft-fail evidence", async ({ browser }) => {
    await mkdir(EVIDENCE_DIR, { recursive: true });

    const mobile390 = await openMypage(browser, { width: 390, height: 844 });
    await expect(mobile390.page.getByTestId("mypage-growth-profile")).toContainText("김집밥");
    await expect(mobile390.page.getByTestId("mypage-growth-profile")).toContainText("집밥 러너 · Lv.6");
    await expect(mobile390.page.getByTestId("mypage-gamification-card")).toContainText("장보기 3회");
    await mobile390.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "mobile-390.png"),
    });

    await mobile390.page.getByTestId("mypage-growth-featured-badges").getByRole("button").first().click();
    await expect(mobile390.page.getByRole("dialog", { name: "업적 앨범" })).toBeVisible();
    await mobile390.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "badge-guide-polished.png"),
    });
    await mobile390.context.close();

    const mobile320 = await openMypage(browser, { width: 320, height: 568 });
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
    await expect(desktop.page.getByTestId("growth-archive-surface")).toBeVisible();
    const layout = await desktop.page.evaluate(() => {
      const profileBox = document.querySelector('[data-testid="mypage-profile"]')?.getBoundingClientRect();
      const archiveBox = document.querySelector('[data-testid="growth-archive-surface"]')?.getBoundingClientRect();
      const archiveInsideProfile = Boolean(
        document.querySelector('[data-testid="mypage-profile"] [data-testid="growth-archive-surface"]'),
      );
      return {
        archiveHeight: archiveBox?.height ?? 0,
        archiveInsideProfile,
        profileHeight: profileBox?.height ?? 0,
        profileTop: profileBox?.top ?? 0,
      };
    });
    expect(layout.archiveInsideProfile).toBe(false);
    expect(layout.profileTop).toBeLessThan(180);
    expect(layout.archiveHeight).toBeGreaterThan(layout.profileHeight);
    expect(layout.profileHeight).toBeLessThan(520);
    await desktop.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "desktop-1440.png"),
    });
    await desktop.context.close();

    const wide = await openMypage(browser, { width: 1920, height: 1080 });
    await wide.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "desktop-1920.png"),
    });
    await wide.context.close();

    const runner = await openMypage(browser, { width: 390, height: 844 }, { gradeKey: "homecook_runner" });
    await expect(runner.page.getByTestId("growth-grade-mark-homecook_runner")).toHaveAttribute(
      "data-grade-motif",
      "bowl-motion-timer",
    );
    await runner.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "runner-grade-no-footwear.png"),
    });
    await runner.context.close();

    const artisan = await openMypage(browser, { width: 390, height: 844 }, { gradeKey: "homecook_artisan" });
    await expect(artisan.page.getByTestId("growth-grade-mark-homecook_artisan")).toHaveAttribute(
      "data-grade-motif",
      "seal-tool-steam",
    );
    await artisan.context.close();

    const progressSoftFail = await openMypage(browser, { width: 390, height: 844 }, { progressError: true });
    await expect(progressSoftFail.page.getByTestId("mypage-growth-progress-error")).toBeVisible();
    await progressSoftFail.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "soft-fail-progress.png"),
    });
    await progressSoftFail.context.close();

    const gamificationSoftFail = await openMypage(browser, { width: 390, height: 844 }, { gamificationError: true });
    await expect(gamificationSoftFail.page.getByTestId("mypage-growth-gamification-error")).toBeVisible();
    await gamificationSoftFail.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "soft-fail-gamification.png"),
    });
    await gamificationSoftFail.context.close();

    const archiveSoftFail = await openMypage(browser, { width: 390, height: 844 }, { archiveError: true });
    await expect(archiveSoftFail.page.getByTestId("growth-archive-error")).toBeVisible();
    await expect(archiveSoftFail.page.getByTestId("mypage-growth-profile")).toContainText("집밥 러너");
    await archiveSoftFail.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "soft-fail-archive.png"),
    });
    await archiveSoftFail.context.close();
  });
});
