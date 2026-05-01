import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
import {
  getMockRecipeList,
  isDiscoveryFilterManualMockEnabled,
} from "@/lib/mock/recipes";
import { parseRecipeSortKey } from "@/lib/recipe";
import {
  clampLimit,
  filterRecipeIdsByIngredients,
  parseIngredientIds,
} from "@/lib/recipe-list";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  ManualRecipeCreateBody,
  ManualRecipeCreateData,
  ManualRecipeIngredientInput,
  ManualRecipeStepInput,
  RecipeCardItem,
  RecipeListData,
  RecipeListQuery,
} from "@/types/recipe";

interface RecipeIngredientMatchRow {
  recipe_id: string;
  ingredient_id: string;
}

interface QueryError {
  code?: string;
  message: string;
}

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface IdLookupRow {
  id: string;
}

interface ManualRecipeRow {
  id: string;
  title: string;
  source_type: "manual";
  created_by: string;
  base_servings: number;
}

interface IdLookupQuery {
  in(column: string, values: string[]): IdLookupQuery;
  then: ArrayQueryResult<IdLookupRow>["then"];
}

interface IdLookupTable {
  select(columns: "id"): IdLookupQuery;
}

interface ManualRecipeInsertQuery {
  select(columns: string): ManualRecipeInsertQuery;
  maybeSingle(): MaybeSingleResult<ManualRecipeRow>;
}

interface RecipesInsertTable {
  insert(values: {
    title: string;
    base_servings: number;
    source_type: "manual";
    created_by: string;
  }): ManualRecipeInsertQuery;
}

interface RecipeIngredientInsertRow {
  recipe_id: string;
  ingredient_id: string;
  amount: number | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  display_text: string | null;
  scalable: boolean;
  sort_order: number;
}

interface RecipeIngredientsInsertTable {
  insert(values: RecipeIngredientInsertRow[]): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
}

interface RecipeStepInsertRow {
  recipe_id: string;
  step_number: number;
  instruction: string;
  cooking_method_id: string;
  ingredients_used: ManualRecipeStepInput["ingredients_used"];
  heat_level: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
}

interface RecipeStepsInsertTable {
  insert(values: RecipeStepInsertRow[]): PromiseLike<{
    data: null;
    error: QueryError | null;
  }>;
}

interface ManualRecipeDbClient {
  from(table: "ingredients"): IdLookupTable;
  from(table: "cooking_methods"): IdLookupTable;
  from(table: "recipes"): RecipesInsertTable;
  from(table: "recipe_ingredients"): RecipeIngredientsInsertTable;
  from(table: "recipe_steps"): RecipeStepsInsertTable;
}

interface ValidationField {
  field: string;
  reason: string;
}

interface ParsedManualRecipeCreate {
  title: string;
  baseServings: number;
  ingredients: ManualRecipeIngredientInput[];
  steps: ManualRecipeStepInput[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function isPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value.trim() : null;
}

function normalizeIngredient(row: Record<string, unknown>): ManualRecipeIngredientInput {
  return {
    ingredient_id: typeof row.ingredient_id === "string" ? row.ingredient_id.trim() : "",
    standard_name: typeof row.standard_name === "string" ? row.standard_name.trim() : "",
    amount: typeof row.amount === "number" ? row.amount : null,
    unit: normalizeNullableString(row.unit),
    ingredient_type: row.ingredient_type === "TO_TASTE" ? "TO_TASTE" : "QUANT",
    display_text: normalizeNullableString(row.display_text),
    sort_order: typeof row.sort_order === "number" ? row.sort_order : Number.NaN,
    scalable: typeof row.scalable === "boolean" ? row.scalable : true,
  };
}

function normalizeIngredientsUsed(value: unknown): ManualRecipeStepInput["ingredients_used"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((ingredient) => {
    if (!isRecord(ingredient)) {
      return {
        ingredient_id: "",
        amount: null,
        unit: null,
        cut_size: null,
      };
    }

    return {
      ingredient_id: typeof ingredient.ingredient_id === "string" ? ingredient.ingredient_id.trim() : "",
      amount: typeof ingredient.amount === "number" ? ingredient.amount : null,
      unit: normalizeNullableString(ingredient.unit),
      cut_size: normalizeNullableString(ingredient.cut_size),
    };
  });
}

function normalizeStep(row: Record<string, unknown>): ManualRecipeStepInput {
  return {
    step_number: typeof row.step_number === "number" ? row.step_number : Number.NaN,
    instruction: typeof row.instruction === "string" ? row.instruction.trim() : "",
    cooking_method_id: typeof row.cooking_method_id === "string" ? row.cooking_method_id.trim() : "",
    ingredients_used: normalizeIngredientsUsed(row.ingredients_used),
    heat_level: normalizeNullableString(row.heat_level),
    duration_seconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    duration_text: normalizeNullableString(row.duration_text),
  };
}

function validateIngredient(
  ingredient: ManualRecipeIngredientInput,
  index: number,
  fields: ValidationField[],
) {
  if (!ingredient.ingredient_id) {
    fields.push({ field: `ingredients[${index}].ingredient_id`, reason: "required" });
  } else if (!isUuid(ingredient.ingredient_id)) {
    fields.push({ field: `ingredients[${index}].ingredient_id`, reason: "invalid_uuid" });
  }

  if (!ingredient.standard_name) {
    fields.push({ field: `ingredients[${index}].standard_name`, reason: "required" });
  }

  if (!Number.isInteger(ingredient.sort_order)) {
    fields.push({ field: `ingredients[${index}].sort_order`, reason: "invalid_integer" });
  }

  if (ingredient.ingredient_type === "QUANT") {
    if (typeof ingredient.amount !== "number" || ingredient.amount <= 0) {
      fields.push({ field: `ingredients[${index}].amount`, reason: "positive_number_required" });
    }

    if (!ingredient.unit) {
      fields.push({ field: `ingredients[${index}].unit`, reason: "required" });
    }

    return;
  }

  if (ingredient.amount !== null) {
    fields.push({ field: `ingredients[${index}].amount`, reason: "must_be_null" });
  }

  if (ingredient.unit !== null) {
    fields.push({ field: `ingredients[${index}].unit`, reason: "must_be_null" });
  }

  if (ingredient.scalable !== false) {
    fields.push({ field: `ingredients[${index}].scalable`, reason: "must_be_false" });
  }
}

function validateStep(
  step: ManualRecipeStepInput,
  index: number,
  ingredientIds: Set<string>,
  fields: ValidationField[],
) {
  if (!Number.isInteger(step.step_number) || step.step_number <= 0) {
    fields.push({ field: `steps[${index}].step_number`, reason: "positive_integer_required" });
  }

  if (!step.instruction) {
    fields.push({ field: `steps[${index}].instruction`, reason: "required" });
  }

  if (!step.cooking_method_id) {
    fields.push({ field: `steps[${index}].cooking_method_id`, reason: "required" });
  } else if (!isUuid(step.cooking_method_id)) {
    fields.push({ field: `steps[${index}].cooking_method_id`, reason: "invalid_uuid" });
  }

  if (step.duration_seconds !== null && (!Number.isInteger(step.duration_seconds) || step.duration_seconds < 0)) {
    fields.push({ field: `steps[${index}].duration_seconds`, reason: "non_negative_integer_required" });
  }

  step.ingredients_used.forEach((ingredient, ingredientIndex) => {
    if (!ingredient.ingredient_id) {
      fields.push({
        field: `steps[${index}].ingredients_used[${ingredientIndex}].ingredient_id`,
        reason: "required",
      });
    } else if (!isUuid(ingredient.ingredient_id)) {
      fields.push({
        field: `steps[${index}].ingredients_used[${ingredientIndex}].ingredient_id`,
        reason: "invalid_uuid",
      });
    } else if (!ingredientIds.has(ingredient.ingredient_id)) {
      fields.push({
        field: `steps[${index}].ingredients_used[${ingredientIndex}].ingredient_id`,
        reason: "not_in_recipe_ingredients",
      });
    }

    if (ingredient.amount !== null && (typeof ingredient.amount !== "number" || ingredient.amount <= 0)) {
      fields.push({
        field: `steps[${index}].ingredients_used[${ingredientIndex}].amount`,
        reason: "positive_number_required",
      });
    }
  });
}

function parseManualRecipeCreateBody(rawBody: unknown) {
  const fields: ValidationField[] = [];

  if (!isRecord(rawBody)) {
    return {
      fields: [{ field: "body", reason: "invalid_object" }],
      parsed: null,
    };
  }

  const title = typeof rawBody.title === "string" ? rawBody.title.trim() : "";
  if (!title) {
    fields.push({ field: "title", reason: "required" });
  } else if (title.length > 200) {
    fields.push({ field: "title", reason: "max_length" });
  }

  const baseServings = rawBody.base_servings;
  if (!isPositiveInteger(baseServings)) {
    fields.push({ field: "base_servings", reason: "positive_integer_required" });
  }

  const ingredientRecords = Array.isArray(rawBody.ingredients) ? rawBody.ingredients : [];
  if (!Array.isArray(rawBody.ingredients) || rawBody.ingredients.length === 0) {
    fields.push({ field: "ingredients", reason: "required" });
  }

  const ingredients = ingredientRecords.map((ingredient) =>
    normalizeIngredient(isRecord(ingredient) ? ingredient : {}),
  );
  const ingredientIds = new Set<string>();
  const ingredientSortOrders = new Set<number>();

  ingredients.forEach((ingredient, index) => {
    const rawIngredient = ingredientRecords[index];
    const ingredientType = isRecord(rawIngredient) ? rawIngredient.ingredient_type : undefined;

    if (ingredientType !== "QUANT" && ingredientType !== "TO_TASTE") {
      fields.push({ field: `ingredients[${index}].ingredient_type`, reason: "invalid_enum" });
    }

    validateIngredient(ingredient, index, fields);

    if (ingredientIds.has(ingredient.ingredient_id)) {
      fields.push({ field: `ingredients[${index}].ingredient_id`, reason: "duplicate" });
    }
    ingredientIds.add(ingredient.ingredient_id);

    if (Number.isInteger(ingredient.sort_order)) {
      if (ingredientSortOrders.has(ingredient.sort_order)) {
        fields.push({ field: `ingredients[${index}].sort_order`, reason: "duplicate" });
      }
      ingredientSortOrders.add(ingredient.sort_order);
    }
  });

  const stepRecords = Array.isArray(rawBody.steps) ? rawBody.steps : [];
  if (!Array.isArray(rawBody.steps) || rawBody.steps.length === 0) {
    fields.push({ field: "steps", reason: "required" });
  }

  const steps = stepRecords.map((step) => normalizeStep(isRecord(step) ? step : {}));
  const stepNumbers = new Set<number>();

  steps.forEach((step, index) => {
    validateStep(step, index, ingredientIds, fields);

    if (Number.isInteger(step.step_number)) {
      if (stepNumbers.has(step.step_number)) {
        fields.push({ field: `steps[${index}].step_number`, reason: "duplicate" });
      }
      stepNumbers.add(step.step_number);
    }
  });

  if (steps.length > 0 && !stepNumbers.has(1)) {
    fields.push({ field: "steps[0].step_number", reason: "must_start_at_1" });
  }

  const parsed =
    fields.length === 0
      ? ({
          title,
          baseServings: baseServings as number,
          ingredients,
          steps,
        } satisfies ParsedManualRecipeCreate)
      : null;

  return { fields, parsed };
}

function toManualRecipeCreateData(row: ManualRecipeRow): ManualRecipeCreateData {
  return {
    id: row.id,
    title: row.title,
    source_type: row.source_type,
    created_by: row.created_by,
    base_servings: row.base_servings,
  };
}

function buildIngredientInsertRows(recipeId: string, ingredients: ManualRecipeIngredientInput[]) {
  return ingredients.map((ingredient) => ({
    recipe_id: recipeId,
    ingredient_id: ingredient.ingredient_id,
    amount: ingredient.amount,
    unit: ingredient.unit,
    ingredient_type: ingredient.ingredient_type,
    display_text: ingredient.display_text,
    scalable: ingredient.scalable,
    sort_order: ingredient.sort_order,
  })) satisfies RecipeIngredientInsertRow[];
}

function buildStepInsertRows(recipeId: string, steps: ManualRecipeStepInput[]) {
  return steps.map((step) => ({
    recipe_id: recipeId,
    step_number: step.step_number,
    instruction: step.instruction,
    cooking_method_id: step.cooking_method_id,
    ingredients_used: step.ingredients_used,
    heat_level: step.heat_level,
    duration_seconds: step.duration_seconds,
    duration_text: step.duration_text,
  })) satisfies RecipeStepInsertRow[];
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

function createEmptyRecipeList(): RecipeListData {
  return {
    items: [],
    next_cursor: null,
    has_next: false,
  };
}

function mapRecipeCard(recipe: {
  id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[] | null;
  base_servings: number;
  view_count: number;
  like_count: number;
  save_count: number;
  source_type: "system" | "youtube" | "manual";
}): RecipeCardItem {
  return {
    id: recipe.id,
    title: recipe.title,
    thumbnail_url: recipe.thumbnail_url,
    tags: recipe.tags ?? [],
    base_servings: recipe.base_servings,
    view_count: recipe.view_count,
    like_count: recipe.like_count,
    save_count: recipe.save_count,
    source_type: recipe.source_type,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const listQuery: RecipeListQuery = {
      q: searchParams.get("q")?.trim() || undefined,
      ingredient_ids: parseIngredientIds(searchParams.get("ingredient_ids")),
      sort: parseRecipeSortKey(searchParams.get("sort")),
      cursor: searchParams.get("cursor"),
      limit: clampLimit(searchParams.get("limit")),
    };
    const hasIngredientFilter = searchParams.has("ingredient_ids");
    const sort = listQuery.sort ?? "view_count";
    const limit = listQuery.limit ?? 20;

    if (hasIngredientFilter && listQuery.ingredient_ids?.length === 0) {
      return ok(createEmptyRecipeList());
    }

    if (isDiscoveryFilterManualMockEnabled()) {
      return ok(getMockRecipeList(listQuery.q, listQuery.ingredient_ids));
    }

    const supabase = createServiceRoleClient() ?? await createRouteHandlerClient();
    let filteredRecipeIds: string[] | null = null;

    if (listQuery.ingredient_ids?.length) {
      const { data: ingredientMatches, error: ingredientError } = await supabase
        .from("recipe_ingredients")
        .select("recipe_id, ingredient_id")
        .in("ingredient_id", listQuery.ingredient_ids);

      if (ingredientError) {
        return ok(createEmptyRecipeList());
      }

      filteredRecipeIds = filterRecipeIdsByIngredients(
        (ingredientMatches ?? []) as RecipeIngredientMatchRow[],
        listQuery.ingredient_ids,
      );

      if (filteredRecipeIds.length === 0) {
        return ok(createEmptyRecipeList());
      }
    }

    let recipeQuery = supabase
      .from("recipes")
      .select(
        "id, title, thumbnail_url, tags, base_servings, view_count, like_count, save_count, source_type",
      )
      .order(sort, { ascending: false })
      .order("id", { ascending: true })
      .limit(limit);

    if (filteredRecipeIds) {
      recipeQuery = recipeQuery.in("id", filteredRecipeIds);
    }

    if (listQuery.q) {
      recipeQuery = recipeQuery.ilike("title", `%${listQuery.q}%`);
    }

    const { data, error } = await recipeQuery;

    if (error) {
      return filteredRecipeIds ? ok(createEmptyRecipeList()) : ok(getMockRecipeList(listQuery.q));
    }

    const items: RecipeCardItem[] =
      data?.map((recipe) => mapRecipeCard(recipe)) ?? [];

    const response: RecipeListData =
      items.length > 0
        ? { items, next_cursor: null, has_next: false }
        : filteredRecipeIds
          ? createEmptyRecipeList()
          : getMockRecipeList(listQuery.q);

    return ok(response);
  } catch {
    const searchParams = request.nextUrl.searchParams;

    if (searchParams.has("ingredient_ids")) {
      return ok(createEmptyRecipeList());
    }

    return ok(getMockRecipeList(searchParams.get("q")));
  }
}

async function findMissingIds(
  dbClient: ManualRecipeDbClient,
  table: "ingredients" | "cooking_methods",
  ids: string[],
) {
  const tableClient = table === "ingredients"
    ? dbClient.from("ingredients")
    : dbClient.from("cooking_methods");
  const result = await tableClient
    .select("id")
    .in("id", ids);

  if (result.error || !result.data) {
    return {
      error: result.error ?? { message: "lookup failed" },
      missingIds: [],
    };
  }

  const existingIds = new Set(result.data.map((row) => row.id));

  return {
    error: null,
    missingIds: ids.filter((id) => !existingIds.has(id)),
  };
}

function buildMissingIngredientFields(
  ingredients: ManualRecipeIngredientInput[],
  missingIds: string[],
) {
  const missingIdSet = new Set(missingIds);

  return ingredients
    .map((ingredient, index) =>
      missingIdSet.has(ingredient.ingredient_id)
        ? { field: `ingredients[${index}].ingredient_id`, reason: "not_found" }
        : null,
    )
    .filter((field): field is ValidationField => field !== null);
}

function buildMissingCookingMethodFields(
  steps: ManualRecipeStepInput[],
  missingIds: string[],
) {
  const missingIdSet = new Set(missingIds);

  return steps
    .map((step, index) =>
      missingIdSet.has(step.cooking_method_id)
        ? { field: `steps[${index}].cooking_method_id`, reason: "not_found" }
        : null,
    )
    .filter((field): field is ValidationField => field !== null);
}

export async function POST(request: Request) {
  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  let body: ManualRecipeCreateBody;

  try {
    body = (await request.json()) as ManualRecipeCreateBody;
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const { fields, parsed } = parseManualRecipeCreateBody(body);
  if (!parsed) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, fields);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as ManualRecipeDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "레시피를 등록하지 못했어요."),
      500,
    );
  }

  const ingredientIds = [...new Set(parsed.ingredients.map((ingredient) => ingredient.ingredient_id))];
  const ingredientLookup = await findMissingIds(dbClient, "ingredients", ingredientIds);
  if (ingredientLookup.error) {
    return fail("INTERNAL_ERROR", "레시피 재료를 확인하지 못했어요.", 500);
  }

  if (ingredientLookup.missingIds.length > 0) {
    return fail(
      "VALIDATION_ERROR",
      "요청 값을 확인해주세요.",
      422,
      buildMissingIngredientFields(parsed.ingredients, ingredientLookup.missingIds),
    );
  }

  const cookingMethodIds = [...new Set(parsed.steps.map((step) => step.cooking_method_id))];
  const cookingMethodLookup = await findMissingIds(dbClient, "cooking_methods", cookingMethodIds);
  if (cookingMethodLookup.error) {
    return fail("INTERNAL_ERROR", "조리방법을 확인하지 못했어요.", 500);
  }

  if (cookingMethodLookup.missingIds.length > 0) {
    return fail(
      "VALIDATION_ERROR",
      "요청 값을 확인해주세요.",
      422,
      buildMissingCookingMethodFields(parsed.steps, cookingMethodLookup.missingIds),
    );
  }

  const recipeResult = await dbClient
    .from("recipes")
    .insert({
      title: parsed.title,
      base_servings: parsed.baseServings,
      source_type: "manual",
      created_by: user.id,
    })
    .select("id, title, source_type, created_by, base_servings")
    .maybeSingle();

  if (recipeResult.error || !recipeResult.data) {
    return fail("INTERNAL_ERROR", "레시피를 등록하지 못했어요.", 500);
  }

  const ingredientInsertResult = await dbClient
    .from("recipe_ingredients")
    .insert(buildIngredientInsertRows(recipeResult.data.id, parsed.ingredients));

  if (ingredientInsertResult.error) {
    return fail("INTERNAL_ERROR", "레시피 재료를 등록하지 못했어요.", 500);
  }

  const stepInsertResult = await dbClient
    .from("recipe_steps")
    .insert(buildStepInsertRows(recipeResult.data.id, parsed.steps));

  if (stepInsertResult.error) {
    return fail("INTERNAL_ERROR", "레시피 조리 순서를 등록하지 못했어요.", 500);
  }

  return ok(toManualRecipeCreateData(recipeResult.data), { status: 201 });
}
