import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { parseProductBranchContext } from "../scripts/lib/product-branch-context.mjs";
import { resolveSliceFromBranch } from "../scripts/lib/check-workpack-docs.mjs";
import { validateAuthorityEvidencePresence } from "../scripts/lib/validate-authority-evidence-presence.mjs";
import { validateCloseoutSync } from "../scripts/lib/validate-closeout-sync.mjs";
import { validateExploratoryQaEvidence } from "../scripts/lib/validate-exploratory-qa-evidence.mjs";
import { validateWave1PrototypeLock } from "../scripts/lib/validate-wave1-prototype-lock.mjs";

const SLICE = "cooked-batch-weight-ui";
const CANONICAL_BRANCH = `feature/fe-${SLICE}`;
const SUCCESSOR_BRANCH = `${CANONICAL_BRANCH}-superseding-draft`;

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
    `${CANONICAL_BRANCH}-superseding`,
    `${CANONICAL_BRANCH}-superseding-draft-extra`,
    `${CANONICAL_BRANCH}-superseding-ready`,
  ])("rejects malformed reserved recovery suffixes: %s", (branchName) => {
    expect(() => parseProductBranchContext(branchName)).toThrow(
      /reserved product recovery suffix/i,
    );
  });

  it("does not classify fix branches as product recovery branches", () => {
    expect(parseProductBranchContext("fix/cooked-batch-weight-ui-successor")).toEqual({
      kind: null,
      slice: null,
      recovery: null,
    });
    expect(resolveSliceFromBranch("fix/cooked-batch-weight-ui-successor")).toBeNull();
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
});
