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
