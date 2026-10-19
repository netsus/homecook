import { describe, expect, it } from "vitest";
import { projectMealRecipeSnapshot, type MealRecipeSnapshotRow } from "@/lib/server/meal-recipe-snapshot";

const ingredient = { ingredient_id: "tofu", amount: 3, unit: "g", ingredient_type: "QUANT",
  display_text: null, scalable: true, sort_order: 0 };
const step = { step_number: 1, instruction: "끓이기", ingredients_used: [], heat_level: null,
  duration_seconds: null, duration_text: null, cooking_methods: null };
const snapshot = { id: "snapshot", recipe_id: "recipe", owner_user_id: "owner", title: "고정 제목",
  base_servings: 2, ingredients_json: [ingredient], steps_json: [step] };

function project(snapshotChanges: Record<string, unknown> = {}, rowChanges: Record<string, unknown> = {}) {
  // Intentionally feed decoded malformed JSON through the old declared boundary.
  // This single assertion is a behavior probe, not evidence that its row shape is valid.
  const row: unknown = { id: "meal", user_id: "owner", recipe_id: "recipe",
    recipe_content_snapshot_id: "snapshot", planned_servings: 4,
    recipe_content_snapshots: { ...snapshot, ...snapshotChanges }, ...rowChanges };
  return projectMealRecipeSnapshot(row as MealRecipeSnapshotRow, "owner", new Map([["tofu", "두부"]]));
}

describe("snapshot decoded JSON baseline behavior (not a new validation policy)", () => {
  it.each([null, false, 42, "text", {}, []])("rejects an unpinned snapshot container %j", value => {
    expect(project({}, { recipe_content_snapshots: value })).toBeNull();
  });

  it.each([null, false, 42, "text", {}])("rejects non-array ingredient/step containers %j", value => {
    expect(project({ ingredients_json: value })).toBeNull();
    expect(project({ steps_json: value })).toBeNull();
  });

  it.each([
    { row: { user_id: "other" }, snap: {} },
    { row: { recipe_id: "other" }, snap: {} },
    { row: { recipe_content_snapshot_id: null }, snap: {} },
    { row: {}, snap: { id: "other" } },
    { row: {}, snap: { recipe_id: "other" } },
    { row: {}, snap: { owner_user_id: "other" } },
    { row: {}, snap: { owner_user_id: undefined } },
    { row: {}, snap: { base_servings: 0 } },
    { row: { planned_servings: 0 }, snap: {} },
  ])("rejects ownership/pin/positive-serving mismatch %#", ({ row, snap }) => {
    expect(project(snap, row)).toBeNull();
  });

  it("uses only the first joined snapshot and permits a public owner", () => {
    expect(project({}, { recipe_content_snapshots: [{ ...snapshot, owner_user_id: null }, null] }))
      .toMatchObject({ title: "고정 제목", ingredients: [{ amount: 6, standard_name: "두부" }] });
  });

  it.each(["ingredients_json", "steps_json"])("throws for a null %s element rather than silently dropping it", key => {
    expect(() => project({ [key]: [null] })).toThrow(TypeError);
  });

  it.each([42, "text", {}, []])("accepts malformed non-null ingredient %j without inventing a valid row", value => {
    const result = project({ ingredients_json: [value] });
    expect(result?.ingredients).toHaveLength(1);
    expect(result?.ingredients[0]).toMatchObject({ standard_name: "재료", amount: NaN, scalable: true });
  });

  it.each([42, "text", {}, []])("accepts malformed non-null step %j with absent scalar fields", value => {
    expect(project({ steps_json: [value] })?.steps[0])
      .toMatchObject({ instruction: undefined, step_number: undefined, ingredients_used: [] });
  });

  it("preserves existing multiplication coercion for serving and scalable amount strings", () => {
    const result = project({ base_servings: "2", ingredients_json: [{ ...ingredient, amount: "3", scalable: "false" }] },
      { planned_servings: "4" });
    expect(result).toMatchObject({ planned_servings: "4", ingredients: [{ amount: 6, scalable: "false", display_text: "두부 6g" }] });
  });

  it("does not coerce the unscaled amount string before existing formatting", () => {
    expect(() => project({ ingredients_json: [{ ...ingredient, amount: "3", scalable: false }] })).toThrow(TypeError);
  });

  it("preserves null quantities, nullable scalable default and sub-one serving branch", () => {
    expect(project({ ingredients_json: [{ ...ingredient, amount: null, scalable: null }] })?.ingredients[0])
      .toMatchObject({ amount: null, scalable: true, display_text: null });
    expect(project({ base_servings: 0.5 })?.ingredients[0].amount).toBe(3);
  });

  it("keeps an unused numeric display label and raw truthy numeric unit", () => {
    expect(project({ ingredients_json: [{ ...ingredient, display_text: 42, unit: 42 }] })?.ingredients[0])
      .toMatchObject({ amount: 6, unit: 42, display_text: "두부 642" });
  });

  it("keeps a numeric text fallback until a section prefix actually consumes it", () => {
    const input = { ...ingredient, ingredient_type: "TO_TASTE", display_text: 42 };
    expect(project({ ingredients_json: [input] })?.ingredients[0].display_text).toBe(42);
    expect(() => project({ ingredients_json: [{ ...input, component_label: "고명" }] })).toThrow(TypeError);
  });

  it("keeps a numeric instruction until a section prefix actually consumes it", () => {
    expect(project({ steps_json: [{ ...step, instruction: 42 }] })?.steps[0].instruction).toBe(42);
    expect(() => project({ steps_json: [{ ...step, instruction: 42, component_label: "고명" }] })).toThrow(TypeError);
  });

  it("does not validate or synthesize step ingredient references", () => {
    expect(project({ steps_json: [{ ...step, ingredients_used: [null, 42, {}] }] })?.steps[0].ingredients_used)
      .toEqual([null, 42, {}]);
    expect(project({ steps_json: [{ ...step, ingredients_used: "tofu" }] })?.steps[0].ingredients_used).toEqual([]);
  });
});
