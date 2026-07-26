import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260724230000_recipe_image_normal_drain_authority.sql";

describe("recipe image normal drain authority", () => {
  it("installs a bounded lease recovery before pending-only normal claim", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.claim_recipe_image_cleanup\(/i,
    );
    expect(sql).toMatch(
      /state = 'failed'[\s\S]*next_attempt_at <= p_now[\s\S]*state = 'processing'[\s\S]*lease_expires_at <= p_now/i,
    );
    expect(sql).toMatch(
      /order by[\s\S]*next_attempt_at[\s\S]*outbox\.id[\s\S]*limit p_limit[\s\S]*for update skip locked/i,
    );
    expect(sql).toMatch(
      /set state = 'pending'[\s\S]*lease_token = null[\s\S]*lease_expires_at = null/i,
    );
    expect(sql).toMatch(
      /where outbox\.state = 'pending'[\s\S]*outbox\.next_attempt_at <= p_now/i,
    );
    expect(sql).not.toMatch(
      /where outbox\.state in \('pending', 'awaiting_not_found_recheck'\)/i,
    );
  });

  it("claims only an exact private cleanup generation with no reference", () => {
    const sql = existsSync(MIGRATION_PATH)
      ? readFileSync(MIGRATION_PATH, "utf8")
      : "";

    expect(sql).toMatch(
      /join public\.recipe_image_objects as object[\s\S]*object\.owner_uuid = outbox\.owner_uuid[\s\S]*object\.account_generation = outbox\.account_generation[\s\S]*object\.cleanup_generation = outbox\.cleanup_generation/i,
    );
    expect(sql).toMatch(
      /object\.visibility = 'private'[\s\S]*object\.state = 'cleanup_pending'[\s\S]*not exists \([\s\S]*recipe_image_object_references/i,
    );
    expect(sql).toMatch(
      /join public\.user_account_lifecycles as lifecycle[\s\S]*lifecycle\.status in \([\s\S]*'active'[\s\S]*'deleting'[\s\S]*'cleanup_pending'/i,
    );
  });

  it("requires generation-active READ COMMITTED execution behind the cutover fence", () => {
    const sql = existsSync(MIGRATION_PATH)
      ? readFileSync(MIGRATION_PATH, "utf8")
      : "";

    expect(sql).toMatch(
      /current_setting\('transaction_isolation'\) <> 'read committed'/i,
    );
    expect(sql).toMatch(
      /pg_advisory_xact_lock_shared[\s\S]*homecook-account-generation-cutover/i,
    );
    expect(sql).toMatch(
      /account_generation_capability_state[\s\S]*generation_active/i,
    );
  });

  it("fails an exact live lease with five-minute retry and ten-attempt dead-letter", () => {
    const sql = existsSync(MIGRATION_PATH)
      ? readFileSync(MIGRATION_PATH, "utf8")
      : "";

    expect(sql).toMatch(
      /create or replace function public\.fail_recipe_image_cleanup\(/i,
    );
    expect(sql).toMatch(
      /outbox\.id = p_outbox_id[\s\S]*outbox\.owner_uuid = p_owner_uuid[\s\S]*outbox\.account_generation = p_account_generation[\s\S]*outbox\.cleanup_generation = p_cleanup_generation[\s\S]*outbox\.state = 'processing'[\s\S]*outbox\.lease_token = p_lease_token[\s\S]*outbox\.lease_expires_at >= p_failed_at/i,
    );
    expect(sql).toMatch(
      /when v_outbox\.attempts >= 10 then 'dead_letter'[\s\S]*else 'failed'/i,
    );
    expect(sql).toMatch(
      /interval '5 minutes'[\s\S]*lease_token = null[\s\S]*lease_expires_at = null[\s\S]*last_error/i,
    );
  });

  it("keeps both authorities service-only with hardened search paths", () => {
    const sql = existsSync(MIGRATION_PATH)
      ? readFileSync(MIGRATION_PATH, "utf8")
      : "";

    for (const functionName of [
      "claim_recipe_image_cleanup",
      "fail_recipe_image_cleanup",
    ]) {
      const functionMatch = sql.match(
        new RegExp(
          `create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$function\\$;`,
          "i",
        ),
      );
      expect(functionMatch, `${functionName} is missing`).not.toBeNull();
      expect(functionMatch?.[0]).toMatch(
        /security definer[\s\S]*set search_path = pg_catalog, public, pg_temp/i,
      );
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${functionName}\\([\\s\\S]*?from public, anon, authenticated, service_role[\\s\\S]*?grant execute on function public\\.${functionName}\\([\\s\\S]*?to service_role`,
          "i",
        ),
      );
    }
  });
});
