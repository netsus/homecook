import { expect, test, type Locator, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const UPGRADED_PANTRY_STICKER_SIZES =
  "(min-resolution: 2.5dppx) 96px, (min-resolution: 2dppx) 128px, 192px";

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
    name: "한식 장류",
    display_order: 1,
    ingredients: [
      { ingredient_id: "i10", standard_name: "간장", is_in_pantry: false },
      { ingredient_id: "i11", standard_name: "된장", is_in_pantry: false },
      { ingredient_id: "i2", standard_name: "마늘", is_in_pantry: true },
    ],
  },
  {
    id: "b2",
    name: "자주 쓰는 채소",
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

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1024) < 1024;
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

  await page.route((url) => url.pathname === "/api/v1/pantry", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      const requestUrl = new URL(route.request().url());
      const q = requestUrl.searchParams.get("q")?.trim();
      const category = requestUrl.searchParams.get("category")?.trim();
      let items = [...pantryItems];

      if (q) {
        items = items.filter((item) => item.standard_name.includes(q));
      }
      if (category) {
        items = items.filter((item) => item.category === category);
      }

      await route.fulfill({
        json: {
          success: true,
          data: { items },
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

async function expectSharpV2Sticker(
  image: Locator,
  {
    expectedFile,
    expectedMinOptimizedWidth,
    expectedSizes,
  }: {
    expectedFile: string;
    expectedMinOptimizedWidth: number;
    expectedSizes: string;
  },
) {
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("sizes", expectedSizes);
  await expect
    .poll(async () =>
      image.evaluate((node) => {
        const img = node as HTMLImageElement;

        return img.complete ? img.naturalWidth : 0;
      }),
    )
    .toBeGreaterThan(0);

  const metrics = await image.evaluate((node) => {
    const img = node as HTMLImageElement;
    const rect = img.getBoundingClientRect();
    const currentSrc = img.currentSrc || img.src;
    let optimizedQuality: number | null = null;
    let optimizedWidth: number | null = null;

    try {
      const currentUrl = new URL(currentSrc);
      const qualityParam = currentUrl.searchParams.get("q");
      const widthParam = currentUrl.searchParams.get("w");
      optimizedQuality = qualityParam ? Number.parseInt(qualityParam, 10) : null;
      optimizedWidth = widthParam ? Number.parseInt(widthParam, 10) : null;
    } catch {
      optimizedQuality = null;
      optimizedWidth = null;
    }

    return {
      currentSrc: decodeURIComponent(currentSrc),
      devicePixelRatio: window.devicePixelRatio,
      naturalHeight: img.naturalHeight,
      naturalWidth: img.naturalWidth,
      optimizedQuality,
      optimizedWidth,
      renderedHeight: rect.height,
      renderedWidth: rect.width,
    };
  });
  const sourceWidth = metrics.optimizedWidth ?? metrics.naturalWidth;

  expect(metrics.currentSrc).toContain(`/assets/ingredients/plush-v2/${expectedFile}`);
  expect(metrics.optimizedQuality ?? 95).toBe(95);
  expect(sourceWidth).toBeGreaterThanOrEqual(expectedMinOptimizedWidth);
  expect(metrics.naturalWidth).toBeGreaterThanOrEqual(Math.floor(metrics.renderedWidth));
  expect(metrics.naturalHeight).toBeGreaterThanOrEqual(Math.floor(metrics.renderedHeight));
  expect(sourceWidth).toBeGreaterThanOrEqual(
    Math.ceil(metrics.renderedWidth * metrics.devicePixelRatio),
  );
}

test.describe("PANTRY screen", () => {
  test("shows login gate for unauthenticated users", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await page.goto("/pantry");

    await expect(page.getByText("이 화면은 로그인이 필요해요")).toBeVisible();
    await expect(page.getByRole("link", { name: "홈으로 돌아가기" })).toBeVisible();
  });

  test("shows pantry items after authentication", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByRole("heading", { name: /팬트리/ }).first()).toBeVisible();
    await expect(page.getByText(/3\s*개/).first()).toBeVisible();
    await expect(page.getByText(/양파/)).toBeVisible();
    await expect(page.getByText(/마늘/)).toBeVisible();
    await expect(page.getByText(/돼지고기/)).toBeVisible();
  });

  test("loads plush-v2 pantry stickers at display-safe resolution", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByText(/양파/)).toBeVisible();

    const isMobile = isMobileViewport(page);
    const onionImage = isMobile
      ? page.getByRole("button", { exact: true, name: "양파" }).locator("img").first()
      : page.getByTestId("web-pantry-card-i1").locator("img").first();

    await expectSharpV2Sticker(onionImage, {
      expectedFile: "onion.webp",
      expectedMinOptimizedWidth: 256,
      expectedSizes: UPGRADED_PANTRY_STICKER_SIZES,
    });
  });

  test("shows only owned pantry items without missing ingredient toggles", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByText(/양파/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "없는 재료도 표시" })).toHaveCount(0);
    await expect(page.getByRole("switch")).toHaveCount(0);
    await expect(page.getByText("대파")).toHaveCount(0);
  });

  test("selects all visible pantry items in edit mode", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByText(/양파/)).toBeVisible();
    await page.getByRole("button", { name: /편집/ }).first().click();
    await page.getByRole("checkbox", { name: "전체선택" }).click();

    if (isMobileViewport(page)) {
      await expect(page.getByText("3개 선택됨")).toBeVisible();
      await expect(page.getByRole("button", { name: "제거하기" })).toBeVisible();
      return;
    }

    await expect(page.getByText("3개 선택됨")).toBeVisible();
    await expect(page.getByRole("button", { name: "제거하기" })).toBeVisible();
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
    await page.getByRole("button", { name: /편집/ }).first().click();

    // Select first item
    await page.getByRole("checkbox", { name: "양파 선택" }).click();

    await expect(page.getByText("1개 선택됨")).toBeVisible();

    // Click delete
    if (isMobileViewport(page)) {
      await page.getByRole("button", { name: "제거하기" }).click();
    } else {
      await page.getByRole("button", { name: "제거하기" }).click();
    }

    // Confirm delete
    await expect(page.getByText("재료를 삭제할까요?")).toBeVisible();

    await page.getByRole("button", { name: "삭제 (1)" }).last().click();

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
    await expect(page.getByText(/4\s*개/).first()).toBeVisible();
    await expect(page.getByText(/대파/)).toBeVisible();
  });

  test("opens the bundle picker and shows bundles", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByText(/양파/)).toBeVisible();

    // Open bundle picker
    await page.getByRole("button", { name: /묶음으로 추가/ }).click();

    // Should show bundle picker dialog
    await expect(
      page.getByRole("dialog", { name: "묶음으로 재료 추가" }),
    ).toBeVisible();
    await expect(page.getByText("한식 장류")).toBeVisible();
    await expect(page.getByText("자주 쓰는 채소")).toBeVisible();
    const seasoningBundle = page.getByRole("button", { name: /한식 장류/ });
    await expect(page.getByText(/추가 가능 2개/)).toHaveCount(0);
    await expect(page.getByText(/보유중 1개/)).toHaveCount(0);
    await expect(page.getByText(/간장, 된장/)).toHaveCount(0);

    await seasoningBundle.click();
    await expect(page.getByRole("button", { name: /자주 쓰는 채소/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /마늘 보유중/ })).toBeDisabled();
    await page.getByRole("button", { name: "전체 해제" }).click();
    await expect(
      page.getByRole("button", {
        name: /재료 선택|추가할 재료를 선택해 주세요/,
      }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "전체 선택" }).click();
    await page.getByRole("button", { name: "2개 팬트리에 추가" }).click();

    await expect(page.getByText("2개 재료를 팬트리에 추가했어요")).toBeVisible();
    await expect(page.getByText(/5\s*개/).first()).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "간장 보유중" })).toBeVisible();
  });

  test("searches pantry items and shows an empty result state", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByText(/양파/)).toBeVisible();

    await page.getByRole("searchbox", { name: "팬트리 재료 검색" }).fill("없는");

    await expect(
      page.getByText('"없는"에 해당하는 재료가 없어요'),
    ).toBeVisible();
    await expect(page.getByText("검색어 지우기")).toBeVisible();
  });

  test("filters items by category chip", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryRoutes(page);
    await page.goto("/pantry");

    await expect(page.getByText(/양파/)).toBeVisible();

    // Click a category chip
    await page.getByRole("tab", { name: "채소/버섯" }).click();

    // Should apply the local category filter
    await expect(page.getByText(/양파/)).toBeVisible();
    await expect(page.getByText(/마늘/)).toBeHidden();
  });
});
