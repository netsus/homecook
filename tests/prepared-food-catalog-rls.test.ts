import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260716120000_prepared_food_catalog.sql",
);

function readMigration() {
  expect(existsSync(migrationPath), "prepared food catalog migration must exist").toBe(true);
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

describe("prepared food catalog database contract", () => {
  it("creates the official product and immutable version tables without planner scope", () => {
    const sql = readMigration();
    expect(sql).toMatch(/create table public\.food_products/i);
    expect(sql).toMatch(/create table public\.food_product_nutrition_versions/i);
    expect(sql).not.toMatch(/create table public\.product_planner_entries/i);
    expect(sql).toMatch(/current_nutrition_version_id uuid not null/i);
    expect(sql).toMatch(/foreign key \(id, current_nutrition_version_id\)/i);
    expect(sql).toMatch(/unique \(product_id, version\)/i);
    expect(sql).toMatch(/unique \(product_id, nutrition_profile_id\)/i);
  });

  it("locks public/private ownership, stable keys, manual relations, and append-only payloads", () => {
    const sql = readMigration();
    expect(sql).toMatch(/visibility = 'public'[\s\S]*source_type = 'public_dataset'[\s\S]*owner_user_id is null/i);
    expect(sql).toMatch(/visibility = 'private'[\s\S]*source_type = 'manual'[\s\S]*owner_user_id is not null/i);
    expect(sql).toMatch(/external_product_key/i);
    expect(sql).toMatch(/validate_food_product_basis_relations/i);
    expect(sql).toMatch(/IMMUTABLE_PRODUCT_NUTRITION_VERSION/i);
    expect(sql).toMatch(/protect_food_product_nutrition_version/i);
  });

  it("provides atomic RPCs and current-version compare-and-switch conflict protection", () => {
    const sql = readMigration();
    expect(sql).toMatch(/create function public\.create_manual_food_product/i);
    expect(sql).toMatch(/create function public\.update_manual_food_product/i);
    expect(sql).toMatch(/create function public\.delete_manual_food_product/i);
    expect(sql).toMatch(/create function public\.list_food_products/i);
    expect(sql).toMatch(/NUTRITION_VERSION_CONFLICT/i);
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(/current_nutrition_version_id = p_expected_current_version_id/i);
  });

  it("keeps catalog projection set-based and binds a public key to its pinned source item", () => {
    const sql = readMigration();
    const listStart = sql.indexOf("create function public.list_food_products");
    const listEnd = sql.indexOf("alter table public.food_products enable row level security");
    const listFunction = sql.slice(listStart, listEnd);
    expect(listFunction).toMatch(/with eligible as materialized/i);
    expect(listFunction).toMatch(/core_values as/i);
    expect(listFunction).toMatch(/optional_values as/i);
    expect(listFunction).not.toMatch(/food_product_payload\s*\(/i);
    expect(listFunction).toMatch(/admitted_item\.external_item_key = product\.external_product_key/i);
    expect(listFunction).toMatch(/admitted_source\.freshness_status = 'current'/i);
    expect(listFunction).toMatch(/admitted_source\.review_status = 'approved'/i);
    expect(sql).toMatch(/item\.external_item_key = new\.external_product_key/i);
  });

  it("enables RLS and denies direct immutable mutations", () => {
    const sql = readMigration();
    expect(sql).toMatch(/alter table public\.food_products enable row level security/i);
    expect(sql).toMatch(/alter table public\.food_product_nutrition_versions enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.food_product_nutrition_versions from anon, authenticated/i);
    expect(sql).toMatch(/grant select on table public\.food_product_nutrition_versions to authenticated/i);
    expect(sql).toMatch(/owner_user_id = auth\.uid\(\)/i);
  });
});
