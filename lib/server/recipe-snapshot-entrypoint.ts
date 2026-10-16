import { isRecipeQuantityInputDraft } from "@/lib/server/recipe-quantity-input";
import { buildSessionAuthorityRpcArgs } from
  "@/lib/server/recipe-content-snapshot-future-propagation";
import type { AccountGenerationBootstrapSessionAuthority } from
  "@/lib/server/account-generation/session-authority";
import { createRecipeFuturePropagationInternalClient } from
  "@/lib/supabase/server";
import type {
  RecipeEditContext,
  RecipeEditDraft,
  RecipeEditIngredientDraft,
  RecipeEditStepDraft,
  RecipeForkContext,
  RecipeSnapshotUiMode,
} from "@/types/recipe";

export interface RecipeSnapshotEntrypointContext {
  revision: number;
  quantity_policy_version?: "quantity-v4";
  edit_context: RecipeEditContext;
}

export interface RecipeSnapshotForkEntrypointContext {
  revision: number;
  quantity_policy_version?: "quantity-v4";
  fork_context: RecipeForkContext;
}

interface RpcClient {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isIngredientUsed(value: unknown) {
  return isRecord(value)
    && (hasExactKeys(value, ["ingredient_id", "amount", "unit", "cut_size"])
      || hasExactKeys(value, ["ingredient_id", "row_key", "amount", "unit", "cut_size"]))
    && isNullableUuid(value.ingredient_id)
    && (value.row_key !== undefined ? isUuid(value.row_key) : isUuid(value.ingredient_id))
    && isNullableNumber(value.amount) && isNullableString(value.unit) && isNullableString(value.cut_size);
}

function isIngredient(value: unknown): value is RecipeEditIngredientDraft {
  if (!isRecord(value)) return false;
  const keys = ["ingredient_id", "amount", "unit", "ingredient_type", "display_text", "component_label", "scalable", "food_product_id", "food_product_nutrition_version_id"];
  if (value.quantity_input !== undefined) keys.push("quantity_input");
  if (value.source_kind !== undefined) keys.push("source_kind");
  if (value.row_key !== undefined) keys.push("row_key");
  return hasExactKeys(value, keys)
    && isNullableUuid(value.ingredient_id)
    && isNullableNumber(value.amount) && isNullableString(value.unit)
    && (value.ingredient_type === "QUANT" || value.ingredient_type === "TO_TASTE")
    && isNullableString(value.display_text) && isNullableString(value.component_label)
    && typeof value.scalable === "boolean"
    && isNullableUuid(value.food_product_id) && isNullableUuid(value.food_product_nutrition_version_id)
    && ((value.food_product_id === null) === (value.food_product_nutrition_version_id === null))
    && (value.food_product_id !== null || value.ingredient_id !== null)
    && (value.row_key === undefined || isUuid(value.row_key))
    && (value.source_kind === undefined || value.source_kind === (value.food_product_id ? "food_product" : "ingredient"))
    && (value.quantity_input === undefined || isRecipeQuantityInputDraft(value.quantity_input, {
      amount: value.amount, unit: value.unit, ingredient_type: value.ingredient_type,
      food_product_nutrition_version_id: value.food_product_nutrition_version_id,
    }));
}

function isStep(value: unknown): value is RecipeEditStepDraft {
  return isRecord(value)
    && hasExactKeys(value, [
      "step_number",
      "instruction",
      "cooking_method_id",
      "cooking_method_ids",
      "ingredients_used",
      "component_label",
      "heat_level",
      "duration_seconds",
      "duration_text",
    ])
    && isPositiveInteger(value.step_number)
    && typeof value.instruction === "string"
    && isUuid(value.cooking_method_id)
    && Array.isArray(value.cooking_method_ids)
    && value.cooking_method_ids.length > 0
    && value.cooking_method_ids.every(isUuid)
    && Array.isArray(value.ingredients_used)
    && value.ingredients_used.every(isIngredientUsed)
    && isNullableString(value.component_label)
    && isNullableString(value.heat_level)
    && isNullableNumber(value.duration_seconds)
    && isNullableString(value.duration_text);
}

function isDraft(value: unknown): value is RecipeEditDraft {
  return isRecord(value)
    && hasExactKeys(value, [
      "title",
      "description",
      "base_servings",
      "ingredients",
      "steps",
    ])
    && typeof value.title === "string"
    && isNullableString(value.description)
    && isPositiveInteger(value.base_servings)
    && Array.isArray(value.ingredients)
    && value.ingredients.every(isIngredient)
    && Array.isArray(value.steps)
    && value.steps.every(isStep);
}

function parseEntrypointContext(value: unknown): RecipeSnapshotEntrypointContext | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ["revision", "edit_context", ...(value.quantity_policy_version !== undefined ? ["quantity_policy_version"] : [])])
    || (value.quantity_policy_version !== undefined && value.quantity_policy_version !== "quantity-v4")
    || !isPositiveInteger(value.revision)
    || !isRecord(value.edit_context)
    || !hasExactKeys(value.edit_context, [
      "base_recipe_revision",
      "draft",
      "image_object_id",
    ])
    || value.edit_context.base_recipe_revision !== value.revision
    || !isDraft(value.edit_context.draft)
    || !isNullableUuid(value.edit_context.image_object_id)
  ) {
    return null;
  }

  return {
    revision: value.revision,
    edit_context: {
      base_recipe_revision: value.edit_context.base_recipe_revision,
      draft: value.edit_context.draft,
      image_object_id: value.edit_context.image_object_id,
    },
  };
}

function parseForkEntrypointContext(
  value: unknown,
): RecipeSnapshotForkEntrypointContext | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ["revision", "fork_context", ...(value.quantity_policy_version !== undefined ? ["quantity_policy_version"] : [])])
    || (value.quantity_policy_version !== undefined && value.quantity_policy_version !== "quantity-v4")
    || !isPositiveInteger(value.revision)
    || !isRecord(value.fork_context)
    || !hasExactKeys(value.fork_context, [
      "base_recipe_revision",
      "draft",
      "image_object_id",
    ])
    || value.fork_context.base_recipe_revision !== value.revision
    || !isDraft(value.fork_context.draft)
    || value.fork_context.image_object_id !== null
  ) {
    return null;
  }

  return {
    revision: value.revision,
    fork_context: {
      base_recipe_revision: value.fork_context.base_recipe_revision,
      draft: value.fork_context.draft,
      image_object_id: null,
    },
  };
}

export async function readRecipeSnapshotUiMode(
  client?: RpcClient | null,
): Promise<RecipeSnapshotUiMode> {
  try {
    const resolvedClient = client === undefined
      ? createRecipeFuturePropagationInternalClient()
      : client;
    if (!resolvedClient) return "legacy_v1";
    const result = await resolvedClient.rpc("read_recipe_snapshot_ui_mode");
    return !result.error && result.data === "snapshot_v2"
      ? "snapshot_v2"
      : "legacy_v1";
  } catch {
    return "legacy_v1";
  }
}

export async function readRecipeSnapshotEntrypointContext({
  recipeId,
  sessionAuthority,
  client,
}: {
  recipeId: string;
  sessionAuthority: AccountGenerationBootstrapSessionAuthority;
  client?: RpcClient | null;
}): Promise<RecipeSnapshotEntrypointContext> {
  let resolvedClient: RpcClient | null;
  try {
    resolvedClient = client === undefined
      ? createRecipeFuturePropagationInternalClient()
      : client;
  } catch {
    throw new Error("recipe snapshot entrypoint context is unavailable");
  }
  if (!resolvedClient) {
    throw new Error("recipe snapshot entrypoint context is unavailable");
  }

  const result = await resolvedClient.rpc(
    "read_recipe_snapshot_entrypoint_context",
    {
      ...buildSessionAuthorityRpcArgs(sessionAuthority),
      p_recipe_id: recipeId,
    },
  );
  if (result.error) {
    throw new Error("recipe snapshot entrypoint context is unavailable");
  }
  const parsed = parseEntrypointContext(result.data);
  if (!parsed) {
    throw new Error("recipe snapshot entrypoint context is invalid");
  }
  return parsed;
}

export async function readRecipeSnapshotForkContext({
  recipeId,
  sessionAuthority,
  client,
}: {
  recipeId: string;
  sessionAuthority: AccountGenerationBootstrapSessionAuthority;
  client?: RpcClient | null;
}): Promise<RecipeForkContext> {
  let resolvedClient: RpcClient | null;
  try {
    resolvedClient = client === undefined
      ? createRecipeFuturePropagationInternalClient()
      : client;
  } catch {
    throw new Error("recipe snapshot fork context is unavailable");
  }
  if (!resolvedClient) {
    throw new Error("recipe snapshot fork context is unavailable");
  }

  const result = await resolvedClient.rpc(
    "read_recipe_snapshot_entrypoint_context",
    {
      ...buildSessionAuthorityRpcArgs(sessionAuthority),
      p_recipe_id: recipeId,
    },
  );
  if (result.error) {
    throw new Error("recipe snapshot fork context is unavailable");
  }
  const parsed = parseForkEntrypointContext(result.data);
  if (!parsed) {
    throw new Error("recipe snapshot fork context is invalid");
  }
  return parsed.fork_context;
}

export class RecipeQuantityModeError extends Error {
  constructor(readonly code: "UNIT_CONTEXT_STALE" | "RESOURCE_NOT_FOUND" | "ACCOUNT_SESSION_STALE" | "RECIPE_REVISION_CONFLICT" = "UNIT_CONTEXT_STALE") {
    super(code === "RESOURCE_NOT_FOUND" ? "레시피를 찾을 수 없어요." : "현재 레시피의 수량 계산 근거를 확인하지 못했어요. 원입력을 유지한 채 다시 확인해 주세요.");
  }
  get status() { return this.code === "RESOURCE_NOT_FOUND" ? 404 : 409; }
}

/** Existing signed owner/gen/session recipe reader. No new request fields. */
export async function readRecipeQuantityMode({ client, sessionAuthority, recipeId, expectedRevision }: {
  client: RpcClient; sessionAuthority: AccountGenerationBootstrapSessionAuthority; recipeId: string; expectedRevision: number;
}) {
  const result = await client.rpc("read_recipe_snapshot_entrypoint_context", {
    ...buildSessionAuthorityRpcArgs(sessionAuthority), p_recipe_id: recipeId,
  });
  if (result.error) {
    const message = isRecord(result.error) && typeof result.error.message === "string" ? result.error.message : "";
    for (const code of ["RESOURCE_NOT_FOUND", "ACCOUNT_SESSION_STALE", "RECIPE_REVISION_CONFLICT"] as const) {
      if (message.includes(code)) throw new RecipeQuantityModeError(code);
    }
    throw new RecipeQuantityModeError();
  }
  if (!isRecord(result.data) || (!parseEntrypointContext(result.data) && !parseForkEntrypointContext(result.data))) throw new RecipeQuantityModeError();
  if (result.data.revision !== expectedRevision) throw new RecipeQuantityModeError("RECIPE_REVISION_CONFLICT");
  return result.data.quantity_policy_version === "quantity-v4";
}
