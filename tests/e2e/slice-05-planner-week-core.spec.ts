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
  ];

  await page.route("**/api/v1/planner?*", async (route) => {
    const url = new URL(route.request().url());
    const startDate = url.searchParams.get("start_date") ?? "";
    const endDate = url.searchParams.get("end_date") ?? "";
    requestedRanges.push(`${startDate}:${endDate}`);
    meals[0] = {
      ...meals[0]!,
      plan_date: startDate,
    };

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

test.describe("Slice 05 planner week core", () => {
  test("authenticated user can view planner and add a column", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const tracker = await mockPlannerRoutes(page);

    await page.goto("/planner");

    await expect(page.getByRole("heading", { name: "식단 플래너" })).toBeVisible();
    await expect(page.getByText("김치찌개")).toBeVisible();
    await expect(page.getByRole("button", { name: "장보기" })).toBeDisabled();

    const addColumnInput = page.getByPlaceholder("새 끼니 컬럼 이름");
    await addColumnInput.fill("간식");
    await addColumnInput.press("Enter");

    await expect(page.locator('input[value="간식"]').first()).toBeVisible();

    await page.getByRole("button", { name: "다음 범위" }).click();
    await expect.poll(() => tracker.requestedRanges.length).toBeGreaterThan(1);
  });

  test("guest user sees unauthorized state on planner route", async ({ page }) => {
    await setAuthOverride(page, "guest");

    await page.goto("/planner");

    await expect(page.getByText("이 화면은 로그인이 필요해요")).toBeVisible();
    await expect(page.getByRole("button", { name: "Google로 시작하기" })).toBeVisible();
  });

  test("guest user keeps the primary login CTA above bottom tabs on small iOS viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-ios-small");

    await setAuthOverride(page, "guest");

    await page.goto("/planner");

    const primaryCta = page.getByRole("button", { name: "Google로 시작하기" });
    const bottomTabs = page.locator("nav").first();

    await expect(primaryCta).toBeVisible();

    const primaryCtaBox = await primaryCta.boundingBox();
    const bottomTabsBox = await bottomTabs.boundingBox();

    expect(primaryCtaBox).not.toBeNull();
    expect(bottomTabsBox).not.toBeNull();
    expect(primaryCtaBox!.y + primaryCtaBox!.height).toBeLessThanOrEqual(bottomTabsBox!.y - 8);
  });
});
