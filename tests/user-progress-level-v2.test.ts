import { describe, expect, it } from "vitest";

import {
  calculateUserProgressLevel,
  getUserProgressGrade,
  levelStartXp,
} from "@/lib/server/user-progress";

describe("user progress level curve v2", () => {
  it("uses the long-term v2 level start formula", () => {
    expect(levelStartXp(1)).toBe(0);
    expect(levelStartXp(2)).toBe(100);
    expect(levelStartXp(3)).toBe(280);
    expect(levelStartXp(4)).toBe(540);
    expect(levelStartXp(5)).toBe(880);
    expect(levelStartXp(8)).toBe(2380);
    expect(levelStartXp(13)).toBe(6480);
    expect(levelStartXp(21)).toBe(17200);
    expect(levelStartXp(35)).toBe(48280);
    expect(levelStartXp(50)).toBe(98980);
  });

  it("never lowers a level when recalculating from the old v1 curve", () => {
    for (let level = 1; level <= 80; level += 1) {
      const oldCurveStartXp = (100 * (level - 1) * level) / 2;

      expect(calculateUserProgressLevel(oldCurveStartXp).current_level).toBeGreaterThanOrEqual(
        level,
      );
    }
  });

  it("derives grade labels at every boundary", () => {
    expect(getUserProgressGrade(1)).toMatchObject({
      grade_key: "clay",
      label: "Clay",
      level_min: 1,
      level_max: 3,
    });
    expect(getUserProgressGrade(4).grade_key).toBe("wood");
    expect(getUserProgressGrade(8).grade_key).toBe("steel");
    expect(getUserProgressGrade(13).grade_key).toBe("silver");
    expect(getUserProgressGrade(21).grade_key).toBe("gold");
    expect(getUserProgressGrade(35).grade_key).toBe("diamond");
    expect(getUserProgressGrade(50)).toMatchObject({
      grade_key: "titanium",
      label: "Titanium",
      level_min: 50,
      level_max: null,
    });
  });
});
