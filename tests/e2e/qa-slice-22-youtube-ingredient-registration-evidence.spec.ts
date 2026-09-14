import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  installYoutubeIngredientRegistrationRoutes,
  openYoutubeIngredientRegistrationReview,
  setYoutubeIngredientRegistrationAuth,
} from "./helpers/youtube-ingredient-registration";

const EVIDENCE_DIR = join(
  process.cwd(),
  "ui/designs/evidence/22-youtube-ingredient-registration",
);

test.describe("Slice 22 YouTube ingredient registration evidence", () => {
  test.beforeEach(async ({ page }) => {
    await setYoutubeIngredientRegistrationAuth(page);
    await installYoutubeIngredientRegistrationRoutes(page);
    await mkdir(EVIDENCE_DIR, { recursive: true });
  });

  test("captures mobile default registration states", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "mobile default evidence only");

    await openYoutubeIngredientRegistrationReview(page);
    await expect(page.getByText("재료를 찾지 못했어요")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "YT_IMPORT-unresolved-register-mobile.png"),
      fullPage: false,
    });

    await page.getByTestId("register-ingredient-action").click();
    await expect(page.getByTestId("ingredient-register-modal")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "YT_IMPORT-register-sheet-mobile.png"),
      fullPage: false,
    });

    await page.getByTestId("ingredient-register-modal").getByRole("button", { name: "등록" }).click();
    await expect(page.getByText("재료를 찾지 못했어요")).toHaveCount(0);
    await page.screenshot({
      path: join(EVIDENCE_DIR, "YT_IMPORT-resolved-after-register-mobile.png"),
      fullPage: false,
    });
  });

  test("captures mobile narrow registration sheet", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-ios-small", "mobile narrow evidence only");

    await openYoutubeIngredientRegistrationReview(page);
    await page.getByTestId("register-ingredient-action").click();
    await expect(page.getByTestId("ingredient-register-modal")).toBeVisible();
    await page.screenshot({
      path: join(EVIDENCE_DIR, "YT_IMPORT-register-sheet-mobile-narrow.png"),
      fullPage: false,
    });
  });
});
