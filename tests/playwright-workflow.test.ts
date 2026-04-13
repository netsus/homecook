import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("playwright workflow", () => {
  it("covers nested lib changes for QA workflow triggers", () => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows/playwright.yml"), "utf8");

    expect(workflow).toContain('- "lib/**"');
  });
});
