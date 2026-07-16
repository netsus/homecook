import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ensureUserBootstrapState } from "@/lib/server/user-bootstrap";
import {
  rollbackFoodSafetyRecipeNutritionBackfill,
  runFoodSafetyRecipeNutritionBackfill,
} from "@/scripts/lib/recipe-nutrition-backfill.mjs";
import {
  createRecipeNutritionPostgres17CloseoutHarness,
  type RecipeNutritionPostgres17CloseoutHarness,
} from "./fixtures/recipe-nutrition-postgres17-closeout-harness";

const enabled = process.env.HOMECOOK_RECIPE_NUTRITION_PG17_CLOSEOUT === "1";
const TEST_USER_ID = "10000000-0000-4000-8000-000000000017";
const OTHER_USER_ID = "10000000-0000-4000-8000-000000000018";
const MEAL_USER_ID = "10000000-0000-4000-8000-000000000019";
const ROUTE_USER_ID = "10000000-0000-4000-8000-000000000020";
const ROUTE_OTHER_USER_ID = "10000000-0000-4000-8000-000000000021";

const mealRouteState = vi.hoisted(() => ({
  authUser: null as null | {
    id: string;
    email: string;
    app_metadata: Record<string, unknown>;
    user_metadata: Record<string, unknown>;
  },
  serviceClient: null as unknown,
}));

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mealRouteState.authUser } })),
    },
  })),
  createServiceRoleClient: vi.fn(() => mealRouteState.serviceClient),
}));

vi.mock("@/lib/server/user-progress", () => ({
  awardUserProgressEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/user-growth-activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/user-growth-activity")>();
  return {
    ...actual,
    recordUserGrowthActivityEvent: vi.fn(async () => undefined),
  };
});

describe.runIf(enabled)("recipe nutrition PostgreSQL 17 closeout", () => {
  let harness: RecipeNutritionPostgres17CloseoutHarness;

  beforeAll(async () => {
    harness = await createRecipeNutritionPostgres17CloseoutHarness();
    await harness.begin();
    await harness.assertTargetDatabase();
  });

  afterAll(async () => {
    await harness?.rollback();
    await harness?.close();
  });

  it("runs the real FoodSafety-30 engine through dry-run, apply, replay, current switch, and rollback", async () => {
    const before = await harness.readScopeSnapshotState();
    const dryRun = await runFoodSafetyRecipeNutritionBackfill({
      repository: harness.repository,
      mode: "dry-run",
      batchSize: 30,
      afterRecipeId: null,
      calculatedAt: "2026-07-16T00:00:00.000Z",
    });

    expect(dryRun.candidate_count).toBe(30);
    expect(dryRun.processed_count).toBe(0);
    expect(Object.values(dryRun.calculation_status_counts).reduce((sum, count) => sum + count, 0)).toBe(30);
    expect(
      dryRun.calculation_status_counts.partial + dryRun.calculation_status_counts.unavailable,
    ).toBeGreaterThan(0);
    expect(await harness.readScopeSnapshotState()).toEqual(before);

    const prior = await harness.writePriorCurrentSnapshotFromSharedCalculator();
    const applied = await runFoodSafetyRecipeNutritionBackfill({
      repository: harness.repository,
      mode: "apply",
      batchSize: 30,
      afterRecipeId: null,
      calculatedAt: "2026-07-16T00:00:00.000Z",
    });

    expect(applied.processed_count).toBe(30);
    expect(applied.checkpoints.length).toBeGreaterThan(0);
    expect(applied.checkpoints.find((checkpoint) => checkpoint.recipe_id === prior.recipeId))
      .toMatchObject({ previous_snapshot_id: prior.snapshotId, state: "applied" });
    expect(await harness.readCurrentSnapshotId(prior.recipeId)).not.toBe(prior.snapshotId);

    const replay = await runFoodSafetyRecipeNutritionBackfill({
      repository: harness.repository,
      mode: "apply",
      batchSize: 30,
      afterRecipeId: null,
      calculatedAt: "2026-07-16T00:00:00.000Z",
    });
    expect(replay.processed_count).toBe(30);
    expect(replay.checkpoints).toEqual([]);

    await rollbackFoodSafetyRecipeNutritionBackfill({
      repository: harness.repository,
      checkpoints: applied.checkpoints,
    });
    expect(await harness.readCurrentSnapshotId(prior.recipeId)).toBe(prior.snapshotId);
    await harness.restorePriorCurrentSnapshot(prior);
    expect(await harness.readScopeCurrentSnapshotIds()).toEqual(before.currentSnapshotIds);
  }, 60_000);

  it("pins the server-selected current snapshot when a Meal is inserted", async () => {
    await harness.seedUser(MEAL_USER_ID);
    await ensureUserBootstrapState(harness.bootstrapClient, MEAL_USER_ID);
    const recipeId = await harness.readFirstScopeRecipeId();
    const currentSnapshotId = await harness.ensureCurrentSnapshot(recipeId);

    const meal = await harness.insertMeal({ userId: MEAL_USER_ID, recipeId });

    expect(meal.recipeNutritionSnapshotId).toBe(currentSnapshotId);
    expect(meal.nutritionSnapshotOrigin).toBe("created");
  }, 60_000);

  it("uses the actual bootstrap service to create only the owner defaults", async () => {
    await harness.seedUser(OTHER_USER_ID);
    const otherBefore = await harness.readPlannerColumnNames(OTHER_USER_ID);
    await harness.seedUser(TEST_USER_ID);

    const first = await ensureUserBootstrapState(harness.bootstrapClient, TEST_USER_ID);
    const second = await ensureUserBootstrapState(harness.bootstrapClient, TEST_USER_ID);

    expect(await harness.readPlannerColumnNames(TEST_USER_ID)).toEqual(["아침", "점심", "저녁"]);
    expect(await harness.readPlannerColumnNames(OTHER_USER_ID)).toEqual(otherBefore);
    expect(first.settings_json).toMatchObject({ user_bootstrap_version: 3 });
    expect(second.settings_json).toEqual(first.settings_json);
  }, 60_000);

  it("runs the actual Meal route against PostgreSQL 17 owner rows and bootstrap flow", async () => {
    await harness.seedUser(ROUTE_OTHER_USER_ID);
    await ensureUserBootstrapState(harness.bootstrapClient, ROUTE_OTHER_USER_ID);

    const recipeId = await harness.readFirstScopeRecipeId();
    const currentSnapshotId = await harness.ensureCurrentSnapshot(recipeId);
    const otherColumnId = await harness.readPlannerColumnId(ROUTE_OTHER_USER_ID, "아침");
    const otherLeftoverId = await harness.seedLeftoverDish({
      userId: ROUTE_OTHER_USER_ID,
      recipeId,
    });

    mealRouteState.authUser = {
      id: ROUTE_USER_ID,
      email: "route-owner@example.test",
      app_metadata: { provider: "google" },
      user_metadata: { nickname: "route-owner" },
    };
    mealRouteState.serviceClient = harness.mealRouteClient;

    const { POST } = await import("@/app/api/v1/meals/route");
    const createMeal = (columnId: string, leftoverDishId?: string) => POST(new Request(
      "http://localhost:3000/api/v1/meals",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipe_id: recipeId,
          plan_date: "2026-07-16",
          column_id: columnId,
          planned_servings: 2,
          ...(leftoverDishId ? { leftover_dish_id: leftoverDishId } : {}),
        }),
      },
    ));

    expect(await harness.countMealsForUsers([ROUTE_USER_ID, ROUTE_OTHER_USER_ID])).toBe(0);

    const forbiddenColumn = await createMeal(otherColumnId);
    expect(forbiddenColumn.status).toBe(403);
    expect(await harness.countMealsForUsers([ROUTE_USER_ID, ROUTE_OTHER_USER_ID])).toBe(0);
    expect(await harness.readPlannerColumnNames(ROUTE_USER_ID)).toEqual(["아침", "점심", "저녁"]);

    const ownerColumnId = await harness.readPlannerColumnId(ROUTE_USER_ID, "아침");
    const forbiddenLeftover = await createMeal(ownerColumnId, otherLeftoverId);
    expect(forbiddenLeftover.status).toBe(403);
    expect(await harness.countMealsForUsers([ROUTE_USER_ID, ROUTE_OTHER_USER_ID])).toBe(0);

    const created = await createMeal(ownerColumnId);
    const createdBody = await created.json();
    expect(created.status).toBe(201);
    expect(createdBody).toMatchObject({
      success: true,
      data: {
        recipe_id: recipeId,
        column_id: ownerColumnId,
        status: "registered",
        recipe_nutrition_snapshot_id: currentSnapshotId,
      },
      error: null,
    });
    expect(await harness.countMealsForUsers([ROUTE_USER_ID, ROUTE_OTHER_USER_ID])).toBe(1);

    const otherMealId = await harness.seedMeal({
      userId: ROUTE_OTHER_USER_ID,
      recipeId,
      plannedServings: 2,
    });
    const otherMealBefore = await harness.readMealState(otherMealId);
    const { PATCH, DELETE } = await import("@/app/api/v1/meals/[meal_id]/route");
    const context = { params: Promise.resolve({ meal_id: otherMealId }) };

    const forbiddenPatch = await PATCH(new Request(
      `http://localhost:3000/api/v1/meals/${otherMealId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planned_servings: 5 }),
      },
    ), context);
    expect(forbiddenPatch.status).toBe(403);
    expect(await harness.readMealState(otherMealId)).toEqual(otherMealBefore);

    const forbiddenDelete = await DELETE(new Request(
      `http://localhost:3000/api/v1/meals/${otherMealId}`,
      { method: "DELETE" },
    ), context);
    expect(forbiddenDelete.status).toBe(403);
    expect(await harness.readMealState(otherMealId)).toEqual(otherMealBefore);
  }, 60_000);
});
