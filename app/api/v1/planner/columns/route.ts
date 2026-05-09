import { NextRequest } from "next/server";

import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import {
  createQaFixturePlannerColumn,
  getQaFixturePlannerColumns,
  isQaFixtureModeEnabled,
} from "@/lib/mock/recipes";
import type { PlannerColumnMutationData, PlannerColumnsData } from "@/types/planner";

import {
  createAuthedPlannerColumnsClient,
  getNextSortOrder,
  hasDuplicateColumnName,
  listOwnedPlannerColumns,
  PLANNER_COLUMN_MAX_COUNT,
  readPlannerColumnName,
  toPlannerColumnData,
} from "./shared";

export async function GET(request: NextRequest) {
  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    return ok({
      columns: getQaFixturePlannerColumns(),
    } satisfies PlannerColumnsData);
  }

  const auth = await createAuthedPlannerColumnsClient("끼니 컬럼을 불러오지 못했어요.");

  if (auth.response) {
    return auth.response;
  }

  if (!auth.dbClient || !auth.user) {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 불러오지 못했어요.", 500);
  }

  try {
    const columns = await listOwnedPlannerColumns(auth.dbClient, auth.user.id);

    return ok({
      columns: columns.map(toPlannerColumnData),
    } satisfies PlannerColumnsData);
  } catch {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 불러오지 못했어요.", 500);
  }
}

export async function POST(request: Request) {
  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    const parsedBody = await readPlannerColumnName(request);

    if (parsedBody.response) {
      return parsedBody.response;
    }

    if (!parsedBody.name) {
      return fail("VALIDATION_ERROR", "끼니 이름을 확인해주세요.", 422, [
        { field: "name", reason: "required" },
      ]);
    }

    const createResult = createQaFixturePlannerColumn(parsedBody.name);

    if (!createResult.ok) {
      return fail(createResult.code, createResult.message, createResult.status);
    }

    return ok({ column: createResult.data } satisfies PlannerColumnMutationData, { status: 201 });
  }

  const auth = await createAuthedPlannerColumnsClient("끼니 컬럼을 추가하지 못했어요.");

  if (auth.response) {
    return auth.response;
  }

  if (!auth.dbClient || !auth.user) {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 추가하지 못했어요.", 500);
  }

  const parsedBody = await readPlannerColumnName(request);

  if (parsedBody.response) {
    return parsedBody.response;
  }

  if (!parsedBody.name) {
    return fail("VALIDATION_ERROR", "끼니 이름을 확인해주세요.", 422, [
      { field: "name", reason: "required" },
    ]);
  }

  try {
    const columns = await listOwnedPlannerColumns(auth.dbClient, auth.user.id);

    if (columns.length >= PLANNER_COLUMN_MAX_COUNT) {
      return fail("COLUMN_LIMIT_REACHED", "끼니 컬럼은 최대 5개까지 만들 수 있어요.", 409);
    }

    if (hasDuplicateColumnName({ columns, name: parsedBody.name })) {
      return fail("COLUMN_NAME_DUPLICATE", "이미 있는 끼니 이름이에요.", 409);
    }

    const insertResult = await auth.dbClient
      .from("meal_plan_columns")
      .insert({
        id: crypto.randomUUID(),
        user_id: auth.user.id,
        name: parsedBody.name,
        sort_order: getNextSortOrder(columns),
        created_at: new Date().toISOString(),
      })
      .select("id, user_id, name, sort_order, created_at")
      .maybeSingle();

    if (insertResult.error || !insertResult.data) {
      return fail("INTERNAL_ERROR", "끼니 컬럼을 추가하지 못했어요.", 500);
    }

    return ok({
      column: toPlannerColumnData(insertResult.data),
    } satisfies PlannerColumnMutationData, { status: 201 });
  } catch {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 추가하지 못했어요.", 500);
  }
}
