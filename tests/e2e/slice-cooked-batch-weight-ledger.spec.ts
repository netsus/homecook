import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const RECIPE_ID = "550e8400-e29b-41d4-a716-446655440001";
const BATCH_ID = "550e8400-e29b-41d4-a716-446655440002";
const PRODUCT_PANTRY_ID = "550e8400-e29b-41d4-a716-446655440003";
const INGREDIENT_PANTRY_ID = "550e8400-e29b-41d4-a716-446655440004";
const EQUIVALENT_PANTRY_ID = "550e8400-e29b-41d4-a716-446655440007";
const COOK_MODE_PATH = `/cooking/session-attempts/${SESSION_ID}/cook-mode`;
const evidenceDirectory = resolve("ui/designs/evidence/cooked-batch-weight-ledger");

const snapshot = {
  session_id: SESSION_ID,
  contract_version: "snapshot_v2",
  mode: "standalone",
  status: "in_progress",
  recipe: {
    id: RECIPE_ID,
    title: "매콤한 닭가슴살 김치찌개",
    cooking_servings: 2,
    ingredients: [
      {
        ingredient_id: "ingredient-chicken",
        standard_name: "닭가슴살",
        amount: 240,
        unit: "g",
        display_text: "닭가슴살 240g",
        ingredient_type: "QUANT",
        scalable: true,
      },
      {
        ingredient_id: "ingredient-onion",
        standard_name: "양파",
        amount: 1,
        unit: "개",
        display_text: "양파 1개",
        ingredient_type: "QUANT",
        scalable: true,
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "닭가슴살과 김치를 볶아요.",
        cooking_method: { code: "STIR_FRY", label: "볶기", color_key: "orange" },
        ingredients_used: [],
        heat_level: "medium",
        duration_seconds: 300,
        duration_text: "5분",
      },
      {
        step_number: 2,
        instruction: "물을 넣고 충분히 끓여요.",
        cooking_method: { code: "BOIL", label: "끓이기", color_key: "orange" },
        ingredients_used: [],
        heat_level: "medium",
        duration_seconds: 600,
        duration_text: "10분",
      },
    ],
  },
  pantry_candidates: [
    {
      pantry_item_id: PRODUCT_PANTRY_ID,
      ingredient_id: "ingredient-chicken",
      item_type: "food_product",
      standard_name: "닭가슴살",
      food_product_id: "550e8400-e29b-41d4-a716-446655440005",
      food_product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440006",
      name: "닭가슴살 오리지널",
      brand: "하림",
    },
    {
      pantry_item_id: EQUIVALENT_PANTRY_ID,
      ingredient_id: "ingredient-chicken",
      item_type: "food_product",
      standard_name: "닭가슴살",
      food_product_id: "550e8400-e29b-41d4-a716-446655440008",
      food_product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440009",
      name: "담백 닭가슴살",
      brand: null,
    },
    {
      pantry_item_id: INGREDIENT_PANTRY_ID,
      ingredient_id: "ingredient-onion",
      item_type: "ingredient",
      standard_name: "양파",
      food_product_id: null,
      food_product_nutrition_version_id: null,
      name: "양파",
      brand: null,
    },
  ],
};

const completion = {
  session_id: SESSION_ID,
  contract_version: "snapshot_v2",
  mode: "standalone",
  status: "completed",
  cooked_batch: {
    id: BATCH_ID,
    recipe_id: RECIPE_ID,
    recipe_title: snapshot.recipe.title,
    recipe_thumbnail_url: null,
    status: "leftover",
    cooked_at: "2026-08-09T08:00:00.000Z",
    cooking_servings: 2,
    finished_weight_g: 640,
    remaining_weight_g: 640,
    weight_status: "known",
    batch_status: "available",
    depleted_reason: null,
    revision: 1,
    nutrition_calculation_status: "complete",
    current_unweighed_closure_event_id: null,
  },
  meals_updated: 0,
  pantry_removed: 1,
  cook_count: 1,
};

async function installCookModeRoute(page: Page, candidates = snapshot.pantry_candidates) {
  await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", async (route) => {
    await route.fulfill({
      json: { success: true, data: { ...snapshot, pantry_candidates: candidates }, error: null },
    });
  });
}

async function openCompletion(page: Page) {
  await page.goto(COOK_MODE_PATH);
  const opener = page.getByRole("button", { name: "요리 완료" });
  await expect(opener).toBeVisible();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "요리 완료" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "요리 완료" })).toBeFocused();
  return { dialog, opener };
}

async function stabilizeEvidenceCapture(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.status)).toBe("loaded");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
}

async function waitForSettledPaint(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolvePaint) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()));
    }),
  );
}

async function fulfillConflict(route: Route) {
  await route.fulfill({
    status: 409,
    json: {
      success: false,
      data: null,
      error: { code: "CONFLICT", message: "팬트리 항목이 변경됐어요.", fields: [] },
    },
  });
}

test.describe("cooked-batch-weight-ledger", () => {
  test.beforeEach(async ({ page }) => {
    await setE2EAuthOverride(page);
    await installAccountLibraryVisualRoutes(page);
  });

  test("preserves exact identity and input on conflict, reuses the key, and consumes replay once", async ({ page }) => {
    await installCookModeRoute(page);
    const requests: Array<{ body: unknown; key: string | null }> = [];
    let attempts = 0;
    await page.route("**/api/v1/cooking/session-attempts/*/complete", async (route) => {
      attempts += 1;
      requests.push({
        body: route.request().postDataJSON(),
        key: route.request().headers()["idempotency-key"] ?? null,
      });
      if (attempts === 1) {
        await fulfillConflict(route);
        return;
      }
      await route.fulfill({ json: { success: true, data: completion, error: null } });
    });

    const { dialog } = await openCompletion(page);
    const product = dialog.getByRole("checkbox", { name: /닭가슴살 오리지널.*하림/ });
    const equivalent = dialog.getByRole("checkbox", { name: /담백 닭가슴살.*무브랜드/ });
    const ingredient = dialog.getByRole("checkbox", { name: /양파.*일반 재료/ });
    await expect(product).toHaveAttribute("aria-checked", "false");
    await expect(equivalent).toHaveAttribute("aria-checked", "false");
    await expect(ingredient).toHaveAttribute("aria-checked", "false");
    await expect(dialog).not.toContainText(PRODUCT_PANTRY_ID);
    await product.click();
    await expect(equivalent).toHaveAttribute("aria-checked", "false");
    await dialog.getByRole("radio", { name: "음식만 무게(g)" }).click();
    const weight = dialog.getByRole("spinbutton", { name: "완성 직후 음식 전체 중량" });
    await weight.fill("640");
    await dialog.getByRole("button", { name: "완료 저장" }).click();

    const alert = dialog.getByRole("alert");
    await expect(alert).toBeFocused();
    await expect(product).toBeChecked();
    await expect(weight).toHaveValue("640");
    await dialog.getByRole("button", { name: "완료 저장" }).click();

    await expect(page.getByText("저장된 완료 결과를 확인했어요.")).toBeVisible();
    await expect(page.getByText("팬트리 항목 1개를 반영했어요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "요리 완료" })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "요리 완료" })).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect(requests[0].body).toEqual({
      consumed_pantry_item_ids: [PRODUCT_PANTRY_ID],
      weight_action: "set_finished_weight",
      finished_weight_g: 640,
    });
    expect(requests[1].body).toEqual(requests[0].body);
    expect(requests[0].key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(requests[1].key).toBe(requests[0].key);
  });

  test("keeps an empty candidate list explicit and locks every path while pending", async ({ page }) => {
    await installCookModeRoute(page, []);
    let release!: () => void;
    const pending = new Promise<void>((resolvePending) => { release = resolvePending; });
    let requestBody: unknown;
    await page.route("**/api/v1/cooking/session-attempts/*/complete", async (route) => {
      requestBody = route.request().postDataJSON();
      await pending;
      await route.fulfill({
        json: {
          success: true,
          data: { ...completion, pantry_removed: 0, cooked_batch: { ...completion.cooked_batch, finished_weight_g: null, remaining_weight_g: null, weight_status: "missing" } },
          error: null,
        },
      });
    });

    const { dialog } = await openCompletion(page);
    await expect(dialog.getByText("사용할 팬트리 항목이 없어요")).toBeVisible();
    await dialog.getByRole("radio", { name: "나중에 입력" }).click();
    await dialog.getByRole("button", { name: "완료 저장" }).click();
    await expect(dialog.getByRole("status")).toContainText("완료 결과를 기다리는 중이에요");
    await expect(dialog.getByRole("radio", { name: "나중에 입력" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "돌아가기" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "저장 중…" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    expect(requestBody).toEqual({
      consumed_pantry_item_ids: [],
      weight_action: "weigh_later",
      finished_weight_g: null,
    });
    release();
    await expect(dialog).toHaveCount(0);
  });

  test("captures desktop, 390px, and 320px evidence with focus, target, overflow, and WCAG checks", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "This test sets both exact evidence viewports itself.");
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(`${message.text()} @ ${message.location().url}`);
      }
    });
    await installCookModeRoute(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const { dialog, opener } = await openCompletion(page);
    expect((await dialog.getByRole("heading", { name: "요리 완료" }).boundingBox())?.x).toBe(16);

    for (const button of await dialog.getByRole("button").all()) {
      expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    for (const label of await dialog.locator("label").all()) {
      expect((await label.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    const close = dialog.getByRole("button", { name: "닫기" });
    const lastFocusable = dialog.getByRole("button", { name: "돌아가기" });
    await lastFocusable.focus();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(lastFocusable).toBeFocused();
    await dialog.getByRole("heading", { name: "요리 완료" }).focus();
    const seriousViolations = (await new AxeBuilder({ page }).include('[data-testid="cooked-batch-completion-sheet"]').analyze())
      .violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(seriousViolations).toEqual([]);
    await stabilizeEvidenceCapture(page);

    for (const [width, height, filename] of [
      [1280, 900, "COOK_MODE-implementation-desktop-1280.png"],
      [390, 844, "COOK_MODE-implementation-mobile-default-390.png"],
      [320, 568, "COOK_MODE-implementation-mobile-narrow-320.png"],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.mouse.move(0, 0);
      await waitForSettledPaint(page);
      expect(
        await dialog
          .getByRole("button", { name: "완료 저장" })
          .evaluate((button) => button.matches(":hover")),
      ).toBe(false);
      const path = resolve(evidenceDirectory, filename);
      await mkdir(dirname(path), { recursive: true });
      await page.screenshot({ animations: "disabled", fullPage: false, path });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      const box = await dialog.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(width);
      expect(box ? box.y + box.height : undefined).toBeLessThanOrEqual(height);
    }
    const narrowWeightAction = dialog.getByRole("radio", { name: "나중에 입력" });
    await narrowWeightAction.scrollIntoViewIfNeeded();
    await expect(narrowWeightAction).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(consoleErrors).toEqual([]);
  });
});
