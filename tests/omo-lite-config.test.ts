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
      ".opencode/omo-provider.json",
      ".opencode/oh-my-opencode.json",
    ];

    for (const path of requiredFiles) {
      expect(existsSync(join(repoRoot, path))).toBe(true);
    }
  });

  it("registers the OMO plugin and repo-local instruction bundle", () => {
    const config = readJson("opencode.json");
    const omoProvider = readJson(".opencode/omo-provider.json");
    const plugin = Array.isArray(config.plugin) ? config.plugin : [];
    const instructions = Array.isArray(config.instructions) ? config.instructions : [];
    const agents =
      config.agent && typeof config.agent === "object"
        ? (config.agent as Record<string, Record<string, unknown>>)
        : {};

    expect(plugin).toContain("oh-my-opencode@latest");
    expect(config.default_agent).toBe("hephaestus");
    expect(agents.hephaestus?.model).toBe("openai/gpt-5.3-codex");
    expect(agents.athena?.model).toBe("anthropic/claude-sonnet-4-0");
    expect(agents.sisyphus?.model).toBe("openai/gpt-5.3-codex");
    expect(agents.oracle?.model).toBe("openai/gpt-5.4");
    expect(agents.explore?.mode).toBe("subagent");
    expect(agents.librarian?.mode).toBe("subagent");
    expect(instructions).toEqual(
      expect.arrayContaining([
        "AGENTS.md",
        "docs/engineering/agent-workflow-overview.md",
        "docs/engineering/slice-workflow.md",
        "docs/engineering/workflow-v2/omo-session-orchestrator.md",
        "docs/engineering/workflow-v2/omo-claude-cli-provider.md",
        "docs/engineering/workflow-v2/omo-autonomous-supervisor.md",
        "docs/engineering/workflow-v2/omo-lite-architecture.md",
        "docs/engineering/workflow-v2/omo-lite-supervisor-spec.md",
        "docs/engineering/workflow-v2/omo-lite-dispatch-contract.md",
        ".opencode/README.md",
      ]),
    );
    expect(omoProvider.claude).toMatchObject({
      provider: "claude-cli",
      bin: "claude",
      model: "sonnet",
      effort: "high",
      permission_mode: "acceptEdits",
    });
    expect(omoProvider.codex).toMatchObject({
      provider: "opencode",
      bin: "opencode",
      agent: "hephaestus",
      model: "openai/gpt-5.3-codex",
      variant: "high",
    });
  });

  it("defaults Homecook OMO to a Codex supervisor baseline", () => {
    const config = readJson(".opencode/oh-my-opencode.json");
    const pkg = readJson("package.json");
    const disabledHooks = Array.isArray(config.disabled_hooks) ? config.disabled_hooks : [];
    const disabledCommands = Array.isArray(config.disabled_commands) ? config.disabled_commands : [];
    const agents =
      config.agents && typeof config.agents === "object" ? (config.agents as Record<string, Record<string, unknown>>) : {};
    const scripts =
      pkg.scripts && typeof pkg.scripts === "object" ? (pkg.scripts as Record<string, string>) : {};

    expect(config.default_run_agent).toBe("hephaestus");
    expect(disabledHooks).toEqual(expect.arrayContaining(["comment-checker", "ralph-loop"]));
    expect(disabledCommands).toEqual(expect.arrayContaining(["ralph-loop", "ulw-loop"]));
    expect(agents.hephaestus?.model).toBe("openai/gpt-5.3-codex");
    expect(agents.athena?.model).toBe("anthropic/claude-sonnet-4-0");
    expect(agents.sisyphus?.model).toBe("openai/gpt-5.3-codex");
    expect(agents.oracle?.model).toBe("openai/gpt-5.4");
    expect(scripts["omo:start"]).toBe("node scripts/omo-start.mjs");
    expect(scripts["omo:continue"]).toBe("node scripts/omo-continue.mjs");
    expect(scripts["omo:resume-pending"]).toBe("node scripts/omo-resume-pending.mjs");
    expect(scripts["omo:status"]).toBe("node scripts/omo-status.mjs");
    expect(scripts["omo:supervise"]).toBe("node scripts/omo-supervise.mjs");
    expect(scripts["omo:tick"]).toBe("node scripts/omo-tick.mjs");
  });

  it("ignores the repo-local Claude budget override file", () => {
    const rootGitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");

    expect(rootGitignore).toContain(".opencode/claude-budget-state.json");
    expect(rootGitignore).toContain(".opencode/omo-runtime/");
    expect(rootGitignore).toContain(".worktrees/");
  });
});
