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

  it("passes only after all local calls return exact 406/PGRST106", () => {
    const root = mkdtempSync(join(tmpdir(), "data-api-negative-smoke-"));
    tempRoots.push(root);
    const pnpmPath = join(root, "pnpm");
    const fetchMarker = join(root, "fetch-called.txt");
    const preloadPath = join(root, "fetch-exact-denial.mjs");

    writeFileSync(
      pnpmPath,
      [
        `#!${process.execPath}`,
        "process.stdout.write([",
        '  "API_URL=http://127.0.0.1:58321",',
        '  "ANON_KEY=local-anon-key",',
        '  "JWT_SECRET=local-jwt-secret-that-is-long-enough",',
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
        "globalThis.fetch = async (url) => {",
        '  appendFileSync(process.env.HOMECOOK_FETCH_MARKER, `${url}\\n`);',
        "  return new Response(JSON.stringify({ code: \"PGRST106\" }), {",
        "    status: 406,",
        '    headers: { "content-type": "application/json" },',
        "  });",
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
          SECURITY_FUNCTION_DATA_API_JWT_SECRET:
            "isolated-data-api-secret-that-is-long-enough",
          SECURITY_FUNCTION_DATA_API_URL: "http://127.0.0.1:58321",
          SECURITY_FUNCTION_LOCAL_WORKDIR: root,
        },
      },
    );

    expect(result.status).toBe(0);
    const fetchedUrls = readFileSync(fetchMarker, "utf8").trim().split("\n");
    expect(fetchedUrls).toHaveLength(4);
    expect(fetchedUrls).toEqual(expect.arrayContaining([
      "http://127.0.0.1:58321/rpc/http_get",
      "http://127.0.0.1:58321/rpc/http_post",
    ]));
    expect(fetchedUrls.join("\n")).not.toContain("/rest/v1/rpc/");
    expect(result.stderr).toContain('"status": 406');
    expect(result.stderr).toContain('"code": "PGRST106"');
    expect(result.stderr).not.toContain("502/no-code");
  });

  it("fails closed on 502/no-code instead of treating an unavailable upstream as denial", () => {
    const root = mkdtempSync(join(tmpdir(), "data-api-negative-smoke-"));
    tempRoots.push(root);
    const pnpmPath = join(root, "pnpm");
    const preloadPath = join(root, "fetch-upstream-failure.mjs");

    writeFileSync(
      pnpmPath,
      [
        `#!${process.execPath}`,
        "process.stdout.write([",
        '  "API_URL=http://127.0.0.1:58321",',
        '  "ANON_KEY=local-anon-key",',
        '  "JWT_SECRET=local-jwt-secret-that-is-long-enough",',
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
        "globalThis.fetch = async () => new Response(null, { status: 502 });",
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
          NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}`,
          PATH: `${root}${delimiter}${process.env.PATH ?? ""}`,
          SECURITY_FUNCTION_DATA_API_MAX_ATTEMPTS: "1",
          SECURITY_FUNCTION_LOCAL_WORKDIR: root,
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("502/no-code instead of 406/PGRST106");
  });
});
