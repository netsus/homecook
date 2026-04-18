import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import {
  deleteQaFixtureMeal,
  isQaFixtureModeEnabled,
  updateQaFixtureMealServings,
} from "@/lib/mock/recipes";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { MealMutationData, MealUpdateBody } from "@/types/meal";
import type { MealStatus } from "@/types/planner";

interface RouteContext {
  params: Promise<{
    meal_id: string;
  }>;
}

interface QueryError {
  code?: string;
  message: string;
}

interface MealRow {
  id: string;
  user_id: string;
  planned_servings: number;
  status: string;
}

interface MealDeleteRow {
  id: string;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface MealsSelectQuery {
  eq(column: string, value: string): MealsSelectQuery;
  maybeSingle(): MaybeSingleResult<MealRow>;
}

interface MealsUpdateQuery {
  eq(column: string, value: string): MealsUpdateQuery;
  select(columns: string): MealsUpdateQuery;
  maybeSingle(): MaybeSingleResult<MealRow>;
}

interface MealsDeleteQuery {
  eq(column: string, value: string): MealsDeleteQuery;
  select(columns: string): MealsDeleteQuery;
  maybeSingle(): MaybeSingleResult<MealDeleteRow>;
}

interface MealsTable {
  select(columns: string): MealsSelectQuery;
  update(values: { planned_servings: number }): MealsUpdateQuery;
  delete(): MealsDeleteQuery;
}

interface MealsDbClient {
  from(table: "meals"): MealsTable;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function normalizeMealStatus(status: string): MealStatus {
  if (status === "shopping_done" || status === "cook_done") {
    return status;
  }

  return "registered";
}

function isConflictError(error: QueryError | null) {
  if (!error) {
    return false;
  }

  return error.code === "409" || /conflict/i.test(error.message);
}

function buildMealMutationData(row: {
  id: string;
  planned_servings: number;
  status: string;
}) {
  return {
    id: row.id,
    planned_servings: row.planned_servings,
    status: normalizeMealStatus(row.status),
  } satisfies MealMutationData;
}

function parsePlannedServings(body: MealUpdateBody) {
  if (typeof body.planned_servings !== "number" || !Number.isInteger(body.planned_servings)) {
    return {
      ok: false as const,
      fields: [{ field: "planned_servings", reason: "invalid_integer" }],
    };
  }

  if (body.planned_servings < 1) {
    return {
      ok: false as const,
      fields: [{ field: "planned_servings", reason: "min_value" }],
    };
  }

  return {
    ok: true as const,
    plannedServings: body.planned_servings,
  };
}

async function requireAuthenticatedUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

async function readOwnedMeal(dbClient: MealsDbClient, mealId: string) {
  return dbClient
    .from("meals")
    .select("id, user_id, planned_servings, status")
    .eq("id", mealId)
    .maybeSingle();
}

export async function PATCH(request: Request, context: RouteContext) {
  const { meal_id: mealId } = await context.params;

  if (!isUuid(mealId)) {
    return fail("RESOURCE_NOT_FOUND", "식사를 찾을 수 없어요.", 404);
  }

  let body: MealUpdateBody;

  try {
    body = (await request.json()) as MealUpdateBody;
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const parsed = parsePlannedServings(body);
  if (!parsed.ok) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, parsed.fields);
  }

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    const fixtureResult = updateQaFixtureMealServings({
      mealId,
      plannedServings: parsed.plannedServings,
    });

    if (!fixtureResult.ok) {
      return fail(fixtureResult.code, fixtureResult.message, fixtureResult.status);
    }

    return ok(fixtureResult.data);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireAuthenticatedUser(routeClient);

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
      formatBootstrapErrorMessage(bootstrapError, "식사를 수정하지 못했어요."),
      500,
    );
  }

  const mealResult = await readOwnedMeal(dbClient, mealId);

  if (mealResult.error || !mealResult.data) {
    return fail("RESOURCE_NOT_FOUND", "식사를 찾을 수 없어요.", 404);
  }

  if (mealResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 식사만 수정할 수 있어요.", 403);
  }

  const updateResult = await dbClient
    .from("meals")
    .update({
      planned_servings: parsed.plannedServings,
    })
    .eq("id", mealId)
    .eq("user_id", user.id)
    .select("id, user_id, planned_servings, status")
    .maybeSingle();

  if (isConflictError(updateResult.error)) {
    return fail("CONFLICT", "현재 상태에서는 인분을 변경할 수 없어요.", 409);
  }

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "식사를 수정하지 못했어요.", 500);
  }

  return ok(buildMealMutationData(updateResult.data));
}

export async function DELETE(request: Request, context: RouteContext) {
  const { meal_id: mealId } = await context.params;

  if (!isUuid(mealId)) {
    return fail("RESOURCE_NOT_FOUND", "식사를 찾을 수 없어요.", 404);
  }

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    const fixtureResult = deleteQaFixtureMeal(mealId);

    if (!fixtureResult.ok) {
      return fail(fixtureResult.code, fixtureResult.message, fixtureResult.status);
    }

    return new Response(null, { status: 204 });
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireAuthenticatedUser(routeClient);

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
      formatBootstrapErrorMessage(bootstrapError, "식사를 삭제하지 못했어요."),
      500,
    );
  }

  const mealResult = await readOwnedMeal(dbClient, mealId);

  if (mealResult.error || !mealResult.data) {
    return fail("RESOURCE_NOT_FOUND", "식사를 찾을 수 없어요.", 404);
  }

  if (mealResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 식사만 삭제할 수 있어요.", 403);
  }

  const deleteResult = await dbClient
    .from("meals")
    .delete()
    .eq("id", mealId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (isConflictError(deleteResult.error)) {
    return fail("CONFLICT", "현재 상태에서는 식사를 삭제할 수 없어요.", 409);
  }

  if (deleteResult.error || !deleteResult.data) {
    return fail("INTERNAL_ERROR", "식사를 삭제하지 못했어요.", 500);
  }

  return new Response(null, { status: 204 });
}
