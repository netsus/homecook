import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("frontend-design skill install", () => {
  it("tracks the installed skill in skills-lock.json", () => {
    const skillsLock = JSON.parse(
      readFileSync(join(repoRoot, "skills-lock.json"), "utf8"),
    ) as {
      skills?: Record<string, { source?: string; sourceType?: string; computedHash?: string }>;
    };

    expect(skillsLock.skills?.["frontend-design"]).toEqual({
      source: "anthropics/claude-plugins-official",
      sourceType: "github",
      computedHash: "e8118284a6365753790d44bb2758a6032b3af27fa84696428d9233f2be0f4e78",
    });
  });

  it("installs the skill body under .agents/skills", () => {
    const skillPath = join(repoRoot, ".agents", "skills", "frontend-design", "SKILL.md");

    expect(existsSync(skillPath)).toBe(true);

    const contents = readFileSync(skillPath, "utf8");
    expect(contents).toContain("name: frontend-design");
    expect(contents).toContain("Create distinctive, production-grade frontend interfaces");
  });

  it("links the skill into .claude/skills and skills/", () => {
    const claudeLink = join(repoRoot, ".claude", "skills", "frontend-design");
    const localLink = join(repoRoot, "skills", "frontend-design");

    expect(lstatSync(claudeLink).isSymbolicLink()).toBe(true);
    expect(lstatSync(localLink).isSymbolicLink()).toBe(true);
    expect(readlinkSync(claudeLink)).toBe("../../.agents/skills/frontend-design");
    expect(readlinkSync(localLink)).toBe("../.agents/skills/frontend-design");
  });
});
