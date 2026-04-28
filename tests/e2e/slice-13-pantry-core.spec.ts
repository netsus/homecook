import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const MOCK_PANTRY_ITEMS = [
  {
    id: "p1",
    ingredient_id: "i1",
    standard_name: "양파",
    category: "채소",
    created_at: "2026-04-29T00:00:00Z",
  },
  {
    id: "p2",
    ingredient_id: "i2",
    standard_name: "마늘",
    category: "양념",
    created_at: "2026-04-29T01:00:00Z",
  },
  {
    id: "p3",
    ingredient_id: "i3",
    standard_name: "돼지고기",
    category: "육류",
    created_at: "2026-04-29T02:00:00Z",
  },
];

const MOCK_BUNDLES = [
  {
    id: "b1",
    name: "조미료 모음",
    display_order: 1,
    ingredients: [
      { ingredient_id: "i10", standard_name: "간장", is_in_pantry: false },
      { ingredient_id: "i11", standard_name: "된장", is_in_pantry: false },
      { ingredient_id: "i2", standard_name: "마늘", is_in_pantry: true },
    ],
  },
  {
    id: "b2",
    name: "기본 야채",
    display_order: 2,
    ingredients: [
      { ingredient_id: "i1", standard_name: "양파", is_in_pantry: true },
      { ingredient_id: "i20", standard_name: "당근", is_in_pantry: false },
    ],
  },
];

const MOCK_INGREDIENTS = [
  { id: "i1", standard_name: "양파", category: "채소" },
  { id: "i2", standard_name: "마늘", category: "양념" },
  { id: "i3", standard_name: "돼지고기", category: "육류" },
  { id: "i4", standard_name: "대파", category: "채소" },
  { id: "i5", standard_name: "감자", category: "채소" },
  { id: "i10", standard_name: "간장", category: "양념" },
  { id: "i11", standard_name: "된장", category: "양념" },
  { id: "i20", standard_name: "당근", category: "채소" },
];

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      value,
      url: E2E_APP_ORIGIN,
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

async function installPantryRoutes(page: Page) {
  let pantryItems = [...MOCK_PANTRY_ITEMS];

  await page.route("**/api/v1/pantry/bundles", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { bundles: MOCK_BUNDLES },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/pantry", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      await route.fulfill({
        json: {
          success: true,
          data: { items: pantryItems },
          error: null,
        },
      });
      return;
    }

    if (method === "POST") {
      const body = route.request().postDataJSON();
      const ingredientIds = body?.ingredient_ids ?? [];
      const existingIds = new Set(pantryItems.map((item) => item.ingredient_id));
      const newIds = ingredientIds.filter((id: string) => !existingIds.has(id));
      const newItems = newIds.map((id: string, index: number) => ({
        id: `new-${index}`,
        ingredient_id: id,
        standard_name: MOCK_INGREDIENTS.find((i) => i.id === id)?.standard_name ?? id,
        category: MOCK_INGREDIENTS.find((i) => i.id === id)?.category ?? "기타",
        created_at: new Date().toISOString(),
      }));
      pantryItems = [...pantryItems, ...newItems];

      await route.fulfill({
        status: 201,
        json: {
          success: true,
          data: { added: newItems.length, items: newItems },
          error: null,
        },
      });
      return;
    }

    if (method === "DELETE") {
      const body = route.request().postDataJSON();
      const deleteIds = new Set(body?.ingredient_ids ?? []);
      const removedCount = pantryItems.filter((item) => deleteIds.has(item.ingredient_id)).length;
      pantryItems = pantryItems.filter((item) => !deleteIds.has(item.ingredient_id));

      await route.fulfill({
        json: {
          success: true,
          data: { removed: removedCount },
          error: null,
        },
      });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/v1/ingredients**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const q = requestUrl.searchParams.get("q")?.trim();
    const category = requestUrl.searchParams.get("category")?.trim();

    let items = [...MOCK_INGREDIENTS];
    if (q) {
      items = items.filter((i) => i.standard_name.includes(q));
    }
    if (category) {
      items = items.filter((i) => i.category === category);
    }

    await route.fulfill({
      json: {
        success: true,
        data: { items },
        error: null,
      },
    });
  });
}

test.describe("PANTRY screen", () => {
  test("shows login gate for unauthenticated users", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await page.goto("/pantry");

    await expect(page.getByText("이 화면은 로그인이 필요해요")).toBeVisible();
    await expect(page.getByText("팬트리 화면으로 바로 복귀")).toBeVisible();
  });

  test("shows pantry items after authentication", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByText("나의 팬트리")).toBeVisible();
    await expect(page.getByText("3개 재료 보유 중")).toBeVisible();
    await expect(page.getByText(/양파/)).toBeVisible();
    await expect(page.getByText(/마늘/)).toBeVisible();
    await expect(page.getByText(/돼지고기/)).toBeVisible();
  });

  test("shows empty state when no items exist", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await page.route("**/api/v1/pantry", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          json: { success: true, data: { items: [] }, error: null },
        });
      } else {
        await route.continue();
      }
    });
    await page.goto("/pantry");

    await expect(page.getByText("아직 등록한 재료가 없어요")).toBeVisible();
  });

  test("selects items and deletes them", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByText(/양파/)).toBeVisible();

    // Enter select mode
    await page.getByRole("button", { name: "선택" }).click();

    // Select first item
    const checkboxes = page.getByRole("checkbox");
    await checkboxes.first().click();

    await expect(page.getByText("1개 선택됨")).toBeVisible();

    // Click delete
    await page.getByRole("button", { name: /선택 삭제/ }).click();

    // Confirm delete
    await expect(page.getByText("재료를 삭제할까요?")).toBeVisible();

    const confirmButtons = page.getByRole("button", { name: /삭제/ });
    const deleteConfirmButton = confirmButtons.filter({ hasText: /^\s*삭제\s*\(1\)\s*$/ });
    await deleteConfirmButton.click();

    // Should show success toast
    await expect(page.getByText(/재료가 삭제됐어요/)).toBeVisible();
  });

  test("opens the add ingredient sheet and adds items", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByText(/양파/)).toBeVisible();

    // Open add sheet
    await page.getByRole("button", { name: /재료 추가/ }).first().click();

    // Should show the add sheet dialog
    await expect(page.getByRole("dialog", { name: "재료 추가" })).toBeVisible();

    await page.getByRole("checkbox", { name: /대파/ }).click();
    await page.getByRole("button", { name: "팬트리에 추가 (1)" }).click();

    await expect(page.getByText("1개 재료가 팬트리에 추가됐어요")).toBeVisible();
    await expect(page.getByText("4개 재료 보유 중")).toBeVisible();
    await expect(page.getByText(/대파/)).toBeVisible();
  });

  test("opens the bundle picker and shows bundles", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByText(/양파/)).toBeVisible();

    // Open bundle picker
    await page.getByRole("button", { name: /묶음 추가/ }).click();

    // Should show bundle picker dialog
    await expect(
      page.getByRole("dialog", { name: "묶음으로 재료 추가" }),
    ).toBeVisible();
    await expect(page.getByText("조미료 모음")).toBeVisible();
    await expect(page.getByText("기본 야채")).toBeVisible();

    await page.getByRole("button", { name: /조미료 모음/ }).click();
    await page.getByRole("button", { name: "3개 팬트리에 추가" }).click();

    await expect(page.getByText("3개 재료를 팬트리에 추가했어요")).toBeVisible();
    await expect(page.getByText("6개 재료 보유 중")).toBeVisible();
    await expect(page.getByText(/간장/)).toBeVisible();
  });

  test("filters items by category chip", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByText(/양파/)).toBeVisible();

    // Click a category chip
    await page.getByRole("tab", { name: "채소" }).click();

    // Should refetch with category filter
    await expect(page.getByText(/양파/)).toBeVisible();
  });
});
