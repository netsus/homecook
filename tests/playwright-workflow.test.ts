import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("playwright workflow", () => {
  it("routes QA jobs through the local path filter script", () => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows/playwright.yml"), "utf8");

    expect(workflow).toContain("id: filter");
    expect(workflow).toContain("node scripts/ci-path-filter.mjs");
    expect(workflow).toContain("needs.changes.outputs.smoke == 'true'");
    expect(workflow).toContain("needs.changes.outputs.accessibility == 'true'");
    expect(workflow).toContain("needs.changes.outputs.visual == 'true'");
    expect(workflow).toContain("needs.changes.outputs.lighthouse == 'true'");
    expect(workflow).toContain("needs.changes.outputs.full_regression == 'true'");
  });

  it("keeps fast PR commands separate from full regression commands", () => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows/playwright.yml"), "utf8");

    expect(workflow).toContain("pnpm test:e2e:smoke");
    expect(workflow).toContain("pnpm test:e2e:a11y:core");
    expect(workflow).toContain("pnpm test:e2e:visual:web-core");
    expect(workflow).toContain("pnpm test:e2e:visual:app-core");
    expect(workflow).toContain("pnpm test:e2e:regression");
    expect(workflow).toContain("pnpm test:lighthouse:run");
  });
});
