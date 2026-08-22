import { expect, test, type Page } from "@playwright/test";

import {
  RECIPE_ID,
  RECIPE_PATH,
  installAccountLibraryVisualRoutes,
  installRecipeDetailRoutes,
  setE2EAuthOverride,
} from "./helpers/mock-routes";
import { MOCK_RECIPE_DETAIL } from "../../lib/mock/recipes";
import type { CookedBatchProjection } from "../../types/cooking";
import type { RecipeDetail, RecipeEditDraft } from "../../types/recipe";

const PINNED_TITLE = "삭제 전 두부찌개";
const LEGACY_LEFTOVER_TITLE = "기존 남은 반찬";
const PENDING_ACTION_KEY = "homecook.pending-recipe-action";
const PINNED_MEAL_LOG_DATE = "2026-08-21";
const PINNED_SHOPPING_LIST_ID = "list-pinned";
const PINNED_SHOPPING_TITLE = `${PINNED_TITLE}~장보기`;
const PINNED_MEAL_LOG_ENTRY_ID = "10000000-0000-4000-8000-000000000001";
const PINNED_MEAL_LOG_COLUMN_ID = "20000000-0000-4000-8000-000000000001";
const PINNED_DELETED_RECIPE_ID = "30000000-0000-4000-8000-000000000001";
const PINNED_BATCH_ID = "40000000-0000-4000-8000-000000000001";
const PINNED_BATCH_FINISHED_WEIGHT_G = 720;
const PINNED_BATCH_REMAINING_WEIGHT_G = 380;

interface FutureImpactPreviewRequest {
  base_recipe_revision: number;
  draft: RecipeEditDraft;
}

interface FutureImpactPatchRequest extends FutureImpactPreviewRequest {
  future_plan_strategy: "keep" | "replace_all";
  impact_token: string;
  image_object_id: string | null;
}

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1024) < 1024;
}

function cloneRecipeDetail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return JSON.parse(JSON.stringify({
    ...MOCK_RECIPE_DETAIL,
    revision: 12,
    ...overrides,
  })) as RecipeDetail;
}

function cloneOwnerRecipeDetail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return cloneRecipeDetail({
    edit_context: {
      base_recipe_revision: 12,
      draft: {
        title: "내 김치찌개",
        description: null,
        base_servings: 2,
        ingredients: [],
        steps: [],
      },
      image_object_id: null,
    },
    ...overrides,
  });
}

async function installPinnedHistoryRoutes(page: Page) {
  await installAccountLibraryVisualRoutes(page);
  const pinnedCookedBatch: CookedBatchProjection = {
    id: PINNED_BATCH_ID,
    recipe_id: PINNED_DELETED_RECIPE_ID,
    recipe_title: PINNED_TITLE,
    recipe_thumbnail_url: null,
    status: "leftover",
    cooked_at: "2026-08-20T09:00:00.000Z",
    cooking_servings: 2,
    finished_weight_g: PINNED_BATCH_FINISHED_WEIGHT_G,
    remaining_weight_g: PINNED_BATCH_REMAINING_WEIGHT_G,
    weight_status: "known",
    batch_status: "available",
    depleted_reason: null,
    revision: 7,
    nutrition_calculation_status: "complete",
    current_unweighed_closure_event_id: null,
  };

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

  await page.route("**/api/v1/cooked-batches?*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [pinnedCookedBatch],
          next_cursor: null,
          has_next: false,
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
              recipe_id: "legacy-leftover",
              recipe_title: LEGACY_LEFTOVER_TITLE,
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

  await page.route("**/api/v1/shopping/preview", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          eligible_meals: [],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/shopping/lists**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/v1/shopping/lists/${PINNED_SHOPPING_LIST_ID}`) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            id: PINNED_SHOPPING_LIST_ID,
            title: PINNED_SHOPPING_TITLE,
            date_range_start: "2026-08-20",
            date_range_end: "2026-08-20",
            is_completed: true,
            completed_at: "2026-08-20T10:00:00.000Z",
            created_at: "2026-08-20T00:00:00.000Z",
            updated_at: "2026-08-20T10:00:00.000Z",
            recipes: [
              {
                recipe_id: "recipe-deleted",
                recipe_name: PINNED_TITLE,
                recipe_thumbnail: null,
                shopping_servings: 2,
                planned_servings_total: 2,
              },
            ],
            items: [
              {
                id: "item-pinned-1",
                ingredient_id: "ingredient-tofu",
                display_text: "두부 1모",
                amounts_json: [{ amount: 1, unit: "모" }],
                is_checked: true,
                is_pantry_excluded: false,
                added_to_pantry: true,
                sort_order: 0,
              },
            ],
          },
          error: null,
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              id: PINNED_SHOPPING_LIST_ID,
              title: PINNED_SHOPPING_TITLE,
              date_range_start: "2026-08-20",
              date_range_end: "2026-08-20",
              is_completed: true,
              completed_at: "2026-08-20T10:00:00.000Z",
              item_count: 1,
              created_at: "2026-08-20T00:00:00.000Z",
            },
          ],
          next_cursor: null,
          has_next: false,
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/meal-log?*", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("date") ?? PINNED_MEAL_LOG_DATE;
    const zero = {
      calculation_status: "complete",
      calories_kcal: 0,
      carbohydrate_g: 0,
      protein_g: 0,
      fat_g: 0,
      sodium_mg: 0,
    };
    const subtotal = {
      calculation_status: "complete",
      calories_kcal: 410,
      carbohydrate_g: 18,
      protein_g: 20,
      fat_g: 24,
      sodium_mg: 520,
    };

    await route.fulfill({
      json: {
        success: true,
        data: {
          date,
          active_columns: [{ id: PINNED_MEAL_LOG_COLUMN_ID, name: "아침", sort_order: 0 }],
          active_sections: [
            {
              meal_plan_column_id: PINNED_MEAL_LOG_COLUMN_ID,
              slot_name_snapshot: "아침",
              sort_order: 0,
              entries: [],
              subtotal: zero,
              incomplete_count: 0,
            },
          ],
          deleted_column_sections: [
            {
              slot_name_snapshot: "저녁",
              entries: [
                {
                  id: PINNED_MEAL_LOG_ENTRY_ID,
                  revision: 3,
                  consumed_at: null,
                  consumed_local_date: PINNED_MEAL_LOG_DATE,
                  timezone_name_snapshot: "Asia/Seoul",
                  meal_plan_column_id: null,
                  slot_name_snapshot: "저녁",
                  source: { type: "cooked_batch", id: PINNED_BATCH_ID },
                  quantity: { amount: 1, unit: "그릇" },
                  display_name: PINNED_TITLE,
                  display_brand: null,
                  nutrition: subtotal,
                  created_at: "2026-08-20T19:00:00.000Z",
                  updated_at: "2026-08-20T19:00:00.000Z",
                },
              ],
              subtotal,
              incomplete_count: 0,
            },
          ],
          entries: [
            {
              id: PINNED_MEAL_LOG_ENTRY_ID,
              revision: 3,
              consumed_at: null,
              consumed_local_date: PINNED_MEAL_LOG_DATE,
              timezone_name_snapshot: "Asia/Seoul",
              meal_plan_column_id: null,
              slot_name_snapshot: "저녁",
              source: { type: "cooked_batch", id: PINNED_BATCH_ID },
              quantity: { amount: 1, unit: "그릇" },
              display_name: PINNED_TITLE,
              display_brand: null,
              nutrition: subtotal,
              created_at: "2026-08-20T19:00:00.000Z",
              updated_at: "2026-08-20T19:00:00.000Z",
            },
          ],
          day_total: { ...subtotal, incomplete_count: 0 },
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
    const recipe = cloneOwnerRecipeDetail();
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

  test("creates a new private recipe from authenticated public fork and keeps the public source unchanged", async ({
    page,
  }) => {
    const sourceRecipe = cloneRecipeDetail({ edit_context: undefined, revision: 12 });
    const derivedRecipeId = "recipe-derived-fork";
    const createdKeys: string[] = [];
    const createBodies: unknown[] = [];

    await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: sourceRecipe,
          error: null,
        },
      });
    });

    await page.route("**/api/v1/recipes", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      createdKeys.push(route.request().headers()["idempotency-key"] ?? "");
      createBodies.push(await route.request().postDataJSON());
      await route.fulfill({
        json: {
          success: true,
          data: { id: derivedRecipeId, revision: 1 },
          error: null,
        },
      });
    });

    await page.route(`**/api/v1/recipes/${derivedRecipeId}`, async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: cloneOwnerRecipeDetail({
            id: derivedRecipeId,
            title: "공개 김치찌개에서 만든 내 레시피",
            revision: 1,
          }),
          error: null,
        },
      });
    });

    await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);
    await page.getByRole("button", { name: "내 레시피로 수정" }).click();
    const title = await page.getByRole("textbox", { name: "레시피 제목" });
    await title.fill("공개 김치찌개에서 만든 내 레시피");
    await page.getByRole("button", { name: "내 레시피로 저장" }).click();

    await expect(page).toHaveURL(new RegExp(`/recipe/${derivedRecipeId}$`));
    await expect(
      page.getByRole("heading", { name: "공개 김치찌개에서 만든 내 레시피" }),
    ).toBeVisible();

    expect(createdKeys).toHaveLength(1);
    expect(createdKeys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(Object.keys(createBodies[0] as Record<string, unknown>).sort()).toEqual([
      "base_recipe_revision",
      "draft",
      "image_object_id",
      "origin_recipe_id",
    ]);
    expect(createBodies).toEqual([
      {
        origin_recipe_id: RECIPE_ID,
        base_recipe_revision: 12,
        draft: {
          title: "공개 김치찌개에서 만든 내 레시피",
          description: sourceRecipe.description,
          base_servings: sourceRecipe.base_servings,
          ingredients: sourceRecipe.ingredients.map((ingredient) => ({
            ingredient_id: ingredient.ingredient_id,
            amount: ingredient.amount,
            unit: ingredient.unit,
            ingredient_type: ingredient.ingredient_type,
            display_text: ingredient.display_text,
            component_label: ingredient.component_label ?? null,
            scalable: ingredient.scalable,
            food_product_id: null,
            food_product_nutrition_version_id: null,
          })),
          steps: sourceRecipe.steps.map((step) => ({
            step_number: step.step_number,
            instruction: step.instruction,
            cooking_method_id: step.cooking_method?.id ?? "00000000-0000-4000-8000-000000000000",
            cooking_method_ids: step.cooking_methods?.map((method) => method.id)
              ?? (step.cooking_method ? [step.cooking_method.id] : []),
            ingredients_used: step.ingredients_used.map((ingredient) => ({
              ingredient_id: ingredient.ingredient_id,
              amount: ingredient.amount,
              unit: ingredient.unit,
              cut_size: ingredient.cut_size ?? null,
            })),
            component_label: step.component_label ?? null,
            heat_level: step.heat_level,
            duration_seconds: step.duration_seconds,
            duration_text: step.duration_text,
          })),
        },
        image_object_id: null,
      },
    ]);
    expect((createBodies[0] as Record<string, unknown>).operation).toBeUndefined();
    expect((createBodies[0] as Record<string, unknown>).owner).toBeUndefined();
    expect((createBodies[0] as Record<string, unknown>).tags).toBeUndefined();
  });

  test("keeps same-id owner save and explicit save-as-new as separate destinations", async ({
    page,
  }) => {
    const ownerRecipe = cloneOwnerRecipeDetail();
    const derivedRecipeId = "recipe-owner-copy";
    let ownerDetailReads = 0;
    const patchBodies: unknown[] = [];
    const patchKeys: string[] = [];
    const createBodies: unknown[] = [];
    const createKeys: string[] = [];

    await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
      if (route.request().method() === "PATCH") {
        patchKeys.push(route.request().headers()["idempotency-key"] ?? "");
        patchBodies.push(await route.request().postDataJSON());
        ownerRecipe.title = "같은 ID 저장 완료";
        ownerRecipe.revision = 13;
        ownerRecipe.edit_context = {
          ...(ownerRecipe.edit_context ?? {
            base_recipe_revision: 12,
            draft: {
              title: "내 김치찌개",
              description: null,
              base_servings: 2,
              ingredients: [],
              steps: [],
            },
            image_object_id: null,
          }),
          base_recipe_revision: 13,
          draft: {
            ...(ownerRecipe.edit_context?.draft ?? {
              title: "같은 ID 저장 완료",
              description: null,
              base_servings: 2,
              ingredients: [],
              steps: [],
            }),
            title: "같은 ID 저장 완료",
          },
        };
        await route.fulfill({
          json: {
            success: true,
            data: { id: RECIPE_ID, revision: 13 },
            error: null,
          },
        });
        return;
      }

      ownerDetailReads += 1;

      await route.fulfill({
        json: {
          success: true,
          data: ownerRecipe,
          error: null,
        },
      });
    });

    await page.route(`**/api/v1/recipes/${RECIPE_ID}/future-plan-impact`, async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            impact_token: "impact-owner",
            expires_at: "2026-08-21T16:00:00.000+09:00",
            proposed_content_hash: "b".repeat(64),
            future_meal_count: 0,
            date_range: { from: "2026-08-21", to: "2026-08-21" },
            incomplete_shopping_list_count: 0,
            completed_shopping_list_count: 0,
            active_cooking_claim_count: 0,
            replace_all_allowed: true,
          },
          error: null,
        },
      });
    });

    await page.route("**/api/v1/recipes", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      createKeys.push(route.request().headers()["idempotency-key"] ?? "");
      createBodies.push(await route.request().postDataJSON());
      await route.fulfill({
        json: {
          success: true,
          data: { id: derivedRecipeId, revision: 1 },
          error: null,
        },
      });
    });

    await page.route(`**/api/v1/recipes/${derivedRecipeId}`, async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: cloneOwnerRecipeDetail({
            id: derivedRecipeId,
            title: "내 김치찌개 사본",
            revision: 1,
          }),
          error: null,
        },
      });
    });

    await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);
    await page.getByRole("button", { name: "편집", exact: true }).click();
    await page.getByRole("textbox", { name: "레시피 제목" }).fill("같은 ID 저장 완료");
    await page.getByRole("button", { name: "변경사항 저장" }).click();
    await page.getByRole("radio", { name: /기존 계획 유지/ }).click();
    await page.getByRole("button", { name: "저장" }).click();
    await expect.poll(() => ownerDetailReads).toBeGreaterThan(1);
    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH.replaceAll("/", "\\/")}\\?qaFutureImpact=1$`));
    await expect(page.getByRole("heading", { name: "같은 ID 저장 완료" })).toBeVisible();

    await page.getByRole("button", { name: "편집", exact: true }).click();
    await page.getByRole("textbox", { name: "레시피 제목" }).fill("내 김치찌개 사본");
    await page.getByRole("button", { name: "새 레시피로 저장" }).click();
    await expect(page).toHaveURL(new RegExp(`/recipe/${derivedRecipeId}$`));
    await expect(page.getByRole("heading", { name: "내 김치찌개 사본" })).toBeVisible();

    expect(patchBodies).toHaveLength(1);
    expect(createBodies).toHaveLength(1);
    expect(patchKeys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(createKeys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(Object.keys(createBodies[0] as Record<string, unknown>).sort()).toEqual([
      "base_recipe_revision",
      "draft",
      "image_object_id",
      "origin_recipe_id",
    ]);
    expect(createBodies[0]).toMatchObject({
      origin_recipe_id: RECIPE_ID,
      base_recipe_revision: 13,
      image_object_id: null,
    });
    expect((createBodies[0] as Record<string, unknown>).operation).toBeUndefined();
    expect((createBodies[0] as Record<string, unknown>).visibility).toBeUndefined();
  });

  test("deletes an owner recipe through confirm dialog with stable retry key and safe error copy", async ({
    page,
  }) => {
    const recipe = cloneOwnerRecipeDetail();
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

  for (const scenario of [
    { code: "UNAUTHORIZED", label: "401 unauthorized", status: 401 },
    { code: "ACCOUNT_SESSION_STALE", label: "409 stale session", status: 409 },
  ] as const) {
    test(`reopens delete confirmation after simulated login return for ${scenario.label} without duplicate deletion`, async ({
      page,
    }) => {
      const recipe = cloneRecipeDetail();
      let deleteCalls = 0;

      await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
        if (route.request().method() === "DELETE") {
          deleteCalls += 1;
          await route.fulfill({
            status: scenario.status,
            json: {
              success: false,
              data: null,
              error: {
                code: scenario.code,
                message: scenario.code === "UNAUTHORIZED"
                  ? "로그인이 필요해요."
                  : "세션을 다시 확인해 주세요.",
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

      await page.addInitScript(
        ({ action, key }) => {
          window.localStorage.setItem(key, JSON.stringify(action));
        },
        {
          action: {
            type: "recipe-delete",
            recipeId: RECIPE_ID,
            redirectTo: RECIPE_PATH,
            createdAt: 1,
          },
          key: PENDING_ACTION_KEY,
        },
      );

      await page.goto(RECIPE_PATH);

      const deleteDialog = page.getByRole("dialog", { name: "정말 레시피를 삭제할까요?" });
      await expect(deleteDialog).toBeVisible();
      await expect(deleteDialog.getByRole("button", { name: "삭제" })).toBeEnabled();
      await expect.poll(() => deleteCalls).toBe(0);
      await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), PENDING_ACTION_KEY)).toBeNull();

      await deleteDialog.getByRole("button", { name: "닫기" }).click();
      await expect(deleteDialog).toHaveCount(0);
      expect(deleteCalls).toBe(0);
    });
  }

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
    const cookedBatchCard = page.locator(
      `[data-testid="cooked-batch-card"][aria-label="중량·잔량 기록 ${PINNED_TITLE}"]`,
    );
    await expect(cookedBatchCard).toBeVisible();
    await expect(cookedBatchCard.getByRole("heading", { name: PINNED_TITLE })).toBeVisible();
    await expect(cookedBatchCard.getByText("완성 중량")).toBeVisible();
    await expect(cookedBatchCard.getByText(`${PINNED_BATCH_FINISHED_WEIGHT_G}g`)).toBeVisible();
    await expect(cookedBatchCard.getByText("남은 양")).toBeVisible();
    await expect(cookedBatchCard.getByText(`${PINNED_BATCH_REMAINING_WEIGHT_G}g`)).toBeVisible();
    await expect(
      page.getByTestId("leftover-card").filter({ hasText: LEGACY_LEFTOVER_TITLE }),
    ).toBeVisible();
    await expect(
      page.getByTestId("leftover-card").filter({ hasText: PINNED_TITLE }),
    ).toHaveCount(0);
  });

  test("keeps shopping and meal-log readers readable while new shopping preview omits the deleted recipe", async ({
    page,
  }) => {
    await installPinnedHistoryRoutes(page);

    await page.goto("/shopping/flow");
    await expect(page.getByText("장보기 대상이 없어요")).toBeVisible();
    await expect(page.getByText(PINNED_TITLE)).toHaveCount(0);

    await page.goto("/mypage");
    await expect(page.locator("main").getByText("집밥러").first()).toBeVisible();
    if (isMobileViewport(page)) {
      await page.getByRole("button", { name: /장보기 기록/ }).click();
    } else {
      await page.getByRole("tab", { name: "장보기 기록" }).click();
    }
    await expect(page.getByRole("heading", { name: "장보기 기록" })).toBeVisible();
    await expect(page.getByTestId("shopping-card-list-pinned")).toBeVisible();

    await page.getByTestId("shopping-card-list-pinned").click();
    if (isMobileViewport(page)) {
      await page.waitForURL(/\/shopping\/lists\/list-pinned/);
      await expect(page.getByTestId("shopping-detail-mobile")).toBeVisible();
    } else {
      await expect(page.getByTestId("shopping-detail-embedded")).toBeVisible();
    }
    await expect(page.getByText("완료된 장보기 기록은 수정할 수 없어요")).toBeVisible();

    await page.goto(`/planner?segment=log&date=${PINNED_MEAL_LOG_DATE}`);
    await expect(
      page.getByRole("heading", { name: "8월 21일 금요일 식사 기록" }),
    ).toBeVisible();
    await expect(page.getByText("삭제된 끼니의 기록 · 저녁")).toBeVisible();
    await expect(page.getByText(PINNED_TITLE, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("1그릇 · 요리한 음식")).toBeVisible();
    await expect(
      page.getByRole("button", { name: `저녁의 ${PINNED_TITLE} 식사 기록 수정` }),
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
