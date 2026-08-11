import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const PLAN_DATE = "2026-07-23";

async function setAuthenticated(page: Page) {
  await page.addInitScript(
    ({ key }) => window.localStorage.setItem(key, "authenticated"),
    { key: E2E_AUTH_OVERRIDE_KEY },
  );
}

async function installPlannerShellRoutes(page: Page) {
  let deleted = false;
  const requests = {
    nutrition: 0,
    productMethods: [] as string[],
  };

  await page.route("**/api/v1/planner/nutrition?*", async (route) => {
    requests.nutrition += 1;
    await route.fulfill({ status: 500, json: {} });
  });

  await page.route("**/api/v1/planner?*", async (route) => {
    await route.fulfill({
      json: {
        data: {
          columns: [
            { id: "column-breakfast", name: "아침", sort_order: 0 },
            { id: "column-lunch", name: "점심", sort_order: 1 },
            {
              id: "column-long",
              name: "아주 긴 사용자 지정 브런치 이름",
              sort_order: 2,
            },
          ],
          meals: [
            {
              column_id: "column-breakfast",
              id: "meal-registered",
              is_leftover: false,
              plan_date: PLAN_DATE,
              planned_servings: 2,
              recipe_id: "recipe-1",
              recipe_thumbnail_url: null,
              recipe_title: "김치찌개",
              status: "registered",
            },
            {
              column_id: "column-lunch",
              id: "meal-shopping-done",
              is_leftover: false,
              plan_date: PLAN_DATE,
              planned_servings: 1,
              recipe_id: "recipe-2",
              recipe_thumbnail_url: null,
              recipe_title: "샐러드",
              status: "shopping_done",
            },
          ],
          product_entries: deleted
            ? []
            : [
                {
                  basis_relations: [],
                  column_id: "column-lunch",
                  entry_type: "product",
                  id: "legacy-product-1",
                  nutrition: {
                    basis: { amount: 1, unit: "serving" },
                    calculation_quality: "direct",
                    calculation_status: "complete",
                    sources: [],
                    values: {
                      energy_kcal: {
                        amount: 105,
                        display_mode: "total",
                        known_amount: null,
                        status: "complete",
                      },
                    },
                    warnings: [],
                  },
                  plan_date: PLAN_DATE,
                  product_brand: "무먹 식품",
                  product_id: "product-1",
                  product_name: "플레인 요거트",
                  product_nutrition_version_id: "version-1",
                  quantity: { amount: 1, unit: "serving" },
                  workflow_status: null,
                },
              ],
        },
        error: null,
        success: true,
      },
    });
  });

  await page.route("**/api/v1/product-planner-entries/**", async (route) => {
    requests.productMethods.push(route.request().method());
    if (route.request().method() !== "DELETE") {
      await route.fulfill({ status: 405, json: {} });
      return;
    }
    deleted = true;
    await route.fulfill({
      json: {
        data: { deleted: true, entry_id: "legacy-product-1" },
        error: null,
        success: true,
      },
    });
  });

  return requests;
}

test.describe("planner-shell Stage 4", () => {
  test("planner-shell preserves segment/date history, roving focus, and the two-day overview @smoke-core", async ({
    page,
  }) => {
    await setAuthenticated(page);
    const requests = await installPlannerShellRoutes(page);

    await page.goto(`/planner?date=${PLAN_DATE}`);

    const planTab = page.getByRole("tab", { name: "요리 계획" });
    const logTab = page.getByRole("tab", { name: "식사 기록" });
    await expect(planTab).toHaveAttribute("aria-selected", "true");
    await expect(planTab).toHaveAttribute("tabindex", "0");
    await expect(logTab).toHaveAttribute("tabindex", "-1");
    await expect(page.getByTestId("planner-week-date-rail").locator("li"))
      .toHaveCount(7);
    await expect(page.getByTestId("planner-two-day-overview").locator(":scope > div"))
      .toHaveCount(2);
    await expect(page.getByText("김치찌개", { exact: true })).toBeVisible();
    await expect(page.getByText("비어 있음", { exact: true })).toBeVisible();
    await expect(page.getByText(/계획 영양/)).toHaveCount(0);

    await planTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(logTab).toBeFocused();
    await expect(logTab).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/segment=log/);
    await expect(
      page.getByRole("heading", { name: "식사 기록은 준비 중이에요" }),
    ).toBeVisible();

    await page.goBack();
    await expect(planTab).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(new RegExp(`date=${PLAN_DATE}`));
    expect(requests.nutrition).toBe(0);
    expect(requests.productMethods).toEqual([]);

    const pageHasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 4,
    );
    expect(pageHasHorizontalOverflow).toBe(false);
  });

  test("planner-shell guest keeps the requested segment/date for login @smoke-core", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key }) => window.localStorage.setItem(key, "guest"),
      { key: E2E_AUTH_OVERRIDE_KEY },
    );
    await page.goto(`/planner?segment=log&date=${PLAN_DATE}`);

    await expect(
      page.getByRole("heading", { name: "이 화면은 로그인이 필요해요" }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`segment=log.*date=${PLAN_DATE}`),
    );
    await expect(page.getByRole("button", { name: "Google로 시작하기" }))
      .toBeVisible();
  });

  test("planner-shell keeps legacy product plans read/detail/delete-only with focus restore", async ({
    page,
  }) => {
    await setAuthenticated(page);
    const requests = await installPlannerShellRoutes(page);
    await page.goto(`/planner?date=${PLAN_DATE}`);

    const invoker = page.getByRole("button", { name: "플레인 요거트 상세 보기" });
    await expect(invoker).toBeVisible();
    await expect(page.getByText("완제품 추가")).toHaveCount(0);
    await expect(page.getByText("수정", { exact: true })).toHaveCount(0);

    await invoker.click();
    const detail = page.getByRole("dialog", { name: "플레인 요거트" });
    await expect(detail).toHaveAttribute("data-app-overlay-shell", "bottom-sheet");
    await expect(detail.getByRole("button", { name: "닫기" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(detail).toHaveCount(0);
    await expect(invoker).toBeFocused();

    await invoker.click();
    await detail.getByRole("button", { name: "계획에서 삭제" }).click();
    const confirm = page.getByRole("dialog", { name: "완제품 계획 삭제" });
    await expect(confirm).toBeVisible();
    await expect(requests.productMethods).toEqual([]);
    await confirm.getByRole("button", { name: "삭제" }).click();

    await expect(invoker).toHaveCount(0);
    expect(requests.productMethods).toEqual(["DELETE"]);
    expect(requests.nutrition).toBe(0);
  });
});
