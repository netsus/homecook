import { describe, expect, it } from "vitest";

async function importService() {
  return import("@/lib/server/prepared-food-planner-entry").catch(() => null);
}

describe("prepared food planner entry service contract", () => {
  it("accepts only the official create body and a positive supported quantity", async () => {
    const service = await importService();
    expect(service, "prepared-food-planner-entry service must exist").not.toBeNull();
    if (!service) return;

    expect(service.parseProductPlannerEntryCreateBody({
      product_id: "550e8400-e29b-41d4-a716-446655440001",
      plan_date: "2026-07-16",
      column_id: "550e8400-e29b-41d4-a716-446655440002",
      quantity: { amount: 1, unit: "serving" },
    })).toMatchObject({ ok: true });

    expect(service.parseProductPlannerEntryCreateBody({
      product_id: "550e8400-e29b-41d4-a716-446655440001",
      plan_date: "2026-07-16",
      column_id: "550e8400-e29b-41d4-a716-446655440002",
      quantity: { amount: 1, unit: "serving" },
      status: "registered",
    })).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "status", reason: "unexpected" }],
    });
  });

  it.each([
    ["invalid product UUID", {
      product_id: "product-1",
      plan_date: "2026-07-16",
      column_id: "550e8400-e29b-41d4-a716-446655440002",
      quantity: { amount: 1, unit: "serving" },
    }, "product_id"],
    ["invalid calendar date", {
      product_id: "550e8400-e29b-41d4-a716-446655440001",
      plan_date: "2026-02-30",
      column_id: "550e8400-e29b-41d4-a716-446655440002",
      quantity: { amount: 1, unit: "serving" },
    }, "plan_date"],
    ["non-positive quantity", {
      product_id: "550e8400-e29b-41d4-a716-446655440001",
      plan_date: "2026-07-16",
      column_id: "550e8400-e29b-41d4-a716-446655440002",
      quantity: { amount: 0, unit: "serving" },
    }, "quantity.amount"],
    ["quantity rounded to zero at database precision", {
      product_id: "550e8400-e29b-41d4-a716-446655440001",
      plan_date: "2026-07-16",
      column_id: "550e8400-e29b-41d4-a716-446655440002",
      quantity: { amount: 0.00001, unit: "g" },
    }, "quantity.amount"],
    ["numeric overflow", {
      product_id: "550e8400-e29b-41d4-a716-446655440001",
      plan_date: "2026-07-16",
      column_id: "550e8400-e29b-41d4-a716-446655440002",
      quantity: { amount: 100_000_000, unit: "g" },
    }, "quantity.amount"],
    ["unsupported unit", {
      product_id: "550e8400-e29b-41d4-a716-446655440001",
      plan_date: "2026-07-16",
      column_id: "550e8400-e29b-41d4-a716-446655440002",
      quantity: { amount: 1, unit: "cup" },
    }, "quantity.unit"],
  ])("rejects %s", async (_label, body, field) => {
    const service = await importService();
    expect(service).not.toBeNull();
    if (!service) return;
    expect(service.parseProductPlannerEntryCreateBody(body)).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: expect.arrayContaining([expect.objectContaining({ field })]),
    });
  });

  it("accepts a quantity-only patch and rejects attempts to replace immutable pins", async () => {
    const service = await importService();
    expect(service).not.toBeNull();
    if (!service) return;

    expect(service.parseProductPlannerEntryPatchBody({
      quantity: { amount: 0.5, unit: "package" },
    })).toMatchObject({ ok: true });
    expect(service.parseProductPlannerEntryPatchBody({
      quantity: { amount: 1, unit: "serving" },
      product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440003",
      product_name_snapshot: "바뀐 이름",
    })).toMatchObject({
      ok: false,
      fields: expect.arrayContaining([
        { field: "product_name_snapshot", reason: "unexpected" },
        { field: "product_nutrition_version_id", reason: "unexpected" },
      ]),
    });
  });

  it("permits only same-unit scaling or exactly one direct pinned relation", async () => {
    const service = await importService();
    expect(service).not.toBeNull();
    if (!service) return;

    expect(service.resolveProductQuantityScale({
      quantity: { amount: 2, unit: "serving" },
      basis: { amount: 1, unit: "serving" },
      relations: [],
    })).toEqual({ ok: true, scale: 2 });

    const relation = {
      from: { amount: 1, unit: "serving" as const },
      to: { amount: 150, unit: "g" as const },
    };
    expect(service.resolveProductQuantityScale({
      quantity: { amount: 300, unit: "g" },
      basis: { amount: 1, unit: "serving" },
      relations: [relation],
    })).toEqual({ ok: true, scale: 2 });
    expect(service.resolveProductQuantityScale({
      quantity: { amount: 300, unit: "g" },
      basis: { amount: 1, unit: "serving" },
      relations: [relation, relation],
    })).toEqual({ ok: false, code: "NUTRITION_BASIS_MISMATCH" });

    expect(service.resolveProductQuantityScale({
      quantity: { amount: 300, unit: "g" },
      basis: { amount: 1, unit: "serving" },
      relations: [],
    })).toEqual({ ok: false, code: "NUTRITION_BASIS_MISMATCH" });

    expect(service.resolveProductQuantityScale({
      quantity: { amount: 2, unit: "package" },
      basis: { amount: 150, unit: "g" },
      relations: [
        { from: { amount: 1, unit: "package" }, to: { amount: 1, unit: "serving" } },
        relation,
      ],
    })).toEqual({ ok: false, code: "NUTRITION_BASIS_MISMATCH" });
  });
});
