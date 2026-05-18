import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  installAccountLibraryVisualRoutes,
  LOGIN_VISUAL_PATH,
  MYPAGE_VISUAL_PATH,
  RECIPEBOOK_DETAIL_VISUAL_PATH,
  setE2EAuthOverride,
  SETTINGS_VISUAL_PATH,
} from "./helpers/mock-routes";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/desktop-mvp-porting/slice6/screenshots",
);

const viewports = {
  desktop1024: { width: 1024, height: 768 },
  desktop1280: { width: 1280, height: 900 },
  desktop1440: { width: 1440, height: 960 },
} as const;

async function preparePage(
  browser: Browser,
  viewport: { width: number; height: number },
  authenticated = true,
) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport,
  });
  const page = await context.newPage();
  if (authenticated) {
    await setE2EAuthOverride(page);
    await installAccountLibraryVisualRoutes(page);
  }
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
    authenticated = true,
    fullPage = true,
  }: {
    authenticated?: boolean;
    fullPage?: boolean;
  } = {},
) {
  const { context, page } = await preparePage(
    browser,
    viewports[viewportName],
    authenticated,
  );
  await page.goto(`${BASE_URL}${routePath}`);
  await assertReady(page);
  await stabilize(page);
  await page.screenshot({
    fullPage,
    path: path.join(EVIDENCE_DIR, filename),
  });
  await context.close();
}

test("capture Slice 6 desktop prototype-port evidence", async ({ browser }) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  for (const viewportName of Object.keys(viewports) as Array<keyof typeof viewports>) {
    const width = viewports[viewportName].width;

    await capture(
      browser,
      viewportName,
      `login-${width}.png`,
      LOGIN_VISUAL_PATH,
      async (page) => {
        await expect(
          page.getByRole("heading", { name: "집밥 루틴을 이어가려면 로그인하세요" }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: "Google로 시작하기" })).toBeVisible();
      },
      { authenticated: false },
    );

    await capture(
      browser,
      viewportName,
      `mypage-saved-${width}.png`,
      MYPAGE_VISUAL_PATH,
      async (page) => {
        await expect(page.getByRole("heading", { name: "저장한 레시피" })).toBeVisible();
      },
    );

    await capture(
      browser,
      viewportName,
      `recipebooks-${width}.png`,
      MYPAGE_VISUAL_PATH,
      async (page) => {
        await page.getByRole("button", { name: /레시피북 관리/ }).click();
        await expect(page.getByRole("heading", { name: "레시피북" })).toBeVisible();
      },
    );

    await capture(
      browser,
      viewportName,
      `recipebook-detail-${width}.png`,
      RECIPEBOOK_DETAIL_VISUAL_PATH,
      async (page) => {
        await expect(page.getByRole("heading", { name: "주말 파티" })).toBeVisible();
      },
    );

    await capture(
      browser,
      viewportName,
      `mypage-shopping-history-${width}.png`,
      MYPAGE_VISUAL_PATH,
      async (page) => {
        await page.getByRole("button", { name: /장보기 내역/ }).click();
        await expect(page.getByRole("heading", { name: "장보기 내역" })).toBeVisible();
      },
    );

    await capture(
      browser,
      viewportName,
      `settings-${width}.png`,
      SETTINGS_VISUAL_PATH,
      async (page) => {
        await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
      },
    );
  }

  await capture(
    browser,
    "desktop1280",
    "mypage-account-1280.png",
    MYPAGE_VISUAL_PATH,
    async (page) => {
      await page.getByRole("tab", { name: "계정 관리" }).click();
      await expect(page.getByRole("heading", { name: "계정 관리" })).toBeVisible();
    },
  );

  await capture(
    browser,
    "desktop1280",
    "mypage-notifications-1280.png",
    MYPAGE_VISUAL_PATH,
    async (page) => {
      await page.getByRole("tab", { name: "알림 설정" }).click();
      await expect(page.getByRole("heading", { name: "알림 설정" })).toBeVisible();
    },
  );

  await capture(
    browser,
    "desktop1280",
    "mypage-help-1280.png",
    MYPAGE_VISUAL_PATH,
    async (page) => {
      await page.getByRole("tab", { name: "도움말" }).click();
      await expect(page.getByRole("heading", { name: "도움말" })).toBeVisible();
    },
  );

  await capture(
    browser,
    "desktop1280",
    "settings-nickname-modal-1280.png",
    SETTINGS_VISUAL_PATH,
    async (page) => {
      await page.getByTestId("nickname-row").click();
      await expect(page.getByRole("dialog", { name: "닉네임 변경" })).toBeVisible();
    },
    { fullPage: false },
  );

  await capture(
    browser,
    "desktop1280",
    "settings-logout-modal-1280.png",
    SETTINGS_VISUAL_PATH,
    async (page) => {
      await page.getByRole("button", { name: "로그아웃" }).click();
      await expect(page.getByRole("alertdialog", { name: "로그아웃 할까요?" })).toBeVisible();
    },
    { fullPage: false },
  );

  await capture(
    browser,
    "desktop1280",
    "settings-account-delete-modal-1280.png",
    SETTINGS_VISUAL_PATH,
    async (page) => {
      await page.getByRole("button", { name: "계정 삭제하기" }).click();
      await expect(
        page.getByRole("alertdialog", { name: "정말 계정을 삭제할까요?" }),
      ).toBeVisible();
    },
    { fullPage: false },
  );

  await capture(
    browser,
    "desktop1280",
    "recipebook-delete-modal-1280.png",
    MYPAGE_VISUAL_PATH,
    async (page) => {
      await page.getByRole("button", { name: /레시피북 관리/ }).click();
      await page.getByLabel("주말 파티 옵션 메뉴").click();
      await page.getByRole("menuitem", { name: "삭제" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
    },
    { fullPage: false },
  );
});
