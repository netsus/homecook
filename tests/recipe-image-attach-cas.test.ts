import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readMigration(filename: string) {
  const migrationPath = path.resolve(process.cwd(), "supabase/migrations", filename);

  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("managed recipe image attach CAS", () => {
  it("dark-ships one service-only owner/session-bound attach authority", () => {
    const sql = readMigration("20260724180000_recipe_image_attach_cas.sql");

    expect(sql).toMatch(
      /create or replace function public\.attach_recipe_image_object\(/i,
    );
    expect(sql).toMatch(
      /pg_advisory_xact_lock_shared[\s\S]*homecook-account-generation-cutover/i,
    );
    expect(sql).toMatch(
      /pg_advisory_xact_lock[\s\S]*homecook-account-owner:/i,
    );
    expect(sql).toMatch(
      /user_account_lifecycles[\s\S]*status is distinct from 'active'/i,
    );
    expect(sql).toMatch(
      /user_session_generation_bindings[\s\S]*revoked_at is null/i,
    );
    expect(sql).toMatch(
      /from public\.recipes[\s\S]*for update/i,
    );
    expect(sql).toMatch(
      /created_by is distinct from p_owner_uuid[\s\S]*visibility is distinct from 'private'[\s\S]*deleted_at is not null/i,
    );
  });

  it("lets only an exact live uploaded-unlinked object win", () => {
    const sql = readMigration("20260724180000_recipe_image_attach_cas.sql");

    expect(sql).toMatch(
      /state is distinct from 'uploaded_unlinked'[\s\S]*cleanup_generation[\s\S]*is distinct from p_expected_cleanup_generation[\s\S]*unlinked_cleanup_after <= p_now/i,
    );
    expect(sql).toMatch(
      /insert into public\.recipe_image_object_references[\s\S]*'recipe_thumbnail'[\s\S]*p_recipe_id/i,
    );
    expect(sql).toMatch(
      /set state = 'attached_private'[\s\S]*unlinked_cleanup_after = null/i,
    );
    expect(sql).toMatch(
      /release_recipe_image_upload_reservation\([\s\S]*p_image_object_id[\s\S]*p_now/i,
    );
  });

  it("keeps the attach mutation private to the service role", () => {
    const sql = readMigration("20260724180000_recipe_image_attach_cas.sql");

    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(
      /set search_path = pg_catalog, public, extensions, pg_temp/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.attach_recipe_image_object\([\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.attach_recipe_image_object\([\s\S]*to service_role/i,
    );
  });
});

describe("manual recipe create managed image transaction", () => {
  it("dark-ships one service-only session-bound manual writer", () => {
    const sql = readMigration("20260724190000_recipe_manual_create_image_attach.sql");

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
    const sql = readMigration("20260724190000_recipe_manual_create_image_attach.sql");

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
    const sql = readMigration("20260724190000_recipe_manual_create_image_attach.sql");

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
