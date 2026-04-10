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

async function mockPlannerRoutes(page: Page) {
  const requestedRanges: string[] = [];

  const columns: PlannerColumn[] = [
    { id: "column-breakfast", name: "아침", sort_order: 0 },
    { id: "column-lunch", name: "점심", sort_order: 1 },
    { id: "column-snack", name: "간식", sort_order: 2 },
    { id: "column-dinner", name: "저녁", sort_order: 3 },
  ];
  const meals: PlannerMeal[] = [
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

async function swipeWeekStrip(page: Page, direction: "next" | "prev") {
  const strip = page.getByTestId("planner-week-strip-viewport");

  await strip.evaluate((element, nextDirection) => {
    const viewport = element as HTMLDivElement;
    const pageWidth = viewport.clientWidth;

    viewport.scrollLeft = nextDirection === "next" ? pageWidth * 2 : 0;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, direction);
  await page.waitForTimeout(140);
}

async function centerWeekStrip(page: Page) {
  const strip = page.getByTestId("planner-week-strip-viewport");

  await strip.evaluate((element) => {
    const viewport = element as HTMLDivElement;
    viewport.scrollLeft = viewport.clientWidth;
  });
}

test.describe("Slice 05 planner week core", () => {
  test("authenticated user sees fixed four-slot day cards and planner status badges", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockPlannerRoutes(page);

    await page.goto("/planner");

    const firstDayCard = page.getByLabel(/식단 카드$/).first();

    await expect(page.getByRole("heading", { name: "식단 플래너" })).toBeVisible();
    await expect(page.getByText("현재 범위")).toHaveCount(1);
    await expect(page.getByText("화면 상태")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "이전 주" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다음 주" })).toHaveCount(0);
    await expect(page.getByTestId("planner-week-strip-page-current").locator("li")).toHaveCount(7);
    await expect(firstDayCard.getByText("아침")).toBeVisible();
    await expect(firstDayCard.getByText("점심")).toBeVisible();
    await expect(firstDayCard.getByText("간식")).toBeVisible();
    await expect(firstDayCard.getByText("저녁")).toBeVisible();
    await expect(page.getByText("김치찌개")).toBeVisible();
    await expect(page.getByText("샐러드")).toBeVisible();
    await expect(page.getByText("과일볼")).toBeVisible();
    await expect(page.getByLabel("식사 등록 완료")).toBeVisible();
    await expect(page.getByLabel("장보기 완료")).toBeVisible();
    await expect(page.getByLabel("요리 완료")).toBeVisible();
    await expect(page.getByRole("button", { name: "장보기" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "요리하기" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "남은요리" })).toBeDisabled();
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

    await expect.poll(() => tracker.requestedRanges.length).toBeGreaterThan(0);
    const initialRange = tracker.requestedRanges[0];

    await swipeWeekStrip(page, "next");

    await expect.poll(() => tracker.requestedRanges.length).toBeGreaterThan(1);
    await expect(page.getByRole("button", { name: "이번주로 가기" })).toBeVisible();
    await page.getByRole("button", { name: "이번주로 가기" }).click();
    await expect.poll(() => tracker.requestedRanges.at(-1)).toBe(initialRange);
  });

  test("planner CTA buttons keep a consistent disabled treatment", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockPlannerRoutes(page);

    await page.goto("/planner");

    const styles = await Promise.all(
      ["장보기", "요리하기", "남은요리"].map(async (name) => {
        const button = page.getByRole("button", { name });
        await expect(button).toBeDisabled();

        return button.evaluate((element) => {
          const style = window.getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            color: style.color,
            cursor: style.cursor,
            opacity: style.opacity,
          };
        });
      }),
    );

    expect(new Set(styles.map((style) => JSON.stringify(style))).size).toBe(1);
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

    await expect(page.getByRole("heading", { name: "식단 플래너" })).toBeVisible();
    await expect(page.getByText("김치찌개")).toBeVisible();
  });
});
