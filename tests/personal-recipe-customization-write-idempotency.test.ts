import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260802130000_personal_recipe_customization_write_core.sql",
);

function migration() {
  expect(existsSync(migrationPath), "personal recipe write migration is missing").toBe(
    true,
  );
  return readFileSync(migrationPath, "utf8");
}

describe("personal recipe write idempotency", () => {
  it("derives canonical key and payload hashes on the server", () => {
    const sql = migration();

    expect(sql).toMatch(/p_idempotency_key uuid/i);
    expect(sql).toMatch(/extensions\.digest[\s\S]*p_idempotency_key::text/i);
    expect(sql).toMatch(/v_canonical_draft jsonb/i);
    expect(sql).toMatch(/v_canonical_nutrition_snapshot jsonb/i);
    expect(sql).toMatch(/v_canonical_tags jsonb/i);
    expect(sql).toMatch(
      /jsonb_build_object[\s\S]*'draft',\s*v_canonical_draft[\s\S]*'nutrition_snapshot',\s*v_canonical_nutrition_snapshot[\s\S]*'tags',\s*v_canonical_tags/i,
    );
    expect(sql).not.toMatch(/'draft',\s*coalesce\(p_draft/i);
    expect(sql).toMatch(/jsonb_object_keys\(p_draft\)[\s\S]*VALIDATION_ERROR/i);
    expect(sql).toMatch(/operation_scope[\s\S]*personal_recipe_/i);
  });

  it("scopes durable replay by owner, generation, operation, and UUID key", () => {
    const sql = migration();

    expect(sql).toMatch(/mutation_idempotency_keys/i);
    expect(sql).toMatch(/owner_uuid\s*=\s*p_owner_uuid/i);
    expect(sql).toMatch(/account_generation\s*=\s*v_lifecycle\.account_generation/i);
    expect(sql).toMatch(/operation_scope\s*=\s*v_operation_scope/i);
    expect(sql).toMatch(/key_hash\s*=\s*v_key_hash/i);
    expect(sql).toMatch(/durable_result/i);
  });

  it("replays the first result and rejects key reuse with a different payload", () => {
    const sql = migration();

    expect(sql).toMatch(/payload_hash is distinct from v_payload_hash[\s\S]*IDEMPOTENCY_KEY_REUSED/i);
    expect(sql).toMatch(/return v_idempotency\.durable_result/i);
    expect(sql).toMatch(/state\s*=\s*'succeeded'/i);
  });

  it("locks the recipe before the revision check so concurrent same-revision writes have one winner", () => {
    const sql = migration();
    const recipeLock = sql.indexOf("homecook-personal-recipe:");
    const revisionCheck = sql.indexOf("base_recipe_revision", recipeLock);

    expect(recipeLock).toBeGreaterThan(-1);
    expect(revisionCheck).toBeGreaterThan(recipeLock);
    expect(sql).toMatch(/RECIPE_REVISION_CONFLICT/i);
  });
});
