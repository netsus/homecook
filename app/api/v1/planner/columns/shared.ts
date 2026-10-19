import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { PlannerColumnData } from "@/types/planner";

export type PlannerColumnRow = {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

// Only the table consumed here; owned deletion remains the existing atomic RPC.
export type PlannerColumnsDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      meal_plan_columns: {
        Row: PlannerColumnRow;
        Insert: PlannerColumnRow;
        Update: Partial<Pick<PlannerColumnRow, "name" | "sort_order">>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      delete_owned_planner_column: {
        Args: { p_user_id: string; p_column_id: string }; Returns: unknown;
      };
    };
  };
}>, "from" | "rpc">;

const PLANNER_COLUMN_NAME_MAX_LENGTH = 30;
export const PLANNER_COLUMN_MAX_COUNT = 5;
export const PLANNER_COLUMN_MIN_COUNT = 1;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function normalizePlannerColumnName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validatePlannerColumnName(name: string) {
  if (!name) {
    return [{ field: "name", reason: "required" }];
  }

  if (name.length > PLANNER_COLUMN_NAME_MAX_LENGTH) {
    return [{ field: "name", reason: "max_length" }];
  }

  return [];
}

function isRequestRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function readPlannerColumnName(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      response: fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
        { field: "body", reason: "invalid_json" },
      ]),
      name: null,
    };
  }

  if (!isRequestRecord(body)) {
    return {
      response: fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
        { field: "body", reason: "invalid_object" },
      ]),
      name: null,
    };
  }

  const name = normalizePlannerColumnName(body.name);
  const fields = validatePlannerColumnName(name);

  if (fields.length > 0) {
    return {
      response: fail("VALIDATION_ERROR", "끼니 이름을 확인해 주세요.", 422, fields),
      name: null,
    };
  }

  return {
    response: null,
    name,
  };
}

export async function readPlannerColumnPatch(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      response: fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
        { field: "body", reason: "invalid_json" },
      ]),
      patch: null,
    };
  }

  if (!isRequestRecord(body)) {
    return {
      response: fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
        { field: "body", reason: "invalid_object" },
      ]),
      patch: null,
    };
  }

  const patch: { name?: string; sort_order?: number } = {};
  const fields: Array<{ field: string; reason: string }> = [];

  if ("name" in body) {
    const name = normalizePlannerColumnName(body.name);
    fields.push(...validatePlannerColumnName(name));
    patch.name = name;
  }

  if ("sort_order" in body) {
    if (
      typeof body.sort_order !== "number" ||
      !Number.isInteger(body.sort_order) ||
      body.sort_order < 0
    ) {
      fields.push({ field: "sort_order", reason: "invalid_integer" });
    } else {
      patch.sort_order = body.sort_order;
    }
  }

  if (!("name" in patch) && !("sort_order" in patch)) {
    fields.push({ field: "body", reason: "no_changes" });
  }

  if (fields.length > 0) {
    return {
      response: fail("VALIDATION_ERROR", "끼니 정보를 확인해 주세요.", 422, fields),
      patch: null,
    };
  }

  return {
    response: null,
    patch,
  };
}

export function toPlannerColumnData(column: PlannerColumnRow): PlannerColumnData {
  return {
    id: column.id,
    name: column.name,
    sort_order: column.sort_order,
  };
}

export function sortPlannerColumnRows(columns: PlannerColumnRow[]) {
  return [...columns].sort((left, right) => {
    if (left.sort_order === right.sort_order) {
      return left.id.localeCompare(right.id);
    }

    return left.sort_order - right.sort_order;
  });
}

export function getNextSortOrder(columns: PlannerColumnRow[]) {
  if (columns.length === 0) {
    return 0;
  }

  return columns.reduce((maxValue, column) => Math.max(maxValue, column.sort_order), -1) + 1;
}

export function hasDuplicateColumnName({
  columns,
  name,
  exceptColumnId,
}: {
  columns: PlannerColumnRow[];
  name: string;
  exceptColumnId?: string;
}) {
  return columns.some((column) =>
    column.id !== exceptColumnId && column.name.trim() === name);
}

export async function createAuthedPlannerColumnsClient(fallbackMessage: string) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return {
      response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
      dbClient: null,
      user: null,
    };
  }

  const dbClient: PlannerColumnsDbClient = routeClient;

  try {
    await ensurePublicUserRow(routeClient, user);
    await ensureUserBootstrapState(routeClient, user.id);
  } catch (bootstrapError) {
    return {
      response: fail(
        "INTERNAL_ERROR",
        formatBootstrapErrorMessage(bootstrapError, fallbackMessage),
        500,
      ),
      dbClient: null,
      user: null,
    };
  }

  return {
    response: null,
    dbClient,
    user,
  };
}

export async function listOwnedPlannerColumns(
  dbClient: PlannerColumnsDbClient,
  userId: string,
) {
  const result = await dbClient
    .from("meal_plan_columns")
    .select("id, user_id, name, sort_order, created_at")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "meal_plan_columns select failed");
  }

  return result.data;
}

export async function findPlannerColumnById(
  dbClient: PlannerColumnsDbClient,
  columnId: string,
) {
  const result = await dbClient
    .from("meal_plan_columns")
    .select("id, user_id, name, sort_order, created_at")
    .eq("id", columnId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}
