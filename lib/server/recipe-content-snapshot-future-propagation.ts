import { fail } from "@/lib/api/response";
import { calculateRecipeNutrition } from
  "@/lib/nutrition/recipe-nutrition-calculator";

import type {
  AccountGenerationBootstrapSessionAuthority,
} from "@/lib/server/account-generation/session-authority";
import {
  buildRecipeNutritionInputGuard,
  hydrateRecipeNutritionIngredients,
  loadRecipeNutritionPredecessors,
} from "@/scripts/lib/recipe-nutrition-predecessor.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

const PUBLIC_RPC_ERRORS = {
  ACCOUNT_CUTOVER_QUARANTINED: {
    message: "계정 복구가 필요해요.",
    status: 409,
  },
  ACCOUNT_DELETING: {
    message: "계정 삭제가 진행 중이에요.",
    status: 409,
  },
  ACCOUNT_GENERATION_STALE: {
    message: "계정 상태를 다시 확인해 주세요.",
    status: 409,
  },
  ACCOUNT_LIFECYCLE_MAINTENANCE: {
    message: "계정 정비 작업 중이에요. 잠시 후 다시 시도해 주세요.",
    status: 503,
  },
  ACCOUNT_SESSION_STALE: {
    message: "세션을 다시 확인해 주세요.",
    status: 409,
  },
  FORBIDDEN: {
    message: "이 작업을 수행할 권한이 없어요.",
    status: 403,
  },
  IDEMPOTENCY_KEY_REUSED: {
    message: "이미 다른 요청에 사용된 요청 키예요.",
    status: 409,
  },
  MEAL_COOKING_ALREADY_STARTED: {
    message: "이미 요리를 시작한 계획이 있어 전체 반영할 수 없어요.",
    status: 409,
  },
  RECIPE_IMPACT_STALE: {
    message: "레시피 변경 영향을 다시 확인해 주세요.",
    status: 409,
  },
  RECIPE_REVISION_CONFLICT: {
    message: "레시피가 변경됐어요. 최신 내용을 다시 확인해 주세요.",
    status: 409,
  },
  RESOURCE_NOT_FOUND: {
    message: "요청한 항목을 찾을 수 없어요.",
    status: 404,
  },
  SNAPSHOT_V2_CREATION_DISABLED: {
    message: "새 요리 세션을 지금 시작할 수 없어요.",
    status: 409,
  },
  VALIDATION_ERROR: {
    message: "요청 값을 확인해 주세요.",
    status: 422,
  },
} as const;

type PublicRpcErrorCode = keyof typeof PUBLIC_RPC_ERRORS;

export interface FuturePropagationRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export interface RecipeDraftNutritionClient {
  from(table: string): unknown;
}

export class RecipeDraftNutritionValidationError extends Error {
  constructor() {
    super("INVALID_RECIPE_NUTRITION_INPUT");
    this.name = "RecipeDraftNutritionValidationError";
  }
}

export class RecipeDraftNutritionInfrastructureError extends Error {
  constructor() {
    super("RECIPE_NUTRITION_PREDECESSOR_READ_FAILED");
    this.name = "RecipeDraftNutritionInfrastructureError";
  }
}

export interface RecipeDraft {
  title: string;
  description?: string | null;
  base_servings: number;
  ingredients: unknown[];
  steps: unknown[];
}

export interface RecipeFutureImpactRequest {
  baseRecipeRevision: number;
  draft: RecipeDraft;
}

export interface RecipeFuturePatchRequest extends RecipeFutureImpactRequest {
  futurePlanStrategy: "keep" | "replace_all";
  impactToken: string;
  imageObjectId: string | null;
}

export type SnapshotV2StartRequest =
  | {
      mode: "planner";
      mealIds: string[];
      expectedMealRevisions: Record<string, number>;
    }
  | {
      mode: "standalone";
      recipeId: string;
      expectedRecipeRevision: number;
      cookingServings: number;
    };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; fields: Array<{ field: string; reason: string }> };

interface RpcSuccess {
  ok: true;
  data: unknown;
}

interface RpcFailure {
  ok: false;
  response: Response;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function parseRecipeDraft(value: unknown): RecipeDraft | null {
  if (
    !isRecord(value)
    || !hasOnlyKeys(value, [
      "title",
      "description",
      "base_servings",
      "ingredients",
      "steps",
    ])
    || typeof value.title !== "string"
    || value.title.trim().length === 0
    || !isPositiveInteger(value.base_servings)
    || !Array.isArray(value.ingredients)
    || !Array.isArray(value.steps)
    || (
      value.description !== undefined
      && value.description !== null
      && typeof value.description !== "string"
    )
  ) {
    return null;
  }

  return value as unknown as RecipeDraft;
}

export function parseRecipeFutureImpactRequest(
  value: unknown,
): ValidationResult<RecipeFutureImpactRequest> {
  if (!isRecord(value)) {
    return { ok: false, fields: [{ field: "body", reason: "invalid_json" }] };
  }

  const fields: Array<{ field: string; reason: string }> = [];
  if (!hasOnlyKeys(value, ["base_recipe_revision", "draft"])) {
    fields.push({ field: "body", reason: "unknown_field" });
  }
  if (!isPositiveInteger(value.base_recipe_revision)) {
    fields.push({ field: "base_recipe_revision", reason: "invalid_integer" });
  }
  const draft = parseRecipeDraft(value.draft);
  if (!draft) {
    fields.push({ field: "draft", reason: "invalid_draft" });
  }

  return fields.length > 0 || !draft
    ? { ok: false, fields }
    : {
        ok: true,
        value: {
          baseRecipeRevision: Number(value.base_recipe_revision),
          draft,
        },
      };
}

export function parseRecipeFuturePatchRequest(
  value: unknown,
): ValidationResult<RecipeFuturePatchRequest> {
  if (!isRecord(value)) {
    return { ok: false, fields: [{ field: "body", reason: "invalid_json" }] };
  }

  const impact = parseRecipeFutureImpactRequest({
    base_recipe_revision: value.base_recipe_revision,
    draft: value.draft,
  });
  const fields = impact.ok ? [] : [...impact.fields];
  if (!hasOnlyKeys(value, [
    "base_recipe_revision",
    "draft",
    "future_plan_strategy",
    "impact_token",
    "image_object_id",
  ])) {
    fields.push({ field: "body", reason: "unknown_field" });
  }
  if (
    value.future_plan_strategy !== "keep"
    && value.future_plan_strategy !== "replace_all"
  ) {
    fields.push({ field: "future_plan_strategy", reason: "invalid_enum" });
  }
  if (
    typeof value.impact_token !== "string"
    || value.impact_token.trim().length === 0
  ) {
    fields.push({ field: "impact_token", reason: "required" });
  }
  if (
    value.image_object_id !== undefined
    && value.image_object_id !== null
    && !isUuid(value.image_object_id)
  ) {
    fields.push({ field: "image_object_id", reason: "invalid_uuid" });
  }

  if (fields.length > 0 || !impact.ok) {
    return { ok: false, fields };
  }

  return {
    ok: true,
    value: {
      ...impact.value,
      futurePlanStrategy: value.future_plan_strategy as "keep" | "replace_all",
      impactToken: String(value.impact_token),
      imageObjectId: typeof value.image_object_id === "string"
        ? value.image_object_id
        : null,
    },
  };
}

export function parseSnapshotV2StartRequest(
  value: unknown,
): ValidationResult<SnapshotV2StartRequest> {
  if (!isRecord(value)) {
    return { ok: false, fields: [{ field: "body", reason: "invalid_json" }] };
  }

  if (value.mode === "planner") {
    const fields: Array<{ field: string; reason: string }> = [];
    if (!hasOnlyKeys(value, ["mode", "meal_ids", "expected_meal_revisions"])) {
      fields.push({ field: "body", reason: "mixed_mode_fields" });
    }
    const mealIds = Array.isArray(value.meal_ids) ? value.meal_ids : [];
    if (
      mealIds.length === 0
      || mealIds.some((mealId) => !isUuid(mealId))
      || new Set(mealIds).size !== mealIds.length
    ) {
      fields.push({ field: "meal_ids", reason: "invalid_uuid_set" });
    }
    const revisions = value.expected_meal_revisions;
    if (
      !isRecord(revisions)
      || Object.keys(revisions).length !== mealIds.length
      || mealIds.some((mealId) => !isPositiveInteger(revisions[mealId]))
      || Object.keys(revisions ?? {}).some((mealId) => !mealIds.includes(mealId))
    ) {
      fields.push({
        field: "expected_meal_revisions",
        reason: "meal_revision_mismatch",
      });
    }

    if (fields.length > 0 || !isRecord(revisions)) {
      return { ok: false, fields };
    }

    return {
      ok: true,
      value: {
        mode: "planner",
        mealIds: mealIds as string[],
        expectedMealRevisions: revisions as Record<string, number>,
      },
    };
  }

  if (value.mode === "standalone") {
    const fields: Array<{ field: string; reason: string }> = [];
    if (!hasOnlyKeys(value, [
      "mode",
      "recipe_id",
      "expected_recipe_revision",
      "cooking_servings",
    ])) {
      fields.push({ field: "body", reason: "mixed_mode_fields" });
    }
    if (!isUuid(value.recipe_id)) {
      fields.push({ field: "recipe_id", reason: "invalid_uuid" });
    }
    if (!isPositiveInteger(value.expected_recipe_revision)) {
      fields.push({ field: "expected_recipe_revision", reason: "invalid_integer" });
    }
    if (!isPositiveInteger(value.cooking_servings)) {
      fields.push({ field: "cooking_servings", reason: "invalid_integer" });
    }

    if (fields.length > 0) {
      return { ok: false, fields };
    }

    return {
      ok: true,
      value: {
        mode: "standalone",
        recipeId: String(value.recipe_id),
        expectedRecipeRevision: Number(value.expected_recipe_revision),
        cookingServings: Number(value.cooking_servings),
      },
    };
  }

  return {
    ok: false,
    fields: [{ field: "mode", reason: "invalid_enum" }],
  };
}

export function readRequiredIdempotencyKey(
  request: Request,
  headerName = "Idempotency-Key",
):
  | { ok: true; key: string }
  | { ok: false; response: Response } {
  const value = request.headers.get(headerName)?.trim() ?? "";
  if (!value) {
    return {
      ok: false,
      response: fail(
        "IDEMPOTENCY_KEY_REQUIRED",
        "요청 키가 필요해요.",
        428,
        [{ field: "Idempotency-Key", reason: "required" }],
      ),
    };
  }
  if (!isUuid(value)) {
    return {
      ok: false,
      response: fail(
        "INVALID_IDEMPOTENCY_KEY",
        "요청 키 형식을 확인해 주세요.",
        400,
        [{ field: "Idempotency-Key", reason: "invalid_uuid" }],
      ),
    };
  }

  return { ok: true, key: value };
}

export function buildSessionAuthorityRpcArgs(
  authority: AccountGenerationBootstrapSessionAuthority,
) {
  return {
    p_owner_uuid: authority.ownerUuid,
    p_auth_identity_created_at_snapshot: authority.authIdentityCreatedAt,
    p_session_key_hash: authority.sessionKeyHash,
    p_hmac_key_version: authority.hmacKeyVersion,
    p_session_issued_at: authority.sessionIssuedAt,
  };
}

function draftNutritionIngredient(
  value: unknown,
  sortOrder: number,
) {
  if (!isRecord(value) || !isUuid(value.ingredient_id)) {
    return null;
  }
  const ingredientType = value.ingredient_type ?? "QUANT";
  const amount = value.amount ?? null;
  const unit = value.unit ?? null;
  const scalable = value.scalable ?? ingredientType !== "TO_TASTE";
  if (
    (ingredientType !== "QUANT" && ingredientType !== "TO_TASTE")
    || (amount !== null && (typeof amount !== "number" || !Number.isFinite(amount)))
    || (unit !== null && typeof unit !== "string")
    || typeof scalable !== "boolean"
    || (
      value.food_product_id !== undefined
      && value.food_product_id !== null
      && !isUuid(value.food_product_id)
    )
    || (
      value.food_product_nutrition_version_id !== undefined
      && value.food_product_nutrition_version_id !== null
      && !isUuid(value.food_product_nutrition_version_id)
    )
  ) {
    return null;
  }

  return {
    id: value.ingredient_id,
    ingredient_id: value.ingredient_id,
    amount,
    unit,
    ingredient_type: ingredientType,
    scalable,
    sort_order: sortOrder,
    food_product_id: value.food_product_id ?? null,
    food_product_nutrition_version_id:
      value.food_product_nutrition_version_id ?? null,
  };
}

export async function calculateRecipeDraftNutrition(
  client: RecipeDraftNutritionClient,
  input: {
    recipeId: string;
    baseRecipeRevision: number;
    draft: RecipeDraft;
  },
) {
  const ingredients = input.draft.ingredients.map(draftNutritionIngredient);
  if (ingredients.some((ingredient) => ingredient === null)) {
    throw new RecipeDraftNutritionValidationError();
  }
  const validIngredients = ingredients.filter(
    (ingredient): ingredient is NonNullable<typeof ingredient> => ingredient !== null,
  );
  if (new Set(validIngredients.map((ingredient) => ingredient.ingredient_id)).size
    !== validIngredients.length) {
    throw new RecipeDraftNutritionValidationError();
  }

  let predecessors;
  let synchronousReadFailed = false;
  const failFastClient = {
    from(table: string) {
      if (synchronousReadFailed) {
        throw new RecipeDraftNutritionInfrastructureError();
      }
      try {
        return client.from(table);
      } catch (error) {
        synchronousReadFailed = true;
        throw error;
      }
    },
  };
  try {
    predecessors = await loadRecipeNutritionPredecessors(
      failFastClient,
      validIngredients.map((ingredient) => ingredient.ingredient_id),
    );
  } catch {
    throw new RecipeDraftNutritionInfrastructureError();
  }

  let calculation;
  try {
    calculation = calculateRecipeNutrition({
      recipe_id: input.recipeId,
      recipe_version: `revision:${input.baseRecipeRevision}`,
      base_servings: input.draft.base_servings,
      ingredients: hydrateRecipeNutritionIngredients(validIngredients, predecessors),
    });
  } catch {
    throw new RecipeDraftNutritionValidationError();
  }
  const currentGuard = buildRecipeNutritionInputGuard(
    validIngredients,
    predecessors,
  ) as {
    recipe_ingredients: Array<Record<string, unknown>>;
  };
  const guardByIngredientId = new Map(
    currentGuard.recipe_ingredients.map((ingredient) => [
      ingredient.ingredient_id,
      ingredient,
    ]),
  );
  const predecessorGuard = {
    recipe_ingredients: validIngredients.map((ingredient) => {
      const guard = guardByIngredientId.get(ingredient.ingredient_id);
      if (!guard) {
        throw new RecipeDraftNutritionValidationError();
      }
      return {
        ingredient_id: ingredient.ingredient_id,
        amount: ingredient.amount,
        unit: ingredient.unit,
        ingredient_type: ingredient.ingredient_type,
        scalable: ingredient.scalable,
        sort_order: ingredient.sort_order,
        food_product_id: ingredient.food_product_id,
        food_product_nutrition_version_id:
          ingredient.food_product_nutrition_version_id,
        nutrition_candidates: guard.nutrition_candidates,
        conversion_candidates: guard.conversion_candidates,
        selected_nutrition_link_id: guard.selected_nutrition_link_id,
        selected_conversion_assignment_id:
          guard.selected_conversion_assignment_id,
      };
    }),
  };

  return {
    nutritionSnapshot: {
      calculation_version: calculation.calculation_version,
      scalable_values: calculation.scalable_values,
      fixed_values: calculation.fixed_values,
      nutrient_status: calculation.values,
      calculation_status: calculation.calculation_status,
      calculation_quality: calculation.calculation_quality,
      reflected_ingredient_count: calculation.reflected_ingredient_count,
      target_ingredient_count: calculation.target_ingredient_count,
      missing_reasons: calculation.missing_reasons,
      warnings: calculation.warnings,
      sources: calculation.sources,
    },
    predecessorGuard,
  };
}

function readErrorText(error: unknown) {
  if (!isRecord(error)) {
    return typeof error === "string" ? error : "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function findPublicErrorCode(error: unknown): PublicRpcErrorCode | null {
  const text = readErrorText(error);
  return (Object.keys(PUBLIC_RPC_ERRORS) as PublicRpcErrorCode[])
    .find((code) => text.includes(code)) ?? null;
}

function createPublicRpcError(error: unknown) {
  const code = findPublicErrorCode(error);
  if (!code) {
    return fail("INTERNAL_ERROR", "요청을 처리하지 못했어요.", 500);
  }

  const contract = PUBLIC_RPC_ERRORS[code];
  return fail(code, contract.message, contract.status);
}

export async function callFuturePropagationRpc(
  client: FuturePropagationRpcClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<RpcSuccess | RpcFailure> {
  try {
    const result = await client.rpc(functionName, args);
    if (result.error) {
      return { ok: false, response: createPublicRpcError(result.error) };
    }

    if (isRecord(result.data) && typeof result.data.success === "boolean") {
      if (!result.data.success) {
        return {
          ok: false,
          response: createPublicRpcError(result.data.error),
        };
      }
      return { ok: true, data: result.data.data };
    }

    return { ok: true, data: result.data };
  } catch {
    return {
      ok: false,
      response: fail("INTERNAL_ERROR", "요청을 처리하지 못했어요.", 500),
    };
  }
}

export function parseJsonBody(value: unknown) {
  return isRecord(value) ? value : null;
}

export function projectRecipeFutureImpactData(value: unknown) {
  if (!isRecord(value) || !isRecord(value.date_range)) {
    return null;
  }
  const dateFrom = value.date_range.from;
  const dateTo = value.date_range.to;
  if (
    typeof value.impact_token !== "string"
    || value.impact_token.length === 0
    || typeof value.expires_at !== "string"
    || !Number.isFinite(Date.parse(value.expires_at))
    || typeof value.proposed_content_hash !== "string"
    || !SHA256_PATTERN.test(value.proposed_content_hash)
    || !isNonNegativeInteger(value.future_meal_count)
    || (dateFrom !== null && typeof dateFrom !== "string")
    || (dateTo !== null && typeof dateTo !== "string")
    || !isNonNegativeInteger(value.incomplete_shopping_list_count)
    || !isNonNegativeInteger(value.completed_shopping_list_count)
    || !isNonNegativeInteger(value.active_cooking_claim_count)
    || typeof value.replace_all_allowed !== "boolean"
  ) {
    return null;
  }

  return {
    impact_token: value.impact_token,
    expires_at: value.expires_at,
    proposed_content_hash: value.proposed_content_hash,
    future_meal_count: value.future_meal_count,
    date_range: { from: dateFrom, to: dateTo },
    incomplete_shopping_list_count: value.incomplete_shopping_list_count,
    completed_shopping_list_count: value.completed_shopping_list_count,
    active_cooking_claim_count: value.active_cooking_claim_count,
    replace_all_allowed: value.replace_all_allowed,
  };
}

export function projectRecipePatchData(value: unknown) {
  if (
    !isRecord(value)
    || !isUuid(value.id)
    || !isPositiveInteger(value.revision)
  ) {
    return null;
  }
  return { id: value.id, revision: value.revision };
}

export function projectRecipeDeleteData(value: unknown) {
  if (
    !isRecord(value)
    || !isUuid(value.id)
    || !isPositiveInteger(value.revision)
    || typeof value.deleted_at !== "string"
    || !Number.isFinite(Date.parse(value.deleted_at))
  ) {
    return null;
  }
  return {
    id: value.id,
    revision: value.revision,
    deleted_at: value.deleted_at,
  };
}

function hasSnapshotV2Identity(value: Record<string, unknown>) {
  return isUuid(value.session_id)
    && value.contract_version === "snapshot_v2"
    && (value.mode === "planner" || value.mode === "standalone");
}

export function projectSnapshotV2StartData(value: unknown) {
  if (
    !isRecord(value)
    || !hasSnapshotV2Identity(value)
    || value.status !== "in_progress"
    || !isRecord(value.content_summary)
    || !isUuid(value.content_summary.recipe_id)
    || typeof value.content_summary.title !== "string"
    || !isPositiveInteger(value.content_summary.cooking_servings)
  ) {
    return null;
  }
  return {
    session_id: value.session_id as string,
    contract_version: "snapshot_v2" as const,
    mode: value.mode as "planner" | "standalone",
    status: "in_progress" as const,
    content_summary: {
      recipe_id: value.content_summary.recipe_id,
      title: value.content_summary.title,
      cooking_servings: value.content_summary.cooking_servings,
    },
  };
}

export function projectSnapshotV2CookModeData(value: unknown) {
  if (
    !isRecord(value)
    || !hasSnapshotV2Identity(value)
    || !["in_progress", "cancelled", "completed"].includes(String(value.status))
    || !isRecord(value.recipe)
    || !isUuid(value.recipe.id)
    || typeof value.recipe.title !== "string"
    || !isPositiveInteger(value.recipe.cooking_servings)
    || !Array.isArray(value.recipe.ingredients)
    || !Array.isArray(value.recipe.steps)
    || !Array.isArray(value.pantry_candidates)
  ) {
    return null;
  }

  const pantryCandidates = value.pantry_candidates.map((candidate) => {
    if (
      !isRecord(candidate)
      || !isUuid(candidate.pantry_item_id)
      || !isUuid(candidate.ingredient_id)
      || (candidate.item_type !== "ingredient" && candidate.item_type !== "food_product")
      || typeof candidate.standard_name !== "string"
      || (candidate.food_product_id !== null && !isUuid(candidate.food_product_id))
      || (
        candidate.food_product_nutrition_version_id !== null
        && !isUuid(candidate.food_product_nutrition_version_id)
      )
      || typeof candidate.name !== "string"
      || (candidate.brand !== null && typeof candidate.brand !== "string")
    ) {
      return null;
    }
    return {
      pantry_item_id: candidate.pantry_item_id,
      ingredient_id: candidate.ingredient_id,
      item_type: candidate.item_type,
      standard_name: candidate.standard_name,
      food_product_id: candidate.food_product_id,
      food_product_nutrition_version_id:
        candidate.food_product_nutrition_version_id,
      name: candidate.name,
      brand: candidate.brand,
    };
  });
  if (pantryCandidates.some((candidate) => candidate === null)) {
    return null;
  }

  return {
    session_id: value.session_id as string,
    contract_version: "snapshot_v2" as const,
    mode: value.mode as "planner" | "standalone",
    status: value.status as "in_progress" | "cancelled" | "completed",
    recipe: {
      id: value.recipe.id,
      title: value.recipe.title,
      cooking_servings: value.recipe.cooking_servings,
      ingredients: value.recipe.ingredients,
      steps: value.recipe.steps,
    },
    pantry_candidates: pantryCandidates,
  };
}

export function projectSnapshotV2CancelData(value: unknown) {
  if (
    !isRecord(value)
    || !hasSnapshotV2Identity(value)
    || value.status !== "cancelled"
  ) {
    return null;
  }
  return {
    session_id: value.session_id as string,
    contract_version: "snapshot_v2" as const,
    mode: value.mode as "planner" | "standalone",
    status: "cancelled" as const,
  };
}
