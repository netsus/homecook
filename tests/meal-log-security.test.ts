import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260810120000_meal_log_core.sql",
);

describe("meal-log database authority", () => {
  test("defines the owner-generation table, protected pointer, and RPC-only writes", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/create table (?:if not exists )?public\.meal_log_entries/i);
    expect(sql).toMatch(/active_consumption_event_id[\s\S]*on delete restrict/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/revoke (?:all|insert, update, delete)[\s\S]*meal_log_entries[\s\S]*authenticated/i);
    expect(sql).toMatch(/create or replace function public\.mutate_meal_log_entry/i);
    expect(sql).toMatch(/private\.replay_cooked_batch/i);
  });
});
