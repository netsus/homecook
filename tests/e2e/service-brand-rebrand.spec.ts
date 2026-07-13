import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  installAccountLibraryVisualRoutes,
  installDiscoveryRoutes,
  setE2EAuthOverride,
} from "./helpers/mock-routes";

async function openPage(
  browser: Browser,
  viewport: { height: number; width: number },
) {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  return { context, page };
}

async function stabilize(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
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

async function assertNoPageOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBe(0);
}

test("checks canonical brand surfaces without changing HOME geometry", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "one deterministic evidence pass");

  for (const viewport of [
    { height: 844, width: 390 },
    { height: 568, width: 320 },
  ]) {
    const { context, page } = await openPage(browser, viewport);
    await installDiscoveryRoutes(page);
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        exact: true,
        name: "무먹, 무엇을 먹든",
      }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "무먹 둘러보기" })).toBeVisible();
    await expect(page.getByRole("link", { name: "무먹 가이드 보기" })).toBeVisible();
    await expect(page.getByText("무먹 추천").first()).toBeVisible();
    await assertNoPageOverflow(page);
    await stabilize(page);
    await context.close();
  }

  const guideOnly = await openPage(browser, { height: 568, width: 320 });
  await installDiscoveryRoutes(guideOnly.page);
  await guideOnly.page.unroute("**/api/v1/recipes/themes");
  await guideOnly.page.route("**/api/v1/recipes/themes", async (route) => {
    await route.fulfill({
      json: { success: true, data: { themes: [] }, error: null },
    });
  });
  await guideOnly.page.goto("/");
  const guideRail = guideOnly.page.getByRole("region", { name: "무먹 둘러보기" });
  await expect(guideRail.getByRole("link", { name: "무먹 가이드 보기" })).toBeVisible();
  await expect(guideRail.getByRole("button")).toHaveCount(0);
  await assertNoPageOverflow(guideOnly.page);
  await stabilize(guideOnly.page);
  await guideOnly.context.close();

  const about = await openPage(browser, { height: 900, width: 1280 });
  await about.page.goto("/about");
  await expect(about.page).toHaveTitle("무먹 가이드 | 무엇을 먹든");
  await expect(
    about.page.getByRole("heading", {
      level: 1,
      name: "무엇을 먹든, 계획은 한곳에서",
    }),
  ).toBeVisible();
  await expect(about.page.getByRole("link", { name: "무먹 가이드" })).toBeVisible();
  await expect(about.page.getByText("WHY IT WORKS")).toBeVisible();
  await assertNoPageOverflow(about.page);
  await stabilize(about.page);
  await about.context.close();

  const account = await openPage(browser, { height: 844, width: 390 });
  await setE2EAuthOverride(account.page);
  await installAccountLibraryVisualRoutes(account.page);
  await account.page.goto("/mypage");
  await expect(account.page.getByText("집밥러").first()).toBeVisible();
  await account.page.getByRole("button", { name: "업적 보기" }).click();
  await expect(account.page.getByRole("dialog", { name: "업적 앨범" })).toBeVisible();
  await assertNoPageOverflow(account.page);
  await stabilize(account.page);
  await account.context.close();
});
