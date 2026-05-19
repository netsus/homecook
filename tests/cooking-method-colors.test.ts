import { describe, expect, it } from "vitest";

import { getCookingMethodColor } from "@/lib/cooking-method-colors";

describe("getCookingMethodColor", () => {
  it("maps legacy color keys and cooking method codes to current cook tokens", () => {
    expect(getCookingMethodColor("orange")).toBe("var(--cook-stir)");
    expect(getCookingMethodColor("stir_fry")).toBe("var(--cook-stir)");
    expect(getCookingMethodColor("red")).toBe("var(--cook-boil)");
    expect(getCookingMethodColor("deep_fry")).toBe("var(--cook-fry)");
    expect(getCookingMethodColor("unknown")).toBe("var(--cook-etc)");
    expect(getCookingMethodColor(null)).toBe("var(--cook-etc)");
  });
});
