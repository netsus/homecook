import { expect, test, type Page } from "@playwright/test";

const ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const AUTH_KEY = "homecook.e2e-auth-override";
const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const RECIPE_ID = "77777777-7777-4777-8777-777777777777";

async function authenticate(page: Page) {
  await page.context().addCookies([{
    name: AUTH_KEY,
    value: "authenticated",
    url: ORIGIN,
    sameSite: "Lax",
  }]);
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, "authenticated");
  }, { key: AUTH_KEY });
}

test("saved YouTube recipe keeps compact quantity editing and opens my-added", async ({ page }, testInfo) => {
  await authenticate(page);

  let revision = 1;
  let recipeBookReads = 0;
  let content = {
    title: "유튜브 된장찌개",
    base_servings: 2,
    tags: ["한식", "찌개"],
    ingredients: [{
      row_id: "22222222-2222-4222-8222-222222222222",
      source_draft_ingredient_id: null,
      standard_name: "두부",
      quantity_mode: "quantity" as const,
      amount: 200,
      unit: "g",
      display_text: "두부 200g",
      component_label: null,
    }],
    steps: [{
      row_id: "33333333-3333-4333-8333-333333333333",
      source_step_index: 0,
      instruction: "재료를 넣고 끓인다.",
      component_label: null,
      duration_text: "10분",
    }],
  };

  const savedResult = () => ({
    draft_id: DRAFT_ID,
    recipe_id: RECIPE_ID,
    revision,
    created_at: "2026-10-12T00:00:00.000Z",
    updated_at: "2026-10-12T00:01:00.000Z",
    content,
    ingredient_links: {},
    source: {
      extraction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      youtube_url: "https://www.youtube.com/watch?v=abcdefghijk",
      youtube_video_id: "abcdefghijk",
      thumbnail_url: null,
    },
  });

  await page.route(`**/api/v1/recipes/youtube/saved-drafts/${DRAFT_ID}`, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = await route.request().postDataJSON() as { content: typeof content };
      content = body.content;
      revision += 1;
    }
    await route.fulfill({ json: { success: true, data: savedResult(), error: null } });
  });
  await page.route("**/api/v1/cooking-methods", (route) => route.fulfill({
    json: { success: true, data: { methods: [] }, error: null },
  }));
  await page.route("**/api/v1/recipe-books", async (route) => {
    recipeBookReads += 1;
    await route.fulfill({
      json: {
        success: true,
        data: {
          books: [{
            id: "book-my-added",
            name: "내가 추가한 레시피",
            book_type: "my_added",
            recipe_count: 1,
            sort_order: 0,
          }],
        },
        error: null,
      },
    });
  });

  await page.goto(`/recipes/youtube/saved/${DRAFT_ID}`);
  await expect(page.getByRole("heading", { name: "유튜브 된장찌개" })).toBeVisible();
  await expect(page.getByRole("button", { name: "내가 추가한 레시피에서 보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "플래너에 추가" })).toBeVisible();

  await page.getByRole("button", { name: "재료 수정" }).click();
  const amount = page.getByLabel("두부 수량");
  const unit = page.getByLabel("두부 단위 직접 입력");
  await unit.fill("아주 긴 사용자 단위");
  await expect(unit).toHaveValue("아주 긴 사용자 단위");
  await expect(page.getByText("직접 입력", { exact: true })).toHaveCount(0);
  await expect(page.getByText("확인됨", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "두부 g" })).toHaveCount(0);

  const [amountBox, unitBox, viewport] = await Promise.all([
    amount.boundingBox(),
    unit.boundingBox(),
    page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ]);
  expect(amountBox).not.toBeNull();
  expect(unitBox).not.toBeNull();
  expect(unitBox!.x).toBeGreaterThanOrEqual(amountBox!.x + amountBox!.width - 1);
  expect(unitBox!.x + unitBox!.width).toBeLessThanOrEqual(viewport.width);
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);

  await testInfo.attach("youtube-quantity-edit", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });

  await page.getByRole("button", { name: "수정 완료" }).click();
  await page.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(page.getByText("아주 긴 사용자 단위", { exact: false })).toBeVisible();

  await page.reload();
  await expect(page.getByText("아주 긴 사용자 단위", { exact: false })).toBeVisible();
  const openBook = page.getByRole("button", { name: "내가 추가한 레시피에서 보기" });
  await openBook.dblclick();
  await page.waitForURL(/\/mypage\/recipe-books\/book-my-added/u);
  expect(recipeBookReads).toBe(1);
  const destination = new URL(page.url());
  expect(destination.searchParams.get("type")).toBe("my_added");
  expect(destination.searchParams.get("readerRecipe")).toBe(RECIPE_ID);
});
