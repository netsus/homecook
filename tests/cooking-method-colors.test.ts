import { describe, expect, it } from "vitest";

import {
  getCookingMethodColor,
  getCookingMethodTint,
  getCookingMethodVisual,
} from "@/lib/cooking-method-colors";
import { CANONICAL_COOKING_METHODS } from "@/lib/cooking-method-taxonomy";

const METHOD_COLOR_TOKENS = {
  slice: "var(--cook-slice)",
  mince: "var(--cook-mince)",
  thaw: "var(--cook-thaw)",
  pre_season: "var(--cook-pre-season)",
  pickle: "var(--cook-pickle)",
  boil: "var(--cook-boil)",
  parboil: "var(--cook-parboil)",
  blanch: "var(--cook-blanch)",
  steam: "var(--cook-steam)",
  stir_fry: "var(--cook-stir)",
  grill: "var(--cook-grill)",
  pan_fry: "var(--cook-pan-fry)",
  deep_fry: "var(--cook-deep-fry)",
  mix: "var(--cook-mix)",
  toss: "var(--cook-toss)",
  braise: "var(--cook-braise)",
  reduce: "var(--cook-reduce)",
  microwave: "var(--cook-microwave)",
  oven_bake: "var(--cook-oven-bake)",
  air_fryer: "var(--cook-air-fryer)",
} as const;

describe("getCookingMethodColor", () => {
  it("maps every canonical cooking method to a distinct semantic token", () => {
    const methodTokens = CANONICAL_COOKING_METHODS.map((method) => {
      const expectedToken =
        METHOD_COLOR_TOKENS[method.code as keyof typeof METHOD_COLOR_TOKENS];

      expect(getCookingMethodColor(method.code)).toBe(expectedToken);
      expect(getCookingMethodColor(method)).toBe(expectedToken);

      return expectedToken;
    });

    expect(new Set(methodTokens)).toHaveLength(CANONICAL_COOKING_METHODS.length);
  });

  it("keeps legacy color keys available as fallbacks", () => {
    expect(getCookingMethodColor("orange")).toBe("var(--cook-stir)");
    expect(getCookingMethodColor("stir_fry")).toBe("var(--cook-stir)");
    expect(getCookingMethodColor("red")).toBe("var(--cook-boil)");
    expect(getCookingMethodColor("lime")).toBe("var(--cook-blanch)");
    expect(getCookingMethodColor("blanch")).toBe("var(--cook-blanch)");
    expect(getCookingMethodColor("yellow")).toBe("var(--cook-deep-fry)");
    expect(getCookingMethodColor("unknown")).toBe("var(--cook-etc)");
    expect(getCookingMethodColor(null)).toBe("var(--cook-etc)");
  });

  it("exposes shared tints and fallback visuals for screens that render method badges", () => {
    expect(getCookingMethodTint("lime")).toBe("color-mix(in srgb, var(--cook-blanch) 16%, transparent)");
    expect(getCookingMethodTint("red")).toBe("color-mix(in srgb, var(--cook-boil) 14%, transparent)");
    expect(getCookingMethodTint("yellow")).toBe("color-mix(in srgb, var(--cook-deep-fry) 18%, transparent)");
    expect(getCookingMethodVisual({ code: "deep_fry", label: "튀기기", color_key: "yellow" })).toEqual({
      label: "튀기기",
      color: "var(--cook-deep-fry)",
      tint: "color-mix(in srgb, var(--cook-deep-fry) 18%, transparent)",
    });
    expect(getCookingMethodVisual(null)).toEqual({
      label: "기타",
      color: "var(--cook-etc)",
      tint: "color-mix(in srgb, var(--cook-etc) 16%, transparent)",
    });
  });
});
