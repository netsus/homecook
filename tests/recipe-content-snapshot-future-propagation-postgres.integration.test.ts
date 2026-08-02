import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const enabled =
  process.env.HOMECOOK_RECIPE_CONTENT_SNAPSHOT_FUTURE_PROPAGATION_PG_INTEGRATION === "1" ||
  process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PG_INTEGRATION === "1";
const host =
  process.env.HOMECOOK_RECIPE_CONTENT_SNAPSHOT_FUTURE_PROPAGATION_PGHOST ??
  process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGHOST ??
  "";
const port =
  process.env.HOMECOOK_RECIPE_CONTENT_SNAPSHOT_FUTURE_PROPAGATION_PGPORT ??
  process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGPORT ??
  "";
const database =
  process.env.HOMECOOK_RECIPE_CONTENT_SNAPSHOT_FUTURE_PROPAGATION_PGDATABASE ??
  process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGDATABASE ??
  "";

function findMigrationCandidates() {
  return readdirSync(join(process.cwd(), "supabase/migrations"), {
    withFileTypes: true,
  })
    .filter(
      (entry: Dirent) =>
        entry.isFile() &&
        entry.name.endsWith("_recipe_content_snapshot_future_propagation.sql"),
    )
    .map((entry) => entry.name)
    .sort();
}

function readFuturePropagationMigration() {
  const candidates = findMigrationCandidates();

  expect(
    candidates.length,
    "recipe content snapshot future propagation migration is missing",
  ).toBeGreaterThan(0);

  return {
    path: join(process.cwd(), "supabase/migrations", candidates.at(-1)!),
    sql: readFileSync(
      join(process.cwd(), "supabase/migrations", candidates.at(-1)!),
      "utf8",
    ),
  };
}

function psql(sql: string) {
  const result = spawnSync(
    "psql",
    ["-h", host, "-p", port, "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", env: { ...process.env, PATH: process.env.PATH ?? "", NODE_ENV: "test" } },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

const describeIf = enabled ? describe : describe.skip;

describeIf("recipe content snapshot future propagation postgres integration", () => {
  it("applies a dedicated future propagation migration on top of the snapshot-authority followup stack", () => {
    const { path, sql } = readFuturePropagationMigration();

    expect(existsSync(path)).toBe(true);
    expect(sql).toContain("RECIPE_IMPACT_STALE");
    expect(sql).toContain("SNAPSHOT_V2_CREATION_DISABLED");
  });

  it("installs at least one server-only routine that carries the official future impact stale contract", () => {
    readFuturePropagationMigration();

    const count = Number(
      psql(`
        select count(*)::text
        from pg_proc as proc
        join pg_namespace as namespace on namespace.oid = proc.pronamespace
        where namespace.nspname = 'public'
          and pg_get_functiondef(proc.oid) like '%RECIPE_IMPACT_STALE%'
          and pg_get_functiondef(proc.oid) like '%MEAL_COOKING_ALREADY_STARTED%';
      `),
    );

    expect(count).toBeGreaterThan(0);
  });

  it("installs at least one server-only routine that carries the snapshot-v2 creation-disabled contract", () => {
    readFuturePropagationMigration();

    const count = Number(
      psql(`
        select count(*)::text
        from pg_proc as proc
        join pg_namespace as namespace on namespace.oid = proc.pronamespace
        where namespace.nspname = 'public'
          and pg_get_functiondef(proc.oid) like '%SNAPSHOT_V2_CREATION_DISABLED%'
          and pg_get_functiondef(proc.oid) like '%snapshot_v2%';
      `),
    );

    expect(count).toBeGreaterThan(0);
  });
});
