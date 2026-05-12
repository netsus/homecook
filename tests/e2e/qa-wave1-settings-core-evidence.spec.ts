import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/wave1-port-settings-core",
);

const viewports = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
} as const;

const profile = {
  id: "user-1",
  nickname: "집밥러버",
  email: "user@homecook.app",
  profile_image_url: null,
  social_provider: "kakao",
  settings: { screen_wake_lock: true },
};

const plannerColumns = [
  { id: "col-1", name: "아침", sort_order: 0 },
  { id: "col-2", name: "점심", sort_order: 1 },
  { id: "col-3", name: "저녁", sort_order: 2 },
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
  await page.route("**/api/v1/users/me/settings", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { settings: profile.settings },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me", async (route) => {
    await route.fulfill({
      json: { success: true, data: profile, error: null },
    });
  });

  await page.route("**/api/v1/planner/columns", async (route) => {
    await route.fulfill({
      json: { success: true, data: { columns: plannerColumns }, error: null },
    });
  });

  await page.route("**/api/v1/auth/logout", async (route) => {
    await route.fulfill({
      json: { success: true, data: { logged_out: true }, error: null },
    });
  });
}

async function capture(
  browser: Browser,
  viewport: { width: number; height: number },
  filename: string,
  routePath: string,
  heading: string,
  prepareSurface?: (page: Page) => Promise<void>,
) {
  const { context, page } = await preparePage(browser, viewport);
  await setAuthOverride(page);
  await installRoutes(page);
  await page.goto(`${BASE_URL}${routePath}`);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await stabilize(page);
  await prepareSurface?.(page);
  await page.screenshot({
    fullPage: false,
    path: path.join(EVIDENCE_DIR, filename),
  });
  await context.close();
}

test("capture Wave1 settings and account authority evidence", async ({ browser }) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  await capture(browser, viewports.mobile, "settings-default.png", "/settings", "설정");
  await capture(browser, viewports.narrow, "settings-narrow.png", "/settings", "설정");

  await capture(
    browser,
    viewports.mobile,
    "account-default.png",
    "/settings?view=account",
    "계정 정보",
  );
  await capture(
    browser,
    viewports.narrow,
    "account-narrow.png",
    "/settings?view=account",
    "계정 정보",
  );

  await capture(
    browser,
    viewports.mobile,
    "nickname-edit-sheet.png",
    "/settings?view=account",
    "계정 정보",
    async (page) => {
      await page.getByTestId("nickname-row").click();
      await expect(
        page.getByRole("dialog").getByRole("heading", { name: "닉네임 변경" }),
      ).toBeVisible();
    },
  );
  await capture(
    browser,
    viewports.narrow,
    "nickname-edit-sheet-narrow.png",
    "/settings?view=account",
    "계정 정보",
    async (page) => {
      await page.getByTestId("nickname-row").click();
      await expect(
        page.getByRole("dialog").getByRole("heading", { name: "닉네임 변경" }),
      ).toBeVisible();
    },
  );

  await capture(
    browser,
    viewports.mobile,
    "logout-confirm.png",
    "/settings?view=account",
    "계정 정보",
    async (page) => {
      await page.getByRole("button", { name: "로그아웃" }).click();
      await expect(
        page.getByRole("alertdialog").getByText("로그아웃 할까요?"),
      ).toBeVisible();
    },
  );
  await capture(
    browser,
    viewports.narrow,
    "logout-confirm-narrow.png",
    "/settings?view=account",
    "계정 정보",
    async (page) => {
      await page.getByRole("button", { name: "로그아웃" }).click();
      await expect(
        page.getByRole("alertdialog").getByText("로그아웃 할까요?"),
      ).toBeVisible();
    },
  );

  await capture(
    browser,
    viewports.mobile,
    "account-delete-confirm.png",
    "/settings?view=account",
    "계정 정보",
    async (page) => {
      await page.getByRole("button", { name: "회원탈퇴" }).click();
      await expect(
        page.getByRole("alertdialog").getByText("정말 탈퇴하시겠어요?"),
      ).toBeVisible();
    },
  );
  await capture(
    browser,
    viewports.narrow,
    "account-delete-confirm-narrow.png",
    "/settings?view=account",
    "계정 정보",
    async (page) => {
      await page.getByRole("button", { name: "회원탈퇴" }).click();
      await expect(
        page.getByRole("alertdialog").getByText("정말 탈퇴하시겠어요?"),
      ).toBeVisible();
    },
  );
});
