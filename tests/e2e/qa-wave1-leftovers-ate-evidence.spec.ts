import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/wave1-port-leftovers-ate-core",
);

const viewports = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
} as const;

const leftoverItems = [
  {
    id: "ld-1",
    recipe_id: "recipe-1",
    recipe_title: "된장찌개",
    recipe_thumbnail_url: null,
    status: "leftover",
    cooked_at: "2026-04-20T10:00:00.000Z",
    eaten_at: null,
    cooking_servings: 2,
    source_meal_label: "저녁",
    source_planned_servings: 2,
  },
  {
    id: "ld-2",
    recipe_id: "recipe-2",
    recipe_title: "김치볶음밥",
    recipe_thumbnail_url: null,
    status: "leftover",
    cooked_at: "2026-04-21T10:00:00.000Z",
    eaten_at: null,
    cooking_servings: 1,
    source_meal_label: "점심",
    source_planned_servings: 1,
  },
];

const eatenItems = [
  {
    id: "ld-3",
    recipe_id: "recipe-1",
    recipe_title: "된장찌개",
    recipe_thumbnail_url: null,
    status: "eaten",
    cooked_at: "2026-04-20T10:00:00.000Z",
    eaten_at: "2026-04-22T12:00:00.000Z",
    cooking_servings: 2,
    source_meal_label: "저녁",
    source_planned_servings: 2,
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

  await page.route("**/api/v1/planner?*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: [
            { id: "col-1", name: "아침", sort_order: 0 },
            { id: "col-2", name: "점심", sort_order: 1 },
            { id: "col-3", name: "저녁", sort_order: 2 },
          ],
          meals: [],
        },
        error: null,
      },
    });
  });
}

async function capture(
  browser: Browser,
  viewport: { width: number; height: number },
  routePath: string,
  filename: string,
  prepareSurface: (page: Page) => Promise<void>,
) {
  const { context, page } = await preparePage(browser, viewport);
  await setAuthOverride(page);
  await installRoutes(page);
  await page.goto(`${BASE_URL}${routePath}`);
  await stabilize(page);
  await prepareSurface(page);
  await page.screenshot({
    fullPage: false,
    path: path.join(EVIDENCE_DIR, filename),
  });
  await context.close();
}

test("capture Wave1 leftovers and ate-list authority evidence", async ({
  browser,
}) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  await capture(browser, viewports.mobile, "/leftovers", "leftovers-default.png", async (page) => {
    await expect(page.getByRole("heading", { exact: true, name: "남은 요리" })).toBeVisible();
    await expect(page.getByText("된장찌개")).toBeVisible();
    await expect(page.getByRole("button", { name: /다먹음/ }).first()).toBeVisible();
  });

  await capture(browser, viewports.narrow, "/leftovers", "leftovers-narrow.png", async (page) => {
    await expect(page.getByRole("heading", { exact: true, name: "남은 요리" })).toBeVisible();
    await expect(page.getByText("김치볶음밥")).toBeVisible();
    await expect(page.getByRole("button", { name: /플래너에 추가/ }).first()).toBeVisible();
  });

  await capture(browser, viewports.mobile, "/leftovers/ate", "ate-list-default.png", async (page) => {
    await expect(page.getByRole("heading", { exact: true, name: "다먹은 요리" })).toBeVisible();
    await expect(page.getByText("된장찌개")).toBeVisible();
    await expect(page.getByRole("button", { name: "남은 요리로 복귀" })).toBeVisible();
    await expect(page.getByText("다먹음으로 기록")).toHaveCount(0);
  });

  await capture(browser, viewports.narrow, "/leftovers/ate", "ate-list-narrow.png", async (page) => {
    await expect(page.getByRole("heading", { exact: true, name: "다먹은 요리" })).toBeVisible();
    await expect(page.getByTestId("ate-list-card").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "남은 요리로 복귀" })).toBeVisible();
    await expect(page.getByText("다먹음으로 기록")).toHaveCount(0);
  });
});
