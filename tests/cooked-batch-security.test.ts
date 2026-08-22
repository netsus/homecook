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
  it("keeps every merged Supabase migration version unique", () => {
    const migrations = readdirSync(join(process.cwd(), "supabase/migrations"))
      .filter((name) => /^\d+_.+\.sql$/u.test(name));
    const migrationsByVersion = Map.groupBy(
      migrations,
      (name) => name.slice(0, name.indexOf("_")),
    );
    const duplicateVersions = [...migrationsByVersion.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([version, names]) => ({ version, names: names.sort() }));

    expect(duplicateVersions).toEqual([]);
  });

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

  it("locks recipe then actual Meal rows before the completion session and revalidates after locking", () => {
    const sql = migration();
    const completion = sql.slice(
      sql.indexOf("create or replace function public.complete_snapshot_v2_cooking_session"),
      sql.indexOf("create or replace function private.apply_cooked_batch_event"),
    );
    const recipeLock = completion.indexOf("lock_personal_recipe_ids");
    const mealLock = completion.indexOf("for update of meal");
    const sessionLock = completion.indexOf("for update", mealLock + 1);

    expect(recipeLock).toBeGreaterThanOrEqual(0);
    expect(mealLock).toBeGreaterThan(recipeLock);
    expect(sessionLock).toBeGreaterThan(mealLock);
    expect(completion.slice(sessionLock)).toMatch(
      /meal\.status is distinct from 'shopping_done'[\s\S]*meal\.revision is distinct from session_meal\.meal_revision_snapshot/i,
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
      /'nutrition_calculation_status',\s*case[\s\S]*recipe_content_snapshot_id is null then null[\s\S]*private\.resolve_cooked_batch_nutrition\(batch\.id, p_owner_uuid\)[\s\S]*->> 'calculation_status'/i,
    );
    expect(sql).toMatch(
      /function private\.resolve_cooked_batch_nutrition\([\s\S]*security definer[\s\S]*set search_path = pg_catalog, public, private, pg_temp/i,
    );
    expect(sql).toMatch(
      /revoke all on function private\.resolve_cooked_batch_nutrition\(uuid,uuid\)[\s\S]*from public, anon, authenticated, service_role/i,
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
    expect(eatRoute).toContain("projectCookedBatchGamification");
    const closeRoute = readFileSync(
      join(process.cwd(), "app/api/v1/cooked-batches/[id]/close-unweighed/route.ts"),
      "utf8",
    );
    expect(readFileSync(
      join(process.cwd(), "app/api/v1/cooking/session-attempts/[id]/complete/route.ts"),
      "utf8",
    )).toContain("projectCookedBatchGamification");
    expect(closeRoute).toMatch(
      /action === "close" && parsed\.value\.closureReason === "consumed"[\s\S]*projectCookedBatchGamification/,
    );
    expect(migration()).toContain("'previous_level',v_previous_level");
  });

  it("keeps LEFTOVERS performance evidence on the production query shape without an artificial limit", () => {
    const testSource = readFileSync(
      join(
        process.cwd(),
        "tests/cooked-batch-weight-ledger-postgres.integration.test.ts",
      ),
      "utf8",
    );
    const performanceTestName =
      "separates exact limit-free LEFTOVERS route plans from selective index proofs";
    const explainBlock = testSource.slice(
      testSource.indexOf(performanceTestName),
      testSource.indexOf("rejects a depleted v2 leftover", testSource.indexOf(performanceTestName)),
    );

    expect(explainBlock).not.toMatch(/order by cooked_at desc,id desc limit 20/i);
    expect(explainBlock).not.toMatch(/order by eaten_at desc,id desc limit 20/i);
    expect(explainBlock).toContain("LEFTOVERS_EXACT");
    expect(explainBlock).toContain("SNAPSHOT_LOOKUP");
    expect(explainBlock).toContain("expectSelectiveIndexPlan");
    expect(explainBlock).toContain("INDEX_DEFINITIONS");
    expect(explainBlock).toContain("rootSharedBlocks");
    expect(testSource).toContain('node["Index Name"] === indexName');
    expect(testSource).toContain('node["Actual Rows"]');
    expect(testSource).toContain('node["Index Cond"]');
  });

  it("delegates monotonic JWT refresh to the canonical post-master authority", () => {
    const sql = migration();
    expect(sql).not.toMatch(
      /function private\.protect_full_local_session_binding_identity\(/i,
    );
    expect(sql).not.toMatch(
      /function public\.(?:record|assert)_full_local_session_authority\(/i,
    );
    expect(sql).toContain("/rpc/record_full_local_session_authority_v2");
    expect(sql).toContain(
      "/rpc/assert_and_renew_full_local_session_authority_v2",
    );

    const canonicalMigration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260809100000_full_local_session_refresh_authority.sql",
      ),
      "utf8",
    );
    expect(canonicalMigration).toMatch(
      /function public\.assert_and_renew_full_local_session_authority_v2\(/i,
    );
    expect(canonicalMigration).toMatch(
      /last_token_issued_at = greatest\([\s\S]*last_token_issued_at < p_last_token_issued_at/i,
    );

    const manifest = JSON.parse(readFileSync(
      join(
        process.cwd(),
        "docs/security/cooked-batch-weight-ledger-security-function-authorization-manifest.json",
      ),
      "utf8",
    )) as { functions: Array<{ replaces_additive?: string; signature: string }> };
    expect(
      manifest.functions.filter(
        ({ replaces_additive }) =>
          replaces_additive === "full-local-supabase-production",
      ),
    ).toEqual([]);

    const inventory = readFileSync(
      join(process.cwd(), "scripts/lib/full-local-security-inventory.mjs"),
      "utf8",
    );
    expect(inventory).toContain(
      "20260809100000_full_local_session_refresh_authority.sql",
    );
    expect(inventory).not.toContain("COOKED_BATCH_FULL_LOCAL_REPLACEMENTS");

    const baseRunner = readFileSync(
      join(
        process.cwd(),
        "scripts/run-recipe-snapshot-authority-postgres-integration.mjs",
      ),
      "utf8",
    );
    const cookedBatchRunner = readFileSync(
      join(
        process.cwd(),
        "scripts/run-cooked-batch-weight-ledger-postgres-integration.mjs",
      ),
      "utf8",
    );
    expect(baseRunner).toContain(
      "20260809100000_full_local_session_refresh_authority.sql",
    );
    expect(baseRunner).toContain(
      "20260820120000_full_local_session_bounded_token_overlap.sql",
    );
    expect(cookedBatchRunner).not.toContain(
      "20260809100000_full_local_session_refresh_authority.sql",
    );
    expect(cookedBatchRunner).toContain(
      "20260809120000_cooked_batch_weight_ledger.sql",
    );
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
