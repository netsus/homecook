import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260810120000_meal_log_core.sql"), "utf8");

describe("meal-log batch event linkage", () => {
  test("reverses the entry pointer target and delegates projection to slice 8 replay", () => {
    expect(sql).toMatch(/v_entry\.active_consumption_event_id[\s\S]*v_old_event/i);
    expect(sql).toMatch(/reverses_event_id[\s\S]*v_old_event\.id/i);
    expect(sql).toMatch(/unnest\([^;]*v_old_batch_id[^;]*v_new_batch_id[^;]*\)[\s\S]*private\.replay_cooked_batch\(v_lock_batch_id,p_owner_uuid,p_now\)/i);
    expect(sql).toMatch(/event_type='reversal'[\s\S]*target\.meal_log_entry_id=v_event\.meal_log_entry_id/i);
  });

  test("separates private existence from batch state errors", () => {
    expect(sql).toMatch(/where id=v_lock_batch_id and user_id=p_owner_uuid for update/i);
    expect(sql).toMatch(/weight_status='unrecoverable'[\s\S]*WEIGHT_UNRECOVERABLE/i);
    expect(sql).toMatch(/weight_status<>'known' or v_batch\.batch_status<>'available'[\s\S]*CONFLICT/i);
  });

  test("does not introduce a second batch or quantity-event table", () => {
    expect(sql.match(/create table/gi)).toHaveLength(1);
    expect([...sql.matchAll(/create table(?: if not exists)?\s+([\w.]+)/gi)].map((match) => match[1]))
      .toEqual(["public.meal_log_entries"]);
  });

  test("locks old and new batches in canonical UUID order before integrity preflight and writes", () => {
    expect(sql).toMatch(/unnest\([^;]*v_old_batch_id[^;]*v_new_batch_id[^;]*\)[\s\S]*order by[\s\S]*v_lock_batch_id/i);
    expect(sql).toMatch(/assert_cooked_batch_cached_projection\(v_lock_batch_id,p_owner_uuid\)/i);
    const assertion = sql.indexOf("assert_cooked_batch_cached_projection(v_lock_batch_id,p_owner_uuid)");
    const firstEventWrite = sql.indexOf("insert into public.cooked_batch_quantity_events", sql.indexOf("mutate_meal_log_entry"));
    expect(assertion).toBeGreaterThan(0);
    expect(firstEventWrite).toBeGreaterThan(assertion);
  });

  test("pins exact approved piece evidence with matching size and preparation", () => {
    expect(sql).toMatch(/piece_unit_weights/i);
    expect(sql).toMatch(/piece\.size_code\s*=\s*evidence\.size_code/i);
    expect(sql).toMatch(/piece\.preparation_state\s*=\s*evidence\.preparation_state/i);
    expect(sql).toMatch(/source\.freshness_status\s*=\s*'current'/i);
    expect(sql).toMatch(/v_entry\.conversion_evidence_id[\s\S]*piece_unit_weights/i);
  });
});
