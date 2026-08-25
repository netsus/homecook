import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("full-local production runtime release authority", () => {
  it("blocks production mutation commands unless explicit release authority flags are provided", () => {
    const commands = [
      "init-config",
      "bootstrap-secrets",
      "start",
      "stop",
      "restore-platform",
      "provision-oauth",
    ];

    for (const command of commands) {
      const result = spawnSync(
        process.execPath,
        ["scripts/full-local-production-runtime.mjs", command],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            HOMECOOK_RELEASE_MANIFEST_PATH: "/tmp/ambient-release.json",
            HOMECOOK_RELEASE_LOCK_TOKEN: "ambient-lock-token",
          },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(command);
      expect(result.stderr).toContain("--release-manifest");
      expect(result.stderr).toContain("--lock-token");
      expect(result.stderr).not.toContain("/tmp/ambient-release.json");
      expect(result.stderr).not.toContain("ambient-lock-token");
    }
  });
});
