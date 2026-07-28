import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = "scripts/run-recipe-image-legacy-visibility-local.mjs";

function runWithFakeSupabaseStatus(statusOutput: string) {
  const fakeBinDir = mkdtempSync(join(tmpdir(), "legacy-local-pnpm-"));
  const fakePnpm = join(fakeBinDir, "pnpm");
  writeFileSync(
    fakePnpm,
    [
      "#!/bin/sh",
      "if [ \"$1\" = \"dlx\" ] && [ \"$2\" = \"supabase\" ] && [ \"$3\" = \"status\" ]; then",
      "cat <<'ENV'",
      statusOutput.trim(),
      "ENV",
      "exit 0",
      "fi",
      "exit 1",
      "",
    ].join("\n"),
    "utf8",
  );
  chmodSync(fakePnpm, 0o700);

  try {
    return spawnSync(process.execPath, [SCRIPT_PATH, "--dry-run", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOMECOOK_STORAGE_LIVE_LOCAL_ONLY: "1",
        PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
      },
    });
  } finally {
    rmSync(fakeBinDir, { recursive: true, force: true });
  }
}

describe("recipe image legacy visibility local runner", () => {
  it("keeps legacy visibility execution local-only and fixture-bounded", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");

    expect(source).toContain("HOMECOOK_STORAGE_LIVE_LOCAL_ONLY");
    expect(source).toContain("assertLocalUrl");
    expect(source).toContain("127.0.0.1");
    expect(source).toContain("54321");
    expect(source).toContain("54322");
    expect(source).toContain("supabase");
    expect(source).toContain("status");
    expect(source).toContain("recipe-image-legacy-visibility-storage.live.test.ts");
    expect(source).toContain("copies private/public bytes and swaps read projections");
    expect(source).not.toContain("--linked");
    expect(source).not.toMatch(/homecook-flame\.vercel\.app/u);
    expect(source).not.toMatch(/process\.stdout\.write\([^\n]*(?:SERVICE_ROLE_KEY|SECRET|PASSWORD)/u);
  });

  it("fails closed before local Storage opt-in or credentials are loaded", () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--dry-run", "--json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          HOMECOOK_STORAGE_LIVE_LOCAL_ONLY: "",
          HOMECOOK_STORAGE_LIVE_DB_URL: "",
          HOMECOOK_STORAGE_LIVE_SERVICE_ROLE_KEY: "",
          HOMECOOK_STORAGE_LIVE_URL: "",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("HOMECOOK_STORAGE_LIVE_LOCAL_ONLY=1");
    expect(result.stdout).not.toMatch(/SERVICE_ROLE_KEY|SECRET|PASSWORD/u);
  });

  it("rejects non-loopback Supabase status output before exporting privileged credentials", () => {
    const remoteDbUrl = [
      "postgresql://postgres",
      "postgres@db.project.supabase.co:5432/postgres",
    ].join(":");
    const result = runWithFakeSupabaseStatus(`
API_URL="https://project.supabase.co"
DB_URL="${remoteDbUrl}"
SERVICE_ROLE_KEY="credential-sentinel"
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("API_URL must point to local Supabase");
    expect(result.stdout).not.toContain("credential-sentinel");
  });

  it("dry-runs only when Supabase status output is local loopback", () => {
    const localDbUrl = [
      "postgresql://postgres",
      "postgres@127.0.0.1:54322/postgres",
    ].join(":");
    const result = runWithFakeSupabaseStatus(`
API_URL="http://127.0.0.1:54321"
DB_URL="${localDbUrl}"
SERVICE_ROLE_KEY="credential-sentinel"
`);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      localOnly: true,
      testPath: "tests/recipe-image-legacy-visibility-storage.live.test.ts",
    });
    expect(result.stdout).not.toContain("credential-sentinel");
  });
});
