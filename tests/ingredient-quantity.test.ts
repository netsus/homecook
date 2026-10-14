import { describe, expect, it } from "vitest";
import { getIngredientUnitChoices, resolveIngredientQuantity } from "@/lib/nutrition/ingredient-quantity";
import { density, piece, quantity, quantityCases, volumeDefinition } from "./fixtures/ingredient-quantity-v4";

describe("reviewed general ingredient quantity", () => {
  it.each(quantityCases)("$name", (test) => {
    const before = structuredClone(test.input);
    const result = resolveIngredientQuantity(test.input, test.target);
    if ("reason" in test) expect(result).toEqual({ status: "unavailable", reason: test.reason });
    else expect(result).toMatchObject({ status: "resolved", amount: test.amount, unit: test.target,
      quality: "quality" in test ? test.quality : "direct" });
    expect(test.input).toEqual(before);
  });

  it.each([["T", 15], ["t", 5], ["cup", 240], ["cup", 200]] as const)("preserves explicit source %s=%smL", (unit, volume) => {
    const input = quantity(unit, 2);
    input.unit_context!.volume_definitions = [volumeDefinition(unit, volume)];
    expect(resolveIngredientQuantity(input, "ml")).toMatchObject({ status: "resolved", amount: volume * 2,
      evidence_ids: ["definition"] });
    if (unit === "T") expect(resolveIngredientQuantity({ ...input, unit: "t" }, "ml").status).toBe("unavailable");
  });

  it("preserves raw 2큰술(35mL) conflict instead of forcing 30mL", () => {
    const input = quantity("큰술", 2);
    input.unit_context!.volume_definitions = [{ ...volumeDefinition("큰술", 15), reference_volume_ml: 17.5 }];
    expect(resolveIngredientQuantity(input, "ml")).toEqual({ status: "unavailable", reason: "UNIT_DEFINITION_CONFLICT" });
    expect(input).toMatchObject({ amount: 2, unit: "큰술" });
  });
  it("requires a definition from the origin of this quantity and rejects duplicate approved definitions", () => {
    const input = quantity("cup");
    input.unit_context!.volume_definitions = [volumeDefinition("cup", 240)];
    input.unit_context!.source_id = "another-origin";
    expect(resolveIngredientQuantity(input, "ml").status).toBe("unavailable");
    input.unit_context!.source_id = "source";
    input.unit_context!.volume_definitions.push({ ...volumeDefinition("cup", 200), id: "second" });
    expect(resolveIngredientQuantity(input, "ml")).toEqual({ status: "unavailable", reason: "AMBIGUOUS_EVIDENCE" });
  });
  it.each(["2알", "통", "11알"])("does not promote a different raw piece observation %s", (observed) => {
    const input = quantity("알"); input.unit_context!.pieces = [{ ...piece, observed_unit: observed }];
    expect(resolveIngredientQuantity(input, "g").status).toBe("unavailable");
  });

  it.each(["ingredient", "state", "edible", "inactive", "stale", "unapproved", "version"])("rejects mismatched density %s", (mismatch) => {
    const row = structuredClone(density);
    if (mismatch === "ingredient") row.ingredient_id = "another";
    if (mismatch === "state") row.preparation_state = "cooked";
    if (mismatch === "edible") row.edible_portion_basis = "as_purchased";
    if (mismatch === "inactive") row.is_active = false;
    if (mismatch === "stale") row.source.freshness_status = "stale";
    if (mismatch === "unapproved") row.review_status = "pending";
    if (mismatch === "version") row.source.source_version = "";
    const input = quantity("ml"); input.unit_context!.densities = [row];
    expect(resolveIngredientQuantity(input, "g")).toEqual({ status: "unavailable", reason: "DENSITY_REQUIRED" });
  });

  it.each(["ingredient", "state", "size", "edible"])("rejects mismatched piece %s", (mismatch) => {
    const row = { ...piece };
    if (mismatch === "ingredient") row.ingredient_id = "another";
    if (mismatch === "state") row.preparation_state = "cooked";
    if (mismatch === "size") row.size_code = "large";
    if (mismatch === "edible") row.edible_portion_basis = "as_purchased";
    const input = quantity("알"); input.unit_context!.pieces = [row];
    expect(resolveIngredientQuantity(input, "g").status).toBe("unavailable");
  });

  it("fails closed for ambiguous approved evidence and never assumes density from the name", () => {
    const input = quantity("ml"); input.unit_context!.densities = [density, { ...density, id: "other" }];
    expect(resolveIngredientQuantity(input, "g")).toEqual({ status: "unavailable", reason: "AMBIGUOUS_EVIDENCE" });
    expect(resolveIngredientQuantity({ ...input, ingredient_id: "water", unit_context: undefined }, "g"))
      .toEqual({ status: "unavailable", reason: "DENSITY_REQUIRED" });
  });

  it("requires explicit physical identity for a measured household spoon", () => {
    const input = quantity("밥숟가락"); input.size_code = "household_spoon";
    input.unit_context!.pieces = [{ ...piece, physical_unit: "밥숟가락", size_code: "household_spoon", weight_g: 14,
      observed_unit: "밥숟가락", observed_weight_g: 14 }];
    expect(resolveIngredientQuantity(input, "g")).toMatchObject({ status: "resolved", amount: 14, quality: "estimated" });
    expect(resolveIngredientQuantity({ ...input, unit: "스푼" }, "g").status).toBe("unavailable");
  });

  it("offers one valid preference, at most three alternatives, and estimated evidence without changing raw input", () => {
    const input = quantity("통");
    const choices = getIngredientUnitChoices(input, "g", "알");
    expect(choices.recommended).toMatchObject({ unit: "알", normalized_amount: 3, quality: "estimated", evidence_ids: ["piece"] });
    expect(choices.alternatives.length).toBeLessThanOrEqual(3);
    expect([...choices.alternatives, ...choices.other].map((row) => row.unit)).not.toContain("통");
    expect(choices.preserved_raw_unit).toBe("통");
    expect(getIngredientUnitChoices({ ...input, unit_context: undefined }, "g", "ml").recommended?.unit).toBe("g");
  });
});
