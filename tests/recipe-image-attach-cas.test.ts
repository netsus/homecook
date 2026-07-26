import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260724180000_recipe_image_attach_cas.sql",
);

describe("managed recipe image attach CAS", () => {
  it("dark-ships one service-only owner/session-bound attach authority", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

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
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

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
      /revoke all on function public\.attach_recipe_image_object\([\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.attach_recipe_image_object\([\s\S]*to service_role/i,
    );
  });
});
