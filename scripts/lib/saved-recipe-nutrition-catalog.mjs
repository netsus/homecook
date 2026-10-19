import { createHash } from "node:crypto";
import { canonicalCookingCatalogSql } from "./cooking-catalog-comparison.mjs";

export const SAVED_RECIPE_NUTRITION_CATALOG_SOURCE_URL = import.meta.url;
export const SAVED_RECIPE_NUTRITION_FUNCTION_SIGNATURES = Object.freeze([
  "private.cooking_quantity_json_echo(jsonb)",
  "private.project_youtube_saved_recipe_ingredient_links(public.youtube_saved_recipe_results)",
  "private.project_youtube_saved_recipe_result(public.youtube_saved_recipe_results)",
  "private.sync_youtube_saved_recipe_canonical()",
  "private.validate_youtube_saved_recipe_editable_content(jsonb,jsonb)",
  "public.build_recipe_nutrition_input_guard(uuid)",
  "public.read_public_youtube_saved_recipe_detail(uuid)",
  "public.save_cooking_execution_quantities(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,timestamp with time zone)",
  "public.start_snapshot_v2_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,text,uuid[],jsonb,uuid,bigint,numeric,timestamp with time zone)",
  "public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamp with time zone,jsonb)",
]);

// The original three queries and cooking's original remainder are unchanged.
// Canonicalization only handles their previously diagnosed restore differences.
export function canonicalSavedRecipeNutritionCatalogSql(sql) {
  return canonicalCookingCatalogSql(sql);
}

// This is a native comparison: no table, scope function, ACL, role or column
// representation is omitted or normalized. Only these ten function OIDs vary.
export function unchangedSavedRecipeNutritionCatalogSql(sql) {
  if (typeof sql !== "string" || createHash("sha256").update(sql).digest("hex") !== "2e7deb2361f3311aab30aea9687af3b296780c9543b273ec71526ef9c524c399") {
    throw new Error("Saved nutrition remainder requires the fixed complete catalog query");
  }
  const anchor = "AND n.nspname IN ('public','private','auth'))";
  if (sql.split(anchor).length !== 2) throw new Error("Saved nutrition catalog anchor differs");
  const omit = SAVED_RECIPE_NUTRITION_FUNCTION_SIGNATURES.map(signature => `to_regprocedure('${signature}')`).join(",");
  return sql.replace(anchor, `AND n.nspname IN ('public','private','auth') AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[${omit}]::oid[]) allowed(oid) WHERE allowed.oid=p.oid))`);
}
