import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE = pathToFileURL(join(
  process.cwd(),
  "scripts/lib/ingredient-nutrition-local-db.mjs",
)).href;

describe("ingredient nutrition local database invocation", () => {
  it("uses an explicitly isolated loopback PostgreSQL cluster when configured", async () => {
    const { buildLocalPsqlInvocation } = await import(MODULE);

    expect(buildLocalPsqlInvocation({
      HOMECOOK_LOCAL_PGHOST: "127.0.0.1",
      HOMECOOK_LOCAL_PGPORT: "55432",
      HOMECOOK_LOCAL_PGDATABASE: "homecook_public_data_pilot",
      HOMECOOK_LOCAL_PGUSER: "postgres",
    })).toEqual({
      command: "psql",
      args: [
        "-h", "127.0.0.1",
        "-p", "55432",
        "-U", "postgres",
        "-d", "homecook_public_data_pilot",
        "-At",
        "-v", "ON_ERROR_STOP=1",
      ],
    });
  });

  it("keeps the existing Docker default and rejects partial or non-loopback overrides", async () => {
    const { buildLocalPsqlInvocation } = await import(MODULE);

    expect(buildLocalPsqlInvocation({})).toEqual({
      command: "docker",
      args: [
        "exec", "-i", "supabase_db_homecook", "psql",
        "-U", "postgres", "-d", "postgres", "-At",
        "-v", "ON_ERROR_STOP=1",
      ],
    });
    for (const env of [
      { HOMECOOK_LOCAL_PGHOST: "127.0.0.1" },
      {
        HOMECOOK_LOCAL_PGHOST: "db.example.com",
        HOMECOOK_LOCAL_PGPORT: "5432",
        HOMECOOK_LOCAL_PGDATABASE: "homecook",
        HOMECOOK_LOCAL_PGUSER: "postgres",
      },
      {
        HOMECOOK_LOCAL_PGHOST: "127.0.0.1",
        HOMECOOK_LOCAL_PGPORT: "55432",
        HOMECOOK_LOCAL_PGDATABASE: "homecook_public_data_pilot",
        HOMECOOK_LOCAL_PGUSER: "postgres",
        HOMECOOK_LOCAL_PGPASSWORD: "must-not-be-accepted",
      },
      {
        HOMECOOK_LOCAL_PGHOST: "127.0.0.1",
        HOMECOOK_LOCAL_PGPORT: "55432",
        HOMECOOK_LOCAL_PGDATABASE: "homecook_public_data_pilot",
        HOMECOOK_LOCAL_PGUSER: "postgres",
        PGPASSWORD: "must-not-be-inherited",
      },
    ]) {
      expect(() => buildLocalPsqlInvocation(env)).toThrowError(
        expect.objectContaining({ code: "LOCAL_DATABASE_CONFIGURATION_INVALID" }),
      );
    }
  });
});
