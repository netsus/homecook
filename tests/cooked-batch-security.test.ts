import { readFileSync, readdirSync } from "node:fs";
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
});
