import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import { readQaFixtureFaultsHeader } from "@/lib/mock/qa-fixture-overrides";
import {
  createQaFixtureMeal,
  isQaFixtureModeEnabled,
  MOCK_RECIPE_ID,
} from "@/lib/mock/recipes";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { MealCreateBody, MealCreateData } from "@/types/meal";
import { PLANNER_FIXED_SLOT_NAMES } from "@/types/planner";

interface QueryError {
  code?: string;
  message: string;
}

interface RecipeRow {
  id: string;
}

interface PlannerColumnRow {
  id: string;
  user_id: string;
  name: string;
}

interface MealInsertRow {
  id: string;
  recipe_id: string;
  plan_date: string;
  column_id: string;
  planned_servings: number;
  status: "registered";
  is_leftover: boolean;
  leftover_dish_id: string | null;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface RecipesSelectQuery {
  eq(column: string, value: string): RecipesSelectQuery;
  maybeSingle(): MaybeSingleResult<RecipeRow>;
}

interface PlannerColumnsSelectQuery {
  eq(column: string, value: string): PlannerColumnsSelectQuery;
  maybeSingle(): MaybeSingleResult<PlannerColumnRow>;
}

interface MealsInsertQuery {
  select(columns: string): MealsInsertQuery;
  maybeSingle(): MaybeSingleResult<MealInsertRow>;
}

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
}

interface PlannerColumnsTable {
  select(columns: string): PlannerColumnsSelectQuery;
}

interface MealsTable {
  insert(values: {
    user_id: string;
    recipe_id: string;
    plan_date: string;
    column_id: string;
    planned_servings: number;
    status: "registered";
    is_leftover: boolean;
    leftover_dish_id: string | null;
    shopping_list_id: null;
    cooked_at: null;
  }): MealsInsertQuery;
}

interface MealsDbClient {
  from(table: "recipes"): RecipesTable;
  from(table: "meal_plan_columns"): PlannerColumnsTable;
  from(table: "meals"): MealsTable;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function isValidDateString(value: string) {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === value;
}

function normalizeOptionalUuid(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildValidationFields(body: MealCreateBody) {
  const fields: Array<{ field: string; reason: string }> = [];

  const recipeId = typeof body.recipe_id === "string" ? body.recipe_id.trim() : "";
  if (!recipeId) {
    fields.push({ field: "recipe_id", reason: "required" });
  } else if (!isUuid(recipeId)) {
    fields.push({ field: "recipe_id", reason: "invalid_uuid" });
  }

  const planDate = typeof body.plan_date === "string" ? body.plan_date.trim() : "";
  if (!planDate) {
    fields.push({ field: "plan_date", reason: "required" });
  } else if (!isValidDateString(planDate)) {
    fields.push({ field: "plan_date", reason: "invalid_date" });
  }

  const columnId = typeof body.column_id === "string" ? body.column_id.trim() : "";
  if (!columnId) {
    fields.push({ field: "column_id", reason: "required" });
  } else if (!isUuid(columnId)) {
    fields.push({ field: "column_id", reason: "invalid_uuid" });
  }

  if (typeof body.planned_servings !== "number" || !Number.isInteger(body.planned_servings)) {
    fields.push({ field: "planned_servings", reason: "invalid_integer" });
  } else if (body.planned_servings < 1) {
    fields.push({ field: "planned_servings", reason: "min_value" });
  }

  const leftoverDishId = normalizeOptionalUuid(body.leftover_dish_id);
  if (body.leftover_dish_id !== undefined && leftoverDishId === null) {
    fields.push({ field: "leftover_dish_id", reason: "invalid_uuid" });
  } else if (leftoverDishId && !isUuid(leftoverDishId)) {
    fields.push({ field: "leftover_dish_id", reason: "invalid_uuid" });
  }

  return {
    fields,
    recipeId,
    planDate,
    columnId,
    plannedServings:
      typeof body.planned_servings === "number" && Number.isInteger(body.planned_servings)
        ? body.planned_servings
        : null,
    leftoverDishId,
  };
}

function toMealCreateData(row: MealInsertRow): MealCreateData {
  return {
    id: row.id,
    recipe_id: row.recipe_id,
    plan_date: row.plan_date,
    column_id: row.column_id,
    planned_servings: row.planned_servings,
    status: "registered",
    is_leftover: row.is_leftover,
    leftover_dish_id: row.leftover_dish_id,
  };
}

export async function POST(request: Request) {
  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }
  }

  if (!isQaFixtureModeEnabled()) {
    const routeClient = await createRouteHandlerClient();
    const authResult = await routeClient.auth.getUser();
    const user = authResult.data.user;

    if (!user) {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }
  }

  let body: MealCreateBody;

  try {
    body = (await request.json()) as MealCreateBody;
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const parsed = buildValidationFields(body);
  if (parsed.fields.length > 0 || !parsed.plannedServings) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, parsed.fields);
  }

  if (isQaFixtureModeEnabled()) {
    const faultOverrides = readQaFixtureFaultsHeader(request.headers);

    if (faultOverrides?.meal_create === "missing_recipe") {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
    }

    if (faultOverrides?.meal_create === "missing_column") {
      return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
    }

    if (faultOverrides?.meal_create === "forbidden_column") {
      return fail("FORBIDDEN", "내 플래너 슬롯만 선택할 수 있어요.", 403);
    }

    if (faultOverrides?.meal_create === "internal_error") {
      return fail("INTERNAL_ERROR", "식사를 추가하지 못했어요.", 500);
    }

    if (parsed.recipeId !== MOCK_RECIPE_ID) {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
    }

    const fixtureMeal = createQaFixtureMeal({
      planDate: parsed.planDate,
      columnId: parsed.columnId,
      plannedServings: parsed.plannedServings,
      leftoverDishId: parsed.leftoverDishId,
    });

    if (!fixtureMeal.ok) {
      return fail(fixtureMeal.code, fixtureMeal.message, fixtureMeal.status);
    }

    return ok(fixtureMeal.data, { status: 201 });
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as MealsDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "식사를 추가하지 못했어요."),
      500,
    );
  }

  const recipeResult = await dbClient
    .from("recipes")
    .select("id")
    .eq("id", parsed.recipeId)
    .maybeSingle();

  if (recipeResult.error || !recipeResult.data) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  const columnResult = await dbClient
    .from("meal_plan_columns")
    .select("id, user_id, name")
    .eq("id", parsed.columnId)
    .maybeSingle();

  if (columnResult.error || !columnResult.data) {
    return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
  }

  if (columnResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 플래너 슬롯만 선택할 수 있어요.", 403);
  }

  if (!PLANNER_FIXED_SLOT_NAMES.includes(columnResult.data.name as (typeof PLANNER_FIXED_SLOT_NAMES)[number])) {
    return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
  }

  const insertResult = await dbClient
    .from("meals")
    .insert({
      user_id: user.id,
      recipe_id: parsed.recipeId,
      plan_date: parsed.planDate,
      column_id: parsed.columnId,
      planned_servings: parsed.plannedServings,
      status: "registered",
      is_leftover: parsed.leftoverDishId !== null,
      leftover_dish_id: parsed.leftoverDishId,
      shopping_list_id: null,
      cooked_at: null,
    })
    .select("id, recipe_id, plan_date, column_id, planned_servings, status, is_leftover, leftover_dish_id")
    .maybeSingle();

  if (insertResult.error || !insertResult.data) {
    return fail("INTERNAL_ERROR", "식사를 추가하지 못했어요.", 500);
  }

  return ok(toMealCreateData(insertResult.data), { status: 201 });
}
