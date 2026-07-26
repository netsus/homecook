import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260724210000_recipe_image_terminal_tombstone_scan.sql";

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8").catch(() => "");
}

describe("recipe image terminal tombstone scan", () => {
  it("claims only due terminal rows in durable cursor order with a hard limit of 50", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /create or replace function public\.claim_recipe_image_terminal_tombstones\(/i,
    );
    expect(migration).toMatch(
      /p_limit[\s\S]*p_limit < 1[\s\S]*p_limit > 50/i,
    );
    expect(migration).toMatch(
      /state in \('deleted', 'verified_not_found'\)[\s\S]*next_terminal_scan_at <= p_now[\s\S]*order by[\s\S]*next_terminal_scan_at[\s\S]*object\.id[\s\S]*limit p_limit[\s\S]*for update skip locked/i,
    );
  });

  it("advances each claimed cursor every five minutes for 24 hours and daily afterwards", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /p_now < object\.updated_at \+ interval '24 hours'[\s\S]*p_now \+ interval '5 minutes'[\s\S]*p_now \+ interval '24 hours'/i,
    );
    expect(migration).toMatch(
      /set next_terminal_scan_at =[\s\S]*returning[\s\S]*next_terminal_scan_at/i,
    );
  });

  it("reopens a late object only through exact owner-generation-terminal cursor CAS", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /create or replace function public\.reopen_recipe_image_terminal_tombstone\(/i,
    );
    expect(migration).toMatch(
      /pg_advisory_xact_lock_shared[\s\S]*homecook-account-generation-cutover[\s\S]*generation_active/i,
    );
    expect(migration).toMatch(
      /homecook-account-owner:[\s\S]*owner_uuid = p_owner_uuid[\s\S]*account_generation = p_account_generation[\s\S]*cleanup_generation = p_expected_cleanup_generation[\s\S]*next_terminal_scan_at = p_expected_next_terminal_scan_at[\s\S]*state in \('deleted', 'verified_not_found'\)/i,
    );
  });

  it("atomically raises lifecycle cleanup authority and enqueues a new cleanup generation", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /greatest\([\s\S]*required_cleanup_generation[\s\S]*cleanup_generation[\s\S]*\) \+ 1/i,
    );
    expect(migration).toMatch(
      /update public\.user_account_lifecycles[\s\S]*required_cleanup_generation = v_next_cleanup_generation[\s\S]*status = case[\s\S]*'cleanup_pending'/i,
    );
    expect(migration).toMatch(
      /update public\.recipe_image_objects[\s\S]*state = 'cleanup_pending'[\s\S]*cleanup_generation = v_next_cleanup_generation[\s\S]*next_terminal_scan_at = null/i,
    );
    expect(migration).toMatch(
      /enqueue_recipe_image_cleanup\([\s\S]*'late_terminal_object'/i,
    );
  });

  it("keeps both functions service-only with hardened definer search paths", async () => {
    const migration = await readMigration();

    expect(migration.match(/security definer/gi)).toHaveLength(2);
    expect(migration.match(/set search_path = pg_catalog, public, pg_temp/gi)).toHaveLength(
      2,
    );
    expect(migration).toMatch(
      /revoke all on function public\.claim_recipe_image_terminal_tombstones\([\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.claim_recipe_image_terminal_tombstones\([\s\S]*to service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.reopen_recipe_image_terminal_tombstone\([\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.reopen_recipe_image_terminal_tombstone\([\s\S]*to service_role/i,
    );
  });
});
