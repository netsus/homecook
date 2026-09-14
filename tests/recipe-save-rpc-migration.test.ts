import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260915090000_recipe_save_rpc.sql",
  "utf8",
);

describe("recipe save RPC migration", () => {
  it("checks recipe visibility and book ownership before an atomic membership write", () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/recipe\.visibility='public' or recipe\.created_by=v_owner/i);
    expect(sql).toMatch(/book\.user_id<>v_owner/i);
    expect(sql).toMatch(/book\.book_type not in \('saved','custom'\)/i);
    expect(sql).toMatch(/on conflict\(book_id,recipe_id\) do nothing/i);
    expect(sql).toMatch(/update public\.recipes set save_count=v_save_count/i);
    expect(sql).toMatch(/assert_recipe_future_session_authority/i);
    expect(sql).toMatch(/set_account_generation_internal_writer_marker/i);
    expect(sql).toMatch(/v_scope='recipe-save' and v_method='POST' and v_path='\/rpc\/save_recipe_to_books'/i);
    expect(sql).toMatch(/v_scope='recipe-meal-weight' and v_method='GET'/i);
    expect(sql).toContain("'/piece_unit_weights'");
    expect(sql).toMatch(/grant execute on function public\.save_recipe_to_books\(uuid,timestamptz,text,integer,timestamptz,uuid,uuid\[\]\) to service_role/i);
    expect(sql).toMatch(/revoke all on function public\.save_recipe_to_books\(uuid,timestamptz,text,integer,timestamptz,uuid,uuid\[\]\) from public,anon,authenticated/i);
  });
});
