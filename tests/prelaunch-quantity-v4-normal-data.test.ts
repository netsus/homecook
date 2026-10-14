import { describe, expect, it } from "vitest";
import {
  assertQuantityV4Columns, QUANTITY_V4_COLUMN_METADATA,
  QUANTITY_V4_NORMAL_COLUMNS, QUANTITY_V4_NORMAL_DATA_SQL,
} from "../scripts/lib/prelaunch-database.mjs";

// SQL execution, exact numeric/null/JSON cases and chunk boundaries are exercised
// separately in the owned PostgreSQL17 rehearsal; ordinary units do not seed millions of rows.
const tables = [
  "public.ingredient_nutrition_profiles", "public.measurement_source_evidence", "public.meal_log_entries",
  "public.product_planner_entries", "public.recipe_ingredients",
  "public.recipes", "public.recipe_sources", "public.recipe_steps", "public.recipe_step_cooking_methods",
  "public.recipe_tags", "public.tags", "public.recipe_change_previews", "public.food_products",
  "public.food_product_nutrition_versions", "public.food_product_ingredient_links", "public.ingredients",
  "public.nutrient_definitions", "public.nutrition_sources", "public.nutrition_source_items", "public.nutrition_profiles",
  "public.nutrition_values", "public.measurement_conversion_profiles", "public.ingredient_conversion_assignments",
  "public.piece_unit_weights", "public.meals", "public.meal_plan_columns", "public.cooking_sessions",
  "public.cooking_session_meals", "public.cooking_session_meal_claims", "public.leftover_dishes",
  "public.cooked_batch_quantity_events", "public.recipe_content_snapshots", "public.recipe_nutrition_snapshots",
  "private.cooked_batch_weight_evidence", "public.mutation_idempotency_keys", "private.youtube_saved_recipe_result_mutations",
  "public.pantry_items", "public.shopping_lists", "public.shopping_list_recipes", "public.shopping_list_items",
  "public.shopping_meal_snapshot_clone_tokens",
];
const fixedMetadata = QUANTITY_V4_COLUMN_METADATA as readonly (readonly [string, [string, string, boolean, string | null][]])[];
function metadata(after = false) {
  return fixedMetadata.map(([table, columns]) => ({
    table,
    columns: columns.map(([name, type, not_null, defaultValue]) => ({
      name, type: after && table === "public.product_planner_entries" && name === "quantity_amount" ? "numeric" : type,
      not_null, default: defaultValue,
    })).concat(after ? [{
      name: QUANTITY_V4_NORMAL_COLUMNS.find((row: { table: string }) => row.table === table)!.added,
      type: "jsonb", not_null: false, default: null,
    }] : []),
  }));
}

describe("C04 fixed normal-data projection", () => {
  it("covers the exact 41 relations in one statement and preserves the existing five projections", () => {
    expect([...QUANTITY_V4_NORMAL_DATA_SQL.matchAll(/jsonb_build_array\('(public|private)\.([a-z_]+)'/gu)]
      .map(match => `${match[1]}.${match[2]}`)).toEqual(tables);
    expect(QUANTITY_V4_NORMAL_DATA_SQL.split(";")).toHaveLength(2);
    for (const [table, columns] of fixedMetadata) {
      const projected = QUANTITY_V4_NORMAL_COLUMNS.find((row: { table: string }) => row.table === table)!;
      expect(projected.columns.split(",")).toEqual(columns.map(([name]) => name));
      expect(QUANTITY_V4_NORMAL_DATA_SQL).toContain(`FROM (SELECT ${projected.columns} FROM ${table}) t`);
      expect(projected.columns.split(",")).not.toContain(projected.added);
    }
  });

  it("uses canonical UTF8 rows and fixed binary chunks without removing duplicates or JSON values", () => {
    expect(QUANTITY_V4_NORMAL_DATA_SQL.match(/quantity-v4-row-sha256-chunks-v1/gu)).toHaveLength(41);
    expect(QUANTITY_V4_NORMAL_DATA_SQL.match(/sha256\(convert_to\(to_jsonb\(t\)::text,'UTF8'\)\)/gu)).toHaveLength(41);
    expect(QUANTITY_V4_NORMAL_DATA_SQL.match(/string_agg\(row_hash,''::bytea ORDER BY row_number\)/gu)).toHaveLength(41);
    expect(QUANTITY_V4_NORMAL_DATA_SQL.match(/\(row_number-1\)\/16384 AS chunk_index,count\(\*\)/gu)).toHaveLength(41);
    expect(QUANTITY_V4_NORMAL_DATA_SQL).not.toMatch(/\bDISTINCT\b|jsonb_strip_nulls|jsonb_agg\(to_jsonb\(t\)|\bLIMIT\b/iu);
  });

  it("keeps the exact predecessor and both post-stage column contracts", () => {
    for (const count of [221, 226, 227]) {
      const rows = metadata(count !== 221);
      expect(assertQuantityV4Columns(rows, count)).toBe(rows);
    }
  });

  it.each(QUANTITY_V4_NORMAL_COLUMNS.map((row: { table: string }) => row.table))(
    "rejects an excluded unknown column on %s", table => {
      const rows = metadata(true);
      rows.find((row: { table: string }) => row.table === table)!.columns.push({
        name: "unreviewed_column", type: "text", not_null: false, default: null,
      });
      expect(() => assertQuantityV4Columns(rows, 226)).toThrow(/unknown columns/);
    },
  );

  it("rejects original column loss/type drift and metadata default/nullability drift", () => {
    const missing = metadata(); missing[0].columns.pop();
    expect(() => assertQuantityV4Columns(missing, 221)).toThrow(/unknown columns/);
    const wrongType = metadata(); wrongType[0].columns[0].type = "text";
    expect(() => assertQuantityV4Columns(wrongType, 221)).toThrow(/fingerprint differs/);
    const required = metadata(true); required[0].columns.at(-1)!.not_null = true;
    expect(() => assertQuantityV4Columns(required, 227)).toThrow(/nullability/);
    const defaulted = metadata(true); defaulted[0].columns.at(-1)!.default = "'{}'::jsonb";
    expect(() => assertQuantityV4Columns(defaulted, 227)).toThrow(/default differs/);
  });
});
