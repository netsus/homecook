import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as Record<string, unknown>;
}

describe("project hook config", () => {
  it("installs project-level branch guard hooks for general sessions", () => {
    const settings = readJson(".claude/settings.json");
    const hooks =
      settings.hooks && typeof settings.hooks === "object"
        ? (settings.hooks as Record<string, unknown[]>)
        : {};

    expect(Array.isArray(hooks.UserPromptSubmit)).toBe(true);
    expect(Array.isArray(hooks.PreToolUse)).toBe(true);

    const preTool = hooks.PreToolUse?.[0] as
      | { matcher?: string; hooks?: Array<{ command?: string }> }
      | undefined;

    expect(preTool?.matcher).toBe("Edit|Write|MultiEdit");
    expect(preTool?.hooks?.[0]?.command).toContain("scripts/hook-ensure-work-branch.mjs");
  });
});
