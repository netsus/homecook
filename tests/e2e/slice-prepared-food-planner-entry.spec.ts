import { mkdir } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const AUTH_KEY = "homecook.e2e-auth-override";
const PLAN_DATE = "2026-07-17";
const COLUMN_ID = "col-breakfast";
const SLOT_NAME = "아침";
const MENU_PATH = `/menu-add?date=${PLAN_DATE}&columnId=${COLUMN_ID}&slot=${encodeURIComponent(SLOT_NAME)}`;
const MEAL_PATH = `/planner/${PLAN_DATE}/${COLUMN_ID}?slot=${encodeURIComponent(SLOT_NAME)}`;
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/prepared-food-planner-entry/after",
);
const BEFORE_EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/prepared-food-planner-entry/before",
);

type ProductEntry = ReturnType<typeof createMealProductEntry>;

function createProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-yogurt",
    name: "플레인 요거트",
    brand: "무먹 식품",
    visibility: "private",
    source_type: "manual",
    editable: true,
    nutrition_version_id: "nutrition-version-1",
    basis_relations: [
      {
        from: { amount: 1, unit: "serving" },
        to: { amount: 150, unit: "g" },
      },
    ],
    nutrition: {
      basis: { amount: 1, unit: "serving" },
      values: {
        energy_kcal: {
          amount: 105,
          known_amount: null,
          status: "complete",
          display_mode: "total",
        },
      },
      calculation_status: "complete",
      calculation_quality: "direct",
      warnings: [],
      sources: [],
    },
    ...overrides,
  };
}

function createMealProductEntry(overrides: Record<string, unknown> = {}) {
  const product = createProduct();
  return {
    entry_type: "product",
    id: "entry-yogurt",
    product_id: product.id,
    product_name: product.name,
    product_brand: product.brand,
    quantity: { amount: 1, unit: "serving" },
    workflow_status: null,
    product_nutrition_version_id: product.nutrition_version_id,
    basis_relations: product.basis_relations,
    nutrition: product.nutrition,
    ...overrides,
  };
}

function createPlannerProductEntry(entry: ProductEntry, planDate = PLAN_DATE) {
  return {
    ...entry,
    plan_date: planDate,
    column_id: COLUMN_ID,
  };
}

function recipeMeal(planDate?: string) {
  return {
    id: "meal-recipe",
    recipe_id: "recipe-kimchi",
    recipe_title: "김치찌개",
    recipe_thumbnail_url: null,
    ...(planDate ? { plan_date: planDate, column_id: COLUMN_ID } : {}),
    planned_servings: 2,
    status: "registered",
    is_leftover: false,
  };
}

async function setAuthenticated(page: Page) {
  await page.context().addCookies([
    { name: AUTH_KEY, value: "authenticated", url: BASE_URL, sameSite: "Lax" },
  ]);
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, "authenticated");
  }, { key: AUTH_KEY });
  if (page.url().startsWith(BASE_URL)) {
    await page.evaluate((key) => window.localStorage.setItem(key, "authenticated"), AUTH_KEY);
  }
}

async function setGuest(page: Page) {
  await page.context().addCookies([
    { name: AUTH_KEY, value: "guest", url: BASE_URL, sameSite: "Lax" },
  ]);
  await page.evaluate((key) => window.localStorage.setItem(key, "guest"), AUTH_KEY);
}

async function simulateLoginReturn(page: Page) {
  await expect(page).toHaveURL(/\/login\?next=/);
  const nextPath = new URL(page.url()).searchParams.get("next");
  expect(nextPath).toBeTruthy();
  await setAuthenticated(page);
  await page.goto(nextPath!);
  return nextPath!;
}

async function installRoutes(
  page: Page,
  options: {
    catalogVersion?: "v2";
    mutationError?: "basis" | "unauthorized" | "createUnauthorized" | "deleteUnauthorized" | "patchUnauthorized";
  } = {},
) {
  let productEntry: ProductEntry | null = createMealProductEntry();
  let mismatchOnce = options.mutationError === "basis";
  let entryUnauthorizedOnce = options.mutationError === "unauthorized";
  let createUnauthorizedOnce = options.mutationError === "createUnauthorized";
  let deleteUnauthorizedOnce = options.mutationError === "deleteUnauthorized";
  let patchUnauthorizedOnce = options.mutationError === "patchUnauthorized";

  await page.route("**/api/v1/users/me**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const data = pathname === "/api/v1/users/me"
      ? {
          id: "user-e2e",
          email: "e2e@example.com",
          nickname: "집밥 사용자",
          profile_image_url: null,
          social_provider: "google",
          settings: { screen_wake_lock: false },
        }
      : null;
    await route.fulfill({ json: { success: true, data, error: null } });
  });

  await page.route("**/api/v1/food-products?*", async (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get("cursor");
    const query = url.searchParams.get("q") ?? "";
    const yogurt = options.catalogVersion === "v2"
      ? createProduct({
          nutrition_version_id: "nutrition-version-2",
          basis_relations: [
            {
              from: { amount: 1, unit: "package" },
              to: { amount: 250, unit: "ml" },
            },
          ],
          nutrition: {
            basis: { amount: 1, unit: "package" },
            values: {
              energy_kcal: {
                amount: 999,
                known_amount: null,
                status: "complete",
                display_mode: "total",
              },
            },
            calculation_status: "complete",
            calculation_quality: "direct",
            warnings: [],
            sources: [],
          },
        })
      : createProduct();
    const tofu = createProduct({
      id: "product-tofu",
      name: "두부 스낵",
      brand: null,
      visibility: "public",
      source_type: "public_dataset",
      editable: false,
    });
    const items = query.includes("없는")
      ? []
      : cursor
        ? [yogurt, tofu]
        : [yogurt];

    await route.fulfill({
      json: {
        success: true,
        data: {
          items,
          next_cursor: cursor ? null : "opaque-next+/=",
          has_next: !cursor && items.length > 0,
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/food-products", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    if (createUnauthorizedOnce) {
      createUnauthorizedOnce = false;
      await route.fulfill({
        status: 401,
        json: { success: false, data: null, error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] } },
      });
      return;
    }
    const created = createProduct({ id: "product-created", name: "내 두유", brand: null });
    await route.fulfill({ status: 201, json: { success: true, data: { product: created }, error: null } });
  });

  await page.route("**/api/v1/product-planner-entries**", async (route) => {
    const method = route.request().method();
    const pathname = new URL(route.request().url()).pathname;
    if (method === "POST" && pathname === "/api/v1/product-planner-entries") {
      if (entryUnauthorizedOnce) {
        entryUnauthorizedOnce = false;
        await route.fulfill({
          status: 401,
          json: {
            success: false,
            data: null,
            error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] },
          },
        });
        return;
      }
      if (mismatchOnce) {
        mismatchOnce = false;
        await route.fulfill({
          status: 422,
          json: {
            success: false,
            data: null,
            error: {
              code: "NUTRITION_BASIS_MISMATCH",
              message: "이 수량 단위로 영양을 계산할 수 없어요.",
              fields: [{ field: "quantity.unit", reason: "basis_mismatch" }],
            },
          },
        });
        return;
      }
      productEntry = createMealProductEntry();
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          data: { entry: createPlannerProductEntry(productEntry) },
          error: null,
        },
      });
      return;
    }

    if (method === "PATCH") {
      if (patchUnauthorizedOnce) {
        patchUnauthorizedOnce = false;
        await route.fulfill({
          status: 401,
          json: {
            success: false,
            data: null,
            error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] },
          },
        });
        return;
      }
      const body = route.request().postDataJSON() as {
        quantity: { amount: number; unit: "serving" | "package" | "g" | "ml" };
      };
      const quantity = body.quantity;
      const energyAmount = quantity.unit === "g"
        ? (105 * quantity.amount) / 150
        : 105 * quantity.amount;
      productEntry = createMealProductEntry({
        quantity,
        nutrition: {
          ...createProduct().nutrition,
          values: {
            energy_kcal: {
              amount: energyAmount,
              known_amount: null,
              status: "complete",
              display_mode: "total",
            },
          },
        },
      });
      await route.fulfill({
        json: { success: true, data: { entry: createPlannerProductEntry(productEntry) }, error: null },
      });
      return;
    }

    if (method === "DELETE") {
      if (deleteUnauthorizedOnce) {
        deleteUnauthorizedOnce = false;
        await route.fulfill({
          status: 401,
          json: {
            success: false,
            data: null,
            error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] },
          },
        });
        return;
      }
      productEntry = null;
      await route.fulfill({
        json: { success: true, data: { deleted: true, entry_id: "entry-yogurt" }, error: null },
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/v1/meals?*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [recipeMeal()],
          product_entries: productEntry ? [productEntry] : [],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/planner?*", async (route) => {
    const url = new URL(route.request().url());
    const startDate = url.searchParams.get("start_date") ?? PLAN_DATE;
    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: [
            { id: COLUMN_ID, name: SLOT_NAME, sort_order: 0 },
            { id: "col-lunch", name: "점심", sort_order: 1 },
            { id: "col-dinner", name: "저녁", sort_order: 2 },
          ],
          meals: [recipeMeal(startDate)],
          product_entries: productEntry
            ? [createPlannerProductEntry(productEntry, startDate)]
            : [],
        },
        error: null,
      },
    });
  });

  return {
    setProductEntry(value: ProductEntry | null) {
      productEntry = value;
    },
  };
}

async function stabilize(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
      nextjs-portal, [data-next-badge-root], [aria-label="Open Next.js Dev Tools"], [data-nextjs-toast] { display: none !important; }
    `,
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

async function expectFullPageAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test.describe("prepared-food-planner-entry", () => {
  test.beforeEach(async ({ page }) => {
    await setAuthenticated(page);
  });

  test("MENU_ADD에서 완제품을 추가하고 pinned 영양 수량을 수정·삭제한다", async ({ page }) => {
    const routes = await installRoutes(page);
    routes.setProductEntry(null);
    await page.goto(`${MENU_PATH}&source=product`);

    await expect(page.getByRole("heading", { name: "완제품 추가" }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("플레인 요거트", { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByText("플레인 요거트", { exact: true }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "아침에 완제품 추가" }).click();

    await expect(page).toHaveURL(new RegExp(`/planner/${PLAN_DATE}/${COLUMN_ID}`));
    const productCard = page.getByTestId("product-planner-entry-entry-yogurt").filter({ visible: true });
    await expect(productCard).toContainText("예상 열량 105 kcal");
    await expect(productCard.getByText("등록", { exact: true })).toHaveCount(0);
    await expect(productCard.getByRole("button", { name: "장보기" })).toHaveCount(0);
    await expect(productCard.getByRole("button", { name: "요리하기" })).toHaveCount(0);

    await productCard.getByRole("button", { name: "수량 변경" }).click();
    await page.getByLabel("완제품 변경 수량", { exact: true }).fill("2");
    await page.getByRole("button", { name: "수량 변경", exact: true }).last().click();
    await expect(productCard).toContainText("예상 열량 210 kcal");

    await productCard.getByRole("button", { name: /완제품 계획 삭제/ }).click();
    await page.getByTestId("product-delete-confirm").click();
    await expect(productCard).toHaveCount(0);
    await expect(page.getByText("김치찌개", { exact: true }).filter({ visible: true })).toBeVisible();
  });

  test("DELETE 401 뒤 로그인 복귀에서 삭제 확인을 복원하고 같은 계획만 삭제한다", async ({ page }) => {
    await installRoutes(page, { mutationError: "deleteUnauthorized" });
    await page.goto(MEAL_PATH);

    const productCard = page.getByTestId("product-planner-entry-entry-yogurt").filter({ visible: true });
    await productCard.getByRole("button", { name: /완제품 계획 삭제/ }).click();
    await setGuest(page);
    await page.getByTestId("product-delete-confirm").click();

    await expect(page.getByText("식사 목록을 보려면 로그인이 필요해요.", { exact: true })).toBeVisible();
    const storedContext = await page.evaluate(() => JSON.parse(
      window.sessionStorage.getItem("homecook.food-product-planner-return-context.v1") ?? "null",
    ));
    expect(storedContext).toMatchObject({
      kind: "meal-entry",
      entryId: "entry-yogurt",
      action: "delete",
    });
    const nextPath = `${MEAL_PATH}&productEntryId=entry-yogurt&productAction=delete`;
    await setAuthenticated(page);
    await page.goto(nextPath);
    await expect(page.getByTestId("product-delete-confirm")).toBeVisible();

    await page.getByTestId("product-delete-confirm").click();
    await expect(productCard).toHaveCount(0);
    await expect(page.getByText("김치찌개", { exact: true }).filter({ visible: true })).toBeVisible();
    expect(await page.evaluate(() => window.sessionStorage.getItem("homecook.food-product-planner-return-context.v1"))).toBeNull();
  });

  test("PATCH 401 gate가 safe edit context와 data-next-path를 보존하고 같은 편집을 복원한다", async ({ page }) => {
    await installRoutes(page, { mutationError: "patchUnauthorized" });
    await page.goto(MEAL_PATH);

    const productCard = page.getByTestId("product-planner-entry-entry-yogurt").filter({ visible: true });
    const editTrigger = productCard.getByRole("button", { name: "수량 변경" });
    await editTrigger.click();
    await page.getByLabel("완제품 변경 수량", { exact: true }).fill("300");
    await page.getByLabel("완제품 변경 수량 단위", { exact: true }).selectOption("g");
    await setGuest(page);
    await page.getByRole("dialog", { name: "완제품 수량 변경" }).getByRole("button", { name: "수량 변경" }).click();

    const loginGate = page.getByTestId("meal-auth-gate-login");
    await expect(loginGate).toBeVisible();
    const nextPath = await loginGate.getAttribute("data-next-path");
    expect(decodeURIComponent(nextPath ?? "")).toContain("productEntryId=entry-yogurt");
    expect(decodeURIComponent(nextPath ?? "")).toContain("productAction=edit");
    expect(decodeURIComponent(nextPath ?? "")).toContain("productAmount=300");
    expect(decodeURIComponent(nextPath ?? "")).toContain("productUnit=g");
    const storedContext = await page.evaluate(() => JSON.parse(
      window.sessionStorage.getItem("homecook.food-product-planner-return-context.v1") ?? "null",
    ));
    expect(storedContext).toMatchObject({
      kind: "meal-entry",
      entryId: "entry-yogurt",
      action: "edit",
      quantityAmount: "300",
      quantityUnit: "g",
    });

    await setAuthenticated(page);
    await page.goto(nextPath!);
    const restoredDialog = page.getByRole("dialog", { name: "완제품 수량 변경" });
    await expect(restoredDialog).toBeVisible();
    await expect(restoredDialog.getByLabel("완제품 변경 수량", { exact: true })).toHaveValue("300");
    await expect(restoredDialog.getByLabel("완제품 변경 수량 단위", { exact: true })).toHaveValue("g");
    await expect(restoredDialog.getByLabel("완제품 변경 수량", { exact: true })).toBeFocused();
    await restoredDialog.getByRole("button", { name: "수량 변경" }).click();
    await expect(productCard).toContainText("300g");
    expect(await page.evaluate(() => window.sessionStorage.getItem("homecook.food-product-planner-return-context.v1"))).toBeNull();
  });

  test("pinned v1 entry는 catalog v2와 무관하게 v1 relation과 영양 snapshot으로 수정된다", async ({ page }) => {
    await installRoutes(page, { catalogVersion: "v2" });
    await page.goto(`${MENU_PATH}&source=product`);
    await expect(page.getByText("예상 열량 999 kcal", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("기준 1팩", { exact: true }).first()).toBeVisible();

    await page.goto(MEAL_PATH);
    const productCard = page.getByTestId("product-planner-entry-entry-yogurt").filter({ visible: true });
    await expect(productCard).toContainText("1회");
    await expect(productCard).toContainText("예상 열량 105 kcal");
    await productCard.getByRole("button", { name: "수량 변경" }).click();
    const editDialog = page.getByRole("dialog", { name: "완제품 수량 변경" });
    await expect(editDialog.getByLabel("완제품 변경 수량 단위", { exact: true }).locator("option")).toHaveText(["회", "g"]);
    await editDialog.getByLabel("완제품 변경 수량", { exact: true }).fill("150");
    await editDialog.getByLabel("완제품 변경 수량 단위", { exact: true }).selectOption("g");
    const patchRequest = page.waitForRequest((request) =>
      request.method() === "PATCH" && request.url().includes("/api/v1/product-planner-entries/entry-yogurt"),
    );
    await editDialog.getByRole("button", { name: "수량 변경" }).click();
    expect((await patchRequest).postDataJSON()).toEqual({ quantity: { amount: 150, unit: "g" } });
    await expect(productCard).toContainText("150g");
    await expect(productCard).toContainText("예상 열량 105 kcal");
    await expect(productCard).not.toContainText("999");
  });

  test("opaque cursor를 이어 붙이고 basis mismatch에서 선택·수량 단계에 머문다", async ({ page }) => {
    await installRoutes(page, { mutationError: "basis" });
    await page.goto(`${MENU_PATH}&source=product`);

    await page.getByRole("button", { name: "완제품 더 불러오기" }).click();
    await expect(page.getByText("플레인 요거트", { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText("두부 스낵", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "완제품 더 불러오기" })).toHaveCount(0);

    await page.getByText("플레인 요거트", { exact: true }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "아침에 완제품 추가" }).click();
    await expect(page.getByText("이 수량 단위로 영양을 계산할 수 없어요.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("food-product-quantity-step")).toBeVisible();
  });

  test("검색 결과가 없으면 private 완제품을 등록하고 선택된 수량 단계로 돌아온다", async ({ page }) => {
    await installRoutes(page);
    await page.goto(`${MENU_PATH}&source=product`);
    await page.getByRole("searchbox", { name: "완제품 검색" }).fill("없는 제품");
    await expect(page.getByText("검색 결과가 없어요", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "새 완제품 등록" }).click();

    await page.getByRole("textbox", { name: /완제품 이름/ }).fill("내 두유");
    await page.getByRole("spinbutton", { name: /열량/ }).fill("0");
    await page.getByRole("button", { name: "등록하고 선택" }).click();

    const quantityStep = page.getByTestId("food-product-quantity-step");
    await expect(quantityStep).toContainText("내 두유 수량");
    await expect(quantityStep).toContainText("표시 기준과 직접 연결된 단위만 선택할 수 있어요.");
  });

  test("느린 이전 검색은 무시하고 complete zero·partial·unavailable copy를 보존한다", async ({ page }) => {
    await installRoutes(page);
    await page.unroute("**/api/v1/food-products?*");
    await page.route("**/api/v1/food-products?*", async (route) => {
      const query = new URL(route.request().url()).searchParams.get("q") ?? "";
      if (query === "느린") {
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
      const product = query === "최신"
        ? createProduct({ id: "latest", name: "최신 두유" })
        : query === "느린"
          ? createProduct({ id: "stale", name: "느린 요거트" })
          : createProduct();
      await route.fulfill({
        json: {
          success: true,
          data: { items: [product], next_cursor: null, has_next: false },
          error: null,
        },
      });
    });

    await page.goto(`${MENU_PATH}&source=product`);
    const search = page.getByRole("searchbox", { name: "완제품 검색" });
    await search.fill("느린");
    await search.fill("최신");
    await expect(page.getByText("최신 두유", { exact: true })).toBeVisible();
    await page.waitForTimeout(220);
    await expect(page.getByText("느린 요거트", { exact: true })).toHaveCount(0);

    await page.unroute("**/api/v1/meals?*");
    await page.route("**/api/v1/meals?*", async (route) => {
      const baseNutrition = createProduct().nutrition;
      const entry = (id: string, name: string, energy_kcal: Record<string, unknown>) =>
        createMealProductEntry({
          id,
          product_id: `product-${id}`,
          product_name: name,
          nutrition: {
            ...baseNutrition,
            values: { energy_kcal },
          },
        });
      await route.fulfill({
        json: {
          success: true,
          data: {
            items: [],
            product_entries: [
              entry("zero", "제로 제품", { amount: 0, known_amount: null, status: "complete", display_mode: "total" }),
              entry("partial", "부분 제품", { amount: null, known_amount: 87, status: "partial", display_mode: "minimum" }),
              entry("missing", "정보 준비 제품", { amount: null, known_amount: null, status: "unavailable", display_mode: null }),
            ],
          },
          error: null,
        },
      });
    });
    await page.goto(MEAL_PATH);
    await expect(page.getByText("예상 열량 0 kcal", { exact: true })).toBeVisible();
    await expect(page.getByText("예상 열량 최소 87 kcal", { exact: true })).toBeVisible();
    await expect(page.getByText("예상 열량 정보 준비 중", { exact: true })).toBeVisible();
  });

  test("picker, create, product card 화면 전체가 semantic axe 검사를 통과한다", async ({ page }) => {
    await installRoutes(page);
    await page.goto(`${MENU_PATH}&source=product`);
    await expect(page.getByTestId("food-product-picker")).toBeVisible();
    await expectFullPageAxeClean(page);

    await page.getByRole("button", { name: "목록에 없나요? 새 완제품 등록" }).click();
    await expect(page.getByTestId("food-product-create-form")).toBeVisible();
    await expectFullPageAxeClean(page);

    await page.goto(MEAL_PATH);
    await expect(page.getByTestId("product-planner-entry-entry-yogurt").filter({ visible: true })).toBeVisible();
    await expectFullPageAxeClean(page);
  });

  test("390·320·desktop exact viewport에서 slice 화면 전체가 axe 검사를 통과한다", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "exact viewport axe matrix runs once");
    const viewports = [
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 1280, height: 900 },
    ];

    for (const viewport of viewports) {
      const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
      const axePage = await context.newPage();
      await setAuthenticated(axePage);
      await installRoutes(axePage);

      await axePage.goto(`${MENU_PATH}&source=product`);
      await expect(axePage.getByTestId("food-product-picker")).toBeVisible();
      await expectFullPageAxeClean(axePage);

      await axePage.getByRole("button", { name: "목록에 없나요? 새 완제품 등록" }).click();
      await expect(axePage.getByTestId("food-product-create-form")).toBeVisible();
      await expectFullPageAxeClean(axePage);

      await axePage.goto(MEAL_PATH);
      await expect(axePage.getByTestId("product-planner-entry-entry-yogurt").filter({ visible: true })).toBeVisible({ timeout: 15_000 });
      await expectFullPageAxeClean(axePage);
      await context.close();
    }
  });

  test("auth round-trip restores a safe manual draft and returns focus after successful create", async ({ page }) => {
    await installRoutes(page, { mutationError: "createUnauthorized" });
    await page.goto(`${MENU_PATH}&source=product`);
    await page.getByRole("searchbox", { name: "완제품 검색" }).fill("없는 제품");
    await page.getByRole("button", { name: "새 완제품 등록" }).click();
    await page.getByRole("textbox", { name: /완제품 이름/ }).fill("내 두유");
    await page.getByRole("spinbutton", { name: /열량/ }).fill("0");
    await setGuest(page);
    await page.getByRole("button", { name: "등록하고 선택" }).click();
    await simulateLoginReturn(page);

    await expect(page.getByRole("heading", { name: "완제품 직접 등록" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /완제품 이름/ })).toHaveValue("내 두유");
    await expect(page.getByRole("spinbutton", { name: /열량/ })).toHaveValue("0");
    await page.getByRole("button", { name: "등록하고 선택" }).click();
    const quantity = page.getByRole("spinbutton", { name: "완제품 수량" });
    await expect(quantity).toBeFocused();
    await expect(page.getByTestId("food-product-quantity-step")).toContainText("내 두유 수량");
    expect(await page.evaluate(() => window.sessionStorage.getItem("homecook.food-product-planner-return-context.v1"))).toBeNull();
  });

  test("picker/create keeps scroll, focus, 44px controls, dirty ESC, and sticky actions safe", async ({ page }) => {
    await installRoutes(page);
    await page.unroute("**/api/v1/food-products?*");
    await page.route("**/api/v1/food-products?*", async (route) => {
      const items = Array.from({ length: 14 }, (_, index) => createProduct({
        id: `product-${index}`,
        name: `완제품 ${index + 1}`,
      }));
      await route.fulfill({ json: { success: true, data: { items, next_cursor: null, has_next: false }, error: null } });
    });
    await page.goto(`${MENU_PATH}&source=product`);
    await expect(page.getByRole("searchbox", { name: "완제품 검색" })).toBeFocused();
    const results = page.getByTestId("food-product-result-scroll");
    await expect(results).toHaveCSS("overflow-y", "auto");
    expect(await results.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    const first = page.getByRole("button", { name: /^완제품 1 / });
    expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await first.click();
    const quantity = page.getByRole("spinbutton", { name: "완제품 수량" });
    await expect(quantity).toBeFocused();
    expect((await quantity.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const quantityTop = (await page.getByTestId("food-product-quantity-step").boundingBox())!.y;
    await results.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    expect((await page.getByTestId("food-product-quantity-step").boundingBox())!.y).toBe(quantityTop);

    await page.getByRole("button", { name: "목록에 없나요? 새 완제품 등록" }).click();
    await page.getByRole("textbox", { name: /완제품 이름/ }).fill("작성 중");
    await page.keyboard.press("Escape");
    const discardDialog = page.getByRole("dialog", { name: "작성 중인 완제품 정보 버리기" });
    await expect(discardDialog).toBeVisible();
    await expect(discardDialog.getByRole("button", { name: "계속 작성" })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    expect(await page.getByTestId("food-product-create-form").evaluate((node) => node.closest("[inert]") !== null)).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(discardDialog.getByRole("button", { name: "버리고 나가기" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(discardDialog.getByRole("button", { name: "계속 작성" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "완제품 직접 등록" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /완제품 이름/ })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    await page.keyboard.press("Escape");
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole("button", { name: "버리고 나가기" }).click();
    await expect(page.getByRole("heading", { name: "완제품 추가" })).toBeVisible();

    await page.getByRole("button", { name: "목록에 없나요? 새 완제품 등록" }).click();
    await page.getByRole("button", { name: "등록하고 선택" }).click();
    const invalidName = page.getByRole("textbox", { name: /완제품 이름/ });
    await expect(invalidName).toBeFocused();
    await expect(invalidName).toHaveAttribute("aria-describedby", "food-product-name-error");
    const actions = page.getByTestId("food-product-create-actions");
    await expect(actions).toHaveCSS("position", "sticky");
    const actionBox = await actions.boundingBox();
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  });

  test("product edit/delete dialogs trap focus, inert background, lock scroll, and return focus", async ({ page }) => {
    await installRoutes(page);
    await page.goto(MEAL_PATH);
    const productCard = page.getByTestId("product-planner-entry-entry-yogurt").filter({ visible: true });
    const editTrigger = productCard.getByRole("button", { name: "수량 변경" });
    await editTrigger.click();

    const editDialog = page.getByRole("dialog", { name: "완제품 수량 변경" });
    const editInput = editDialog.getByLabel("완제품 변경 수량", { exact: true });
    const editClose = editDialog.getByRole("button", { name: "닫기" });
    const editConfirm = editDialog.getByRole("button", { name: "수량 변경" });
    await expect(editInput).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    expect(await productCard.evaluate((node) => node.closest("[inert]") !== null)).toBe(true);
    await editClose.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(editConfirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(editClose).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(editDialog).toHaveCount(0);
    await expect(editTrigger).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");

    const deleteTrigger = productCard.getByRole("button", { name: /완제품 계획 삭제/ });
    await deleteTrigger.click();
    const deleteDialog = page.getByRole("dialog", { name: "완제품 계획 삭제" });
    const deleteClose = deleteDialog.getByRole("button", { name: "닫기" });
    const deleteConfirm = deleteDialog.getByTestId("product-delete-confirm");
    await expect(deleteClose).toBeFocused();
    expect(await productCard.evaluate((node) => node.closest("[inert]") !== null)).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(deleteConfirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(deleteClose).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(deleteDialog).toHaveCount(0);
    await expect(deleteTrigger).toBeFocused();
  });

  test("captures same-fixture pre-Stage4 evidence from the explicit base server", async ({ browser }) => {
    test.skip(process.env.PREPARED_FOOD_CAPTURE_BEFORE !== "1", "base-server evidence only");
    await mkdir(BEFORE_EVIDENCE_DIR, { recursive: true });
    const evidenceBrowser = process.env.PREPARED_FOOD_DISABLE_GPU === "1"
      ? await browser.browserType().launch({ headless: true, args: ["--disable-gpu"] })
      : browser;
    const allViewports = [
      { suffix: "390", width: 390, height: 844 },
      { suffix: "320", width: 320, height: 568 },
      { suffix: "desktop-1280", width: 1280, height: 900 },
    ] as const;
    const requestedViewport = process.env.PREPARED_FOOD_EVIDENCE_VIEWPORT;
    const viewports = requestedViewport
      ? allViewports.filter(({ suffix }) => suffix === requestedViewport)
      : allViewports;
    expect(viewports.length).toBeGreaterThan(0);
    for (const viewport of viewports) {
      const context = await evidenceBrowser.newContext({ deviceScaleFactor: 1, viewport });
      const beforePage = await context.newPage();
      await setAuthenticated(beforePage);
      await installRoutes(beforePage);

      await beforePage.goto("/planner");
      await expect(beforePage.getByText("김치찌개", { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await stabilize(beforePage);
      await beforePage.screenshot({ path: path.join(BEFORE_EVIDENCE_DIR, `PLANNER_WEEK-${viewport.suffix}.png`), scale: "css" });

      await beforePage.goto(MEAL_PATH);
      await expect(beforePage.getByText("김치찌개", { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await beforePage.screenshot({ path: path.join(BEFORE_EVIDENCE_DIR, `MEAL_SCREEN-${viewport.suffix}.png`), scale: "css" });

      await beforePage.goto(MENU_PATH);
      await expect(beforePage.getByRole("heading", { name: "식사 추가" }).filter({ visible: true }).first()).toBeVisible();
      await beforePage.screenshot({ path: path.join(BEFORE_EVIDENCE_DIR, `MENU_ADD-${viewport.suffix}.png`), scale: "css" });
      await context.close();
    }
    if (evidenceBrowser !== browser) await evidenceBrowser.close();
  });

  test("390·320·desktop Stage 4 evidence와 unauthorized return을 남긴다", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "exact evidence matrix runs once");
    await mkdir(EVIDENCE_DIR, { recursive: true });
    const evidenceBrowser = process.env.PREPARED_FOOD_DISABLE_GPU === "1"
      ? await browser.browserType().launch({ headless: true, args: ["--disable-gpu"] })
      : browser;

    const allViewports = [
      { suffix: "390", width: 390, height: 844 },
      { suffix: "320", width: 320, height: 568 },
      { suffix: "desktop-1280", width: 1280, height: 900 },
    ] as const;
    const requestedViewport = process.env.PREPARED_FOOD_EVIDENCE_VIEWPORT;
    const viewports = requestedViewport
      ? allViewports.filter(({ suffix }) => suffix === requestedViewport)
      : allViewports;
    expect(viewports.length).toBeGreaterThan(0);

    for (const viewport of viewports) {
      const openEvidencePage = async () => {
        const context = await evidenceBrowser.newContext({
          deviceScaleFactor: 1,
          viewport: { width: viewport.width, height: viewport.height },
        });
        const evidencePage = await context.newPage();
        await setAuthenticated(evidencePage);
        await installRoutes(evidencePage);
        return { context, evidencePage };
      };

      {
        const { context, evidencePage } = await openEvidencePage();
        await evidencePage.goto("/planner");
        await expect(evidencePage.getByText("플레인 요거트", { exact: true }).filter({ visible: true })).toBeVisible();
        await stabilize(evidencePage);
        await expectNoHorizontalOverflow(evidencePage);
        await evidencePage.screenshot({ path: path.join(EVIDENCE_DIR, `PLANNER_WEEK-${viewport.suffix}.png`), scale: "css" });
        await context.close();
      }

      {
        const { context, evidencePage } = await openEvidencePage();
        await evidencePage.goto(MEAL_PATH);
        await expect(evidencePage.getByTestId("product-planner-entry-entry-yogurt").filter({ visible: true })).toBeVisible({ timeout: 15_000 });
        await stabilize(evidencePage);
        await expectNoHorizontalOverflow(evidencePage);
        await evidencePage.screenshot({ path: path.join(EVIDENCE_DIR, `MEAL_SCREEN-mixed-entry-${viewport.suffix}.png`), scale: "css" });
        await context.close();
      }

      {
        const { context, evidencePage } = await openEvidencePage();
        await evidencePage.goto(MENU_PATH);
        await expect(evidencePage.getByTestId("menu-add-option-product").filter({ visible: true })).toBeVisible();
        await stabilize(evidencePage);
        await expectNoHorizontalOverflow(evidencePage);
        await evidencePage.screenshot({ path: path.join(EVIDENCE_DIR, `MENU_ADD-product-entry-${viewport.suffix}.png`), scale: "css" });
        await context.close();
      }

      {
        const { context, evidencePage } = await openEvidencePage();
        await evidencePage.goto(`${MENU_PATH}&source=product`);
        await expect(evidencePage.getByRole("heading", { name: "완제품 추가" }).filter({ visible: true })).toBeVisible();
        await stabilize(evidencePage);
        await expectNoHorizontalOverflow(evidencePage);
        await evidencePage.screenshot({ path: path.join(EVIDENCE_DIR, `FOOD_PRODUCT_PICKER-${viewport.suffix}.png`), scale: "css" });
        await context.close();
      }

      {
        const { context, evidencePage } = await openEvidencePage();
        await evidencePage.goto(`${MENU_PATH}&source=product`);
        await evidencePage.getByRole("button", { name: "목록에 없나요? 새 완제품 등록" }).click();
        await expect(evidencePage.getByRole("heading", { name: "완제품 직접 등록" }).filter({ visible: true })).toBeVisible();
        await expectNoHorizontalOverflow(evidencePage);
        await evidencePage.screenshot({ path: path.join(EVIDENCE_DIR, `FOOD_PRODUCT_CREATE-${viewport.suffix}.png`), scale: "css" });
        await context.close();
      }
    }

    const mismatchContext = await evidenceBrowser.newContext({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
    const mismatchPage = await mismatchContext.newPage();
    await setAuthenticated(mismatchPage);
    await installRoutes(mismatchPage, { mutationError: "basis" });
    await mismatchPage.goto(`${MENU_PATH}&source=product`);
    await mismatchPage.getByText("플레인 요거트", { exact: true }).filter({ visible: true }).click();
    await mismatchPage.getByRole("button", { name: "아침에 완제품 추가" }).click();
    await expect(mismatchPage.getByText("이 수량 단위로 영양을 계산할 수 없어요.", { exact: true })).toBeVisible();
    await mismatchPage.screenshot({ path: path.join(EVIDENCE_DIR, "FOOD_PRODUCT_PICKER-basis-mismatch.png"), scale: "css" });
    await mismatchContext.close();

    const unauthorizedContext = await evidenceBrowser.newContext({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
    const unauthorizedPage = await unauthorizedContext.newPage();
    await setAuthenticated(unauthorizedPage);
    await installRoutes(unauthorizedPage, { mutationError: "unauthorized" });
    await unauthorizedPage.goto(`${MENU_PATH}&source=product`);
    await unauthorizedPage.getByRole("searchbox", { name: "완제품 검색" }).fill("간식");
    await unauthorizedPage.getByRole("button", { name: "완제품 더 불러오기" }).click();
    await unauthorizedPage.getByText("두부 스낵", { exact: true }).filter({ visible: true }).click();
    await unauthorizedPage.getByLabel("완제품 수량", { exact: true }).fill("2.5");
    await setGuest(unauthorizedPage);
    await unauthorizedPage.getByRole("button", { name: "아침에 완제품 추가" }).click();
    const nextPath = await simulateLoginReturn(unauthorizedPage);
    expect(decodeURIComponent(nextPath)).toContain("productId=product-tofu");
    expect(decodeURIComponent(nextPath)).toContain("productAmount=2.5");
    await expect(unauthorizedPage.getByTestId("food-product-quantity-step")).toContainText("두부 스낵 수량");
    await expect(unauthorizedPage.getByLabel("완제품 수량", { exact: true })).toHaveValue("2.5");
    await expect(unauthorizedPage.getByLabel("완제품 수량", { exact: true })).toBeFocused();
    await unauthorizedPage.screenshot({ path: path.join(EVIDENCE_DIR, "FOOD_PRODUCT_PICKER-unauthorized-return.png"), scale: "css" });
    await unauthorizedContext.close();
    if (evidenceBrowser !== browser) await evidenceBrowser.close();
  });
});
