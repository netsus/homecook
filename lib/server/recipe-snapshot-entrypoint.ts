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
  edit_context: RecipeEditContext;
}

export interface RecipeSnapshotForkEntrypointContext {
  revision: number;
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
    && hasExactKeys(value, ["ingredient_id", "amount", "unit", "cut_size"])
    && isUuid(value.ingredient_id)
    && isNullableNumber(value.amount)
    && isNullableString(value.unit)
    && isNullableString(value.cut_size);
}

function isIngredient(value: unknown): value is RecipeEditIngredientDraft {
  return isRecord(value)
    && hasExactKeys(value, [
      "ingredient_id",
      "amount",
      "unit",
      "ingredient_type",
      "display_text",
      "component_label",
      "scalable",
      "food_product_id",
      "food_product_nutrition_version_id",
    ])
    && isUuid(value.ingredient_id)
    && isNullableNumber(value.amount)
    && isNullableString(value.unit)
    && (value.ingredient_type === "QUANT" || value.ingredient_type === "TO_TASTE")
    && isNullableString(value.display_text)
    && isNullableString(value.component_label)
    && typeof value.scalable === "boolean"
    && isNullableUuid(value.food_product_id)
    && isNullableUuid(value.food_product_nutrition_version_id)
    && ((value.food_product_id === null) ===
      (value.food_product_nutrition_version_id === null));
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
    || !hasExactKeys(value, ["revision", "edit_context"])
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

  return value as unknown as RecipeSnapshotEntrypointContext;
}

function parseForkEntrypointContext(
  value: unknown,
): RecipeSnapshotForkEntrypointContext | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ["revision", "fork_context"])
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

  return value as unknown as RecipeSnapshotForkEntrypointContext;
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
