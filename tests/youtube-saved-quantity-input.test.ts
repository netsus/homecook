import { describe, expect, it } from "vitest";
import { savedQuantityText, switchSavedQuantityUnit } from "@/lib/youtube-saved-quantity-input";

describe("saved YouTube raw quantity adapter", () => {
  it("reopens a source fraction without turning it into a displayed decimal", () => {
    expect(savedQuantityText(1 / 3, "g", { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "g" })).toBe("1/3");
  });
  it("does not display the original fraction as a different unit after conversion", () => {
    expect(savedQuantityText(1 / 3000, "kg", { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "g" })).toBe(String(1 / 3000));
  });
  it("uses the existing converter for reversible SI switches", () => {
    const kilograms = switchSavedQuantityUnit(1 / 3, "g", "kg");
    expect(kilograms).toBe(1 / 3000);
    expect(switchSavedQuantityUnit(kilograms, "kg", "g")).toBeCloseTo(1 / 3, 15);
    expect(switchSavedQuantityUnit(200, "mL", "L")).toBe(0.2);
  });
  it("never invents milk density or garlic piece weight", () => {
    expect(switchSavedQuantityUnit(200, "mL", "g")).toBeNull();
    expect(switchSavedQuantityUnit(1, "통", "g")).toBeNull();
  });
});
