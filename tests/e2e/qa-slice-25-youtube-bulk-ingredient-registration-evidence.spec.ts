import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  installBulkIngredientRoutes,
  openBulkReview,
} from "./helpers/youtube-bulk-ingredient-registration";
import {
  setYoutubeIngredientRegistrationAuth,
} from "./helpers/youtube-ingredient-registration";

const EVIDENCE_DIR = join(
  process.cwd(),
  "ui/designs/evidence/25-youtube-bulk-ingredient-resolution",
);

test.describe("Slice 25 YouTube bulk ingredient registration evidence", () => {
  test.beforeEach(async ({ page }) => {
    await setYoutubeIngredientRegistrationAuth(page);
    await installBulkIngredientRoutes(page);
    await mkdir(EVIDENCE_DIR, { recursive: true });
  });

  test("captures mobile default bulk registration states", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "mobile default evidence only");

    await openBulkReview(page);
    await expect(page.getByTestId("bulk-register-cta")).toContainText("5건 일괄 등록");
    await page.screenshot({
      path: join(EVIDENCE_DIR, "YT_IMPORT-bulk-cta-mobile.png"),
      fullPage: false,
    });

    await page.getByTestId("bulk-register-cta").click();
    const sheet = page.getByTestId("bulk-register-sheet");
    await expect(sheet).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "YT_IMPORT-bulk-sheet-mobile.png"),
      fullPage: false,
    });

    await sheet.getByRole("button", { name: /일괄 등록/ }).click();
    await expect(sheet.getByText("5건 성공")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "YT_IMPORT-bulk-success-mobile.png"),
      fullPage: false,
    });
  });

  test("captures mobile narrow bulk sheet", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-ios-small", "mobile narrow evidence only");

    await openBulkReview(page);
    await page.getByTestId("bulk-register-cta").click();
    await expect(page.getByTestId("bulk-register-sheet")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "YT_IMPORT-bulk-sheet-mobile-narrow.png"),
      fullPage: false,
    });
  });
});
