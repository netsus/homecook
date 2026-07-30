import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const container = process.env.HYBRID_SUPABASE_TEST_CONTAINER;
const run = container ? describe : describe.skip;

run("hybrid Supabase isolated PG17 authority", () => {
  it("has no published host port and validates binding in one DB transaction", () => {
    const inspection = JSON.parse(execFileSync(
      "docker",
      [
        "inspect",
        container!,
        "--format",
        "{{json .NetworkSettings.Ports}}",
      ],
      { encoding: "utf8" },
    )) as Record<string, null | Array<{ HostPort: string }>>;

    expect(
      Object.values(inspection).every(
        (bindings) => bindings === null || bindings.length === 0,
      ),
    ).toBe(true);

    const sql = readFileSync(
      "tests/fixtures/hybrid-session-authority-postgres.sql",
      "utf8",
    );
    const output = execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container!,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "postgres",
      ],
      { encoding: "utf8", input: sql },
    );

    expect(output).toContain("ROLLBACK");
    expect(output).toContain("HYBRID_SESSION_AUTHORITY_TRANSACTION_PASS");

    const metricsOutput = execFileSync(
      "docker",
      [
        "exec",
        container!,
        "psql",
        "-At",
        "-F",
        "|",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-c",
        [
          "select",
          "(select count(*) from auth.users),",
          "(select count(*) from public.users),",
          "(select count(*) from storage.objects),",
          "(select count(*) from pg_constraint where not convalidated),",
          "(select count(*) from pg_constraint",
          " where confrelid = 'auth.users'::regclass),",
          "(select count(*) from pg_proc",
          " where prokind in ('f', 'p')",
          " and pg_get_functiondef(oid) ilike '%auth.users%')",
        ].join(" "),
      ],
      { encoding: "utf8" },
    ).trim();

    expect(metricsOutput.split("|").map(Number)).toEqual([
      0,
      5,
      1,
      0,
      0,
      0,
    ]);
  });
});
