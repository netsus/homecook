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
      productId: "product-later",
      quantityAmount: "2.5",
      quantityUnit: "package",
    });

    clearProductPlannerReturnContext();
    expect(readProductPlannerReturnContext()).toBeNull();
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
      draft: {
        name: "내 두유",
        brand: "",
        basisAmount: "1",
        basisUnit: "serving",
        energy: "0",
        nutrients: { protein_g: "7", sodium_mg: "" },
      },
    });
    expect(readProductPlannerReturnContext()).toMatchObject({
      kind: "create",
      draft: { name: "내 두유", energy: "0", nutrients: { protein_g: "7", sodium_mg: "" } },
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
});
