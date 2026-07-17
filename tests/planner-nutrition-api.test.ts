import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const readPlannerNutritionSummary = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const getQaFixturePlannerNutrition = vi.fn();
const isQaFixtureModeEnabled = vi.fn();
const readE2EAuthOverrideHeader = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient, createServiceRoleClient }));
vi.mock("@/lib/server/planner-nutrition-summary", () => ({ readPlannerNutritionSummary }));
vi.mock("@/lib/mock/recipes", () => ({
  getQaFixturePlannerNutrition,
  isQaFixtureModeEnabled,
}));
vi.mock("@/lib/auth/e2e-auth-override", () => ({ readE2EAuthOverrideHeader }));
vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
}));

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const EMPTY_NUTRITION = {
  basis: { amount: 1, unit: "range" },
  values: {
    energy_kcal: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
    carbohydrate_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
    protein_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
    fat_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
    sodium_mg: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
  },
  calculation_status: "unavailable",
  calculation_quality: null,
  incomplete_entry_count: 0,
  warnings: [],
  sources: [],
};

beforeEach(() => {
  vi.resetModules();
  createRouteHandlerClient.mockReset().mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } } })) },
  });
  createServiceRoleClient.mockReset().mockReturnValue(null);
  readPlannerNutritionSummary.mockReset().mockResolvedValue({
    range: { start_date: "2026-07-17", end_date: "2026-07-17" },
    summary: { nutrition: EMPTY_NUTRITION, recipe_entry_count: 0, product_entry_count: 0 },
    days: [{ plan_date: "2026-07-17", nutrition: EMPTY_NUTRITION, columns: [] }],
  });
  ensurePublicUserRow.mockReset();
  ensureUserBootstrapState.mockReset();
  getQaFixturePlannerNutrition.mockReset();
  isQaFixtureModeEnabled.mockReset().mockReturnValue(false);
  readE2EAuthOverrideHeader.mockReset();
});

async function request(query: string) {
  const { GET } = await import("@/app/api/v1/planner/nutrition/route");
  return GET(new NextRequest(`http://localhost/api/v1/planner/nutrition${query}`));
}

describe("GET /api/v1/planner/nutrition", () => {
  it("returns the exact read-only QA fixture response without opening a database client", async () => {
    const fixture = {
      range: { start_date: "2026-07-17", end_date: "2026-07-17" },
      summary: { nutrition: EMPTY_NUTRITION, recipe_entry_count: 1, product_entry_count: 1 },
      days: [{ plan_date: "2026-07-17", nutrition: EMPTY_NUTRITION, columns: [] }],
    };
    isQaFixtureModeEnabled.mockReturnValue(true);
    readE2EAuthOverrideHeader.mockReturnValue("authenticated");
    getQaFixturePlannerNutrition.mockReturnValue(fixture);

    const response = await request("?start_date=2026-07-17&end_date=2026-07-17");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: fixture, error: null });
    expect(getQaFixturePlannerNutrition).toHaveBeenCalledWith("2026-07-17", "2026-07-17");
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(readPlannerNutritionSummary).not.toHaveBeenCalled();
  });

  it("keeps QA fixture nutrition behind the existing authenticated override", async () => {
    isQaFixtureModeEnabled.mockReturnValue(true);
    readE2EAuthOverrideHeader.mockReturnValue("guest");

    const response = await request("?start_date=2026-07-17&end_date=2026-07-17");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] },
    });
    expect(getQaFixturePlannerNutrition).not.toHaveBeenCalled();
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it.each([
    ["missing start", "?end_date=2026-07-17", "start_date"],
    ["invalid date", "?start_date=2026-02-30&end_date=2026-03-01", "start_date"],
    ["reversed", "?start_date=2026-07-18&end_date=2026-07-17", "date_range"],
    ["over seven days", "?start_date=2026-07-10&end_date=2026-07-17", "date_range"],
    ["unexpected query", "?start_date=2026-07-17&end_date=2026-07-17&column_id=x", "column_id"],
    ["duplicate query", "?start_date=2026-07-17&start_date=2026-07-18&end_date=2026-07-18", "start_date"],
  ])("returns existing 422 validation envelope for %s", async (_name, query, field) => {
    const response = await request(query);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "날짜 범위를 확인해 주세요.",
        fields: expect.arrayContaining([expect.objectContaining({ field })]),
      },
    });
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
    expect(readPlannerNutritionSummary).not.toHaveBeenCalled();
  });

  it("returns the existing 401 envelope without a read", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const response = await request("?start_date=2026-07-17&end_date=2026-07-17");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] },
    });
    expect(readPlannerNutritionSummary).not.toHaveBeenCalled();
  });

  it("returns the exact success envelope and never bootstraps or writes", async () => {
    const serviceClient = { name: "service-client" };
    createServiceRoleClient.mockReturnValue(serviceClient);

    const response = await request("?start_date=2026-07-17&end_date=2026-07-17");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["data", "error", "success"]);
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    expect(Object.keys(body.data).sort()).toEqual(["days", "range", "summary"]);
    expect(Object.keys(body.data.summary).sort()).toEqual([
      "nutrition",
      "product_entry_count",
      "recipe_entry_count",
    ]);
    expect(Object.keys(body.data.summary.nutrition).sort()).toEqual([
      "basis",
      "calculation_quality",
      "calculation_status",
      "incomplete_entry_count",
      "sources",
      "values",
      "warnings",
    ]);
    expect(body.data.summary.nutrition).not.toHaveProperty("availability_reason");
    expect(body.data.summary.nutrition).not.toHaveProperty("base_servings");
    expect(body.data.summary.nutrition).not.toHaveProperty("snapshot_id");
    expect(readPlannerNutritionSummary).toHaveBeenCalledWith(serviceClient, USER_ID, {
      startDate: "2026-07-17",
      endDate: "2026-07-17",
    });
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("returns a generic existing 500 envelope without leaking read details", async () => {
    readPlannerNutritionSummary.mockRejectedValue(new Error("secret database detail"));

    const response = await request("?start_date=2026-07-17&end_date=2026-07-17");
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "계획 영양을 불러오지 못했어요.",
        fields: [],
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret database detail");
  });
});
