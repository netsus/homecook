import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = resolve(import.meta.dirname, "..");

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(resolve(rootDir, relativePath), "utf8"));
}

describe("prelaunch fast development policy", () => {
  it("keeps GitHub Actions disabled in the repository", () => {
    const workflowsDir = resolve(rootDir, ".github", "workflows");
    const workflows = existsSync(workflowsDir)
      ? readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name))
      : [];

    expect(workflows).toEqual([]);
  });

  it("does not expose OMO, Stage, or closeout validation commands", () => {
    const packageJson = readJson("package.json");
    const forbiddenScripts = Object.keys(packageJson.scripts).filter(
      (name) =>
        name.startsWith("omo:") ||
        name.startsWith("agent:") ||
        name === "test:harness" ||
        name === "test:all" ||
        name === "verify:harness" ||
        [
          "validate:workpack",
          "validate:pr",
          "validate:workflow-v2",
          "validate:authority-evidence-presence",
          "validate:exploratory-qa-evidence",
          "validate:real-smoke-presence",
          "validate:pr-ready",
          "validate:omo-bookkeeping",
          "validate:closeout-sync",
          "harness:audit",
          "harness:fix",
        ].includes(name),
    );

    expect(forbiddenScripts).toEqual([]);
  });

  it("keeps the historical launch ruleset automation dormant", () => {
    const packageJson = readJson("package.json");
    const scripts = Object.keys(packageJson.scripts);

    expect(
      scripts.some((name) => name.startsWith("release:github:rulesets:")),
    ).toBe(false);
  });

  it("does not register a project OMO plugin or retired workflow instructions", () => {
    const config = readJson("opencode.json");

    expect(
      (config.plugin ?? []).filter((name: string) =>
        /oh-my-(?:opencode|openagent)(?:@|$)/.test(name),
      ),
    ).toEqual([]);
    expect(config.instructions).toContain("AGENTS.md");
    expect(
      config.instructions.filter((path: string) =>
        /workflow-v2|\.opencode|agent-(?:plan|review)-loop/.test(path),
      ),
    ).toEqual([]);
  });

  it("shadows legacy OpenAgent role settings with a current project config", () => {
    expect(
      existsSync(resolve(rootDir, ".opencode/oh-my-openagent.json")),
    ).toBe(true);
    const config = readJson(".opencode/oh-my-openagent.json");

    expect(config.agents).toBeUndefined();
    expect(config.experimental.auto_resume).toBe(false);
    expect(config.disabled_hooks).toContain("ralph-loop");
    expect(config.disabled_commands).toContain("ulw-loop");
  });
});
