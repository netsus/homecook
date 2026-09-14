import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("recipe nutrition v2 data reconciler", () => {
  it("is bounded, idempotent, backed up, and guarded by exact local identity", () => {
    const script = readFileSync("scripts/reconcile-recipe-nutrition-v2-data.mjs", "utf8");
    const sql = readFileSync(
      "scripts/sql/reconcile-recipe-nutrition-v2-data-20260915.sql",
      "utf8",
    );

    expect(script).toContain("homecook-full-local-isolated-postgres-1");
    expect(script).toContain("HOMECOOK_NUTRITION_V2_DATA_WRITE_APPROVED");
    expect(script).toContain("pg_dump");
    expect(script).toContain('openSync(backupPath, "wx"');
    expect(sql).toContain("set_account_generation_internal_writer_marker");
    expect(sql).toContain("EXPECTED_7_SOFT_DELETED_RECIPES");
    expect(sql).toContain("EXPECTED_10_EXACT_PIECE_STANDARDS");
    expect(sql).toContain("EXPECTED_16_EXACT_VOLUME_ASSIGNMENTS");
    expect(sql).not.toMatch(/\b(drop|truncate)\b/i);
  });
});
