import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("historical remote Auth JWKS sync", () => {
  it("fails closed before reading the local bundle, fetching hosted JWKS, or replacing output", () => {
    const directory = mkdtempSync(join(tmpdir(), "homecook-jwks-tombstone-"));
    directories.push(directory);
    const missingLocalPath = join(directory, "missing-local-jwks.json");
    const outputPath = join(directory, "combined-jwks.json");
    const sentinel = '{"keys":[{"kid":"unchanged"}]}\n';
    writeFileSync(outputPath, sentinel);

    const result = spawnSync(
      process.execPath,
      [
        "scripts/sync-remote-auth-jwks.mjs",
        "--endpoint",
        "https://forbidden-project.supabase.co/auth/v1/.well-known/jwks.json",
        "--issuer",
        "https://forbidden-project.supabase.co/auth/v1",
        "--local-jwks",
        missingLocalPath,
        "--output",
        outputPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SUPABASE_EXPECTED_ISSUER:
            "https://forbidden-project.supabase.co/auth/v1",
          AUTH_SUPABASE_JWKS_URL:
            "https://forbidden-project.supabase.co/auth/v1/.well-known/jwks.json",
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "FORBIDDEN: remote Auth JWKS sync is historical",
    );
    expect(readFileSync(outputPath, "utf8")).toBe(sentinel);
  });
});
