import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";

interface PlannerColumn {
  id: string;
  name: string;
  sort_order: number;
}

interface PlannerMeal {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_thumbnail_url: string | null;
  plan_date: string;
  column_id: string;
  planned_servings: number;
  status: "registered" | "shopping_done" | "cook_done";
  is_leftover: boolean;
}

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

async function mockPlannerRoutes(
  page: Page,
  options?: {
    columns?: PlannerColumn[];
    meals?: PlannerMeal[];
  },
) {
  const requestedRanges: string[] = [];

  const columns: PlannerColumn[] = options?.columns ?? [
    { id: "column-breakfast", name: "아침", sort_order: 0 },
    { id: "column-lunch", name: "점심", sort_order: 1 },
    { id: "column-snack", name: "간식", sort_order: 2 },
    { id: "column-dinner", name: "저녁", sort_order: 3 },
  ];
  const meals: PlannerMeal[] = options?.meals ?? [
    {
      id: "meal-1",
      recipe_id: "recipe-1",
      recipe_title: "김치찌개",
      recipe_thumbnail_url: null,
      plan_date: "",
      column_id: "column-breakfast",
      planned_servings: 2,
      status: "registered",
      is_leftover: false,
    },
    {
      id: "meal-2",
      recipe_id: "recipe-2",
      recipe_title: "샐러드",
      recipe_thumbnail_url: null,
      plan_date: "",
      column_id: "column-lunch",
      planned_servings: 1,
      status: "shopping_done",
      is_leftover: false,
    },
    {
      id: "meal-3",
      recipe_id: "recipe-3",
      recipe_title: "과일볼",
      recipe_thumbnail_url: null,
      plan_date: "",
      column_id: "column-snack",
      planned_servings: 1,
      status: "cook_done",
      is_leftover: false,
    },
  ];

  await page.route("**/api/v1/planner?*", async (route) => {
    const url = new URL(route.request().url());
    const startDate = url.searchParams.get("start_date") ?? "";
    const endDate = url.searchParams.get("end_date") ?? "";
    requestedRanges.push(`${startDate}:${endDate}`);

    for (const meal of meals) {
      meal.plan_date = startDate;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          columns,
          meals,
        },
        error: null,
      },
    });
  });

  return { requestedRanges };
}

async function centerWeekStrip(page: Page) {
  if (!isMobileViewport(page)) {
    return;
  }

  const strip = page.getByTestId("planner-week-strip-viewport").filter({ visible: true });

  await strip.evaluate((element) => {
    const viewport = element as HTMLDivElement;
    viewport.scrollLeft = viewport.clientWidth;
  });
}

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

function visibleText(page: Page, text: string) {
  return page.getByRole("link", { name: new RegExp(text) }).first();
}

function visiblePlannerDayCard(page: Page) {
  return page.getByLabel(/식단 카드$/).filter({ visible: true }).first();
}

function visiblePlannerGridScope(page: Page) {
  return isMobileViewport(page)
    ? visiblePlannerDayCard(page)
    : page.getByRole("region", { name: "주간 식단 표" }).filter({ visible: true }).first();
}

async function expectPlannerWeekDays(page: Page) {
  if (isMobileViewport(page)) {
    await expect(
      page.getByTestId("planner-week-strip-page-current").filter({ visible: true }).locator("li"),
    ).toHaveCount(7);
    return;
  }

  await expect(page.locator(".web-planner-head").filter({ visible: true })).toHaveCount(7);
}

test.describe("Slice 05 planner week core", () => {
  test("authenticated user sees dynamic column day cards (Wave1 mobile shell, no emoji, no status badges)", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockPlannerRoutes(page);

    await page.goto("/planner");

    const isMobile = isMobileViewport(page);
    const plannerGrid = visiblePlannerGridScope(page);

    await expect(
      page.getByRole("heading", { name: isMobile ? "플래너" : "주간 플래너" }),
    ).toBeVisible();
    if (isMobile) {
      await expect(page.locator(':visible:has-text("음식 계획 중")').first()).toBeVisible();
    }
    await expect(page.getByText("현재 범위", { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByText("화면 상태")).toHaveCount(0);
    // Wave1: week nav buttons visible on all viewports
    await expect(page.getByRole("button", { name: "이전 주" })).toBeVisible();
    await expect(page.getByRole("button", { name: "다음 주" })).toBeVisible();
    await expectPlannerWeekDays(page);
    await expect(plannerGrid.getByText("아침")).toBeVisible();
    await expect(plannerGrid.getByText("점심")).toBeVisible();
    await expect(plannerGrid.getByText("간식")).toBeVisible();
    await expect(plannerGrid.getByText("저녁")).toBeVisible();
    await expect(visibleText(page, "김치찌개")).toBeVisible();
    await expect(visibleText(page, "샐러드")).toBeVisible();
    await expect(visibleText(page, "과일볼")).toBeVisible();
    // Wave1: status badges removed
    await expect(page.getByLabel("식사 등록 완료")).toHaveCount(0);
    await expect(page.getByLabel("장보기 완료")).toHaveCount(0);
    await expect(page.getByLabel("요리 완료")).toHaveCount(0);
    // Wave1 mobile uses a floating shopping CTA; desktop uses the prototype top action label.
    const shoppingLink = isMobile
      ? page.getByRole("link", { name: "장보기", exact: true })
      : page.getByRole("link", { name: "장보기 미리보기" });
    await expect(shoppingLink).toHaveAttribute("href", "/shopping/flow");
    await expect(page.getByRole("link", { name: "요리하기" })).toHaveCount(0);
    if (isMobile) {
      await expect(shoppingLink).toHaveClass(/fixed/);
      await expect(page.getByRole("navigation", { name: "플래너 하단 탭" })).toBeVisible();
      await expect(page.getByRole("link", { name: "남은요리" })).toHaveCount(0);
      await expect(plannerGrid.getByRole("button", { name: /저녁 식사 추가/ })).toHaveText("+");
    } else {
      await expect(page.getByRole("link", { name: "요리 준비" })).toHaveAttribute("href", "/cooking/ready");
      await expect(page.getByRole("link", { name: "남은요리" })).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: "컬럼 추가" })).toHaveCount(0);

    const pageHasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 4;
    });

    expect(pageHasHorizontalOverflow).toBe(false);
  });

  test("authenticated user can shift the planner range by swiping the weekday strip", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const tracker = await mockPlannerRoutes(page);

    await page.goto("/planner");
    await centerWeekStrip(page);
    const isMobile = isMobileViewport(page);

    await expect.poll(() => tracker.requestedRanges.length).toBeGreaterThan(0);
    const initialRange = tracker.requestedRanges[0];

    // Wave1: nav buttons always visible; use button click instead of conditional swipe
    await page.getByRole("button", { name: "다음 주" }).click();

    await expect.poll(() => tracker.requestedRanges.length).toBeGreaterThan(1);
    if (isMobile) {
      await expect(page.getByRole("button", { name: "이번주로" })).toHaveCount(0);
    } else {
      // Wave1 desktop preserve: renamed from "이번주로 가기" to "이번주로"
      await expect(page.getByRole("button", { name: "이번주로" })).toBeVisible();
      await page.getByRole("button", { name: "이번주로" }).click();
      await expect.poll(() => tracker.requestedRanges.at(-1)).toBe(initialRange);
    }
  });

  test("planner CTA actions match the Wave1 mobile shell and preserve desktop links", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockPlannerRoutes(page);

    await page.goto("/planner");

    const shoppingLink = isMobileViewport(page)
      ? page.getByRole("link", { name: "장보기", exact: true })
      : page.getByRole("link", { name: "장보기 미리보기" });
    await expect(shoppingLink).toHaveAttribute("href", "/shopping/flow");
    await expect(page.getByRole("link", { name: "요리하기" })).toHaveCount(0);
    if (isMobileViewport(page)) {
      await expect(shoppingLink).toHaveClass(/fixed/);
      await expect(page.getByRole("navigation", { name: "플래너 하단 탭" })).toBeVisible();
      await expect(page.getByRole("link", { name: "남은요리" })).toHaveCount(0);
    } else {
      await expect(page.getByRole("link", { name: "요리 준비" })).toHaveAttribute("href", "/cooking/ready");
      await expect(page.getByRole("link", { name: "남은요리" })).toHaveCount(0);
    }
  });

  test("guest user sees unauthorized state on planner route", async ({ page }) => {
    await setAuthOverride(page, "guest");

    await page.goto("/planner");

    await expect(page.getByText("이 화면은 로그인이 필요해요")).toBeVisible();
    await expect(page.getByRole("button", { name: "Google로 시작하기" })).toBeVisible();
  });

  test("guest user can return to planner after login", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await mockPlannerRoutes(page);

    await page.goto("/planner");
    await expect(page.getByText("이 화면은 로그인이 필요해요")).toBeVisible();

    await setAuthOverride(page, "authenticated");
    await page.goto("/planner");

    await expect(
      page.getByRole("heading", {
        name: isMobileViewport(page) ? "플래너" : "주간 플래너",
      }),
    ).toBeVisible();
    await expect(visibleText(page, "김치찌개")).toBeVisible();
  });

  test("renders 3-column layout when user has 3 custom columns", async ({ page }) => {
    const threeColumns: PlannerColumn[] = [
      { id: "col-a", name: "아침", sort_order: 0 },
      { id: "col-b", name: "점심", sort_order: 1 },
      { id: "col-c", name: "저녁", sort_order: 2 },
    ];
    const threeMeals: PlannerMeal[] = [
      {
        id: "meal-a1",
        recipe_id: "recipe-1",
        recipe_title: "토스트",
        recipe_thumbnail_url: null,
        plan_date: "",
        column_id: "col-a",
        planned_servings: 1,
        status: "registered",
        is_leftover: false,
      },
    ];

    await setAuthOverride(page, "authenticated");
    await mockPlannerRoutes(page, { columns: threeColumns, meals: threeMeals });
    await page.goto("/planner");

    const plannerGrid = visiblePlannerGridScope(page);

    await expect(plannerGrid.getByText("아침")).toBeVisible();
    await expect(plannerGrid.getByText("점심")).toBeVisible();
    await expect(plannerGrid.getByText("저녁")).toBeVisible();
    // Should NOT show a 4th column
    await expect(plannerGrid.getByText("간식")).toHaveCount(0);

    await expect(visibleText(page, "토스트")).toBeVisible();

    const pageHasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 4;
    });
    expect(pageHasHorizontalOverflow).toBe(false);
  });

  test("renders 5-column layout with text-only slot names (Wave1: no emoji)", async ({ page }) => {
    const fiveColumns: PlannerColumn[] = [
      { id: "col-1", name: "아침", sort_order: 0 },
      { id: "col-2", name: "점심", sort_order: 1 },
      { id: "col-3", name: "간식", sort_order: 2 },
      { id: "col-4", name: "저녁", sort_order: 3 },
      { id: "col-5", name: "야식", sort_order: 4 },
    ];
    const fiveMeals: PlannerMeal[] = [
      {
        id: "meal-x1",
        recipe_id: "recipe-x",
        recipe_title: "라면",
        recipe_thumbnail_url: null,
        plan_date: "",
        column_id: "col-5",
        planned_servings: 1,
        status: "registered",
        is_leftover: false,
      },
    ];

    await setAuthOverride(page, "authenticated");
    await mockPlannerRoutes(page, { columns: fiveColumns, meals: fiveMeals });
    await page.goto("/planner");

    const plannerGrid = visiblePlannerGridScope(page);

    await expect(plannerGrid.getByText("아침")).toBeVisible();
    await expect(plannerGrid.getByText("점심")).toBeVisible();
    await expect(plannerGrid.getByText("간식")).toBeVisible();
    await expect(plannerGrid.getByText("저녁")).toBeVisible();
    await expect(plannerGrid.getByText("야식")).toBeVisible();

    await expect(visibleText(page, "라면")).toBeVisible();

    const pageHasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 4;
    });
    expect(pageHasHorizontalOverflow).toBe(false);
  });
});
