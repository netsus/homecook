import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  COOK_MODE_VISUAL_PATH,
  COOK_READY_VISUAL_PATH,
  installCookingVisualRoutes,
  setE2EAuthOverride,
  STANDALONE_COOK_MODE_VISUAL_PATH,
} from "./helpers/mock-routes";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/desktop-mvp-porting/slice7/screenshots",
);

const viewports = {
  desktop1024: { width: 1024, height: 768 },
  desktop1280: { width: 1280, height: 900 },
  desktop1440: { width: 1440, height: 960 },
} as const;

async function preparePage(
  browser: Browser,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport,
  });
  const page = await context.newPage();
  await setE2EAuthOverride(page);
  await installCookingVisualRoutes(page);
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

async function capture(
  browser: Browser,
  viewportName: keyof typeof viewports,
  filename: string,
  routePath: string,
  assertReady: (page: Page) => Promise<void>,
  {
    fullPage = true,
  }: {
    fullPage?: boolean;
  } = {},
) {
  const { context, page } = await preparePage(browser, viewports[viewportName]);
  await page.goto(`${BASE_URL}${routePath}`);
  await assertReady(page);
  await stabilize(page);
  await page.screenshot({
    fullPage,
    path: path.join(EVIDENCE_DIR, filename),
  });
  await context.close();
}

test("capture Slice 7 desktop cooking prototype-port evidence", async ({ browser }) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  for (const viewportName of Object.keys(viewports) as Array<keyof typeof viewports>) {
    const width = viewports[viewportName].width;

    await capture(
      browser,
      viewportName,
      `cook-ready-list-${width}.png`,
      COOK_READY_VISUAL_PATH,
      async (page) => {
        await expect(page.getByRole("heading", { name: "요리 준비" })).toBeVisible();
        await expect(page.getByTestId("cook-ready-recipe-list")).toBeVisible();
      },
    );

    await capture(
      browser,
      viewportName,
      `cook-mode-planner-${width}.png`,
      COOK_MODE_VISUAL_PATH,
      async (page) => {
        await expect(page.getByTestId("cook-mode-title")).toHaveText("김치볶음밥");
        await expect(page.getByTestId("ingredient-list")).toBeVisible();
      },
    );

    await capture(
      browser,
      viewportName,
      `cook-mode-standalone-${width}.png`,
      STANDALONE_COOK_MODE_VISUAL_PATH,
      async (page) => {
        await expect(page.getByTestId("standalone-cook-mode-title")).toHaveText(
          "김치볶음밥",
        );
        await expect(page.getByText(/플래너 끼니와 연결되지 않아요/)).toBeVisible();
      },
    );
  }

  await capture(
    browser,
    "desktop1280",
    "cook-notice-modal-1280.png",
    COOK_READY_VISUAL_PATH,
    async (page) => {
      await page.getByRole("button", { name: "요리모드 안내" }).click();
      await expect(
        page.getByRole("dialog", { name: "데스크탑 요리모드" }),
      ).toBeVisible();
    },
    { fullPage: false },
  );
});
