import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateWave1PrototypeLock } from "../scripts/lib/validate-wave1-prototype-lock.mjs";

const FIXED_SHA = "9bf7a34c6b422d0c9981d4c2968e3350d5a28892";
type LockValidationResult = Array<{
  name: string;
  errors: Array<{ path: string; message: string }>;
}>;
const validateLock = validateWave1PrototypeLock as unknown as (args?: {
  rootDir?: string;
  slice?: string;
  prBody?: string;
  env?: Record<string, string>;
}) => LockValidationResult;

function writeFixtureFile(rootDir: string, relativePath: string, contents = "") {
  const filePath = join(rootDir, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

function createFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "wave1-prototype-lock-"));
  writeFixtureFile(
    rootDir,
    "ui/designs/reference/wave1-fixed-prototype/mobile-390-home.png",
  );
  writeFixtureFile(
    rootDir,
    "ui/designs/reference/wave1-fixed-prototype/manifest.json",
    `${JSON.stringify(
      {
        lock_version: 2,
        fixed_prototype_path: "ui/designs/prototypes/claude-design-260505-wave1",
        fixed_prototype_implementation_sha: FIXED_SHA,
        visual_layout_source_of_truth: "fixed prototype",
        parity_mode: "exact-mobile",
        required_unclassified_visual_differences: 0,
        required_visual_blockers: 0,
        required_evidence: [
          "fixed_prototype_sha",
          "reference_screenshot",
          "service_screenshot",
          "screenshot_diff",
          "computed_style_audit",
          "dom_geometry_audit",
          "remaining_difference_ledger",
        ],
        screenshots: [
          {
            surface: "HOME",
            viewport: "mobile-390",
            path: "ui/designs/reference/wave1-fixed-prototype/mobile-390-home.png",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return rootDir;
}

function buildReadyBody() {
  return [
    "## Design / Accessibility",
    `- fixed prototype SHA: ${FIXED_SHA}`,
    "- reference screenshot: `ui/designs/reference/wave1-fixed-prototype/mobile-390-home.png`",
    "- service screenshot: `.omx/artifacts/wave1-port-foundation/mobile-390-home-after.png`",
    "- visual parity comparison: pass",
    "- screenshot diff: `.omx/artifacts/wave1-port-foundation/mobile-390-home-diff.png`",
    "- computed-style audit: pass",
    "- DOM geometry audit: pass",
    "- unclassified visual difference: 0",
    "- blocker count: 0",
    "",
  ].join("\n");
}

describe("Wave1 prototype lock validator", () => {
  it("locks GLOBAL::LoginGateModal as a committed mobile reference pair", () => {
    const rootDir = process.cwd();

    const results = validateLock({ rootDir });
    const manifest = JSON.parse(
      readFileSync(
        join(rootDir, "ui/designs/reference/wave1-fixed-prototype/manifest.json"),
        "utf8",
      ),
    );
    const loginGateReferences = [
      {
        surface: "GLOBAL::LoginGateModal",
        viewport: "mobile-390",
        path: "ui/designs/reference/wave1-fixed-prototype/mobile-390-login-gate-modal.png",
      },
      {
        surface: "GLOBAL::LoginGateModal",
        viewport: "mobile-320",
        path: "ui/designs/reference/wave1-fixed-prototype/mobile-320-login-gate-modal.png",
      },
    ];

    expect(results).toEqual([]);
    expect(manifest.screenshots).toEqual(
      expect.arrayContaining(loginGateReferences),
    );
    for (const reference of loginGateReferences) {
      expect(existsSync(join(rootDir, reference.path))).toBe(true);
    }
  });

  it("passes the committed lock when manifest screenshots exist", () => {
    const rootDir = createFixture();

    const results = validateLock({ rootDir });

    expect(results).toEqual([]);
  });

  it("fails when a manifest screenshot is missing", () => {
    const rootDir = createFixture();
    writeFixtureFile(
      rootDir,
      "ui/designs/reference/wave1-fixed-prototype/manifest.json",
      `${JSON.stringify(
        {
          lock_version: 2,
          fixed_prototype_path: "ui/designs/prototypes/claude-design-260505-wave1",
          fixed_prototype_implementation_sha: FIXED_SHA,
          visual_layout_source_of_truth: "fixed prototype",
          parity_mode: "exact-mobile",
          required_unclassified_visual_differences: 0,
          required_visual_blockers: 0,
          required_evidence: [
            "fixed_prototype_sha",
            "reference_screenshot",
            "service_screenshot",
            "screenshot_diff",
            "computed_style_audit",
            "dom_geometry_audit",
            "remaining_difference_ledger",
          ],
          screenshots: [
            {
              surface: "HOME",
              viewport: "mobile-320",
              path: "ui/designs/reference/wave1-fixed-prototype/mobile-320-home.png",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const results = validateLock({ rootDir });

    expect(results[0]?.errors[0]?.message).toContain("reference screenshot is missing");
  });

  it("rejects legacy visual verdict score thresholds", () => {
    const rootDir = createFixture();
    writeFixtureFile(
      rootDir,
      "ui/designs/reference/wave1-fixed-prototype/manifest.json",
      `${JSON.stringify(
        {
          lock_version: 1,
          fixed_prototype_path: "ui/designs/prototypes/claude-design-260505-wave1",
          fixed_prototype_implementation_sha: FIXED_SHA,
          visual_layout_source_of_truth: "fixed prototype",
          required_visual_verdict_score: 90,
          screenshots: [
            {
              surface: "HOME",
              viewport: "mobile-390",
              path: "ui/designs/reference/wave1-fixed-prototype/mobile-390-home.png",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const results = validateLock({ rootDir });
    const messages =
      results[0]?.errors.map((error: { message: string }) => error.message).join("\n") ?? "";

    expect(messages).toContain("Legacy visual verdict score thresholds are not allowed");
    expect(messages).toContain("Expected parity mode exact-mobile");
    expect(messages).toContain("unclassified visual differences to be 0");
  });

  it("enforces prototype comparison evidence for Wave1 service porting PRs", () => {
    const rootDir = createFixture();

    const results = validateLock({
      rootDir,
      slice: "wave1-port-foundation",
      prBody: buildReadyBody(),
    });

    expect(results).toEqual([]);
  });

  it("fails Wave1 service porting PRs without exact parity evidence", () => {
    const rootDir = createFixture();

    const results = validateLock({
      rootDir,
      slice: "wave1-port-foundation",
      prBody: [
        "## Design / Accessibility",
        `- fixed prototype SHA: ${FIXED_SHA}`,
        "- reference screenshot: `ui/designs/reference/wave1-fixed-prototype/mobile-390-home.png`",
        "",
      ].join("\n"),
    });

    const messages = results[0]?.errors.map((error: { message: string }) => error.message).join("\n") ?? "";
    expect(messages).toContain("generated service screenshot");
    expect(messages).toContain("visual parity comparison");
    expect(messages).toContain("screenshot diff");
    expect(messages).toContain("computed-style audit");
    expect(messages).toContain("DOM geometry audit");
    expect(messages).toContain("unclassified visual differences as 0");
    expect(messages).toContain("blocker count");
  });

  it("infers Wave1 service porting scope from the branch name", () => {
    const rootDir = createFixture();

    const results = validateLock({
      rootDir,
      prBody: "## Design / Accessibility\n- no lock evidence yet\n",
      env: { BRANCH_NAME: "feature/fe-wave1-port-foundation" },
    });

    const messages = results[0]?.errors.map((error) => error.message).join("\n") ?? "";
    expect(messages).toContain("fixed prototype SHA");
    expect(messages).toContain("reference screenshot");
  });
});
