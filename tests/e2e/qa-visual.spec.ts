import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  COOK_MODE_VISUAL_PATH,
  ATE_LIST_VISUAL_PATH,
  installAccountLibraryVisualRoutes,
  installCookingVisualRoutes,
  installDiscoveryRoutes,
  installLeftoversVisualRoutes,
  installMenuAddVisualRoutes,
  installMealDetailRoutes,
  installPantryShoppingVisualRoutes,
  installPlannerWeekRoutes,
  installRecipeDetailRoutes,
  LOGIN_VISUAL_PATH,
  LEFTOVERS_VISUAL_PATH,
  installYoutubeImportVisualRoutes,
  MANUAL_CREATE_VISUAL_PATH,
  MEAL_VISUAL_PATH,
  MENU_ADD_VISUAL_PATH,
  MYPAGE_VISUAL_PATH,
  PANTRY_VISUAL_PATH,
  RECIPE_PATH,
  RECIPEBOOK_DETAIL_VISUAL_PATH,
  setE2EAuthOverride,
  SETTINGS_VISUAL_PATH,
  SHOPPING_DETAIL_COMPLETED_VISUAL_PATH,
  SHOPPING_DETAIL_VISUAL_PATH,
  SHOPPING_FLOW_VISUAL_PATH,
  STANDALONE_COOK_MODE_VISUAL_PATH,
  YOUTUBE_IMPORT_VISUAL_PATH,
} from "./helpers/mock-routes";

const qaSnapshotFonts = [
  ["NotoSans-Regular.ttf", 400],
  ["NotoSans-Medium.ttf", 500],
  ["NotoSans-SemiBold.ttf", 600],
  ["NotoSans-Bold.ttf", 700],
] as const satisfies ReadonlyArray<readonly [string, number]>;

const qaSnapshotFontFaces = qaSnapshotFonts
  .map(([fileName, weight]) => {
    const fontData = readFileSync(
      join(process.cwd(), "tests/e2e/assets/fonts", fileName),
    ).toString("base64");

    return `
      @font-face {
        font-family: "QaSnapshotSans";
        src: url("data:font/ttf;base64,${fontData}") format("truetype");
        font-style: normal;
        font-weight: ${weight};
        font-display: block;
      }
    `;
  })
  .join("\n");

const HOME_VISUAL_MAX_DIFF_PIXELS = 120;
const HOME_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 1600;
const HOME_SORT_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 2200;
const RECIPE_DETAIL_VISUAL_MAX_DIFF_PIXELS = 400;
const PLANNER_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 2000;
const MEAL_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 2000;
const MEAL_CONFIRM_MODAL_VISUAL_MAX_DIFF_PIXELS = 80;
const MENU_ADD_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 2200;
const MENU_ADD_MODAL_VISUAL_MAX_DIFF_PIXELS = 120;
const LOGIN_GATE_MODAL_VISUAL_MAX_DIFF_PIXELS = 1200;
const PANTRY_SHOPPING_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 2400;
const ACCOUNT_LIBRARY_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 2600;
const MYPAGE_SAVED_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 5200;
const COOKING_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 3200;
const LEFTOVERS_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 2600;
const FIXED_HOME_VISUAL_NOW = "2026-06-01T10:30:00.000Z";

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

function visibleSearchInput(page: Page) {
  return page.locator('input[placeholder="레시피 제목 검색"]:visible').first();
}

function visibleTextButton(page: Page, text: string | RegExp) {
  return page.locator("button:visible").filter({ hasText: text }).first();
}

function visibleOption(page: Page, text: string | RegExp) {
  return page.locator('[role="option"]:visible').filter({ hasText: text }).first();
}

function homeVisualMaxDiffPixels(page: Page) {
  return isMobileViewport(page)
    ? HOME_VISUAL_MAX_DIFF_PIXELS
    : HOME_DESKTOP_VISUAL_MAX_DIFF_PIXELS;
}

function homeSortVisualMaxDiffPixels(page: Page) {
  return isMobileViewport(page)
    ? HOME_VISUAL_MAX_DIFF_PIXELS
    : HOME_SORT_DESKTOP_VISUAL_MAX_DIFF_PIXELS;
}

async function stabilizeVisualSnapshot(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(0, 0);
  await page.addStyleTag({
    content: `
      ${qaSnapshotFontFaces}

      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
        -webkit-font-smoothing: antialiased !important;
      }

      html {
        text-size-adjust: 100% !important;
        -webkit-text-size-adjust: 100% !important;
      }

      body,
      button,
      input,
      select,
      textarea,
      [role="dialog"] {
        font-family: "QaSnapshotSans", sans-serif !important;
      }

      nextjs-portal,
      [data-next-badge-root],
      [aria-label="Open Next.js Dev Tools"],
      [data-nextjs-toast] {
        display: none !important;
      }

      [style*="background-image"] {
        background-image: linear-gradient(
          135deg,
          rgba(255, 108, 60, 0.22),
          rgba(255, 249, 242, 0.84),
          rgba(46, 166, 122, 0.18)
        ) !important;
        background-color: #f7efe5 !important;
      }
    `,
  });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

async function stabilizeFixedHeaderForScrolledFullPageSnapshot(page: Page) {
  await page.addStyleTag({
    content: `
      .web-topnav {
        position: absolute !important;
        top: 0 !important;
      }
    `,
  });
}

async function installFixedHomeVisualClock(page: Page) {
  await page.addInitScript(({ fixedNow }: { fixedNow: string }) => {
    const RealDate = Date;
    const fixedTime = new RealDate(fixedNow).getTime();

    class FixedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixedTime);
          return;
        }

        super(...(args as [number]));
      }

      static now() {
        return fixedTime;
      }
    }

    Object.setPrototypeOf(FixedDate, RealDate);
    globalThis.Date = FixedDate as DateConstructor;
  }, { fixedNow: FIXED_HOME_VISUAL_NOW });
}

test.describe("QA visual regression", () => {
  test("home default shell matches the visual baseline @visual-core", async ({ page }) => {
    await installFixedHomeVisualClock(page);
    await installDiscoveryRoutes(page);

    await page.goto("/");
    await expect(visibleSearchInput(page)).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-home-default.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: homeVisualMaxDiffPixels(page),
    });
  });

  test("home sort menu open matches the visual baseline @visual-core", async ({ page }) => {
    await installFixedHomeVisualClock(page);
    await installDiscoveryRoutes(page);

    await page.goto("/");
    if (!isMobileViewport(page)) {
      await page.evaluate(() => window.scrollTo(0, 260));
    }
    await visibleTextButton(page, /조회수순|정렬 기준/i).click();
    await expect(visibleOption(page, "플래너 등록순")).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await stabilizeFixedHeaderForScrolledFullPageSnapshot(page);
    await expect(page).toHaveScreenshot("qa-home-sort-open.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: homeSortVisualMaxDiffPixels(page),
    });
  });

  test("ingredient filter modal matches the visual baseline @visual-core", async ({
    page,
  }) => {
    await installDiscoveryRoutes(page);

    await page.goto("/");
    await visibleTextButton(page, "재료로 검색").click();
    const dialog = page.getByRole("dialog", { name: "재료로 검색" });
    await expect(dialog).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(dialog).toHaveScreenshot("qa-ingredient-filter-modal.png", {
      animations: "disabled",
    });
  });

  test("recipe detail and login gate match the visual baseline @visual-core", async ({
    page,
  }) => {
    await installRecipeDetailRoutes(page);

    await page.goto(RECIPE_PATH);
    await expect(
      page.getByRole("heading", { name: "집밥 김치찌개" }),
    ).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-recipe-detail.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: RECIPE_DETAIL_VISUAL_MAX_DIFF_PIXELS,
    });

    await visibleTextButton(page, "플래너에 추가").click();
    const loginGate = page.getByRole("dialog", {
      name: "로그인이 필요한 작업이에요",
    });
    await expect(loginGate).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(loginGate).toHaveScreenshot("qa-login-gate-modal.png", {
      animations: "disabled",
      maxDiffPixels: LOGIN_GATE_MODAL_VISUAL_MAX_DIFF_PIXELS,
    });
  });

  test("planner week desktop shell matches the visual baseline", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only prototype parity baseline");
    await setE2EAuthOverride(page);
    await installPlannerWeekRoutes(page);

    await page.goto("/planner");
    await expect(
      page.getByRole("heading", { name: "주간 플래너" }),
    ).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-planner-week.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: PLANNER_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });
  });

  test("meal desktop detail and confirm dialogs match the visual baseline", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only prototype parity baseline");
    await setE2EAuthOverride(page);
    await installMealDetailRoutes(page);

    await page.goto(MEAL_VISUAL_PATH);
    await expect(
      page.locator('[data-testid="meal-recipe-link-meal-visual-1"]:visible'),
    ).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-meal-detail.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: MEAL_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page
      .getByRole("article", { name: "김치찌개 끼니 음식" })
      .getByRole("button", { name: "인분 증가" })
      .click();
    const normalDialog = page.getByRole("dialog", { name: "인분 변경" });
    await expect(normalDialog).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(normalDialog).toHaveScreenshot("qa-meal-confirm-normal.png", {
      animations: "disabled",
      maxDiffPixels: MEAL_CONFIRM_MODAL_VISUAL_MAX_DIFF_PIXELS,
    });
    await normalDialog.getByRole("button", { name: "취소" }).click();

    await page
      .locator('[data-testid="meal-delete-meal-visual-1"]:visible')
      .first()
      .click();
    const destructiveDialog = page.getByRole("dialog", { name: "식사 삭제" });
    await expect(destructiveDialog).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(destructiveDialog).toHaveScreenshot(
      "qa-meal-confirm-destructive.png",
      {
        animations: "disabled",
      },
    );
  });

  test("menu add desktop pickers match the visual baseline", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only menu add parity baseline");
    await setE2EAuthOverride(page);
    await installMenuAddVisualRoutes(page);

    await page.goto(MENU_ADD_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "식사 추가" }),
    ).toBeVisible();
    await expect(page.getByText("김치볶음밥")).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-menu-add-search.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: MENU_ADD_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.getByRole("button", { name: "김치볶음밥 선택" }).click();
    const servingsDialog = page.getByRole("dialog", {
      name: "계획 인분 입력",
    });
    await expect(servingsDialog).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(servingsDialog).toHaveScreenshot(
      "qa-menu-add-servings-modal.png",
      {
        animations: "disabled",
        maxDiffPixels: MENU_ADD_MODAL_VISUAL_MAX_DIFF_PIXELS,
      },
    );
    await servingsDialog.getByRole("button", { name: "취소" }).click();

    await page.locator('[data-testid="menu-add-option-recipebook"]:visible').click();
    await expect(
      page.getByRole("button", { name: /평일 저녁 빠른요리/ }),
    ).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-menu-add-recipebook.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: MENU_ADD_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.getByRole("button", { name: /평일 저녁 빠른요리/ }).click();
    await expect(page.getByRole("button", { name: /감자 수제비/ })).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-menu-add-recipebook-detail.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: MENU_ADD_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.goto(`${MENU_ADD_VISUAL_PATH}&source=pantry`);
    await expect(page.getByRole("heading", { name: "팬트리 추천" })).toBeVisible();
    await expect(page.getByRole("button", { name: /연어 스테이크/ })).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-menu-add-pantry.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: MENU_ADD_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });
  });

  test("manual recipe desktop screen and ingredient modal match the visual baseline", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only manual recipe parity baseline");
    await setE2EAuthOverride(page);
    await installMenuAddVisualRoutes(page);

    await page.goto(MANUAL_CREATE_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "새 레시피를 직접 등록해요" }),
    ).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-manual-recipe-create.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: MENU_ADD_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.getByRole("button", { name: /재료 추가/ }).click();
    const ingredientDialog = page.getByRole("dialog", { name: "재료로 검색" });
    await expect(ingredientDialog).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(ingredientDialog).toHaveScreenshot(
      "qa-manual-ingredient-modal.png",
      {
        animations: "disabled",
      },
    );
  });

  test("youtube import desktop flow matches the visual baseline", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only youtube import parity baseline");
    await setE2EAuthOverride(page);
    await installYoutubeImportVisualRoutes(page);

    await page.goto(YOUTUBE_IMPORT_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "영상 링크에서 레시피를 추출해요" }),
    ).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-youtube-import-url.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: MENU_ADD_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page
      .locator('input[type="url"]')
      .fill("https://www.youtube.com/watch?v=recipe12345");
    await page.getByRole("button", { name: "가져오기" }).click();
    await expect(
      page.getByRole("heading", { name: "추출 결과를 확인해주세요" }),
    ).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-youtube-import-review.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: MENU_ADD_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });
  });

  test("pantry desktop screen and modals match the visual baseline", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only pantry parity baseline");
    await setE2EAuthOverride(page);
    await installPantryShoppingVisualRoutes(page);

    await page.goto(PANTRY_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "나의 팬트리" })).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-pantry.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: PANTRY_SHOPPING_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await visibleTextButton(page, "+ 재료 추가").click();
    const addDialog = page.getByRole("dialog", {
      name: "재료 추가",
    });
    await expect(addDialog).toBeVisible();
    await expect(addDialog.getByText("팬트리에 재료 추가")).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(addDialog).toHaveScreenshot("qa-pantry-add-modal.png", {
      animations: "disabled",
    });
    await addDialog.getByRole("button", { name: "닫기" }).click();

    await visibleTextButton(page, "묶음 추가").click();
    const bundleDialog = page.getByRole("dialog", {
      name: "묶음으로 재료 추가",
    });
    await expect(bundleDialog).toBeVisible();
    await expect(bundleDialog.getByText("번들로 한꺼번에 추가")).toBeVisible();
    await bundleDialog.getByRole("button", { name: /국물 요리 세트/ }).click();
    await stabilizeVisualSnapshot(page);
    await expect(bundleDialog).toHaveScreenshot("qa-pantry-bundle-modal.png", {
      animations: "disabled",
    });
  });

  test("shopping desktop flow and detail states match the visual baseline", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only shopping parity baseline");
    await setE2EAuthOverride(page);
    await installPantryShoppingVisualRoutes(page);

    await page.goto(SHOPPING_FLOW_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "장보기 준비" }),
    ).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-shopping-flow.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: PANTRY_SHOPPING_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.goto(SHOPPING_DETAIL_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "이번 주 장보기" }),
    ).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-shopping-detail-active.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: PANTRY_SHOPPING_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.getByRole("button", { name: "장보기 완료" }).click();
    const reflectDialog = page.getByRole("dialog", {
      name: /팬트리에 반영할까요/,
    });
    await expect(reflectDialog).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(reflectDialog).toHaveScreenshot(
      "qa-shopping-reflect-modal.png",
      {
        animations: "disabled",
      },
    );

    await page.goto(SHOPPING_DETAIL_COMPLETED_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "지난 주 장보기" }),
    ).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-shopping-detail-complete.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: PANTRY_SHOPPING_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });
  });

  test("login, mypage, recipebooks, settings desktop screens match the visual baseline", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only account/library parity baseline");

    await page.goto(LOGIN_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "로그인이 필요해요" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Google로 시작하기" })).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-login-desktop.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: ACCOUNT_LIBRARY_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await setE2EAuthOverride(page);
    await installAccountLibraryVisualRoutes(page);

    await page.goto(MYPAGE_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "저장한 레시피" })).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-mypage-saved.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: MYPAGE_SAVED_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.getByRole("tab", { name: /레시피북/ }).click();
    await expect(page.getByRole("heading", { name: "레시피북" })).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-recipebooks.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: ACCOUNT_LIBRARY_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.getByLabel("주말 파티 옵션 메뉴").click();
    await page.getByRole("menuitem", { name: "삭제" }).click();
    const recipebookDeleteDialog = page.getByRole("alertdialog");
    await expect(recipebookDeleteDialog).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(recipebookDeleteDialog).toHaveScreenshot(
      "qa-recipebook-delete-modal.png",
      { animations: "disabled" },
    );

    await page.goto(RECIPEBOOK_DETAIL_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "주말 파티" })).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-recipebook-detail.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: ACCOUNT_LIBRARY_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.goto(MYPAGE_VISUAL_PATH);
    await page.getByRole("tab", { name: /장보기 기록/ }).click();
    await expect(page.getByRole("heading", { name: "장보기 기록" })).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-mypage-shopping-history.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: ACCOUNT_LIBRARY_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.goto(SETTINGS_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-settings.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: ACCOUNT_LIBRARY_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.getByTestId("nickname-row").click();
    const nicknameDialog = page.getByRole("dialog", { name: "닉네임 변경" });
    await expect(nicknameDialog).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(nicknameDialog).toHaveScreenshot("qa-settings-nickname-modal.png", {
      animations: "disabled",
    });

    await nicknameDialog.getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: "로그아웃" }).click();
    const logoutDialog = page.getByRole("alertdialog", { name: "로그아웃 할까요?" });
    await expect(logoutDialog).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(logoutDialog).toHaveScreenshot("qa-settings-logout-modal.png", {
      animations: "disabled",
    });

    await logoutDialog.getByRole("button", { name: "취소" }).click();
    await page.getByRole("button", { name: "계정 삭제하기" }).click();
    const accountDeleteDialog = page.getByRole("alertdialog", {
      name: "정말 계정을 삭제할까요?",
    });
    await expect(accountDeleteDialog).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(accountDeleteDialog).toHaveScreenshot(
      "qa-settings-account-delete-modal.png",
      { animations: "disabled" },
    );
  });

  test("cooking desktop cook modes match the visual baseline", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only cooking parity baseline");
    await setE2EAuthOverride(page);
    await installCookingVisualRoutes(page);

    await page.goto(COOK_MODE_VISUAL_PATH);
    await expect(page.getByTestId("cook-mode-title")).toHaveText("김치볶음밥");
    await expect(page.getByTestId("ingredient-list")).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-cook-mode-planner.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: COOKING_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.goto(STANDALONE_COOK_MODE_VISUAL_PATH);
    await expect(page.getByTestId("standalone-cook-mode-title")).toHaveText(
      "김치볶음밥",
    );
    await expect(page.getByText(/플래너 끼니와 연결되지 않아요/)).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-cook-mode-standalone.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: COOKING_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });
  });

  test("leftovers desktop ready states match the visual baseline", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only leftovers parity baseline");
    await setE2EAuthOverride(page);
    await installLeftoversVisualRoutes(page);

    await page.goto(LEFTOVERS_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "남은 요리" })).toBeVisible();
    await expect(page.getByTestId("leftover-list")).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-leftovers-ready.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: LEFTOVERS_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.goto(ATE_LIST_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "다먹은 요리" })).toBeVisible();
    await expect(page.getByTestId("ate-item-list")).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-ate-list-ready.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: LEFTOVERS_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });
  });

  test("leftovers desktop empty states match the visual baseline", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only leftovers parity baseline");
    await setE2EAuthOverride(page);
    await installLeftoversVisualRoutes(page, { ateItems: [], leftoverItems: [] });

    await page.goto(LEFTOVERS_VISUAL_PATH);
    await expect(page.getByText("남은 요리가 없어요")).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-leftovers-empty.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: LEFTOVERS_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.goto(ATE_LIST_VISUAL_PATH);
    await expect(page.getByText("아직 다먹은 요리가 없어요")).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-ate-list-empty.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: LEFTOVERS_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });
  });
});
