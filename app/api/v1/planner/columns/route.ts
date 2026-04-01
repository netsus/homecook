import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import { createQaFixturePlannerColumn, isQaFixtureModeEnabled } from "@/lib/mock/recipes";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { PlannerColumnCreateBody, PlannerColumnData } from "@/types/planner";

interface QueryError {
  code?: string;
  message: string;
}

interface QueryOrderOption {
  ascending: boolean;
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

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

type MaybeSingleQueryResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface PlannerColumnsSelectQuery {
  eq(column: string, value: string): PlannerColumnsSelectQuery;
  order(column: string, options: QueryOrderOption): PlannerColumnsSelectQuery;
  then: ArrayQueryResult<PlannerColumnSortRow>["then"];
}

interface PlannerColumnsInsertQuery {
  select(columns: string): PlannerColumnsInsertQuery;
  maybeSingle(): MaybeSingleQueryResult<PlannerColumnRow>;
}

interface PlannerColumnsTable {
  select(columns: string): PlannerColumnsSelectQuery;
  insert(values: {
    user_id: string;
    name: string;
    sort_order: number;
  }): PlannerColumnsInsertQuery;
}

interface PlannerColumnsDbClient {
  from(table: "meal_plan_columns"): PlannerColumnsTable;
}

function normalizeColumnName(name: unknown) {
  return typeof name === "string" ? name.trim() : "";
}

function isObjectBody(value: unknown): value is PlannerColumnCreateBody {
  return typeof value === "object" && value !== null;
}

function isDuplicateKeyConflict(error: QueryError | null) {
  if (!error) {
    return false;
  }

  return error.code === "23505" || error.message.toLowerCase().includes("duplicate key");
}

function getNextSortOrder(rows: PlannerColumnSortRow[] | null) {
  if (!rows || rows.length === 0) {
    return 0;
  }

  return rows.reduce((maxValue, row) => Math.max(maxValue, row.sort_order), -1) + 1;
}

export async function POST(request: Request) {
  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }
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

  const normalizedName = normalizeColumnName(body.name);

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

  if (isQaFixtureModeEnabled()) {
    const createResult = createQaFixturePlannerColumn(normalizedName);

    if (!createResult.ok) {
      return fail(createResult.code, createResult.message, createResult.status);
    }

    return ok(createResult.data, { status: 201 });
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as PlannerColumnsDbClient;
  const columnsResult = await dbClient
    .from("meal_plan_columns")
    .select("id, sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false });

  if (columnsResult.error || !columnsResult.data) {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 추가하지 못했어요.", 500);
  }

  if (columnsResult.data.length >= 5) {
    return fail("MAX_COLUMNS_REACHED", "최대 5개까지 추가할 수 있어요", 409);
  }

  const nextSortOrder = getNextSortOrder(columnsResult.data);
  const createResult = await dbClient
    .from("meal_plan_columns")
    .insert({
      user_id: user.id,
      name: normalizedName,
      sort_order: nextSortOrder,
    })
    .select("id, name, sort_order")
    .maybeSingle();

  if (isDuplicateKeyConflict(createResult.error)) {
    return fail("MAX_COLUMNS_REACHED", "최대 5개까지 추가할 수 있어요", 409);
  }

  if (createResult.error || !createResult.data) {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 추가하지 못했어요.", 500);
  }

  const responseData: PlannerColumnData = {
    id: createResult.data.id,
    name: createResult.data.name,
    sort_order: createResult.data.sort_order,
  };

  return ok(responseData, { status: 201 });
}
