import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  installDiscoveryRoutes,
  installMenuAddVisualRoutes,
  installMealDetailRoutes,
  installPlannerWeekRoutes,
  installRecipeDetailRoutes,
  installYoutubeImportVisualRoutes,
  MANUAL_CREATE_VISUAL_PATH,
  MEAL_VISUAL_PATH,
  MENU_ADD_VISUAL_PATH,
  RECIPE_PATH,
  setE2EAuthOverride,
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
const RECIPE_DETAIL_VISUAL_MAX_DIFF_PIXELS = 400;
const PLANNER_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 2000;
const MEAL_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 2000;
const MENU_ADD_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 2200;

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

function visibleSearchInput(page: Page) {
  return page
    .getByPlaceholder(
      isMobileViewport(page) ? "김치볶음밥, 된장찌개…" : "레시피 제목 검색",
    )
    .first();
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

test.describe("QA visual regression", () => {
  test("home default shell matches the visual baseline", async ({ page }) => {
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

  test("home sort menu open matches the visual baseline", async ({ page }) => {
    await installDiscoveryRoutes(page);

    await page.goto("/");
    if (!isMobileViewport(page)) {
      await page.evaluate(() => window.scrollTo(0, 260));
    }
    await visibleTextButton(page, /조회수순|정렬 기준/i).click();
    await expect(visibleOption(page, "플래너 등록순")).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-home-sort-open.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: homeVisualMaxDiffPixels(page),
    });
  });

  test("ingredient filter modal matches the visual baseline", async ({
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

  test("recipe detail and login gate match the visual baseline", async ({
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
      .locator(".web-meal-rail .web-stepper")
      .getByRole("button", { name: "인분 증가" })
      .click();
    const normalDialog = page.getByRole("dialog", { name: "인분 변경" });
    await expect(normalDialog).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(normalDialog).toHaveScreenshot("qa-meal-confirm-normal.png", {
      animations: "disabled",
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
      page.getByRole("heading", { name: "어떤 방식으로 메뉴를 추가할까요?" }),
    ).toBeVisible();
    await expect(page.getByText("김치볶음밥")).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-menu-add-search.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: MENU_ADD_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.getByRole("button", { name: /김치볶음밥/ }).click();
    const servingsDialog = page.getByRole("dialog", {
      name: "계획 인분 입력",
    });
    await expect(servingsDialog).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(servingsDialog).toHaveScreenshot(
      "qa-menu-add-servings-modal.png",
      {
        animations: "disabled",
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
      page.getByRole("heading", { name: "새 레시피를 직접 입력해요" }),
    ).toBeVisible();
    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-manual-recipe-create.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: MENU_ADD_DESKTOP_VISUAL_MAX_DIFF_PIXELS,
    });

    await page.getByRole("button", { name: /재료 추가/ }).click();
    const ingredientDialog = page.getByRole("dialog", { name: "재료 추가" });
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
});
