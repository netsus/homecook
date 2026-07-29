import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const consumerSources = {
  meals: readRepositoryFile("app/api/v1/meals/route.ts"),
  plannerNutrition: readRepositoryFile("lib/server/planner-nutrition-summary.ts"),
  shoppingPreview: readRepositoryFile("app/api/v1/shopping/preview/route.ts"),
  shoppingCreate: readRepositoryFile("app/api/v1/shopping/lists/route.ts"),
  shoppingDetail: readRepositoryFile("app/api/v1/shopping/lists/[list_id]/route.ts"),
  cookMode: readRepositoryFile(
    "app/api/v1/cooking/sessions/[session_id]/cook-mode/route.ts",
  ),
  leftoversRoute: readRepositoryFile("app/api/v1/leftovers/route.ts"),
  leftoversProjection: readRepositoryFile("lib/server/leftovers.ts"),
};

function expectScenarioNames(
  path: string,
  scenarioNames: string[],
) {
  const source = readRepositoryFile(path);

  for (const scenarioName of scenarioNames) {
    expect(source, `${path} lost behavior scenario: ${scenarioName}`).toContain(
      `"${scenarioName}"`,
    );
  }
}

describe("recipe snapshot consumer regression", () => {
  it("implementation-shape guard: keeps Meal and planner nutrition on content-first branches", () => {
    expect(consumerSources.meals).toContain(
      "recipe_content_snapshot_id, recipe_content_snapshots(title)",
    );
    expect(consumerSources.meals).toMatch(
      /recipe_title:\s*contentSnapshot\?\.title\?\.trim\(\)\s*\|\|\s*recipe\?\.title/u,
    );

    expect(consumerSources.plannerNutrition).toContain(
      "recipe_content_snapshots(recipe_nutrition_snapshot_id)",
    );
    expect(consumerSources.plannerNutrition).toMatch(
      /const snapshotId = meal\.recipe_content_snapshot_id\s*\?\s*contentSnapshot\?\.recipe_nutrition_snapshot_id\s*\?\?\s*null\s*:\s*meal\.recipe_nutrition_snapshot_id/u,
    );
  });

  it("implementation-shape guard: keeps shopping, cook mode, and leftovers on content projections", () => {
    expect(consumerSources.shoppingPreview).toContain(
      "recipe_content_snapshot_id, recipe_content_snapshots(title)",
    );
    expect(consumerSources.shoppingPreview).toMatch(
      /getPinnedMealTitle\(meal\)\s*\?\?\s*recipeMap\.get\(meal\.recipe_id\)\?\.title/u,
    );

    expect(consumerSources.shoppingCreate).toContain(
      "recipe_content_snapshots(base_servings, ingredients_json)",
    );
    expect(consumerSources.shoppingCreate).toContain(
      "for (const ingredient of contentSnapshot.ingredients_json ?? [])",
    );
    expect(consumerSources.shoppingDetail).toMatch(
      /pinnedRecipeTitleMap\.get\(recipe\.recipe_id\)\s*\?\?\s*recipeNameMap\.get\(recipe\.recipe_id\)\?\.title\s*\?\?/u,
    );

    expect(consumerSources.cookMode).toContain(
      'session.contract_version === "snapshot_v2" && sessionContentSnapshot',
    );
    expect(consumerSources.cookMode).toContain("title: sessionContentSnapshot.title");
    expect(consumerSources.cookMode).toContain(
      "(sessionContentSnapshot.ingredients_json ?? []).map",
    );
    expect(consumerSources.cookMode).toContain(
      "(sessionContentSnapshot.steps_json ?? []).map",
    );

    expect(consumerSources.leftoversRoute).toContain(
      '.from("recipe_content_snapshots")',
    );
    expect(consumerSources.leftoversProjection).toMatch(
      /const contentSnapshot = row\.recipe_content_snapshot_id\s*\?\s*contentSnapshotMap\.get\(row\.recipe_content_snapshot_id\)\s*\?\?\s*null\s*:\s*null/u,
    );
    expect(consumerSources.leftoversProjection).toContain(
      'recipe_title: contentSnapshot?.title ?? recipe?.title ?? ""',
    );
  });

  it("implementation-shape guard: limits mutable fallback and retains broken-pin exits", () => {
    expect(consumerSources.shoppingCreate).toContain(
      "const legacyMeals = shoppingMeals.filter((meal) => !hasContentPin(meal))",
    );
    expect(consumerSources.shoppingCreate).toContain(
      '.in("id", legacyRecipeIds)',
    );
    expect(consumerSources.shoppingCreate).toContain(
      '.in("recipe_id", legacyRecipeIds)',
    );

    expect(consumerSources.meals).toContain("hasBrokenContentPinnedMeal");
    expect(consumerSources.shoppingPreview).toContain(
      "hasContentPin(meal) && getPinnedMealTitle(meal) === null",
    );
    expect(consumerSources.shoppingCreate).toContain(
      "hasContentPin(meal) && getMealContentSnapshot(meal) === null",
    );
    expect(consumerSources.shoppingDetail).toContain(
      "hasContentPin(meal) && getMealPinnedTitle(meal) === null",
    );
    expect(consumerSources.cookMode).toContain(
      "session.recipe_content_snapshot_id && sessionContentSnapshot === null",
    );
    expect(consumerSources.leftoversRoute).toContain(
      "!contentSnapshotMap.has(item.recipe_content_snapshot_id)",
    );

    expect(consumerSources.plannerNutrition).toMatch(
      /meal\.recipe_content_snapshot_id\s*\?\s*contentSnapshot\?\.recipe_nutrition_snapshot_id\s*\?\?\s*null\s*:\s*meal\.recipe_nutrition_snapshot_id/u,
    );
    expect(consumerSources.plannerNutrition).toContain(
      "if (!snapshotId) {\n    return unavailableEntry",
    );
  });

  it("binds the Stage 4 claim to existing dynamic history and fail-closed scenarios", () => {
    expectScenarioNames("tests/meals-route.test.ts", [
      "uses an immutable content title instead of the mutable current recipe title",
      "fails closed when a content-pinned Meal cannot load its immutable content row",
      "keeps deleted recipe metadata behind an owned Meal anchor",
    ]);
    expectScenarioNames("tests/shopping-preview.backend.test.ts", [
      "uses a content-pinned Meal title instead of the mutable current recipe title",
      "fails closed when a shopping preview Meal has a broken content pin relation",
      "uses pinned content once per Meal without duplicating a recipe-level serving total",
    ]);
    expectScenarioNames("tests/shopping-detail.backend.test.ts", [
      "uses the content-pinned Meal title for shopping list detail",
      "fails closed when shopping list detail finds a broken Meal content pin relation",
      "reads anchored deleted recipe metadata through service role for the list owner",
    ]);
    expectScenarioNames("tests/cook-session-start.backend.test.ts", [
      "GET /cooking/sessions/{id}/cook-mode uses snapshot-v2 pinned title, servings base, ingredients, and steps",
      "GET /cooking/sessions/{id}/cook-mode fails closed when a snapshot-v2 content relation is broken",
      "GET /cooking/sessions/{id}/cook-mode reads anchored deleted recipe content through service role for the owner",
    ]);
    expectScenarioNames("tests/leftovers.backend.test.ts", [
      "uses the leftover content snapshot title instead of the mutable current recipe title",
      "fails closed when a leftover content snapshot relation is broken",
    ]);
    expectScenarioNames("tests/planner-nutrition-read-model.test.ts", [
      "fails closed to unavailable for an unreadable pinned snapshot",
      "uses the content snapshot nutrition pin even when the legacy direct pin differs",
      "does not fall back to a legacy direct pin when pinned content has no nutrition",
    ]);
    expectScenarioNames(
      "tests/recipe-snapshot-authority-postgres.integration.test.ts",
      [
        "upgrades preexisting private and soft-deleted nutrition ownership without losing history",
        "denies ordinary snapshot mutation and permits only exact-owner cleanup delete",
      ],
    );
  });
});
