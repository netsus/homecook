import { fail, ok } from "@/lib/api/response";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { PlannerColumnData, PlannerColumnUpdateBody } from "@/types/planner";

interface RouteContext {
  params: Promise<{
    column_id: string;
  }>;
}

interface QueryError {
  code?: string;
  message: string;
}

interface QueryOrderOption {
  ascending: boolean;
}

interface PlannerColumnOwnershipRow {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
}

interface PlannerColumnSortRow {
  id: string;
  sort_order: number;
}

interface PlannerColumnRow {
  id: string;
  name: string;
  sort_order: number;
}

interface PlannerMealExistsRow {
  id: string;
}

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

type MaybeSingleQueryResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface PlannerColumnsOwnershipQuery {
  eq(column: string, value: string): PlannerColumnsOwnershipQuery;
  maybeSingle(): MaybeSingleQueryResult<PlannerColumnOwnershipRow>;
}

interface PlannerColumnsListQuery {
  eq(column: string, value: string): PlannerColumnsListQuery;
  order(column: string, options: QueryOrderOption): PlannerColumnsListQuery;
  then: ArrayQueryResult<PlannerColumnSortRow>["then"];
}

interface PlannerColumnsUpdateQuery {
  eq(column: string, value: string): PlannerColumnsUpdateQuery;
  select(columns: string): PlannerColumnsUpdateQuery;
  maybeSingle(): MaybeSingleQueryResult<PlannerColumnRow>;
}

interface PlannerColumnsDeleteQuery {
  eq(column: string, value: string): PlannerColumnsDeleteQuery;
  select(columns: string): PlannerColumnsDeleteQuery;
  maybeSingle(): MaybeSingleQueryResult<{ id: string }>;
}

interface PlannerColumnsTable {
  select(columns: string): PlannerColumnsOwnershipQuery | PlannerColumnsListQuery;
  update(values: {
    name?: string;
    sort_order?: number;
  }): PlannerColumnsUpdateQuery;
  delete(): PlannerColumnsDeleteQuery;
}

interface MealsSelectQuery {
  eq(column: string, value: string): MealsSelectQuery;
  limit(value: number): MealsSelectQuery;
  then: ArrayQueryResult<PlannerMealExistsRow>["then"];
}

interface MealsTable {
  select(columns: string): MealsSelectQuery;
}

interface PlannerColumnDbClient {
  from(table: "meal_plan_columns"): PlannerColumnsTable;
  from(table: "meals"): MealsTable;
}

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function isObjectBody(value: unknown): value is PlannerColumnUpdateBody {
  return typeof value === "object" && value !== null;
}

function isSortOrderConflict(error: QueryError | null) {
  if (!error) {
    return false;
  }

  return error.code === "23505" || error.message.toLowerCase().includes("duplicate key");
}

function isForeignKeyConflict(error: QueryError | null) {
  if (!error) {
    return false;
  }

  return error.code === "23503" || error.message.toLowerCase().includes("foreign key");
}

function normalizeName(name: unknown) {
  return typeof name === "string" ? name.trim() : "";
}

function parseSortOrder(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function clampSortOrder(target: number, maxLength: number) {
  if (maxLength <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(target, maxLength - 1));
}

async function getOwnedColumn(
  dbClient: PlannerColumnDbClient,
  columnId: string,
  userId: string,
) {
  const columnQuery = dbClient
    .from("meal_plan_columns")
    .select("id, user_id, name, sort_order") as PlannerColumnsOwnershipQuery;
  const columnResult = await columnQuery
    .eq("id", columnId)
    .maybeSingle();

  if (columnResult.error) {
    return {
      ok: false as const,
      response: fail("INTERNAL_ERROR", "끼니 컬럼을 조회하지 못했어요.", 500),
    };
  }

  if (!columnResult.data) {
    return {
      ok: false as const,
      response: fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404),
    };
  }

  if (columnResult.data.user_id !== userId) {
    return {
      ok: false as const,
      response: fail("FORBIDDEN", "내 끼니 컬럼만 수정할 수 있어요.", 403),
    };
  }

  return {
    ok: true as const,
    column: columnResult.data,
  };
}

async function reorderColumns(
  dbClient: PlannerColumnDbClient,
  userId: string,
  targetColumnId: string,
  targetSortOrder: number,
  targetName?: string,
) {
  const listQuery = dbClient
    .from("meal_plan_columns")
    .select("id, sort_order") as PlannerColumnsListQuery;
  const orderedColumnsResult = await listQuery
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (orderedColumnsResult.error || !orderedColumnsResult.data) {
    return {
      ok: false as const,
      response: fail("INTERNAL_ERROR", "끼니 컬럼 순서를 변경하지 못했어요.", 500),
    };
  }

  const orderedIds = orderedColumnsResult.data.map((column) => column.id);
  const currentIndex = orderedIds.indexOf(targetColumnId);

  if (currentIndex < 0) {
    return {
      ok: false as const,
      response: fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404),
    };
  }

  const nextIndex = clampSortOrder(targetSortOrder, orderedIds.length);
  const reorderedIds = [...orderedIds];

  if (currentIndex !== nextIndex) {
    reorderedIds.splice(currentIndex, 1);
    reorderedIds.splice(nextIndex, 0, targetColumnId);
  }

  for (let index = 0; index < reorderedIds.length; index += 1) {
    const temporaryResult = await dbClient
      .from("meal_plan_columns")
      .update({ sort_order: 1000 + index })
      .eq("id", reorderedIds[index])
      .eq("user_id", userId)
      .select("id, name, sort_order")
      .maybeSingle();

    if (temporaryResult.error || !temporaryResult.data) {
      return {
        ok: false as const,
        response: fail("INTERNAL_ERROR", "끼니 컬럼 순서를 변경하지 못했어요.", 500),
      };
    }
  }

  let updatedTarget: PlannerColumnRow | null = null;

  for (let index = 0; index < reorderedIds.length; index += 1) {
    const columnId = reorderedIds[index];
    const updateValues: {
      sort_order: number;
      name?: string;
    } = {
      sort_order: index,
    };

    if (columnId === targetColumnId && targetName !== undefined) {
      updateValues.name = targetName;
    }

    const finalResult = await dbClient
      .from("meal_plan_columns")
      .update(updateValues)
      .eq("id", columnId)
      .eq("user_id", userId)
      .select("id, name, sort_order")
      .maybeSingle();

    if (isSortOrderConflict(finalResult.error)) {
      return {
        ok: false as const,
        response: fail("CONFLICT", "이미 사용 중인 순서예요.", 409),
      };
    }

    if (finalResult.error || !finalResult.data) {
      return {
        ok: false as const,
        response: fail("INTERNAL_ERROR", "끼니 컬럼 순서를 변경하지 못했어요.", 500),
      };
    }

    if (columnId === targetColumnId) {
      updatedTarget = finalResult.data;
    }
  }

  if (!updatedTarget) {
    return {
      ok: false as const,
      response: fail("INTERNAL_ERROR", "끼니 컬럼 순서를 변경하지 못했어요.", 500),
    };
  }

  return {
    ok: true as const,
    data: updatedTarget,
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const { column_id: columnId } = await context.params;

  if (!isUuid(columnId)) {
    return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  if (!isObjectBody(body)) {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const hasName = Object.hasOwn(body, "name");
  const hasSortOrder = Object.hasOwn(body, "sort_order");

  if (!hasName && !hasSortOrder) {
    return fail("VALIDATION_ERROR", "수정할 값을 입력해주세요.", 422, [
      { field: "body", reason: "no_fields" },
    ]);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as PlannerColumnDbClient;
  const ownedColumnResult = await getOwnedColumn(dbClient, columnId, user.id);

  if (!ownedColumnResult.ok) {
    return ownedColumnResult.response;
  }

  let normalizedName: string | undefined;

  if (hasName) {
    normalizedName = normalizeName(body.name);

    if (!normalizedName) {
      return fail("VALIDATION_ERROR", "컬럼 이름을 입력해주세요.", 422, [
        { field: "name", reason: "required" },
      ]);
    }

    if (normalizedName.length > 30) {
      return fail("VALIDATION_ERROR", "컬럼 이름은 30자를 넘길 수 없어요.", 422, [
        { field: "name", reason: "max_length" },
      ]);
    }
  }

  if (hasSortOrder) {
    const parsedSortOrder = parseSortOrder(body.sort_order);

    if (parsedSortOrder === null) {
      return fail("VALIDATION_ERROR", "sort_order는 0 이상의 정수여야 해요.", 422, [
        { field: "sort_order", reason: "invalid" },
      ]);
    }

    const reorderResult = await reorderColumns(
      dbClient,
      user.id,
      columnId,
      parsedSortOrder,
      normalizedName,
    );

    if (!reorderResult.ok) {
      return reorderResult.response;
    }

    const responseData: PlannerColumnData = {
      id: reorderResult.data.id,
      name: reorderResult.data.name,
      sort_order: reorderResult.data.sort_order,
    };

    return ok(responseData);
  }

  const updateResult = await dbClient
    .from("meal_plan_columns")
    .update({ name: normalizedName })
    .eq("id", columnId)
    .eq("user_id", user.id)
    .select("id, name, sort_order")
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 수정하지 못했어요.", 500);
  }

  const responseData: PlannerColumnData = {
    id: updateResult.data.id,
    name: updateResult.data.name,
    sort_order: updateResult.data.sort_order,
  };

  return ok(responseData);
}

export async function DELETE(_request: Request, context: RouteContext) {
  void _request;

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const { column_id: columnId } = await context.params;

  if (!isUuid(columnId)) {
    return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as PlannerColumnDbClient;
  const ownedColumnResult = await getOwnedColumn(dbClient, columnId, user.id);

  if (!ownedColumnResult.ok) {
    return ownedColumnResult.response;
  }

  const mealsResult = await dbClient
    .from("meals")
    .select("id")
    .eq("column_id", columnId)
    .eq("user_id", user.id)
    .limit(1);

  if (mealsResult.error || !mealsResult.data) {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 삭제하지 못했어요.", 500);
  }

  if (mealsResult.data.length > 0) {
    return fail(
      "COLUMN_HAS_MEALS",
      "식사가 등록된 컬럼은 삭제할 수 없어요. 식사를 먼저 삭제하거나 이동해주세요.",
      409,
    );
  }

  const deleteResult = await dbClient
    .from("meal_plan_columns")
    .delete()
    .eq("id", columnId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (isForeignKeyConflict(deleteResult.error)) {
    return fail(
      "COLUMN_HAS_MEALS",
      "식사가 등록된 컬럼은 삭제할 수 없어요. 식사를 먼저 삭제하거나 이동해주세요.",
      409,
    );
  }

  if (deleteResult.error || !deleteResult.data) {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 삭제하지 못했어요.", 500);
  }

  return new Response(null, { status: 204 });
}
