import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const TARGETS = [
  "scripts/run-security-function-authorization-postgres-integration.mjs",
  "scripts/validate-security-function-authorization.mjs",
];

describe("security-function PostgreSQL target boundary", () => {
  it.each([
    "postgresql://postgres:secret@db.example.supabase.co/postgres",
    "postgresql://postgres:secret@localhost:54322/postgres",
    "postgres://postgres:secret@127.0.0.1:54322/postgres",
  ])("rejects %s before either entrypoint invokes psql", async (databaseUrl) => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "homecook-security-function-db-guard-"),
    );
    const markerPath = path.join(fixtureRoot, "psql-invoked");
    const psqlPath = path.join(fixtureRoot, "psql");

    try {
      await writeFile(
        psqlPath,
        "#!/bin/sh\nprintf invoked >> \"$SECURITY_FUNCTION_PSQL_MARKER\"\nprintf 'PSQL_CALLED\\n' >&2\nexit 99\n",
        { mode: 0o700 },
      );

      for (const target of TARGETS) {
        const result = spawnSync(process.execPath, [target], {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${fixtureRoot}:${process.env.PATH ?? ""}`,
            SECURITY_FUNCTION_DATABASE_URL: databaseUrl,
            SECURITY_FUNCTION_PSQL_MARKER: markerPath,
          },
        });

        expect(result.status, `${target} unexpectedly succeeded`).not.toBe(0);
        expect(result.stderr).toContain(
          "SECURITY_FUNCTION_DATABASE_URL must use postgresql:// with an exact loopback host",
        );
        expect(result.stderr).not.toContain("PSQL_CALLED");
      }

      await expect(readFile(markerPath, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("rejects a non-loopback fresh database target before validator psql", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "homecook-security-function-fresh-db-guard-"),
    );
    const markerPath = path.join(fixtureRoot, "psql-invoked");
    const psqlPath = path.join(fixtureRoot, "psql");
    try {
      await writeFile(
        psqlPath,
        "#!/bin/sh\nprintf invoked >> \"$SECURITY_FUNCTION_PSQL_MARKER\"\nexit 99\n",
        { mode: 0o700 },
      );
      const result = spawnSync(
        process.execPath,
        ["scripts/validate-security-function-authorization.mjs"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${fixtureRoot}:${process.env.PATH ?? ""}`,
            SECURITY_FUNCTION_DATABASE_URL:
              "postgresql://postgres:secret@127.0.0.1:54322/postgres",
            SECURITY_FUNCTION_FRESH_DATABASE_URL:
              "postgresql://postgres:secret@db.example.com/postgres",
            SECURITY_FUNCTION_PSQL_MARKER: markerPath,
          },
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/SECURITY_FUNCTION_FRESH_DATABASE_URL.*loopback/iu);
      await expect(readFile(markerPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
