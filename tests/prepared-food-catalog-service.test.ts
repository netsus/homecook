import { describe, expect, it } from "vitest";

async function importCatalogService() {
  return import("@/lib/server/prepared-food-catalog").catch(() => null);
}

const completeNutrition = {
  basis: { amount: 1, unit: "serving" },
  values: {
    energy_kcal: 120,
    carbohydrate_g: 14,
    protein_g: 8,
    fat_g: 4,
    sodium_mg: null,
  },
};

describe("prepared food catalog service contract", () => {
  it("requires a non-empty name while allowing a nullable brand", async () => {
    const service = await importCatalogService();
    expect(service, "prepared food catalog service must exist").not.toBeNull();
    if (!service) return;

    expect(service.parseProductCreateBody({
      name: "  내가 먹는 요거트  ",
      brand: null,
      nutrition: completeNutrition,
    })).toMatchObject({
      ok: true,
      value: { name: "내가 먹는 요거트", brand: null },
    });
    expect(service.parseProductCreateBody({
      name: "   ",
      nutrition: completeNutrition,
    })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "name", reason: "required" }],
    });
  });

  it.each(["serving", "package", "g", "ml"])(
    "accepts the documented positive %s basis",
    async (unit) => {
      const service = await importCatalogService();
      expect(service).not.toBeNull();
      if (!service) return;

      expect(service.parseProductCreateBody({
        name: "제품",
        nutrition: {
          ...completeNutrition,
          basis: { amount: 1, unit },
        },
      })).toMatchObject({ ok: true });
    },
  );

  it("rejects invalid basis and required energy without normalizing missing values to zero", async () => {
    const service = await importCatalogService();
    expect(service).not.toBeNull();
    if (!service) return;

    expect(service.parseProductCreateBody({
      name: "제품",
      nutrition: {
        basis: { amount: 0, unit: "piece" },
        values: { energy_kcal: null, sodium_mg: "" },
      },
    })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [
        { field: "nutrition.basis.amount", reason: "positive_number_required" },
        { field: "nutrition.basis.unit", reason: "unsupported_unit" },
        { field: "nutrition.values.energy_kcal", reason: "required" },
        { field: "nutrition.values.sodium_mg", reason: "finite_nonnegative_number_or_null" },
      ],
    });
  });

  it("rejects values outside the database numeric range while accepting the documented maximum boundary", async () => {
    const service = await importCatalogService();
    expect(service).not.toBeNull();
    if (!service) return;

    expect(service.parseProductCreateBody({
      name: "범위 초과 제품",
      nutrition: {
        basis: { amount: 100_000_000, unit: "g" },
        values: { energy_kcal: 100_000_000 },
      },
    })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [
        { field: "nutrition.basis.amount", reason: "numeric_range" },
        { field: "nutrition.values.energy_kcal", reason: "numeric_range" },
      ],
    });

    expect(service.parseProductCreateBody({
      name: "최대 경계 제품",
      nutrition: {
        basis: { amount: 99_999_999.9999, unit: "g" },
        values: { energy_kcal: 99_999_999.999999 },
      },
    })).toMatchObject({ ok: true });
  });

  it("allows only the exact documented optional nutrients and reports unsupported codes separately", async () => {
    const service = await importCatalogService();
    expect(service).not.toBeNull();
    if (!service) return;

    const accepted = service.parseProductCreateBody({
      name: "제품",
      nutrition: {
        basis: { amount: 100, unit: "g" },
        values: {
          energy_kcal: 0,
          sugars_g: null,
          saturated_fat_g: 0,
          fiber_g: 1.5,
        },
      },
    });
    expect(accepted).toMatchObject({ ok: true });
    if (accepted.ok) {
      expect(accepted.value.nutrition.values).toEqual({
        energy_kcal: 0,
        sugars_g: null,
        saturated_fat_g: 0,
        fiber_g: 1.5,
      });
    }

    expect(service.parseProductCreateBody({
      name: "제품",
      nutrition: {
        basis: { amount: 100, unit: "g" },
        values: { energy_kcal: 10, cholesterol_mg: 2 },
      },
    })).toEqual({
      ok: false,
      code: "UNSUPPORTED_NUTRIENT",
      fields: [{ field: "nutrition.values.cholesterol_mg", reason: "unsupported_nutrient" }],
    });
  });

  it("rejects all client-controlled catalog and relation fields", async () => {
    const service = await importCatalogService();
    expect(service).not.toBeNull();
    if (!service) return;

    expect(service.parseProductCreateBody({
      name: "제품",
      visibility: "public",
      source_type: "public_dataset",
      owner_user_id: "other-user",
      external_product_key: "provider-key",
      basis_relations: [],
      nutrition: completeNutrition,
    })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [
        { field: "basis_relations", reason: "unexpected" },
        { field: "external_product_key", reason: "unexpected" },
        { field: "owner_user_id", reason: "unexpected" },
        { field: "source_type", reason: "unexpected" },
        { field: "visibility", reason: "unexpected" },
      ],
    });
  });

  it("distinguishes metadata-only patches from immutable nutrition replacements", async () => {
    const service = await importCatalogService();
    expect(service).not.toBeNull();
    if (!service) return;

    expect(service.parseProductPatchBody({ brand: null })).toEqual({
      ok: true,
      value: { brand: null },
      changesNutrition: false,
    });
    expect(service.parseProductPatchBody({ nutrition: completeNutrition })).toMatchObject({
      ok: true,
      changesNutrition: true,
    });
    expect(service.parseProductPatchBody({})).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "body", reason: "empty_patch" }],
    });
  });

  it("uses a bounded opaque stable cursor and rejects malformed cursor and limit", async () => {
    const service = await importCatalogService();
    expect(service).not.toBeNull();
    if (!service) return;

    const encoded = service.encodeProductCursor({
      createdAt: "2026-07-16T00:00:00.000Z",
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(encoded).not.toContain("2026-07-16");
    expect(service.parseProductListQuery(new URLSearchParams({
      q: " 요거트 ",
      cursor: encoded,
      limit: "50",
    }))).toEqual({
      ok: true,
      value: {
        q: "요거트",
        cursor: {
          createdAt: "2026-07-16T00:00:00.000Z",
          id: "550e8400-e29b-41d4-a716-446655440000",
        },
        limit: 50,
      },
    });
    expect(service.parseProductListQuery(new URLSearchParams({ limit: "51" }))).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(service.parseProductListQuery(new URLSearchParams({ cursor: "not-a-cursor" }))).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
  });

  it("preserves a PostgreSQL microsecond timestamp in the opaque cursor", async () => {
    const service = await importCatalogService();
    expect(service).not.toBeNull();
    if (!service) return;

    const cursor = {
      createdAt: "2026-07-16T00:00:00.123456Z",
      id: "550e8400-e29b-41d4-a716-446655440000",
    };
    const encoded = service.encodeProductCursor(cursor);

    expect(service.decodeProductCursor(encoded)).toEqual(cursor);
  });
});
