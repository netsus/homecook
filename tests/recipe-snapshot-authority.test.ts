import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");

function readMigrationSource() {
  return readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(join(migrationsDirectory, fileName), "utf8"))
    .join("\n");
}

describe("recipe content snapshot authority", () => {
  it("installs an additive immutable content authority without duplicating nutrition vectors", () => {
    const sql = readMigrationSource();

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

    const contentTable = sql.match(
      /create table(?: if not exists)? public\.recipe_content_snapshots\s*\(([\s\S]*?)\n\);/i,
    )?.[1] ?? "";
    expect(
      /scalable_values_json|fixed_values_json|nutrient_status_json|warnings_json|sources_json/i
        .test(contentTable),
      "content snapshots must not duplicate nutrition payloads",
    ).toBe(false);
  });

  it("pins product provenance and visible ingredient/step metadata in the immutable payload", () => {
    const sql = readFileSync(
      join(
        migrationsDirectory,
        "20260729170500_recipe_snapshot_authority_foundation.sql",
      ),
      "utf8",
    );

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
    const sql = readMigrationSource();

    expect(
      /create table public\.recipe_nutrition_snapshots[\s\S]*recipe_id uuid not null references public\.recipes\s*\(id\) on delete restrict/i
        .test(sql),
      "nutrition recipe identity must remain NOT NULL/RESTRICT",
    ).toBe(true);
    expect(
      /unique\s*\(\s*recipe_id,\s*input_hash,\s*calculation_version\s*\)/i
        .test(sql),
      "ordinary nutrition dedupe unique was removed",
    ).toBe(true);
    expect(
      /create unique index recipe_nutrition_snapshots_current_idx[\s\S]*\(\s*recipe_id\s*\)\s*where is_current/i
        .test(sql),
      "current nutrition partial unique was removed",
    ).toBe(true);
    expect(
      /write_recipe_nutrition_snapshot[\s\S]*on conflict\s*\(\s*recipe_id,\s*input_hash,\s*calculation_version\s*\)/i
        .test(sql),
      "nutrition writer no longer uses the ordinary predicate-free conflict target",
    ).toBe(true);
  });

  it("installs the Meal, session, claim, and leftover dark schema without replacing legacy v1", () => {
    const sql = readMigrationSource();

    expect(
      /alter table public\.meals[\s\S]*add column(?: if not exists)? revision bigint not null default 1/i
        .test(sql),
      "Meals need a server-owned monotonic revision",
    ).toBe(true);
    expect(
      /alter table public\.cooking_sessions[\s\S]*contract_version[\s\S]*legacy_v1[\s\S]*snapshot_v2/i
        .test(sql),
      "cooking sessions need an additive legacy_v1/snapshot_v2 discriminator",
    ).toBe(true);
    expect(
      /alter table public\.cooking_sessions[\s\S]*session_kind[\s\S]*recipe_id[\s\S]*recipe_content_snapshot_id[\s\S]*cooking_servings[\s\S]*base_recipe_revision/i
        .test(sql),
      "snapshot-v2 session pins are incomplete",
    ).toBe(true);
    expect(
      /alter table public\.cooking_session_meals[\s\S]*meal_revision_snapshot/i.test(sql),
      "planner session meals must pin the Meal revision",
    ).toBe(true);
    expect(
      /alter table public\.leftover_dishes[\s\S]*recipe_content_snapshot_id uuid[\s\S]*on delete restrict/i
        .test(sql),
      "leftover batches must pin content with a RESTRICT FK",
    ).toBe(true);

    const leftoverChanges = sql.match(
      /alter table public\.leftover_dishes([\s\S]*?);/gi,
    )?.join("\n") ?? "";
    expect(
      /recipe_nutrition_snapshot_id/i.test(leftoverChanges),
      "leftover batches must not gain a competing direct nutrition FK",
    ).toBe(false);
  });

  it("keeps planner and standalone snapshot-v2 shapes distinct and pins sessions immutably", () => {
    const sql = readMigrationSource();

    expect(
      /snapshot_v2[\s\S]*session_kind\s*=\s*'planner'[\s\S]*base_recipe_revision\s+is\s+null/i
        .test(sql),
      "planner snapshot-v2 rows must not fabricate a standalone recipe revision",
    ).toBe(true);
    expect(
      /snapshot_v2[\s\S]*session_kind\s*=\s*'standalone'[\s\S]*base_recipe_revision\s+is\s+not\s+null/i
        .test(sql),
      "standalone snapshot-v2 rows must require the expected recipe revision",
    ).toBe(true);
    expect(
      /cooking_session[\s\S]*(immutable|mutation)[\s\S]*before update/i.test(sql),
      "snapshot-v2 session pins need an immutable update guard",
    ).toBe(true);
    expect(
      /planner[\s\S]*(at least one|count\(\*\)|exists)[\s\S]*cooking_session_meals/i
        .test(sql),
      "planner sessions must require at least one session-meal association",
    ).toBe(true);
    expect(
      /standalone[\s\S]*(zero|not exists)[\s\S]*cooking_session_meals/i
        .test(sql),
      "standalone sessions must reject session-meal associations",
    ).toBe(true);
  });

  it("installs reader-first compatibility mirror and an idempotent direct-N-preserving backfill", () => {
    const sql = readMigrationSource();

    expect(
      /recipe_content_snapshot_mirror[\s\S]*recipe_nutrition_snapshot_id[\s\S]*(null|mismatch|equal)/i
        .test(sql),
      "content/direct nutrition mirror validation is missing",
    ).toBe(true);
    expect(
      /backfill_meal_recipe_content_snapshots[\s\S]*registered[\s\S]*shopping_done[\s\S]*legacy_backfill/i
        .test(sql),
      "eligible Meal content backfill is missing",
    ).toBe(true);
    expect(
      /backfill_meal_recipe_content_snapshots[\s\S]*insert into public\.recipe_content_snapshots[\s\S]*update public\.meals/i
        .test(sql),
      "backfill must create or reuse content snapshots before pinning Meals",
    ).toBe(true);
    expect(
      /backfill_meal_recipe_content_snapshots[\s\S]*set_config[\s\S]*recipe_(?:content|snapshot)_backfill/i
        .test(sql),
      "backfill must use a server-owned transaction-local mutation guard",
    ).toBe(true);
  });

  it("keeps Meal revision server-owned and monotonic", () => {
    const sql = readMigrationSource();

    expect(
      /meal[\s\S]*revision[\s\S]*(server|monotonic|immutable)[\s\S]*before update on public\.meals/i
        .test(sql),
      "Meal revision lacks a server-owned monotonic update trigger",
    ).toBe(true);
    expect(
      /new\.revision[\s\S]*old\.revision\s*\+\s*1/i.test(sql),
      "Meal updates do not derive exactly the next revision",
    ).toBe(true);
  });
});
