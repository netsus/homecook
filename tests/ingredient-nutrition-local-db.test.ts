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
      PATH: "/test/bin",
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
        "-X",
        "-At",
        "-v", "ON_ERROR_STOP=1",
      ],
      env: {
        PATH: "/test/bin",
        PGPASSFILE: "/dev/null",
      },
      sentinel: {
        database: "homecook_public_data_pilot",
        value: "homecook-isolated-local-v1",
      },
    });
  });

  it("keeps the existing Docker default and rejects partial or non-loopback overrides", async () => {
    const { buildLocalPsqlInvocation } = await import(MODULE);

    expect(buildLocalPsqlInvocation({})).toEqual({
      command: "docker",
      args: [
        "exec", "-i", "supabase_db_homecook", "psql",
        "-U", "postgres", "-d", "postgres", "-X", "-At",
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
        HOMECOOK_LOCAL_PGPORT: "5432",
        HOMECOOK_LOCAL_PGDATABASE: "homecook_public_data_pilot",
        HOMECOOK_LOCAL_PGUSER: "postgres",
      },
      {
        HOMECOOK_LOCAL_PGHOST: "127.0.0.1",
        HOMECOOK_LOCAL_PGPORT: "55432",
        HOMECOOK_LOCAL_PGDATABASE: "postgres",
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
      {
        HOMECOOK_LOCAL_PGHOST: "127.0.0.1",
        HOMECOOK_LOCAL_PGPORT: "55432",
        HOMECOOK_LOCAL_PGDATABASE: "homecook_public_data_pilot",
        HOMECOOK_LOCAL_PGUSER: "postgres",
        PGSERVICE: "shared-service",
      },
      {
        HOMECOOK_LOCAL_PGHOST: "127.0.0.1",
        HOMECOOK_LOCAL_PGPORT: "55432",
        HOMECOOK_LOCAL_PGDATABASE: "homecook_public_data_pilot",
        HOMECOOK_LOCAL_PGUSER: "postgres",
        PGSERVICEFILE: "/tmp/shared-service.conf",
      },
      {
        HOMECOOK_LOCAL_PGHOST: "127.0.0.1",
        HOMECOOK_LOCAL_PGPORT: "55432",
        HOMECOOK_LOCAL_PGDATABASE: "homecook_public_data_pilot",
        HOMECOOK_LOCAL_PGUSER: "postgres",
        PGOPTIONS: "-c search_path=attacker",
      },
    ]) {
      expect(() => buildLocalPsqlInvocation(env)).toThrowError(
        expect.objectContaining({ code: "LOCAL_DATABASE_CONFIGURATION_INVALID" }),
      );
    }
  });

  it("runs the override sentinel gate and requested SQL in one psql session", async () => {
    const { runLocalPsqlJson } = await import(MODULE);
    const env = {
      PATH: "/test/bin",
      HOMECOOK_LOCAL_PGHOST: "127.0.0.1",
      HOMECOOK_LOCAL_PGPORT: "55432",
      HOMECOOK_LOCAL_PGDATABASE: "homecook_public_data_pilot",
      HOMECOOK_LOCAL_PGUSER: "postgres",
    };
    const mutation = "select dangerous_mutation()::text;";
    for (const stderr of [
      "ERROR: HOMECOOK_LOCAL_DATABASE_SENTINEL_INVALID\n",
      "ERROR: HOMECOOK_LOCAL_DATABASE_SENTINEL_INVALID (wrong database)\n",
    ]) {
      const calls: Array<{ input?: string; env?: Record<string, string> }> = [];
      const spawn = (_command: string, _args: string[], options: typeof calls[number]) => {
        calls.push(options);
        return { status: 3, stdout: "", stderr, error: undefined };
      };

      expect(() => runLocalPsqlJson(mutation, env, spawn)).toThrowError(
        expect.objectContaining({ code: "LOCAL_DATABASE_SENTINEL_INVALID" }),
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].input).toContain(mutation);
      expect(calls[0].input).toContain("HOMECOOK_LOCAL_DATABASE_SENTINEL_INVALID");
      expect(calls[0].input).toContain("errcode = 'P0001'");
      expect(calls[0].input!.indexOf("current_database()"))
        .toBeLessThan(calls[0].input!.indexOf(mutation));
      expect(calls[0].env).toEqual({ PATH: "/test/bin", PGPASSFILE: "/dev/null" });
    }

    const calls: Array<{ input?: string }> = [];
    const spawn = (_command: string, _args: string[], options: typeof calls[number]) => {
      calls.push(options);
      return {
        status: 0,
        stdout: `DO\n${JSON.stringify({ applied: true })}\n`,
        stderr: "",
        error: undefined,
      };
    };

    expect(runLocalPsqlJson(mutation, env, spawn)).toEqual({ applied: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toContain(mutation);
    expect(calls[0].input!.indexOf("current_database()"))
      .toBeLessThan(calls[0].input!.indexOf(mutation));

    expect(() => runLocalPsqlJson(mutation, env, () => ({
      status: 3,
      stdout: "",
      stderr: "ERROR: relation does not exist\n",
      error: undefined,
    }))).toThrowError(expect.objectContaining({ code: "LOCAL_DATABASE_UNAVAILABLE" }));
  });

  it("rejects psql meta-commands before starting the local override process", async () => {
    const { runLocalPsqlJson } = await import(MODULE);
    let spawnCount = 0;
    const env = {
      PATH: "/test/bin",
      HOMECOOK_LOCAL_PGHOST: "127.0.0.1",
      HOMECOOK_LOCAL_PGPORT: "55432",
      HOMECOOK_LOCAL_PGDATABASE: "homecook_public_data_pilot",
      HOMECOOK_LOCAL_PGUSER: "postgres",
    };

    expect(() => runLocalPsqlJson("select 1; \\! touch /tmp/unsafe", env, () => {
      spawnCount += 1;
      return { status: 0, stdout: "{}", stderr: "", error: undefined };
    })).toThrowError(expect.objectContaining({ code: "LOCAL_DATABASE_CONFIGURATION_INVALID" }));
    expect(spawnCount).toBe(0);
  });
});
