import { mkdir } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

import type {
  PlannerNutritionAggregate,
  PlannerNutritionData,
  PlannerNutritionQuality,
  PlannerNutritionStatus,
  PlannerNutritionValue,
} from "@/types/planner-nutrition";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const AUTH_KEY = "homecook.e2e-auth-override";
const BREAKFAST_COLUMN_ID = "550e8400-e29b-41d4-a716-446655440050";
const MEAL_PATH = `/planner/2026-07-13/${BREAKFAST_COLUMN_ID}?slot=${encodeURIComponent("아침")}`;
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/planner-nutrition-summary/after/states",
);

function value(status: PlannerNutritionStatus, amount: number | null): PlannerNutritionValue {
  if (status === "complete") {
    return {
      amount,
      known_amount: null,
      status,
      display_mode: "total",
    };
  }
  if (status === "partial") {
    return {
      amount: null,
      known_amount: amount,
      status,
      display_mode: "minimum",
    };
  }
  return {
    amount: null,
    known_amount: null,
    status,
    display_mode: null,
  };
}

function aggregate({
  energy,
  incomplete = 0,
  quality = "direct",
  status = "complete",
  warnings = [],
}: {
  energy: number | null;
  incomplete?: number;
  quality?: PlannerNutritionQuality | null;
  status?: PlannerNutritionStatus;
  warnings?: string[];
}): PlannerNutritionAggregate {
  return {
    basis: { amount: 1, unit: "range" },
    values: {
      energy_kcal: value(status, energy),
      carbohydrate_g: value(status, energy === null ? null : 48),
      protein_g: value(status, energy === null ? null : 24),
      fat_g: value(status, energy === null ? null : 16),
      sodium_mg: value(status, energy === null ? null : 720),
    },
    calculation_status: status,
    calculation_quality: quality,
    incomplete_entry_count: incomplete,
    warnings,
    sources: [],
  };
}

function eachDate(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function addUtcDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function dataForRequest(
  requestUrl: string,
  nutrition: PlannerNutritionAggregate,
  counts = { recipe: 1, product: 0 },
): PlannerNutritionData {
  const url = new URL(requestUrl);
  const startDate = url.searchParams.get("start_date")!;
  const endDate = url.searchParams.get("end_date")!;
  return {
    range: { start_date: startDate, end_date: endDate },
    summary: {
      nutrition,
      recipe_entry_count: counts.recipe,
      product_entry_count: counts.product,
    },
    days: eachDate(startDate, endDate).map((planDate) => ({
      plan_date: planDate,
      nutrition,
      columns: [{ column_id: BREAKFAST_COLUMN_ID, nutrition }],
    })),
  };
}

async function fulfillNutrition(
  route: Route,
  nutrition: PlannerNutritionAggregate,
  counts?: { recipe: number; product: number },
) {
  await route.fulfill({
    json: {
      success: true,
      data: dataForRequest(route.request().url(), nutrition, counts),
      error: null,
    },
  });
}

async function authenticate(page: Page) {
  await page.context().addCookies([
    { name: AUTH_KEY, value: "authenticated", url: BASE_URL, sameSite: "Lax" },
  ]);
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, "authenticated");
  }, AUTH_KEY);
}

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <=
      document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

async function expectTouchTarget(locator: ReturnType<Page["getByRole"]>) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test.describe("planner-nutrition-summary", () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    await mkdir(EVIDENCE_DIR, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await authenticate(page);
  });

  test("QA fixture shows compact week/day totals and the current meal core five safely", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/planner");

    const weekSummary = page.getByTestId("planner-week-nutrition-summary");
    await expect(weekSummary).toContainText("계획 영양");
    await expect(weekSummary).toContainText("최소 1,475 kcal", { timeout: 15_000 });
    await expect(weekSummary).toContainText("3개 확인 필요");
    await expect(weekSummary.getByText("탄수화물", { exact: true })).toHaveCount(0);

    const firstDay = page.locator('[data-testid^="planner-day-card-"]').first();
    await expect(firstDay).toContainText("580 kcal");
    await expect(firstDay).toContainText("1개 확인 필요");
    await expectNoPageOverflow(page);
    if (testInfo.project.name === "desktop-chrome") {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "planner-week-partial-mixed-390.png") });
    }

    const firstMealHref = await firstDay.getByRole("link").first().getAttribute("href");
    expect(firstMealHref).toMatch(/^\/planner\/\d{4}-\d{2}-\d{2}\//);
    await page.goto(firstMealHref!);
    const mealSummary = page.getByTestId("meal-nutrition-summary");
    await expect(mealSummary).toContainText("직접값과 환산값 혼합 · 예상치");
    await expect(mealSummary).toContainText("580 kcal");
    await expect(mealSummary).toContainText("63.5 g");
    await expect(mealSummary).toContainText("최소 24.3 g");
    await expect(mealSummary).toContainText("최소 19.4 g");
    await expect(mealSummary).toContainText("1,370 mg");
    await expect(mealSummary).toContainText("1개 확인 필요");
    await expect(page.getByTestId("meal-screen-add-cta")).toBeVisible();
    await expectTouchTarget(page.getByTestId("meal-screen-add-cta"));

    const warningButton = page.getByRole("button", { name: /확인 필요 안내 1개 보기/ });
    await expectTouchTarget(warningButton);
    await warningButton.click();
    const dialog = page.getByRole("dialog", { name: "계획 영양 확인 안내" });
    await expect(dialog).toContainText("일부 재료나 단위의 영양값을 계산하지 못했어요.");
    await expect(page.getByRole("button", { name: "닫기" })).toBeFocused();
    if (testInfo.project.name === "desktop-chrome") {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "meal-warning-dialog-390.png") });
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(warningButton).toBeFocused();

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="meal-nutrition-summary"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await expectNoPageOverflow(page);
    if (testInfo.project.name === "desktop-chrome") {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "meal-core-five-mixed-390.png") });
    }

    await page.setViewportSize({ width: 320, height: 568 });
    await expect(mealSummary).toBeVisible();
    await expect(page.getByTestId("meal-screen-add-cta")).toBeVisible();
    await expect(page.getByTestId("meal-screen-add-cta")).toBeInViewport();
    await expectTouchTarget(page.getByTestId("meal-screen-add-cta"));
    const mobileGeometry = await page.evaluate(() => {
      const cta = document.querySelector<HTMLElement>('[data-testid="meal-screen-add-cta"]');
      const scrollArea = document.querySelector<HTMLElement>('[data-testid="meal-screen-scroll-area"]');
      return {
        cta: cta?.getBoundingClientRect().toJSON() ?? null,
        scrollArea: scrollArea?.getBoundingClientRect().toJSON() ?? null,
        viewportHeight: window.innerHeight,
      };
    });
    expect(mobileGeometry.cta).not.toBeNull();
    expect(mobileGeometry.scrollArea).not.toBeNull();
    expect(mobileGeometry.cta!.bottom).toBeLessThanOrEqual(mobileGeometry.viewportHeight);
    expect(mobileGeometry.scrollArea!.bottom).toBeLessThanOrEqual(mobileGeometry.cta!.top);
    await expectNoPageOverflow(page);
    if (testInfo.project.name === "desktop-chrome") {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "meal-core-five-mixed-320.png") });
    }
  });

  test("same-range meal refresh keeps the prior complete value on error and retry replaces it", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let responseMode: "initial" | "error" | "retry" = "initial";
    let mealPatchCount = 0;
    let mealPatchBody: unknown = null;
    await page.route("**/api/v1/meals/*", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }

      mealPatchCount += 1;
      mealPatchBody = route.request().postDataJSON();
      await route.fulfill({
        json: {
          success: true,
          data: {
            id: "550e8400-e29b-41d4-a716-446655440060",
            planned_servings: 3,
            status: "registered",
          },
          error: null,
        },
      });
    });
    await page.route("**/api/v1/planner/nutrition?*", async (route) => {
      if (responseMode === "error") {
        await route.fulfill({
          status: 500,
          json: {
            success: false,
            data: null,
            error: {
              code: "INTERNAL_ERROR",
              message: "계획 영양을 불러오지 못했어요.",
              fields: [],
            },
          },
        });
        return;
      }
      await fulfillNutrition(
        route,
        aggregate({ energy: responseMode === "initial" ? 640 : 777 }),
      );
    });

    await page.goto(MEAL_PATH);
    const summary = page.getByTestId("meal-nutrition-summary");
    await expect(summary).toContainText("640 kcal");
    responseMode = "error";
    await page.getByRole("button", { name: "인분 증가" }).filter({ visible: true }).first().click();
    await expect(summary).toContainText("640 kcal");
    await expect(summary.getByRole("button", { name: "다시 시도" })).toBeVisible();
    if (testInfo.project.name === "desktop-chrome") {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "meal-soft-error-preserves-data.png") });
    }

    responseMode = "retry";
    await summary.getByRole("button", { name: "다시 시도" }).click();
    await expect(summary).toContainText("777 kcal");
    await expect(summary.getByRole("button", { name: "다시 시도" })).toHaveCount(0);
    expect(mealPatchCount).toBe(1);
    expect(mealPatchBody).toEqual({ planned_servings: 3 });
  });

  test("range loading hides prior content and a stale response cannot replace the latest range", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let initialStartDate: string | null = null;
    let releaseStale!: () => void;
    let markStaleStarted!: () => void;
    const staleGate = new Promise<void>((resolve) => {
      releaseStale = resolve;
    });
    const staleStarted = new Promise<void>((resolve) => {
      markStaleStarted = resolve;
    });

    await page.route("**/api/v1/planner/nutrition?*", async (route) => {
      const startDate = new URL(route.request().url()).searchParams.get("start_date");
      if (initialStartDate === null) {
        initialStartDate = startDate;
        await fulfillNutrition(route, aggregate({ energy: 640 }));
        return;
      }
      const staleStartDate = addUtcDays(initialStartDate, 7);
      if (startDate === staleStartDate) {
        markStaleStarted();
        await staleGate;
        await fulfillNutrition(route, aggregate({ energy: 999 })).catch(() => undefined);
        return;
      }
      await fulfillNutrition(route, aggregate({ energy: 777 }));
    });

    await page.goto("/planner");
    const summary = page.getByTestId("planner-week-nutrition-summary");
    await expect(summary).toContainText("640 kcal");
    await page.getByRole("button", { name: "다음 주" }).first().click();
    await staleStarted;
    await expect(summary).toContainText("불러오는 중");
    await expect(summary).not.toContainText("640 kcal");
    await expect(summary).toHaveAttribute("aria-busy", "true");
    if (testInfo.project.name === "desktop-chrome") {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "planner-range-loading-hides-prior-data.png") });
    }

    await page.getByRole("button", { name: "다음 주" }).first().click();
    await expect(summary).toContainText("777 kcal");
    releaseStale();
    await page.waitForTimeout(450);
    await expect(summary).toContainText("777 kcal");
    await expect(summary).not.toContainText("999 kcal");
    if (testInfo.project.name === "desktop-chrome") {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "planner-latest-range-wins.png") });
    }
  });

  test("initial nutrition failures show retry errors instead of empty information", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/v1/planner/nutrition?*", async (route) => {
      await route.fulfill({
        status: 500,
        json: {
          success: false,
          data: null,
          error: {
            code: "INTERNAL_ERROR",
            message: "계획 영양을 불러오지 못했어요.",
            fields: [],
          },
        },
      });
    });

    await page.goto("/planner");
    const weekSummary = page.getByTestId("planner-week-nutrition-summary");
    await expect(weekSummary).toContainText("계획 영양을 불러오지 못했어요");
    await expect(weekSummary.getByRole("button", { name: "다시 시도" })).toBeVisible();
    await expect(weekSummary).not.toContainText("계획 영양 정보 없음");
    if (testInfo.project.name === "desktop-chrome") {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "planner-initial-error-390.png") });
    }

    await page.goto(MEAL_PATH);
    const mealSummary = page.getByTestId("meal-nutrition-summary");
    await expect(mealSummary).toContainText("계획 영양을 불러오지 못했어요");
    await expect(mealSummary.getByRole("button", { name: "다시 시도" })).toBeVisible();
    await expect(mealSummary).not.toContainText("계획 영양 정보 없음");
    if (testInfo.project.name === "desktop-chrome") {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "meal-initial-error-390.png") });
    }
  });

  test("empty range is unavailable information and never a false zero", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/v1/planner/nutrition?*", async (route) => {
      await fulfillNutrition(
        route,
        aggregate({ energy: null, quality: null, status: "unavailable" }),
        { recipe: 0, product: 0 },
      );
    });

    await page.goto("/planner");
    const summary = page.getByTestId("planner-week-nutrition-summary");
    await expect(summary).toContainText("계획 영양 정보 없음");
    await expect(summary).not.toContainText("0 kcal");
    if (testInfo.project.name === "desktop-chrome") {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "planner-empty-unavailable-not-zero.png") });
    }
  });
});
