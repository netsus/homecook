import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  installAccountLibraryVisualRoutes,
  MYPAGE_VISUAL_PATH,
  RECIPEBOOK_DETAIL_VISUAL_PATH,
  setE2EAuthOverride,
} from "./helpers/mock-routes";

const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/recipebook-diary-port",
);

const viewports = {
  desktop: { width: 1440, height: 960 },
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
} as const;

async function stabilize(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(0, 0);
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

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));

  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

async function expectTapTarget(locator: Locator, minSize = 44) {
  const box = await locator.boundingBox();

  expect(box).toBeTruthy();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(minSize);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(minSize);
}

async function capture(
  page: Page,
  filename: string,
  options: { fullPage?: boolean } = {},
) {
  await stabilize(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    fullPage: options.fullPage ?? false,
    path: path.join(EVIDENCE_DIR, filename),
  });
}

test("capture recipebook diary service evidence", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "Evidence capture sets its own desktop/mobile viewport sizes and writes shared screenshot artifacts.",
  );

  await mkdir(EVIDENCE_DIR, { recursive: true });
  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);

  await page.setViewportSize(viewports.desktop);
  await page.goto(MYPAGE_VISUAL_PATH);
  await expect(page.getByText("집밥러")).toBeVisible();
  await page.getByRole("tab", { name: "레시피북" }).click();
  await expect(page.getByTestId("recipebook-tab")).toBeVisible();
  await expect(page.getByTestId("system-book-saved")).toBeVisible();
  await expect(page.getByTestId("custom-book-book-custom")).toBeVisible();
  await capture(page, "mypage-bookshelf-desktop-1440.png", { fullPage: true });

  await page.setViewportSize(viewports.mobile);
  await page.goto(RECIPEBOOK_DETAIL_VISUAL_PATH);
  await expect(page.getByTestId("recipebook-detail-mobile")).toBeVisible();
  await expect(page.getByTestId("recipebook-detail-header")).toContainText("목차");
  await expect(page.getByTestId("recipe-item-recipe-doenjang")).toBeVisible();
  await expectTapTarget(page.getByLabel("뒤로 가기"));
  const mobileToc = page.getByRole("navigation", { name: /목차/ });
  const firstTocLink = mobileToc.getByRole("link", { name: /된장찌개/ });
  await expectTapTarget(firstTocLink);
  await firstTocLink.click();
  const appBarBox = await page
    .getByTestId("recipebook-detail-mobile")
    .locator("> div")
    .first()
    .boundingBox();
  const targetBox = await page
    .getByTestId("recipe-item-recipe-doenjang")
    .boundingBox();
  expect(appBarBox).toBeTruthy();
  expect(targetBox).toBeTruthy();
  expect(targetBox?.y ?? 0).toBeGreaterThanOrEqual(
    (appBarBox?.y ?? 0) + (appBarBox?.height ?? 0) - 1,
  );
  await capture(page, "recipebook-detail-mobile-390.png");

  await page.setViewportSize(viewports.narrow);
  await page.goto(RECIPEBOOK_DETAIL_VISUAL_PATH);
  await expect(page.getByTestId("recipebook-detail-mobile")).toBeVisible();
  await expect(page.getByTestId("recipebook-detail-header")).toContainText("목차");
  await expect(page.getByTestId("recipe-item-recipe-doenjang")).toBeVisible();
  await expectTapTarget(page.getByLabel("뒤로 가기"));
  await expectTapTarget(page.getByRole("link", { name: /된장찌개/ }).first());
  await capture(page, "recipebook-detail-mobile-320.png");

  await page.setViewportSize(viewports.desktop);
  await page.goto(RECIPEBOOK_DETAIL_VISUAL_PATH);
  await expect(page.getByTestId("recipebook-detail-toc")).toBeVisible();
  await expect(page.getByTestId("recipebook-detail-list")).toBeVisible();
  await expect(page.getByTestId("recipe-item-recipe-doenjang")).toBeVisible();
  const listBox = await page.getByTestId("recipebook-detail-list").boundingBox();
  expect(listBox).toBeTruthy();
  expect(listBox?.width ?? 0).toBeGreaterThanOrEqual(680);
  await capture(page, "recipebook-detail-desktop-1440.png");
});
