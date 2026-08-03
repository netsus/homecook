import { NextRequest } from "next/server";

import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import { readQaFixtureFaultsHeader } from "@/lib/mock/qa-fixture-overrides";
import {
  createQaFixtureMeal,
  getQaFixtureMealsBySlot,
  isQaFixtureModeEnabled,
  MOCK_RECIPE_ID,
} from "@/lib/mock/recipes";
import { normalizeFoodSafetyImageUrl } from "@/lib/recipe-image";
import {
  dedupeProductPlannerEntries,
  toMealProductPlannerEntry,
} from "@/lib/server/prepared-food-planner-entry";
import {
  createHybridAuthorityRouteError,
  withHybridAuthorityRouteError,
} from "@/lib/server/hybrid-auth/route-error";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import {
  buildMealAddPathSourceKey,
  MEAL_ADD_PATHS,
  recordUserGrowthActivityEvent,
  type MealAddPath,
  type UserGrowthActivityDbClient,
} from "@/lib/server/user-growth-activity";
import { readVerifiedAccountGenerationSession } from
  "@/lib/server/account-generation/session-authority";
import {
  buildSessionAuthorityRpcArgs,
  callFuturePropagationRpc,
  type FuturePropagationRpcClient,
} from "@/lib/server/recipe-content-snapshot-future-propagation";
import { awardUserProgressEvent, type UserProgressDbClient } from "@/lib/server/user-progress";
import {
  createFutureMealWriteInternalClient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";
import type { MealCreateBody, MealCreateData, MealListData, MealListItemData } from "@/types/meal";
import type { MealStatus } from "@/types/planner";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";

interface QueryError {
  code?: string;
  message: string;
}

interface RecipeLookupRow {
  id: string;
}

interface RecipeSummaryRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

interface PlannerColumnRow {
  id: string;
  user_id: string;
  name: string;
}

interface LeftoverDishLookupRow {
  id: string;
  user_id: string;
  recipe_id: string;
}

interface MealListRow {
  id: string;
  recipe_id: string;
  planned_servings: number;
  status: string;
  is_leftover: boolean;
  created_at: string;
  recipe_content_snapshot_id: string | null;
  recipe_content_snapshots:
    | {
      title: string | null;
    }
    | Array<{
      title: string | null;
    }>
    | null;
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
  recipe_nutrition_snapshot_id: string | null;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface QueryOrderOption {
  ascending: boolean;
}

interface RecipesLookupQuery {
  eq(column: string, value: string): RecipesLookupQuery;
  maybeSingle(): MaybeSingleResult<RecipeLookupRow>;
}

interface RecipesSummaryQuery {
  in(column: string, values: string[]): RecipesSummaryQuery;
  then: ArrayQueryResult<RecipeSummaryRow>["then"];
}

interface PlannerColumnsSelectQuery {
  eq(column: string, value: string): PlannerColumnsSelectQuery;
  maybeSingle(): MaybeSingleResult<PlannerColumnRow>;
}

interface LeftoverDishesSelectQuery {
  eq(column: string, value: string): LeftoverDishesSelectQuery;
  maybeSingle(): MaybeSingleResult<LeftoverDishLookupRow>;
}

interface MealsSelectQuery {
  eq(column: string, value: string): MealsSelectQuery;
  order(column: string, options: QueryOrderOption): MealsSelectQuery;
  then: ArrayQueryResult<MealListRow>["then"];
}

interface MealsInsertQuery {
  select(columns: string): MealsInsertQuery;
  maybeSingle(): MaybeSingleResult<MealInsertRow>;
}

interface RecipesTable {
  select(columns: "id"): RecipesLookupQuery;
  select(columns: "id, title, thumbnail_url"): RecipesSummaryQuery;
}

interface PlannerColumnsTable {
  select(columns: string): PlannerColumnsSelectQuery;
}

interface LeftoverDishesTable {
  select(columns: string): LeftoverDishesSelectQuery;
}

interface MealsTable {
  select(columns: string): MealsSelectQuery;
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
  from(table: "leftover_dishes"): LeftoverDishesTable;
  from(table: "meals"): MealsTable;
  rpc(
    name: "list_product_planner_entries",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: QueryError | null }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLIENT_CONTROLLED_NUTRITION_FIELDS = new Set([
  "recipe_nutrition_snapshot_id",
  "nutrition_snapshot_origin",
  "product_id",
  "product_nutrition_version_id",
  "quantity",
]);

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

function normalizeMealStatus(status: string): MealStatus {
  if (status === "shopping_done" || status === "cook_done") {
    return status;
  }

  return "registered";
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

function normalizeMealAddPath(value: unknown): MealAddPath | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return MEAL_ADD_PATHS.has(normalized as MealAddPath) ? normalized as MealAddPath : null;
}

function parseMealListQuery(request: NextRequest) {
  const planDate = request.nextUrl.searchParams.get("plan_date")?.trim() ?? "";
  const columnId = request.nextUrl.searchParams.get("column_id")?.trim() ?? "";
  const fields: Array<{ field: string; reason: string }> = [];

  if (!planDate) {
    fields.push({ field: "plan_date", reason: "required" });
  } else if (!isValidDateString(planDate)) {
    fields.push({ field: "plan_date", reason: "invalid_date" });
  }

  if (!columnId) {
    fields.push({ field: "column_id", reason: "required" });
  } else if (!isUuid(columnId)) {
    fields.push({ field: "column_id", reason: "invalid_uuid" });
  }

  return {
    fields,
    planDate,
    columnId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildCreateValidationFields(body: MealCreateBody) {
  const fields: Array<{ field: string; reason: string }> = [];

  Object.keys(body)
    .filter((field) => CLIENT_CONTROLLED_NUTRITION_FIELDS.has(field))
    .sort()
    .forEach((field) => {
      fields.push({ field, reason: "unexpected" });
    });

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

function projectMealCreateData(value: unknown): MealCreateData | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isUuid(value.id)) {
    return null;
  }

  if (
    typeof value.recipe_id !== "string"
    || typeof value.plan_date !== "string"
    || typeof value.column_id !== "string"
    || typeof value.planned_servings !== "number"
    || typeof value.status !== "string"
    || typeof value.is_leftover !== "boolean"
  ) {
    return null;
  }

  return {
    id: value.id,
    recipe_id: value.recipe_id,
    plan_date: value.plan_date,
    column_id: value.column_id,
    planned_servings: value.planned_servings,
    status: normalizeMealStatus(value.status),
    is_leftover: value.is_leftover,
    leftover_dish_id: typeof value.leftover_dish_id === "string"
      ? value.leftover_dish_id
      : null,
    recipe_nutrition_snapshot_id:
      typeof value.recipe_nutrition_snapshot_id === "string"
        ? value.recipe_nutrition_snapshot_id
        : null,
  };
}

function toMealListItem(row: MealListRow, recipeMap: Map<string, RecipeSummaryRow>): MealListItemData {
  const recipe = recipeMap.get(row.recipe_id);
  const contentSnapshot = Array.isArray(row.recipe_content_snapshots)
    ? row.recipe_content_snapshots[0] ?? null
    : row.recipe_content_snapshots;

  return {
    id: row.id,
    recipe_id: row.recipe_id,
    recipe_title: contentSnapshot?.title?.trim() || recipe?.title || "",
    recipe_thumbnail_url: normalizeFoodSafetyImageUrl(recipe?.thumbnail_url),
    planned_servings: row.planned_servings,
    status: normalizeMealStatus(row.status),
    is_leftover: row.is_leftover,
  };
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

async function getMeals(request: NextRequest) {
  const parsed = parseMealListQuery(request);
  if (parsed.fields.length > 0) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, parsed.fields);
  }

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    return ok(getQaFixtureMealsBySlot(parsed.planDate, parsed.columnId) satisfies MealListData);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = routeClient as unknown as
    MealsDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "식사 목록을 불러오지 못했어요."),
      500,
    );
  }

  const columnResult = await dbClient
    .from("meal_plan_columns")
    .select("id, user_id, name")
    .eq("id", parsed.columnId)
    .maybeSingle();

  if (columnResult.error || !columnResult.data) {
    const authorityError = createHybridAuthorityRouteError(columnResult.error);
    if (authorityError) {
      return authorityError;
    }
    return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
  }

  if (columnResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 플래너 슬롯만 조회할 수 있어요.", 403);
  }

  const mealsResult = await dbClient
    .from("meals")
    .select(
      "id, recipe_id, planned_servings, status, is_leftover, created_at, recipe_content_snapshot_id, recipe_content_snapshots(title)",
    )
    .eq("user_id", user.id)
    .eq("plan_date", parsed.planDate)
    .eq("column_id", parsed.columnId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (mealsResult.error || !mealsResult.data) {
    const authorityError = createHybridAuthorityRouteError(mealsResult.error);
    if (authorityError) {
      return authorityError;
    }
    return fail("INTERNAL_ERROR", "식사 목록을 불러오지 못했어요.", 500);
  }

  const hasBrokenContentPinnedMeal = mealsResult.data.some((meal) => {
    if (!meal.recipe_content_snapshot_id) {
      return false;
    }

    const contentSnapshot = Array.isArray(meal.recipe_content_snapshots)
      ? meal.recipe_content_snapshots[0] ?? null
      : meal.recipe_content_snapshots;

    return contentSnapshot === null || contentSnapshot.title === null;
  });

  if (hasBrokenContentPinnedMeal) {
    return fail("INTERNAL_ERROR", "식사 목록을 불러오지 못했어요.", 500);
  }

  const productEntriesResult = await dbClient.rpc("list_product_planner_entries", {
    p_user_id: user.id,
    p_start_date: parsed.planDate,
    p_end_date: parsed.planDate,
    p_column_id: parsed.columnId,
  });
  if (productEntriesResult.error || !Array.isArray(productEntriesResult.data)) {
    const authorityError = createHybridAuthorityRouteError(productEntriesResult.error);
    if (authorityError) {
      return authorityError;
    }
    return fail("INTERNAL_ERROR", "식사 목록을 불러오지 못했어요.", 500);
  }
  const productEntries = dedupeProductPlannerEntries(
    productEntriesResult.data as ProductPlannerEntryData[],
  ).map(toMealProductPlannerEntry);

  const recipeIds = [...new Set(mealsResult.data.map((meal) => meal.recipe_id))];
  const recipeMap = new Map<string, RecipeSummaryRow>();

  if (recipeIds.length > 0) {
    const recipesResult = await dbClient
      .from("recipes")
      .select("id, title, thumbnail_url")
      .in("id", recipeIds);

    if (recipesResult.error || !recipesResult.data) {
      const authorityError = createHybridAuthorityRouteError(recipesResult.error);
      if (authorityError) {
        return authorityError;
      }
      return fail("INTERNAL_ERROR", "식사 목록을 불러오지 못했어요.", 500);
    }

    recipesResult.data.forEach((recipe) => {
      recipeMap.set(recipe.id, recipe);
    });
  }

  return ok({
    items: mealsResult.data.map((meal) => toMealListItem(meal, recipeMap)),
    product_entries: productEntries,
  } satisfies MealListData);
}

const guardedGetMeals = withHybridAuthorityRouteError(
  "식사 목록을 불러오지 못했어요.",
  getMeals,
);

export async function GET(request: NextRequest) {
  return guardedGetMeals(request);
}

async function postMeals(request: Request) {
  let routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>> | null = null;
  let user: Awaited<ReturnType<typeof requireUser>> | null = null;

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }
  } else {
    routeClient = await createRouteHandlerClient();
    user = await requireUser(routeClient);

    if (!user) {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }
  }

  let body: MealCreateBody;

  try {
    const parsedBody: unknown = await request.json();
    if (!isRecord(parsedBody)) {
      throw new TypeError("INVALID_JSON_OBJECT");
    }
    body = parsedBody as MealCreateBody;
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const parsed = buildCreateValidationFields(body);
  if (parsed.fields.length > 0 || !parsed.plannedServings) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, parsed.fields);
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

  if (!routeClient || !user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = routeClient as unknown as
    MealsDbClient & UserBootstrapDbClient & UserProgressDbClient & UserGrowthActivityDbClient;

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

  const verifiedSession = await readVerifiedAccountGenerationSession(routeClient);
  if (!verifiedSession.ok || verifiedSession.sessionAuthority.ownerUuid !== user.id) {
    return fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409);
  }

  const recipeResult = await (routeClient as unknown as MealsDbClient)
    .from("recipes")
    .select("id")
    .eq("id", parsed.recipeId)
    .maybeSingle();

  if (recipeResult.error || !recipeResult.data) {
    const authorityError = createHybridAuthorityRouteError(recipeResult.error);
    if (authorityError) {
      return authorityError;
    }
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  const columnResult = await dbClient
    .from("meal_plan_columns")
    .select("id, user_id, name")
    .eq("id", parsed.columnId)
    .maybeSingle();

  if (columnResult.error || !columnResult.data) {
    const authorityError = createHybridAuthorityRouteError(columnResult.error);
    if (authorityError) {
      return authorityError;
    }
    return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
  }

  if (columnResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 플래너 슬롯만 선택할 수 있어요.", 403);
  }

  if (parsed.leftoverDishId) {
    const leftoverResult = await dbClient
      .from("leftover_dishes")
      .select("id, user_id, recipe_id")
      .eq("id", parsed.leftoverDishId)
      .maybeSingle();

    if (leftoverResult.error || !leftoverResult.data) {
      const authorityError = createHybridAuthorityRouteError(leftoverResult.error);
      if (authorityError) {
        return authorityError;
      }
      return fail("RESOURCE_NOT_FOUND", "남은 요리를 찾을 수 없어요.", 404);
    }

    if (leftoverResult.data.user_id !== user.id) {
      return fail("FORBIDDEN", "내 남은 요리만 플래너에 추가할 수 있어요.", 403);
    }

    if (leftoverResult.data.recipe_id !== parsed.recipeId) {
      return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, [
        { field: "leftover_dish_id", reason: "recipe_mismatch" },
      ]);
    }
  }

  const serviceClient = createFutureMealWriteInternalClient();
  if (!serviceClient) {
    return fail("INTERNAL_ERROR", "식사를 추가하지 못했어요.", 500);
  }

  const createResult = await callFuturePropagationRpc(
    serviceClient as unknown as FuturePropagationRpcClient,
    "write_future_meal_with_snapshot_authority",
    {
      ...buildSessionAuthorityRpcArgs(verifiedSession.sessionAuthority),
      p_action: "create",
      p_meal_id: null,
      p_recipe_id: parsed.recipeId,
      p_plan_date: parsed.planDate,
      p_column_id: parsed.columnId,
      p_planned_servings: parsed.plannedServings,
      p_leftover_dish_id: parsed.leftoverDishId,
    },
  );
  if (!createResult.ok) {
    return createResult.response;
  }

  const createdMeal = projectMealCreateData(createResult.data);
  if (!createdMeal) {
    return fail("INTERNAL_ERROR", "식사를 추가하지 못했어요.", 500);
  }

  const occurredAt = new Date().toISOString();

  try {
    await awardUserProgressEvent(dbClient, {
      userId: user.id,
      eventType: "planner_registered",
      sourceTable: "meals",
      sourceId: createdMeal.id,
      occurredAt,
    });
  } catch {
    // Growth projection is secondary; meal creation remains the source action.
  }

  const sourcePath = normalizeMealAddPath(body.source_path);
  if (sourcePath) {
    try {
      await recordUserGrowthActivityEvent(dbClient, {
        userId: user.id,
        activityType: "meal_add_path_used",
        category: "planner",
        sourceKey: buildMealAddPathSourceKey(user.id, sourcePath),
        sourceTable: "meals",
        sourceId: createdMeal.id,
        sourceMeta: { source_path: sourcePath },
        occurredAt,
      });
    } catch {
      // Activity history is secondary; meal creation remains the source action.
    }
  }

  return ok(createdMeal, { status: 201 });
}

const guardedPostMeals = withHybridAuthorityRouteError(
  "식사를 추가하지 못했어요.",
  postMeals,
);

export async function POST(request: Request) {
  return guardedPostMeals(request);
}
