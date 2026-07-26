import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260724220000_recipe_image_quarantine_recheck_authority.sql";

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8").catch(() => "");
}

describe("recipe image quarantine recheck authority", () => {
  it("claims only due quarantine rows in durable order with a hard limit of 50", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /create or replace function public\.claim_recipe_image_cleanup_not_found_rechecks\(/i,
    );
    expect(migration).toMatch(
      /p_limit[\s\S]*p_limit < 1[\s\S]*p_limit > 50/i,
    );
    expect(migration).toMatch(
      /state = 'awaiting_not_found_recheck'[\s\S]*next_attempt_at <= p_now[\s\S]*order by[\s\S]*next_attempt_at[\s\S]*outbox\.id[\s\S]*limit p_limit[\s\S]*for update of outbox, object skip locked/i,
    );
  });

  it("claims only matching private generation rows without active references", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /object\.visibility = 'private'[\s\S]*object\.owner_uuid = outbox\.owner_uuid[\s\S]*object\.account_generation = outbox\.account_generation[\s\S]*object\.cleanup_generation = outbox\.cleanup_generation[\s\S]*object\.state = 'not_found_observed'/i,
    );
    expect(migration).toMatch(
      /object\.late_upload_quarantine_until <= p_now[\s\S]*not exists \([\s\S]*recipe_image_object_references[\s\S]*image_object_id = object\.id/i,
    );
  });

  it("persists a five-minute claim cursor and returns the exact claimed identity", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /set next_attempt_at = p_now \+ interval '5 minutes'/i,
    );
    expect(migration).toMatch(
      /returning[\s\S]*outbox_id[\s\S]*bucket_id[\s\S]*object_path[\s\S]*owner_uuid[\s\S]*account_generation[\s\S]*cleanup_generation[\s\S]*claimed_next_attempt_at/i,
    );
  });

  it("rechecks only an exact claimed cursor before recording pending or verified absence", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /create or replace function public\.recheck_claimed_recipe_image_cleanup_not_found\(/i,
    );
    expect(migration).toMatch(
      /outbox\.id = p_outbox_id[\s\S]*outbox\.owner_uuid = p_owner_uuid[\s\S]*outbox\.account_generation = p_account_generation[\s\S]*outbox\.cleanup_generation = p_cleanup_generation[\s\S]*outbox\.next_attempt_at = p_expected_next_attempt_at/i,
    );
    expect(migration).toMatch(
      /p_object_found[\s\S]*object_found[\s\S]*state = 'cleanup_pending'[\s\S]*state = 'pending'[\s\S]*return 'pending'/i,
    );
    expect(migration).toMatch(
      /state = 'verified_not_found'[\s\S]*terminal_result = 'verified_not_found'[\s\S]*return 'verified_not_found'/i,
    );
  });

  it("fails closed outside generation-active READ COMMITTED transactions", async () => {
    const migration = await readMigration();

    expect(
      migration.match(
        /current_setting\('transaction_isolation'\) <> 'read committed'/gi,
      ),
    ).toHaveLength(2);
    expect(
      migration.match(
        /homecook-account-generation-cutover/gi,
      ),
    ).toHaveLength(2);
    expect(
      migration.match(
        /v_capability_state is distinct from 'generation_active'/gi,
      ),
    ).toHaveLength(2);
    expect(migration).toMatch(
      /homecook-account-owner:[\s\S]*lifecycle\.owner_uuid = p_owner_uuid[\s\S]*lifecycle\.account_generation = p_account_generation[\s\S]*status not in \([\s\S]*'active'[\s\S]*'deleting'[\s\S]*'cleanup_pending'/i,
    );
  });

  it("turns the legacy cursorless recheck signature into a fail-closed no-op", async () => {
    const migration = await readMigration();

    expect(migration).toMatch(
      /create or replace function public\.recheck_recipe_image_cleanup_not_found\([\s\S]*begin\s+return null;\s+end;/i,
    );
  });

  it("keeps every recheck function service-only with hardened search paths", async () => {
    const migration = await readMigration();

    expect(migration.match(/security definer/gi)).toHaveLength(3);
    expect(
      migration.match(/set search_path = pg_catalog, public, pg_temp/gi),
    ).toHaveLength(3);
    expect(migration).toMatch(
      /revoke all on function public\.claim_recipe_image_cleanup_not_found_rechecks\([\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.claim_recipe_image_cleanup_not_found_rechecks\([\s\S]*to service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.recheck_claimed_recipe_image_cleanup_not_found\([\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.recheck_claimed_recipe_image_cleanup_not_found\([\s\S]*to service_role/i,
    );
  });
});
