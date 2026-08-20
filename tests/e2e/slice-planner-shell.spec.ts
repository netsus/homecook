import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const FIXED_NOW = "2026-07-23T09:00:00.000+09:00";
const PLAN_DATE = "2026-07-23";

async function setAuthenticated(page: Page) {
  await page.addInitScript(
    ({ key }) => window.localStorage.setItem(key, "authenticated"),
    { key: E2E_AUTH_OVERRIDE_KEY },
  );
}

async function installPlannerShellRoutes(
  page: Page,
  {
    columnCount = 3,
    deleteMode = "success",
    emptyPlanner = false,
    plannerMode = "success",
  }: {
    columnCount?: 1 | 3 | 5;
    deleteMode?: "error" | "pending" | "success";
    emptyPlanner?: boolean;
    plannerMode?: "error" | "pending" | "success";
  } = {},
) {
  let deleted = false;
  let releasePendingDelete: (() => void) | null = null;
  let releasePendingPlanner: (() => void) | null = null;
  const requests = {
    mealLog: 0,
    nutrition: 0,
    plannerRanges: [] as string[],
    productMethods: [] as string[],
    releasePendingDelete: () => releasePendingDelete?.(),
    releasePendingPlanner: () => releasePendingPlanner?.(),
  };
  await page.route("**/api/v1/meal-log?*", async (route) => {
    requests.mealLog += 1;
    const date = new URL(route.request().url()).searchParams.get("date") ?? PLAN_DATE;
    const mealColumnId = "20000000-0000-4000-8000-000000000001";
    const zero = { calculation_status: "complete", calories_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0, sodium_mg: 0 };
    await route.fulfill({
      json: {
        success: true,
        data: {
          date,
          active_columns: [{ id: mealColumnId, name: "아침", sort_order: 0 }],
          active_sections: [{ meal_plan_column_id: mealColumnId, slot_name_snapshot: "아침", sort_order: 0, entries: [], subtotal: zero, incomplete_count: 0 }],
          deleted_column_sections: [],
          entries: [],
          day_total: { ...zero, incomplete_count: 0 },
        },
        error: null,
      },
    });
  });
  const columns = [
    { id: "column-breakfast", name: "아침", sort_order: 0 },
    { id: "column-lunch", name: "점심", sort_order: 1 },
    {
      id: "column-long",
      name: "아주 긴 사용자 지정 오후 브런치 시간",
      sort_order: 2,
    },
    { id: "column-snack", name: "간식과 가벼운 차", sort_order: 3 },
    { id: "column-dinner", name: "늦은 저녁 식사", sort_order: 4 },
  ].slice(0, columnCount);

  await page.route("**/api/v1/planner/nutrition?*", async (route) => {
    requests.nutrition += 1;
    await route.fulfill({ status: 500, json: {} });
  });

  await page.route("**/api/v1/planner?*", async (route) => {
    if (plannerMode === "pending") {
      await new Promise<void>((resolve) => {
        releasePendingPlanner = resolve;
      });
    }
    if (plannerMode === "error") {
      await route.fulfill({
        status: 500,
        json: {
          data: null,
          error: { code: "INTERNAL_ERROR", fields: [], message: "플래너 조회 실패" },
          success: false,
        },
      });
      return;
    }
    const url = new URL(route.request().url());
    requests.plannerRanges.push(
      `${url.searchParams.get("start_date")}:${url.searchParams.get("end_date")}`,
    );
    await route.fulfill({
      json: {
        data: {
          columns,
          meals: emptyPlanner ? [] : [
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
            ...(columnCount === 5
              ? [
                  {
                    column_id: "column-long",
                    id: "meal-cook-done",
                    is_leftover: false,
                    plan_date: PLAN_DATE,
                    planned_servings: 3,
                    recipe_id: "recipe-3",
                    recipe_thumbnail_url: null,
                    recipe_title: "된장찌개와 계절 채소를 곁들인 집밥",
                    status: "cook_done",
                  },
                ]
              : []),
          ],
          product_entries: deleted || emptyPlanner
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
    if (deleteMode === "pending") {
      await new Promise<void>((resolve) => {
        releasePendingDelete = resolve;
      });
    }
    if (deleteMode === "error") {
      await route.fulfill({
        status: 500,
        json: {
          data: null,
          error: {
            code: "INTERNAL_ERROR",
            fields: [],
            message: "완제품 계획을 삭제하지 못했어요.",
          },
          success: false,
        },
      });
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
      page.getByRole("heading", { name: "7월 23일 목요일 식사 기록" }),
    ).toBeVisible();
    expect(requests.mealLog).toBe(7);

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

  test("legacy-product-compat guest keeps the requested segment/date for login @smoke-core", async ({
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

  test("planner-shell reloads the originating week on browser Back without duplicating history @smoke-core", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    await setAuthenticated(page);
    const requests = await installPlannerShellRoutes(page);

    await page.goto(`/planner?date=${PLAN_DATE}`);
    await expect(page.getByRole("heading", { name: "목 7월 23일" })).toBeVisible();
    await expect.poll(() => requests.plannerRanges).toEqual([
      "2026-07-20:2026-07-26",
    ]);
    const initialHistoryLength = await page.evaluate(() => window.history.length);

    await page.getByRole("button", { name: "다음 주" }).click();
    await expect(page).toHaveURL(/date=2026-07-27/);
    await expect.poll(() => requests.plannerRanges).toEqual([
      "2026-07-20:2026-07-26",
      "2026-07-27:2026-08-02",
    ]);
    const shiftedHistoryLength = await page.evaluate(() => window.history.length);
    expect(shiftedHistoryLength).toBe(initialHistoryLength + 1);

    await page.getByRole("button", { name: "7/27 월 선택" }).click();
    await expect(page).toHaveURL(/date=2026-07-27/);
    await expect.poll(() => requests.plannerRanges).toEqual([
      "2026-07-20:2026-07-26",
      "2026-07-27:2026-08-02",
    ]);
    expect(await page.evaluate(() => window.history.length)).toBe(shiftedHistoryLength);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`date=${PLAN_DATE}`));
    await expect(page.getByRole("heading", { name: "목 7월 23일" })).toBeVisible();
    await expect.poll(() => requests.plannerRanges).toEqual([
      "2026-07-20:2026-07-26",
      "2026-07-27:2026-08-02",
      "2026-07-20:2026-07-26",
    ]);
    expect(await page.evaluate(() => window.history.length)).toBe(shiftedHistoryLength);

    await page.goForward();
    await expect(page).toHaveURL(/date=2026-07-27/);
    await expect.poll(() => requests.plannerRanges).toEqual([
      "2026-07-20:2026-07-26",
      "2026-07-27:2026-08-02",
      "2026-07-20:2026-07-26",
      "2026-07-27:2026-08-02",
    ]);
    expect(await page.evaluate(() => window.history.length)).toBe(shiftedHistoryLength);
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

  test("legacy-product-compat traps nested focus and restores it at 390px, 320px, and desktop", async ({
    page,
  }) => {
    await setAuthenticated(page);
    await installPlannerShellRoutes(page);

    for (const viewport of [
      { height: 844, width: 390 },
      { height: 693, width: 320 },
      { height: 900, width: 1280 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/planner?date=${PLAN_DATE}`);

      const invoker = page.getByRole("button", {
        name: "플레인 요거트 상세 보기",
      });
      await invoker.click();
      const detail = page.getByRole("dialog", { name: "플레인 요거트" });
      await expect(detail.getByRole("button", { name: "닫기" })).toBeFocused();
      expect(await page.evaluate(() => (
        document.documentElement.scrollWidth
        <= document.documentElement.clientWidth + 1
      ))).toBe(true);
      expect(await detail.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= window.innerWidth + 1;
      })).toBe(true);

      const deleteInvoker = detail.getByRole("button", { name: "계획에서 삭제" });
      await deleteInvoker.click();
      const confirm = page.getByRole("dialog", { name: "완제품 계획 삭제" });
      await expect(confirm.getByRole("button", { name: "닫기" })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(confirm.getByRole("button", { name: "삭제" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(confirm).toHaveCount(0);
      await expect(deleteInvoker).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(detail).toHaveCount(0);
      await expect(invoker).toBeFocused();
    }
  });

  test("legacy-product-compat blocks duplicate delete while pending", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await setAuthenticated(page);
    const requests = await installPlannerShellRoutes(page, {
      deleteMode: "pending",
    });
    await page.goto(`/planner?date=${PLAN_DATE}`);

    await page.getByRole("button", { name: "플레인 요거트 상세 보기" }).click();
    await page.getByRole("button", { name: "계획에서 삭제" }).click();
    const confirm = page.getByRole("dialog", { name: "완제품 계획 삭제" });
    await confirm.getByRole("button", { name: "삭제" }).click();
    await expect(confirm.getByRole("button", { name: "삭제 중" })).toBeDisabled();
    expect(requests.productMethods).toEqual(["DELETE"]);

    requests.releasePendingDelete();
    await expect(page.getByRole("button", {
      name: "플레인 요거트 상세 보기",
    })).toHaveCount(0);
    expect(requests.productMethods).toEqual(["DELETE"]);
  });

  test("legacy-product-compat keeps pinned row and detail after delete error", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 693, width: 320 });
    await setAuthenticated(page);
    const requests = await installPlannerShellRoutes(page, { deleteMode: "error" });
    await page.goto(`/planner?date=${PLAN_DATE}`);

    const invoker = page.getByRole("button", { name: "플레인 요거트 상세 보기" });
    await invoker.click();
    await page.getByRole("button", { name: "계획에서 삭제" }).click();
    const confirm = page.getByRole("dialog", { name: "완제품 계획 삭제" });
    await confirm.getByRole("button", { name: "삭제" }).click();

    await expect(page.getByRole("alert")).toContainText(
      "완제품 계획을 삭제하지 못했어요.",
    );
    await expect(confirm).toBeVisible();
    await expect(page.getByTestId("legacy-product-detail-sheet")).toBeAttached();
    await expect(page.getByTestId("legacy-product-legacy-product-1"))
      .toBeAttached();
    expect(requests.productMethods).toEqual(["DELETE"]);
  });

  test("legacy-product-compat preserves planner loading before the read-only row", async ({
    page,
  }) => {
    await setAuthenticated(page);
    const requests = await installPlannerShellRoutes(page, { plannerMode: "pending" });
    await page.goto(`/planner?date=${PLAN_DATE}`);

    await expect(page.getByTestId("planner-loading-state")).toBeVisible();
    requests.releasePendingPlanner();
    await expect(page.getByRole("heading", { name: "기존 완제품 계획" }))
      .toBeVisible();
  });

  test("legacy-product-compat preserves the planner empty state", async ({ page }) => {
    await setAuthenticated(page);
    await installPlannerShellRoutes(page, { emptyPlanner: true });
    await page.goto(`/planner?date=${PLAN_DATE}`);

    await expect(page.getByText("비어 있음", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "기존 완제품 계획" }))
      .toHaveCount(0);
  });

  test("legacy-product-compat preserves the planner load error and retry action", async ({
    page,
  }) => {
    await setAuthenticated(page);
    await installPlannerShellRoutes(page, { plannerMode: "error" });
    await page.goto(`/planner?date=${PLAN_DATE}`);

    await expect(page.getByRole("heading", {
      name: "플래너를 불러오지 못했어요",
    })).toBeVisible();
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  });

  test("planner-shell keeps 320px targets, 200% text, and bottom actions usable", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 693, width: 320 });
    await setAuthenticated(page);
    await installPlannerShellRoutes(page, { columnCount: 5 });
    await page.goto(`/planner?date=${PLAN_DATE}`);
    await expect(page.getByText("된장찌개와 계절 채소를 곁들인 집밥"))
      .toBeVisible();

    const measureLayout = () => page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>(
        '[data-testid="planner-week-date-rail"]',
      );
      const dateButtons = [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[data-testid="planner-week-date-rail"] button',
        ),
      ];
      const bottomTab = document.querySelector<HTMLElement>(
        'nav[aria-label="플래너 하단 탭"]',
      );
      const planPanel = document.querySelector<HTMLElement>("#planner-plan-panel");
      const weekShell = document.querySelector<HTMLElement>(
        '[data-testid="planner-week-shell"]',
      );
      const textTargets = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="tab"], [aria-label="주간 이동"] > div p, '
            + '[data-testid="planner-two-day-overview"] p, '
            + '#planner-week-body h3, #planner-plan-panel a',
        ),
      ].filter((element) => (element.textContent ?? "").trim().length >= 2);

      const textRuns = textTargets.map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const lineRects = [...range.getClientRects()].filter(
          (rect) => rect.width > 0 && rect.height > 0,
        );
        const style = getComputedStyle(element);
        return {
          clipped:
            element.scrollHeight > element.clientHeight + 1
            || element.scrollWidth > element.clientWidth + 1,
          fontSize: Number.parseFloat(style.fontSize),
          maxLineWidth: Math.max(0, ...lineRects.map((rect) => rect.width)),
          text: (element.textContent ?? "").trim().replace(/\s+/g, " "),
        };
      });

      return {
        bottomClearance:
          bottomTab && planPanel
            ? Math.round(bottomTab.getBoundingClientRect().top
              - planPanel.getBoundingClientRect().bottom)
            : null,
        dateTargets: dateButtons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { height: rect.height, width: rect.width };
        }),
        horizontalGutters: weekShell
          ? {
              left: Math.round(weekShell.getBoundingClientRect().left),
              right: Math.round(
                window.innerWidth - weekShell.getBoundingClientRect().right,
              ),
            }
          : null,
        overviewCount: document.querySelectorAll(
          '[data-testid="planner-two-day-overview"] > div',
        ).length,
        pageOverflow:
          document.documentElement.scrollWidth
          > document.documentElement.clientWidth + 1,
        railContained: rail
          ? rail.getBoundingClientRect().right <= window.innerWidth + 1
            && rail.getBoundingClientRect().left >= -1
          : false,
        railScrollable: rail ? rail.scrollWidth > rail.clientWidth : false,
        textRuns,
      };
    });

    const defaultLayout = await measureLayout();
    expect.soft(defaultLayout.dateTargets).toHaveLength(7);
    expect.soft(defaultLayout.dateTargets.every(
      ({ height, width }) => height >= 44 && width >= 44,
    )).toBe(true);
    expect.soft(defaultLayout.railContained).toBe(true);
    expect.soft(defaultLayout.railScrollable).toBe(true);
    expect.soft(defaultLayout.pageOverflow).toBe(false);
    expect.soft(defaultLayout.overviewCount).toBe(2);
    expect.soft(defaultLayout.horizontalGutters).toEqual({ left: 16, right: 16 });

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    const defaultBottomLayout = await measureLayout();
    expect.soft(defaultBottomLayout.bottomClearance ?? 0)
      .toBeGreaterThanOrEqual(16);

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(100);

    const scaledLayout = await measureLayout();
    expect.soft(scaledLayout.pageOverflow).toBe(false);
    expect.soft(scaledLayout.overviewCount).toBe(2);
    expect.soft(scaledLayout.horizontalGutters).toEqual({ left: 16, right: 16 });
    expect.soft(scaledLayout.dateTargets.every(
      ({ height, width }) => height >= 44 && width >= 44,
    )).toBe(true);
    expect.soft(scaledLayout.textRuns.filter(
      ({ clipped, fontSize, maxLineWidth }) =>
        clipped || maxLineWidth < fontSize * 1.5,
    )).toEqual([]);
    expect.soft(scaledLayout.bottomClearance).not.toBeNull();
    expect.soft(scaledLayout.bottomClearance ?? 0).toBeGreaterThanOrEqual(16);

    for (const viewport of [
      { height: 844, width: 390 },
      { height: 900, width: 1280 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/planner?date=${PLAN_DATE}`);
      await expect(page.getByTestId("planner-week-date-rail")).toBeVisible();
      const layout = await measureLayout();
      expect.soft(layout.dateTargets).toHaveLength(7);
      expect.soft(layout.dateTargets.every(
        ({ height, width }) => height >= 44 && width >= 44,
      )).toBe(true);
      expect.soft(layout.pageOverflow).toBe(false);
      expect.soft(layout.overviewCount).toBe(2);
      if (viewport.width === 390) {
        expect.soft(layout.horizontalGutters).toEqual({ left: 16, right: 16 });
        await page.evaluate(
          () => window.scrollTo(0, document.documentElement.scrollHeight),
        );
        await page.waitForTimeout(100);
        const bottomLayout = await measureLayout();
        expect.soft(bottomLayout.bottomClearance ?? 0)
          .toBeGreaterThanOrEqual(16);
      }
    }
  });

  test("planner-shell cold Sunday deep link scrolls the 320px date rail to the selected date", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 693, width: 320 });
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    await setAuthenticated(page);
    await installPlannerShellRoutes(page, { columnCount: 5 });

    await page.goto("/planner?date=2026-07-26");

    const selectedSunday = page.getByRole("button", { name: "7/26 일 선택" });
    await expect(selectedSunday).toHaveAttribute("aria-current", "date");
    await expect(page.getByRole("heading", { name: "일 7월 26일" })).toBeVisible();

    await expect.poll(() => page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>(
        '[data-testid="planner-week-date-rail"]',
      );
      const selected = rail?.querySelector<HTMLElement>('[aria-current="date"]');
      if (!rail || !selected) return null;
      const railRect = rail.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      return {
        clientWidth: rail.clientWidth,
        fullyVisible:
          selectedRect.left >= railRect.left - 1
          && selectedRect.right <= railRect.right + 1,
        maxScrollLeft: rail.scrollWidth - rail.clientWidth,
        scrollLeft: rail.scrollLeft,
        scrollWidth: rail.scrollWidth,
      };
    })).toEqual({
      clientWidth: 262,
      fullyVisible: true,
      maxScrollLeft: 70,
      scrollLeft: 70,
      scrollWidth: 332,
    });
  });
});
