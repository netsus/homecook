import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { assertSupportedClaudeProvider } from "../scripts/lib/omo-provider-config.mjs";

const repoRoot = process.cwd();

describe("OMO Claude provider guard", () => {
  it("accepts claude-cli and rejects opencode for Claude-owned stage overrides", () => {
    expect(assertSupportedClaudeProvider(undefined)).toBeUndefined();
    expect(assertSupportedClaudeProvider("claude-cli")).toBe("claude-cli");
    expect(() => assertSupportedClaudeProvider("opencode")).toThrow(
      /only supports .*claude-cli/i,
    );
  });

  it("fails fast in omo:supervise when --claude-provider opencode is requested", () => {
    try {
      execFileSync(
        "node",
        [
          "scripts/omo-supervise.mjs",
          "--",
          "--work-item",
          "07-meal-manage",
          "--claude-provider",
          "opencode",
        ],
        {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: "pipe",
        },
      );
      throw new Error("expected command to fail");
    } catch (error) {
      const stderr =
        error && typeof error === "object" && "stderr" in error
          ? String(error.stderr)
          : "";
      expect(stderr).toContain("claude-cli");
      expect(stderr).toContain("--claude-provider");
    }
  });

  it("documents claude-cli as the only supported Claude provider in repo-local docs", () => {
    const providerDoc = readFileSync(
      join(repoRoot, "docs/engineering/workflow-v2/omo-claude-cli-provider.md"),
      "utf8",
    );
    const repoReadme = readFileSync(join(repoRoot, ".opencode/README.md"), "utf8");

    expect(providerDoc).toContain("`--claude-provider claude-cli`");
    expect(providerDoc).toContain("Homecook OMO는 Claude-owned stage provider로 `opencode`를 지원하지 않는다.");
    expect(repoReadme).toContain("`claude-cli`만 지원한다.");
  });
});
