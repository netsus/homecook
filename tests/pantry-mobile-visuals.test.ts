import { describe, expect, it } from "vitest";

import { getPantryEmoji } from "@/components/pantry/pantry-mobile-visuals";

describe("pantry mobile visuals", () => {
  it("uses the shared category emoji for canonical fruit", () => {
    expect(getPantryEmoji("제철과일", "과일")).toBe("🍓");
  });

  it("keeps Wave1-only display group fallbacks separate from canonical categories", () => {
    expect(getPantryEmoji("렌틸콩", "단백질")).toBe("🥚");
    expect(getPantryEmoji("잡곡밥", "주식")).toBe("🍚");
  });
});
