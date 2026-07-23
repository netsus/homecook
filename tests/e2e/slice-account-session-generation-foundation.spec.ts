import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const AUTH_OVERRIDE_COOKIE = "homecook.e2e-auth-override";
const QUARANTINE_STATE_COOKIE =
  "homecook.qa-account-quarantine-state";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/account-session-generation-foundation",
);

type FixtureState =
  | "auth-present"
  | "auth-absent"
  | "loading"
  | "maintenance"
  | "error"
  | "pending"
  | "replay"
  | "cleanup-pending"
  | "conflict"
  | "unauthorized";

async function setFixtureCookies(
  context: BrowserContext,
  state?: FixtureState,
  auth: "authenticated" | "guest" = "authenticated",
) {
  await context.addCookies([
    {
      name: AUTH_OVERRIDE_COOKIE,
      sameSite: "Lax",
      url: BASE_URL,
      value: auth,
    },
    ...(state
      ? [{
          name: QUARANTINE_STATE_COOKIE,
          sameSite: "Lax" as const,
          url: BASE_URL,
          value: state,
        }]
      : []),
  ]);
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
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function openQuarantine(
  page: Page,
  state: FixtureState,
  pathName = "/account-quarantine?next=%2Fmypage",
) {
  await setFixtureCookies(page.context(), state);
  await page.goto(`${BASE_URL}${pathName}`, { waitUntil: "networkidle" });
  await expect(
    page.locator('[data-screen-id="ACCOUNT_QUARANTINE"]'),
  ).toBeVisible();
}

async function expectTextContrast(locator: Locator, minimum = 4.5) {
  const contrast = await locator.evaluate((element) => {
    const parseRgb = (value: string) => {
      const channels = value.match(/\d+(?:\.\d+)?/g)?.map(Number);
      if (!channels || channels.length < 3) {
        throw new Error(`RGB 색상을 해석할 수 없습니다: ${value}`);
      }
      return [
        channels[0],
        channels[1],
        channels[2],
        channels[3] ?? 1,
      ];
    };
    const luminance = (channels: number[]) => {
      const normalized = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return (
        (0.2126 * normalized[0])
        + (0.7152 * normalized[1])
        + (0.0722 * normalized[2])
      );
    };
    const composite = (foreground: number[], background: number[]) => {
      const alpha =
        foreground[3] + (background[3] * (1 - foreground[3]));
      if (alpha === 0) {
        return [0, 0, 0, 0];
      }
      return [
        (
          (foreground[0] * foreground[3])
          + (background[0] * background[3] * (1 - foreground[3]))
        ) / alpha,
        (
          (foreground[1] * foreground[3])
          + (background[1] * background[3] * (1 - foreground[3]))
        ) / alpha,
        (
          (foreground[2] * foreground[3])
          + (background[2] * background[3] * (1 - foreground[3]))
        ) / alpha,
        alpha,
      ];
    };
    const styles = window.getComputedStyle(element);
    let effectiveBackground = parseRgb(styles.backgroundColor);
    let parent = element.parentElement;
    while (effectiveBackground[3] < 1 && parent) {
      effectiveBackground = composite(
        effectiveBackground,
        parseRgb(window.getComputedStyle(parent).backgroundColor),
      );
      parent = parent.parentElement;
    }
    if (effectiveBackground[3] < 1) {
      effectiveBackground = composite(
        effectiveBackground,
        [255, 255, 255, 1],
      );
    }
    const effectiveForeground = composite(
      parseRgb(styles.color),
      effectiveBackground,
    );
    const foreground = luminance(effectiveForeground);
    const background = luminance(effectiveBackground);
    return (
      (Math.max(foreground, background) + 0.05)
      / (Math.min(foreground, background) + 0.05)
    );
  });

  expect.soft(contrast).toBeGreaterThanOrEqual(minimum);
}

async function captureEvidence(
  browser: Browser,
  {
    filename,
    fullPage = true,
    state,
    viewport,
    prepare,
  }: {
    filename: string;
    fullPage?: boolean;
    state: FixtureState;
    viewport: { width: number; height: number };
    prepare?: (page: Page) => Promise<void>;
  },
) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport,
  });
  const page = await context.newPage();
  await openQuarantine(page, state);
  await stabilize(page);
  await prepare?.(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    fullPage,
    path: path.join(EVIDENCE_DIR, filename),
  });
  await context.close();
}

test.describe("account-session-generation-foundation quarantine", () => {
  test("blocks normal MYPAGE content and preserves the return target", async ({
    page,
  }) => {
    await openQuarantine(
      page,
      "auth-present",
      "/mypage?restore=recipebook-tab",
    );

    await expect(
      page.getByRole("heading", { name: "계정 보호 중" }),
    ).toBeVisible();
    await expect(page.getByTestId("mypage-profile")).toHaveCount(0);
    await expect(page).toHaveURL(/\/mypage\?restore=recipebook-tab$/);
  });

  test("keeps legacy and direct non-quarantine visits unexposed", async ({
    page,
  }) => {
    await setFixtureCookies(page.context(), undefined, "guest");
    await page.goto(`${BASE_URL}/account-quarantine?next=%2Fmypage`, {
      waitUntil: "networkidle",
    });

    await expect(page).toHaveURL(/\/mypage$/);
    await expect(
      page.locator('[data-screen-id="ACCOUNT_QUARANTINE"]'),
    ).toHaveCount(0);
  });

  test("shows support-only auth-absent without mutation controls", async ({
    page,
  }) => {
    await openQuarantine(page, "auth-absent");

    await expect(
      page.getByRole("heading", { name: "계정 확인이 필요해요" }),
    ).toBeVisible();
    await expect(page.getByText(/Manual Only/)).toBeVisible();
    await expect(page.getByRole("button", { name: "계정 복구" }))
      .toHaveCount(0);
    await expect(page.getByRole("button", { name: "삭제 검토" }))
      .toHaveCount(0);
  });

  test("keeps replay, maintenance, cleanup, and stale-session states fail-closed", async ({
    page,
  }) => {
    const cases = [
      ["replay", "이전 요청 결과를 다시 보여드려요"],
      ["maintenance", "지금은 계정 전환 작업 중이에요"],
      ["cleanup-pending", "계정 정리를 시작했어요. 아직 완료되지 않았어요."],
      ["unauthorized", "세션이 바뀌었어요. 다시 로그인해 주세요."],
    ] as const;

    for (const [state, title] of cases) {
      await openQuarantine(page, state);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "계정 복구" }))
        .toHaveCount(0);
      await expect(page.getByRole("button", { name: "삭제 검토" }))
        .toHaveCount(0);
    }

    await expect(page.getByRole("link", { name: "다시 로그인" }))
      .toBeVisible();
  });

  test("activates once with exact body and returns to the original MYPAGE", async ({
    page,
  }) => {
    let requestCount = 0;
    await page.route(
      "**/api/v1/users/me/cutover-quarantine-resolution",
      async (route) => {
        requestCount += 1;
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers()["idempotency-key"]).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        expect(route.request().postDataJSON()).toEqual({
          action: "activate",
          profile: { nickname: "집밥러" },
        });
        await route.fulfill({
          json: {
            success: true,
            data: {
              resolution_status: "active",
              account_generation: 3,
            },
            error: null,
          },
          status: 200,
        });
      },
    );
    await openQuarantine(
      page,
      "auth-present",
      "/account-quarantine?next=%2Fmypage%3Frestore%3Drecipebook-tab",
    );
    await page.getByLabel("복구할 계정의 닉네임").fill("집밥러");
    await page.evaluate((cookieName) => {
      document.cookie =
        `${cookieName}=; path=/; Max-Age=0; SameSite=Lax`;
    }, QUARANTINE_STATE_COOKIE);

    await page.getByRole("button", { name: "계정 복구" }).click();

    await expect(page).toHaveURL(/\/mypage\?restore=recipebook-tab$/);
    await expect(
      page.locator('[data-screen-id="ACCOUNT_QUARANTINE"]'),
    ).toHaveCount(0);
    expect(requestCount).toBe(1);
  });

  test("requires delete confirmation and keeps cleanup_pending incomplete", async ({
    page,
  }) => {
    let requestCount = 0;
    await page.route(
      "**/api/v1/users/me/cutover-quarantine-resolution",
      async (route) => {
        requestCount += 1;
        expect(route.request().postDataJSON()).toEqual({ action: "delete" });
        await route.fulfill({
          json: {
            success: true,
            data: { deletion_status: "cleanup_pending" },
            error: null,
          },
          status: 202,
        });
      },
    );
    await openQuarantine(page, "auth-present");

    await page.getByRole("button", { name: "삭제 검토" }).click();
    const dialog = page.getByRole("dialog", {
      name: "정말 계정을 삭제할까요?",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "삭제 시작" }).click();

    await expect(page.getByText(
      "계정 정리를 시작했어요. 아직 완료되지 않았어요.",
    )).toBeVisible();
    expect(requestCount).toBe(1);
  });

  test("captures responsive and state authority evidence", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chrome",
      "한 프로젝트만 canonical evidence를 기록합니다.",
    );
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await mkdir(
      path.join(
        EVIDENCE_DIR,
        "ACCOUNT_QUARANTINE-auth-present-activate-delete",
      ),
      { recursive: true },
    );
    await mkdir(
      path.join(
        EVIDENCE_DIR,
        "ACCOUNT_QUARANTINE-auth-absent-support-only",
      ),
      { recursive: true },
    );
    await mkdir(
      path.join(
        EVIDENCE_DIR,
        "ACCOUNT_QUARANTINE-error-pending-conflict",
      ),
      { recursive: true },
    );

    await captureEvidence(browser, {
      filename: "ACCOUNT_QUARANTINE-mobile-390.png",
      state: "auth-present",
      viewport: { width: 390, height: 844 },
    });
    await captureEvidence(browser, {
      filename: "ACCOUNT_QUARANTINE-mobile-320.png",
      state: "auth-present",
      viewport: { width: 320, height: 568 },
      prepare: async (page) => {
        const scrollWidth = await page.evaluate(
          () => document.documentElement.scrollWidth,
        );
        expect(scrollWidth).toBeLessThanOrEqual(320);
        const recoveryButton = page.getByRole("button", {
          name: "계정 복구",
        });
        await expectTextContrast(recoveryButton);
        await expectTextContrast(page.getByText("계정 보호", { exact: true }));
        const recoveryBox = await recoveryButton.boundingBox();
        expect(recoveryBox).not.toBeNull();
        expect(
          (recoveryBox?.y ?? 0) + (recoveryBox?.height ?? 0),
        ).toBeLessThanOrEqual(568);
        const buttons = page.getByRole("button");
        for (let index = 0; index < await buttons.count(); index += 1) {
          const box = await buttons.nth(index).boundingBox();
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }
      },
    });
    await captureEvidence(browser, {
      filename: "ACCOUNT_QUARANTINE-desktop.png",
      state: "auth-present",
      viewport: { width: 1440, height: 1000 },
    });
    await captureEvidence(browser, {
      filename:
        "ACCOUNT_QUARANTINE-auth-present-activate-delete/default.png",
      fullPage: false,
      state: "auth-present",
      viewport: { width: 390, height: 844 },
      prepare: async (page) => {
        await page.getByRole("button", { name: "삭제 검토" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
      },
    });
    await captureEvidence(browser, {
      filename:
        "ACCOUNT_QUARANTINE-auth-present-activate-delete/delete-sheet-320.png",
      fullPage: false,
      state: "auth-present",
      viewport: { width: 320, height: 568 },
      prepare: async (page) => {
        await page.getByRole("button", { name: "삭제 검토" }).click();
        const dialog = page.getByRole("dialog", {
          name: "정말 계정을 삭제할까요?",
        });
        await expect(dialog).toBeVisible();
        const confirmButton = dialog.getByRole("button", {
          name: "삭제 시작",
        });
        const confirmBox = await confirmButton.boundingBox();
        expect(confirmBox).not.toBeNull();
        expect(
          (confirmBox?.y ?? 0) + (confirmBox?.height ?? 0),
        ).toBeLessThanOrEqual(568);
        await expectTextContrast(confirmButton);
        expect(
          await page.evaluate(() => document.body.style.overflow),
        ).toBe("hidden");
        expect(
          await page
            .getByTestId("account-quarantine-background")
            .getAttribute("inert"),
        ).not.toBeNull();
      },
    });
    await captureEvidence(browser, {
      filename:
        "ACCOUNT_QUARANTINE-auth-absent-support-only/default.png",
      state: "auth-absent",
      viewport: { width: 390, height: 844 },
    });
    for (const state of ["error", "pending", "conflict"] as const) {
      await captureEvidence(browser, {
        filename:
          `ACCOUNT_QUARANTINE-error-pending-conflict/${state}.png`,
        state,
        viewport: { width: 390, height: 844 },
        prepare: state === "pending"
          ? undefined
          : async (page) => {
              await expectTextContrast(
                page.getByRole("button", {
                  name: state === "error" ? "다시 시도" : "다시 검토",
                }),
              );
            },
      });
    }
  });
});
