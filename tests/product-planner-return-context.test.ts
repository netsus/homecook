// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  PRODUCT_PLANNER_RETURN_CONTEXT_KEY,
  clearProductPlannerReturnContext,
  readProductPlannerReturnContext,
  saveProductPlannerReturnContext,
} from "@/lib/planner/product-planner-return-context";

describe("prepared food planner safe auth return context", () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("round-trips only the safe picker state and clears it explicitly", () => {
    saveProductPlannerReturnContext({
      version: 1,
      kind: "picker",
      planDate: "2026-07-17",
      columnId: "column-1",
      slotName: "아침",
      query: "요거트",
      source: "manual",
      productId: "product-later",
      quantityAmount: "2.5",
      quantityUnit: "package",
    });

    expect(readProductPlannerReturnContext()).toEqual({
      version: 1,
      kind: "picker",
      planDate: "2026-07-17",
      columnId: "column-1",
      slotName: "아침",
      query: "요거트",
      source: "manual",
      productId: "product-later",
      quantityAmount: "2.5",
      quantityUnit: "package",
    });

    clearProductPlannerReturnContext();
    expect(readProductPlannerReturnContext()).toBeNull();
  });

  it("round-trips a list-only picker state without inventing a product or unit", () => {
    saveProductPlannerReturnContext({
      version: 1,
      kind: "picker",
      planDate: "2026-07-17",
      columnId: "column-1",
      slotName: "아침",
      query: "간식",
      source: "all",
      productId: null,
      quantityAmount: "1",
      quantityUnit: null,
    });

    expect(readProductPlannerReturnContext()).toEqual({
      version: 1,
      kind: "picker",
      planDate: "2026-07-17",
      columnId: "column-1",
      slotName: "아침",
      query: "간식",
      source: "all",
      productId: null,
      quantityAmount: "1",
      quantityUnit: null,
    });
  });

  it("preserves an original fraction and its selected version after a display-unit change", () => {
    const context = { version: 1 as const, kind: "picker" as const, planDate: "2026-10-14", columnId: "column-1", slotName: "아침",
      query: "제품", source: "all" as const, productId: "c8000000-0000-4000-8000-000000000800", quantityAmount: "40", quantityUnit: "g" as const,
      quantityInput: { schema_version: "quantity-v4" as const, raw_value: "1/3", raw_unit: "package",
        expected_product_nutrition_version_id: "c8000000-0000-4000-8000-000000000801" } };
    saveProductPlannerReturnContext(context);
    expect(readProductPlannerReturnContext()).toEqual(context);
    for (const quantityInput of [
      { ...context.quantityInput, raw_value: "1/0" },
      { ...context.quantityInput, raw_unit: "통" },
      { ...context.quantityInput, expected_product_nutrition_version_id: "wrong-version" },
      { ...context.quantityInput, expected_batch_revision: 1 },
      { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "package" },
      { ...context.quantityInput, source_versions: ["untrusted"] },
    ]) {
      window.sessionStorage.setItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify({ ...context, quantityInput }));
      expect(readProductPlannerReturnContext()).toBeNull();
      expect(window.sessionStorage.getItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY)).toBeNull();
    }
  });

  it("rejects injected provider rows, secrets, and unknown fields fail-closed", () => {
    window.sessionStorage.setItem(
      PRODUCT_PLANNER_RETURN_CONTEXT_KEY,
      JSON.stringify({
        version: 1,
        kind: "picker",
        planDate: "2026-07-17",
        columnId: "column-1",
        slotName: "아침",
        query: "요거트",
        productId: "product-1",
        quantityAmount: "1",
        quantityUnit: "serving",
        access_token: "do-not-keep",
        provider_row: { raw: true },
      }),
    );

    expect(readProductPlannerReturnContext()).toBeNull();
    expect(window.sessionStorage.getItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY)).toBeNull();
  });

  it("keeps a manual draft to official input fields and a meal mutation to entry context", () => {
    saveProductPlannerReturnContext({
      version: 1,
      kind: "create",
      planDate: "2026-07-17",
      columnId: "column-1",
      slotName: "아침",
      query: "없는 제품",
      source: "manual",
      draft: {
        name: "내 두유",
        brand: "",
        basisAmount: "100",
        basisUnit: "g",
        labelBasisText: "1팩(190mL)",
        energy: "0",
        nutrients: { protein_g: "7", sodium_mg: "" },
      },
    });
    expect(readProductPlannerReturnContext()).toMatchObject({
      kind: "create",
      source: "manual",
      draft: { name: "내 두유", energy: "0", nutrients: { protein_g: "7", sodium_mg: "" } },
    });

    saveProductPlannerReturnContext({
      version: 1,
      kind: "create",
      planDate: "2026-07-17",
      columnId: "column-1",
      slotName: "아침",
      query: "그래놀라",
      source: "manual",
      productId: "manual-product-1",
      action: "edit",
      draft: {
        name: "로그인 복원 그래놀라",
        brand: "집밥 공방",
        basisAmount: "100",
        basisUnit: "g",
        labelBasisText: "",
        energy: "180",
        nutrients: { protein_g: "7" },
      },
    });
    expect(readProductPlannerReturnContext()).toMatchObject({
      kind: "create",
      source: "manual",
      productId: "manual-product-1",
      action: "edit",
      draft: { name: "로그인 복원 그래놀라", energy: "180" },
    });

    saveProductPlannerReturnContext({
      version: 1,
      kind: "meal-entry",
      planDate: "2026-07-17",
      columnId: "column-1",
      slotName: "아침",
      entryId: "entry-1",
      action: "edit",
      quantityAmount: "2",
      quantityUnit: "serving",
    });
    expect(readProductPlannerReturnContext()).toMatchObject({
      kind: "meal-entry",
      entryId: "entry-1",
      action: "edit",
      quantityAmount: "2",
      quantityUnit: "serving",
    });
  });

  it("reads older v1 picker and create payloads without source or labelBasisText as safe defaults", () => {
    window.sessionStorage.setItem(
      PRODUCT_PLANNER_RETURN_CONTEXT_KEY,
      JSON.stringify({
        version: 1,
        kind: "picker",
        planDate: "2026-07-17",
        columnId: "column-1",
        slotName: "아침",
        query: "과자",
        productId: null,
        quantityAmount: "1",
        quantityUnit: null,
      }),
    );

    expect(readProductPlannerReturnContext()).toEqual({
      version: 1,
      kind: "picker",
      planDate: "2026-07-17",
      columnId: "column-1",
      slotName: "아침",
      query: "과자",
      source: "all",
      productId: null,
      quantityAmount: "1",
      quantityUnit: null,
    });

    window.sessionStorage.setItem(
      PRODUCT_PLANNER_RETURN_CONTEXT_KEY,
      JSON.stringify({
        version: 1,
        kind: "create",
        planDate: "2026-07-17",
        columnId: "column-1",
        slotName: "아침",
        query: "두유",
        draft: {
          name: "내 두유",
          brand: "",
          basisAmount: "100",
          basisUnit: "g",
          energy: "99",
          nutrients: {},
        },
      }),
    );

    expect(readProductPlannerReturnContext()).toMatchObject({
      kind: "create",
      source: "all",
      draft: {
        name: "내 두유",
        basisAmount: "100",
        basisUnit: "g",
        labelBasisText: "",
        energy: "99",
      },
    });
  });
});


describe("meal entry raw quantity return", () => {
  const quantityInput = { schema_version: "quantity-v4" as const, raw_value: "1/3", raw_unit: "package", expected_product_nutrition_version_id: "c8000000-0000-4000-8000-000000000801" };
  const context = { version: 1 as const, kind: "meal-entry" as const, planDate: "2026-10-14", columnId: "column-1", slotName: "아침", entryId: "entry-1", action: "edit" as const, quantityAmount: "40", quantityUnit: "g" as const, quantityInput };
  it("round trips the original fraction independently from the displayed amount", () => {
    saveProductPlannerReturnContext(context);
    expect(readProductPlannerReturnContext()).toEqual(context);
    clearProductPlannerReturnContext();
  });
  it.each([{ quantityInput: { ...quantityInput, raw_value: "1/0" } }, { action: "delete" }, { quantityUnit: undefined }, { quantityInput: { ...quantityInput, expected_batch_revision: 1 } }])("rejects malformed or unrelated return metadata %j", (patch) => {
    window.sessionStorage.setItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify({ ...context, ...patch }));
    expect(readProductPlannerReturnContext()).toBeNull();
  });
});
