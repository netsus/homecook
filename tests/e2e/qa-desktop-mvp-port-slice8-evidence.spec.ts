import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  ATE_LIST_VISUAL_PATH,
  installLeftoversVisualRoutes,
  LEFTOVERS_VISUAL_PATH,
  setE2EAuthOverride,
} from "./helpers/mock-routes";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/desktop-mvp-porting/slice8/screenshots",
);

const viewports = {
  desktop1024: { width: 1024, height: 768 },
  desktop1280: { width: 1280, height: 900 },
  desktop1440: { width: 1440, height: 960 },
} as const;

async function preparePage(
  browser: Browser,
  viewport: { width: number; height: number },
  empty = false,
) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport,
  });
  const page = await context.newPage();
  await setE2EAuthOverride(page);
  await installLeftoversVisualRoutes(
    page,
    empty ? { ateItems: [], leftoverItems: [] } : {},
  );
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
  { empty = false }: { empty?: boolean } = {},
) {
  const { context, page } = await preparePage(
    browser,
    viewports[viewportName],
    empty,
  );
  await page.goto(`${BASE_URL}${routePath}`);
  await assertReady(page);
  await stabilize(page);
  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE_DIR, filename),
  });
  await context.close();
}

test("capture Slice 8 desktop leftovers prototype-port evidence", async ({ browser }) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  for (const viewportName of Object.keys(viewports) as Array<keyof typeof viewports>) {
    const width = viewports[viewportName].width;

    await capture(
      browser,
      viewportName,
      `leftovers-${width}.png`,
      LEFTOVERS_VISUAL_PATH,
      async (page) => {
        await expect(page.getByRole("heading", { name: "남은 요리" })).toBeVisible();
        await expect(page.getByTestId("leftover-list")).toBeVisible();
      },
    );

    await capture(
      browser,
      viewportName,
      `ate-list-${width}.png`,
      ATE_LIST_VISUAL_PATH,
      async (page) => {
        await expect(page.getByRole("heading", { name: "다먹은 목록" })).toBeVisible();
        await expect(page.getByTestId("ate-item-list")).toBeVisible();
      },
    );
  }

  await capture(
    browser,
    "desktop1280",
    "leftovers-empty-1280.png",
    LEFTOVERS_VISUAL_PATH,
    async (page) => {
      await expect(page.getByText("남은 요리가 없어요")).toBeVisible();
    },
    { empty: true },
  );

  await capture(
    browser,
    "desktop1280",
    "ate-list-empty-1280.png",
    ATE_LIST_VISUAL_PATH,
    async (page) => {
      await expect(page.getByText("아직 다먹은 요리가 없어요")).toBeVisible();
    },
    { empty: true },
  );
});
