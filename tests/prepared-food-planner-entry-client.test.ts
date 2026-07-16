// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFoodProduct,
  fetchFoodProducts,
} from "@/lib/api/food-product";
import {
  createProductPlannerEntry,
  deleteProductPlannerEntry,
  updateProductPlannerEntryQuantity,
} from "@/lib/api/product-planner-entry";

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

const fetchMock = vi.fn();

function successResponse(data: unknown, status = 200) {
  return {
    ok: true,
    status,
    json: vi.fn(async () => ({ success: true, data, error: null })),
  };
}

describe("prepared food planner frontend clients", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the opaque food-product cursor through without interpreting it", async () => {
    fetchMock.mockResolvedValue(
      successResponse({ items: [], next_cursor: null, has_next: false }),
    );

    await fetchFoodProducts({ q: "플레인 요거트", cursor: "opaque+/=", limit: 20 });

    const [requestPath] = fetchMock.mock.calls[0] as [string];
    const requestUrl = new URL(requestPath, "http://homecook.local");
    expect(requestUrl.pathname).toBe("/api/v1/food-products");
    expect(requestUrl.searchParams.get("q")).toBe("플레인 요거트");
    expect(requestUrl.searchParams.get("cursor")).toBe("opaque+/=");
    expect(requestUrl.searchParams.get("limit")).toBe("20");
  });

  it("creates a private manual product with official fields only", async () => {
    const body = {
      name: "내 요거트",
      brand: null,
      nutrition: {
        basis: { amount: 1, unit: "serving" as const },
        values: { energy_kcal: 0, protein_g: null },
      },
    };
    fetchMock.mockResolvedValue(successResponse({ product: { id: "product-1" } }, 201));

    await createFoodProduct(body);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/food-products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  it("uses only the three official product-entry mutation requests", async () => {
    const createBody = {
      product_id: "00000000-0000-4000-8000-000000000001",
      plan_date: "2026-07-17",
      column_id: "00000000-0000-4000-8000-000000000002",
      quantity: { amount: 1, unit: "serving" as const },
    };
    fetchMock
      .mockResolvedValueOnce(successResponse({ entry: { id: "entry-1" } }, 201))
      .mockResolvedValueOnce(successResponse({ entry: { id: "entry-1" } }))
      .mockResolvedValueOnce(successResponse({ deleted: true, entry_id: "entry-1" }));

    await createProductPlannerEntry(createBody);
    await updateProductPlannerEntryQuantity("entry-1", {
      quantity: { amount: 150, unit: "g" },
    });
    await deleteProductPlannerEntry("entry-1");

    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([
      ["/api/v1/product-planner-entries", "POST"],
      ["/api/v1/product-planner-entries/entry-1", "PATCH"],
      ["/api/v1/product-planner-entries/entry-1", "DELETE"],
    ]);
  });

  it("preserves official error status, code, fields, and message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: vi.fn(async () => ({
        success: false,
        data: null,
        error: {
          code: "NUTRITION_BASIS_MISMATCH",
          message: "이 수량 단위로 영양을 계산할 수 없어요.",
          fields: [{ field: "quantity.unit", reason: "basis_mismatch" }],
        },
      })),
    });

    await expect(
      updateProductPlannerEntryQuantity("entry-1", {
        quantity: { amount: 1, unit: "ml" },
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: "NUTRITION_BASIS_MISMATCH",
      fields: [{ field: "quantity.unit", reason: "basis_mismatch" }],
      message: "이 수량 단위로 영양을 계산할 수 없어요.",
    });
  });
});
