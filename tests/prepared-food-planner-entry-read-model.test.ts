import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient, createServiceRoleClient }));
vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440001";
const VERSION_ID = "550e8400-e29b-41d4-a716-446655440002";
const COLUMN_ID = "550e8400-e29b-41d4-a716-446655440003";
const ENTRY_ID = "550e8400-e29b-41d4-a716-446655440004";

const entry = {
  entry_type: "product",
  id: ENTRY_ID,
  product_id: PRODUCT_ID,
  product_name: "고정 이름",
  product_brand: "고정 브랜드",
  plan_date: "2026-07-16",
  column_id: COLUMN_ID,
  quantity: { amount: 1, unit: "serving" },
  workflow_status: null,
  product_nutrition_version_id: VERSION_ID,
  basis_relations: [],
  nutrition: {
    basis: { amount: 1, unit: "serving" },
    values: {
      energy_kcal: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
    },
    calculation_status: "unavailable",
    calculation_quality: "direct",
    warnings: ["LABEL_MISSING"],
    sources: [],
  },
};

interface QueryResult<T> {
  data: T;
  error: { message: string } | null;
}

function thenableQuery<T>(result: QueryResult<T>) {
  const query = {
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<T>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return query;
}

function stateQuery<T>(result: QueryResult<T | null>) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

beforeEach(() => {
  vi.resetModules();
  delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
  createRouteHandlerClient.mockReset();
  createServiceRoleClient.mockReset().mockReturnValue(null);
  ensurePublicUserRow.mockReset().mockResolvedValue({});
  ensureUserBootstrapState.mockReset().mockResolvedValue({});
});

async function importService() {
  return import("@/lib/server/prepared-food-planner-entry").catch(() => null);
}

describe("prepared food planner entry pinned nutrition projection", () => {
  it("scales observed values while preserving missing values instead of inventing zero", async () => {
    const service = await importService();
    expect(service, "prepared-food-planner-entry projection must exist").not.toBeNull();
    if (!service) return;

    const projected = service.scalePinnedProductNutrition({
      basis: { amount: 1, unit: "serving" },
      values: {
        energy_kcal: { amount: 100, known_amount: null, status: "complete", display_mode: "total" },
        sodium_mg: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
      },
      calculation_status: "partial",
      calculation_quality: "direct",
      warnings: ["LABEL_PARTIAL"],
      sources: [{ provider: "user_label", dataset: null, source_version: null, data_basis_date: null, license: null, source_url: null }],
    }, 2, { amount: 2, unit: "serving" });

    expect(projected.values.energy_kcal.amount).toBe(200);
    expect(projected.values.sodium_mg).toEqual({
      amount: null,
      known_amount: null,
      status: "unavailable",
      display_mode: null,
    });
    expect(projected.calculation_status).toBe("partial");
    expect(projected.warnings).toEqual(["LABEL_PARTIAL"]);
  });

  it("scales partial known amounts and preserves pinned quality, warnings and sources", async () => {
    const service = await importService();
    expect(service).not.toBeNull();
    if (!service) return;

    const sources = [{ provider: "MFDS", dataset: "approved", source_version: "v1", data_basis_date: null, license: "public", source_url: "https://example.test" }];
    const projected = service.scalePinnedProductNutrition({
      basis: { amount: 100, unit: "g" },
      values: {
        energy_kcal: { amount: null, known_amount: 80, status: "partial", display_mode: "minimum" },
      },
      calculation_status: "partial",
      calculation_quality: "mixed",
      warnings: ["MISSING_LABEL_VALUE"],
      sources,
    }, 0.5, { amount: 50, unit: "g" });

    expect(projected.values.energy_kcal).toEqual({
      amount: null,
      known_amount: 40,
      status: "partial",
      display_mode: "minimum",
    });
    expect(projected.calculation_quality).toBe("mixed");
    expect(projected.sources).toEqual(sources);
  });
});

describe("prepared food planner entry existing read projections", () => {
  it("adds a deduped pinned product projection to planner through one bounded RPC", async () => {
    const columns = thenableQuery({
      data: [{ id: COLUMN_ID, name: "아침", sort_order: 0 }],
      error: null,
    });
    const meals = thenableQuery({ data: [], error: null });
    const rpc = vi.fn(async () => ({ data: [entry, entry], error: null }));
    const from = vi.fn((table: string) => {
      if (table === "meal_plan_columns") return { select: vi.fn(() => columns) };
      if (table === "meals") return { select: vi.fn(() => meals) };
      throw new Error(`unexpected table: ${table}`);
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      from,
      rpc,
    });

    const { GET } = await import("@/app/api/v1/planner/route");
    const response = await GET(new NextRequest(
      "http://localhost/api/v1/planner?start_date=2026-07-14&end_date=2026-07-20",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.meals).toEqual([]);
    expect(body.data.product_entries).toEqual([entry]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("list_product_planner_entries", {
      p_user_id: USER_ID,
      p_start_date: "2026-07-14",
      p_end_date: "2026-07-20",
      p_column_id: null,
    });
  });

  it("adds only slot-scoped product shape to meals while recipe items stay unchanged", async () => {
    const column = stateQuery({
      data: { id: COLUMN_ID, user_id: USER_ID, name: "아침" },
      error: null,
    });
    const meals = thenableQuery({ data: [], error: null });
    const rpc = vi.fn(async () => ({ data: [entry, entry], error: null }));
    const from = vi.fn((table: string) => {
      if (table === "meal_plan_columns") return { select: vi.fn(() => column) };
      if (table === "meals") return { select: vi.fn(() => meals) };
      throw new Error(`unexpected table: ${table}`);
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      from,
      rpc,
    });

    const { GET } = await import("@/app/api/v1/meals/route");
    const response = await GET(new NextRequest(
      `http://localhost/api/v1/meals?plan_date=2026-07-16&column_id=${COLUMN_ID}`,
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([]);
    expect(body.data.product_entries).toHaveLength(1);
    expect(body.data.product_entries[0]).toMatchObject({
      id: ENTRY_ID,
      product_name: "고정 이름",
      workflow_status: null,
    });
    expect(body.data.product_entries[0]).not.toHaveProperty("plan_date");
    expect(body.data.product_entries[0]).not.toHaveProperty("column_id");
    expect(body.data.product_entries[0]).not.toHaveProperty("status");
    expect(body.data.product_entries[0]).not.toHaveProperty("recipe_id");
    expect(body.data.product_entries[0]).not.toHaveProperty("shopping_list_id");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("list_product_planner_entries", {
      p_user_id: USER_ID,
      p_start_date: "2026-07-16",
      p_end_date: "2026-07-16",
      p_column_id: COLUMN_ID,
    });
  });
});
