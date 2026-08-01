import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { setE2EAuthOverride } from "./helpers/mock-routes";

const OWNED_PRODUCT_LABEL =
  "현미 즉석밥 · 집밥식품 · 영양 버전 nutrition-version-owned";
const NEW_PRODUCT_LABEL =
  "현미 즉석밥 · 집밥식품 · 영양 버전 nutrition-version-new";

const OWNED_PRODUCT = {
  id: "product-owned",
  food_product_id: "food-product-owned",
  food_product_nutrition_version_id: "nutrition-version-owned",
  name: "현미 즉석밥",
  brand: "집밥식품",
  created_at: "2026-07-31T00:00:00.000Z",
};

const SEARCH_PRODUCT = {
  id: OWNED_PRODUCT.food_product_id,
  name: OWNED_PRODUCT.name,
  brand: OWNED_PRODUCT.brand,
  visibility: "public",
  source_type: "public_dataset",
  editable: false,
  nutrition_version_id: "nutrition-version-new",
  basis_relations: [],
  nutrition: {
    basis: { amount: 100, unit: "ml" },
    values: {},
    calculation_status: "complete",
    calculation_quality: "direct",
    warnings: [],
    sources: [],
  },
};

const GENERIC_ITEM = {
  id: "pantry-generic",
  ingredient_id: "ingredient-onion",
  standard_name: "양파",
  category: "채소",
  category_group_code: "vegetable_mushroom",
  category_code: "vegetable",
  category_label: "채소",
  created_at: "2026-07-31T00:00:00.000Z",
};

async function installProductPantryRoutes(page: Page) {
  let productItems = [OWNED_PRODUCT];
  let submittedBody: unknown = null;

  await page.route(
    (url) => url.pathname === "/api/v1/pantry",
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          json: {
            success: true,
            data: { items: [GENERIC_ITEM], product_items: productItems },
            error: null,
          },
        });
        return;
      }

      if (route.request().method() === "POST") {
        submittedBody = route.request().postDataJSON();
        const addedProduct = {
          id: "product-new",
          food_product_id: SEARCH_PRODUCT.id,
          food_product_nutrition_version_id:
            SEARCH_PRODUCT.nutrition_version_id,
          name: SEARCH_PRODUCT.name,
          brand: SEARCH_PRODUCT.brand,
          created_at: "2026-07-31T00:01:00.000Z",
        };
        productItems = [...productItems, addedProduct];
        await route.fulfill({
          status: 201,
          json: {
            success: true,
            data: {
              added: 0,
              items: [],
              product_added: 1,
              product_items: [addedProduct],
            },
            error: null,
          },
        });
        return;
      }

      await route.fallback();
    },
  );

  await page.route("**/api/v1/ingredients**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { items: [], next_cursor: null, has_next: false },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/food-products?**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [SEARCH_PRODUCT],
          next_cursor: null,
          has_next: false,
        },
        error: null,
      },
    });
  });

  return {
    submittedBody: () => submittedBody,
  };
}

async function verifyExactProductConsumer(
  page: Page,
  testInfo: TestInfo,
  viewport: { height: number; label: string; width: number },
) {
  await page.setViewportSize({
    height: viewport.height,
    width: viewport.width,
  });
  await setE2EAuthOverride(page);
  const routes = await installProductPantryRoutes(page);

  await page.goto("/pantry");

  await expect(page.getByLabel(OWNED_PRODUCT_LABEL)).toBeVisible();
  await expect(page.getByText("양파", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /현미 즉석밥/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "현미 즉석밥 삭제" }),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: /재료 추가/ })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "재료 추가" });
  const searchbox = dialog.getByRole("textbox", { name: "재료명 검색" });
  await searchbox.fill("현미");
  await expect(
    dialog.getByRole("checkbox", { name: NEW_PRODUCT_LABEL }),
  ).toBeEnabled();
  await searchbox.fill("");
  await dialog.getByText("채소/버섯", { exact: true }).click();
  await expect(
    dialog.getByRole("checkbox", { name: NEW_PRODUCT_LABEL }),
  ).toHaveCount(0);
  await searchbox.fill("즉석밥");
  await dialog.getByRole("checkbox", { name: NEW_PRODUCT_LABEL }).click();
  await dialog.getByRole("button", { name: "팬트리에 추가 (1)" }).click();

  await expect.poll(routes.submittedBody).toEqual({
    product_items: [
      {
        food_product_id: "food-product-owned",
        food_product_nutrition_version_id: "nutrition-version-new",
      },
    ],
  });
  await expect(dialog).toBeHidden();
  const addedProduct = page.getByLabel(NEW_PRODUCT_LABEL);
  await expect(addedProduct).toBeVisible();
  await addedProduct.scrollIntoViewIfNeeded();

  await testInfo.attach(`pantry-${viewport.label}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test.describe("product-ingredient-link-foundation existing PANTRY consumer", () => {
  test("product-ingredient-link-foundation desktop evidence", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chrome",
      "desktop evidence uses the desktop project",
    );
    await verifyExactProductConsumer(page, testInfo, {
      height: 900,
      label: "desktop-1280",
      width: 1280,
    });
  });

  test("product-ingredient-link-foundation 390px evidence", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "390px evidence uses the mobile project",
    );
    await verifyExactProductConsumer(page, testInfo, {
      height: 844,
      label: "mobile-390",
      width: 390,
    });
  });

  test("product-ingredient-link-foundation 320px evidence", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "320px evidence uses the mobile project",
    );
    await verifyExactProductConsumer(page, testInfo, {
      height: 568,
      label: "mobile-320",
      width: 320,
    });
  });
});
