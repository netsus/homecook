import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

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
    const canonicalQa = validateExploratoryQaEvidence({
      rootDir: process.cwd(),
      env: nonDraftEnv(CANONICAL_BRANCH),
    });
    const successorQa = validateExploratoryQaEvidence({
      rootDir: process.cwd(),
      env: nonDraftEnv(SUCCESSOR_BRANCH),
    });
    const canonicalAuthority = validateAuthorityEvidencePresence({
      rootDir: process.cwd(),
      env: nonDraftEnv(CANONICAL_BRANCH),
    });
    const successorAuthority = validateAuthorityEvidencePresence({
      rootDir: process.cwd(),
      env: nonDraftEnv(SUCCESSOR_BRANCH),
    });

    expect(canonicalQa).not.toEqual([]);
    expect(successorQa).toEqual(canonicalQa);
    expect(canonicalAuthority).not.toEqual([]);
    expect(successorAuthority).toEqual(canonicalAuthority);
    expect(successorAuthority[0]?.name).toBe(`authority-evidence-presence:${SLICE}`);
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
