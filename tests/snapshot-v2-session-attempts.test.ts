import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const startRoutePath = join(process.cwd(), "app/api/v1/cooking/session-attempts/route.ts");
const cookModeRoutePath = join(
  process.cwd(),
  "app/api/v1/cooking/session-attempts/[id]/cook-mode/route.ts",
);
const cancelRoutePath = join(
  process.cwd(),
  "app/api/v1/cooking/session-attempts/[id]/cancel/route.ts",
);

function readFuturePropagationMigration() {
  const candidates = readdirSync(migrationsDir)
    .filter((name) => name.endsWith("_recipe_content_snapshot_future_propagation.sql"))
    .sort();

  expect(
    candidates.length,
    "recipe content snapshot future propagation migration is missing",
  ).toBeGreaterThan(0);

  return readFileSync(join(migrationsDir, candidates.at(-1)!), "utf8");
}

function readRoute(path: string, message: string) {
  expect(existsSync(path), message).toBe(true);
  return readFileSync(path, "utf8");
}

describe("snapshot v2 session attempts", () => {
  it("adds dedicated v2 start, cook-mode, and cancel routes", () => {
    const startRoute = readRoute(startRoutePath, "snapshot-v2 start route is missing");
    const cookModeRoute = readRoute(
      cookModeRoutePath,
      "snapshot-v2 cook-mode route is missing",
    );
    const cancelRoute = readRoute(cancelRoutePath, "snapshot-v2 cancel route is missing");

    expect(startRoute).toMatch(/export\s+async\s+function\s+POST/i);
    expect(cookModeRoute).toMatch(/export\s+async\s+function\s+GET/i);
    expect(cancelRoute).toMatch(/export\s+async\s+function\s+POST/i);
  });

  it("locks the official snapshot-v2 creation-disabled and contract-version separation rules", () => {
    const sql = readFuturePropagationMigration();

    expect(sql).toContain("SNAPSHOT_V2_CREATION_DISABLED");
    expect(sql).toContain("snapshot_v2");
    expect(sql).toContain("legacy_v1");
    expect(sql).toContain("session_kind");
    expect(sql).toContain("planner");
    expect(sql).toContain("standalone");
  });

  it("keeps start and cancel on server-side RPC paths with official request inputs", () => {
    const startRoute = readRoute(startRoutePath, "snapshot-v2 start route is missing");
    const cancelRoute = readRoute(cancelRoutePath, "snapshot-v2 cancel route is missing");

    expect(startRoute).toMatch(/\.rpc\(/);
    expect(cancelRoute).toMatch(/\.rpc\(/);
    expect(startRoute).toContain("mode");
    expect(startRoute).toContain("Idempotency-Key");
    expect(cancelRoute).toContain("Idempotency-Key");
  });
});
