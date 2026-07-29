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
  }, 15_000);

  it("marks the legacy Claude adapter retired in current repo-local docs", () => {
    const providerDoc = readFileSync(
      join(repoRoot, "docs/engineering/workflow-v2/omo-claude-cli-provider.md"),
      "utf8",
    );
    const repoReadme = readFileSync(join(repoRoot, ".opencode/README.md"), "utf8");

    expect(providerDoc).toContain("**Retired `2026-07-30`: 신규 실행 금지.**");
    expect(providerDoc).toContain(
      "아래 명령, provider 설정, resume 절차를 신규 Stage에 실행하지 말고",
    );
    expect(repoReadme).toContain("`provider=retired`, `bin=disabled`로 잠근다.");
    expect(repoReadme).toContain("Claude login 또는 Claude credential은 필요하지 않다.");
  });
});
