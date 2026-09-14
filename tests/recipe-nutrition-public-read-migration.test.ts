import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260915050000_public_current_recipe_nutrition_read.sql",
  ),
  "utf8",
);

describe("public current recipe nutrition read migration", () => {
  it("grants anon read through a current, public, undeleted recipe policy", () => {
    expect(migration).toMatch(
      /grant select on table public\.recipe_nutrition_snapshots to anon/i,
    );
    expect(migration).toMatch(
      /create policy recipe_nutrition_snapshots_anon_public_current_read[\s\S]*for select[\s\S]*to anon/i,
    );
    expect(migration).toMatch(/owner_user_id is null/i);
    expect(migration).toMatch(/and is_current/i);
    expect(migration).toMatch(/recipe\.visibility = 'public'/i);
    expect(migration).toMatch(/recipe\.deleted_at is null/i);
  });
});
