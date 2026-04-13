import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("policy workflow", () => {
  it("runs source-of-truth sync validation in the policy workflow", () => {
    const policyWorkflow = readFileSync(join(repoRoot, ".github/workflows/policy.yml"), "utf8");

    expect(policyWorkflow).toContain("- name: Validate source of truth sync");
    expect(policyWorkflow).toContain("run: node scripts/validate-source-of-truth-sync.mjs");
  });
});
