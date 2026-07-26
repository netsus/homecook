import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260724240000_recipe_image_expected_owner_signal_authority.sql",
);

describe("managed recipe image expected-owner signal authority", () => {
  it("defines the exact owner, allowlisted legacy path, and registry union", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.inspect_recipe_image_expected_owner_signal\(/i,
    );
    expect(sql).toMatch(/object\.owner_id = p_owner_uuid::text/i);
    expect(sql).toMatch(
      /object\.bucket_id = 'recipe-images'[\s\S]*object\.name ~ \(/i,
    );
    expect(sql).toMatch(
      /registry\.owner_uuid = p_owner_uuid[\s\S]*registry\.account_generation = p_account_generation/i,
    );
    expect(sql).toMatch(
      /object\.bucket_id = registry\.bucket_id[\s\S]*object\.name = registry\.object_path/i,
    );
    expect(sql).toMatch(/count\(distinct signal\.object_id\)/i);
  });

  it("keeps canonical matching narrow and excludes registry-only tombstones", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /\^\s*['"]?\s*\|\|\s*p_owner_uuid::text[\s\S]*\[0-9a-f\]\{8\}/i,
    );
    expect(sql).toMatch(
      /registry\.bucket_id = 'recipe-images-private'/i,
    );
    expect(sql).not.toMatch(
      /position\s*\(\s*p_owner_uuid::text\s+in\s+object\.name/i,
    );
    expect(sql).toMatch(/join storage\.objects as object/i);
    expect(sql).toMatch(/object\.name = registry\.object_path/i);
  });

  it("is a service-only hardened read authority", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(
      /set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(sql).toMatch(/current_setting\('transaction_isolation'\)/i);
    expect(sql).toMatch(
      /pg_advisory_xact_lock_shared[\s\S]*homecook-account-generation-cutover/i,
    );
    expect(sql).toMatch(
      /v_capability_state is null[\s\S]*or v_capability_state not in\s*\(\s*'cutover_maintenance',\s*'generation_active'\s*\)/i,
    );
    expect(sql).toMatch(
      /revoke all[\s\S]*on function public\.inspect_recipe_image_expected_owner_signal\([\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*on function public\.inspect_recipe_image_expected_owner_signal\([\s\S]*to service_role/i,
    );
  });
});
