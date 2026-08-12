import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadRecipeSnapshotMigrationSources,
  readRecipeSnapshotMigrationSources,
} from "./helpers/recipe-snapshot-migration-source";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
const migrations = readRecipeSnapshotMigrationSources(migrationsDirectory);

function extractRange(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  if (start < 0) return "";
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end < 0 ? "" : source.slice(start, end + endMarker.length);
}

function extractFunction(source: string, signature: string) {
  return extractRange(source, signature, "\n$$;");
}

describe("recipe content snapshot authority", () => {
  it("loads only the two migrations that own the asserted contracts", () => {
    const reads: string[] = [];
    loadRecipeSnapshotMigrationSources({
      migrationsDirectory: "/isolated/migrations",
      readFile(filePath) {
        reads.push(filePath);
        return filePath;
      },
    });

    expect(reads).toEqual([
      "/isolated/migrations/20260716090000_add_recipe_nutrition_snapshots.sql",
      "/isolated/migrations/20260729170500_recipe_snapshot_authority_foundation.sql",
    ]);
  });

  it("installs an additive immutable content authority without duplicating nutrition vectors", () => {
    const sql = migrations.authority;

    expect(
      /create table(?: if not exists)? public\.recipe_content_snapshots/i.test(sql),
      "recipe_content_snapshots table is missing",
    ).toBe(true);
    expect(
      /recipe_id uuid not null references public\.recipes\s*\(id\) on delete restrict/i.test(sql),
      "content snapshot recipe FK must remain NOT NULL/RESTRICT",
    ).toBe(true);
    expect(
      /recipe_nutrition_snapshot_id uuid references public\.recipe_nutrition_snapshots\s*\(id\) on delete restrict/i
        .test(sql),
      "content snapshot must pin only the exact nutrition snapshot FK",
    ).toBe(true);
    expect(
      /unique nulls not distinct\s*\(\s*recipe_id,\s*content_hash,\s*recipe_nutrition_snapshot_id,\s*schema_version\s*\)/i
        .test(sql),
      "content identity must dedupe nullable nutrition pins",
    ).toBe(true);

    const contentTable = extractRange(
      sql,
      "create table if not exists public.recipe_content_snapshots (",
      "\n);",
    );
    expect(
      /scalable_values_json|fixed_values_json|nutrient_status_json|warnings_json|sources_json/i
        .test(contentTable),
      "content snapshots must not duplicate nutrition payloads",
    ).toBe(false);
  });

  it("pins product provenance and visible ingredient/step metadata in the immutable payload", () => {
    const sql = migrations.authority;

    for (const ingredientField of [
      "component_label",
      "food_product_id",
      "food_product_nutrition_version_id",
      "food_product_name",
      "food_product_brand",
    ]) {
      expect(sql, `content ingredient payload is missing ${ingredientField}`).toContain(
        `'${ingredientField}'`,
      );
    }

    for (const stepField of [
      "component_label",
      "heat_level",
      "duration_seconds",
      "duration_text",
      "cooking_methods",
    ]) {
      expect(sql, `content step payload is missing ${stepField}`).toContain(
        `'${stepField}'`,
      );
    }
    expect(sql).toContain("recipe_step_cooking_methods");
  });

  it("preserves the existing nutrition FK, ordinary unique, current partial unique, and writer inference", () => {
    const sql = migrations.nutrition;
    const nutritionTable = extractRange(
      sql,
      "create table public.recipe_nutrition_snapshots (",
      "\n);",
    );
    const currentIndex = extractRange(
      sql,
      "create unique index recipe_nutrition_snapshots_current_idx",
      ";",
    );
    const writer = extractFunction(
      sql,
      "create function public.write_recipe_nutrition_snapshot(",
    );

    expect(
      /recipe_id uuid not null references public\.recipes\s*\(id\) on delete restrict/i
        .test(nutritionTable),
      "nutrition recipe identity must remain NOT NULL/RESTRICT",
    ).toBe(true);
    expect(
      /unique\s*\(\s*recipe_id,\s*input_hash,\s*calculation_version\s*\)/i
        .test(nutritionTable),
      "ordinary nutrition dedupe unique was removed",
    ).toBe(true);
    expect(
      /\(\s*recipe_id\s*\)\s*where is_current/i.test(currentIndex),
      "current nutrition partial unique was removed",
    ).toBe(true);
    expect(
      /on conflict\s*\(\s*recipe_id,\s*input_hash,\s*calculation_version\s*\)/i
        .test(writer),
      "nutrition writer no longer uses the ordinary predicate-free conflict target",
    ).toBe(true);
  });

  it("installs the Meal, session, claim, and leftover dark schema without replacing legacy v1", () => {
    const sql = migrations.authority;
    const mealColumns = extractRange(
      sql,
      "alter table public.meals\n  add column if not exists recipe_content_snapshot_id",
      ";",
    );
    const sessionColumns = extractRange(
      sql,
      "alter table public.cooking_sessions\n  add column if not exists contract_version",
      ";",
    );
    const sessionMealColumns = extractRange(
      sql,
      "alter table public.cooking_session_meals",
      ";",
    );
    const leftoverColumns = extractRange(
      sql,
      "alter table public.leftover_dishes",
      ";",
    );

    expect(
      /add column(?: if not exists)? revision bigint not null default 1/i
        .test(mealColumns),
      "Meals need a server-owned monotonic revision",
    ).toBe(true);
    expect(
      sessionColumns.includes("contract_version varchar(20) not null default 'legacy_v1'")
        && sql.includes("check (contract_version in ('legacy_v1', 'snapshot_v2'))"),
      "cooking sessions need an additive legacy_v1/snapshot_v2 discriminator",
    ).toBe(true);
    expect(
      /session_kind[^;]*recipe_id[^;]*recipe_content_snapshot_id[^;]*cooking_servings[^;]*base_recipe_revision/i
        .test(sessionColumns),
      "snapshot-v2 session pins are incomplete",
    ).toBe(true);
    expect(
      /meal_revision_snapshot/i.test(sessionMealColumns),
      "planner session meals must pin the Meal revision",
    ).toBe(true);
    expect(
      /recipe_content_snapshot_id uuid[^;]*on delete restrict/i.test(leftoverColumns),
      "leftover batches must pin content with a RESTRICT FK",
    ).toBe(true);

    expect(
      /recipe_nutrition_snapshot_id/i.test(leftoverColumns),
      "leftover batches must not gain a competing direct nutrition FK",
    ).toBe(false);
  });

  it("keeps planner and standalone snapshot-v2 shapes distinct and pins sessions immutably", () => {
    const sql = migrations.authority;
    const shapeConstraint = extractRange(
      sql,
      "add constraint cooking_sessions_snapshot_v2_shape_check",
      "end if;",
    );
    const immutableGuard = extractFunction(
      sql,
      "create or replace function public.protect_cooking_session_snapshot_v2_mutation()",
    );
    const associationGuard = extractFunction(
      sql,
      "create or replace function public.validate_cooking_session_snapshot_v2_association()",
    );

    expect(
      /session_kind\s*=\s*'planner'[^)]*base_recipe_revision\s+is\s+null/i
        .test(shapeConstraint),
      "planner snapshot-v2 rows must not fabricate a standalone recipe revision",
    ).toBe(true);
    expect(
      /session_kind\s*=\s*'standalone'[^)]*base_recipe_revision\s+is\s+not\s+null/i
        .test(shapeConstraint),
      "standalone snapshot-v2 rows must require the expected recipe revision",
    ).toBe(true);
    expect(
      /(immutable|mutation)/i.test(immutableGuard)
        && sql.includes("create trigger cooking_session_snapshot_v2_immutable_mutation_guard\nbefore update"),
      "snapshot-v2 session pins need an immutable update guard",
    ).toBe(true);
    expect(
      /planner[^;]*(at least one|count\(\*\)|exists)[^;]*cooking_session_meals/i
        .test(associationGuard),
      "planner sessions must require at least one session-meal association",
    ).toBe(true);
    expect(
      /standalone[^;]*(zero|not exists)[^;]*cooking_session_meals/i
        .test(associationGuard),
      "standalone sessions must reject session-meal associations",
    ).toBe(true);
  });

  it("installs reader-first compatibility mirror and an idempotent direct-N-preserving backfill", () => {
    const sql = migrations.authority;
    const mirror = extractFunction(
      sql,
      "create or replace function public.recipe_content_snapshot_mirror()",
    );
    const backfill = extractFunction(
      sql,
      "create or replace function public.backfill_meal_recipe_content_snapshots()",
    );

    expect(
      /recipe_nutrition_snapshot_id[^;]*(null|mismatch|equal)/i.test(mirror),
      "content/direct nutrition mirror validation is missing",
    ).toBe(true);
    expect(
      /registered[^;]*shopping_done[^;]*legacy_backfill/i.test(backfill),
      "eligible Meal content backfill is missing",
    ).toBe(true);
    expect(
      /insert into public\.recipe_content_snapshots[^;]*update public\.meals/i.test(backfill),
      "backfill must create or reuse content snapshots before pinning Meals",
    ).toBe(true);
    expect(
      /set_config\([^;]*recipe_(?:content|snapshot)_backfill/i.test(backfill),
      "backfill must use a server-owned transaction-local mutation guard",
    ).toBe(true);
  });

  it("keeps Meal revision server-owned and monotonic", () => {
    const sql = migrations.authority;
    const revisionGuard = extractFunction(
      sql,
      "create or replace function public.bump_meal_revision()",
    );

    expect(
      /revision/i.test(revisionGuard)
        && sql.includes("create trigger meals_revision_server_guard\nbefore update on public.meals"),
      "Meal revision lacks a server-owned monotonic update trigger",
    ).toBe(true);
    expect(
      /new\.revision\s*:=\s*old\.revision\s*\+\s*1/i.test(revisionGuard),
      "Meal updates do not derive exactly the next revision",
    ).toBe(true);
  });
});
