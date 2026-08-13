import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { assertExactLoopbackHttpOrigin } from "../scripts/lib/local-only-supabase-operator-env.mjs";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("security-function Data API negative smoke", () => {
  it.each([
    ["http://127.0.0.1:54321", "http://127.0.0.1:54321"],
    ["http://[::1]:54321", "http://[::1]:54321"],
  ])("accepts the exact loopback HTTP(S) origin %s", (value, expected) => {
    expect(assertExactLoopbackHttpOrigin(value, { label: "API_URL" })).toBe(expected);
  });

  it.each([
    "https://forbidden-project.supabase.co",
    "https://localhost:54321",
    "http://192.168.1.20:54321",
    "http://127.0.0.1:54321/rest/v1",
    "http://user:secret@127.0.0.1:54321",
  ])("rejects the non-exact or non-loopback URL %s", (value) => {
    expect(() => assertExactLoopbackHttpOrigin(value, { label: "API_URL" }))
      .toThrow(/API_URL.*exact loopback/iu);
  });

  it("rejects a hosted status API_URL before credentials reach fetch", () => {
    const root = mkdtempSync(join(tmpdir(), "data-api-negative-smoke-"));
    tempRoots.push(root);
    const pnpmPath = join(root, "pnpm");
    const fetchMarker = join(root, "fetch-called.txt");
    const preloadPath = join(root, "fetch-sentinel.mjs");

    writeFileSync(
      pnpmPath,
      [
        `#!${process.execPath}`,
        "process.stdout.write([",
        '  "API_URL=https://forbidden-project.supabase.co",',
        '  "ANON_KEY=forbidden-anon-key",',
        '  "JWT_SECRET=forbidden-jwt-secret",',
        '  "",',
        '].join("\\n"));',
        "",
      ].join("\n"),
      "utf8",
    );
    chmodSync(pnpmPath, 0o700);
    writeFileSync(
      preloadPath,
      [
        'import { appendFileSync } from "node:fs";',
        "globalThis.fetch = async () => {",
        '  appendFileSync(process.env.HOMECOOK_FETCH_MARKER, "called\\n");',
        '  throw new Error("network sentinel reached");',
        "};",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      ["scripts/run-security-function-data-api-negative-smoke.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          HOMECOOK_FETCH_MARKER: fetchMarker,
          NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}`,
          PATH: `${root}${delimiter}${process.env.PATH ?? ""}`,
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/API_URL.*exact loopback/iu);
    expect(existsSync(fetchMarker)
      ? readFileSync(fetchMarker, "utf8")
      : "").toBe("");
  });
});
