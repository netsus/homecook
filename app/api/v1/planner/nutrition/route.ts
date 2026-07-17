import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
import {
  readPlannerNutritionSummary,
  type PlannerNutritionDbClient,
} from "@/lib/server/planner-nutrition-summary";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_QUERY_FIELDS = new Set(["start_date", "end_date"]);

function isValidDateString(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function inclusiveDayCount(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

function parseDateRange(request: NextRequest) {
  const fields: Array<{ field: string; reason: string }> = [];
  const params = request.nextUrl.searchParams;
  const unexpected = [...new Set(params.keys())]
    .filter((field) => !ALLOWED_QUERY_FIELDS.has(field))
    .sort();
  fields.push(...unexpected.map((field) => ({ field, reason: "unexpected" })));

  const startValues = params.getAll("start_date");
  const endValues = params.getAll("end_date");
  const startDate = startValues[0] ?? "";
  const endDate = endValues[0] ?? "";
  if (startValues.length !== 1 || !isValidDateString(startDate)) {
    fields.push({ field: "start_date", reason: startValues.length > 1 ? "duplicate" : "invalid_date" });
  }
  if (endValues.length !== 1 || !isValidDateString(endDate)) {
    fields.push({ field: "end_date", reason: endValues.length > 1 ? "duplicate" : "invalid_date" });
  }

  if (fields.length === 0 && startDate > endDate) {
    fields.push({ field: "date_range", reason: "start_after_end" });
  } else if (fields.length === 0 && inclusiveDayCount(startDate, endDate) > 7) {
    fields.push({ field: "date_range", reason: "maximum_seven_days" });
  }

  if (fields.length > 0) return { ok: false as const, fields };
  return { ok: true as const, startDate, endDate };
}

export async function GET(request: NextRequest) {
  const range = parseDateRange(request);
  if (!range.ok) {
    return fail("VALIDATION_ERROR", "날짜 범위를 확인해 주세요.", 422, range.fields);
  }

  try {
    const routeClient = await createRouteHandlerClient();
    const authResult = await routeClient.auth.getUser();
    const user = authResult.data.user;
    if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);

    const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
      PlannerNutritionDbClient;
    const data = await readPlannerNutritionSummary(dbClient, user.id, {
      startDate: range.startDate,
      endDate: range.endDate,
    });
    return ok(data);
  } catch {
    return fail("INTERNAL_ERROR", "계획 영양을 불러오지 못했어요.", 500);
  }
}
