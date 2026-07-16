import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("prepared food planner entry structural exclusions", () => {
  it("keeps the existing Meal writer recipe-only and growth events scoped to meals", () => {
    const source = readFileSync(resolve(process.cwd(), "app/api/v1/meals/route.ts"), "utf8");
    expect(source).toContain("CLIENT_CONTROLLED_NUTRITION_FIELDS");
    expect(source).toMatch(/product_id/);
    expect(source).toMatch(/planner_registered/);
    expect(source).toMatch(/sourceTable:\s*"meals"/);
    expect(source).not.toMatch(/from\("product_planner_entries"\)[\s\S]*planner_registered/);
  });

  it("adds product entries only to existing planner and meals reads", () => {
    const planner = readFileSync(resolve(process.cwd(), "app/api/v1/planner/route.ts"), "utf8");
    const meals = readFileSync(resolve(process.cwd(), "app/api/v1/meals/route.ts"), "utf8");
    expect(planner).toMatch(/product_entries/);
    expect(meals).toMatch(/product_entries/);
    expect(planner).toMatch(/meals:\s*mealsResult\.data\.map/);
    expect(meals).toMatch(/items:\s*mealsResult\.data\.map/);
  });
});
