import { expect, test } from "@playwright/test";

import {
  buildSlice02PerformanceDataset,
  PERF_INGREDIENT_NAME_PREFIX,
} from "../../scripts/lib/slice-02-performance-fixture.mjs";

const dataset = buildSlice02PerformanceDataset();
const PERFORMANCE_BUDGET_MS = {
  modalReady: 2_500,
  searchReady: 1_500,
  applyReady: 2_500,
};

interface PerformanceMetrics {
  applyReadyMs: number;
  modalReadyMs: number;
  searchReadyMs: number;
}

async function measure(action: () => Promise<void>, assertion: () => Promise<void>) {
  const startedAt = Date.now();

  await action();
  await assertion();

  return Date.now() - startedAt;
}

test.describe("Slice 02 local performance smoke", () => {
  test.skip(
    process.env.HOMECOOK_RUN_LOCAL_PERF_QA !== "1",
    "local Supabase + dev:demo 환경에서만 실행합니다.",
  );

  test("keeps ingredient search and apply flow responsive with bulk dataset", async ({
    page,
  }, testInfo) => {
    const dialog = page.getByRole("dialog", { name: "재료로 검색" });
    const perfIngredientOptions = dialog
      .locator("label")
      .filter({ hasText: PERF_INGREDIENT_NAME_PREFIX });
    const recipeLinks = page
      .locator('a[href^="/recipe/"]')
      .filter({ hasText: dataset.scenario.recipeTitlePrefix });
    const metrics = {} as PerformanceMetrics;

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "모든 레시피" }),
    ).toBeVisible();

    // 첫 요청/번들 컴파일을 워밍업으로 흘려보내고 실제 인터랙션을 측정한다.
    await page.getByRole("button", { name: "재료로 검색" }).click();
    await expect(perfIngredientOptions).toHaveCount(dataset.ingredients.length);
    await page.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).not.toBeVisible();

    metrics.modalReadyMs = await measure(
      async () => {
        await page.getByRole("button", { name: "재료로 검색" }).click();
      },
      async () => {
        await expect(perfIngredientOptions).toHaveCount(dataset.ingredients.length);
      },
    );

    metrics.searchReadyMs = await measure(
      async () => {
        await dialog
          .getByRole("textbox", { name: "재료명으로 검색" })
          .fill(dataset.scenario.searchQuery);
      },
      async () => {
        await expect(perfIngredientOptions).toHaveCount(9);
        await expect(
          dialog.getByText(dataset.scenario.filterIngredientNames[0], { exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByText(dataset.scenario.filterIngredientNames[1], { exact: true }),
        ).toBeVisible();
      },
    );

    await dialog
      .getByText(dataset.scenario.filterIngredientNames[0], { exact: true })
      .click();
    await dialog
      .getByText(dataset.scenario.filterIngredientNames[1], { exact: true })
      .click();

    metrics.applyReadyMs = await measure(
      async () => {
        await page.getByRole("button", { name: "적용" }).click();
      },
      async () => {
        await expect(page).toHaveURL(
          new RegExp(`ingredient_ids=.*${dataset.scenario.filterIngredientIds[0]}`),
        );
        await expect(
          page.getByRole("heading", { name: "검색 결과" }),
        ).toBeVisible();
        await expect(recipeLinks).toHaveCount(dataset.scenario.matchedRecipeCount);
      },
    );

    await testInfo.attach("slice-02-performance-metrics", {
      body: JSON.stringify(
        {
          budgets: PERFORMANCE_BUDGET_MS,
          dataset: {
            ingredients: dataset.ingredients.length,
            recipes: dataset.recipes.length,
            matchedRecipes: dataset.scenario.matchedRecipeCount,
            searchQuery: dataset.scenario.searchQuery,
            filterIngredientNames: dataset.scenario.filterIngredientNames,
          },
          metrics,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    console.warn(
      "slice-02-performance-metrics",
      JSON.stringify(metrics),
    );

    expect(metrics.modalReadyMs).toBeLessThanOrEqual(PERFORMANCE_BUDGET_MS.modalReady);
    expect(metrics.searchReadyMs).toBeLessThanOrEqual(PERFORMANCE_BUDGET_MS.searchReady);
    expect(metrics.applyReadyMs).toBeLessThanOrEqual(PERFORMANCE_BUDGET_MS.applyReady);
  });
});
