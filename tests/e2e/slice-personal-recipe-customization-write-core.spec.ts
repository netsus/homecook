import { expect, test, type Page } from "@playwright/test";

import {
  RECIPE_ID,
  RECIPE_PATH,
  installRecipeDetailRoutes,
  setE2EAuthOverride,
} from "./helpers/mock-routes";
import { MOCK_RECIPE_DETAIL } from "../../lib/mock/recipes";
import type { RecipeDetail, RecipeEditDraft } from "../../types/recipe";

const PINNED_TITLE = "삭제 전 두부찌개";

interface FutureImpactPreviewRequest {
  base_recipe_revision: number;
  draft: RecipeEditDraft;
}

interface FutureImpactPatchRequest extends FutureImpactPreviewRequest {
  future_plan_strategy: "keep" | "replace_all";
  impact_token: string;
  image_object_id: string | null;
}

function cloneRecipeDetail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return JSON.parse(JSON.stringify({
    ...MOCK_RECIPE_DETAIL,
    revision: 12,
    ...overrides,
  })) as RecipeDetail;
}

async function installPinnedHistoryRoutes(page: Page) {
  await page.route("**/api/v1/planner?*", async (route) => {
    const now = new Date();
    const planDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");

    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: [{ id: "column-dinner", name: "저녁", sort_order: 0 }],
          meals: [
            {
              id: "meal-pinned",
              recipe_id: "recipe-deleted",
              recipe_title: PINNED_TITLE,
              recipe_thumbnail_url: null,
              plan_date: planDate,
              column_id: "column-dinner",
              planned_servings: 2,
              status: "cook_done",
              is_leftover: false,
              shopping_list_id: null,
              shopping_list_title: null,
            },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/cooking/sessions/*/cook-mode", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          session_id: "session-pinned",
          recipe: {
            id: "recipe-deleted",
            title: PINNED_TITLE,
            cooking_servings: 2,
            ingredients: [
              {
                ingredient_id: "ingredient-tofu",
                standard_name: "두부",
                amount: 1,
                unit: "모",
                display_text: "두부 1모",
                ingredient_type: "QUANT",
                scalable: true,
              },
            ],
            steps: [
              {
                step_number: 1,
                instruction: "두부를 넣고 5분간 끓여주세요.",
                cooking_method: {
                  code: "boil",
                  label: "끓이기",
                  color_key: "boil",
                },
                ingredients_used: [
                  { ingredient_id: "ingredient-tofu", amount: 1, unit: "모" },
                ],
                heat_level: "medium",
                duration_seconds: 300,
                duration_text: null,
              },
            ],
          },
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/leftovers?*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              id: "leftover-pinned",
              recipe_id: "recipe-deleted",
              recipe_title: PINNED_TITLE,
              recipe_thumbnail_url: null,
              status: "leftover",
              cooked_at: "2026-08-20T09:00:00.000Z",
              eaten_at: null,
              stale_reviewed_at: null,
              cooking_servings: 2,
              source_meal_label: "저녁",
              source_planned_servings: 2,
            },
          ],
        },
        error: null,
      },
    });
  });
}

async function installSnapshotReadDrainRoute(page: Page, recipeTitle = "고정된 김치찌개") {
  await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          session_id: "snapshot-read-drain",
          contract_version: "snapshot_v2",
          mode: "planner",
          status: "completed",
          recipe: {
            id: "recipe-snapshot-drain",
            title: recipeTitle,
            cooking_servings: 2,
            ingredients: [
              {
                ingredient_id: "ingredient-kimchi",
                standard_name: "김치",
                amount: 200,
                unit: "g",
                display_text: "김치 200g",
                ingredient_type: "QUANT",
                scalable: true,
              },
            ],
            steps: [
              {
                step_number: 1,
                instruction: "김치를 냄비에 넣고 10분간 끓여요.",
                cooking_method: {
                  code: "BOIL",
                  label: "끓이기",
                  color_key: "orange",
                },
                ingredients_used: [],
                heat_level: "medium",
                duration_seconds: 600,
                duration_text: "10분",
              },
            ],
          },
          pantry_candidates: [],
        },
        error: null,
      },
    });
  });
}

test.describe("personal-recipe-customization-write-core", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !["desktop-chrome", "mobile-chrome"].includes(testInfo.project.name),
      "이 closeout 증거는 desktop-chrome, mobile-chrome만 사용해요.",
    );
    await setE2EAuthOverride(page);
  });

  test("keeps same recipe id on owner save and reloads the updated detail destination", async ({
    page,
  }) => {
    const updatedTitle = "같은 ID로 저장된 김치찌개";
    const recipe = cloneRecipeDetail();
    const previewPayloadRef: { current: FutureImpactPreviewRequest | null } = {
      current: null,
    };
    const patchPayloadRef: { current: FutureImpactPatchRequest | null } = {
      current: null,
    };
    let patchKey = "";

    await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
      if (route.request().method() === "PATCH") {
        patchKey = route.request().headers()["idempotency-key"] ?? "";
        patchPayloadRef.current = await route.request().postDataJSON() as FutureImpactPatchRequest;
        recipe.title = patchPayloadRef.current.draft.title;
        recipe.description = patchPayloadRef.current.draft.description;
        recipe.base_servings = patchPayloadRef.current.draft.base_servings;
        recipe.revision = 13;

        await route.fulfill({
          json: {
            success: true,
            data: { id: RECIPE_ID, revision: 13 },
            error: null,
          },
        });
        return;
      }

      await route.fulfill({
        json: {
          success: true,
          data: recipe,
          error: null,
        },
      });
    });

    await page.route(`**/api/v1/recipes/${RECIPE_ID}/future-plan-impact`, async (route) => {
      previewPayloadRef.current = await route.request().postDataJSON() as FutureImpactPreviewRequest;
      await route.fulfill({
        json: {
          success: true,
          data: {
            impact_token: "impact-same-id",
            expires_at: "2026-08-21T16:00:00.000+09:00",
            proposed_content_hash: "a".repeat(64),
            future_meal_count: 1,
            date_range: { from: "2026-08-21", to: "2026-08-21" },
            incomplete_shopping_list_count: 1,
            completed_shopping_list_count: 0,
            active_cooking_claim_count: 0,
            replace_all_allowed: true,
          },
          error: null,
        },
      });
    });

    await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);
    await page.getByRole("button", { name: "편집", exact: true }).click();
    await page.getByRole("textbox", { name: "레시피 제목" }).fill(updatedTitle);
    await page.getByRole("button", { name: "변경사항 저장" }).click();

    const keepStrategy = page.getByRole("radio", { name: /기존 계획 유지/ });
    await expect(keepStrategy).toBeVisible();
    await keepStrategy.click();
    await page.getByRole("button", { name: "저장" }).click();

    await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "레시피 편집" }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH.replaceAll("/", "\\/")}\\?qaFutureImpact=1$`));

    expect(previewPayloadRef.current).not.toBeNull();
    expect(patchPayloadRef.current).not.toBeNull();
    if (!previewPayloadRef.current || !patchPayloadRef.current) {
      throw new Error("preview/patch payload should be captured before assertions");
    }

    const recordedPreview = previewPayloadRef.current;
    const recordedPatch = patchPayloadRef.current;

    expect(recordedPreview.base_recipe_revision).toBe(12);
    expect(recordedPreview.draft.title).toBe(updatedTitle);
    expect(recordedPatch).toMatchObject({
      base_recipe_revision: 12,
      future_plan_strategy: "keep",
      impact_token: "impact-same-id",
    });
    expect(recordedPatch.draft.title).toBe(updatedTitle);
    expect(patchKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
  });

  test("deletes an owner recipe through confirm dialog with stable retry key and safe error copy", async ({
    page,
  }) => {
    const recipe = cloneRecipeDetail();
    let deleted = false;
    let deleteCalls = 0;
    const deleteKeys: string[] = [];
    const deleteGateControl: { release: null | (() => void) } = { release: null };
    const deleteGate = new Promise<void>((resolve) => {
      deleteGateControl.release = () => resolve();
    });

    await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalls += 1;
        deleteKeys.push(route.request().headers()["idempotency-key"] ?? "");

        if (deleteCalls === 1) {
          await deleteGate;
          await route.fulfill({
            status: 500,
            json: {
              success: false,
              data: null,
              error: {
                code: "INTERNAL_ERROR",
                message: "민감한 내부 실패 원문",
                fields: [],
              },
            },
          });
          return;
        }

        deleted = true;
        await route.fulfill({
          json: {
            success: true,
            data: { id: RECIPE_ID, deleted_at: "2026-08-21T10:00:00.000+09:00" },
            error: null,
          },
        });
        return;
      }

      if (deleted) {
        await route.fulfill({
          status: 404,
          json: {
            success: false,
            data: null,
            error: {
              code: "RESOURCE_NOT_FOUND",
              message: "레시피를 찾을 수 없어요.",
              fields: [],
            },
          },
        });
        return;
      }

      await route.fulfill({
        json: {
          success: true,
          data: recipe,
          error: null,
        },
      });
    });

    await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);

    const deleteInvoker = page.getByRole("button", { name: "삭제", exact: true }).first();
    await deleteInvoker.click();

    const deleteDialog = page.getByRole("dialog", { name: "정말 레시피를 삭제할까요?" });
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog.getByRole("button", { name: "닫기" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(deleteDialog.getByRole("button", { name: "삭제" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(deleteDialog.getByRole("button", { name: "닫기" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(deleteDialog).toHaveCount(0);
    await expect(deleteInvoker).toBeFocused();

    await deleteInvoker.click();
    await page.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByRole("button", { name: "삭제 중" })).toBeDisabled();
    expect(deleteCalls).toBe(1);

    if (!deleteGateControl.release) {
      throw new Error("delete release handler should be captured before submitting");
    }
    deleteGateControl.release();

    const dialogAfterError = page.getByRole("dialog", { name: "정말 레시피를 삭제할까요?" });
    await expect(dialogAfterError.getByRole("alert")).toContainText(
      "레시피를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
    await expect(dialogAfterError.getByText("민감한 내부 실패 원문")).toHaveCount(0);
    await dialogAfterError.getByRole("button", { name: "삭제" }).click();

    await expect(dialogAfterError).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "이 레시피를 찾을 수 없어요" }),
    ).toBeVisible();
    await expect(
      page.getByText("삭제되었거나 공개되지 않은 레시피예요. 검색에서 다른 레시피를 찾아보세요."),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH.replaceAll("/", "\\/")}\\?qaFutureImpact=1$`));

    expect(deleteCalls).toBe(2);
    expect(deleteKeys[0]).toBe(deleteKeys[1]);
    expect(deleteKeys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
  });

  test("hides a soft-deleted recipe from new detail access while pinned readers stay readable", async ({
    page,
  }) => {
    await installPinnedHistoryRoutes(page);
    await page.route("**/api/v1/recipes/recipe-deleted", async (route) => {
      await route.fulfill({
        status: 404,
        json: {
          success: false,
          data: null,
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "레시피를 찾을 수 없어요.",
            fields: [],
          },
        },
      });
    });

    await page.goto("/recipe/recipe-deleted");
    await expect(
      page.getByRole("heading", { name: "이 레시피를 찾을 수 없어요" }),
    ).toBeVisible();
    await expect(
      page.getByText("삭제되었거나 공개되지 않은 레시피예요. 검색에서 다른 레시피를 찾아보세요."),
    ).toBeVisible();

    await page.goto("/planner");
    await expect(
      page.getByText(PINNED_TITLE, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();

    await page.goto("/cooking/sessions/session-pinned/cook-mode");
    await expect(page.getByTestId("cook-mode-title")).toContainText(PINNED_TITLE);

    await page.goto("/leftovers");
    await expect(
      page.getByTestId("leftover-card").filter({ hasText: PINNED_TITLE }),
    ).toBeVisible();
  });

  test("keeps capability-off detail write controls absent while snapshot-v2 read drain stays available", async ({
    page,
  }) => {
    await installRecipeDetailRoutes(page);
    await installSnapshotReadDrainRoute(page);

    await page.goto(RECIPE_PATH);
    await expect(
      page.getByRole("button", { name: "내 레시피로 수정" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "편집", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "삭제", exact: true }),
    ).toHaveCount(0);

    await page.goto("/cooking/session-attempts/snapshot-read-drain/cook-mode");
    await expect(page.getByTestId("snapshot-v2-cook-mode")).toBeVisible();
    await expect(page.getByText("고정된 김치찌개")).toBeVisible();
    await expect(page.getByRole("button", { name: "요리 완료" })).toHaveCount(0);
  });
});
