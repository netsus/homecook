import { describe, expect, it } from "vitest";
import { formatQuantityAmount, parseQuantityInput } from "@/lib/quantity-input";

describe("food quantity raw input", () => {
  it.each([["1/2", 0.5, "1", "2"], ["1/3", 1 / 3, "1", "3"], ["0.125", 0.125, "1", "8"], ["1.", 1, "1", "1"]])(
    "preserves %s while calculating the same amount", (raw, amount, numerator, denominator) => {
      expect(parseQuantityInput(String(raw))).toEqual({ raw_value: raw, amount, numerator, denominator });
    },
  );
  it.each(["", "-1", "0", "0/2", "1/0", "1//2", "1/2/3", "Infinity", "NaN", "1e1000"])("rejects %s", raw => {
    expect(parseQuantityInput(raw)).toBeNull();
  });
  it("does not turn a positive small quantity into displayed zero", () => {
    expect(formatQuantityAmount(0.000001)).toBe("<0.001");
    expect(formatQuantityAmount(0)).toBe("0");
    expect(formatQuantityAmount(0.5)).toBe("0.5");
  });
});
