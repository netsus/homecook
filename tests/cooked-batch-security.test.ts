import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function migration() {
  const name = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((value) => value.endsWith("_cooked_batch_weight_ledger.sql"))
    .sort()
    .at(-1);
  expect(name, "cooked batch migration is missing").toBeTruthy();
  return readFileSync(join(process.cwd(), "supabase/migrations", name!), "utf8");
}

describe("cooked batch database security contract", () => {
  it("adds owner RLS, append-only events, protected projections and exact account cleanup order", () => {
    const sql = migration();
    expect(sql).toMatch(/create table if not exists public\.cooked_batch_quantity_events/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/revoke (update|all)[\s\S]*cooked_batch_quantity_events/i);
    expect(sql).toMatch(/raise exception 'RESOURCE_NOT_FOUND'/i);
    expect(sql).toMatch(/meal_log_entries[\s\S]*cooked_batch_quantity_events[\s\S]*leftover_dishes/i);
  });

  it("keeps all writers behind row-lock SECURITY DEFINER RPCs with fixed search_path", () => {
    const sql = migration();
    for (const name of [
      "complete_snapshot_v2_cooking_session",
      "mutate_cooked_batch_weight",
      "discard_cooked_batch",
      "adjust_cooked_batch",
      "close_unweighed_cooked_batch",
    ]) {
      expect(sql).toMatch(new RegExp(`function public\\.${name}`, "i"));
    }
    expect(sql).toMatch(/security definer[\s\S]*set search_path = pg_catalog, public, private, pg_temp/i);
    expect(sql).toMatch(/select[\s\S]*from public\.leftover_dishes[\s\S]*for update/i);
  });

  it("locks every selected owner pantry row and fails closed if delete cardinality changes", () => {
    const sql = migration();
    expect(sql).toMatch(
      /from \(\s*select pantry\.id\s*from public\.pantry_items as pantry[\s\S]*pantry\.user_id = p_owner_uuid[\s\S]*for update\s*\) as locked_owner_pantry/i,
    );
    expect(sql).toMatch(
      /get diagnostics v_removed = row_count;[\s\S]*if v_removed <> v_requested then[\s\S]*raise exception 'CONFLICT'/i,
    );
  });

  it("locks planner claims and requires exact owner-scoped delete cardinality", () => {
    const sql = migration();
    expect(sql).toMatch(
      /from public\.cooking_session_meal_claims as claim[\s\S]*claim\.session_id = p_session_id[\s\S]*order by claim\.meal_id[\s\S]*for update[\s\S]*as locked_session_claims/i,
    );
    expect(sql).toMatch(/claim\.owner_user_id is distinct from p_owner_uuid/i);
    expect(sql).toMatch(
      /delete from public\.cooking_session_meal_claims[\s\S]*owner_user_id = p_owner_uuid;[\s\S]*get diagnostics v_claims_deleted = row_count;[\s\S]*v_claims_deleted <> v_expected_meals/i,
    );
  });

  it("classifies every ledger function and explicitly replaces the shared scope verifier", () => {
    const manifestPath = join(
      process.cwd(),
      "docs/security/cooked-batch-weight-ledger-security-function-authorization-manifest.json",
    );
    expect(existsSync(manifestPath), "cooked batch function manifest is missing").toBe(true);
    if (!existsSync(manifestPath)) return;

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      functions: Array<{ replaces_additive?: string; signature: string }>;
    };
    expect(
      manifest.functions.find(
        ({ signature }) => signature === "private.verify_full_local_internal_scope()",
      ),
    ).toMatchObject({
      replaces_additive: "account-session-generation-foundation",
    });

    const validator = readFileSync(
      join(process.cwd(), "scripts/validate-security-function-authorization.mjs"),
      "utf8",
    );
    expect(validator).toContain(
      "cooked-batch-weight-ledger-security-function-authorization-manifest.json",
    );
    expect(validator).toContain("replaces_additive");
  });

  it("removes direct batch insertion and event-table reads from browser roles", () => {
    const sql = migration();
    expect(sql).toMatch(/drop policy if exists leftover_dishes_insert_own/i);
    expect(sql).toMatch(
      /revoke insert on public\.leftover_dishes from anon, authenticated, service_role/i,
    );
    expect(sql).toMatch(
      /revoke select, insert, update, delete on public\.cooked_batch_quantity_events\s*from anon, authenticated, service_role/i,
    );
    expect(sql).not.toMatch(/grant select on public\.cooked_batch_quantity_events to authenticated/i);
    expect(sql).toMatch(
      /revoke select on public\.leftover_dishes from authenticated;[\s\S]*grant select \([\s\S]*\) on public\.leftover_dishes to authenticated/i,
    );
    const safeColumnGrant = sql.match(
      /grant select \(([\s\S]*?)\) on public\.leftover_dishes to authenticated/i,
    )?.[1] ?? "";
    expect(safeColumnGrant).not.toContain("event_checksum");
  });

  it("moves legacy eat, uneat, and keep through one verified owner-locked compatibility RPC", () => {
    const sql = migration();
    expect(sql).toMatch(
      /function public\.mutate_legacy_leftover_status\(\s*p_owner_uuid uuid,\s*p_auth_identity_created_at_snapshot timestamptz,\s*p_session_key_hash text,\s*p_hmac_key_version integer,\s*p_session_issued_at timestamptz,[\s\S]*from public\.leftover_dishes[\s\S]*for update/i,
    );
    expect(sql).toMatch(
      /assert_recipe_future_session_authority\([\s\S]*set_account_generation_internal_writer_marker\([\s\S]*update public\.leftover_dishes[\s\S]*stale_reviewed_at[\s\S]*set_account_generation_internal_writer_marker\(/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.mutate_legacy_leftover_status\([\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.mutate_legacy_leftover_status\([\s\S]*to service_role/i,
    );

    for (const action of ["eat", "uneat", "keep"]) {
      const route = readFileSync(
        join(
          process.cwd(),
          `app/api/v1/leftovers/[leftover_id]/${action}/route.ts`,
        ),
        "utf8",
      );
      expect(route).toContain('"mutate_legacy_leftover_status"');
      expect(route).not.toContain('.from("leftover_dishes")\n    .update(');
      expect(route).toContain("...authorized.authorityArgs");
    }
  });

  it("keeps v2 nutrition status non-null and binds cleanup to the exact owner", () => {
    const sql = migration();
    expect(sql).toMatch(
      /'nutrition_calculation_status',\s*case[\s\S]*recipe_content_snapshot_id is null then null[\s\S]*coalesce\(nutrition\.calculation_status, 'unavailable'\)/i,
    );
    expect(sql).toMatch(
      /homecook\.account_delete_user_id[\s\S]*is distinct from old\.user_id/i,
    );
  });

  it("covers event reason in both replay and cached-checksum verification", () => {
    const sql = migration();
    const reasonTerms = sql.match(/coalesce\(reason, ''\)/gi) ?? [];
    expect(reasonTerms).toHaveLength(2);
  });

  it("serializes and atomically projects cooked-batch progress plus activity", () => {
    const sql = migration();
    expect(sql).toMatch(
      /function private\.project_cooked_batch_progress_activity\([\s\S]*pg_advisory_xact_lock\([\s\S]*homecook-user-progress:/i,
    );
    expect(sql).toMatch(/project_cooked_batch_progress_activity[\s\S]*user_progress_events[\s\S]*source_meta_json/i);
    expect(sql).toMatch(/project_cooked_batch_progress_activity[\s\S]*user_progress_summary/i);
    expect(sql).toMatch(/project_cooked_batch_progress_activity[\s\S]*user_growth_activity_events/i);
    const eatRoute = readFileSync(
      join(process.cwd(), "app/api/v1/leftovers/[leftover_id]/eat/route.ts"),
      "utf8",
    );
    expect(eatRoute).not.toContain("awardUserProgressEvent");
    expect(eatRoute).not.toContain("recordUserGrowthActivityEvent");
  });

  it("accepts only monotonic JWT refresh evidence for a stable active binding", () => {
    const sql = migration();
    expect(sql).toMatch(
      /function public\.assert_full_local_session_authority\([\s\S]*from public\.user_session_generation_bindings[\s\S]*for update/i,
    );
    expect(sql).toMatch(/p_session_issued_at < v_binding\.session_issued_at/i);
    expect(sql).toMatch(
      /update public\.user_session_generation_bindings[\s\S]*session_issued_at = p_session_issued_at[\s\S]*session_issued_at < p_session_issued_at/i,
    );
    const inventory = readFileSync(
      join(process.cwd(), "scripts/lib/full-local-security-inventory.mjs"),
      "utf8",
    );
    expect(inventory).toContain("COOKED_BATCH_FULL_LOCAL_REPLACEMENTS");
    expect(inventory).toContain("_cooked_batch_weight_ledger.sql");
  });

  it("returns durable replays without invoking projection recovery writers", () => {
    const sql = migration();
    const replayBranches = sql.match(/if v_claim \? 'replay' then[\s\S]*?end if;/gi) ?? [];
    expect(replayBranches.length).toBeGreaterThanOrEqual(3);
    for (const branch of replayBranches) {
      expect(branch).not.toContain("project_cooked_batch_progress_activity");
    }
    expect(sql).toMatch(/if v_transitioned and p_action = 'eat' then[\s\S]*project_cooked_batch_progress_activity/i);
  });

  it("normalizes v1 and v2 progress inserts under the same owner lock", () => {
    const sql = migration();
    expect(sql).toMatch(
      /function private\.canonicalize_cooked_batch_progress_award\(\)[\s\S]*homecook-user-progress:[\s\S]*new\.xp_delta[\s\S]*new\.source_meta_json/i,
    );
    expect(sql).toMatch(
      /create trigger canonicalize_cooked_batch_progress_award[\s\S]*before insert on public\.user_progress_events/i,
    );
    const writer = readFileSync(
      join(process.cwd(), "lib/server/user-progress.ts"),
      "utf8",
    );
    expect(writer).toContain('.select("id, xp_delta, source_meta_json")');
    expect(writer).toContain("insertResult.data.xp_delta");
  });

  it("rejects null deltas and blank reasons at the final database authority", () => {
    const sql = migration();
    expect(sql).toMatch(
      /p_action in \('discarded','adjustment'\)[\s\S]*p_delta_g is null[\s\S]*nullif\(btrim\(p_reason\),''\) is null/i,
    );
  });
});
