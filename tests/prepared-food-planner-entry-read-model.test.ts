import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRecipeImageInternalClient: () => null, createRouteHandlerClient, createServiceRoleClient }));
vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_USER_ID = "550e8400-e29b-41d4-a716-446655440009";
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

const malformedEntry = {
  ...entry,
  id: "550e8400-e29b-41d4-a716-446655440005",
  nutrition: {
    ...entry.nutrition,
    values: {
      energy_kcal: {
        amount: "100",
        known_amount: null,
        status: "complete",
        display_mode: "total",
      },
    },
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
  it("keeps an other-user legacy GET empty at the owner boundary", async () => {
    const columns = thenableQuery({ data: [], error: null });
    const meals = thenableQuery({ data: [], error: null });
    const rpc = vi.fn(async (_name: string, args: { p_user_id: string }) => ({
      data: args.p_user_id === USER_ID ? [entry] : [],
      error: null,
    }));
    const from = vi.fn((table: string) => {
      if (table === "meal_plan_columns") return { select: vi.fn(() => columns) };
      if (table === "meals") return { select: vi.fn(() => meals) };
      throw new Error(`unexpected table: ${table}`);
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: OTHER_USER_ID } } })) },
      from,
      rpc,
    });

    const { GET } = await import("@/app/api/v1/planner/route");
    const response = await GET(new NextRequest(
      "http://localhost/api/v1/planner?start_date=2026-07-14&end_date=2026-07-20",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.product_entries).toEqual([]);
    expect(rpc).toHaveBeenCalledWith("list_product_planner_entries", {
      p_user_id: OTHER_USER_ID,
      p_start_date: "2026-07-14",
      p_end_date: "2026-07-20",
      p_column_id: null,
    });
  });

  it("adds a deduped pinned product projection to planner through one bounded RPC", async () => {
    const columns = thenableQuery({
      data: [{ id: COLUMN_ID, name: "아침", sort_order: 0 }],
      error: null,
    });
    const meals = thenableQuery({ data: [], error: null });
    const laterDuplicate = {
      ...entry,
      product_name: "후행 중복 제품",
      nutrition: {
        ...entry.nutrition,
        values: {
          ...entry.nutrition.values,
          energy_kcal: {
            ...entry.nutrition.values.energy_kcal,
            amount: 999,
            known_amount: 999,
          },
        },
      },
    };
    const rpc = vi.fn(async () => ({ data: [entry, laterDuplicate], error: null }));
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

  it("fails the planner read closed when a product RPC row is malformed", async () => {
    const columns = thenableQuery({ data: [], error: null });
    const meals = thenableQuery({ data: [], error: null });
    const rpc = vi.fn(async () => ({ data: [entry, malformedEntry], error: null }));
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

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR", fields: [] },
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

  it("fails the meal slot read closed when a product RPC row is malformed", async () => {
    const column = stateQuery({
      data: { id: COLUMN_ID, user_id: USER_ID, name: "아침" },
      error: null,
    });
    const meals = thenableQuery({ data: [], error: null });
    const rpc = vi.fn(async () => ({ data: [entry, malformedEntry], error: null }));
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

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR", fields: [] },
    });
  });
});


describe("product entry quantity capability negotiation", () => {
  it("exposes DB current policy only when metadata and write negotiation are both explicit", async () => {
    const { parseProductPlannerEntries } = await import("@/lib/server/prepared-food-planner-entry");
    const active = { ...entry, quantity_policy: "quantity-v4" };
    expect(parseProductPlannerEntries([active])).toEqual([entry]);
    expect(parseProductPlannerEntries([active], true)).toEqual([entry]);
    expect(parseProductPlannerEntries([active], true, true)).toEqual([active]);
    expect(parseProductPlannerEntries([{ ...entry, quantity_policy: null }], true, true)).toEqual([entry]);
    expect(parseProductPlannerEntries([entry], true, true)).toEqual([entry]);
    expect(parseProductPlannerEntries([{ ...entry, quantity_policy: "guess" }], true, true)).toBeNull();
  });
});


describe("meal list current DB capability with frozen metadata", () => {
  it.each([
    ["true", true, "quantity-v4", true], ["false", true, "quantity-v4", false],
    ["true", false, "quantity-v4", false], ["true", true, null, false],
  ] as const)("negotiates env%s/header%s/DB%s", async (env, header, policy, enabled) => {
    const quantity_input = { schema_version: "quantity-v4", raw_value: "1", raw_unit: "serving", numerator: "1", denominator: "1", normalized: null, quality: "unavailable", reason: "PRODUCT_PHYSICAL_BASIS_UNAVAILABLE", evidence_ids: [], source_versions: [VERSION_ID], batch_basis: null };
    const column = stateQuery({ data: { id: COLUMN_ID, user_id: USER_ID, name: "아침" }, error: null });
    const meals = thenableQuery({ data: [], error: null });
    createRouteHandlerClient.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      from: vi.fn((table: string) => ({ select: vi.fn(() => table === "meal_plan_columns" ? column : meals) })),
      rpc: vi.fn(async () => ({ data: [{ ...entry, quantity_input, quantity_policy: policy }], error: null })) });
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", env);
    try {
      const { GET } = await import("@/app/api/v1/meals/route"); const headers = new Headers(); if (header) headers.set("X-Homecook-Quantity-Contract", "quantity-v4");
      const response = await GET(new NextRequest(`http://localhost/api/v1/meals?plan_date=2026-07-16&column_id=${COLUMN_ID}`, { headers }));
      expect(response.status).toBe(200); const actual = (await response.json()).data.product_entries[0];
      expect(actual.product_nutrition_version_id).toBe(VERSION_ID); expect(actual.quantity).toEqual(entry.quantity);
      if (enabled) expect(actual.quantity_policy).toBe("quantity-v4"); else expect(actual).not.toHaveProperty("quantity_policy");
      if (header) expect(actual.quantity_input).toEqual(quantity_input); else expect(actual).not.toHaveProperty("quantity_input");
    } finally { vi.unstubAllEnvs(); }
  });
});
