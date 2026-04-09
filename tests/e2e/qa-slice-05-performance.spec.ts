import { expect, test, type Locator, type Page } from "@playwright/test";

import { buildSlice05PerformanceDataset } from "../../scripts/lib/slice-05-performance-fixture.mjs";

const dataset = buildSlice05PerformanceDataset({
  baseDate: process.env.HOMECOOK_SLICE_05_PERF_BASE_DATE,
});
const PERFORMANCE_BUDGET_MS = {
  averageShift: 1_100,
  horizontalReach: 500,
  initialReady: 2_500,
  maxShift: 1_500,
};

function plannerStatusValue(page: Page, label: string, value: string) {
  return page.locator("div").filter({
    has: page.locator("dt").filter({ hasText: label }),
    hasText: value,
  }).first();
}

async function waitForPlannerRange(page: Page, {
  startDate,
  endDate,
  mealCount,
}: {
  startDate: string;
  endDate: string;
  mealCount: number;
}) {
  await expect(
    plannerStatusValue(page, "범위", `${startDate} ~ ${endDate}`),
  ).toBeVisible();
  await expect(
    plannerStatusValue(page, "식사 수", `${mealCount}건`),
  ).toBeVisible();
  await expect(
    plannerStatusValue(page, "화면 상태", "ready"),
  ).toBeVisible();
}

async function measure(action: () => Promise<void>, assertion: () => Promise<void>) {
  const startedAt = Date.now();

  await action();
  await assertion();

  return Date.now() - startedAt;
}

async function expectVisibleWithinViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? 0) - 4);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual((viewport?.height ?? 0) - 4);
}

test.describe("Slice 05 local long-run performance smoke", () => {
  test.skip(
    process.env.HOMECOOK_RUN_LOCAL_PERF_QA !== "1",
    "local Supabase + dev:demo 환경에서만 실행합니다.",
  );

  test("keeps planner range shifts responsive with long-run meal volume", async ({
    page,
  }, testInfo) => {
    const metrics: {
      averageShiftMs: number;
      horizontalReachMs: number;
      initialReadyMs: number;
      maxShiftMs: number;
      shiftDurationsMs: number[];
    } = {
      averageShiftMs: 0,
      horizontalReachMs: 0,
      initialReadyMs: 0,
      maxShiftMs: 0,
      shiftDurationsMs: [],
    };

    await page.goto("/auth/logout?next=/planner");
    await expect(page.getByText("이 화면은 로그인이 필요해요")).toBeVisible();

    await page
      .getByRole("button", { name: dataset.scenario.loginButtonLabel })
      .click();
    await expect(page.getByRole("heading", { name: "식단 플래너" })).toBeVisible();
    await waitForPlannerRange(page, {
      startDate: dataset.scenario.initialRangeStartDate,
      endDate: dataset.scenario.initialRangeEndDate,
      mealCount: dataset.scenario.initialMealCount,
    });

    metrics.initialReadyMs = await measure(
      async () => {
        await page.goto("/planner");
      },
      async () => {
        await waitForPlannerRange(page, {
          startDate: dataset.scenario.initialRangeStartDate,
          endDate: dataset.scenario.initialRangeEndDate,
          mealCount: dataset.scenario.initialMealCount,
        });
      },
    );

    for (const shift of dataset.scenario.shifts) {
      const duration = await measure(
        async () => {
          await page.getByRole("button", { name: shift.buttonLabel }).click();
        },
        async () => {
          await waitForPlannerRange(page, {
            startDate: shift.startDate,
            endDate: shift.endDate,
            mealCount: shift.expectedMealCount,
          });
        },
      );

      metrics.shiftDurationsMs.push(duration);
    }

    metrics.maxShiftMs = Math.max(...metrics.shiftDurationsMs);
    metrics.averageShiftMs = Math.round(
      metrics.shiftDurationsMs.reduce((sum, value) => sum + value, 0)
        / metrics.shiftDurationsMs.length,
    );

    const scroller = page.locator("div.overflow-x-auto").first();
    const targetInput = page.locator(`input[value="${dataset.scenario.lastColumnName}"]`).first();

    metrics.horizontalReachMs = await measure(
      async () => {
        await scroller.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        await targetInput.scrollIntoViewIfNeeded();
      },
      async () => {
        await expectVisibleWithinViewport(page, targetInput);
      },
    );

    await testInfo.attach("slice-05-performance-metrics", {
      body: JSON.stringify(
        {
          budgets: PERFORMANCE_BUDGET_MS,
          dataset: {
            columns: dataset.columns.length,
            totalMeals: dataset.scenario.totalMealCount,
            totalRecipes: dataset.scenario.totalRecipeCount,
            initialMealCount: dataset.scenario.initialMealCount,
            shifts: dataset.scenario.shifts.map((shift) => ({
              direction: shift.direction,
              expectedMealCount: shift.expectedMealCount,
            })),
          },
          metrics,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    console.warn("slice-05-performance-metrics", JSON.stringify(metrics));

    expect(metrics.initialReadyMs).toBeLessThanOrEqual(PERFORMANCE_BUDGET_MS.initialReady);
    expect(metrics.maxShiftMs).toBeLessThanOrEqual(PERFORMANCE_BUDGET_MS.maxShift);
    expect(metrics.averageShiftMs).toBeLessThanOrEqual(PERFORMANCE_BUDGET_MS.averageShift);
    expect(metrics.horizontalReachMs).toBeLessThanOrEqual(PERFORMANCE_BUDGET_MS.horizontalReach);
  });
});
