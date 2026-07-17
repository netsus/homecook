import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
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

    const calls: Array<{ input?: string; maxBuffer?: number }> = [];
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
    expect(calls[0].maxBuffer).toBe(32 * 1024 * 1024);
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

  it("allows a bounded longer timeout for large local-only import transactions", async () => {
    const { runLocalPsqlJson } = await import(MODULE);
    const calls: Array<{ timeout?: number }> = [];
    const spawn = (_command: string, _args: string[], options: typeof calls[number]) => {
      calls.push(options);
      return {
        status: 0,
        stdout: `${JSON.stringify({ applied: true })}\n`,
        stderr: "",
        error: undefined,
      };
    };

    expect(runLocalPsqlJson(
      "select large_local_import()::text;",
      {},
      spawn,
      { timeoutMs: 15 * 60_000 },
    )).toEqual({ applied: true });
    expect(calls[0]?.timeout).toBe(15 * 60_000);
  });

  it("streams a large JSON payload through a local-only psql copy without base64 expansion", async () => {
    const { runLocalPsqlJsonFileFunction } = await import(MODULE);
    const directory = mkdtempSync(join(tmpdir(), "homecook-local-json-"));
    const payloadPath = join(directory, "payload.json");
    const rowsPath = join(directory, "rows.jsonl");
    const payload = { actor_user_id: "local-actor", bundle: { approved_items: [{ id: 1 }] } };
    writeFileSync(payloadPath, `${JSON.stringify(payload)}\n`, "utf8");
    const rows = [{ name: "따옴표 \" 보존" }, { name: "역슬래시 \\ 보존" }];
    writeFileSync(rowsPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
    let stdinText = "";

    const spawn = () => {
      const child = new EventEmitter() as EventEmitter & {
        stdin: PassThrough;
        stdout: Readable;
        stderr: Readable;
        kill: () => boolean;
      };
      child.stdin = new PassThrough();
      child.stdout = Readable.from([`${JSON.stringify({ applied: true })}\n`]);
      child.stderr = Readable.from([]);
      child.kill = () => true;
      child.stdin.on("data", (chunk) => {
        stdinText += chunk.toString();
      });
      child.stdin.on("finish", () => {
        queueMicrotask(() => child.emit("close", 0, null));
      });
      return child;
    };

    try {
      await expect(runLocalPsqlJsonFileFunction(
        "apply_public_prepared_food_catalog_import",
        payloadPath,
        {},
        spawn,
        { timeoutMs: 15 * 60_000, rowsFilePath: rowsPath },
      )).resolves.toEqual({ applied: true });
      expect(stdinText).toContain(
        "\\copy pg_temp.homecook_local_json_payload(payload) from stdin with (format csv, delimiter E'\\x02', quote E'\\x01', escape E'\\x01')",
      );
      expect(stdinText).toContain(JSON.stringify(payload));
      expect(stdinText).toContain(
        "\\copy pg_temp.homecook_prepared_food_import_items(item) from stdin with (format csv, delimiter E'\\x02', quote E'\\x01', escape E'\\x01')",
      );
      expect(stdinText).toContain(rows.map((row) => JSON.stringify(row)).join("\n"));
      expect(stdinText).toContain("public.apply_public_prepared_food_catalog_import");
      expect(stdinText).not.toContain(Buffer.from(JSON.stringify(payload)).toString("base64"));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
