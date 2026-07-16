import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { buildUnavailableRecipeNutrition } from "@/lib/nutrition/recipe-nutrition-presentation";
import { PENDING_ACTION_KEY } from "@/lib/auth/pending-action";
import { MOCK_RECIPE_DETAIL } from "@/lib/mock/recipes";
import type { RecipeDetail, RecipeNutrition } from "@/types/recipe";

import {
  installCookingVisualRoutes,
  installRecipeDetailRoutes,
  RECIPE_ID,
  RECIPE_PATH,
  STANDALONE_COOK_MODE_VISUAL_PATH,
} from "./helpers/mock-routes";

const EVIDENCE_DIR = path.join(
  process.cwd(),
  "ui/designs/evidence/recipe-nutrition-calculation",
);
const CONTEXT_EVIDENCE_VARIANT =
  process.env.RECIPE_NUTRITION_APPROVED_EVIDENCE === "1"
    ? "approved"
    : "candidate";

test.describe("recipe-nutrition-calculation", () => {
  test.setTimeout(120_000);

  test("canonical QA recipe API returns the missing snapshot soft state without an alias", async ({
    request,
  }) => {
    const response = await request.get(`/api/v1/recipes/${RECIPE_ID}`);
    expect(response.status()).toBe(200);

    const payload = await response.json() as {
      success: boolean;
      data: RecipeDetail;
      error: unknown;
    };
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe(RECIPE_ID);
    expect(payload.data.nutrition.availability_reason).toBe("missing");
    expect(payload.data.nutrition.calculation_status).toBe("unavailable");
  });

  test("small iOS viewport keeps the nutrition card and primary CTA usable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-ios-small");
    await page.setViewportSize({ width: 320, height: 568 });
    await installRecipeDetailRoutes(page, {
      recipeDetail: { nutrition: buildCompleteNutrition() },
    });

    await page.goto(RECIPE_PATH);
    const card = page.getByTestId("recipe-nutrition-card-app");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("columnheader", { name: "선택 2인분 전체" })).toBeVisible();
    await expect(page.getByRole("button", { name: "요리하기" })).toBeVisible();
    await expectNoPageOverflow(page);
    await assertTouchTarget(page.getByRole("button", { name: "인분 늘리기" }));
  });

  test("cook mode keeps its existing flow without serving controls", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobileEvidenceProject(testInfo.project.name));
    await page.setViewportSize({ width: 390, height: 844 });
    await installCookingVisualRoutes(page);

    await page.goto(STANDALONE_COOK_MODE_VISUAL_PATH);
    await expect(page.getByTestId("standalone-cook-mode-title")).toHaveText(
      "김치볶음밥",
    );
    await expect(page.getByTestId("ingredient-list")).toBeVisible();
    await expect(page.getByTestId("step-list")).toBeVisible();
    await expect(page.getByText("인분 조절", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "인분 늘리기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "인분 줄이기" })).toHaveCount(0);
    await expectNoPageOverflow(page);
    await captureStableViewport(
      page,
      path.join(EVIDENCE_DIR, "recipe-detail-cook-mode-no-serving-control.png"),
    );
  });

  test("390px and 320px show complete selected-serving nutrition without overflow", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobileEvidenceProject(testInfo.project.name));
    await page.setViewportSize({ width: 390, height: 844 });
    await installRecipeDetailRoutes(page, {
      recipeDetail: { nutrition: buildCompleteNutrition() },
    });

    await page.goto(RECIPE_PATH);
    const card = page.getByTestId("recipe-nutrition-card-app");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("columnheader", { name: "선택 2인분 전체" })).toBeVisible();
    await expect(page.getByRole("button", { name: "뒤로 가기" })).toBeVisible();
    await captureStableViewport(
      page,
      path.join(EVIDENCE_DIR, "recipe-detail-mobile-back-390.png"),
    );

    const servingHeading = page.getByText("인분 조절", { exact: true });
    await servingHeading.evaluate((element) => {
      element.scrollIntoView({ block: "start" });
      window.scrollBy(0, -72);
    });
    await expect(servingHeading).toBeInViewport();
    await expect(card).toBeInViewport();
    await captureStableViewport(
      page,
      path.join(EVIDENCE_DIR, "recipe-detail-mobile-serving-card-390-iteration4.png"),
    );

    await page.getByRole("button", { name: "인분 늘리기" }).click();
    await expect(page.getByRole("columnheader", { name: "선택 3인분 전체" })).toBeVisible();
    await expect(card.getByText("1,100 kcal")).toBeVisible();
    await expect(page.getByRole("button", { name: "요리하기" })).toBeVisible();
    await captureFeatureViewportDirect(
      page,
      card,
      path.join(
        EVIDENCE_DIR,
        `recipe-detail-after-390-${CONTEXT_EVIDENCE_VARIANT}.png`,
      ),
    );
    await expect(page.getByText("영양성분 더 보기")).toBeVisible();
    await page.getByText("영양성분 더 보기").click();
    await expect(page.getByRole("table", { name: "추가 영양성분" })).toBeVisible();
    await expect(page.getByRole("row", { name: /당류/ })).toBeVisible();
    await page.getByText("계산 출처와 기준 보기").click();
    await assertTouchTarget(page.getByRole("link", { name: "원문" }));
    await assertTouchTarget(page.getByRole("button", { name: "뒤로 가기" }));
    await expectNoPageOverflow(page);
    await captureFeatureViewport(
      page,
      card,
      path.join(EVIDENCE_DIR, "recipe-detail-after-390-iteration4.png"),
    );
    await assertNutritionAndFirstIngredientReachAboveCta(page, card);
    await captureStableViewport(
      page,
      path.join(EVIDENCE_DIR, "recipe-detail-after-390-scrolled.png"),
    );
    await captureIsolatedElement(
      page,
      card,
      path.join(EVIDENCE_DIR, "recipe-detail-nutrition-card-390.png"),
    );
    await page.getByText("영양성분 더 보기").click();
    await expect(page.getByRole("table", { name: "추가 영양성분" })).not.toBeVisible();

    await page.setViewportSize({ width: 320, height: 568 });
    expect(page.viewportSize()).toEqual({ width: 320, height: 568 });
    await expect(card).toBeVisible();
    await expectNoPageOverflow(page);
    await assertTouchTarget(page.getByRole("button", { name: "인분 줄이기" }));
    await assertTouchTarget(page.getByRole("button", { name: "인분 늘리기" }));
    await captureFeatureViewportDirect(
      page,
      card,
      path.join(
        EVIDENCE_DIR,
        `recipe-detail-after-320-${CONTEXT_EVIDENCE_VARIANT}.png`,
      ),
    );
    await assertNutritionAndFirstIngredientReachAboveCta(page, card);
    await captureStableViewport(
      page,
      path.join(EVIDENCE_DIR, "recipe-detail-after-320-scrolled.png"),
    );
    await captureIsolatedElement(
      page,
      card,
      path.join(EVIDENCE_DIR, "recipe-detail-nutrition-card-320.png"),
    );
  });

  test("390px guest returns from login to the pending planner action", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobileEvidenceProject(testInfo.project.name));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      if (!window.localStorage.getItem("homecook.e2e-auth-override")) {
        window.localStorage.setItem("homecook.e2e-auth-override", "guest");
      }
    });
    await installRecipeDetailRoutes(page, {
      recipeDetail: { nutrition: buildCompleteNutrition() },
    });
    await page.route("**/api/v1/planner?*", async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            columns: [
              { id: "column-breakfast", name: "아침", sort_order: 0 },
              { id: "column-lunch", name: "점심", sort_order: 1 },
              { id: "column-dinner", name: "저녁", sort_order: 2 },
            ],
            meals: [],
          },
          error: null,
        },
      });
    });

    await page.goto(RECIPE_PATH);
    await page.getByRole("button", { name: "플래너에 추가" }).click();
    await expect(
      page.getByRole("dialog", { name: "로그인이 필요한 작업이에요" }),
    ).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/login\?next=/),
      page.getByRole("button", { name: "로그인", exact: true }).click(),
    ]);
    await expect.poll(() => page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, PENDING_ACTION_KEY)).toMatchObject({
      type: "planner",
      recipeId: RECIPE_ID,
      redirectTo: RECIPE_PATH,
    });

    await page.evaluate(() => {
      window.localStorage.setItem("homecook.e2e-auth-override", "authenticated");
    });
    await page.goto(RECIPE_PATH);

    await expect(page.getByRole("dialog", { name: "플래너에 추가" })).toBeVisible();
    await expect(page.getByText(/로그인 완료.*플래너/)).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test("partial nutrition keeps minimum copy and the locked fixed-vector formula", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobileEvidenceProject(testInfo.project.name));
    await page.setViewportSize({ width: 390, height: 844 });
    await installRecipeDetailRoutes(page, {
      recipeDetail: { nutrition: buildPartialNutrition() },
    });

    await page.goto(RECIPE_PATH);
    await page.getByRole("button", { name: "인분 늘리기" }).click();
    await page.getByRole("button", { name: "인분 늘리기" }).click();

    const sodiumRow = page.getByRole("row", { name: /나트륨/ });
    await expect(sodiumRow.getByText("최소 365 mg")).toBeVisible();
    await expect(sodiumRow.getByText("최소 1,410 mg")).toBeVisible();
    await expect(page.getByText("재료 4개 중 2개 반영")).toBeVisible();
    await expect(page.getByText(/일반 계량값을 기준으로 계산한 예상치/)).toBeVisible();
    await expect(
      page.getByText("부피 단위는 공공 환산 기준의 대표 무게로 바꿔 계산했어요."),
    ).toBeVisible();
    await expectNoPageOverflow(page);
    await captureIsolatedElement(
      page,
      page.getByTestId("recipe-nutrition-card-app"),
      path.join(EVIDENCE_DIR, "recipe-detail-partial.png"),
    );
  });

  test("320px missing state is read-only, zero-free, and keeps the primary CTA", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobileEvidenceProject(testInfo.project.name));
    await page.setViewportSize({ width: 320, height: 568 });
    await installRecipeDetailRoutes(page, {
      recipeDetail: { nutrition: buildUnavailableRecipeNutrition() },
    });

    await page.goto(RECIPE_PATH);
    await expect(page.getByText("영양 정보를 준비하고 있어요")).toBeVisible();
    await expect(page.getByText(/0 kcal/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "영양 정보 다시 시도" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "요리하기" })).toBeVisible();
    await expectNoPageOverflow(page);
    await captureIsolatedElement(
      page,
      page.getByTestId("recipe-nutrition-state-app"),
      path.join(EVIDENCE_DIR, "recipe-detail-unavailable.png"),
    );
  });

  test("normal unavailable snapshot stays read-only without retry", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobileEvidenceProject(testInfo.project.name));
    await page.setViewportSize({ width: 390, height: 844 });
    await installRecipeDetailRoutes(page, {
      recipeDetail: { nutrition: buildNormalUnavailableNutrition() },
    });

    await page.goto(RECIPE_PATH);
    await expect(
      page.getByText("정확히 계산할 수 있는 재료 정보가 아직 부족해요."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "영양 정보 다시 시도" }),
    ).toHaveCount(0);
    await captureIsolatedElement(
      page,
      page.getByTestId("recipe-nutrition-card-app"),
      path.join(EVIDENCE_DIR, "recipe-detail-normal-unavailable.png"),
    );
  });

  test("desktop temporary failure retries only nutrition and preserves body and CTA", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome");
    await page.setViewportSize({ width: 1280, height: 900 });

    let requestCount = 0;
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    const temporaryDetail = {
      ...MOCK_RECIPE_DETAIL,
      nutrition: {
        ...buildUnavailableRecipeNutrition(),
        availability_reason: "temporarily_unavailable" as const,
      },
    } satisfies RecipeDetail;

    await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
      requestCount += 1;
      if (requestCount > 1) {
        await retryGate;
      }

      await route.fulfill({
        json: {
          success: true,
          data: requestCount > 1
            ? { ...MOCK_RECIPE_DETAIL, nutrition: buildCompleteNutrition() }
            : temporaryDetail,
          error: null,
        },
      });
    });

    await page.goto(RECIPE_PATH);
    await expect(
      page.getByText("영양 정보를 잠시 불러오지 못했어요"),
    ).toBeVisible();
    await captureDesktopStateViewportDirect(
      page,
      page.getByTestId("recipe-nutrition-state-web"),
      path.join(
        EVIDENCE_DIR,
        `recipe-detail-temporarily-unavailable-context-desktop-${CONTEXT_EVIDENCE_VARIANT}.png`,
      ),
    );
    await captureIsolatedElement(
      page,
      page.getByTestId("recipe-nutrition-state-web"),
      path.join(EVIDENCE_DIR, "recipe-detail-temporarily-unavailable.png"),
    );

    await page.getByRole("button", { name: "영양 정보 다시 시도" }).click();
    await expect(page.getByTestId("recipe-nutrition-loading-skeleton")).toBeVisible();
    await captureDesktopStateViewport(
      page,
      page.getByTestId("recipe-nutrition-loading-skeleton"),
      path.join(
        EVIDENCE_DIR,
        "recipe-detail-nutrition-loading-context-desktop-iteration4.png",
      ),
    );
    await captureIsolatedElement(
      page,
      page.getByTestId("recipe-nutrition-loading-skeleton"),
      path.join(EVIDENCE_DIR, "recipe-detail-nutrition-loading.png"),
    );
    await expect(
      page.getByRole("heading", { level: 1, name: MOCK_RECIPE_DETAIL.title }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "재료" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "만들기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "플래너에 추가" })).toBeVisible();
    await expect(page.getByRole("button", { name: "요리하기" })).toBeVisible();

    releaseRetry();
    await expect(page.getByTestId("recipe-nutrition-card-web")).toBeVisible();
    await expect(page.getByText("400 kcal")).toBeVisible();
    await expectNoPageOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE_DIR, "recipe-detail-after-desktop.png"),
      scale: "css",
    });
    const readingGrid = page.locator(".web-recipe-reading-grid");
    await readingGrid.scrollIntoViewIfNeeded();
    await captureStableViewport(
      page,
      path.join(EVIDENCE_DIR, "recipe-detail-after-desktop-scrolled.png"),
    );
    await captureIsolatedElement(
      page,
      page.getByTestId("recipe-nutrition-card-web"),
      path.join(EVIDENCE_DIR, "recipe-detail-nutrition-card-desktop.png"),
    );
  });
});

function buildCompleteNutrition(): RecipeNutrition {
  return {
    basis: { amount: 2, unit: "serving" },
    base_servings: 2,
    values: {
      energy_kcal: completeValue(800),
      carbohydrate_g: completeValue(100),
      protein_g: completeValue(40),
      fat_g: completeValue(20),
      sodium_mg: completeValue(1_200),
      sugars_g: completeValue(12),
    },
    scalable_values: {
      energy_kcal: 600,
      carbohydrate_g: 80,
      protein_g: 32,
      fat_g: 16,
      sodium_mg: 900,
      sugars_g: 8,
    },
    fixed_values: {
      energy_kcal: 200,
      carbohydrate_g: 20,
      protein_g: 8,
      fat_g: 4,
      sodium_mg: 300,
      sugars_g: 4,
    },
    calculation_status: "complete",
    calculation_quality: "direct",
    availability_reason: null,
    reflected_ingredient_count: 4,
    target_ingredient_count: 4,
    warnings: [],
    sources: [{
      provider: "식품영양 공공DB",
      dataset: "국가표준식품성분표",
      source_version: "2026.1",
      data_basis_date: "2026-01-01",
      license: "공공누리 제1유형",
      source_url: "https://example.com/nutrition",
    }],
  };
}

function buildPartialNutrition(): RecipeNutrition {
  const complete = buildCompleteNutrition();

  return {
    ...complete,
    values: {
      ...complete.values,
      sodium_mg: {
        amount: null,
        known_amount: 730,
        status: "partial",
        display_mode: "minimum",
      },
    },
    scalable_values: {
      ...complete.scalable_values,
      sodium_mg: 680,
    },
    fixed_values: {
      ...complete.fixed_values,
      sodium_mg: 50,
    },
    calculation_status: "partial",
    calculation_quality: "estimated",
    reflected_ingredient_count: 2,
    warnings: [
      "REPRESENTATIVE_VOLUME_CONVERSION_USED",
      "NUTRITION_PROFILE_MISSING",
    ],
  };
}

function buildNormalUnavailableNutrition(): RecipeNutrition {
  const unavailable = buildUnavailableRecipeNutrition();

  return {
    ...unavailable,
    basis: { amount: 2, unit: "serving" },
    base_servings: 2,
    availability_reason: null,
    scalable_values: {},
    fixed_values: {},
  };
}

function completeValue(amount: number) {
  return {
    amount,
    known_amount: amount,
    status: "complete" as const,
    display_mode: "total" as const,
  };
}

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
}

async function assertTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function captureFeatureViewport(
  page: Page,
  card: Locator,
  screenshotPath: string,
) {
  const servingHeading = page.getByText("인분 조절", { exact: true });
  await servingHeading.evaluate((element) => {
    element.scrollIntoView({ block: "start" });
    window.scrollBy(0, -72);
  });
  await expect(servingHeading).toBeInViewport();
  await expect(card).toBeInViewport();
  await expect(page.locator(".wave1-recipe-cta-bar")).toBeVisible();
  await captureStableViewport(page, screenshotPath);
}

async function captureFeatureViewportDirect(
  page: Page,
  card: Locator,
  screenshotPath: string,
) {
  const servingHeading = page.getByText("인분 조절", { exact: true });
  await servingHeading.evaluate((element) => {
    element.scrollIntoView({ block: "start" });
    window.scrollBy(0, -72);
  });
  await expect(servingHeading).toBeInViewport();
  await expect(card).toBeInViewport();
  await expect(page.locator(".wave1-recipe-cta-bar")).toBeVisible();
  await waitForSettledPaint(page);
  await page.screenshot({ scale: "css" });
  await waitForSettledPaint(page);
  await page.screenshot({ path: screenshotPath, scale: "css" });
}

function isMobileEvidenceProject(projectName: string) {
  return projectName === "mobile-chrome";
}

async function assertNutritionAndFirstIngredientReachAboveCta(
  page: Page,
  card: Locator,
) {
  const firstIngredient = page
    .getByText(MOCK_RECIPE_DETAIL.ingredients[0]?.standard_name ?? "", { exact: true })
    .locator("xpath=ancestor::li[1]");
  const cta = page.locator(".wave1-recipe-cta-bar");

  await firstIngredient.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });

  const [cardBox, ingredientBox, ctaBox] = await Promise.all([
    card.boundingBox(),
    firstIngredient.boundingBox(),
    cta.boundingBox(),
  ]);
  expect(cardBox).not.toBeNull();
  expect(ingredientBox).not.toBeNull();
  expect(ctaBox).not.toBeNull();
  expect(cardBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(0);
  expect((cardBox?.y ?? 0) + (cardBox?.height ?? 0)).toBeLessThanOrEqual(
    ctaBox?.y ?? 0,
  );
  expect((ingredientBox?.y ?? 0) + (ingredientBox?.height ?? 0)).toBeLessThanOrEqual(
    ctaBox?.y ?? 0,
  );

  await page.evaluate(() => {
    window.scrollBy(0, -Math.min(120, Math.round(window.innerHeight * 0.16)));
  });

  const [settledCardBox, settledIngredientBox, settledCtaBox] = await Promise.all([
    card.boundingBox(),
    firstIngredient.boundingBox(),
    cta.boundingBox(),
  ]);
  expect(settledCardBox).not.toBeNull();
  expect(settledIngredientBox).not.toBeNull();
  expect(settledCtaBox).not.toBeNull();
  expect(settledCardBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(0);
  expect(
    (settledCardBox?.y ?? 0) + (settledCardBox?.height ?? 0),
  ).toBeLessThanOrEqual(settledCtaBox?.y ?? 0);
  expect(
    (settledIngredientBox?.y ?? 0) + (settledIngredientBox?.height ?? 0),
  ).toBeLessThanOrEqual(settledCtaBox?.y ?? 0);
}

async function captureIsolatedElement(
  page: Page,
  locator: Locator,
  screenshotPath: string,
) {
  const overlays = page.locator(
    '.wave1-recipe-cta-bar, nav[aria-label="레시피 상세 하단 탭"], [role="tablist"][aria-label="레시피 상세 탭"], .web-topnav, .web-recipe-bottom-cta',
  );
  await overlays.evaluateAll((elements) => {
    for (const element of elements) {
      (element as HTMLElement).style.visibility = "hidden";
    }
  });

  try {
    await waitForSettledPaint(page);
    await locator.screenshot({ path: screenshotPath, scale: "css" });
  } finally {
    await overlays.evaluateAll((elements) => {
      for (const element of elements) {
        (element as HTMLElement).style.removeProperty("visibility");
      }
    });
  }
}

async function captureDesktopStateViewport(
  page: Page,
  state: Locator,
  screenshotPath: string,
) {
  await state.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await expect(state).toBeInViewport();
  await expect(page.getByRole("heading", { name: "재료" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "만들기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "플래너에 추가" })).toBeVisible();
  await expect(page.getByRole("button", { name: "요리하기" })).toBeVisible();
  await captureStableViewport(page, screenshotPath);
}

async function captureDesktopStateViewportDirect(
  page: Page,
  state: Locator,
  screenshotPath: string,
) {
  await state.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await expect(state).toBeInViewport();
  await expect(page.getByRole("heading", { name: "재료" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "만들기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "플래너에 추가" })).toBeVisible();
  await expect(page.getByRole("button", { name: "요리하기" })).toBeVisible();
  await waitForSettledPaint(page);
  await page.screenshot({ scale: "css" });
  await waitForSettledPaint(page);
  await page.screenshot({ path: screenshotPath, scale: "css" });
}

async function captureStableViewport(page: Page, screenshotPath: string) {
  await waitForSettledPaint(page);
  await freezeViewportLayersForCapture(page);

  try {
    await page.screenshot({ scale: "css" });
    await waitForSettledPaint(page);
    await page.screenshot({ path: screenshotPath, scale: "css" });
  } finally {
    await restoreViewportLayersAfterCapture(page);
  }
}

const VIEWPORT_LAYER_SELECTOR = [
  ".wave1-recipe-cta-bar",
  'nav[aria-label="레시피 상세 하단 탭"]',
  '[role="tablist"][aria-label="레시피 상세 탭"]',
  ".web-topnav",
  ".web-recipe-rail",
].join(", ");

async function freezeViewportLayersForCapture(page: Page) {
  await page.evaluate((selector) => {
    const originalStyleAttribute = "data-recipe-nutrition-evidence-style";

    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const rect = element.getBoundingClientRect();
      element.setAttribute(
        originalStyleAttribute,
        element.getAttribute("style") ?? "__unset__",
      );
      element.style.setProperty("position", "absolute", "important");
      element.style.setProperty("inset", "auto", "important");
      element.style.setProperty("top", `${window.scrollY + rect.top}px`, "important");
      element.style.setProperty("left", `${window.scrollX + rect.left}px`, "important");
      element.style.setProperty("width", `${rect.width}px`, "important");
      element.style.setProperty("height", `${rect.height}px`, "important");
      element.style.setProperty("margin", "0", "important");
    }
  }, VIEWPORT_LAYER_SELECTOR);
}

async function restoreViewportLayersAfterCapture(page: Page) {
  await page.evaluate(() => {
    const originalStyleAttribute = "data-recipe-nutrition-evidence-style";

    for (const element of document.querySelectorAll<HTMLElement>(
      `[${originalStyleAttribute}]`,
    )) {
      const originalStyle = element.getAttribute(originalStyleAttribute);
      element.removeAttribute(originalStyleAttribute);
      if (originalStyle === "__unset__") {
        element.removeAttribute("style");
      } else if (originalStyle !== null) {
        element.setAttribute("style", originalStyle);
      }
    }
  });
}

async function waitForSettledPaint(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }),
  );
  await page.waitForTimeout(500);
}
