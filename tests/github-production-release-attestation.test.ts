import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildGitHubProductionReleaseAttestationArtifacts,
  buildGitHubProductionReleaseExternalCheckEvidence,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
  GITHUB_ACTIONS_APP_INTEGRATION_ID,
  GITHUB_CLI_TRUSTED_ROOT_SHA256,
  createGitHubProductionReleaseAttestationVerifier,
  normalizeGitHubProductionReleaseCheckSummary,
  verifyGitHubProductionReleaseAttestation,
} from "../scripts/lib/github-production-release-attestation.mjs";
import * as productionAttestationAuthority from "../scripts/lib/github-production-release-attestation.mjs";
import * as rehearsalAuthorityCli from "../scripts/verify-production-release-rehearsal-authority.mjs";
import {
  assertTrustedExecutableSnapshotStable,
  resolveTrustedGhExecutable,
  snapshotTrustedExecutables,
} from "../scripts/lib/trusted-production-release-tools.mjs";
import {
  createLocalMacProductionGitEvidence,
  createLocalMacProductionReleaseManifest,
} from "./helpers/local-mac-production-release-fixtures";
import {
  buildRehearsalSelection,
} from "../scripts/lib/local-mac-production-rehearsal-selection.mjs";

const temporaryDirectories: string[] = [];
const EXPECTED_RELEASE_CONTEXTS = [
  "build",
  "changes",
  "dependency-audit",
  "policy",
  "quality",
  "security-function-authorization",
  "security-smoke",
];
const RELEASE_TAG_OBJECT_SHA = "e".repeat(40);
const WORKFLOW_AUTHORITY = {
  workflow_head_sha: "c".repeat(40),
  workflow_head_tree: "d".repeat(40),
  workflow_run_id: 9_001,
  workflow_run_attempt: 1,
  workflow_check_suite_id: 9_002,
};
const APPROVAL_AUTHORITY = {
  master_sha_at_approval: "e".repeat(40),
  master_tree_at_approval: "f".repeat(40),
};
const FULL_SELECTION = buildRehearsalSelection({
  schema: "homecook.local-mac-production-rehearsal-selection.v1",
  canonicalization: "RFC8785-JCS+SHA256",
  repository: "netsus/homecook",
  source_ref: "refs/heads/master",
  selected_sha: "a".repeat(40),
  selected_tree: "b".repeat(40),
  observed_master_sha: "c".repeat(40),
  observed_master_tree: "d".repeat(40),
  selected_at: "2026-08-29T09:00:00.000Z",
  expires_at: "2026-08-30T09:00:00.000Z",
  approver_role: "human-release-approver",
  approver_id: "release-approver-1",
  approval_digest: "e".repeat(64),
}, { now: new Date("2026-08-29T09:00:00.000Z") });

const REHEARSAL_AUTHORITY = {
  rehearsal_receipt_schema: "homecook.local-mac-production-rehearsal-repeatability-receipt.v1",
  selected_sha: FULL_SELECTION.selected_sha,
  selected_tree: FULL_SELECTION.selected_tree,
  observed_master_sha: FULL_SELECTION.observed_master_sha,
  observed_master_tree: FULL_SELECTION.observed_master_tree,
  selected_at: FULL_SELECTION.selected_at,
  expires_at: FULL_SELECTION.expires_at,
  approver_role: FULL_SELECTION.approver_role,
  approver_id: FULL_SELECTION.approver_id,
  approval_digest: FULL_SELECTION.approval_digest,
  selection_digest: FULL_SELECTION.selection_digest,
  build_id: "build-20260825-01",
  sealed_bundle_digest: "f".repeat(64),
  repeatability_receipt_digest: "1".repeat(64),
  rehearsal_receipt_valid_until: "2026-08-30T09:00:00.000Z",
};
const FULL_REHEARSAL_AUTHORITY = REHEARSAL_AUTHORITY;
const CURRENT_TIP_REHEARSAL_AUTHORITY = {
  ...REHEARSAL_AUTHORITY,
  selected_sha: null,
  selected_tree: null,
  observed_master_sha: null,
  observed_master_tree: null,
  selected_at: null,
  expires_at: null,
  approver_role: null,
  approver_id: null,
  approval_digest: null,
  selection_digest: null,
};

function createTrustedCheckRuns(checkSuiteId = 200) {
  return EXPECTED_RELEASE_CONTEXTS.map((name, index) => ({
    id: 1_000 + index,
    app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
    check_suite: { id: checkSuiteId },
    head_sha: "a".repeat(40),
    completed_at: `2026-08-26T09:00:${String(index).padStart(2, "0")}Z`,
    conclusion: "success",
    name,
    status: "completed",
  }));
}

function createCheckSuitePages({
  count,
  releaseSha = "a".repeat(40),
  suiteIdStart = 200,
}: {
  count: number,
  releaseSha?: string,
  suiteIdStart?: number,
}) {
  const suites = Array.from({ length: count }, (_, index) => ({
    id: suiteIdStart + index,
    head_sha: releaseSha,
    app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
  }));
  const pages = [];
  for (let index = 0; index < Math.max(1, Math.ceil(count / 100)); index += 1) {
    pages.push({
      total_count: count,
      check_suites: suites.slice(index * 100, (index + 1) * 100),
    });
  }
  return pages;
}

function createCheckRunPages(checkRuns: Array<Record<string, unknown>>) {
  const pages = [];
  for (
    let index = 0;
    index < Math.max(1, Math.ceil(checkRuns.length / 100));
    index += 1
  ) {
    pages.push({
      total_count: checkRuns.length,
      check_runs: checkRuns.slice(index * 100, (index + 1) * 100),
    });
  }
  return pages;
}

function createWorkflowRunPages(workflowRuns: Array<Record<string, unknown>>) {
  const pages = [];
  for (
    let index = 0;
    index < Math.max(1, Math.ceil(workflowRuns.length / 100));
    index += 1
  ) {
    pages.push({
      total_count: workflowRuns.length,
      workflow_runs: workflowRuns.slice(index * 100, (index + 1) * 100),
    });
  }
  return pages;
}

function createWorkflowRunsForCheckRuns(
  checkRuns: Array<Record<string, unknown>>,
  releaseSha = "a".repeat(40),
) {
  const actionsSuites = new Map<number, Record<string, unknown>>();
  for (const entry of checkRuns) {
    if (Number((entry.app as { id?: unknown } | undefined)?.id) !== GITHUB_ACTIONS_APP_INTEGRATION_ID) {
      continue;
    }
    const checkSuiteId = Number(
      (entry.check_suite as { id?: unknown } | undefined)?.id,
    );
    actionsSuites.set(checkSuiteId, {
      id: 10_000 + checkSuiteId,
      workflow_id: 20_000 + checkSuiteId,
      check_suite_id: checkSuiteId,
      head_sha: releaseSha,
      event: "push",
      run_attempt: 1,
      status: "completed",
      conclusion: "success",
      path: `.github/workflows/workflow-${checkSuiteId}.yml`,
      repository: { full_name: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY },
      head_repository: { full_name: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY },
    });
  }
  return [...actionsSuites.values()];
}

function createCompleteCheckPageInput(
  checkRuns: Array<Record<string, unknown>>,
  releaseSha = "a".repeat(40),
) {
  const suiteIds = [...new Set(checkRuns.map((entry) =>
    Number((entry.check_suite as { id?: unknown } | undefined)?.id)))];
  const checkSuites = suiteIds.map((id) => ({
    id,
    head_sha: releaseSha,
    app: {
      id: Number((checkRuns.find((entry) =>
        Number((entry.check_suite as { id?: unknown } | undefined)?.id) === id
      )?.app as { id?: unknown } | undefined)?.id),
    },
  }));
  return {
    checkRunPages: createCheckRunPages(checkRuns),
    checkSuitePages: [{ total_count: checkSuites.length, check_suites: checkSuites }],
    workflowRunPages: createWorkflowRunPages(
      createWorkflowRunsForCheckRuns(checkRuns, releaseSha),
    ),
  };
}

function createGitGuardianCheckInput({
  checkApp = {},
  checkOverrides = {},
  releaseSha = "a".repeat(40),
  suiteApp = {},
  suiteOverrides = {},
}: {
  checkApp?: Record<string, unknown>,
  checkOverrides?: Record<string, unknown>,
  releaseSha?: string,
  suiteApp?: Record<string, unknown>,
  suiteOverrides?: Record<string, unknown>,
} = {}) {
  const actionsChecks = createTrustedCheckRuns(200).map((entry) => ({
    ...entry,
    head_sha: releaseSha,
  }));
  const gitGuardianCheck = {
    id: 100_832_681_323,
    app: {
      id: 46_505,
      slug: "gitguardian",
      name: "GitGuardian",
      ...checkApp,
    },
    check_suite: { id: 91_635_358_541 },
    external_id: "",
    head_sha: releaseSha,
    completed_at: "2026-09-04T01:00:30Z",
    conclusion: "success",
    name: "GitGuardian Security Checks",
    started_at: "2026-09-04T01:00:00Z",
    status: "completed",
    ...checkOverrides,
  };
  const checkRuns = [...actionsChecks, gitGuardianCheck];
  return {
    checkRunPages: createCheckRunPages(checkRuns),
    checkSuitePages: [{
      total_count: 2,
      check_suites: [
        {
          id: 200,
          head_sha: releaseSha,
          app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
        },
        {
          id: 91_635_358_541,
          head_sha: releaseSha,
          app: {
            id: 46_505,
            slug: "gitguardian",
            name: "GitGuardian",
            ...suiteApp,
          },
          repository: { full_name: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY },
          ...suiteOverrides,
        },
      ],
    }],
    releaseSha,
    workflowRunPages: createWorkflowRunPages(
      createWorkflowRunsForCheckRuns(actionsChecks, releaseSha),
    ),
  };
}

function createTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("GitHub production release attestation verification", () => {
  it("accepts distinct push and scheduled first-attempt runs from the same workflow owner", () => {
    const releaseSha = "a".repeat(40);
    const repeatedNames = [
      "changes", "smoke", "accessibility", "visual", "lighthouse", "full-regression",
    ];
    const uniqueNames = [
      ...EXPECTED_RELEASE_CONTEXTS,
      "ci-scope", "security-review-scope", "security-smoke-scope",
      "snyk", "smoke", "accessibility", "visual", "lighthouse", "full-regression",
    ];
    const pushRuns = uniqueNames.map((name, index) => ({
      id: 40_000 + index,
      app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
      check_suite: { id: name === "policy" ? 301 : name.startsWith("security-") ? 302 : 300 },
      head_sha: releaseSha,
      completed_at: `2026-09-04T00:01:${String(index).padStart(2, "0")}Z`,
      conclusion: "success",
      name,
      status: "completed",
    }));
    const scheduledRuns = repeatedNames.map((name, index) => ({
      id: 50_000 + index,
      app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
      check_suite: { id: 303 },
      head_sha: releaseSha,
      completed_at: `2026-09-04T01:01:${String(index).padStart(2, "0")}Z`,
      conclusion: "success",
      name,
      status: "completed",
    }));
    const checkRuns = [...pushRuns, ...scheduledRuns];
    const workflowRuns = [
      ...createWorkflowRunsForCheckRuns(pushRuns, releaseSha).map((run) => ({
        ...run,
        workflow_id: run.check_suite_id === 300 ? 24_611_855 : run.workflow_id,
        path: run.check_suite_id === 300
          ? ".github/workflows/playwright.yml"
          : run.path,
      })),
      {
        ...createWorkflowRunsForCheckRuns(scheduledRuns, releaseSha)[0],
        id: 33_802_670_408,
        workflow_id: 24_611_855,
        path: ".github/workflows/playwright.yml",
        event: "schedule",
      },
    ];
    const checkSuites = [...new Set(checkRuns.map((entry) => entry.check_suite.id))]
      .map((id) => ({
        id,
        head_sha: releaseSha,
        app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
      }));

    const evidence = buildGitHubProductionReleaseExternalCheckEvidence({
      checkRunPages: createCheckRunPages(checkRuns),
      checkSuitePages: [{ total_count: checkSuites.length, check_suites: checkSuites }],
      workflowRunPages: createWorkflowRunPages(workflowRuns),
      releaseSha,
    });

    expect(evidence.required_check_summary).toEqual({
      total: 16,
      success: 16,
      intended_skip: 0,
      bad: 0,
      cancelled: 0,
      failed: 0,
      pending: 0,
      queued: 0,
      rerun: 0,
    });
    expect(evidence).toMatchObject({
      all_actions_workflow_run_provenance_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
  });

  it("rejects actual Actions reruns and missing or inconsistent workflow metadata", () => {
    const releaseSha = "a".repeat(40);
    const checkRuns = createTrustedCheckRuns(200).map((entry) => ({
      ...entry,
      head_sha: releaseSha,
    }));
    const workflowRuns = createWorkflowRunsForCheckRuns(checkRuns, releaseSha);
    const base = {
      checkRunPages: createCheckRunPages(checkRuns),
      checkSuitePages: [{
        total_count: 1,
        check_suites: [{
          id: 200,
          head_sha: releaseSha,
          app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
        }],
      }],
      releaseSha,
    };

    expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
      ...base,
      workflowRunPages: createWorkflowRunPages(workflowRuns.map((run) => ({
        ...run,
        run_attempt: 2,
      }))),
    })).toThrow(/attempt|rerun/iu);
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence(base))
      .toThrow(/workflow.run|metadata|page/iu);
    for (const mutation of [
      { head_sha: "b".repeat(40) },
      { repository: { full_name: "attacker/homecook" } },
      { head_repository: { full_name: "attacker/homecook" } },
    ]) {
      expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
        ...base,
        workflowRunPages: createWorkflowRunPages(workflowRuns.map((run) => ({
          ...run,
          ...mutation,
        }))),
      })).toThrow(/workflow.run|head|repository|metadata/iu);
    }

    const incompletePages = createWorkflowRunPages(workflowRuns).map((page) => ({
      ...page,
      total_count: page.total_count + 1,
    }));
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
      ...base,
      workflowRunPages: incompletePages,
    })).toThrow(/workflow.run|count|page|pagination/iu);

    const boundaryRuns = Array.from({ length: 1_000 }, (_, index) => ({
      ...workflowRuns[0],
      id: 90_000 + index,
      check_suite_id: 90_000 + index,
    }));
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
      ...base,
      workflowRunPages: createWorkflowRunPages(boundaryRuns),
    })).toThrow(/1000|boundary|workflow.run/iu);
  });

  it("rejects pending and failed historical instances even when another first attempt succeeds", () => {
    const releaseSha = "a".repeat(40);
    const successful = createTrustedCheckRuns(200).map((entry) => ({
      ...entry,
      head_sha: releaseSha,
    }));
    const changes = successful.find((entry) => entry.name === "changes")!;
    const workflowRuns = createWorkflowRunsForCheckRuns(successful, releaseSha);
    for (const historical of [
      {
        ...changes,
        id: 60_001,
        check_suite: { id: 201 },
        status: "in_progress",
        conclusion: null,
        completed_at: null,
      },
      {
        ...changes,
        id: 60_002,
        check_suite: { id: 202 },
        status: "completed",
        conclusion: "failure",
      },
    ]) {
      const checkRuns = [...successful, historical];
      const historicalWorkflow = {
        ...createWorkflowRunsForCheckRuns([historical], releaseSha)[0],
        workflow_id: workflowRuns[0].workflow_id,
        path: workflowRuns[0].path,
        event: "schedule",
        status: historical.status === "completed" ? "completed" : "in_progress",
        conclusion: historical.conclusion === "failure" ? "failure" : null,
      };
      expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
        ...createCompleteCheckPageInput(checkRuns, releaseSha),
        workflowRunPages: createWorkflowRunPages([...workflowRuns, historicalWorkflow]),
        releaseSha,
      })).toThrow(/pending|failed|terminal|workflow.run/iu);
    }
  });

  it("rejects cross-workflow context ownership collisions and non-Actions started checks", () => {
    const releaseSha = "a".repeat(40);
    const checks = createTrustedCheckRuns(200).map((entry) => ({
      ...entry,
      head_sha: releaseSha,
    }));
    const changes = checks.find((entry) => entry.name === "changes")!;
    const duplicate = {
      ...changes,
      id: 70_001,
      check_suite: { id: 201 },
      completed_at: "2026-09-04T01:00:00Z",
    };
    const allChecks = [...checks, duplicate];
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
      ...createCompleteCheckPageInput(allChecks, releaseSha),
      releaseSha,
    })).toThrow(/workflow|owner|path|collision|context/iu);

    const sameRunDuplicate = {
      ...changes,
      id: 70_003,
      completed_at: "2026-09-04T01:00:00Z",
    };
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
      ...createCompleteCheckPageInput([...checks, sameRunDuplicate], releaseSha),
      releaseSha,
    })).toThrow(/same|inside|run|suite|duplicate/iu);

    const externalStartedCheck = {
      ...changes,
      id: 70_002,
      app: { id: 99_999, slug: "unknown", name: "Unknown App" },
      check_suite: { id: 202 },
      name: "Unknown External Check",
    };
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
      ...createCompleteCheckPageInput([...checks, externalStartedCheck], releaseSha),
      releaseSha,
    })).toThrow(/non.Actions|allowlist|external|integration|started/iu);
  });

  it("preserves empty external suites in suite authority and rejects current-contract statuses", () => {
    const releaseSha = "a".repeat(40);
    const checks = createTrustedCheckRuns(200).map((entry) => ({
      ...entry,
      head_sha: releaseSha,
    }));
    const workflowRunPages = createWorkflowRunPages(
      createWorkflowRunsForCheckRuns(checks, releaseSha),
    );
    const checkSuitePages = [{
      total_count: 2,
      check_suites: [
        { id: 200, head_sha: releaseSha, app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID } },
        { id: 201, head_sha: releaseSha, app: { id: 46_505 }, latest_check_runs_count: 0 },
      ],
    }];
    const evidence = buildGitHubProductionReleaseExternalCheckEvidence({
      checkRunPages: createCheckRunPages(checks),
      checkSuitePages,
      workflowRunPages,
      releaseSha,
    });
    expect(evidence.all_check_suite_count).toBe(2);
    expect(evidence.all_context_check_suite_ids).toEqual([200]);

    expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
      checkRunPages: createCheckRunPages(checks),
      checkSuitePages,
      workflowRunPages,
      commitStatuses: [{
        id: 1,
        sha: releaseSha,
        context: "legacy",
        state: "success",
      }],
      releaseSha,
    })).toThrow(/commit status|legacy|empty/iu);
  });

  it("accepts exactly one canonical successful GitGuardian check and seals its owner evidence", () => {
    const evidence = buildGitHubProductionReleaseExternalCheckEvidence(
      createGitGuardianCheckInput(),
    );

    expect(evidence.required_check_summary).toMatchObject({
      total: EXPECTED_RELEASE_CONTEXTS.length + 1,
      success: EXPECTED_RELEASE_CONTEXTS.length + 1,
      rerun: 0,
    });
    expect(evidence.all_context_check_run_instances_digest)
      .toMatch(/^[0-9a-f]{64}$/u);
  });

  it.each([
    {
      label: "unknown app id",
      options: { checkApp: { id: 99_999 }, suiteApp: { id: 99_999 } },
    },
    {
      label: "wrong app slug",
      options: { checkApp: { slug: "gitguardian-lookalike" }, suiteApp: { slug: "gitguardian-lookalike" } },
    },
    {
      label: "wrong app name",
      options: { checkApp: { name: "Git Guardian" }, suiteApp: { name: "Git Guardian" } },
    },
    {
      label: "wrong check name",
      options: { checkOverrides: { name: "GitGuardian Security Check" } },
    },
    {
      label: "nonempty external id",
      options: { checkOverrides: { external_id: "forged" } },
    },
    {
      label: "wrong repository",
      options: { suiteOverrides: { repository: { full_name: "attacker/homecook" } } },
    },
    {
      label: "wrong check head",
      options: { checkOverrides: { head_sha: "b".repeat(40) } },
    },
    {
      label: "wrong suite head",
      options: { suiteOverrides: { head_sha: "b".repeat(40) } },
    },
    {
      label: "unknown suite id",
      options: { checkOverrides: { check_suite: { id: 123_456 } } },
    },
  ])("rejects a noncanonical external check: $label", ({ options }) => {
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence(
      createGitGuardianCheckInput(options),
    )).toThrow(/GitGuardian|allowlist|external|repository|head|SHA|suite|App/iu);
  });

  it.each([
    { status: "completed", conclusion: "skipped" },
    { status: "completed", conclusion: "neutral" },
    { status: "completed", conclusion: "failure" },
    { status: "completed", conclusion: "cancelled" },
    { status: "in_progress", conclusion: null },
    { status: "queued", conclusion: null },
  ])("rejects non-success GitGuardian state: $status/$conclusion", (checkOverrides) => {
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence(
      createGitGuardianCheckInput({ checkOverrides }),
    )).toThrow(/GitGuardian|success|pending|failed|cancelled|terminal/iu);
  });

  it("rejects duplicate canonical GitGuardian instances", () => {
    const input = createGitGuardianCheckInput();
    const externalCheck = input.checkRunPages[0].check_runs.at(-1)!;
    const externalSuite = input.checkSuitePages[0].check_suites.at(-1)!;
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
      ...input,
      checkRunPages: createCheckRunPages([
        ...input.checkRunPages[0].check_runs,
        {
          ...externalCheck,
          id: 100_832_681_324,
          check_suite: { id: 91_635_358_542 },
        },
      ]),
      checkSuitePages: [{
        total_count: 3,
        check_suites: [
          ...input.checkSuitePages[0].check_suites,
          { ...externalSuite, id: 91_635_358_542 },
        ],
      }],
    })).toThrow(/exactly one|duplicate|GitGuardian/iu);
  });

  it("changes sealed provenance when a legitimate workflow event changes at final refresh", () => {
    const releaseSha = "a".repeat(40);
    const checks = createTrustedCheckRuns(200).map((entry) => ({
      ...entry,
      head_sha: releaseSha,
    }));
    const input = createCompleteCheckPageInput(checks, releaseSha);
    const initial = buildGitHubProductionReleaseExternalCheckEvidence({
      ...input,
      releaseSha,
    });
    const refreshed = buildGitHubProductionReleaseExternalCheckEvidence({
      ...input,
      workflowRunPages: input.workflowRunPages.map((page) => ({
        ...page,
        workflow_runs: page.workflow_runs.map((run) => ({ ...run, event: "schedule" })),
      })),
      releaseSha,
    });

    expect(refreshed.all_actions_workflow_run_provenance_digest)
      .not.toBe(initial.all_actions_workflow_run_provenance_digest);
    expect(refreshed.all_context_check_run_instances_digest)
      .not.toBe(initial.all_context_check_run_instances_digest);
  });
  it("proves a complete below-boundary 999-suite snapshot without per-suite check-run calls", () => {
    const checkRuns = createTrustedCheckRuns(200);
    const evidence = buildGitHubProductionReleaseExternalCheckEvidence({
      checkRunPages: createCheckRunPages(checkRuns),
      checkSuitePages: createCheckSuitePages({ count: 999 }),
      workflowRunPages: createWorkflowRunPages(
        createWorkflowRunsForCheckRuns(checkRuns),
      ),
      releaseSha: "a".repeat(40),
    });

    expect(evidence).toMatchObject({
      all_check_suite_count: 999,
      all_check_suite_ids_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      all_context_check_run_instances_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      all_context_check_suite_ids: [200],
      required_check_summary: {
        rerun: 0,
        success: EXPECTED_RELEASE_CONTEXTS.length,
      },
    });
  });

  it("fails closed at the documented 1000-suite check-runs truncation boundary", () => {
    const checkRuns = createTrustedCheckRuns(200);
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
      checkRunPages: createCheckRunPages(checkRuns),
      checkSuitePages: createCheckSuitePages({ count: 1_000 }),
      releaseSha: "a".repeat(40),
    })).toThrow(/1000|boundary|truncat|suite/iu);
  });

  it.each([
    {
      label: "missing page",
      mutate: (pages: ReturnType<typeof createCheckSuitePages>) => pages.slice(0, -1),
    },
    {
      label: "duplicate page",
      mutate: (pages: ReturnType<typeof createCheckSuitePages>) => [
        pages[0],
        pages[0],
        ...pages.slice(2),
      ],
    },
    {
      label: "fake total count",
      mutate: (pages: ReturnType<typeof createCheckSuitePages>) => pages.map((page) => ({
        ...page,
        total_count: page.total_count + 1,
      })),
    },
  ])("rejects incomplete suite pagination: $label", ({ mutate }) => {
    const checkRuns = createTrustedCheckRuns(200);
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
      checkRunPages: createCheckRunPages(checkRuns),
      checkSuitePages: mutate(createCheckSuitePages({ count: 201 })),
      releaseSha: "a".repeat(40),
    })).toThrow(/complete|count|duplicate|page|pagination|suite/iu);
  });

  it.each([
    {
      label: "missing page",
      mutate: (pages: ReturnType<typeof createCheckRunPages>) => pages.slice(0, -1),
    },
    {
      label: "duplicate page",
      mutate: (pages: ReturnType<typeof createCheckRunPages>) => [pages[0], pages[0]],
    },
    {
      label: "fake total count",
      mutate: (pages: ReturnType<typeof createCheckRunPages>) => pages.map((page) => ({
        ...page,
        total_count: page.total_count + 1,
      })),
    },
  ])("rejects incomplete check-run pagination: $label", ({ mutate }) => {
    const checkRuns = [
      ...createTrustedCheckRuns(200),
      ...Array.from({ length: 100 }, (_, index) => ({
        id: 5_000 + index,
        app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
        check_suite: { id: 200 },
        completed_at: "2026-08-26T10:00:00Z",
        conclusion: "success",
        name: `optional-${index}`,
        status: "completed",
      })),
    ];
    expect(() => buildGitHubProductionReleaseExternalCheckEvidence({
      checkRunPages: mutate(createCheckRunPages(checkRuns)),
      checkSuitePages: createCheckSuitePages({ count: 1 }),
      releaseSha: "a".repeat(40),
    })).toThrow(/complete|count|duplicate|page|pagination|check-run/iu);
  });

  it("rejects an actual second workflow attempt from complete workflow-run pages", () => {
    const initialRuns = createTrustedCheckRuns(200);
    const originalQuality = initialRuns.find((entry) => entry.name === "quality");
    const rerun = {
      ...originalQuality,
      id: 2_005,
      completed_at: "2026-08-26T10:00:00Z",
      started_at: "2026-08-26T09:59:00Z",
    };
    const workflowRunPages = createWorkflowRunPages(
      createWorkflowRunsForCheckRuns(initialRuns).map((run) => ({
        ...run,
        run_attempt: 2,
      })),
    );
    expect(() => buildGitHubProductionReleaseAttestationArtifacts({
      checkRuns: [...initialRuns, rerun],
      checkRunPages: createCheckRunPages([...initialRuns, rerun]),
      checkSuitePages: createCheckSuitePages({ count: 1 }),
      workflowRunPages,
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.11",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: "b".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      rehearsalAuthority: REHEARSAL_AUTHORITY,
      workflowAuthority: WORKFLOW_AUTHORITY,
      approvalAuthority: APPROVAL_AUTHORITY,
    })).toThrow(/rerun|fresh|check-run/iu);
  });

  it("keeps the exact current self-suite in complete authority while excluding it only from external results", () => {
    const releaseSha = WORKFLOW_AUTHORITY.workflow_head_sha;
    const externalRuns = createTrustedCheckRuns(200).map((entry) => ({
      ...entry,
      head_sha: releaseSha,
    }));
    const selfRun = {
      id: 9_003,
      app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
      check_suite: { id: WORKFLOW_AUTHORITY.workflow_check_suite_id },
      head_sha: releaseSha,
      name: "approve-and-tag",
      started_at: "2026-08-26T10:00:00Z",
      status: "in_progress",
    };
    const allRuns = [...externalRuns, selfRun];
    const artifacts = buildGitHubProductionReleaseAttestationArtifacts({
      checkRuns: allRuns,
      checkRunPages: createCheckRunPages(allRuns),
      checkSuitePages: [{
        total_count: 2,
        check_suites: [
          { id: 200, head_sha: releaseSha, app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID } },
          { id: WORKFLOW_AUTHORITY.workflow_check_suite_id, head_sha: releaseSha, app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID } },
        ],
      }],
      workflowRunPages: createWorkflowRunPages([
        ...createWorkflowRunsForCheckRuns(externalRuns, releaseSha),
        {
          id: WORKFLOW_AUTHORITY.workflow_run_id,
          workflow_id: 9_001,
          check_suite_id: WORKFLOW_AUTHORITY.workflow_check_suite_id,
          head_sha: releaseSha,
          event: "workflow_dispatch",
          run_attempt: 1,
          status: "completed",
          conclusion: "success",
          path: ".github/workflows/production-release-attestation.yml",
          repository: { full_name: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY },
          head_repository: { full_name: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY },
        },
      ]),
      excludedCheckSuiteIds: [WORKFLOW_AUTHORITY.workflow_check_suite_id],
      releaseSha,
      releaseTag: "prod-20260826.12",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: WORKFLOW_AUTHORITY.workflow_head_tree,
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      rehearsalAuthority: CURRENT_TIP_REHEARSAL_AUTHORITY,
      workflowAuthority: WORKFLOW_AUTHORITY,
      approvalAuthority: APPROVAL_AUTHORITY,
    });

    expect(artifacts.subject).toMatchObject({
      all_check_suite_count: 2,
      all_context_check_suite_ids: [200],
      workflow_check_suite_id: WORKFLOW_AUTHORITY.workflow_check_suite_id,
    });
    expect(() => buildGitHubProductionReleaseAttestationArtifacts({
      checkRuns: externalRuns,
      checkRunPages: createCheckRunPages(externalRuns),
      checkSuitePages: [{
        total_count: 1,
        check_suites: [{ id: 200, head_sha: releaseSha, app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID } }],
      }],
      excludedCheckSuiteIds: [],
      releaseSha,
      releaseTag: "prod-20260826.13",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: WORKFLOW_AUTHORITY.workflow_head_tree,
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      rehearsalAuthority: CURRENT_TIP_REHEARSAL_AUTHORITY,
      workflowAuthority: WORKFLOW_AUTHORITY,
      approvalAuthority: APPROVAL_AUTHORITY,
    })).toThrow(/self|current workflow suite|complete suite/iu);
  });

  it("separates approved-ancestor payload identity from exact current workflow-run authority", () => {
    const buildWorkflowEvidence = (
      productionAttestationAuthority as unknown as Record<string, unknown>
    ).buildGitHubProductionReleaseWorkflowEvidence;
    expect(typeof buildWorkflowEvidence).toBe("function");
    if (typeof buildWorkflowEvidence !== "function") return;

    const input = {
      releaseSha: "a".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      sourceRef: CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
      workflowHeadSha: WORKFLOW_AUTHORITY.workflow_head_sha,
      workflowHeadTree: WORKFLOW_AUTHORITY.workflow_head_tree,
      workflowId: 77,
      workflowPath: ".github/workflows/production-release-attestation.yml",
      runId: WORKFLOW_AUTHORITY.workflow_run_id,
      runAttempt: WORKFLOW_AUTHORITY.workflow_run_attempt,
      run: {
        id: WORKFLOW_AUTHORITY.workflow_run_id,
        run_attempt: WORKFLOW_AUTHORITY.workflow_run_attempt,
        check_suite_id: WORKFLOW_AUTHORITY.workflow_check_suite_id,
        workflow_id: 77,
        path: ".github/workflows/production-release-attestation.yml",
        event: "workflow_dispatch",
        head_sha: WORKFLOW_AUTHORITY.workflow_head_sha,
        head_branch: "master",
        head_repository: { full_name: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY },
        repository: { full_name: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY },
      },
    };
    const invoke = (overrides: Record<string, unknown> = {}) =>
      (buildWorkflowEvidence as (value: Record<string, unknown>) => Record<string, unknown>)({
        ...input,
        ...overrides,
      });

    expect(invoke()).toMatchObject({
      workflow_authority: WORKFLOW_AUTHORITY,
      suite_exclusion: {
        release_sha: "a".repeat(40),
        workflow_head_sha: WORKFLOW_AUTHORITY.workflow_head_sha,
        workflow_run_id: WORKFLOW_AUTHORITY.workflow_run_id,
        check_suite_ids: [],
      },
    });
    expect(invoke({ releaseSha: WORKFLOW_AUTHORITY.workflow_head_sha })).toMatchObject({
      suite_exclusion: {
        check_suite_ids: [WORKFLOW_AUTHORITY.workflow_check_suite_id],
      },
    });

    for (const [label, run] of [
      ["head", { ...input.run, head_sha: "0".repeat(40) }],
      ["ref", { ...input.run, head_branch: "feature/forged" }],
      ["run ID", { ...input.run, id: WORKFLOW_AUTHORITY.workflow_run_id + 1 }],
    ] as const) {
      expect(() => invoke({ run }), label).toThrow(/workflow|run|head|ref|branch|identity/iu);
    }
  });

  it("keeps tag push and attestation at zero without a fresh completion safety margin", () => {
    expect(typeof rehearsalAuthorityCli.assertRehearsalAuthorityFreshForTagPush).toBe("function");
    const tagPush = vi.fn();
    const attest = vi.fn();
    expect(() => {
      rehearsalAuthorityCli.assertRehearsalAuthorityFreshForTagPush({
        validUntil: "2026-08-30T09:00:00.000Z",
        now: new Date("2026-08-30T08:45:00.000Z"),
        minimumRemainingSeconds: 900,
      });
      tagPush();
      attest();
    }).toThrow(/expiry|margin|valid_until|remaining/iu);
    expect(tagPush).toHaveBeenCalledTimes(0);
    expect(attest).toHaveBeenCalledTimes(0);
    expect(() => rehearsalAuthorityCli.assertRehearsalAuthorityFreshForTagPush({
      validUntil: "2026-08-30T09:00:00.000Z",
      now: new Date("2026-08-30T08:44:59.999Z"),
      minimumRemainingSeconds: 900,
    })).not.toThrow();
  });

  it("builds v2 subject, predicate, and canonical tag message from one rehearsal authority", () => {
    expect(typeof productionAttestationAuthority.buildProductionReleaseAnnotatedTagMessage).toBe("function");
    const checkRuns = createTrustedCheckRuns();
    const artifacts = buildGitHubProductionReleaseAttestationArtifacts({
      checkRuns,
      ...createCompleteCheckPageInput(checkRuns),
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.1",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: "b".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      rehearsalAuthority: REHEARSAL_AUTHORITY,
      workflowAuthority: WORKFLOW_AUTHORITY,
      approvalAuthority: APPROVAL_AUTHORITY,
    });

    expect(artifacts.subject).toMatchObject({
      schema: "homecook.github.production-release-manifest.v3",
      ...REHEARSAL_AUTHORITY,
      ...WORKFLOW_AUTHORITY,
      ...APPROVAL_AUTHORITY,
      signer_digest: WORKFLOW_AUTHORITY.workflow_head_sha,
      all_check_suite_count: 1,
      all_check_suite_ids_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      all_context_check_suite_ids: [200],
      all_context_check_run_instances_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(artifacts.predicate).toMatchObject({
      schema: "homecook.github.production-release-predicate.v3",
      ...REHEARSAL_AUTHORITY,
      ...WORKFLOW_AUTHORITY,
      ...APPROVAL_AUTHORITY,
      signer_digest: WORKFLOW_AUTHORITY.workflow_head_sha,
      all_check_suite_count: 1,
      all_check_suite_ids_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      all_context_check_suite_ids: [200],
      all_context_check_run_instances_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(productionAttestationAuthority.buildProductionReleaseAnnotatedTagMessage({
      releaseTag: "prod-20260826.1",
      ...WORKFLOW_AUTHORITY,
      ...APPROVAL_AUTHORITY,
      ...REHEARSAL_AUTHORITY,
    })).toBe([
      "Approved production release prod-20260826.1",
      `build_id ${REHEARSAL_AUTHORITY.build_id}`,
      `rehearsal_receipt_schema ${REHEARSAL_AUTHORITY.rehearsal_receipt_schema}`,
      `workflow_head_sha ${WORKFLOW_AUTHORITY.workflow_head_sha}`,
      `workflow_head_tree ${WORKFLOW_AUTHORITY.workflow_head_tree}`,
      `master_sha_at_approval ${APPROVAL_AUTHORITY.master_sha_at_approval}`,
      `master_tree_at_approval ${APPROVAL_AUTHORITY.master_tree_at_approval}`,
      `selection_digest ${REHEARSAL_AUTHORITY.selection_digest}`,
      `sealed_bundle_digest ${REHEARSAL_AUTHORITY.sealed_bundle_digest}`,
      `repeatability_receipt_digest ${REHEARSAL_AUTHORITY.repeatability_receipt_digest}`,
      `rehearsal_receipt_valid_until ${REHEARSAL_AUTHORITY.rehearsal_receipt_valid_until}`,
    ].join("\n"));
  });

  it("attests the immutable full selection authority instead of accepting a digest-only claim", () => {
    const checkRuns = createTrustedCheckRuns();
    const artifacts = buildGitHubProductionReleaseAttestationArtifacts({
      checkRuns,
      ...createCompleteCheckPageInput(checkRuns),
      releaseSha: FULL_SELECTION.selected_sha,
      releaseTag: "prod-20260826.2",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: FULL_SELECTION.selected_tree,
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      rehearsalAuthority: FULL_REHEARSAL_AUTHORITY,
      workflowAuthority: WORKFLOW_AUTHORITY,
      approvalAuthority: APPROVAL_AUTHORITY,
    });

    for (const key of [
      "observed_master_sha", "observed_master_tree", "selected_sha", "selected_tree",
      "approver_role", "approver_id", "approval_digest", "selected_at", "expires_at",
      "selection_digest",
    ] as const) {
      expect((artifacts.subject as unknown as Record<string, unknown>)[key]).toBe(
        (FULL_REHEARSAL_AUTHORITY as Record<string, unknown>)[key],
      );
      expect((artifacts.predicate as unknown as Record<string, unknown>)[key]).toBe(
        (FULL_REHEARSAL_AUTHORITY as Record<string, unknown>)[key],
      );
    }

    expect(() => buildGitHubProductionReleaseAttestationArtifacts({
      checkRuns,
      ...createCompleteCheckPageInput(checkRuns),
      releaseSha: FULL_SELECTION.selected_sha,
      releaseTag: "prod-20260826.3",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: FULL_SELECTION.selected_tree,
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      rehearsalAuthority: {
        ...FULL_REHEARSAL_AUTHORITY,
        approver_id: "substituted-approver",
      },
      workflowAuthority: WORKFLOW_AUTHORITY,
      approvalAuthority: APPROVAL_AUTHORITY,
    })).toThrow(/selection|digest|authority|approver/iu);
  });

  it("revalidates the selection file and complete current-master lineage before exposing attestation authority", () => {
    const output: string[] = [];
    const readSelection = vi.fn(() => FULL_SELECTION);
    const resolveSelectionAuthority = vi.fn(() => ({
      mode: "approved_ancestor",
      release_sha: FULL_SELECTION.selected_sha,
      release_tree: FULL_SELECTION.selected_tree,
      selection_digest: FULL_SELECTION.selection_digest,
      observed_master_sha: FULL_SELECTION.observed_master_sha,
      observed_master_tree: FULL_SELECTION.observed_master_tree,
      current_master_sha: "f".repeat(40),
      current_master_tree: "1".repeat(40),
    }));

    const result = rehearsalAuthorityCli.runProductionReleaseRehearsalAuthorityCli([
      "--member-receipt", "/private/member-1.json",
      "--member-receipt", "/private/member-2.json",
      "--repeatability-receipt", "/private/repeatability.json",
      "--selection", `/private/${FULL_SELECTION.selection_digest}.selection.json`,
      "--repository-root", process.cwd(),
      "--current-master-sha", "f".repeat(40),
      "--release-sha", FULL_SELECTION.selected_sha,
      "--release-tree", FULL_SELECTION.selected_tree,
      "--json",
    ], {
      now: new Date("2026-08-29T10:00:00.000Z"),
      output: { write: (value: string) => { output.push(value); } },
      readSource: () => "{}",
      verifyAuthority: () => ({
        ...REHEARSAL_AUTHORITY,
        selection_digest: FULL_SELECTION.selection_digest,
        release_sha: FULL_SELECTION.selected_sha,
        release_tree: FULL_SELECTION.selected_tree,
      }),
      readSelection,
      resolveSelectionAuthority,
    });

    expect(readSelection).toHaveBeenCalledWith(
      `/private/${FULL_SELECTION.selection_digest}.selection.json`,
      expect.objectContaining({ repoRoot: process.cwd() }),
    );
    expect(resolveSelectionAuthority).toHaveBeenCalledWith(expect.objectContaining({
      releaseSha: FULL_SELECTION.selected_sha,
      selection: FULL_SELECTION,
    }));
    expect(result).toMatchObject(FULL_REHEARSAL_AUTHORITY);
    expect(JSON.parse(output.join(""))).toMatchObject(FULL_REHEARSAL_AUTHORITY);
  });

  it("resolves only an explicitly allowlisted absolute GitHub CLI and rejects escapes", () => {
    const root = createTempDirectory("trusted-gh-");
    const trustedBin = join(root, "trusted-bin");
    const hostileBin = join(root, "hostile-bin");
    mkdirSync(trustedBin, { mode: 0o700 });
    mkdirSync(hostileBin, { mode: 0o700 });
    const trustedGh = join(trustedBin, "gh");
    const hostileGh = join(hostileBin, "gh");
    writeFileSync(trustedGh, "trusted", { mode: 0o700 });
    writeFileSync(hostileGh, "hostile", { mode: 0o700 });

    expect(resolveTrustedGhExecutable({
      allowedRealpaths: [realpathSync(trustedGh)],
      candidates: [trustedGh],
      currentUid: statSync(root).uid,
      pathEnvironment: hostileBin,
    })).toBe(realpathSync(trustedGh));

    chmodSync(trustedGh, 0o722);
    expect(() => resolveTrustedGhExecutable({
      allowedRealpaths: [realpathSync(trustedGh)],
      candidates: [trustedGh],
      currentUid: statSync(root).uid,
      pathEnvironment: hostileBin,
    })).toThrow(/GitHub CLI|mode|unsafe/iu);
    chmodSync(trustedGh, 0o700);
    const escapedGh = join(trustedBin, "gh-escape");
    symlinkSync(hostileGh, escapedGh);
    expect(() => resolveTrustedGhExecutable({
      allowedRealpaths: [realpathSync(trustedGh)],
      candidates: [escapedGh],
      currentUid: statSync(root).uid,
      pathEnvironment: hostileBin,
    })).toThrow(/GitHub CLI|realpath|trusted|unavailable/iu);
  });

  it("detects trusted executable byte drift across a long-running verification", () => {
    const root = createTempDirectory("trusted-tool-snapshot-");
    const tool = join(root, "tool");
    writeFileSync(tool, "version-a", { mode: 0o700 });
    const before = snapshotTrustedExecutables({ tool });

    writeFileSync(tool, "version-b", { mode: 0o700 });

    expect(() => assertTrustedExecutableSnapshotStable(before, { tool }))
      .toThrow(/trusted executable|changed|digest/iu);
  });

  it("accepts expected contexts only from the trusted GitHub Actions App and never from commit statuses", () => {
    const releaseInput = {
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.1",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: "b".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
    };

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [],
        commitStatuses: [],
      }),
    ).toThrow(/expected|context|status/iu);

    const spoofedStatuses = EXPECTED_RELEASE_CONTEXTS.map((context, index) => ({
      context,
      state: "success",
      updated_at: `2026-08-26T09:01:${String(index).padStart(2, "0")}Z`,
    }));
    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [],
        commitStatuses: spoofedStatuses,
      }),
    ).toThrow(/missing|trusted|GitHub Actions|context/iu);

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: createTrustedCheckRuns().map((entry) => ({
          ...entry,
          app: { id: 99999 },
        })),
      }),
    ).toThrow(/trusted|integration|GitHub Actions|app/iu);

    expect(
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: createTrustedCheckRuns(),
      }).subject.expected_release_contexts,
    ).toEqual(EXPECTED_RELEASE_CONTEXTS);
  });

  it("requires the latest trusted result for every expected context to be exactly success", () => {
    const releaseInput = {
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.1",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: "b".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
    };
    const checks = createTrustedCheckRuns();
    const quality = checks.find((entry) => entry.name === "quality");

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [
          ...checks,
          {
            ...quality,
            id: 2_004,
            check_suite: { id: 201 },
            completed_at: "2026-08-26T10:00:00Z",
            conclusion: "skipped",
          },
        ],
      }),
    ).toThrow(/quality|expected context|latest|success/iu);

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [
          ...checks,
          {
            ...quality,
            id: 3_004,
            check_suite: { id: 202 },
            completed_at: "2026-08-26T08:00:00Z",
            conclusion: "skipped",
          },
        ],
      }),
    ).toThrow(/quality|rerun|fresh|check-run/iu);

    const optionalCheck = {
      id: 9_999,
      app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
      check_suite: { id: 999 },
      completed_at: "2026-08-26T10:01:00Z",
      conclusion: "skipped",
      name: "optional-security-advisory",
      status: "completed",
    };
    expect(
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [...checks, optionalCheck],
      }).subject.required_check_summary,
    ).toMatchObject({ intended_skip: 1, rerun: 0 });

    for (const invalidOptionalCheck of [
      { ...optionalCheck, conclusion: "neutral" },
      { ...optionalCheck, completed_at: null, conclusion: null, status: "in_progress" },
      { ...optionalCheck, conclusion: "failure" },
      { ...optionalCheck, conclusion: "cancelled" },
    ]) {
      expect(() => buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [...checks, invalidOptionalCheck],
      })).toThrow(/optional-security-advisory|neutral|pending|failed|cancelled|terminal/iu);
    }
  });

  it("counts a successful required-context check-run replacement as a rerun and rejects it", () => {
    const releaseInput = {
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.8",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: "b".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
    };
    const normalizeCheckSummary = normalizeGitHubProductionReleaseCheckSummary as unknown as (
      input: { checkRuns: Array<Record<string, unknown>> },
    ) => { rerun: number; success: number };
    const originalChecks = createTrustedCheckRuns(200);
    expect(normalizeCheckSummary({
      checkRuns: originalChecks,
    })).toMatchObject({ rerun: 0, success: EXPECTED_RELEASE_CONTEXTS.length });
    expect(() => buildGitHubProductionReleaseAttestationArtifacts({
      ...releaseInput,
      checkRuns: originalChecks,
    })).not.toThrow();

    const originalQuality = originalChecks.find((entry) => entry.name === "quality");
    const successfulQualityRerun = {
      ...originalQuality,
      id: 2_005,
      check_suite: { id: 201 },
      completed_at: "2026-08-26T10:00:00Z",
      started_at: "2026-08-26T09:59:00Z",
    };
    const rawRerunSnapshot = [...originalChecks, successfulQualityRerun];
    expect(normalizeCheckSummary({
      checkRuns: rawRerunSnapshot,
    })).toMatchObject({ rerun: 1, success: EXPECTED_RELEASE_CONTEXTS.length });
    expect(() => buildGitHubProductionReleaseAttestationArtifacts({
      ...releaseInput,
      checkRuns: rawRerunSnapshot,
    })).toThrow(/rerun|fresh|required context|check-run/iu);
  });

  it("counts successful optional-context replacements as reruns while accepting one exact instance", () => {
    const releaseInput = {
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.10",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: "b".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      rehearsalAuthority: REHEARSAL_AUTHORITY,
      workflowAuthority: WORKFLOW_AUTHORITY,
      approvalAuthority: APPROVAL_AUTHORITY,
    };
    const optionalSecurityAdvisory = {
      id: 3_001,
      app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
      check_suite: { id: 301 },
      head_sha: "a".repeat(40),
      completed_at: "2026-08-26T10:00:00Z",
      conclusion: "success",
      name: "optional-security-advisory",
      status: "completed",
    };

    const oneOptionalInstance = buildGitHubProductionReleaseAttestationArtifacts({
      ...releaseInput,
      checkRuns: [...createTrustedCheckRuns(), optionalSecurityAdvisory],
      ...createCompleteCheckPageInput([...createTrustedCheckRuns(), optionalSecurityAdvisory]),
    });
    expect(oneOptionalInstance.subject.required_check_summary).toMatchObject({ rerun: 0 });
    expect(oneOptionalInstance.subject).toMatchObject({
      all_context_check_suite_ids: [200, 301],
      all_context_check_run_instances_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });

    expect(() => buildGitHubProductionReleaseAttestationArtifacts({
      ...releaseInput,
      checkRuns: [
        ...createTrustedCheckRuns(),
        optionalSecurityAdvisory,
        {
          ...optionalSecurityAdvisory,
          id: 3_002,
          check_suite: { id: 302 },
          completed_at: "2026-08-26T10:01:00Z",
        },
      ],
      ...createCompleteCheckPageInput([
        ...createTrustedCheckRuns(),
        optionalSecurityAdvisory,
        {
          ...optionalSecurityAdvisory,
          id: 3_002,
          check_suite: { id: 302 },
          completed_at: "2026-08-26T10:01:00Z",
        },
      ]),
    })).toThrow(/optional-security-advisory|rerun|fresh|check-run|workflow|owner|collision/iu);
  });

  it("rejects a new pending, rerun, or failed check discovered by the final attestation refresh", () => {
    const releaseInput = {
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.9",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: "b".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
    };
    const staleApprovedChecks = createTrustedCheckRuns();
    expect(() => buildGitHubProductionReleaseAttestationArtifacts({
      ...releaseInput,
      checkRuns: staleApprovedChecks,
    })).not.toThrow();

    const quality = staleApprovedChecks.find((entry) => entry.name === "quality");
    for (const racedCheck of [
      {
        ...quality,
        check_suite: { id: 901 },
        completed_at: null,
        conclusion: null,
        started_at: "2026-08-26T10:00:00Z",
        status: "in_progress",
      },
      {
        ...quality,
        check_suite: { id: 902 },
        completed_at: null,
        conclusion: null,
        started_at: "2026-08-26T10:01:00Z",
        status: "queued",
      },
      {
        ...quality,
        check_suite: { id: 903 },
        completed_at: "2026-08-26T10:02:00Z",
        conclusion: "failure",
        started_at: "2026-08-26T10:01:30Z",
        status: "completed",
      },
    ]) {
      expect(() => buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [...staleApprovedChecks, racedCheck],
      })).toThrow(/pending|queued|failed|terminal/iu);
    }
  });

  it("binds subject and predicate to the exact annotated release tag object SHA", () => {
    const artifacts = buildGitHubProductionReleaseAttestationArtifacts({
      checkRuns: createTrustedCheckRuns(),
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.1",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: "b".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
    });

    expect(artifacts.subject.release_tag_object_sha).toBe(RELEASE_TAG_OBJECT_SHA);
    expect(artifacts.predicate.release_tag_object_sha).toBe(RELEASE_TAG_OBJECT_SHA);
    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        checkRuns: createTrustedCheckRuns(),
        releaseSha: "a".repeat(40),
        releaseTag: "prod-20260826.1",
        releaseTagObjectSha: "not-a-tag-object-sha",
        releaseTree: "b".repeat(40),
        repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      }),
    ).toThrow(/tag object|40-character|SHA/iu);
  });

  it("excludes only validated canonical release retry suites and blocks every other bad suite", () => {
    const releaseInput = {
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.1",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: "b".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
    };
    const currentSuiteId = 777;
    const priorCanonicalSuiteId = 776;
    const currentSuitePending = {
      app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
      check_suite: { id: currentSuiteId },
      name: "approve-and-tag",
      status: "in_progress",
      started_at: "2026-08-26T09:02:00Z",
    };
    const priorCanonicalSuiteFailed = {
      app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
      check_suite: { id: priorCanonicalSuiteId },
      completed_at: "2026-08-26T08:55:00Z",
      conclusion: "failure",
      name: "approve-and-tag",
      status: "completed",
    };

    expect(
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [
          ...createTrustedCheckRuns(),
          priorCanonicalSuiteFailed,
          currentSuitePending,
        ],
        excludedCheckSuiteIds: [priorCanonicalSuiteId, currentSuiteId],
      }).subject.required_check_summary,
    ).toMatchObject({ total: EXPECTED_RELEASE_CONTEXTS.length });

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [
          ...createTrustedCheckRuns(),
          priorCanonicalSuiteFailed,
          currentSuitePending,
          {
            id: 7_778,
            app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
            check_suite: { id: 778 },
            name: "other-pending-check",
            status: "in_progress",
            started_at: "2026-08-26T09:03:00Z",
          },
        ],
        excludedCheckSuiteIds: [priorCanonicalSuiteId, currentSuiteId],
      }),
    ).toThrow(/pending|terminal/iu);

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: createTrustedCheckRuns(),
        commitStatuses: [
          { context: "legacy-ci", state: "success", updated_at: "2026-08-26T09:00:00Z" },
          { context: "legacy-ci", state: "error", updated_at: "2026-08-26T09:04:00Z" },
        ],
      }),
    ).toThrow(/status|failed|error|terminal/iu);

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: createTrustedCheckRuns(),
        commitStatuses: [
          { context: "legacy-ci", state: "error", updated_at: "2026-08-26T09:00:00Z" },
          { context: "legacy-ci", state: "success", updated_at: "2026-08-26T09:04:00Z" },
        ],
      }),
    ).not.toThrow();
  });

  it.each([
    { excludedCheckSuiteIds: [777, 777] },
    { excludedCheckSuiteIds: [0] },
    { excludedCheckSuiteIds: [-1] },
    { excludedCheckSuiteIds: ["777"] },
    { excludedCheckSuiteIds: [999] },
  ])("rejects malformed or arbitrary excluded suite IDs: $excludedCheckSuiteIds", ({
    excludedCheckSuiteIds,
  }) => {
    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        checkRuns: createTrustedCheckRuns(),
        excludedCheckSuiteIds: excludedCheckSuiteIds as unknown as number[],
        releaseSha: "a".repeat(40),
        releaseTag: "prod-20260826.1",
        releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
        releaseTree: "b".repeat(40),
        repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      }),
    ).toThrow(/excluded|suite|unique|positive|observed|nonempty/iu);
  });

  it("rejects an older failed check run even when a later rerun succeeds", () => {
    const releaseInput = {
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.1",
      releaseTagObjectSha: RELEASE_TAG_OBJECT_SHA,
      releaseTree: "b".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
    };
    const successfulRuns = createTrustedCheckRuns();
    const qualitySuccess = successfulRuns.find((entry) => entry.name === "quality");

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [
          ...successfulRuns,
          {
            ...qualitySuccess,
            id: 2_004,
            check_suite: { id: 201 },
            completed_at: "2026-08-26T08:00:00Z",
            conclusion: "failure",
          },
        ],
      }),
    ).toThrow(/failed|all started|rerun|quality/iu);
  });

  it("fails closed unless offline bundle, trusted root, and subject manifest are supplied explicitly", () => {
    const manifestPath = "/tmp/release.json";
    const manifest = createLocalMacProductionReleaseManifest(manifestPath);
    const gitEvidence = createLocalMacProductionGitEvidence({
      releaseSha: manifest.release_sha,
      releaseTree: manifest.release_tree,
      overrides: { originMasterSha: "f".repeat(40) },
    });

    expect(() =>
      verifyGitHubProductionReleaseAttestation({
        gitEvidence,
        manifest,
        manifestDigest: "d".repeat(64),
        repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
        rootDir: process.cwd(),
      }),
    ).toThrow(/bundle|trusted root|subject manifest|offline/iu);
  });

  it("binds subject-manifest sha256, repository, signer workflow, tag, sha, tree, and normalized checks", () => {
    const rootDir = createTempDirectory("homecook-gh-attestation-root-");
    const subjectManifestPath = join(rootDir, "production-release-subject.json");
    const bundlePath = join(rootDir, "production-release-attestation.bundle.jsonl");
    const trustedRootPath = join(rootDir, "trusted_root.jsonl");
    const manifestPath = join(rootDir, "release-manifest.json");
    const manifest = createLocalMacProductionReleaseManifest(manifestPath, {
      attestation_digest: "a".repeat(64),
      ...FULL_REHEARSAL_AUTHORITY,
      signer_digest: WORKFLOW_AUTHORITY.workflow_head_sha,
      ...WORKFLOW_AUTHORITY,
      ...APPROVAL_AUTHORITY,
    });
    const gitEvidence = createLocalMacProductionGitEvidence({
      releaseSha: manifest.release_sha,
      releaseTree: manifest.release_tree,
      overrides: {
        originMasterSha: "9".repeat(40),
        workflowHeadTreeSha: WORKFLOW_AUTHORITY.workflow_head_tree,
        masterAtApprovalTreeSha: APPROVAL_AUTHORITY.master_tree_at_approval,
      },
    });

    writeFileSync(subjectManifestPath, JSON.stringify({
      schema: "homecook.github.production-release-manifest.v3",
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      source_ref: CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
      signer_workflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
      signer_digest: manifest.workflow_head_sha,
      expected_release_integration_id: GITHUB_ACTIONS_APP_INTEGRATION_ID,
      release_tag: manifest.release_tag,
      release_tag_object_sha: manifest.release_tag_object_sha,
      release_sha: manifest.release_sha,
      release_tree: manifest.release_tree,
      workflow_head_sha: manifest.workflow_head_sha,
      workflow_head_tree: manifest.workflow_head_tree,
      workflow_run_id: manifest.workflow_run_id,
      workflow_run_attempt: manifest.workflow_run_attempt,
      workflow_check_suite_id: manifest.workflow_check_suite_id,
      master_sha_at_approval: manifest.master_sha_at_approval,
      master_tree_at_approval: manifest.master_tree_at_approval,
      rehearsal_receipt_schema: manifest.rehearsal_receipt_schema,
      selected_sha: manifest.selected_sha,
      selected_tree: manifest.selected_tree,
      observed_master_sha: manifest.observed_master_sha,
      observed_master_tree: manifest.observed_master_tree,
      selected_at: manifest.selected_at,
      expires_at: manifest.expires_at,
      approver_role: manifest.approver_role,
      approver_id: manifest.approver_id,
      approval_digest: manifest.approval_digest,
      selection_digest: manifest.selection_digest,
      build_id: manifest.build_id,
      sealed_bundle_digest: manifest.sealed_bundle_digest,
      repeatability_receipt_digest: manifest.repeatability_receipt_digest,
      rehearsal_receipt_valid_until: manifest.rehearsal_receipt_valid_until,
      expected_release_contexts: EXPECTED_RELEASE_CONTEXTS,
      required_check_summary: manifest.required_check_summary,
      all_check_suite_count: manifest.all_check_suite_count,
      all_check_suite_ids_digest: manifest.all_check_suite_ids_digest,
      all_actions_workflow_run_provenance_digest:
        manifest.all_actions_workflow_run_provenance_digest,
      all_context_check_run_instances_digest: manifest.all_context_check_run_instances_digest,
      all_context_check_suite_ids: manifest.all_context_check_suite_ids,
      all_context_commit_statuses_digest: manifest.all_context_commit_statuses_digest,
    }, null, 2));
    writeFileSync(bundlePath, "{}\n");
    writeFileSync(trustedRootPath, "{}\n");

    const invocations: string[][] = [];
    const invokedCommands: string[] = [];
    let attestedPredicateTagObjectSha = manifest.release_tag_object_sha;
    let attestedPredicateRepeatabilityDigest = manifest.repeatability_receipt_digest;
    const verifier = createGitHubProductionReleaseAttestationVerifier({
      bundlePath,
      ghExecutable: "/opt/homebrew/bin/gh",
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      signerWorkflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
      subjectManifestPath,
      trustedRootPath,
      runGh: ((command: string, args?: readonly string[]) => {
        invokedCommands.push(command);
        invocations.push([...(args ?? [])]);
        return {
          status: 0,
          stdout: JSON.stringify([{
            verificationResult: {
              statement: {
                predicateType:
                  "https://github.com/netsus/homecook/attestations/production-release/v3",
                predicate: {
                  schema: "homecook.github.production-release-predicate.v3",
                  repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
                  source_ref: CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
                  signer_workflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
                  signer_digest: manifest.workflow_head_sha,
                  expected_release_integration_id: GITHUB_ACTIONS_APP_INTEGRATION_ID,
                  release_tag: manifest.release_tag,
                  release_tag_object_sha: attestedPredicateTagObjectSha,
                  release_sha: manifest.release_sha,
                  release_tree: manifest.release_tree,
                  workflow_head_sha: manifest.workflow_head_sha,
                  workflow_head_tree: manifest.workflow_head_tree,
                  workflow_run_id: manifest.workflow_run_id,
                  workflow_run_attempt: manifest.workflow_run_attempt,
                  workflow_check_suite_id: manifest.workflow_check_suite_id,
                  master_sha_at_approval: manifest.master_sha_at_approval,
                  master_tree_at_approval: manifest.master_tree_at_approval,
                  rehearsal_receipt_schema: manifest.rehearsal_receipt_schema,
                  selected_sha: manifest.selected_sha,
                  selected_tree: manifest.selected_tree,
                  observed_master_sha: manifest.observed_master_sha,
                  observed_master_tree: manifest.observed_master_tree,
                  selected_at: manifest.selected_at,
                  expires_at: manifest.expires_at,
                  approver_role: manifest.approver_role,
                  approver_id: manifest.approver_id,
                  approval_digest: manifest.approval_digest,
                  selection_digest: manifest.selection_digest,
                  build_id: manifest.build_id,
                  sealed_bundle_digest: manifest.sealed_bundle_digest,
                  repeatability_receipt_digest: attestedPredicateRepeatabilityDigest,
                  rehearsal_receipt_valid_until: manifest.rehearsal_receipt_valid_until,
                  expected_release_contexts: EXPECTED_RELEASE_CONTEXTS,
                  required_check_summary: manifest.required_check_summary,
                  all_check_suite_count: manifest.all_check_suite_count,
                  all_check_suite_ids_digest: manifest.all_check_suite_ids_digest,
                  all_actions_workflow_run_provenance_digest:
                    manifest.all_actions_workflow_run_provenance_digest,
                  all_context_check_run_instances_digest: manifest.all_context_check_run_instances_digest,
                  all_context_check_suite_ids: manifest.all_context_check_suite_ids,
                  all_context_commit_statuses_digest: manifest.all_context_commit_statuses_digest,
                  subject_manifest_sha256: "a".repeat(64),
                },
                subject: [
                  {
                    digest: {
                      sha256: "a".repeat(64),
                    },
                    name: "production-release-subject.json",
                  },
                ],
              },
            },
          }]),
        };
      }) as typeof import("node:child_process").spawnSync,
      sha256File: (path) => path === trustedRootPath
        ? GITHUB_CLI_TRUSTED_ROOT_SHA256
        : "a".repeat(64),
    });

    expect(
      verifier({
        gitEvidence,
        manifest,
        manifestDigest: "d".repeat(64),
        manifestPath,
        rootDir,
      }),
    ).toMatchObject({
      source: "github-attestation-offline",
      verified: true,
    });
    expect(invokedCommands).toEqual(["/opt/homebrew/bin/gh"]);

    expect(() => verifier({
      gitEvidence,
      manifest: {
        ...manifest,
        master_sha_at_approval: "0".repeat(40),
      },
      manifestDigest: "d".repeat(64),
      manifestPath,
      rootDir,
    })).toThrow(/approval|master_sha_at_approval|authority|manifest/iu);
    invocations.pop();
    invokedCommands.pop();

    expect(invocations).toEqual([
      [
        "attestation",
        "verify",
        subjectManifestPath,
        "--repo",
        CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
        "--bundle",
        bundlePath,
        "--custom-trusted-root",
        trustedRootPath,
        "--signer-workflow",
        CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
        "--source-ref",
        CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
        "--signer-digest",
        manifest.workflow_head_sha,
        "--predicate-type",
        "https://github.com/netsus/homecook/attestations/production-release/v3",
        "--format",
        "json",
      ],
    ]);

    const originalSubject = JSON.parse(readFileSync(subjectManifestPath, "utf8"));
    writeFileSync(subjectManifestPath, JSON.stringify({
      ...originalSubject,
      release_tag_object_sha: "f".repeat(40),
    }, null, 2));
    expect(() =>
      verifier({
        gitEvidence,
        manifest,
        manifestDigest: "d".repeat(64),
        manifestPath,
        rootDir,
      }),
    ).toThrow(/tag object|release_tag_object_sha/iu);
    writeFileSync(subjectManifestPath, JSON.stringify(originalSubject, null, 2));

    writeFileSync(subjectManifestPath, JSON.stringify({
      ...originalSubject,
      unexpected_authority: "must-not-pass",
    }, null, 2));
    expect(() => verifier({
      gitEvidence,
      manifest,
      manifestDigest: "d".repeat(64),
      manifestPath,
      rootDir,
    })).toThrow(/unknown|closed|unexpected|field/iu);
    writeFileSync(subjectManifestPath, JSON.stringify(originalSubject, null, 2));

    writeFileSync(subjectManifestPath, JSON.stringify({
      ...originalSubject,
      sealed_bundle_digest: "0".repeat(64),
    }, null, 2));
    expect(() => verifier({
      gitEvidence,
      manifest,
      manifestDigest: "d".repeat(64),
      manifestPath,
      rootDir,
    })).toThrow(/rehearsal|bundle|authority|manifest/iu);
    writeFileSync(subjectManifestPath, JSON.stringify(originalSubject, null, 2));

    attestedPredicateTagObjectSha = "f".repeat(40);
    expect(() =>
      verifier({
        gitEvidence,
        manifest,
        manifestDigest: "d".repeat(64),
        manifestPath,
        rootDir,
      }),
    ).toThrow(/tag object|release_tag_object_sha/iu);
    attestedPredicateTagObjectSha = manifest.release_tag_object_sha;

    attestedPredicateRepeatabilityDigest = "0".repeat(64);
    expect(() => verifier({
      gitEvidence,
      manifest,
      manifestDigest: "d".repeat(64),
      manifestPath,
      rootDir,
    })).toThrow(/rehearsal|repeatability|authority|manifest/iu);
    attestedPredicateRepeatabilityDigest = manifest.repeatability_receipt_digest;

    for (const identityOverride of [
      { repository: "attacker/fork" },
      { signerWorkflow: "attacker/fork/.github/workflows/release.yml" },
      { sourceRef: "refs/heads/feature/evil" },
      { signerDigest: "f".repeat(40) },
    ]) {
      expect(() =>
        verifyGitHubProductionReleaseAttestation({
          bundlePath,
          gitEvidence,
          manifest,
          repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
          rootDir,
          signerWorkflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
          subjectManifestPath,
          trustedRootPath,
          runGh: (() => {
            throw new Error("gh must not run for relaxed identity");
          }) as typeof import("node:child_process").spawnSync,
          sha256File: (path) => path === trustedRootPath
            ? GITHUB_CLI_TRUSTED_ROOT_SHA256
            : "a".repeat(64),
          ...identityOverride,
        }),
      ).toThrow(/canonical|release SHA|signerDigest/iu);
    }

    writeFileSync(subjectManifestPath, JSON.stringify({
      ...JSON.parse(readFileSync(subjectManifestPath, "utf8")),
      repository: "attacker/fork",
    }, null, 2));
    expect(() =>
      verifier({
        gitEvidence,
        manifest,
        manifestDigest: "d".repeat(64),
        manifestPath,
        rootDir,
      }),
    ).toThrow(/repository/iu);

    let ghCalls = 0;
    expect(() =>
      verifyGitHubProductionReleaseAttestation({
        bundlePath,
        gitEvidence,
        manifest,
        repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
        rootDir,
        signerWorkflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
        subjectManifestPath,
        trustedRootPath,
        runGh: (() => {
          ghCalls += 1;
          throw new Error("gh must not run");
        }) as typeof import("node:child_process").spawnSync,
        sha256File: () => "0".repeat(64),
      }),
    ).toThrow(/trusted root|digest|sha256/iu);
    expect(ghCalls).toBe(0);
  });
});
