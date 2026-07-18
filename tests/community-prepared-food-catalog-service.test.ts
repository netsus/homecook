import { describe, expect, it } from "vitest";

async function importCatalogService() {
  return import("@/lib/server/prepared-food-catalog").catch(() => null);
}

describe("community prepared food catalog service contract", () => {
  it("accepts only the documented source filter values", async () => {
    const service = await importCatalogService();
    expect(service, "prepared food catalog service must exist").not.toBeNull();
    if (!service) return;

    expect(service.parseProductListQuery(new URLSearchParams({
      source: "manual",
      q: " 공동 요거트 ",
    }))).toEqual({
      ok: true,
      value: {
        q: "공동 요거트",
        cursor: null,
        limit: 20,
        source: "manual",
      },
    });

    expect(service.parseProductListQuery(new URLSearchParams({
      source: "dataset",
    }))).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "source", reason: "unsupported_source" }],
    });
  });

  it("accepts shared manual g/ml nutrition with optional label_basis_text", async () => {
    const service = await importCatalogService();
    expect(service).not.toBeNull();
    if (!service) return;

    expect(service.parseProductCreateBody({
      name: "공동 요거트",
      brand: "브랜드",
      nutrition: {
        basis: { amount: 150, unit: "g" },
        label_basis_text: "1회(150g)",
        values: {
          energy_kcal: 120,
          sodium_mg: null,
        },
      },
    })).toEqual({
      ok: true,
      value: {
        name: "공동 요거트",
        brand: "브랜드",
        nutrition: {
          basis: { amount: 150, unit: "g" },
          label_basis_text: "1회(150g)",
          values: {
            energy_kcal: 120,
            sodium_mg: null,
          },
        },
      },
    });
  });

  it("rejects serving/package shared manual basis and owner-controlled fields", async () => {
    const service = await importCatalogService();
    expect(service).not.toBeNull();
    if (!service) return;

    expect(service.parseProductCreateBody({
      name: "금지 제품",
      visibility: "public",
      source_type: "manual",
      owner_user_id: "550e8400-e29b-41d4-a716-446655440099",
      moderation_status: "visible",
      external_product_key: "provider-key",
      basis_relations: [],
      nutrition: {
        basis: { amount: 1, unit: "serving" },
        values: { energy_kcal: 120 },
      },
    })).toEqual({
      ok: false,
      code: "UNSUPPORTED_FIELD",
      fields: [
        { field: "basis_relations", reason: "unsupported_field" },
        { field: "external_product_key", reason: "unsupported_field" },
        { field: "moderation_status", reason: "unsupported_field" },
        { field: "owner_user_id", reason: "unsupported_field" },
        { field: "source_type", reason: "unsupported_field" },
        { field: "visibility", reason: "unsupported_field" },
      ],
    });
  });

  it.each(["spam", "incorrect_nutrition", "duplicate", "rights", "unsafe", "other"])(
    "accepts the exact %s report reason without inventing status fields",
    async (reasonCode) => {
      const service = await importCatalogService();
      expect(service).not.toBeNull();
      if (!service) return;

      expect(service.parseFoodProductReportBody({
        reason_code: reasonCode,
        detail_text: "  확인해 주세요  ",
      })).toEqual({
        ok: true,
        value: { reason_code: reasonCode, detail_text: "확인해 주세요" },
      });
    },
  );

  it("rejects unsupported report reasons and client-controlled report status", async () => {
    const service = await importCatalogService();
    expect(service).not.toBeNull();
    if (!service) return;

    expect(service.parseFoodProductReportBody({
      reason_code: "bad_data",
      report_status: "resolved",
    })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "report_status", reason: "unexpected" }],
    });
  });
});
