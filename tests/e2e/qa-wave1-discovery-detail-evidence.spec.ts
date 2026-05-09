import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  installDiscoveryRoutes,
  installRecipeDetailRoutes,
  RECIPE_PATH,
} from "./helpers/mock-routes";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/wave1-port-discovery-detail",
);

const viewports = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
} as const;

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

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      sameSite: "Lax",
      url: BASE_URL,
      value,
    },
  ]);
  await page.addInitScript(
    ({ key, state }: { key: string; state: string }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

async function installRecipeBookRoutes(page: Page) {
  await page.route("**/api/v1/recipe-books", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          books: [
            {
              book_type: "saved",
              id: "book-saved",
              name: "저장한 레시피",
              recipe_count: 3,
              sort_order: 0,
            },
            {
              book_type: "custom",
              id: "book-custom",
              name: "주말 파티",
              recipe_count: 1,
              sort_order: 1,
            },
          ],
        },
        error: null,
      },
    });
  });
}

test("capture Wave1 discovery/detail authority evidence", async ({ browser }) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await installDiscoveryRoutes(page);
    await page.goto(`${BASE_URL}/`);
    await expect(page.getByPlaceholder("김치볶음밥, 된장찌개...")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "home-mobile-default.png"),
    });

    await page.getByRole("button", { name: /정렬 기준/i }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "home-sort-dropdown-open.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await installDiscoveryRoutes(page);
    await page.goto(`${BASE_URL}/`);
    await expect(page.getByPlaceholder("김치볶음밥, 된장찌개...")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "home-mobile-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await installRecipeDetailRoutes(page);
    await page.goto(`${BASE_URL}${RECIPE_PATH}`);
    await expect(page.getByRole("heading", { name: "집밥 김치찌개" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "recipe-detail-mobile-default.png"),
    });
    await page.locator(".recipe-overview-metrics-compact").screenshot({
      path: path.join(EVIDENCE_DIR, "recipe-detail-hero-stats.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await installRecipeDetailRoutes(page);
    await page.goto(`${BASE_URL}${RECIPE_PATH}`);
    await expect(page.getByRole("heading", { name: "집밥 김치찌개" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "recipe-detail-mobile-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page, "authenticated");
    await installRecipeDetailRoutes(page);
    await installRecipeBookRoutes(page);
    await page.goto(`${BASE_URL}${RECIPE_PATH}`);
    await page.getByRole("button", { name: "저장" }).click();
    const dialog = page.getByRole("dialog", { name: "레시피 저장" });
    await expect(dialog).toBeVisible();
    await stabilize(page);
    await dialog.screenshot({
      path: path.join(EVIDENCE_DIR, "save-modal.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await page.goto(`${BASE_URL}/login`);
    const googleLoginButton = page.getByRole("button", { name: "Google로 시작하기" });
    await expect(googleLoginButton).toBeVisible();
    await googleLoginButton.scrollIntoViewIfNeeded();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "login-screen.png"),
    });
    await context.close();
  }
});
