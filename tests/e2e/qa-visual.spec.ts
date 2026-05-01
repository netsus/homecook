import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  installDiscoveryRoutes,
  installRecipeDetailRoutes,
  RECIPE_PATH,
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
const RECIPE_DETAIL_VISUAL_MAX_DIFF_PIXELS = 400;

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
    await expect(page.getByPlaceholder("김치볶음밥, 된장찌개...")).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-home-default.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: HOME_VISUAL_MAX_DIFF_PIXELS,
    });
  });

  test("home sort menu open matches the visual baseline", async ({ page }) => {
    await installDiscoveryRoutes(page);

    await page.goto("/");
    await page.getByRole("button", { name: /정렬 기준/i }).click();
    await expect(
      page.getByRole("option", { name: "플래너 등록순" }),
    ).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(page).toHaveScreenshot("qa-home-sort-open.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: HOME_VISUAL_MAX_DIFF_PIXELS,
    });
  });

  test("ingredient filter modal matches the visual baseline", async ({
    page,
  }) => {
    await installDiscoveryRoutes(page);

    await page.goto("/");
    await page.getByRole("button", { name: "재료 더보기" }).click();
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

    await page.getByRole("button", { name: "플래너에 추가" }).click();
    const loginGate = page.getByRole("dialog", {
      name: "로그인이 필요한 작업이에요",
    });
    await expect(loginGate).toBeVisible();

    await stabilizeVisualSnapshot(page);
    await expect(loginGate).toHaveScreenshot("qa-login-gate-modal.png", {
      animations: "disabled",
    });
  });
});
