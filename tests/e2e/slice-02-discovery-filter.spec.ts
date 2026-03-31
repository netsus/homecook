import { expect, test } from "@playwright/test";

const ONION_ID = "550e8400-e29b-41d4-a716-446655440010";
const GREEN_ONION_ID = "550e8400-e29b-41d4-a716-446655440011";
const BEEF_ID = "550e8400-e29b-41d4-a716-446655440012";

const INGREDIENTS = [
  {
    id: ONION_ID,
    standard_name: "양파",
    category: "채소",
  },
  {
    id: GREEN_ONION_ID,
    standard_name: "대파",
    category: "채소",
  },
  {
    id: BEEF_ID,
    standard_name: "소고기",
    category: "육류",
  },
];

const RECIPES = [
  {
    id: "mock-kimchi-jjigae",
    title: "집밥 김치찌개",
    thumbnail_url:
      "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80",
    tags: ["한식", "찌개", "저녁"],
    base_servings: 2,
    view_count: 1284,
    like_count: 203,
    save_count: 89,
    source_type: "system",
    ingredient_ids: [ONION_ID, GREEN_ONION_ID],
  },
];

function buildRecipeItems(searchUrl: URL) {
  const query = searchUrl.searchParams.get("q")?.trim() ?? "";
  const ingredientIds = (searchUrl.searchParams.get("ingredient_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return RECIPES.filter((recipe) => {
    const matchesQuery = query.length === 0 || recipe.title.includes(query);
    const matchesIngredients =
      ingredientIds.length === 0 ||
      ingredientIds.every((ingredientId) =>
        recipe.ingredient_ids.includes(ingredientId),
      );

    return matchesQuery && matchesIngredients;
  }).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    thumbnail_url: recipe.thumbnail_url,
    tags: recipe.tags,
    base_servings: recipe.base_servings,
    view_count: recipe.view_count,
    like_count: recipe.like_count,
    save_count: recipe.save_count,
    source_type: recipe.source_type,
  }));
}

test.describe("Slice 02 discovery filter flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/recipes/themes", async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            themes: [
              {
                id: "popular",
                title: "이번 주 인기 레시피",
                recipes: buildRecipeItems(new URL("http://localhost/api/v1/recipes")),
              },
            ],
          },
          error: null,
        },
      });
    });

    await page.route("**/api/v1/ingredients**", async (route) => {
      const requestUrl = new URL(route.request().url());
      const query = requestUrl.searchParams.get("q")?.trim() ?? "";
      const category = requestUrl.searchParams.get("category");
      const items = INGREDIENTS.filter((ingredient) => {
        const matchesCategory = !category || ingredient.category === category;
        const matchesQuery =
          query.length === 0 || ingredient.standard_name.includes(query);

        return matchesCategory && matchesQuery;
      });

      await route.fulfill({
        json: {
          success: true,
          data: { items },
          error: null,
        },
      });
    });

    await page.route("**/api/v1/recipes?**", async (route) => {
      const requestUrl = new URL(route.request().url());

      await route.fulfill({
        json: {
          success: true,
          data: {
            items: buildRecipeItems(requestUrl),
            next_cursor: null,
            has_next: false,
          },
          error: null,
        },
      });
    });
  });

  test("applies ingredient filters, preserves selection on reopen, and resets on hard refresh", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "재료로 검색" }).click();
    await expect(
      page.getByRole("dialog", { name: "재료로 검색" }),
    ).toBeVisible();

    await page
      .getByRole("dialog", { name: "재료로 검색" })
      .getByText("양파", { exact: true })
      .click();
    await page.getByRole("button", { name: "적용" }).click();

    await expect(page).toHaveURL(new RegExp(`ingredient_ids=${ONION_ID}`));
    await expect(
      page.getByRole("button", { name: "재료로 검색 (1)" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "재료로 검색 (1)" }).click();
    await expect(page.getByRole("checkbox", { name: "양파" })).toBeChecked();
    await page.getByRole("button", { name: "닫기" }).click();

    await page.reload();

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("button", { name: "재료로 검색" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /집밥 김치찌개/i }).first(),
    ).toBeVisible();
  });

  test("shows the empty state for unmatched ingredients and clears the filter on demand", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "재료로 검색" }).click();
    await page.getByRole("button", { name: "육류" }).click();
    await page
      .getByRole("dialog", { name: "재료로 검색" })
      .getByText("소고기", { exact: true })
      .click();
    await page.getByRole("button", { name: "적용" }).click();

    await expect(
      page.getByRole("heading", { name: "다른 조합을 찾아보세요" }),
    ).toBeVisible();
    const resetButtons = page.getByRole("button", { name: "필터 초기화" });
    await expect(resetButtons.last()).toBeVisible();

    await resetButtons.last().click();

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("button", { name: "재료로 검색" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /집밥 김치찌개/i }).first(),
    ).toBeVisible();
  });

  test("keeps apply disabled when ingredient search has no results and no selection", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "재료로 검색" }).click();
    await page
      .getByRole("textbox", { name: "재료명으로 검색" })
      .fill("없는재료");
    await expect(
      page.getByRole("heading", { name: "검색 결과가 없어요" }),
    ).toBeVisible();

    await expect(page.getByRole("button", { name: "적용" })).toBeDisabled();
  });
});
