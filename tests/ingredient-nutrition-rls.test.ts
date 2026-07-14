import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260714143000_ingredient_nutrition_conversion_model.sql";

function migrationSql(): string {
  return existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, "utf8") : "";
}

const TABLES = [
  "nutrient_definitions",
  "nutrition_sources",
  "nutrition_source_items",
  "nutrition_profiles",
  "nutrition_values",
  "ingredient_nutrition_profiles",
  "measurement_conversion_profiles",
  "measurement_source_evidence",
  "ingredient_conversion_assignments",
  "piece_unit_weights",
];

describe("ingredient nutrition migration and RLS", () => {
  it("creates all ten DB v1.3.18 tables with FK, CHECK, and partial active uniqueness", () => {
    const sql = migrationSql();

    for (const table of TABLES) {
      expect(sql, `missing migration table: ${table}`).toMatch(
        new RegExp(`create table public\\.${table}\\b`, "i"),
      );
    }
    expect(sql).toContain("references public.ingredients");
    expect(sql).toContain("references public.users");
    expect(sql).toMatch(/where is_primary and is_active and review_status = 'approved'/i);
    expect(sql).toMatch(/where is_active and review_status = 'approved'/i);
  });

  it("enforces exact VOLUME_G code-weight pairs and rejects cross-pair combinations", () => {
    const sql = migrationSql();

    for (const [code, weight] of [
      ["VOLUME_G6", 6],
      ["VOLUME_G10", 10],
      ["VOLUME_G15", 15],
      ["VOLUME_G20", 20],
      ["VOLUME_G25", 25],
    ] as const) {
      expect(sql).toContain(`code = '${code}' and representative_weight_g = ${weight}`);
    }
    expect(sql).toContain("representative_weight_g in (6, 10, 15, 20, 25)");
  });

  it("denies anon/authenticated/admin viewer direct access and grants only the service boundary", () => {
    const sql = migrationSql();

    for (const table of TABLES) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated`);
      expect(sql).toContain(`grant all privileges on table public.${table} to service_role`);
    }
    expect(sql).not.toMatch(/create policy[\s\S]+admin_members/i);
  });

  it("requires complete decision audit triplets and protects append-only payload and transition history", () => {
    const sql = migrationSql();

    expect(sql).toContain("nullif(btrim(decision_reason), '') is not null");
    expect(sql).toContain("nullif(btrim(assignment_reason), '') is not null");
    expect(sql).toContain("reviewed_by is not null and reviewed_at is not null");
    expect(sql).toMatch(/create function public\.protect_nutrition_model_row\(\)/i);
    expect(sql).toContain("INVALID_REVIEW_TRANSITION");
    expect(sql).toContain("IMMUTABLE_NUTRITION_PAYLOAD");
    expect(sql).toContain("DELETE_NOT_ALLOWED");
  });

  it("exposes atomic service-only apply and disable functions without a public consumer API", () => {
    const sql = migrationSql();
    const disableSql = sql.slice(
      sql.indexOf("create function public.disable_ingredient_nutrition_model"),
    );

    expect(sql).toMatch(/create function public\.apply_ingredient_nutrition_model\(p_model jsonb\)/i);
    expect(sql).toMatch(/create function public\.disable_ingredient_nutrition_model\(/i);
    expect(sql).toContain("revoke all on function public.apply_ingredient_nutrition_model(jsonb) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.apply_ingredient_nutrition_model(jsonb) to service_role");
    expect(sql).toContain("revoke all on function public.disable_ingredient_nutrition_model(text, text, uuid, text, timestamptz) from public, anon, authenticated");
    expect(sql).toContain("'RDA_10_4', 'RDA limited measurement evidence', 'measurement_reference'");
    expect(sql).toMatch(/disable_ingredient_nutrition_model\([\s\S]*p_model_run_key text/i);
    expect(disableSql).toContain("metadata_json ->> 'idempotency_key' = p_model_run_key");
    expect(disableSql).toContain("v_affected_row_ids -> 'nutrition_link_ids'");
    expect(disableSql).toContain("v_affected_row_ids -> 'conversion_assignment_ids'");
    expect(disableSql).toContain("v_affected_row_ids -> 'piece_weight_ids'");
    expect(disableSql).toContain("item.source_id = v_source_id");
    expect(disableSql).not.toContain("p_affected_row_ids");
  });

  it("records version/checksum drift as inactive needs_source_check until explicit supersede", () => {
    const sql = migrationSql();

    expect(sql).toContain("SOURCE_DRIFT_REQUIRES_REVIEW");
    expect(sql).toMatch(/'needs_source_check'[\s\S]*false/);
    expect(sql).toMatch(/source_decision[\s\S]*supersede/);
    expect(sql).toContain("superseded_by_id = v_source_id");
  });
});
