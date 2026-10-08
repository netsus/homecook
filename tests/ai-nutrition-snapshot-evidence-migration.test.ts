import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Offline migration drift checks. Behavioral assertions live in the companion
// SQL file and are run only against the leader's isolated PostgreSQL fixture.
const root = "supabase/migrations/";
const migration = readFileSync(`${root}20261008091000_ai_nutrition_snapshot_evidence.sql`, "utf8");
const originals: Record<string, [string, string]> = {
  "private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)":
    ["20260721213000_use_exact_measurement_bidirectionally.sql", "public.build_recipe_nutrition_input_guard"],
  "private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)":
    ["20260802210000_recipe_content_snapshot_future_propagation.sql", "public.build_recipe_draft_nutrition_predecessor_guard"],
  "private.recipe_nutrition_sources_pre_product_20260922(jsonb)":
    ["20260914230000_recipe_nutrition_v2_piece_and_zero_sources.sql", "public.build_recipe_nutrition_contributing_sources"],
  "public.validate_recipe_nutrition_snapshot_payload(jsonb)":
    ["20260716090000_add_recipe_nutrition_snapshots.sql", "public.validate_recipe_nutrition_snapshot_payload"],
  "private.compact_meal_log_nutrition(text,jsonb,numeric)":
    ["20260810120000_meal_log_core.sql", "private.compact_meal_log_nutrition"],
  "private.resolve_cooked_batch_nutrition(uuid,uuid)":
    ["20260809120000_cooked_batch_weight_ledger.sql", "private.resolve_cooked_batch_nutrition"],
  "private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)":
    ["20260810120000_meal_log_core.sql", "public.mutate_meal_log_entry"],
  "public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text)":
    ["20261006120000_meal_log_nutrition_preview.sql", "public.preview_meal_log_nutrition"],
  "private.estimate_legacy_meal_log_nutrition(uuid,numeric)":
    ["20260919000000_prelaunch_recipe_meal_log_repairs.sql", "private.estimate_legacy_meal_log_nutrition"],
  "private.project_meal_log_entry(public.meal_log_entries)":
    ["20260810120000_meal_log_core.sql", "private.project_meal_log_entry"],
  "public.get_meal_log_day(uuid,timestamptz,text,integer,timestamptz,date)":
    ["20260810120000_meal_log_core.sql", "public.get_meal_log_day"],
};

function body(file: string, name: string) {
  const sql = readFileSync(root + file, "utf8");
  const start = sql.indexOf(`function ${name}(`);
  if (start < 0) throw Error(`Missing canonical function ${name}`);
  const tail = sql.slice(start);
  const marker = /\bas\s+(\$[a-zA-Z_]*\$)/i.exec(tail);
  if (!marker) throw Error(`Missing function body ${name}`);
  const end = tail.indexOf(marker[1], marker.index + marker[0].length);
  if (end < 0) throw Error(`Unclosed function body ${name}`);
  return tail.slice(0, end + marker[1].length);
}

function applyCheckedEdits() {
  const definitions = Object.fromEntries(Object.entries(originals).map(([signature, [file, name]]) =>
    [signature, body(file, name)]));
  const edits = [...migration.matchAll(/\('([^']+)', \$old\$([\s\S]*?)\$old\$, \$new\$([\s\S]*?)\$new\$, (\d+)\)/g)];
  expect(edits.length).toBe(30);
  for (const [, signature, before, after, count] of edits) {
    expect(definitions[signature], signature).toBeDefined();
    expect(definitions[signature].split(before).length - 1, `${signature}: ${before}`).toBe(Number(count));
    definitions[signature] = definitions[signature].split(before).join(after);
  }
  return definitions;
}

describe("AI nutrition SQL consumer migration", () => {
  it("has exactly matching anchors in all current/frozen canonical definitions", () => {
    expect(Object.keys(applyCheckedEdits())).toHaveLength(11);
    expect(migration).toContain("AI_NUTRITION_MIGRATION_FUNCTION_MISSING");
    expect(migration).toContain("AI_NUTRITION_MIGRATION_ANCHOR_MISMATCH");
  });

  it("preserves snapshot schema, six-field sources, product failure and stored history", () => {
    const definitions = applyCheckedEdits();
    const validator = definitions["public.validate_recipe_nutrition_snapshot_payload(jsonb)"];
    const oldValidator = body(...originals["public.validate_recipe_nutrition_snapshot_payload(jsonb)"]);
    const topKeys = /v_required_top_keys text\[\] := array\[[\s\S]*?\];/;
    expect(validator.match(topKeys)?.[0]).toBe(oldValidator.match(topKeys)?.[0]);
    expect(validator).toContain("'data_basis_date', 'dataset', 'license', 'provider', 'source_url', 'source_version'");
    expect(migration).not.toMatch(/\b(update|delete from|insert into)\s+(public\.)?(meal_log_entries|recipe_nutrition_snapshots|nutrition_values|meals)\b/i);
    expect(migration).not.toMatch(/\bgrant\s+execute\b|create(?: or replace)? function public\./i);
    const draft = definitions["private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)"];
    expect(draft).not.toContain("'food_product_id', case when product_link.id is null");
    expect(draft).toContain("'food_product_id', ingredient.ingredient -> 'food_product_id'");
  });

  it("prefers official profiles for new direct entries and previews without changing old pins", () => {
    const definitions = applyCheckedEdits();
    const mutation = definitions["private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)"];
    expect(mutation).toContain("v_ingredient_profile:=v_entry.ingredient_nutrition_profile_id;");
    expect(mutation).toContain("else select private.preferred_meal_log_ingredient_profile(v_source_id) into v_ingredient_profile; end if;");
    expect(definitions["public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text)"])
      .toContain("select private.preferred_meal_log_ingredient_profile(p_source_id) into v_profile;");
    expect(migration).toContain("case when source.provider_code = 'HOMECOOK_AI_ESTIMATE' then 1 else 0 end");
    expect(migration).toContain("revoke all on function private.preferred_meal_log_ingredient_profile(uuid)");
  });

  it("keeps candidate/hash shape intact while limiting selection to official candidates first", () => {
    const definitions = applyCheckedEdits();
    for (const signature of Object.keys(definitions).filter(key => key.includes("_guard_pre_product"))) {
      const sql = definitions[signature];
      expect(sql).toContain("'nutrition_candidates', nutrition.candidates");
      expect(sql).toContain("from jsonb_array_elements(nutrition.candidates) official");
      expect(sql).toContain("preferred.mass_count = 1");
      expect(sql).not.toContain("nutrition.mass_count = 1");
    }
  });
});
