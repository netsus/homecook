import { expect, test, type Page } from "@playwright/test";

const recipeCard = {
  id: "recipe-tag-hansik",
  title: "한식 태그 김치찌개",
  thumbnail_url: null,
  tags: ["한식", "국물요리"],
  base_servings: 2,
  view_count: 12,
  like_count: 3,
  save_count: 5,
  source_type: "manual" as const,
  user_status: null,
};

async function mockRecipeTagApis(page: Page, recipeRequests: string[]) {
  await page.route("**/api/v1/ingredients**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { success: true, data: { items: [] }, error: null },
    });
  });
  await page.route("**/api/v1/tags**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        success: true,
        data: {
          items: [
            {
              normalized_key: "한식",
              label: "한식",
              slug: null,
              kind: "semantic",
              is_system: true,
              theme_eligible: true,
              usage_count: 12,
            },
          ],
        },
        error: null,
      },
    });
  });
  await page.route("**/api/v1/recipes/themes", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        success: true,
        data: {
          themes: [
            {
              id: "theme-hansik",
              title: "한식 인기",
              tag_key: "한식",
              tag_label: "한식",
              recipes: [recipeCard],
            },
          ],
        },
        error: null,
      },
    });
  });
  await page.route("**/api/v1/recipes?**", async (route) => {
    recipeRequests.push(route.request().url());
    await route.fulfill({
      contentType: "application/json",
      json: {
        success: true,
        data: {
          items: [recipeCard],
          next_cursor: null,
          has_next: false,
        },
        error: null,
      },
    });
  });
}

function expectKoreanTagFilter(recipeRequests: string[]) {
  return expect
    .poll(() =>
      recipeRequests.some((requestUrl) => {
        const url = new URL(requestUrl);
        return url.searchParams.get("tag") === "한식";
      }),
    )
    .toBe(true);
}

function expectNoRomanizedTagFilter(recipeRequests: string[]) {
  expect(
    recipeRequests.some((requestUrl) => {
      const url = new URL(requestUrl);
      return url.searchParams.get("tag") === "hansik";
    }),
  ).toBe(false);
}

test("HOME tag chip uses the Korean exact tag key", async ({ page }) => {
  const recipeRequests: string[] = [];
  await mockRecipeTagApis(page, recipeRequests);

  await page.goto("/");

  const tagRail = page.getByLabel("태그 필터");
  const hansikTagChip = tagRail.getByRole("button", { name: "한식", exact: true });
  await expect(hansikTagChip).toBeVisible();
  await hansikTagChip.click();

  await expectKoreanTagFilter(recipeRequests);
  expectNoRomanizedTagFilter(recipeRequests);
});

test("HOME tag-backed theme uses the Korean exact tag key", async ({ page }) => {
  const recipeRequests: string[] = [];
  await mockRecipeTagApis(page, recipeRequests);

  await page.goto("/");

  recipeRequests.length = 0;
  await page.getByRole("button", { name: /한식 인기/ }).click();

  await expectKoreanTagFilter(recipeRequests);
  expectNoRomanizedTagFilter(recipeRequests);
});
