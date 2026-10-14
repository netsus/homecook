import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ManualRecipeCreateBody, RecipeEditDraft } from "../../types/recipe";
import { installRecipeProductUiFixture, PRODUCT_UI_DRAFT, PRODUCT_UI_IDS, PRODUCT_UI_MESSAGE } from "./helpers/recipe-product-ui-fixture";

// QA inventory: blank actual usage; pinned source/version/row UUID; supported units;
// independent brands; raw step text; failed write message/focus/busy release;
// retry/cancel/reopen and metadata-loss reload; nullable legacy consumption.
// Off-happy paths: disabled product writes and lost transient unit evidence.
const evidenceDir = process.env.HOMECOOK_PRODUCT_UI_EVIDENCE_DIR ?? "/tmp/mumeok-v9-product-ui-evidence";

async function capture(page: Page, name: string) {
  await mkdir(evidenceDir, { recursive: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.screenshot({ path: join(evidenceDir, `${name}.png`), fullPage: false, scale: "css" });
}

for (const width of [320, 375, 1440]) {
  test.describe(`product UI ${width}px`, () => {
    test.beforeEach(async ({ page }, info) => {
      test.skip(info.project.name !== "desktop-chrome", "Exact widths are set inside this fixture spec.");
      await page.setViewportSize({ width, height: width === 320 ? 568 : width === 375 ? 812 : 900 });
    });

    test("selects independent public products with blank usage and preserves a rejected manual draft", async ({ page, baseURL }) => {
      const fixture = await installRecipeProductUiFixture(page, new URL(baseURL!).origin);
      await page.goto("/menu/add/manual");
      await page.getByPlaceholder("예: 김치찌개").fill("제품 UI 확인 요리");
      await page.getByRole("button", { name: "+ 재료 추가하기" }).click();
      const picker = page.getByRole("dialog").filter({ has: page.getByRole("checkbox", { name: "원문 업체 A · 양조간장" }) });
      await expect(picker).toBeVisible();
      await expect(picker).toHaveAttribute("aria-modal", "true");
      await page.getByRole("checkbox", { name: "원문 업체 A · 양조간장" }).click();
      await page.getByRole("checkbox", { name: "원문 업체 B · 양조간장" }).click();
      await capture(page, `picker-selected-${width}`);
      await page.getByRole("button", { name: "선택한 재료 2개 추가" }).click();
      const amountA = page.getByRole("textbox", { name: "원문 업체 A · 양조간장 수량" });
      const amountB = page.getByRole("textbox", { name: "원문 업체 B · 양조간장 수량" });
      await expect(amountA).toHaveValue("");
      await expect(amountB).toHaveValue("");
      await amountA.scrollIntoViewIfNeeded();
      await capture(page, `manual-blank-${width}`);
      await amountA.fill("60");
      await page.getByRole("combobox", { name: "원문 업체 A · 양조간장 단위" }).selectOption("package");
      await expect(amountA).toHaveValue("0.5");
      await amountB.fill("20");
      await page.getByRole("button", { name: "준비", exact: true }).click();
      await page.getByLabel("만들기 1 설명").fill("원문 업체 A 양조간장 10g을 넣어요.");
      await page.getByRole("button", { name: "+ 만들기 추가" }).click();
      await page.getByRole("button", { name: "저장", exact: true }).click();
      const alert = page.getByRole("alert").filter({ hasText: PRODUCT_UI_MESSAGE });
      await expect(alert).toContainText(PRODUCT_UI_MESSAGE);
      await expect(alert).toBeFocused();
      await expect(alert).toBeInViewport();
      await expect.poll(() => alert.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
      await expect(page.getByRole("button", { name: "저장", exact: true })).toBeEnabled();
      expect(fixture.writes).toHaveLength(1);
      const body = fixture.writes[0].body as ManualRecipeCreateBody;
      expect(body.ingredients[0]).toMatchObject({ ingredient_id: null, food_product_id: PRODUCT_UI_IDS.productA,
        food_product_nutrition_version_id: PRODUCT_UI_IDS.versionA, amount: 0.5, unit: "package" });
      expect(body.ingredients[0].row_key).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.ingredients[1].row_key).not.toBe(body.ingredients[0].row_key);
      expect(body.ingredients[0]).not.toHaveProperty("nutrition");
      expect(body.steps[0].ingredients_used).toEqual([]);
      await capture(page, `manual-unavailable-${width}`);
      await page.reload();
      await expect(amountA).toHaveValue("0.5");
      await expect(page.getByRole("combobox", { name: "원문 업체 A · 양조간장 단위" })).toHaveValue("package");
      await expect(page.getByText(/기존 단위와 분량은 유지돼요/).first()).toBeVisible();
      await expect(page.getByRole("combobox", { name: "원문 업체 A · 양조간장 단위" }).getByRole("option")).toHaveCount(1);
      expect(fixture.writes).toHaveLength(1);
      expect(fixture.blockedOrigins).toEqual([]);
      expect(fixture.pageErrors).toEqual([]);
    });

    test("retains the owner draft through unavailable PATCH and fork saves", async ({ page, baseURL }) => {
      const fixture = await installRecipeProductUiFixture(page, new URL(baseURL!).origin);
      await page.goto(`/recipe/${PRODUCT_UI_IDS.recipe}?qaFutureImpact=1`);
      await page.getByRole("button", { name: "편집", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "레시피 편집", exact: true });
      await expect(editor.getByRole("textbox", { name: "레시피 제목" })).toBeFocused();
      await editor.getByRole("textbox", { name: "레시피 제목" }).fill("제품 초안 보존 확인");
      await editor.getByRole("button", { name: "변경사항 저장" }).click();
      const impact = page.getByRole("dialog", { name: "미래 계획 반영 확인" });
      await impact.getByRole("radio", { name: /기존 계획 유지/ }).click();
      await impact.getByRole("button", { name: "저장", exact: true }).click();
      await expect(impact.getByRole("alert")).toContainText(PRODUCT_UI_MESSAGE);
      await expect(impact.getByRole("alert")).toBeInViewport();
      await expect(impact.getByRole("button", { name: "다시 확인" })).toBeFocused();
      await expect(impact).toHaveAttribute("aria-busy", "false");
      await expect(impact.getByRole("button", { name: "취소" })).toBeEnabled();
      await capture(page, `impact-unavailable-${width}`);
      await impact.getByRole("button", { name: "다시 확인" }).click();
      await expect(impact.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
      await impact.getByRole("button", { name: "취소" }).click();
      await expect(editor.getByRole("textbox", { name: "레시피 제목" })).toHaveValue("제품 초안 보존 확인");
      await editor.getByRole("button", { name: "새 레시피로 저장" }).click();
      await expect(editor.getByRole("alert")).toContainText(PRODUCT_UI_MESSAGE);
      await expect(editor.getByRole("alert")).toBeFocused();
      await expect(editor.getByRole("alert")).toBeInViewport();
      await expect(editor.getByRole("button", { name: "새 레시피로 저장" })).toBeEnabled();
      await capture(page, `fork-unavailable-${width}`);
      expect(fixture.writes).toHaveLength(2);
      for (const write of fixture.writes) {
        const body = write.body as { draft: RecipeEditDraft };
        expect(body.draft.ingredients).toEqual(PRODUCT_UI_DRAFT.ingredients);
        expect(body.draft.steps).toEqual(PRODUCT_UI_DRAFT.steps);
      }
      expect(fixture.blockedOrigins).toEqual([]);
      expect(fixture.pageErrors).toEqual([]);
    });

    test("shows legacy product rows while submitting only original generic consumption IDs", async ({ page, baseURL }) => {
      const fixture = await installRecipeProductUiFixture(page, new URL(baseURL!).origin);
      await page.goto("/cooking/sessions/product-ui-session/cook-mode");
      await expect(page.getByTestId(`cook-mode-ingredient-${PRODUCT_UI_IDS.rowA}`)).toBeVisible();
      await expect(page.getByTestId(`cook-mode-ingredient-${PRODUCT_UI_IDS.rowA}`)).toContainText("30g");
      await expect(page.getByTestId(`cook-mode-ingredient-${PRODUCT_UI_IDS.rowB}`)).toBeVisible();
      await expect(page.getByTestId("cook-mode-step-copy-1")).toHaveText(PRODUCT_UI_DRAFT.steps[0].instruction);
      await capture(page, `cook-products-${width}`);
      await page.getByTestId("complete-button").click();
      const sheet = page.getByTestId("consumed-ingredient-sheet");
      await expect(sheet.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
      await expect(sheet.getByRole("checkbox", { name: /원문 업체 A/ })).toBeDisabled();
      await expect(sheet.getByRole("checkbox", { name: /원문 업체 B/ })).toBeDisabled();
      await expect(sheet.getByRole("checkbox", { name: /원문 업체 A/ })).toContainText("30g");
      await expect(sheet.getByText("이전 요리 완료 화면에서는 제품별 팬트리 소진을 선택할 수 없어요.")).toHaveCount(2);
      await capture(page, `consumed-products-${width}`);
      await sheet.getByTestId("consumed-confirm-button").click();
      await expect.poll(() => fixture.writes.length).toBe(1);
      expect(fixture.writes[0].body).toMatchObject({ consumed_ingredient_ids: [PRODUCT_UI_IDS.generic] });
      expect(fixture.blockedOrigins).toEqual([]);
      expect(fixture.pageErrors).toEqual([]);
    });
  });
}
