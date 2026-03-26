import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as Record<string, unknown>;
}

describe("OMO-lite repo config", () => {
  it("tracks repo-local OpenCode and OMO configuration files", () => {
    const requiredFiles = [
      "opencode.json",
      ".opencode/README.md",
      ".opencode/oh-my-opencode.json",
    ];

    for (const path of requiredFiles) {
      expect(existsSync(join(repoRoot, path))).toBe(true);
    }
  });

  it("registers the OMO plugin and repo-local instruction bundle", () => {
    const config = readJson("opencode.json");
    const plugin = Array.isArray(config.plugin) ? config.plugin : [];
    const instructions = Array.isArray(config.instructions) ? config.instructions : [];

    expect(plugin).toContain("oh-my-opencode@latest");
    expect(instructions).toEqual(
      expect.arrayContaining([
        "AGENTS.md",
        "docs/engineering/agent-workflow-overview.md",
        "docs/engineering/slice-workflow.md",
        "docs/engineering/workflow-v2/omo-session-orchestrator.md",
        "docs/engineering/workflow-v2/omo-lite-architecture.md",
        "docs/engineering/workflow-v2/omo-lite-supervisor-spec.md",
        "docs/engineering/workflow-v2/omo-lite-dispatch-contract.md",
        ".opencode/README.md",
      ]),
    );
  });

  it("defaults Homecook OMO to a Codex supervisor baseline", () => {
    const config = readJson(".opencode/oh-my-opencode.json");
    const disabledHooks = Array.isArray(config.disabled_hooks) ? config.disabled_hooks : [];
    const disabledCommands = Array.isArray(config.disabled_commands) ? config.disabled_commands : [];
    const agents =
      config.agents && typeof config.agents === "object" ? (config.agents as Record<string, Record<string, unknown>>) : {};

    expect(config.default_run_agent).toBe("hephaestus");
    expect(disabledHooks).toEqual(expect.arrayContaining(["comment-checker", "ralph-loop"]));
    expect(disabledCommands).toEqual(expect.arrayContaining(["ralph-loop", "ulw-loop"]));
    expect(agents.hephaestus?.model).toBe("openai/gpt-5.3-codex");
    expect(agents.sisyphus?.model).toBe("openai/gpt-5.3-codex");
    expect(agents.oracle?.model).toBe("openai/gpt-5.4");
  });

  it("ignores the repo-local Claude budget override file", () => {
    const rootGitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");

    expect(rootGitignore).toContain(".opencode/claude-budget-state.json");
    expect(rootGitignore).toContain(".opencode/omo-runtime/");
  });
});
