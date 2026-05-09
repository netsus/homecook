import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import {
  deleteQaFixturePlannerColumn,
  isQaFixtureModeEnabled,
  updateQaFixturePlannerColumn,
} from "@/lib/mock/recipes";
import type { PlannerColumnDeleteData, PlannerColumnMutationData } from "@/types/planner";

import {
  createAuthedPlannerColumnsClient,
  findPlannerColumnById,
  hasDuplicateColumnName,
  isUuid,
  listOwnedPlannerColumns,
  PLANNER_COLUMN_MIN_COUNT,
  readPlannerColumnName,
  sortPlannerColumnRows,
  toPlannerColumnData,
} from "../shared";

interface RouteContext {
  params: Promise<{
    column_id: string;
  }>;
}

async function readColumnId(context: RouteContext) {
  const { column_id: columnId } = await context.params;
  return columnId;
}

export async function PATCH(request: Request, context: RouteContext) {
  const columnId = await readColumnId(context);

  if (!isUuid(columnId)) {
    return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
  }

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

    const updateResult = updateQaFixturePlannerColumn(columnId, { name: parsedBody.name });

    if (!updateResult.ok) {
      return fail(updateResult.code, updateResult.message, updateResult.status);
    }

    return ok({
      column: updateResult.data,
    } satisfies PlannerColumnMutationData);
  }

  const auth = await createAuthedPlannerColumnsClient("끼니 컬럼을 수정하지 못했어요.");

  if (auth.response) {
    return auth.response;
  }

  if (!auth.dbClient || !auth.user) {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 수정하지 못했어요.", 500);
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
    const targetColumn = await findPlannerColumnById(auth.dbClient, columnId);

    if (!targetColumn) {
      return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
    }

    if (targetColumn.user_id !== auth.user.id) {
      return fail("FORBIDDEN", "내 끼니 컬럼만 수정할 수 있어요.", 403);
    }

    const columns = await listOwnedPlannerColumns(auth.dbClient, auth.user.id);

    if (hasDuplicateColumnName({
      columns,
      name: parsedBody.name,
      exceptColumnId: columnId,
    })) {
      return fail("COLUMN_NAME_DUPLICATE", "이미 있는 끼니 이름이에요.", 409);
    }

    const updateResult = await auth.dbClient
      .from("meal_plan_columns")
      .update({ name: parsedBody.name })
      .eq("id", columnId)
      .select("id, user_id, name, sort_order, created_at")
      .maybeSingle();

    if (updateResult.error || !updateResult.data) {
      return fail("INTERNAL_ERROR", "끼니 컬럼을 수정하지 못했어요.", 500);
    }

    return ok({
      column: toPlannerColumnData(updateResult.data),
    } satisfies PlannerColumnMutationData);
  } catch {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 수정하지 못했어요.", 500);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const columnId = await readColumnId(context);

  if (!isUuid(columnId)) {
    return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
  }

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    const deleteResult = deleteQaFixturePlannerColumn(columnId);

    if (!deleteResult.ok) {
      return fail(deleteResult.code, deleteResult.message, deleteResult.status);
    }

    return ok({ deleted: true } satisfies PlannerColumnDeleteData);
  }

  const auth = await createAuthedPlannerColumnsClient("끼니 컬럼을 삭제하지 못했어요.");

  if (auth.response) {
    return auth.response;
  }

  if (!auth.dbClient || !auth.user) {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 삭제하지 못했어요.", 500);
  }

  try {
    const targetColumn = await findPlannerColumnById(auth.dbClient, columnId);

    if (!targetColumn) {
      return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
    }

    if (targetColumn.user_id !== auth.user.id) {
      return fail("FORBIDDEN", "내 끼니 컬럼만 삭제할 수 있어요.", 403);
    }

    const columns = await listOwnedPlannerColumns(auth.dbClient, auth.user.id);

    if (columns.length <= PLANNER_COLUMN_MIN_COUNT) {
      return fail("MIN_COLUMN_REQUIRED", "끼니 컬럼은 최소 1개가 필요해요.", 409);
    }

    const mealsResult = await auth.dbClient
      .from("meals")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("column_id", columnId)
      .limit(1);

    if (mealsResult.error || !mealsResult.data) {
      return fail("INTERNAL_ERROR", "끼니 컬럼을 삭제하지 못했어요.", 500);
    }

    if (mealsResult.data.length > 0) {
      return fail("COLUMN_HAS_MEALS", "식사가 등록된 컬럼은 삭제할 수 없어요.", 409);
    }

    const remainingColumns = sortPlannerColumnRows(
      columns.filter((column) => column.id !== columnId),
    );

    const deleteResult = await auth.dbClient
      .from("meal_plan_columns")
      .delete()
      .eq("id", columnId);

    if (deleteResult.error) {
      return fail("INTERNAL_ERROR", "끼니 컬럼을 삭제하지 못했어요.", 500);
    }

    for (const [sortOrder, column] of remainingColumns.entries()) {
      if (column.sort_order === sortOrder) {
        continue;
      }

      const reorderResult = await auth.dbClient
        .from("meal_plan_columns")
        .update({ sort_order: sortOrder })
        .eq("id", column.id);

      if (reorderResult.error) {
        await restorePlannerColumnDelete({
          dbClient: auth.dbClient,
          deletedColumn: targetColumn,
          originalColumns: columns,
        });

        return fail("INTERNAL_ERROR", "끼니 컬럼을 삭제하지 못했어요.", 500);
      }
    }

    return ok({ deleted: true } satisfies PlannerColumnDeleteData);
  } catch {
    return fail("INTERNAL_ERROR", "끼니 컬럼을 삭제하지 못했어요.", 500);
  }
}

async function restorePlannerColumnDelete({
  dbClient,
  deletedColumn,
  originalColumns,
}: {
  dbClient: Parameters<typeof findPlannerColumnById>[0];
  deletedColumn: NonNullable<Awaited<ReturnType<typeof findPlannerColumnById>>>;
  originalColumns: NonNullable<Awaited<ReturnType<typeof listOwnedPlannerColumns>>>;
}) {
  for (const column of originalColumns) {
    if (column.id === deletedColumn.id) {
      continue;
    }

    await dbClient
      .from("meal_plan_columns")
      .update({ sort_order: column.sort_order })
      .eq("id", column.id);
  }

  await dbClient
    .from("meal_plan_columns")
    .insert({
      id: deletedColumn.id,
      user_id: deletedColumn.user_id,
      name: deletedColumn.name,
      sort_order: deletedColumn.sort_order,
      created_at: deletedColumn.created_at,
    })
    .select("id, user_id, name, sort_order, created_at")
    .maybeSingle();
}
