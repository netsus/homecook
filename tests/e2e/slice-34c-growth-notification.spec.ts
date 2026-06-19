import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/34c-growth-notification-ui",
);

const profile = {
  id: "user-growth-34c",
  nickname: "성장러",
  email: "growth@example.com",
  profile_image_url: null,
  social_provider: "kakao",
  settings: { screen_wake_lock: false },
};

const progress = {
  level: {
    current_level: 7,
    total_xp: 1260,
    current_level_start_xp: 1100,
    next_level_start_xp: 1400,
    xp_into_current_level: 160,
    xp_to_next_level: 140,
    progress_ratio: 0.53,
    progress_percent: 53,
  },
  event_counts: {
    cooking_completed: 8,
    shopping_completed: 4,
    recipe_saved_distinct_ever: 12,
    custom_book_created: 2,
    planner_registered: 9,
  },
  last_updated_at: "2026-06-11T10:00:00.000Z",
};

type NotificationType =
  | "level_up"
  | "achievement_unlocked"
  | "badge_unlocked"
  | "xp_awarded";
type DeliveryChannel = "toast" | "archive_only" | "silent";

interface NotificationFixture {
  id: string;
  notification_type: NotificationType;
  priority: number;
  delivery_channel: DeliveryChannel;
  toast_eligible: boolean;
  group_key: string | null;
  title: string;
  body: string;
  category: "tutorial" | "recipe" | "planner" | "shopping" | "cooking" | "pantry" | "leftovers" | "recipebook";
  payload: Record<string, unknown>;
  created_at: string;
  seen_at: string | null;
}

const priorityNotifications: NotificationFixture[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    notification_type: "level_up",
    priority: 1,
    delivery_channel: "toast",
    toast_eligible: true,
    group_key: "cook-session-34c",
    title: "등급 획득!",
    body: "Lv.7 달성",
    category: "cooking",
    payload: {
      current_level: 7,
      grade_upgrade: true,
      previous_grade: { grade_key: "sprout_homecook", label: "성장 씨앗" },
      grade: { grade_key: "homecook_runner", label: "집밥 러너" },
    },
    created_at: "2026-06-11T10:04:00.000Z",
    seen_at: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    notification_type: "achievement_unlocked",
    priority: 2,
    delivery_channel: "toast",
    toast_eligible: true,
    group_key: "cook-session-34c",
    title: "업적 달성!",
    body: "첫 한상 배지를 획득했어요.",
    category: "cooking",
    payload: { achievement_key: "tutorial_cooking_complete", title: "첫 한상" },
    created_at: "2026-06-11T10:03:00.000Z",
    seen_at: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    notification_type: "badge_unlocked",
    priority: 2,
    delivery_channel: "toast",
    toast_eligible: true,
    group_key: "planner-week-34c",
    title: "새 배지 획득!",
    body: "플래너 배지를 획득했어요.",
    category: "planner",
    payload: { badge_key: "planner_registered_3", title: "플래너 루틴" },
    created_at: "2026-06-11T10:02:00.000Z",
    seen_at: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    notification_type: "xp_awarded",
    priority: 4,
    delivery_channel: "toast",
    toast_eligible: true,
    group_key: "cook-session-34c",
    title: "+20 XP 획득",
    body: "요리 완료 XP",
    category: "cooking",
    payload: { label: "요리 완료", xp_delta: 20 },
    created_at: "2026-06-11T10:01:00.000Z",
    seen_at: null,
  },
];

const archivePageOne: NotificationFixture[] = [
  {
    ...priorityNotifications[0],
    id: "20000000-0000-4000-8000-000000000001",
    title: "등급 획득!",
    seen_at: "2026-06-11T10:05:00.000Z",
  },
  {
    ...priorityNotifications[3],
    id: "20000000-0000-4000-8000-000000000002",
    delivery_channel: "silent",
    title: "숨김 처리된 내부 알림",
    seen_at: null,
  },
];

const archivePageTwo: NotificationFixture[] = [
  {
    ...priorityNotifications[2],
    id: "20000000-0000-4000-8000-000000000003",
    title: "새 배지 획득!",
    seen_at: "2026-06-11T09:30:00.000Z",
  },
];

function buildGamification(notifications = priorityNotifications) {
  return {
    level: {
      current_level: 7,
      total_xp: 1260,
      xp_to_next_level: 140,
      progress_percent: 53,
    },
    grade: {
      grade_key: "homecook_runner",
      label: "집밥 러너",
      level_min: 6,
      level_max: 10,
    },
    featured_badges: [
      {
        badge_key: "first_cook_done",
        label: "첫 한상",
        description: "첫 요리 완료를 기록했어요.",
        category: "cooking",
        shape_key: "plate",
        locked_hint: null,
        earned_at: "2026-06-11T10:03:00.000Z",
        is_new: true,
      },
    ],
    badges: {
      earned: [],
      locked: [
        {
          badge_key: "planner_week",
          label: "플래너 루틴",
          description: "식사 등록을 이어가 보세요.",
          category: "planner",
          shape_key: "bookmark",
          locked_hint: "이번 주 플래너에 식사를 더 등록하면 열려요.",
          earned_at: null,
          is_new: false,
        },
      ],
    },
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
    notifications: {
      unseen: [],
      priority_unseen: notifications,
      archive_preview: archivePageOne.filter((item) => item.delivery_channel !== "silent"),
    },
    last_updated_at: "2026-06-11T10:05:00.000Z",
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

async function installGrowthRoutes(
  page: Page,
  options: {
    archiveEmpty?: boolean;
    notifications?: NotificationFixture[];
    onSeen?: (ids: string[]) => void;
  } = {},
) {
  await page.route("**/api/v1/users/me/progress", async (route) => {
    await route.fulfill({ json: { success: true, data: progress, error: null } });
  });

  await page.route((url) => url.pathname === "/api/v1/users/me/gamification/archive", async (route) => {
    const requestUrl = new URL(route.request().url());
    const cursor = requestUrl.searchParams.get("cursor");

    if (options.archiveEmpty) {
      await route.fulfill({
        json: {
          success: true,
          data: { items: [], next_cursor: null, has_next: false },
          error: null,
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data:
          cursor === "cursor-page-2"
            ? { items: archivePageTwo, next_cursor: null, has_next: false }
            : { items: archivePageOne, next_cursor: "cursor-page-2", has_next: true },
        error: null,
      },
    });
  });

  await page.route((url) => url.pathname === "/api/v1/users/me/gamification", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: buildGamification(options.notifications),
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me/gamification/notifications/seen", async (route) => {
    const body = route.request().postDataJSON() as { notification_ids?: string[] };
    const ids = body.notification_ids ?? [];
    options.onSeen?.(ids);
    await route.fulfill({
      json: {
        success: true,
        data: { seen_notification_ids: ids },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me/gamification/tutorial-quests/*/dismiss", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { quest_key: "shopping_list_completed", status: "dismissed" },
        error: null,
      },
    });
  });

  await page.route((url) => url.pathname === "/api/v1/users/me", async (route) => {
    await route.fulfill({ json: { success: true, data: profile, error: null } });
  });

  await page.route("**/api/v1/recipe-books", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { books: [] },
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
        data: { columns: [], meals: [] },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/leftovers**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { items: [], next_cursor: null, has_next: false },
        error: null,
      },
    });
  });
}

async function installShoppingRoutes(page: Page) {
  await page.route((url) => url.pathname === "/api/v1/shopping/preview", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          eligible_meals: [
            {
              id: "meal-shopping-34c-1",
              column_id: "column-breakfast",
              column_name: "아침",
              plan_date: "2026-06-11",
              recipe_id: "recipe-kimchi",
              recipe_name: "김치찌개",
              recipe_thumbnail: null,
              planned_servings: 2,
              created_at: "2026-06-11T00:00:00.000Z",
            },
            {
              id: "meal-shopping-34c-2",
              column_id: "column-dinner",
              column_name: "저녁",
              plan_date: "2026-06-12",
              recipe_id: "recipe-doenjang",
              recipe_name: "된장찌개",
              recipe_thumbnail: null,
              planned_servings: 3,
              created_at: "2026-06-12T00:00:00.000Z",
            },
          ],
        },
        error: null,
      },
    });
  });
}

async function openMypage(
  browser: Browser,
  viewport: { width: number; height: number },
  options?: Parameters<typeof installGrowthRoutes>[1],
) {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
  const page = await context.newPage();
  await setAuthOverride(page);
  await installGrowthRoutes(page, options);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`${BASE_URL}/mypage`, { waitUntil: "domcontentloaded" });
    await stabilize(page);

    try {
      await expect(page.getByTestId("mypage-growth-profile")).toBeVisible({
        timeout: 15_000,
      });
      return { context, page };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function showToastStack(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("homecook:gamification-refresh"));
  });
  await expect(page.getByTestId("growth-toast").first()).toBeVisible();
}

test.describe("34c growth notification UI @smoke-core", () => {
  test("keeps server order, visible max, and seen boundaries", async ({ page }) => {
    const seenRequests: string[][] = [];
    await setAuthOverride(page);
    await installGrowthRoutes(page, {
      onSeen: (ids) => {
        seenRequests.push(ids);
      },
    });

    await page.goto(`${BASE_URL}/mypage`, { waitUntil: "domcontentloaded" });
    await stabilize(page);
    await expect(page.getByTestId("mypage-growth-profile")).toBeVisible({
      timeout: 15_000,
    });
    await showToastStack(page);

    const visibleMax = (page.viewportSize()?.width ?? 0) >= 768 ? 3 : 2;
    await expect(page.getByTestId("growth-toast")).toHaveCount(visibleMax);
    await expect(page.getByTestId("growth-toast").nth(0)).toContainText("업적 달성!");
    await expect(page.getByTestId("growth-toast").nth(0)).toContainText("첫 한상 배지를 획득했어요.");
    await expect(page.getByTestId("growth-toast").nth(0)).toContainText("+20 XP");
    await expect(page.getByTestId("growth-toast").nth(1)).toContainText("등급 획득!");
    if (visibleMax === 3) {
      await expect(page.getByTestId("growth-toast").nth(2)).toContainText("새 배지 획득!");
      await expect(page.getByTestId("growth-toast-collapsed")).toHaveCount(0);
    } else {
      await expect(page.getByTestId("growth-toast-collapsed")).toContainText("+1개의 새 소식 확인");
    }
    expect(seenRequests).toEqual([]);

    await page.getByLabel("알림 닫기").first().click();
    expect(seenRequests.at(-1)).toEqual([
      priorityNotifications[1].id,
      priorityNotifications[3].id,
    ]);
  });

  test("opens the notification archive from the profile while excluding silent rows", async ({ browser }, testInfo) => {
    const viewport = testInfo.project.name === "mobile-chrome"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 960 };
    const { context, page } = await openMypage(browser, viewport);

    await expect(page.getByTestId("mypage-growth-profile")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("growth-archive-surface")).toHaveCount(0);
    await page.getByRole("button", { name: "알림 보기" }).click();
    const dialog = page.getByRole("dialog", { name: "알림 기록" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("등급 획득!")).toBeVisible();
    await expect(dialog.getByText("숨김 처리된 내부 알림")).toHaveCount(0);
    await context.close();
  });

  test("renders exact shopping multi-meal guidance copy", async ({ page }) => {
    await setAuthOverride(page);
    await installShoppingRoutes(page);

    await page.goto(`${BASE_URL}/shopping/flow`, { waitUntil: "domcontentloaded" });
    await stabilize(page);

    await expect(page.getByTestId("shopping-multi-meal-hint").first()).toHaveText(
      "같은 재료는 자동으로 합산돼요. 여러 끼니를 한 번에 장보기할 수 있어요.",
      { timeout: 15_000 },
    );
  });

  test("captures design authority evidence", async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chrome",
      "evidence capture is deterministic in one project only",
    );
    await mkdir(EVIDENCE_DIR, { recursive: true });

    const mobile390 = await openMypage(browser, { width: 390, height: 844 });
    await mobile390.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "mobile-390.png"),
    });
    await mobile390.context.close();

    const mobile320 = await openMypage(browser, { width: 320, height: 568 });
    await showToastStack(mobile320.page);
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
    await desktop.page.getByRole("button", { name: "알림 보기" }).click();
    const desktopArchive = desktop.page.getByRole("dialog", { name: "알림 기록" });
    await expect(desktopArchive).toBeVisible();
    await desktopArchive.screenshot({
      path: path.join(EVIDENCE_DIR, "archive-modal.png"),
    });
    await desktop.context.close();

    const archiveEmpty = await openMypage(browser, { width: 390, height: 844 }, { archiveEmpty: true });
    await archiveEmpty.page.getByRole("button", { name: "알림 보기" }).click();
    const emptyArchive = archiveEmpty.page.getByRole("dialog", { name: "알림 기록" });
    await expect(emptyArchive.getByText("아직 표시할 알림 기록이 없어요.")).toBeVisible();
    await emptyArchive.screenshot({
      path: path.join(EVIDENCE_DIR, "archive-empty.png"),
    });
    await archiveEmpty.context.close();

    const toastMobile = await openMypage(browser, { width: 390, height: 844 });
    await showToastStack(toastMobile.page);
    await toastMobile.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "toast-stack-mobile.png"),
    });
    await toastMobile.context.close();

    const toastDesktop = await openMypage(browser, { width: 1440, height: 960 });
    await showToastStack(toastDesktop.page);
    await toastDesktop.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "toast-stack-desktop.png"),
    });
    await toastDesktop.context.close();

    const levelup = await openMypage(browser, { width: 390, height: 844 }, {
      notifications: [priorityNotifications[0], priorityNotifications[3]],
    });
    await showToastStack(levelup.page);
    await levelup.page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "toast-levelup.png"),
    });
    await levelup.context.close();

    const shoppingContext = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: 390, height: 844 },
    });
    const shoppingPage = await shoppingContext.newPage();
    await setAuthOverride(shoppingPage);
    await installShoppingRoutes(shoppingPage);
    await shoppingPage.goto(`${BASE_URL}/shopping/flow`, { waitUntil: "domcontentloaded" });
    await stabilize(shoppingPage);
    await expect(shoppingPage.getByTestId("shopping-multi-meal-hint").first()).toBeVisible({
      timeout: 15_000,
    });
    await shoppingPage.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "shopping-copy.png"),
    });
    await shoppingContext.close();
  });
});
