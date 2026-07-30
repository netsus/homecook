import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("recipe snapshot reader-first compatibility", () => {
  it("makes Meal and planner nutrition readers select the content pin before legacy direct nutrition", () => {
    const mealRoute = readRepositoryFile("app/api/v1/meals/route.ts");
    const plannerNutrition = readRepositoryFile("lib/server/planner-nutrition-summary.ts");

    expect(
      mealRoute.includes("recipe_content_snapshot_id"),
      "Meal list/create reader does not select the content pin",
    ).toBe(true);
    expect(
      mealRoute.includes("recipe_content_snapshots"),
      "Meal reader does not join the immutable content authority",
    ).toBe(true);
    expect(
      plannerNutrition.includes("recipe_content_snapshot_id"),
      "planner nutrition does not select the content pin",
    ).toBe(true);
    expect(
      plannerNutrition.includes("recipe_content_snapshots"),
      "planner nutrition does not load pinned content nutrition",
    ).toBe(true);
    expect(
      /recipe_content_snapshot_id[\s\S]*recipe_nutrition_snapshot_id[\s\S]*legacy/i
        .test(plannerNutrition),
      "planner nutrition lacks content-first/legacy-direct fallback branching",
    ).toBe(true);
  });
});
