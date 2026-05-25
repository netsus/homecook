import { describe, expect, it } from "vitest";

import {
  getCookingMethodColor,
  getCookingMethodTint,
  getCookingMethodVisual,
} from "@/lib/cooking-method-colors";

describe("getCookingMethodColor", () => {
  it("maps legacy color keys and cooking method codes to current cook tokens", () => {
    expect(getCookingMethodColor("orange")).toBe("var(--cook-stir)");
    expect(getCookingMethodColor("stir_fry")).toBe("var(--cook-stir)");
    expect(getCookingMethodColor("red")).toBe("var(--cook-boil)");
    expect(getCookingMethodColor("lime")).toBe("var(--cook-blanch)");
    expect(getCookingMethodColor("blanch")).toBe("var(--cook-blanch)");
    expect(getCookingMethodColor("deep_fry")).toBe("var(--cook-fry)");
    expect(getCookingMethodColor("unknown")).toBe("var(--cook-etc)");
    expect(getCookingMethodColor(null)).toBe("var(--cook-etc)");
  });

  it("exposes shared tints and fallback visuals for screens that render method badges", () => {
    expect(getCookingMethodTint("lime")).toBe("color-mix(in srgb, var(--cook-blanch) 16%, transparent)");
    expect(getCookingMethodVisual({ code: "blanch", label: "데치기", color_key: "lime" })).toEqual({
      label: "데치기",
      color: "var(--cook-blanch)",
      tint: "color-mix(in srgb, var(--cook-blanch) 16%, transparent)",
    });
    expect(getCookingMethodVisual(null)).toEqual({
      label: "기타",
      color: "var(--cook-etc)",
      tint: "color-mix(in srgb, var(--cook-etc) 16%, transparent)",
    });
  });
});
