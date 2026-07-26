import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260724190000_recipe_manual_create_image_attach.sql",
);

describe("manual recipe create managed image transaction", () => {
  it("dark-ships one service-only session-bound manual writer", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.create_manual_recipe_with_managed_image\(/i,
    );
    expect(sql).toMatch(
      /account_generation_capability_state[\s\S]*generation_active/i,
    );
    expect(sql).toMatch(
      /user_account_lifecycles[\s\S]*status is distinct from 'active'/i,
    );
    expect(sql).toMatch(
      /user_session_generation_bindings[\s\S]*revoked_at is null/i,
    );
    expect(sql).toMatch(
      /insert into public\.recipes[\s\S]*visibility[\s\S]*'private'/i,
    );
  });

  it("keeps managed object identity out of durable URL text and attaches in-transaction", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /p_image_object_id is not null[\s\S]*nullif\(btrim\(p_thumbnail_url\), ''\) is not null[\s\S]*MANAGED_IMAGE_REFERENCE_REQUIRED/i,
    );
    expect(sql).toMatch(
      /p_image_object_id is null[\s\S]*p_thumbnail_url[\s\S]*null/i,
    );
    expect(sql).toMatch(
      /public\.attach_recipe_image_object\([\s\S]*v_recipe\.id[\s\S]*p_image_object_id[\s\S]*p_expected_cleanup_generation/i,
    );
    expect(sql).toMatch(
      /return jsonb_build_object\([\s\S]*'image_object_id'[\s\S]*p_image_object_id/i,
    );
  });

  it("does not expose either writer to browser principals", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(
      /set search_path = pg_catalog, public, extensions, pg_temp/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.create_manual_recipe_with_managed_image\([\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.create_manual_recipe_with_managed_image\([\s\S]*to service_role/i,
    );
  });
});
