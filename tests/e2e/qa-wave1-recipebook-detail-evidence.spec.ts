import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/wave1-port-recipebook-detail-core",
);

const viewports = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
} as const;

const recipeItems = [
  {
    recipe_id: "recipe-rice",
    title: "김치볶음밥",
    thumbnail_url: null,
    tags: ["조회 5,036", "15분", "1인분"],
    added_at: "2026-04-30T09:00:00.000Z",
  },
  {
    recipe_id: "recipe-salad",
    title: "닭가슴살 샐러드",
    thumbnail_url: null,
    tags: ["조회 3,357", "10분", "1인분"],
    added_at: "2026-04-29T09:00:00.000Z",
  },
  {
    recipe_id: "recipe-pork",
    title: "제육볶음",
    thumbnail_url: null,
    tags: ["조회 1.2만", "20분", "2인분"],
    added_at: "2026-04-28T09:00:00.000Z",
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
  await page.route("**/api/v1/recipe-books/*/recipes**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          success: true,
          data: {
            items: recipeItems,
            next_cursor: null,
            has_next: false,
          },
          error: null,
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: { deleted: true },
        error: null,
      },
    });
  });

  await page.route(
    (url) => /^\/api\/v1\/recipe-books\/[^/]+$/.test(url.pathname),
    async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: { deleted: true },
          error: null,
        },
      });
    },
  );
}

async function capture(
  browser: Browser,
  viewport: { width: number; height: number },
  filename: string,
  prepareSurface: (page: Page) => Promise<void>,
) {
  const { context, page } = await preparePage(browser, viewport);
  await setAuthOverride(page);
  await installRoutes(page);
  const bookName = encodeURIComponent("평일 저녁 빠른요리");
  await page.goto(
    `${BASE_URL}/mypage/recipe-books/book-custom?type=custom&name=${bookName}`,
  );
  await stabilize(page);
  await prepareSurface(page);
  await page.screenshot({
    fullPage: false,
    path: path.join(EVIDENCE_DIR, filename),
  });
  await context.close();
}

test("capture Wave1 recipebook detail authority evidence", async ({
  browser,
}) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  await capture(
    browser,
    viewports.mobile,
    "recipebook-detail-default.png",
    async (page) => {
      await expect(page.getByTestId("recipebook-detail-mobile")).toBeVisible();
      await expect(page.getByText("김치볶음밥")).toBeVisible();
      await expect(
        page.getByLabel("평일 저녁 빠른요리 옵션 메뉴"),
      ).toBeVisible();
    },
  );

  await capture(
    browser,
    viewports.narrow,
    "recipebook-detail-narrow.png",
    async (page) => {
      await expect(page.getByTestId("recipebook-detail-mobile")).toBeVisible();
      await expect(page.getByText("제육볶음")).toBeVisible();
    },
  );

  await capture(
    browser,
    viewports.mobile,
    "recipebook-delete-confirm-default.png",
    async (page) => {
      await page.getByLabel("평일 저녁 빠른요리 옵션 메뉴").click();
      await page.getByRole("menuitem", { name: "삭제" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page.getByText("이 레시피북을 삭제할까요?")).toBeVisible();
    },
  );

  await capture(
    browser,
    viewports.narrow,
    "recipebook-delete-confirm-narrow.png",
    async (page) => {
      await page.getByLabel("평일 저녁 빠른요리 옵션 메뉴").click();
      await page.getByRole("menuitem", { name: "삭제" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page.getByRole("button", { name: "삭제하기" })).toBeVisible();
    },
  );
});
