import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260810120000_meal_log_core.sql"), "utf8");

describe("meal-log batch event linkage", () => {
  test("reverses the entry pointer target and delegates projection to slice 8 replay", () => {
    expect(sql).toMatch(/v_entry\.active_consumption_event_id[\s\S]*v_old_event/i);
    expect(sql).toMatch(/reverses_event_id[\s\S]*v_old_event\.id/i);
    expect(sql).toMatch(/private\.replay_cooked_batch\(v_old_event\.cooked_batch_id/i);
    expect(sql).toMatch(/event_type='reversal'[\s\S]*target\.meal_log_entry_id=v_event\.meal_log_entry_id/i);
  });

  test("does not introduce a second batch or quantity-event table", () => {
    expect(sql.match(/create table/gi)).toHaveLength(1);
    expect([...sql.matchAll(/create table(?: if not exists)?\s+([\w.]+)/gi)].map((match) => match[1]))
      .toEqual(["public.meal_log_entries"]);
  });
});
