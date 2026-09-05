import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("playwright workflow", () => {
  it("runs Lighthouse against the production build before Playwright dev servers mutate .next", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const verifyFrontend = packageJson.scripts["verify:frontend"];

    expect(verifyFrontend).toContain("pnpm build && pnpm test:lighthouse:run &&");
    expect(verifyFrontend.indexOf("pnpm test:lighthouse:run")).toBeLessThan(
      verifyFrontend.indexOf("pnpm test:e2e:regression"),
    );
  });

  it("routes QA jobs through the local path filter script", () => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows/playwright.yml"), "utf8");

    expect(workflow).toContain("id: filter");
    expect(workflow).toContain("node scripts/ci-path-filter.mjs");
    expect(workflow).toContain("needs.changes.outputs.smoke == 'true'");
    expect(workflow).toContain("needs.changes.outputs.accessibility == 'true'");
    expect(workflow).toContain("needs.changes.outputs.visual == 'true'");
    expect(workflow).toContain("needs.changes.outputs.lighthouse == 'true'");
    expect(workflow).toContain("needs.changes.outputs.full_regression == 'true'");
    expect(workflow).toContain("complete_regression_matrix:");
  });

  it("keeps fast PR commands separate from full regression commands", () => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows/playwright.yml"), "utf8");
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const ciRegression = packageJson.scripts["test:e2e:regression:ci"];

    expect(workflow).toContain("pnpm test:e2e:smoke");
    expect(workflow).toContain("pnpm test:e2e:a11y:core");
    expect(workflow).toContain("pnpm test:e2e:visual:web-core");
    expect(workflow).toContain("pnpm test:e2e:visual:app-core");
    expect(workflow).toContain("pnpm test:e2e:regression");
    expect(workflow).toContain("pnpm test:e2e:regression:ci");
    expect(workflow).toContain("pnpm test:lighthouse:run");
    expect(workflow).toContain("pnpm test:lighthouse:marketing:run");
    expect(workflow).toContain(".lighthouseci-marketing");
    expect(packageJson.scripts["test:lighthouse:marketing:run"]).toContain(
      "lighthouserc.marketing.js",
    );
    expect(ciRegression).toContain("--project=desktop-chrome");
    expect(ciRegression).toContain("--project=mobile-chrome");
    expect(ciRegression).not.toContain("--project=mobile-ios-small");
  });

  it("keeps one-shot marketing evidence capture out of repeated regression", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const repeatedRegressionScripts = [
      packageJson.scripts["test:e2e:regression"],
      packageJson.scripts["test:e2e:regression:ci"],
    ];
    const marketingEvidence = packageJson.scripts["test:e2e:marketing:evidence"];

    for (const script of repeatedRegressionScripts) {
      expect(script).toContain("--grep-invert '@live-oauth|@evidence-capture'");
    }
    expect(marketingEvidence).toContain("tests/e2e/slice-marketing-demand-validation.spec.ts");
    expect(marketingEvidence).toContain("--grep '@evidence-capture'");
    expect(marketingEvidence).toContain("--project=desktop-chrome");
  });

  it("exposes one explicit command for updating tracked E2E evidence", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["test:e2e:evidence:update"]).toBe(
      "HOMECOOK_UPDATE_EVIDENCE=1 playwright test",
    );
  });

  it("keeps only the small iOS smoke sentinel when full regression already covers desktop and mobile Chrome", () => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows/playwright.yml"), "utf8");
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const playwrightConfig = readFileSync(join(repoRoot, "playwright.config.ts"), "utf8");
    const normalSmoke = packageJson.scripts["test:e2e:smoke"];
    const iosSentinel = packageJson.scripts["test:e2e:smoke:ios-sentinel"];

    expect(normalSmoke).not.toContain("--project=");
    for (const projectName of ["desktop-chrome", "mobile-chrome", "mobile-ios-small"]) {
      expect(playwrightConfig).toContain(`name: "${projectName}"`);
    }
    expect(iosSentinel).toContain("--grep '@smoke-core'");
    expect(iosSentinel).toContain("--grep-invert '@live-oauth'");
    expect(iosSentinel).toContain("--project=mobile-ios-small");
    expect(iosSentinel).not.toContain("--project=desktop-chrome");
    expect(iosSentinel).not.toContain("--project=mobile-chrome");

    expect(workflow).toContain("name: Run core Playwright smoke suite");
    expect(workflow).toContain("if: needs.changes.outputs.full_regression != 'true'");
    expect(workflow).toContain("name: Run small iOS smoke sentinel");
    expect(workflow).toContain(
      "if: needs.changes.outputs.smoke == 'true' && needs.changes.outputs.complete_regression_matrix != 'true'",
    );
    expect(workflow).toContain(
      "if: needs.changes.outputs.full_regression == 'true' && needs.changes.outputs.complete_regression_matrix != 'true'",
    );
    expect(workflow).toContain("run: pnpm test:e2e:smoke:ios-sentinel");
  });

  it("reserves the complete regression matrix for explicit full-matrix runs", () => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows/playwright.yml"), "utf8");

    expect(workflow).toContain(
      "if: needs.changes.outputs.complete_regression_matrix == 'true'",
    );
    expect(workflow).toContain(
      "if: needs.changes.outputs.complete_regression_matrix != 'true'",
    );
  });
});
