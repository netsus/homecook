import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseProductBranchContext } from "../scripts/lib/product-branch-context.mjs";
import { resolveSliceFromBranch } from "../scripts/lib/check-workpack-docs.mjs";
import { validateAuthorityEvidencePresence } from "../scripts/lib/validate-authority-evidence-presence.mjs";
import { validateCloseoutSync } from "../scripts/lib/validate-closeout-sync.mjs";
import { validateExploratoryQaEvidence } from "../scripts/lib/validate-exploratory-qa-evidence.mjs";
import { validateRealSmokePresence } from "../scripts/lib/validate-real-smoke-presence.mjs";
import { validateWave1PrototypeLock } from "../scripts/lib/validate-wave1-prototype-lock.mjs";
import { resolveSliceBranchContext } from "../scripts/lib/validator-shared.mjs";

const SLICE = "cooked-batch-weight-ui";
const CANONICAL_BRANCH = `feature/fe-${SLICE}`;
const SUCCESSOR_BRANCH = `${CANONICAL_BRANCH}-superseding-draft`;
const BACKEND_SLICE = "cooked-batch-weight-ledger";
const CANONICAL_BACKEND_BRANCH = `feature/be-${BACKEND_SLICE}`;
const SUCCESSOR_BACKEND_BRANCH = `${CANONICAL_BACKEND_BRANCH}-superseding-draft`;
const AUTHORITY_REPORT_PATH = "ui/designs/authority/cooked-batch-weight-ui-authority.md";
const AUTHORITY_EVIDENCE_PATHS = [
  "ui/designs/evidence/authority/cooked-batch-weight-ui-mobile.png",
  "ui/designs/evidence/authority/cooked-batch-weight-ui-mobile-narrow.png",
];
const EXPLORATORY_QA_ARTIFACT_PATHS = [
  `.artifacts/qa/${SLICE}/manual/exploratory-checklist.json`,
  `.artifacts/qa/${SLICE}/manual/exploratory-report.json`,
  `.artifacts/qa/${SLICE}/manual/eval-result.json`,
];

function nonDraftEnv(branchName: string) {
  return {
    ...process.env,
    BRANCH_NAME: branchName,
    PR_IS_DRAFT: "false",
    GITHUB_EVENT_PATH: undefined,
    PR_BODY: undefined,
    PR_BODY_FILE: undefined,
  };
}

function writeFixtureFile(rootDir: string, relativePath: string, contents: string) {
  const filePath = join(rootDir, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

type FixtureWriter = typeof writeFixtureFile;

function createAuthorityFixture({
  complete,
  writeFile = writeFixtureFile,
}: {
  complete: boolean;
  writeFile?: FixtureWriter;
}) {
  const rootDir = mkdtempSync(join(tmpdir(), "successor-authority-"));

  try {
    writeFile(
      rootDir,
      `docs/workpacks/${SLICE}/automation-spec.json`,
      JSON.stringify({
        slice_id: SLICE,
        execution_mode: "autonomous",
        risk_class: "medium",
        merge_policy: "conditional-auto",
        backend: {
          required_endpoints: [],
          invariants: [],
          verify_commands: [],
          required_test_targets: [],
        },
        frontend: {
          required_routes: [],
          required_states: [],
          playwright_projects: [],
          artifact_assertions: [],
          design_authority: {
            ui_risk: "anchor-extension",
            anchor_screens: ["COOK_MODE"],
            required_screens: ["COOK_MODE"],
            generator_required: false,
            generator_artifact: null,
            critic_required: false,
            critic_artifact: null,
            authority_required: true,
            authority_report_paths: [AUTHORITY_REPORT_PATH],
            stage4_evidence_requirements: ["mobile-default", "mobile-narrow"],
          },
        },
        external_smokes: [],
        blocked_conditions: [],
        max_fix_rounds: {
          backend: 2,
          frontend: 2,
        },
      }),
    );
    if (complete) {
      writeFile(
        rootDir,
        AUTHORITY_REPORT_PATH,
        [
          "# Authority review",
          "",
          "> evidence:",
          ...AUTHORITY_EVIDENCE_PATHS.map((path) => `> - \`${path}\``),
        ].join("\n"),
      );
      for (const evidencePath of AUTHORITY_EVIDENCE_PATHS) {
        writeFile(rootDir, evidencePath, "evidence");
      }
    }

    return rootDir;
  } catch (error) {
    rmSync(rootDir, { recursive: true, force: true });
    throw error;
  }
}

function createExploratoryQaFixture({
  complete,
  writeFile = writeFixtureFile,
}: {
  complete: boolean;
  writeFile?: FixtureWriter;
}) {
  let rootDir: string | null = null;

  try {
    rootDir = createAuthorityFixture({ complete: false, writeFile });
    if (complete) {
      for (const artifactPath of EXPLORATORY_QA_ARTIFACT_PATHS) {
        writeFile(rootDir, artifactPath, "{}");
      }
    }

    return rootDir;
  } catch (error) {
    if (rootDir) {
      rmSync(rootDir, { recursive: true, force: true });
    }
    throw error;
  }
}

function authorityEnv(branchName: string) {
  return {
    NODE_ENV: "test" as const,
    BRANCH_NAME: branchName,
    PR_IS_DRAFT: "false",
  };
}

describe("product branch context", () => {
  it("preserves canonical frontend and backend branch behavior", () => {
    expect(parseProductBranchContext(CANONICAL_BRANCH)).toEqual({
      kind: "feature-fe",
      slice: SLICE,
      recovery: null,
    });
    expect(parseProductBranchContext("feature/be-cooked-batch-weight-ledger")).toEqual({
      kind: "feature-be",
      slice: "cooked-batch-weight-ledger",
      recovery: null,
    });
  });

  it.each([
    ["feature/fe-01-recipe", "feature-fe", "01-recipe"],
    ["feature/be-wave1", "feature-be", "wave1"],
    ["feature/fe-menu-superseding-notes", "feature-fe", "menu-superseding-notes"],
    ["feature/fe-supersedingly-simple", "feature-fe", "supersedingly-simple"],
  ])("accepts the public product slug grammar: %s", (branchName, kind, slice) => {
    expect(parseProductBranchContext(branchName)).toEqual({
      kind,
      slice,
      recovery: null,
    });
  });

  it.each([
    "feature/fe-",
    "feature/be-",
    "feature/fe-cooked--batch",
    "feature/be--cooked-batch",
  ])("fails closed for malformed product-like branches: %s", (branchName) => {
    expect(() => parseProductBranchContext(branchName)).toThrow(/invalid product branch/i);
  });

  it("maps only the reserved successor suffix to the canonical product slice", () => {
    expect(parseProductBranchContext(SUCCESSOR_BRANCH)).toEqual({
      kind: "feature-fe",
      slice: SLICE,
      recovery: {
        kind: "superseding-draft",
        suffix: "-superseding-draft",
      },
    });
    expect(resolveSliceFromBranch(SUCCESSOR_BRANCH)).toBe(SLICE);
  });

  it.each([
    `${CANONICAL_BRANCH}-superseding-draft-extra`,
    `${CANONICAL_BRANCH}-superseding-draft-superseding-draft`,
  ])("rejects extra or nested recovery suffixes: %s", (branchName) => {
    expect(() => parseProductBranchContext(branchName)).toThrow(
      /recovery suffix/i,
    );
  });

  it("preserves non-recovery slugs that merely contain superseding text", () => {
    expect(parseProductBranchContext(`${CANONICAL_BRANCH}-superseding`)).toMatchObject({
      kind: "feature-fe",
      slice: `${SLICE}-superseding`,
      recovery: null,
    });
    expect(parseProductBranchContext(`${CANONICAL_BRANCH}-superseding-ready`)).toMatchObject({
      kind: "feature-fe",
      slice: `${SLICE}-superseding-ready`,
      recovery: null,
    });
  });

  it("does not classify fix branches as product recovery branches", () => {
    expect(parseProductBranchContext("fix/cooked-batch-weight-ui-successor")).toEqual({
      kind: null,
      slice: null,
      recovery: null,
    });
    expect(resolveSliceFromBranch("fix/cooked-batch-weight-ui-successor")).toBeNull();
  });

  it("resolves numeric and non-numeric closeout slugs with the public slug grammar", () => {
    expect(resolveSliceBranchContext("docs/omo-closeout-06-recipe-to-planner")).toMatchObject({
      kind: "omo-closeout",
      slice: "06-recipe-to-planner",
    });
    expect(resolveSliceBranchContext("docs/omo-closeout-wave1-port-discovery-detail")).toMatchObject({
      kind: "omo-closeout",
      slice: "wave1-port-discovery-detail",
    });
  });
});

describe("successor product policy parity", () => {
  it.each([
    [
      "authority",
      (writeFile: FixtureWriter) =>
        createAuthorityFixture({ complete: true, writeFile }),
    ],
    [
      "exploratory QA",
      (writeFile: FixtureWriter) =>
        createExploratoryQaFixture({ complete: true, writeFile }),
    ],
  ])("removes a partial %s fixture when creation fails", (_label, createFixture) => {
    let rootDir: string | null = null;
    let writeCount = 0;
    const failingWriter: FixtureWriter = (candidateRoot, relativePath, contents) => {
      rootDir = candidateRoot;
      writeCount += 1;
      if (writeCount === 2) {
        throw new Error("synthetic fixture write failure");
      }
      writeFixtureFile(candidateRoot, relativePath, contents);
    };

    expect(() => createFixture(failingWriter)).toThrow("synthetic fixture write failure");
    expect(rootDir).not.toBeNull();
    expect(existsSync(rootDir!)).toBe(false);
  });

  it("runs workpack validation against the canonical slice", () => {
    const result = spawnSync("pnpm", ["validate:workpack"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        BASE_REF: "master",
        BRANCH_NAME: SUCCESSOR_BRANCH,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `Workpack docs OK for slice '${SLICE}' (base: master)`,
    );
  });

  it("does not let an arbitrary draft suffix borrow the canonical workpack", () => {
    const result = spawnSync("pnpm", ["validate:workpack"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        BASE_REF: "master",
        BRANCH_NAME: `${CANONICAL_BRANCH}-draft`,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Workpack docs not found in origin/master for slice '${SLICE}-draft'`,
    );
  });

  it("keeps closeout policy results identical to the canonical branch", () => {
    const canonical = validateCloseoutSync({
      rootDir: process.cwd(),
      env: nonDraftEnv(CANONICAL_BRANCH),
      changedFiles: [],
    });
    const successor = validateCloseoutSync({
      rootDir: process.cwd(),
      env: nonDraftEnv(SUCCESSOR_BRANCH),
      changedFiles: [],
    });

    expect(successor).toEqual(canonical);
  });

  it("keeps backend successor branches in the non-draft Ready gate", () => {
    const canonical = validateCloseoutSync({
      rootDir: process.cwd(),
      env: nonDraftEnv(CANONICAL_BACKEND_BRANCH),
      changedFiles: [],
    });
    const successor = validateCloseoutSync({
      rootDir: process.cwd(),
      env: nonDraftEnv(SUCCESSOR_BACKEND_BRANCH),
      changedFiles: [],
    });

    expect(canonical).not.toEqual([]);
    expect(successor).toEqual(canonical);
  });

  it("keeps real-smoke enforcement identical for canonical and successor backend branches", () => {
    const canonical = validateRealSmokePresence({
      rootDir: process.cwd(),
      env: nonDraftEnv(CANONICAL_BACKEND_BRANCH),
    });
    const successor = validateRealSmokePresence({
      rootDir: process.cwd(),
      env: nonDraftEnv(SUCCESSOR_BACKEND_BRANCH),
    });

    expect(canonical).not.toEqual([]);
    expect(successor).toEqual(canonical);
  });

  it("keeps exploratory QA and authority gates on the canonical slice", () => {
    let missingAuthorityRoot: string | null = null;
    let completeAuthorityRoot: string | null = null;
    let missingQaRoot: string | null = null;
    let completeQaRoot: string | null = null;

    try {
      missingAuthorityRoot = createAuthorityFixture({ complete: false });
      completeAuthorityRoot = createAuthorityFixture({ complete: true });
      missingQaRoot = createExploratoryQaFixture({ complete: false });
      completeQaRoot = createExploratoryQaFixture({ complete: true });
      const canonicalMissingQa = validateExploratoryQaEvidence({
        rootDir: missingQaRoot,
        env: authorityEnv(CANONICAL_BRANCH),
      });
      const successorMissingQa = validateExploratoryQaEvidence({
        rootDir: missingQaRoot,
        env: authorityEnv(SUCCESSOR_BRANCH),
      });
      const canonicalCompleteQa = validateExploratoryQaEvidence({
        rootDir: completeQaRoot,
        env: authorityEnv(CANONICAL_BRANCH),
      });
      const successorCompleteQa = validateExploratoryQaEvidence({
        rootDir: completeQaRoot,
        env: authorityEnv(SUCCESSOR_BRANCH),
      });
      const canonicalMissingAuthority = validateAuthorityEvidencePresence({
        rootDir: missingAuthorityRoot,
        env: authorityEnv(CANONICAL_BRANCH),
      });
      const successorMissingAuthority = validateAuthorityEvidencePresence({
        rootDir: missingAuthorityRoot,
        env: authorityEnv(SUCCESSOR_BRANCH),
      });
      const canonicalCompleteAuthority = validateAuthorityEvidencePresence({
        rootDir: completeAuthorityRoot,
        env: authorityEnv(CANONICAL_BRANCH),
      });
      const successorCompleteAuthority = validateAuthorityEvidencePresence({
        rootDir: completeAuthorityRoot,
        env: authorityEnv(SUCCESSOR_BRANCH),
      });

      expect(canonicalMissingQa).toEqual([
        {
          name: `exploratory-qa-evidence:${SLICE}`,
          errors: [
            {
              path: join(
                missingQaRoot,
                `docs/workpacks/${SLICE}/automation-spec.json`,
              ),
              message:
                `Slice '${SLICE}' has ui_risk 'anchor-extension', so exploratory QA evidence must satisfy the ready-for-review gate.`,
            },
            {
              path: `.artifacts/qa/${SLICE}`,
              message:
                "Exploratory QA evidence could not be validated from PR body. Provide PR_BODY/PR_BODY_FILE or keep a local .artifacts/qa bundle before ready-for-review.",
            },
          ],
        },
      ]);
      expect(successorMissingQa).toEqual(canonicalMissingQa);
      expect(canonicalCompleteQa).toEqual([]);
      expect(successorCompleteQa).toEqual(canonicalCompleteQa);
      expect(canonicalMissingAuthority).toEqual([
        {
          name: `authority-evidence-presence:${SLICE}`,
          errors: [
            {
              path: AUTHORITY_REPORT_PATH,
              message: `authority report file is missing: ${AUTHORITY_REPORT_PATH}`,
            },
            {
              path: "authority_report_paths:evidence",
              message: "Authority reports are missing required mobile-default visual evidence.",
            },
            {
              path: "authority_report_paths:evidence",
              message: "Authority reports are missing required mobile-narrow visual evidence.",
            },
          ],
        },
      ]);
      expect(successorMissingAuthority).toEqual(canonicalMissingAuthority);
      expect(canonicalCompleteAuthority).toEqual([]);
      expect(successorCompleteAuthority).toEqual(canonicalCompleteAuthority);
    } finally {
      if (missingAuthorityRoot) {
        rmSync(missingAuthorityRoot, { recursive: true, force: true });
      }
      if (completeAuthorityRoot) {
        rmSync(completeAuthorityRoot, { recursive: true, force: true });
      }
      if (missingQaRoot) {
        rmSync(missingQaRoot, { recursive: true, force: true });
      }
      if (completeQaRoot) {
        rmSync(completeQaRoot, { recursive: true, force: true });
      }
    }
  });

  it("keeps the Wave1 product gate on the canonical slice", () => {
    const canonical = validateWave1PrototypeLock({
      rootDir: process.cwd(),
      env: nonDraftEnv("feature/fe-wave1-port-discovery-detail"),
    });
    const successor = validateWave1PrototypeLock({
      rootDir: process.cwd(),
      env: nonDraftEnv(
        "feature/fe-wave1-port-discovery-detail-superseding-draft",
      ),
    });

    expect(canonical).not.toEqual([]);
    expect(successor).toEqual(canonical);
  });

  it("keeps the Wave1 gate active on a non-numeric closeout branch", () => {
    const canonical = validateWave1PrototypeLock({
      rootDir: process.cwd(),
      env: nonDraftEnv("feature/fe-wave1-port-discovery-detail"),
    });
    const closeout = validateWave1PrototypeLock({
      rootDir: process.cwd(),
      env: nonDraftEnv("docs/omo-closeout-wave1-port-discovery-detail"),
    });

    expect(canonical).not.toEqual([]);
    expect(closeout).toEqual(canonical);
  });

  it("wires a reproducible focused product successor policy command", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts?.["test:product-superseding-draft-policy:focused"]).toContain(
      "tests/product-branch-context.test.ts",
    );
  });
});
