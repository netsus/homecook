import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

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

  let columns: PlannerColumn[] = [
    { id: "column-breakfast", name: "아침", sort_order: 0 },
    { id: "column-lunch", name: "점심", sort_order: 1 },
    { id: "column-dinner", name: "저녁", sort_order: 2 },
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
      recipe_title: "된장찌개",
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
      recipe_title: "계란말이",
      recipe_thumbnail_url: null,
      plan_date: "",
      column_id: "column-dinner",
      planned_servings: 3,
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

  await page.route("**/api/v1/planner/columns", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const body = route.request().postDataJSON() as { name?: string };
    const name = body.name?.trim() ?? "";

    if (columns.length >= 5) {
      await route.fulfill({
        status: 409,
        json: {
          success: false,
          data: null,
          error: {
            code: "MAX_COLUMNS_REACHED",
            message: "최대 5개까지 추가할 수 있어요",
            fields: [],
          },
        },
      });
      return;
    }

    const createdColumn: PlannerColumn = {
      id: `column-${columns.length + 1}`,
      name,
      sort_order: columns.length,
    };

    columns = [...columns, createdColumn];

    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: createdColumn,
        error: null,
      },
    });
  });

  await page.route("**/api/v1/planner/columns/*", async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const columnId = url.pathname.split("/").at(-1) ?? "";
    const targetColumn = columns.find((column) => column.id === columnId);

    if (!targetColumn) {
      await route.fulfill({
        status: 404,
        json: {
          success: false,
          data: null,
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "끼니 컬럼을 찾을 수 없어요.",
            fields: [],
          },
        },
      });
      return;
    }

    if (method === "PATCH") {
      const body = route.request().postDataJSON() as {
        name?: string;
        sort_order?: number;
      };

      if (typeof body.name === "string") {
        targetColumn.name = body.name.trim();
      }

      if (typeof body.sort_order === "number") {
        const sorted = [...columns].sort((left, right) => left.sort_order - right.sort_order);
        const currentIndex = sorted.findIndex((column) => column.id === columnId);
        const [removed] = sorted.splice(currentIndex, 1);

        sorted.splice(body.sort_order, 0, removed!);
        columns = sorted.map((column, index) => ({
          ...column,
          sort_order: index,
        }));
      }

      const updated = columns.find((column) => column.id === columnId)!;
      await route.fulfill({
        json: {
          success: true,
          data: updated,
          error: null,
        },
      });
      return;
    }

    if (method === "DELETE") {
      if (meals.some((meal) => meal.column_id === columnId)) {
        await route.fulfill({
          status: 409,
          json: {
            success: false,
            data: null,
            error: {
              code: "COLUMN_HAS_MEALS",
              message: "식사가 등록된 컬럼은 삭제할 수 없어요.",
              fields: [],
            },
          },
        });
        return;
      }

      columns = columns.filter((column) => column.id !== columnId);
      await route.fulfill({
        status: 204,
        body: "",
      });
      return;
    }

    await route.continue();
  });

  return {
    requestedRanges,
  };
}

async function readColumnNames(page: Page) {
  return page.locator('input:not([placeholder])').evaluateAll((elements) =>
    elements.map((element) => (element as HTMLInputElement).value),
  );
}

function isMobileProject(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("mobile-");
}

async function activateButton(page: Page, button: Locator, testInfo: TestInfo) {
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();

  if (isMobileProject(testInfo)) {
    await button.focus();
    await page.keyboard.press("Enter");
    return;
  }

  await button.click();
}

async function dragColumnHandle(page: Page, source: Locator, target: Locator) {
  await source.dragTo(target);
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

test.describe("Slice 05 planner week core", () => {
  test("authenticated user can manage planner columns and see planner status badges", async ({ page }, testInfo) => {
    await setAuthOverride(page, "authenticated");
    const tracker = await mockPlannerRoutes(page);

    await page.goto("/planner");

    await expect(page.getByRole("heading", { name: "식단 플래너" })).toBeVisible();
    await expect(page.getByText("김치찌개")).toBeVisible();
    await expect(page.getByRole("button", { name: "장보기" })).toBeDisabled();
    await expect(page.getByText("식사 등록 완료")).toBeVisible();
    await expect(page.getByText("장보기 완료")).toBeVisible();
    await expect(page.getByText("요리 완료")).toBeVisible();

    const addColumnInput = page.getByPlaceholder("새 끼니 컬럼 이름");
    await addColumnInput.fill("간식");
    await addColumnInput.press("Enter");

    await expect(page.locator('input[value="간식"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: "컬럼 추가" })).toBeEnabled();

    await addColumnInput.fill("야식");
    await addColumnInput.press("Enter");
    await expect(page.locator('input[value="야식"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: "컬럼 추가" })).toBeEnabled();

    await addColumnInput.fill("브런치");
    await addColumnInput.press("Enter");
    await expect(page.getByText("최대 5개까지 추가할 수 있어요")).toBeVisible();

    await page.locator('input:not([placeholder])').nth(1).fill("브런치");
    await activateButton(page, page.getByRole("button", { name: "저장" }).nth(1), testInfo);
    await expect(page.locator('input[value="브런치"]').first()).toBeVisible();

    await expect(page.getByRole("button", { name: "←" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "→" })).toHaveCount(0);

    const brunchHandle = page.getByRole("button", { name: "브런치 컬럼 순서 변경" });
    await brunchHandle.focus();
    await page.keyboard.press("ArrowRight");

    await expect
      .poll(async () => readColumnNames(page))
      .toEqual(["아침", "저녁", "브런치", "간식", "야식"]);

    await activateButton(page, page.getByRole("button", { name: "삭제" }).nth(0), testInfo);
    await expect(page.getByText("식사가 등록된 컬럼은 삭제할 수 없어요.")).toBeVisible();

    await activateButton(page, page.getByRole("button", { name: "삭제" }).nth(4), testInfo);
    await expect(page.locator('input[value="야식"]')).toHaveCount(0);

    await activateButton(page, page.getByRole("button", { name: "다음 범위" }), testInfo);
    await expect.poll(() => tracker.requestedRanges.length).toBeGreaterThan(1);
  });

  test("desktop user can drag planner columns with the handle and keep the reordered grid", async ({
    page,
  }, testInfo) => {
    test.skip(isMobileProject(testInfo), "pointer drag reorder is covered on desktop only");

    await setAuthOverride(page, "authenticated");
    await mockPlannerRoutes(page);

    await page.goto("/planner");

    const sourceHandle = page.getByRole("button", { name: "점심 컬럼 순서 변경" });
    const targetColumn = page.locator('[data-column-id="column-dinner"]');

    await dragColumnHandle(page, sourceHandle, targetColumn);

    await expect
      .poll(async () => readColumnNames(page))
      .toEqual(["아침", "저녁", "점심"]);

    await page.reload();

    await expect
      .poll(async () => readColumnNames(page))
      .toEqual(["아침", "저녁", "점심"]);
  });

  test("authenticated user can shift the planner range by wheel scrolling", async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo), "wheel interaction is covered on desktop; mobile smoke uses explicit range controls");

    await setAuthOverride(page, "authenticated");
    const tracker = await mockPlannerRoutes(page);

    await page.goto("/planner");

    const grid = page.locator("div.overflow-x-auto").first();
    await grid.hover();
    await page.mouse.wheel(0, 160);

    await expect.poll(() => tracker.requestedRanges.length).toBeGreaterThan(1);
  });

  test("planner grid stays reachable across tablet and mobile widths", async ({ page }, testInfo) => {
    await setAuthOverride(page, "authenticated");
    await mockPlannerRoutes(page);

    if (testInfo.project.name === "desktop-chrome") {
      await page.setViewportSize({ width: 900, height: 1180 });
    }

    await page.goto("/planner");

    const scroller = page.locator("div.overflow-x-auto").first();
    const dinnerInput = page.locator('input[value="저녁"]').first();
    await expect(scroller).toBeVisible();

    if (isMobileProject(testInfo)) {
      await scroller.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
    }

    await dinnerInput.scrollIntoViewIfNeeded();
    await expectVisibleWithinViewport(page, dinnerInput);
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
    await expect(
      page.getByRole("button", { name: /Google로 시작하기|로컬 테스트 계정으로 시작/ }),
    ).toBeVisible();
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

  test("guest user keeps the primary login CTA above bottom tabs on small iOS viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-ios-small");

    await setAuthOverride(page, "guest");

    await page.goto("/planner");

    const primaryCta = page.getByRole("button", {
      name: /Google로 시작하기|로컬 테스트 계정으로 시작/,
    });
    const bottomTabs = page.locator("nav").first();

    await expect(primaryCta).toBeVisible();

    const primaryCtaBox = await primaryCta.boundingBox();
    const bottomTabsBox = await bottomTabs.boundingBox();

    expect(primaryCtaBox).not.toBeNull();
    expect(bottomTabsBox).not.toBeNull();
    expect(primaryCtaBox!.y + primaryCtaBox!.height).toBeLessThanOrEqual(bottomTabsBox!.y - 8);
  });
});
