import { describe, expect, it } from "vitest";

import { formatHeatLevelLabel } from "@/lib/heat-level";

describe("formatHeatLevelLabel", () => {
  it("renders stored heat codes as natural Korean labels", () => {
    expect(formatHeatLevelLabel("medium")).toBe("중불");
    expect(formatHeatLevelLabel("high")).toBe("강불");
    expect(formatHeatLevelLabel("low")).toBe("약불");
  });

  it("keeps already natural heat labels readable", () => {
    expect(formatHeatLevelLabel("중약불")).toBe("중약불");
    expect(formatHeatLevelLabel(" 중 ")).toBe("중불");
    expect(formatHeatLevelLabel(null)).toBeNull();
  });
});
