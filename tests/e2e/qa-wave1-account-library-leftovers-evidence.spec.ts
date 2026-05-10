import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/wave1-port-account-library-leftovers",
);

const viewports = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
} as const;

const profile = {
  id: "user-1",
  nickname: "집밥러",
  email: "user@example.com",
  profile_image_url: null,
  social_provider: "kakao",
  settings: { screen_wake_lock: false },
};

const books = [
  {
    id: "book-my",
    name: "내가 추가한 레시피",
    book_type: "my_added",
    recipe_count: 3,
    sort_order: 0,
  },
  {
    id: "book-saved",
    name: "저장한 레시피",
    book_type: "saved",
    recipe_count: 5,
    sort_order: 1,
  },
  {
    id: "book-liked",
    name: "좋아요한 레시피",
    book_type: "liked",
    recipe_count: 10,
    sort_order: 2,
  },
  {
    id: "book-custom",
    name: "주말 파티",
    book_type: "custom",
    recipe_count: 2,
    sort_order: 3,
  },
];

const shoppingHistory = [
  {
    id: "list-1",
    title: "4/30 장보기",
    date_range_start: "2026-04-30",
    date_range_end: "2026-05-06",
    is_completed: true,
    item_count: 12,
    created_at: "2026-04-30T00:00:00.000Z",
  },
];

const plannerColumns = [
  { id: "col-1", name: "아침", sort_order: 0 },
  { id: "col-2", name: "점심", sort_order: 1 },
  { id: "col-3", name: "저녁", sort_order: 2 },
];

const leftoverItems = [
  {
    id: "ld-1",
    recipe_id: "recipe-1",
    recipe_title: "김치찌개",
    recipe_thumbnail_url: null,
    status: "leftover",
    cooked_at: "2026-04-28T10:00:00.000Z",
    eaten_at: null,
  },
  {
    id: "ld-2",
    recipe_id: "recipe-2",
    recipe_title: "된장찌개",
    recipe_thumbnail_url: null,
    status: "leftover",
    cooked_at: "2026-04-27T10:00:00.000Z",
    eaten_at: null,
  },
];

const eatenItems = [
  {
    id: "ld-3",
    recipe_id: "recipe-3",
    recipe_title: "볶음밥",
    recipe_thumbnail_url: null,
    status: "eaten",
    cooked_at: "2026-04-26T10:00:00.000Z",
    eaten_at: "2026-04-28T12:00:00.000Z",
  },
];

const bookRecipes = [
  {
    recipe_id: "recipe-1",
    title: "된장찌개",
    thumbnail_url: null,
    tags: ["한식", "찌개"],
    added_at: "2026-04-30T09:00:00.000Z",
  },
  {
    recipe_id: "recipe-2",
    title: "김치볶음밥",
    thumbnail_url: null,
    tags: ["한식"],
    added_at: "2026-04-29T09:00:00.000Z",
  },
];

async function preparePage(
  browser: Browser,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
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

  await page.route((url) => url.pathname === "/api/v1/recipe-books", async (route) => {
    await route.fulfill({
      json: { success: true, data: { books }, error: null },
    });
  });

  await page.route("**/api/v1/shopping/lists**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { items: shoppingHistory, next_cursor: null, has_next: false },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/planner/columns", async (route) => {
    await route.fulfill({
      json: { success: true, data: { columns: plannerColumns }, error: null },
    });
  });

  await page.route("**/api/v1/leftovers?*", async (route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get("status") ?? "leftover";
    await route.fulfill({
      json: {
        success: true,
        data: { items: status === "eaten" ? eatenItems : leftoverItems },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipe-books/*/recipes**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { items: bookRecipes, next_cursor: null, has_next: false },
        error: null,
      },
    });
  });
}

async function capture(
  browser: Browser,
  viewport: { width: number; height: number },
  routePath: string,
  assertReady: (page: Page) => Promise<void>,
  filename: string,
) {
  const { context, page } = await preparePage(browser, viewport);
  await setAuthOverride(page);
  await installRoutes(page);
  await page.goto(`${BASE_URL}${routePath}`);
  await assertReady(page);
  await stabilize(page);
  await page.screenshot({
    fullPage: false,
    path: path.join(EVIDENCE_DIR, filename),
  });
  await context.close();
}

test("capture Wave1 account/library/leftovers authority evidence", async ({
  browser,
}) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  await capture(
    browser,
    viewports.mobile,
    "/mypage",
    async (page) => {
      await expect(page.getByTestId("mypage-settings-link")).toBeVisible();
      await expect(page.getByText("주말 파티")).toBeVisible();
    },
    "mypage-default.png",
  );

  await capture(
    browser,
    viewports.narrow,
    "/mypage",
    async (page) => {
      await expect(page.getByTestId("mypage-settings-link")).toBeVisible();
      await expect(page.getByText("주말 파티")).toBeVisible();
    },
    "mypage-narrow.png",
  );

  await capture(
    browser,
    viewports.mobile,
    "/settings",
    async (page) => {
      await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
      await expect(page.getByText("회원탈퇴")).toBeVisible();
    },
    "settings-default.png",
  );

  await capture(
    browser,
    viewports.narrow,
    "/settings",
    async (page) => {
      await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
      await expect(page.getByText("회원탈퇴")).toBeVisible();
    },
    "settings-narrow.png",
  );

  await capture(
    browser,
    viewports.mobile,
    "/leftovers",
    async (page) => {
      await expect(page.getByRole("button", { name: "다 먹었어요" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "식단에 추가" }).first()).toBeVisible();
    },
    "leftovers-default.png",
  );

  await capture(
    browser,
    viewports.narrow,
    "/leftovers",
    async (page) => {
      await expect(page.getByRole("button", { name: "다 먹었어요" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "식단에 추가" }).first()).toBeVisible();
    },
    "leftovers-narrow.png",
  );

  await capture(
    browser,
    viewports.mobile,
    "/leftovers/ate",
    async (page) => {
      await expect(page.getByRole("button", { name: "남은요리로 복귀" })).toBeVisible();
      await expect(page.getByText("4월 28일")).toBeVisible();
    },
    "ate-list-default.png",
  );

  await capture(
    browser,
    viewports.narrow,
    "/leftovers/ate",
    async (page) => {
      await expect(page.getByRole("button", { name: "남은요리로 복귀" })).toBeVisible();
      await expect(page.getByText("4월 28일")).toBeVisible();
    },
    "ate-list-narrow.png",
  );

  const bookDetailPath = "/mypage/recipe-books/book-custom?type=custom&name=%EC%A3%BC%EB%A7%90%20%ED%8C%8C%ED%8B%B0";

  await capture(
    browser,
    viewports.mobile,
    bookDetailPath,
    async (page) => {
      await expect(page.getByText("된장찌개")).toBeVisible();
      await expect(page.getByLabel("주말 파티 옵션 메뉴")).toBeVisible();
    },
    "recipebook-detail-default.png",
  );

  await capture(
    browser,
    viewports.narrow,
    bookDetailPath,
    async (page) => {
      await expect(page.getByText("된장찌개")).toBeVisible();
      await expect(page.getByLabel("주말 파티 옵션 메뉴")).toBeVisible();
    },
    "recipebook-detail-narrow.png",
  );
});
