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

  const mobileListPage = await page.context().newPage();
  await setE2EAuthOverride(mobileListPage);
  await installAccountLibraryVisualRoutes(mobileListPage);
  await mobileListPage.setViewportSize(viewports.mobile);
  await mobileListPage.goto(`${MYPAGE_VISUAL_PATH}?tab=recipebooks`);
  await expect(mobileListPage.getByTestId("recipebook-tab")).toBeVisible();
  await expect(mobileListPage.getByText("나의 레시피북")).toBeVisible();
  await expect(mobileListPage.getByTestId("mobile-book-cover-book-custom")).toBeVisible();
  await capture(mobileListPage, "mypage-bookshelf-mobile-390.png");
  await mobileListPage.close();

  const mobileDetailPage = await page.context().newPage();
  await setE2EAuthOverride(mobileDetailPage);
  await installAccountLibraryVisualRoutes(mobileDetailPage);
  await mobileDetailPage.setViewportSize(viewports.mobile);
  await mobileDetailPage.goto(RECIPEBOOK_DETAIL_VISUAL_PATH);
  await expect(mobileDetailPage.getByTestId("recipebook-detail-mobile")).toBeVisible();
  await expect(mobileDetailPage.getByRole("heading", { name: "목차" })).toBeVisible();
  await expect(mobileDetailPage.getByTestId("recipebook-detail-header")).toContainText("주말 파티");
  await expect(mobileDetailPage.getByTestId("recipe-item-recipe-doenjang")).toBeVisible();
  await expectTapTarget(mobileDetailPage.getByLabel("뒤로 가기"));
  const mobileToc = mobileDetailPage.getByRole("navigation", { name: /목차/ });
  const firstTocButton = mobileToc.getByRole("button", { name: /된장찌개/ });
  await expectTapTarget(firstTocButton);
  await firstTocButton.click();
  const appBarBox = await mobileDetailPage
    .getByTestId("recipebook-detail-mobile")
    .locator("> div")
    .first()
    .boundingBox();
  const targetBox = await mobileDetailPage
    .getByTestId("recipe-item-recipe-doenjang")
    .boundingBox();
  expect(appBarBox).toBeTruthy();
  expect(targetBox).toBeTruthy();
  expect(targetBox?.y ?? 0).toBeGreaterThanOrEqual(
    (appBarBox?.y ?? 0) + (appBarBox?.height ?? 0) - 1,
  );
  await capture(mobileDetailPage, "recipebook-detail-mobile-390.png");

  await mobileDetailPage.setViewportSize(viewports.narrow);
  await mobileDetailPage.goto("about:blank");
  await mobileDetailPage.goto(RECIPEBOOK_DETAIL_VISUAL_PATH);
  await expect(mobileDetailPage.getByTestId("recipebook-detail-mobile")).toBeVisible();
  await expect(mobileDetailPage.getByRole("heading", { name: "목차" })).toBeVisible();
  await expect(mobileDetailPage.getByTestId("recipe-item-recipe-doenjang")).toBeVisible();
  await expectTapTarget(mobileDetailPage.getByLabel("뒤로 가기"));
  await expectTapTarget(
    mobileDetailPage.getByRole("navigation", { name: /목차/ }).getByRole("button", {
      name: /된장찌개/,
    }),
  );
  await capture(mobileDetailPage, "recipebook-detail-mobile-320.png");
  await mobileDetailPage.close();

  const desktopDetailPage = await page.context().newPage();
  await setE2EAuthOverride(desktopDetailPage);
  await installAccountLibraryVisualRoutes(desktopDetailPage);
  await desktopDetailPage.setViewportSize(viewports.desktop);
  await desktopDetailPage.goto(RECIPEBOOK_DETAIL_VISUAL_PATH);
  await expect(desktopDetailPage.getByTestId("recipebook-open-book")).toBeVisible();
  await expect(desktopDetailPage.getByTestId("recipebook-detail-toc")).toBeVisible();
  await expect(desktopDetailPage.getByTestId("recipebook-detail-list")).toBeVisible();
  await expect(desktopDetailPage.getByTestId("recipe-item-recipe-doenjang")).toBeVisible();
  await expect(desktopDetailPage.getByRole("button", { name: "책" })).toHaveClass(/is-active/);
  await expect(desktopDetailPage.getByRole("button", { name: "목록" })).toBeVisible();
  await expect(
    desktopDetailPage.getByRole("group", { name: "페이지 선택" }).getByRole("button", {
      name: "01쪽",
    }),
  ).toHaveClass(/is-active/);
  await expect(desktopDetailPage.getByTestId("recipe-item-recipe-doenjang")).toContainText("재료");
  await expect(desktopDetailPage.getByTestId("recipe-item-recipe-doenjang")).toContainText("만들기");
  const bookBox = await desktopDetailPage.getByTestId("recipebook-open-book").boundingBox();
  const tocBox = await desktopDetailPage.getByTestId("recipebook-detail-toc").boundingBox();
  const listBox = await desktopDetailPage.getByTestId("recipebook-detail-list").boundingBox();
  expect(bookBox).toBeTruthy();
  expect(tocBox).toBeTruthy();
  expect(listBox).toBeTruthy();
  expect(bookBox?.width ?? 0).toBeGreaterThanOrEqual(1120);
  expect(tocBox?.x ?? 0).toBeLessThan(listBox?.x ?? 0);
  expect(listBox?.width ?? 0).toBeGreaterThanOrEqual(680);
  await capture(desktopDetailPage, "recipebook-detail-desktop-1440.png");
  await desktopDetailPage.close();
});
