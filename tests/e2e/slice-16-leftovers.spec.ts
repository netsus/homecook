import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";

interface LeftoverItem {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_thumbnail_url: string | null;
  status: "leftover" | "eaten";
  cooked_at: string;
  eaten_at: string | null;
  cooking_servings: number;
  source_meal_label: string | null;
  source_planned_servings: number | null;
}

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

function makeLeftoverItems(): LeftoverItem[] {
  return [
    {
      id: "ld-1",
      recipe_id: "recipe-1",
      recipe_title: "김치찌개",
      recipe_thumbnail_url: null,
      status: "leftover",
      cooked_at: "2026-04-28T10:00:00.000Z",
      eaten_at: null,
      cooking_servings: 2,
      source_meal_label: "저녁",
      source_planned_servings: 2,
    },
    {
      id: "ld-2",
      recipe_id: "recipe-2",
      recipe_title: "된장찌개",
      recipe_thumbnail_url: null,
      status: "leftover",
      cooked_at: "2026-04-27T10:00:00.000Z",
      eaten_at: null,
      cooking_servings: 1,
      source_meal_label: "점심",
      source_planned_servings: 1,
    },
  ];
}

function makeEatenItems(): LeftoverItem[] {
  return [
    {
      id: "ld-3",
      recipe_id: "recipe-1",
      recipe_title: "김치찌개",
      recipe_thumbnail_url: null,
      status: "eaten",
      cooked_at: "2026-04-20T10:00:00.000Z",
      eaten_at: "2026-04-28T12:00:00.000Z",
      cooking_servings: 2,
      source_meal_label: "저녁",
      source_planned_servings: 2,
    },
  ];
}

async function installLeftoverRoutes(
  page: Page,
  options?: {
    leftoverItems?: LeftoverItem[];
    eatenItems?: LeftoverItem[];
  },
) {
  const leftoverItems = options?.leftoverItems ?? makeLeftoverItems();
  const eatenItems = options?.eatenItems ?? makeEatenItems();

  await page.route("**/api/v1/leftovers?*", async (route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get("status") ?? "leftover";

    const items = status === "eaten" ? eatenItems : leftoverItems;

    await route.fulfill({
      json: {
        success: true,
        data: { items },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/leftovers/*/eat", async (route) => {
    const urlParts = route.request().url().split("/");
    const idIndex = urlParts.indexOf("leftovers") + 1;
    const id = urlParts[idIndex];

    const item = leftoverItems.find((i) => i.id === id);

    if (item) {
      item.status = "eaten";
      item.eaten_at = new Date().toISOString();
      eatenItems.push({ ...item });
      leftoverItems.splice(leftoverItems.indexOf(item), 1);
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          id,
          status: "eaten",
          eaten_at: new Date().toISOString(),
          auto_hide_at: "2026-05-29T00:00:00.000Z",
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/leftovers/*/uneat", async (route) => {
    const urlParts = route.request().url().split("/");
    const idIndex = urlParts.indexOf("leftovers") + 1;
    const id = urlParts[idIndex];

    const item = eatenItems.find((i) => i.id === id);

    if (item) {
      item.status = "leftover";
      item.eaten_at = null;
      leftoverItems.push({ ...item });
      eatenItems.splice(eatenItems.indexOf(item), 1);
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          id,
          status: "leftover",
          eaten_at: null,
          auto_hide_at: null,
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/planner?*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: [
            { id: "col-1", name: "아침", sort_order: 0 },
            { id: "col-2", name: "점심", sort_order: 1 },
          ],
          meals: [],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/meals", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();

      await route.fulfill({
        json: {
          success: true,
          data: {
            id: "meal-new",
            recipe_id: body.recipe_id,
            plan_date: body.plan_date,
            column_id: body.column_id,
            planned_servings: body.planned_servings ?? 1,
            status: "registered",
            is_leftover: true,
            leftover_dish_id: body.leftover_dish_id,
          },
          error: null,
        },
      });
    } else {
      await route.continue();
    }
  });
}

test.describe("LEFTOVERS screen", () => {
  test("shows leftover list when authenticated", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installLeftoverRoutes(page);
    await page.goto("/leftovers");

    await expect(page.getByTestId("leftover-card").first()).toBeVisible();
    await expect(page.getByTestId("eat-button").first()).toBeVisible();
    await expect(page.getByTestId("planner-add-button").first()).toBeVisible();
    await expect(
      page
        .getByRole("button", {
          name: isMobileViewport(page) ? /다먹음/ : "다 먹었어요",
        })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("button", {
          name: isMobileViewport(page) ? /날짜 끼니에 추가/ : /플래너에 추가/,
        })
        .first(),
    ).toBeVisible();
    await expect(page.getByTestId("leftover-card")).toHaveCount(2);
  });

  test("eat action removes item from list", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installLeftoverRoutes(page);
    await page.goto("/leftovers");

    await expect(page.getByTestId("leftover-card").first()).toBeVisible();
    await page.getByTestId("eat-button").first().click();

    await expect(page.getByTestId("feedback-toast")).toBeVisible();
    await expect(page.getByTestId("feedback-toast")).toContainText("다먹음 처리됐어요");
    await expect(page.getByTestId("leftover-card")).toHaveCount(1);
  });

  test("shows empty state when all leftovers are eaten", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installLeftoverRoutes(page, { leftoverItems: makeLeftoverItems().slice(0, 1) });
    await page.goto("/leftovers");

    await expect(page.getByTestId("leftover-card").first()).toBeVisible();
    await page.getByTestId("eat-button").first().click();

    await expect(page.getByText("남은 요리가 없어요")).toBeVisible();
  });

  test("planner add opens sheet", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installLeftoverRoutes(page);
    await page.goto("/leftovers");

    await expect(page.getByTestId("leftover-card").first()).toBeVisible();
    await page.getByTestId("planner-add-button").first().click();

    await expect(page.getByText("날짜와 끼니를 선택해 주세요")).toBeVisible();
  });

  test("shows login gate for unauthenticated users", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await page.goto("/leftovers");

    await expect(page.getByText("이 화면은 로그인이 필요해요")).toBeVisible();
    await expect(page.getByText("이전 화면으로 돌아가기")).toBeVisible();
  });

  test("has navigation link to ate-list", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installLeftoverRoutes(page);
    await page.goto("/leftovers");

    await expect(
      page.getByRole("heading", {
        name: isMobileViewport(page) ? "남은 요리" : /남은 요리 \d+개/,
      }),
    ).toBeVisible();
    const ateLink = page.getByText("다먹은 요리");
    await expect(ateLink).toBeVisible();
    const ateHref = await ateLink.getAttribute("href");
    expect(ateHref).toContain("/leftovers/ate");
    expect(ateHref).toContain("returnTo=");
    expect(ateHref).toContain("returnSurface=leftovers.list");
  });
});

test.describe("ATE_LIST screen", () => {
  test("shows eaten items", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installLeftoverRoutes(page);
    await page.goto("/leftovers/ate");

    await expect(page.getByTestId("ate-list-card").first()).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: isMobileViewport(page) ? "남은 요리로 복귀" : "되돌리기",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(isMobileViewport(page) ? "4/28 다먹음" : "4월 28일"),
    ).toBeVisible();
    await expect(page.getByText("다먹음으로 기록")).toHaveCount(0);
    if (isMobileViewport(page)) {
      await expect(page.getByText("다시 만들기")).toHaveCount(0);
    } else {
      await expect(page.getByRole("link", { name: "다시 만들기" })).toBeVisible();
    }
  });

  test("uneat action removes item from eaten list", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installLeftoverRoutes(page);
    await page.goto("/leftovers/ate");

    await expect(page.getByTestId("ate-list-card").first()).toBeVisible();
    await page
      .getByRole("button", {
        name: isMobileViewport(page) ? "남은 요리로 복귀" : "되돌리기",
      })
      .click();

    await expect(page.getByTestId("feedback-toast")).toBeVisible();
    await expect(page.getByTestId("feedback-toast")).toContainText("남은 요리로 복귀됐어요");
  });

  test("shows login gate for unauthenticated users", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await page.goto("/leftovers/ate");

    await expect(page.getByText("이 화면은 로그인이 필요해요")).toBeVisible();
    await expect(page.getByText("이전 화면으로 돌아가기")).toBeVisible();
  });

  test("shows empty state when no eaten items", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installLeftoverRoutes(page, { eatenItems: [] });
    await page.goto("/leftovers/ate");

    await expect(
      page.getByText(
        isMobileViewport(page) ? "다먹은 요리가 없어요" : "아직 다먹은 요리가 없어요",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        isMobileViewport(page)
          ? "먹은 기록이 여기에 모여요"
          : "요리를 완료하거나 남은 요리에서 '다 먹었어요'를 누르면 여기에 기록됩니다.",
      ),
    ).toBeVisible();
  });

  test("has back link to leftovers", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installLeftoverRoutes(page);
    await page.goto("/leftovers/ate");

    await expect(page.getByTestId("ate-list-card").first()).toBeVisible();
    const backLink = isMobileViewport(page)
      ? page.getByLabel("뒤로가기")
      : page.getByRole("link", { name: "남은 요리" });
    await expect(backLink).toHaveAttribute("href", "/leftovers");
  });
});
