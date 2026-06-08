import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/wave1-port-mypage-core",
);

const viewports = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
} as const;

const profile = {
  id: "user-1",
  nickname: "채실장",
  email: "user@example.com",
  profile_image_url: null,
  social_provider: "kakao",
  settings: { screen_wake_lock: false },
};

const books = [
  {
    id: "book-saved",
    name: "저장한 레시피",
    book_type: "saved",
    recipe_count: 8,
    sort_order: 0,
  },
  {
    id: "book-custom-1",
    name: "평일 저녁 빠른요리",
    book_type: "custom",
    recipe_count: 12,
    sort_order: 1,
  },
  {
    id: "book-custom-2",
    name: "주말 한 상 차림",
    book_type: "custom",
    recipe_count: 5,
    sort_order: 2,
  },
];

const recipeCover =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect width='300' height='200' fill='%2300A1FF'/%3E%3Ccircle cx='86' cy='92' r='42' fill='%23FFFFFF' opacity='.86'/%3E%3Crect x='132' y='64' width='98' height='72' rx='18' fill='%23FFFFFF' opacity='.72'/%3E%3C/svg%3E";

const recipeItems = [
  {
    added_at: "2026-05-04T09:00:00.000Z",
    recipe_id: "recipe-saved-1",
    tags: ["한식", "찌개"],
    thumbnail_url: recipeCover,
    title: "된장찌개",
  },
  {
    added_at: "2026-05-03T09:00:00.000Z",
    recipe_id: "recipe-saved-2",
    tags: ["반찬"],
    thumbnail_url: recipeCover,
    title: "두부조림",
  },
];

const plannerColumns = [
  { id: "breakfast", name: "아침", sort_order: 0 },
  { id: "lunch", name: "점심", sort_order: 1 },
  { id: "dinner", name: "저녁", sort_order: 2 },
];

const plannerMeals = [
  {
    id: "meal-1",
    recipe_id: "recipe-1",
    recipe_thumbnail_url: null,
    recipe_title: "된장찌개",
    plan_date: "2026-05-04",
    column_id: "dinner",
    planned_servings: 2,
    status: "registered",
    is_leftover: false,
  },
  {
    id: "meal-2",
    recipe_id: "recipe-2",
    recipe_thumbnail_url: null,
    recipe_title: "두부조림",
    plan_date: "2026-05-05",
    column_id: "dinner",
    planned_servings: 2,
    status: "registered",
    is_leftover: false,
  },
  {
    id: "meal-3",
    recipe_id: "recipe-3",
    recipe_thumbnail_url: null,
    recipe_title: "김치볶음밥",
    plan_date: "2026-05-06",
    column_id: "lunch",
    planned_servings: 1,
    status: "shopping_done",
    is_leftover: false,
  },
  {
    id: "meal-4",
    recipe_id: "recipe-4",
    recipe_thumbnail_url: null,
    recipe_title: "감자조림",
    plan_date: "2026-05-07",
    column_id: "dinner",
    planned_servings: 2,
    status: "cook_done",
    is_leftover: false,
  },
];

const shoppingHistory = [
  {
    id: "list-current",
    title: "이번 주 평일 저녁",
    date_range_start: "2026-05-04",
    date_range_end: "2026-05-08",
    is_completed: false,
    item_count: 5,
    created_at: "2026-05-04T00:00:00.000Z",
  },
  {
    id: "list-last-week",
    title: "지난주 장보기",
    date_range_start: "2026-04-27",
    date_range_end: "2026-05-01",
    is_completed: true,
    item_count: 3,
    created_at: "2026-04-27T00:00:00.000Z",
  },
];

async function preparePage(
  browser: Browser,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport,
  });
  const page = await context.newPage();
  return { context, page };
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

async function installRoutes(page: Page) {
  await page.route("**/api/v1/users/me", async (route) => {
    await route.fulfill({
      json: { success: true, data: profile, error: null },
    });
  });

  await page.route("**/api/v1/recipe-books", async (route) => {
    await route.fulfill({
      json: { success: true, data: { books }, error: null },
    });
  });

  await page.route("**/api/v1/recipe-books/*/recipes**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          has_next: false,
          items: recipeItems,
          next_cursor: null,
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/planner**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/v1/planner") {
      await route.fulfill({
        json: {
          success: true,
          data: { columns: plannerColumns, meals: plannerMeals },
          error: null,
        },
      });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/v1/shopping/lists**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          has_next: false,
          items: shoppingHistory,
          next_cursor: null,
        },
        error: null,
      },
    });
  });
}

async function capture(
  browser: Browser,
  viewport: { width: number; height: number },
  filename: string,
  prepareSurface?: (page: Page) => Promise<void>,
) {
  const { context, page } = await preparePage(browser, viewport);
  await setAuthOverride(page);
  await installRoutes(page);
  await page.goto(`${BASE_URL}/mypage`);
  await expect(page.getByText("채실장")).toBeVisible();
  await prepareSurface?.(page);
  await stabilize(page);
  await page.screenshot({
    fullPage: false,
    path: path.join(EVIDENCE_DIR, filename),
  });
  await context.close();
}

test("capture Wave1 mypage core authority evidence", async ({ browser }) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  await capture(browser, viewports.mobile, "mypage-default.png");
  await capture(browser, viewports.narrow, "mypage-narrow.png");

  await capture(
    browser,
    viewports.mobile,
    "mypage-recipebook-tab.png",
    async (page) => {
      await page.getByRole("button", { name: /레시피북/ }).click();
      await expect(page.getByRole("heading", { name: "레시피북" })).toBeVisible();
      await expect(page.getByText("평일 저녁 빠른요리")).toBeVisible();
    },
  );

  await capture(
    browser,
    viewports.narrow,
    "mypage-recipebook-tab-narrow.png",
    async (page) => {
      await page.getByRole("button", { name: /레시피북/ }).click();
      await expect(page.getByRole("heading", { name: "레시피북" })).toBeVisible();
      await expect(page.getByText("평일 저녁 빠른요리")).toBeVisible();
    },
  );

  await capture(
    browser,
    viewports.mobile,
    "mypage-shopping-lists-tab.png",
    async (page) => {
      await page.getByRole("button", { name: /장보기 기록/ }).click();
      await expect(page.getByRole("heading", { name: "장보기 기록" })).toBeVisible();
      await expect(page.getByText("이번 주 평일 저녁")).toBeVisible();
    },
  );

  await capture(
    browser,
    viewports.narrow,
    "mypage-shopping-lists-tab-narrow.png",
    async (page) => {
      await page.getByRole("button", { name: /장보기 기록/ }).click();
      await expect(page.getByRole("heading", { name: "장보기 기록" })).toBeVisible();
      await expect(page.getByText("이번 주 평일 저녁")).toBeVisible();
    },
  );
});
