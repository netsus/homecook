import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireLocalMacProductionPromotionLock,
  getLocalMacProductionReleasePaths,
  getLocalMacProductionReleaseStatus,
  isLocalMacProductionMutationCommand,
  prepareLocalMacProductionRelease,
  readLocalMacProductionGitReleaseEvidence,
  readLocalMacProductionRepoHeadSha,
  validateLocalMacProductionMutationAuthority,
  validateLocalMacProductionReleaseManifest,
} from "../scripts/lib/local-mac-production-release.mjs";
import { validateProductionReleaseTag } from "../scripts/lib/production-release-approval-policy.mjs";
import { buildRehearsalSelection } from "../scripts/lib/local-mac-production-rehearsal-selection.mjs";
import { canonicalizeJcs } from "../scripts/lib/rfc8785-jcs.mjs";
import { validateLocalMacProductionReleaseEvidence } from "../scripts/lib/local-mac-production-release-evidence.mjs";
import * as releaseEvidenceModule from "../scripts/lib/local-mac-production-release-evidence.mjs";
import * as releaseInventoryModule from "../scripts/lib/local-mac-production-release-test-inventory.mjs";

const temporaryDirectories: string[] = [];
const VERIFIED_ATTESTATION = () => ({ source: "test-attestation", verified: true });

function createTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createManifest(overrides: Record<string, unknown> = {}) {
  return {
    schema: "homecook.local-mac-production-release.v3",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    signer_workflow: "netsus/homecook/.github/workflows/production-release-attestation.yml",
    signer_digest: "a".repeat(40),
    expected_release_integration_id: 15368,
    promotion_id: "promo-20260825-01",
    release_tag: "prod-20260825.1",
    release_tag_object_sha: "e".repeat(40),
    release_manifest_path: "/Users/tester/.homecook/releases/manifests/prod-20260825.1.json",
    release_sha: "a".repeat(40),
    release_tree: "b".repeat(40),
    workflow_head_sha: "a".repeat(40),
    workflow_head_tree: "b".repeat(40),
    workflow_run_id: 9_001,
    workflow_run_attempt: 1,
    workflow_check_suite_id: 9_002,
    master_sha_at_approval: "a".repeat(40),
    master_tree_at_approval: "b".repeat(40),
    approved_at: "2026-08-25T09:00:00.000Z",
    approved_by_task_id: "task-019-release",
    migration_head: "20260825090000_release_gate",
    build_id: "build-20260825-01",
    rehearsal_receipt_schema: "homecook.local-mac-production-rehearsal-repeatability-receipt.v1",
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
    sealed_bundle_digest: "f".repeat(64),
    repeatability_receipt_digest: "1".repeat(64),
    rehearsal_receipt_valid_until: "2026-08-30T09:00:00.000Z",
    backup_readiness_evidence: "backup-20260825-01",
    previous_release_sha: "c".repeat(40),
    required_check_summary: {
      total: 12,
      success: 10,
      intended_skip: 2,
    },
    all_check_suite_count: 2,
    all_check_suite_ids_digest: "4".repeat(64),
    all_actions_workflow_run_provenance_digest: "5".repeat(64),
    all_context_check_run_instances_digest: "2".repeat(64),
    all_context_check_suite_ids: [200, 201],
    all_context_commit_statuses_digest: "3".repeat(64),
    expected_release_contexts: [
      "build",
      "changes",
      "dependency-audit",
      "policy",
      "quality",
      "security-function-authorization",
      "security-smoke",
    ],
    attestation_digest: "d".repeat(64),
    app_launch_agent_enabled: true,
    full_local_launch_agent_enabled: true,
    youtube_worker_launch_agent_enabled: true,
    ...overrides,
  };
}

function createGitEvidence(overrides: Record<string, unknown> = {}) {
  return {
    originMasterSha: "a".repeat(40),
    workflowHeadTreeSha: "b".repeat(40),
    masterAtApprovalTreeSha: "b".repeat(40),
    releaseIsAncestorOfWorkflowHead: true,
    workflowHeadIsAncestorOfMasterAtApproval: true,
    masterAtApprovalIsAncestorOfOriginMaster: true,
    releaseTagObjectSha: "e".repeat(40),
    releaseTagCommitSha: "a".repeat(40),
    releaseTreeSha: "b".repeat(40),
    releaseTagMessage: [
      "Approved production release prod-20260825.1",
      "build_id build-20260825-01",
      "rehearsal_receipt_schema homecook.local-mac-production-rehearsal-repeatability-receipt.v1",
      `workflow_head_sha ${"a".repeat(40)}`,
      `workflow_head_tree ${"b".repeat(40)}`,
      `master_sha_at_approval ${"a".repeat(40)}`,
      `master_tree_at_approval ${"b".repeat(40)}`,
      "selection_digest none",
      `sealed_bundle_digest ${"f".repeat(64)}`,
      `repeatability_receipt_digest ${"1".repeat(64)}`,
      "rehearsal_receipt_valid_until 2026-08-30T09:00:00.000Z",
    ].join("\n"),
    ...overrides,
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("local Mac production release manifest", () => {
  it("uses one strict shared prod tag validator and validates the closed release schema", () => {
    expect(validateProductionReleaseTag("prod-20260826.1")).toBe("prod-20260826.1");
    for (const invalidTag of [
      "xprod-20260826.1",
      "prod-20260826.1-extra",
      "prod-20260826x1",
      "prod-20260826.",
      "prod-20260826.01/evil",
    ]) {
      expect(() => validateProductionReleaseTag(invalidTag)).toThrow(/prod-|release tag|format/iu);
    }

    const schema = JSON.parse(readFileSync(
      new URL("../scripts/schemas/local-mac-production-release.schema.json", import.meta.url),
      "utf8",
    ));
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain("expected_release_contexts");
    expect(schema.required).toContain("release_tag_object_sha");
    expect(schema.required).toEqual(expect.arrayContaining([
      "workflow_head_sha",
      "workflow_head_tree",
      "workflow_run_id",
      "workflow_run_attempt",
      "workflow_check_suite_id",
      "master_tree_at_approval",
      "all_check_suite_count",
      "all_check_suite_ids_digest",
      "all_context_check_run_instances_digest",
      "all_context_check_suite_ids",
      "all_context_commit_statuses_digest",
      "rehearsal_receipt_schema",
      "selection_digest",
      "selected_sha",
      "selected_tree",
      "observed_master_sha",
      "observed_master_tree",
      "selected_at",
      "expires_at",
      "approver_role",
      "approver_id",
      "approval_digest",
      "sealed_bundle_digest",
      "repeatability_receipt_digest",
      "rehearsal_receipt_valid_until",
    ]));
    expect(schema.properties.schema).toEqual({ const: "homecook.local-mac-production-release.v3" });
    expect(schema.properties.release_tag_object_sha).toEqual({
      type: "string",
      pattern: "^[0-9a-f]{40}$",
    });
    expect(schema.properties.expected_release_contexts).toMatchObject({
      type: "array",
      minItems: 7,
      maxItems: 7,
      uniqueItems: true,
    });
    expect(schema.properties.repository).toEqual({ const: "netsus/homecook" });
    expect(schema.properties.source_ref).toEqual({ const: "refs/heads/master" });
    expect(schema.properties.signer_workflow).toEqual({
      const: "netsus/homecook/.github/workflows/production-release-attestation.yml",
    });
    expect(schema.properties.expected_release_integration_id).toEqual({ const: 15368 });
    for (const [file, required] of [
      ["github-production-release-workflow-authority.schema.json", ["workflow_head_sha", "workflow_run_id", "workflow_check_suite_id"]],
      ["github-production-release-approval-authority.schema.json", ["master_sha_at_approval", "master_tree_at_approval"]],
      ["github-production-release-external-check-evidence.schema.json", ["all_check_suite_count", "all_check_suite_ids_digest", "all_actions_workflow_run_provenance_digest", "all_context_check_run_instances_digest", "all_context_check_suite_ids", "all_context_commit_statuses_digest"]],
    ] as const) {
      const authoritySchema = JSON.parse(readFileSync(
        new URL(`../scripts/schemas/${file}`, import.meta.url),
        "utf8",
      ));
      expect(authoritySchema.additionalProperties).toBe(false);
      expect(authoritySchema.required).toEqual(expect.arrayContaining([...required]));
    }
    const externalCheckSchema = JSON.parse(readFileSync(
      new URL(
        "../scripts/schemas/github-production-release-external-check-evidence.schema.json",
        import.meta.url,
      ),
      "utf8",
    ));
    expect(externalCheckSchema.properties.required_check_summary.properties).toMatchObject({
      total: { type: "integer", minimum: 7 },
      success: { type: "integer", minimum: 7 },
      intended_skip: { type: "integer", minimum: 0 },
    });

    const require = createRequire(import.meta.url);
    const eslintPackage = require.resolve("@eslint/eslintrc/package.json");
    const Ajv = require(require.resolve("ajv", { paths: [eslintPackage] }));
    const validateSummary = new Ajv({ allErrors: true }).compile(
      schema.properties.required_check_summary,
    );
    expect(validateSummary({
      total: 9,
      success: 7,
      intended_skip: 2,
      bad: 0,
      cancelled: 0,
      failed: 0,
      pending: 0,
      queued: 0,
      rerun: 0,
    })).toBe(true);
    for (const invalidSummary of [
      { total: -1, success: 0, intended_skip: 0 },
      { total: 7, success: 6, intended_skip: 1 },
      { total: 7, success: 7, intended_skip: 0, failed: 1 },
      { total: 7, success: 7, intended_skip: 0, unexpected: 0 },
    ]) {
      expect(validateSummary(invalidSummary), JSON.stringify(validateSummary.errors)).toBe(false);
    }
  });

  it("validates an explicit selected-ancestor digest without treating normal master advancement as substitution", () => {
    const selection = buildRehearsalSelection({
      schema: "homecook.local-mac-production-rehearsal-selection.v1",
      canonicalization: "RFC8785-JCS+SHA256",
      repository: "netsus/homecook",
      source_ref: "refs/heads/master",
      selected_sha: "a".repeat(40),
      selected_tree: "b".repeat(40),
      observed_master_sha: "c".repeat(40),
      observed_master_tree: "d".repeat(40),
      selected_at: "2026-08-25T08:00:00.000Z",
      expires_at: "2026-08-26T08:00:00.000Z",
      approver_role: "human-release-approver",
      approver_id: "release-approver-1",
      approval_digest: "2".repeat(64),
    }, { now: new Date("2026-08-25T08:00:00.000Z") });
    const manifest = createManifest({
      release_manifest_path: "/tmp/release.json",
      signer_digest: "c".repeat(40),
      workflow_head_sha: "c".repeat(40),
      workflow_head_tree: "d".repeat(40),
      master_sha_at_approval: "e".repeat(40),
      master_tree_at_approval: "f".repeat(40),
      selected_sha: selection.selected_sha,
      selected_tree: selection.selected_tree,
      observed_master_sha: selection.observed_master_sha,
      observed_master_tree: selection.observed_master_tree,
      selected_at: selection.selected_at,
      expires_at: selection.expires_at,
      approver_role: selection.approver_role,
      approver_id: selection.approver_id,
      approval_digest: selection.approval_digest,
      selection_digest: selection.selection_digest,
    });
    const evidence = createGitEvidence({
      originMasterSha: "f".repeat(40),
      workflowHeadTreeSha: "d".repeat(40),
      masterAtApprovalTreeSha: "f".repeat(40),
      releaseTagMessage: [
        "Approved production release prod-20260825.1",
        "build_id build-20260825-01",
        "rehearsal_receipt_schema homecook.local-mac-production-rehearsal-repeatability-receipt.v1",
        `workflow_head_sha ${"c".repeat(40)}`,
        `workflow_head_tree ${"d".repeat(40)}`,
        `master_sha_at_approval ${"e".repeat(40)}`,
        `master_tree_at_approval ${"f".repeat(40)}`,
        `selection_digest ${selection.selection_digest}`,
        `sealed_bundle_digest ${"f".repeat(64)}`,
        `repeatability_receipt_digest ${"1".repeat(64)}`,
        "rehearsal_receipt_valid_until 2026-08-30T09:00:00.000Z",
      ].join("\n"),
    });

    expect(validateLocalMacProductionReleaseManifest({
      manifest,
      manifestPath: "/tmp/release.json",
      readGitEvidence: () => evidence,
      requireAttestation: false,
    })).toMatchObject({
      selection_digest: selection.selection_digest,
      selected_sha: selection.selected_sha,
      observed_master_sha: selection.observed_master_sha,
      approver_id: selection.approver_id,
      workflow_head_sha: "c".repeat(40),
      master_sha_at_approval: "e".repeat(40),
    });

    for (const brokenLineage of [
      { releaseIsAncestorOfWorkflowHead: false },
      { workflowHeadIsAncestorOfMasterAtApproval: false },
      { masterAtApprovalIsAncestorOfOriginMaster: false },
      { workflowHeadTreeSha: "0".repeat(40) },
      { masterAtApprovalTreeSha: "0".repeat(40) },
    ]) {
      expect(() => validateLocalMacProductionReleaseManifest({
        manifest,
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => ({ ...evidence, ...brokenLineage }),
        requireAttestation: false,
      })).toThrow(/lineage|ancestor|workflow|approval|tree|origin\/master/iu);
    }
  });

  it("resolves the approved release SHA from origin/master instead of the local checkout head", () => {
    const invocations: string[][] = [];
    const releaseSha = "a".repeat(40);
    const runCommand = ((_: string, args?: readonly string[]) => {
      invocations.push([...(args ?? [])]);
      return {
        status: 0,
        stdout: `${releaseSha}\n`,
      };
    }) as typeof import("node:child_process").spawnSync;

    expect(
      readLocalMacProductionRepoHeadSha({
        rootDir: "/repo",
        runCommand,
      }),
    ).toBe(releaseSha);

    expect(invocations).toEqual([["rev-parse", "origin/master"]]);
  });

  it("rejects a manifest when the release tag or approved SHA does not match the exact approved master head", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({ release_tag: "release-20260825.1" }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/prod-/iu);

    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({ master_sha_at_approval: "e".repeat(40) }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/origin\/master|approved master|exact/iu);

    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest(),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence({ originMasterSha: "f".repeat(40) }),
      }),
    ).toThrow(/origin\/master|approved master|exact/iu);
  });

  it("reads annotated tag, tag commit, tree, and origin/master evidence from git instead of trusting manifest self-claims", () => {
    const invocations: string[][] = [];
    const runCommand = ((_: string, args?: readonly string[]) => {
      const joined = (args ?? []).join(" ");
      invocations.push([...(args ?? [])]);
      if (joined === "rev-parse refs/remotes/origin/master^{commit}") {
        return { status: 0, stdout: `${"a".repeat(40)}\n` };
      }
      if (joined === "rev-parse refs/tags/prod-20260825.1^{tag}") {
        return { status: 0, stdout: `${"e".repeat(40)}\n` };
      }
      if (joined === "rev-parse refs/tags/prod-20260825.1^{commit}") {
        return { status: 0, stdout: `${"a".repeat(40)}\n` };
      }
      if (joined === `rev-parse ${"a".repeat(40)}^{tree}`) {
        return { status: 0, stdout: `${"b".repeat(40)}\n` };
      }
      if (joined === "cat-file tag refs/tags/prod-20260825.1") {
        return {
          status: 0,
          stdout: `object ${"a".repeat(40)}\ntype commit\ntag prod-20260825.1\ntagger test <test@example.com> 0 +0000\n\n${createGitEvidence().releaseTagMessage}\n`,
        };
      }
      if (joined.startsWith("merge-base --is-ancestor ")) {
        return { status: 0, stdout: "" };
      }
      throw new Error(`Unexpected git command: ${joined}`);
    }) as typeof import("node:child_process").spawnSync;

    expect(
      readLocalMacProductionGitReleaseEvidence({
        masterShaAtApproval: "a".repeat(40),
        releaseSha: "a".repeat(40),
        releaseTag: "prod-20260825.1",
        rootDir: "/repo",
        runCommand,
        workflowHeadSha: "a".repeat(40),
      }),
    ).toEqual(createGitEvidence());

    expect(invocations).toEqual([
      ["rev-parse", "refs/remotes/origin/master^{commit}"],
      ["rev-parse", `${"a".repeat(40)}^{tree}`],
      ["rev-parse", `${"a".repeat(40)}^{tree}`],
      ["rev-parse", "refs/tags/prod-20260825.1^{tag}"],
      ["rev-parse", "refs/tags/prod-20260825.1^{commit}"],
      ["rev-parse", `${"a".repeat(40)}^{tree}`],
      ["cat-file", "tag", "refs/tags/prod-20260825.1"],
      ["merge-base", "--is-ancestor", "a".repeat(40), "a".repeat(40)],
      ["merge-base", "--is-ancestor", "a".repeat(40), "a".repeat(40)],
      ["merge-base", "--is-ancestor", "a".repeat(40), "a".repeat(40)],
    ]);
  });

  it("rejects forged tag commit, tree drift, and nonzero bad/pending/rerun checks", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({ release_manifest_path: "/tmp/release.json" }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence({ releaseTagCommitSha: "f".repeat(40) }),
      }),
    ).toThrow(/tag|commit|release_sha/iu);

    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({ release_manifest_path: "/tmp/release.json" }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence({ releaseTreeSha: "f".repeat(40) }),
      }),
    ).toThrow(/tree/iu);

    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          release_manifest_path: "/tmp/release.json",
          required_check_summary: {
            total: 12,
            success: 10,
            intended_skip: 1,
            pending: 1,
          },
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/pending|bad|rerun|check summary/iu);
  });

  it("binds the manifest to the exact annotated release tag object", () => {
    expect(
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          release_manifest_path: "/tmp/release.json",
          release_tag_object_sha: "e".repeat(40),
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }).release_tag_object_sha,
    ).toBe("e".repeat(40));

    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          release_manifest_path: "/tmp/release.json",
          release_tag_object_sha: "e".repeat(40),
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence({ releaseTagObjectSha: "f".repeat(40) }),
      }),
    ).toThrow(/tag object|release_tag_object_sha/iu);
  });

  it("requires a nonempty expected release context set in the manifest", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          expected_release_contexts: [],
          release_manifest_path: "/tmp/release.json",
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/expected release context|context set|non-empty/iu);
  });

  it("rejects missing launch-agent enablement fields instead of silently defaulting them", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          app_launch_agent_enabled: undefined,
          release_manifest_path: "/tmp/release.json",
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/app_launch_agent_enabled/iu);
  });

  it("rejects unknown top-level manifest fields before they can carry credentials", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          credentials: { token: "must-not-be-accepted" },
          release_manifest_path: "/tmp/release.json",
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/unknown|allowed|unexpected|credentials/iu);
  });

  it("rejects unknown required-check summary fields", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          release_manifest_path: "/tmp/release.json",
          required_check_summary: {
            total: 12,
            success: 10,
            intended_skip: 2,
            secret: "must-not-be-accepted",
          },
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/unknown|allowed|unexpected|secret/iu);
  });

  it("still accepts an approved tagged release after origin/master advances later", () => {
    expect(
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({ release_manifest_path: "/tmp/release.json" }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence({ originMasterSha: "f".repeat(40) }),
      }).release_sha,
    ).toBe("a".repeat(40));
  });
});

describe("local Mac production release evidence validation", () => {
  it("normalizes collected release test identities into deterministic canonical order", () => {
    const normalizeReleaseTestInventory = (
      releaseInventoryModule as Record<string, unknown>
    ).normalizeReleaseTestInventory;
    expect(typeof normalizeReleaseTestInventory).toBe("function");
    if (typeof normalizeReleaseTestInventory !== "function") return;
    const left = [
      { file: "tests/b.test.ts", name: "beta", occurrence: 0 },
      { file: "tests/a.test.ts", name: "alpha", occurrence: 1 },
      { file: "tests/a.test.ts", name: "alpha", occurrence: 0 },
    ];
    const right = [...left].reverse();

    expect(normalizeReleaseTestInventory(left)).toEqual(normalizeReleaseTestInventory(right));
    expect(normalizeReleaseTestInventory(left)).toEqual([
      { file: "tests/a.test.ts", name: "alpha", occurrence: 0 },
      { file: "tests/a.test.ts", name: "alpha", occurrence: 1 },
      { file: "tests/b.test.ts", name: "beta", occurrence: 0 },
    ]);
  });
  type TestReleaseCommand = {
    [key: string]: unknown;
    stdout_projection: Record<string, unknown>;
    stderr_projection: Record<string, unknown>;
    stdout_sha256: string;
    stderr_sha256: string;
  };
  type TestReleaseEvidence = {
    [key: string]: unknown;
    head_sha: string;
    tree_sha: string;
    commands: TestReleaseCommand[];
    release_suite: {
      file_count: number;
      test_count: number;
      passed: number;
      skipped: number;
      failed: number;
      inventory_sha256: string;
    };
    evidence_digest: string;
  };
  const inventory = {
    expectedFileSkipCount: 1,
    expectedTestSkipCount: 2,
    fileCount: 28,
    testCount: 787,
    inventorySha256: "d".repeat(64),
    tests: [
      {
        file: "tests/local-mac-production-rehearsal-candidate.test.ts",
        name: "runs offline pnpm install and a real Next production build inside the exact macOS build-work sandbox",
        occurrence: 0,
      },
      {
        file: "tests/local-mac-production-rehearsal-candidate.test.ts",
        name: "another non-selected candidate test",
        occurrence: 0,
      },
    ],
  };
  const projectionDigest = (value: unknown) => createHash("sha256")
    .update(canonicalizeJcs(value))
    .digest("hex");
  const stageCapabilityPolicy = () => {
    const policy = {
      schema: "homecook.sandbox-stage-capability-policy-text.v1",
      stages: [
        {
          stage: "offline-install",
          allowed_mach_lookup_global_names: ["com.apple.SystemConfiguration.DNSConfiguration"],
        },
        { stage: "next-build", allowed_mach_lookup_global_names: [] },
      ],
      network_policy: "deny-all",
      no_log_denials: ["com.apple.diagnosticd"],
    };
    const policyText = canonicalizeJcs(policy);
    return {
      schema: "homecook.sandbox-stage-capability-policy.v1",
      policy_text: policyText,
      policy_digest: createHash("sha256").update(policyText).digest("hex"),
      install: {
        stage: "offline-install",
        allowed_mach_lookup_global_names: ["com.apple.SystemConfiguration.DNSConfiguration"],
        allow_count: 1,
      },
      build: {
        stage: "next-build",
        allowed_mach_lookup_global_names: [],
        allow_count: 0,
      },
      observed: {
        install_audit_digest: "a".repeat(64),
        install_denial_count: 0,
        install_process_attempt_count: 0,
        build_audit_digest: "b".repeat(64),
        build_denial_count: 0,
        build_process_attempt_count: 0,
      },
    };
  };
  const egressProbe = () => {
    const unsigned = {
      schema: "homecook.sandbox-egress-probe.v1",
      dns_lookup_success_count: 0,
      net_connect_success_count: 0,
      tls_connect_success_count: 0,
      public_ip_connect_success_count: 0,
      http_success_count: 0,
    };
    return { ...unsigned, probe_digest: projectionDigest(unsigned) };
  };
  type CapabilityProjectionFixture = {
    stage_capability_policy: ReturnType<typeof stageCapabilityPolicy>;
    egress_probe: ReturnType<typeof egressProbe>;
  };
  const resignEvidence = (evidence: TestReleaseEvidence | Record<string, unknown>) => {
    const unsigned = { ...evidence };
    delete unsigned.evidence_digest;
    return { ...unsigned, evidence_digest: projectionDigest(unsigned) } as TestReleaseEvidence;
  };

  function createReleaseEvidence(overrides: Record<string, unknown> = {}) {
    const command = (
      id: "release-suite" | "actual-build",
      argv: string[],
      stdoutProjection: Record<string, unknown>,
    ) => {
      const stderrProjection = {
        schema: "homecook.local-mac-production-release-stderr-projection.v1",
        kind: id,
        empty: true,
      };
      return {
        id,
        argv,
        cwd: "<repository>",
        status: 0,
        signal: null,
        duration_ms: 1,
        stdout_projection: stdoutProjection,
        stderr_projection: stderrProjection,
        stdout_sha256: projectionDigest(stdoutProjection),
        stderr_sha256: projectionDigest(stderrProjection),
      };
    };
    const releaseSuiteProjection = {
      schema: "homecook.local-mac-production-release-stdout-projection.v1",
      kind: "release-suite",
      release_test_files: inventory.fileCount,
      release_test_cases: inventory.testCount,
      release_test_inventory_sha256: inventory.inventorySha256,
      vitest_test_files: 28,
      vitest_test_files_passed: 27,
      vitest_test_files_skipped: 1,
      vitest_test_files_failed: 0,
      vitest_tests: 787,
      vitest_passed: 785,
      vitest_skipped: 2,
      vitest_failed: 0,
    };
    const actualBuildProjection = {
      schema: "homecook.local-mac-production-release-stdout-projection.v1",
      kind: "actual-build",
      selected_test_file: "tests/local-mac-production-rehearsal-candidate.test.ts",
      selected_test_name: "runs offline pnpm install and a real Next production build inside the exact macOS build-work sandbox",
      vitest_test_files: 1,
      vitest_test_files_passed: 1,
      vitest_test_files_skipped: 0,
      vitest_test_files_failed: 0,
      vitest_tests: 2,
      vitest_passed: 1,
      vitest_skipped: 1,
      vitest_failed: 0,
      stage_capability_policy: stageCapabilityPolicy(),
      egress_probe: egressProbe(),
    };
    const unsigned = {
      schema: "homecook.local-mac-production-release-evidence.v2",
      repository: "netsus/homecook",
      head_sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      tree_sha: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim(),
      platform: "darwin-arm64",
      commands: [
        command(
          "release-suite",
          ["pnpm", "test:local-mac-production-release"],
          releaseSuiteProjection,
        ),
        command("actual-build", [
          "env", "HOMECOOK_RUN_ACTUAL_RELEASE_BUILD=1", "pnpm", "exec", "vitest", "run",
          "tests/local-mac-production-rehearsal-candidate.test.ts", "-t",
          "runs offline pnpm install and a real Next production build inside the exact macOS build-work sandbox",
        ], actualBuildProjection),
      ],
      release_suite: {
        file_count: inventory.fileCount,
        test_count: inventory.testCount,
        passed: 785,
        skipped: 2,
        failed: 0,
        inventory_sha256: inventory.inventorySha256,
      },
      residue: {
        suite_roots: 0,
        homecook_system_temp: 0,
        hcv_run_roots: 0,
        actual_root_exists: false,
      },
      secrets_redacted: true,
      ...overrides,
    };
    return resignEvidence(unsigned as unknown as TestReleaseEvidence);
  }

  it("rejects an alternate well-formed inventory digest", () => {
    const evidence = createReleaseEvidence();
    const alternate = "c".repeat(64);
    evidence.release_suite.inventory_sha256 = alternate;
    evidence.commands[0].stdout_projection.release_test_inventory_sha256 = alternate;
    evidence.commands[0].stdout_sha256 = projectionDigest(evidence.commands[0].stdout_projection);
    const resigned = resignEvidence(evidence);

    expect(() => validateLocalMacProductionReleaseEvidence(resigned, {
      expectedHeadSha: resigned.head_sha,
      expectedTreeSha: resigned.tree_sha,
      inventory,
    })).toThrow(/inventory/iu);
  });

  it("accepts a valid secret-free canonical note payload", () => {
    const evidence = createReleaseEvidence();

    expect(validateLocalMacProductionReleaseEvidence(evidence, {
      expectedHeadSha: evidence.head_sha,
      expectedTreeSha: evidence.tree_sha,
      inventory,
    })).toBe(evidence);
  });

  it.each(["stdout", "stderr"])("rejects a stale %s projection digest", (stream) => {
    const evidence = createReleaseEvidence();
    const command = evidence.commands[0];
    const projectionKey = `${stream}_projection` as "stdout_projection" | "stderr_projection";
    command[projectionKey] = { ...command[projectionKey], empty: false };
    const resigned = resignEvidence(evidence);

    expect(() => validateLocalMacProductionReleaseEvidence(resigned, {
      expectedHeadSha: resigned.head_sha,
      expectedTreeSha: resigned.tree_sha,
      inventory,
    })).toThrow(new RegExp(`${stream}.*digest|digest.*${stream}`, "iu"));
  });

  it("rejects a changed output projection even when all enclosing digests are resigned", () => {
    const evidence = createReleaseEvidence();
    evidence.commands[0].stdout_projection.vitest_passed = 784;
    evidence.commands[0].stdout_sha256 = projectionDigest(evidence.commands[0].stdout_projection);
    const resigned = resignEvidence(evidence);

    expect(() => validateLocalMacProductionReleaseEvidence(resigned, {
      expectedHeadSha: resigned.head_sha,
      expectedTreeSha: resigned.tree_sha,
      inventory,
    })).toThrow(/release.*projection|projection.*release/iu);
    for (const [filePassed, fileSkipped, testPassed, testSkipped] of [
      [26, 2, 785, 2],
      [27, 1, 784, 3],
    ]) {
      const alternate = createReleaseEvidence();
      Object.assign(alternate.commands[0].stdout_projection, {
        vitest_test_files_passed: filePassed,
        vitest_test_files_skipped: fileSkipped,
        vitest_passed: testPassed,
        vitest_skipped: testSkipped,
      });
      Object.assign(alternate.release_suite, {
        passed: testPassed,
        skipped: testSkipped,
      });
      alternate.commands[0].stdout_sha256 = projectionDigest(alternate.commands[0].stdout_projection);
      const resignedAlternate = resignEvidence(alternate);
      expect(() => validateLocalMacProductionReleaseEvidence(resignedAlternate, {
        expectedHeadSha: resignedAlternate.head_sha,
        expectedTreeSha: resignedAlternate.tree_sha,
        inventory,
      })).toThrow(/skip|split|projection|suite/iu);
    }
  });

  it("rejects evidence captured before the current scope inventory changed", () => {
    const evidence = createReleaseEvidence();

    expect(() => validateLocalMacProductionReleaseEvidence(evidence, {
      expectedHeadSha: evidence.head_sha,
      expectedTreeSha: evidence.tree_sha,
      inventory: { ...inventory, testCount: inventory.testCount + 1 },
    })).toThrow(/inventory|total/iu);
  });

  it.each(["unknown", "missing"])("rejects %s fields in the closed note shape", (variant) => {
    const evidence = createReleaseEvidence();
    if (variant === "unknown") evidence.commands[0].raw_stdout = "not retained";
    else Reflect.deleteProperty(evidence.commands[0], "stderr_projection");
    const resigned = resignEvidence(evidence);

    expect(() => validateLocalMacProductionReleaseEvidence(resigned, {
      expectedHeadSha: resigned.head_sha,
      expectedTreeSha: resigned.tree_sha,
      inventory,
    })).toThrow(/shape/iu);
  });

  it("rejects secret-shaped strings inside a retained projection", () => {
    const evidence = createReleaseEvidence();
    evidence.commands[1].stdout_projection.selected_test_name = "token=not-allowed";
    evidence.commands[1].stdout_sha256 = projectionDigest(evidence.commands[1].stdout_projection);
    const resigned = resignEvidence(evidence);

    expect(() => validateLocalMacProductionReleaseEvidence(resigned, {
      expectedHeadSha: resigned.head_sha,
      expectedTreeSha: resigned.tree_sha,
      inventory,
    })).toThrow(/secret/iu);
  });

  it("parses the exact release runner header and Vitest totals into a closed projection", () => {
    const parseReleaseSuiteOutput = (
      releaseEvidenceModule as Record<string, unknown>
    ).parseReleaseSuiteOutput;
    expect(typeof parseReleaseSuiteOutput).toBe("function");
    if (typeof parseReleaseSuiteOutput !== "function") return;
    const projection = parseReleaseSuiteOutput([
      "RELEASE_TEST_FILES=28",
      "RELEASE_TEST_CASES=787",
      `RELEASE_TEST_INVENTORY_SHA256=${inventory.inventorySha256}`,
      " Test Files  27 passed | 1 skipped (28)",
      "      Tests  785 passed | 2 skipped (787)",
    ].join("\n"));

    expect(projection).toEqual({
      schema: "homecook.local-mac-production-release-stdout-projection.v1",
      kind: "release-suite",
      release_test_files: 28,
      release_test_cases: 787,
      release_test_inventory_sha256: inventory.inventorySha256,
      vitest_test_files: 28,
      vitest_test_files_passed: 27,
      vitest_test_files_skipped: 1,
      vitest_test_files_failed: 0,
      vitest_tests: 787,
      vitest_passed: 785,
      vitest_skipped: 2,
      vitest_failed: 0,
    });
    const buildReleaseEvidenceCommandEnv = (
      releaseEvidenceModule as Record<string, unknown>
    ).buildReleaseEvidenceCommandEnv;
    expect(typeof buildReleaseEvidenceCommandEnv).toBe("function");
    if (typeof buildReleaseEvidenceCommandEnv !== "function") return;
    const poisoned = {
      SAFE_VALUE: "preserved",
      HOMECOOK_RUN_ACTUAL_RELEASE_BUILD: "poisoned",
      HOMECOOK_VITEST_TEARDOWN_FIXTURE_MODE: "success",
      HOMECOOK_VITEST_TEARDOWN_SIGNAL: "SIGTERM",
      HOMECOOK_VITEST_TEARDOWN_OTHER_HANDLER_MARKER: "/tmp/marker",
      HOMECOOK_VITEST_SUITE_TEMP_ROOT: "/tmp/stale-suite",
      HOMECOOK_VITEST_WORKER_TEMP_ROOT: "/tmp/stale-worker",
    };
    expect(buildReleaseEvidenceCommandEnv("release-suite", poisoned)).toEqual({ SAFE_VALUE: "preserved" });
    expect(buildReleaseEvidenceCommandEnv("actual-build", poisoned)).toEqual({
      SAFE_VALUE: "preserved", HOMECOOK_RUN_ACTUAL_RELEASE_BUILD: "1",
    });
  });

  it("parses only the exact selected actual-build test into a closed projection", () => {
    const parseActualBuildOutput = (
      releaseEvidenceModule as Record<string, unknown>
    ).parseActualBuildOutput;
    expect(typeof parseActualBuildOutput).toBe("function");
    if (typeof parseActualBuildOutput !== "function") return;
    const selected = "runs offline pnpm install and a real Next production build inside the exact macOS build-work sandbox";
    const projection = parseActualBuildOutput([
      `RELEASE_STAGE_CAPABILITY_EVIDENCE=${canonicalizeJcs({
        selected_test_file: "tests/local-mac-production-rehearsal-candidate.test.ts",
        selected_test_name: selected,
        stage_capability_policy: stageCapabilityPolicy(),
        egress_probe: egressProbe(),
      })}`,
      " Test Files  1 passed (1)",
      "      Tests  1 passed | 1 skipped (2)",
    ].join("\n"));

    expect(projection).toMatchObject({
      kind: "actual-build",
      selected_test_file: "tests/local-mac-production-rehearsal-candidate.test.ts",
      selected_test_name: selected,
      vitest_test_files: 1,
      vitest_test_files_passed: 1,
      vitest_test_files_skipped: 0,
      vitest_test_files_failed: 0,
      vitest_tests: 2,
      vitest_passed: 1,
      vitest_skipped: 1,
      vitest_failed: 0,
      stage_capability_policy: stageCapabilityPolicy(),
      egress_probe: egressProbe(),
    });
  });

  it.each([
    ["service", (value: CapabilityProjectionFixture) => { value.stage_capability_policy.install.allowed_mach_lookup_global_names[0] = "com.apple.logd"; }],
    ["stage", (value: CapabilityProjectionFixture) => { value.stage_capability_policy.install.stage = "next-build"; }],
    ["policy digest", (value: CapabilityProjectionFixture) => { value.stage_capability_policy.policy_digest = "c".repeat(64); }],
    ["wildcard", (value: CapabilityProjectionFixture) => { value.stage_capability_policy.install.allowed_mach_lookup_global_names.push("*"); }],
    ["additional allow", (value: CapabilityProjectionFixture) => { value.stage_capability_policy.install.allow_count = 2; }],
    ["successful egress", (value: CapabilityProjectionFixture) => { value.egress_probe.net_connect_success_count = 1; }],
  ])("rejects changed %s capability evidence even when enclosing digests are resigned", (_label, mutate) => {
    const evidence = createReleaseEvidence();
    mutate(evidence.commands[1].stdout_projection as unknown as CapabilityProjectionFixture);
    evidence.commands[1].stdout_sha256 = projectionDigest(evidence.commands[1].stdout_projection);
    const resigned = resignEvidence(evidence);

    expect(() => validateLocalMacProductionReleaseEvidence(resigned, {
      expectedHeadSha: resigned.head_sha,
      expectedTreeSha: resigned.tree_sha,
      inventory,
    })).toThrow(/capability|policy|egress|projection/iu);
  });

  it("builds a validator-closed note without retaining raw command output", () => {
    const buildReleaseEvidence = (
      releaseEvidenceModule as Record<string, unknown>
    ).buildLocalMacProductionReleaseEvidence;
    expect(typeof buildReleaseEvidence).toBe("function");
    if (typeof buildReleaseEvidence !== "function") return;
    const selected = "runs offline pnpm install and a real Next production build inside the exact macOS build-work sandbox";
    const evidence = buildReleaseEvidence({
      headSha: "a".repeat(40),
      treeSha: "b".repeat(40),
      platform: "darwin-arm64",
      inventory,
      releaseSuite: {
        stdout: [
          "RELEASE_TEST_FILES=28",
          "RELEASE_TEST_CASES=787",
          `RELEASE_TEST_INVENTORY_SHA256=${inventory.inventorySha256}`,
          " Test Files  27 passed | 1 skipped (28)",
          "      Tests  785 passed | 2 skipped (787)",
        ].join("\n"),
        stderr: "",
        status: 0,
        signal: null,
        durationMs: 100,
      },
      actualBuild: {
        stdout: [
          `RELEASE_STAGE_CAPABILITY_EVIDENCE=${canonicalizeJcs({
            selected_test_file: "tests/local-mac-production-rehearsal-candidate.test.ts",
            selected_test_name: selected,
            stage_capability_policy: stageCapabilityPolicy(),
            egress_probe: egressProbe(),
          })}`,
          ` ✓ tests/local-mac-production-rehearsal-candidate.test.ts > local Mac > ${selected} 160000ms`,
          " Test Files  1 passed (1)",
          "      Tests  1 passed | 1 skipped (2)",
        ].join("\n"),
        stderr: "",
        status: 0,
        signal: null,
        durationMs: 160_000,
      },
      residue: {
        suite_roots: 0,
        homecook_system_temp: 0,
        hcv_run_roots: 0,
        actual_root_exists: false,
      },
    });

    expect(canonicalizeJcs(evidence)).not.toContain("raw");
    expect(validateLocalMacProductionReleaseEvidence(evidence, {
      expectedHeadSha: "a".repeat(40),
      expectedTreeSha: "b".repeat(40),
      inventory,
    })).toBe(evidence);
  });
});

describe("local Mac production promotion lock", () => {
  it("preserves a corrupt partial lock for manual recovery when metadata persistence fails", () => {
    const homeDir = createTempDirectory("homecook-release-lock-cleanup-home-");
    const manifestPath = join(homeDir, "release.json");
    const manifest = createManifest({ release_manifest_path: manifestPath });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    expect(() =>
      acquireLocalMacProductionPromotionLock({
        homeDir,
        manifest,
        manifestPath,
        lockToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        readCurrentHeadSha: () => manifest.release_sha,
        readGitEvidence: () => createGitEvidence(),
      verifyAttestation: VERIFIED_ATTESTATION,
      writeFile: () => {
        throw new Error("metadata write failed");
      },
      }),
    ).toThrow(/metadata write failed/iu);

    const status = getLocalMacProductionReleaseStatus({
      homeDir,
      manifestPath: null,
      currentBootSessionId: "boot-session-a",
    });
    expect(status.lock).toMatchObject({
      corrupt: true,
      locked: true,
      manual_recovery_required: true,
    });
  });

  it("allows only one writer and reports stale lock candidates without auto-deleting them", () => {
    const homeDir = createTempDirectory("homecook-release-lock-home-");
    const manifestPath = join(homeDir, "release.json");
    const manifest = createManifest({ release_manifest_path: manifestPath });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const first = acquireLocalMacProductionPromotionLock({
      homeDir,
      manifest,
      manifestPath,
      lockToken: "11111111-1111-4111-8111-111111111111",
      pid: 4242,
      bootSessionId: "boot-session-a",
      promoterTaskId: "task-019-release",
      now: new Date("2026-08-25T10:00:00.000Z"),
      readCurrentHeadSha: () => manifest.release_sha,
      readGitEvidence: () => createGitEvidence(),
      verifyAttestation: VERIFIED_ATTESTATION,
    });

    expect(first.lockPath).toContain(".homecook/locks/production-promotion.lock");

    expect(() =>
      acquireLocalMacProductionPromotionLock({
        homeDir,
        manifest,
        manifestPath,
        lockToken: "22222222-2222-4222-8222-222222222222",
        pid: 4343,
        bootSessionId: "boot-session-b",
        promoterTaskId: "task-020-release",
        now: new Date("2026-08-25T10:05:00.000Z"),
        readCurrentHeadSha: () => manifest.release_sha,
        readGitEvidence: () => createGitEvidence(),
        verifyAttestation: VERIFIED_ATTESTATION,
      }),
    ).toThrow(/already held|lock/iu);

    const status = getLocalMacProductionReleaseStatus({
      homeDir,
      manifestPath: null,
      currentHeadSha: manifest.release_sha,
      currentBootSessionId: "boot-session-b",
      isProcessRunning: () => false,
    });

    expect(status.lock.locked).toBe(true);
    expect(status.lock.staleCandidate).toBe(true);
    expect(status.lock.holder).toMatchObject({
      pid: 4242,
      promotion_id: manifest.promotion_id,
      release_sha: manifest.release_sha,
      release_tag: manifest.release_tag,
    });
    expect(status.lock.holder).not.toHaveProperty("lock_token");
  });

  it("treats an orphaned or corrupt lock directory as locked and manual-recovery only", () => {
    const homeDir = createTempDirectory("homecook-release-lock-corrupt-home-");
    const { lockPath } = getLocalMacProductionReleasePaths(homeDir);
    mkdirSync(lockPath, { recursive: true, mode: 0o700 });

    const status = getLocalMacProductionReleaseStatus({
      homeDir,
      manifestPath: null,
      currentBootSessionId: "boot-session-a",
    });

    expect(status.lock.locked).toBe(true);
    expect(status.lock.corrupt).toBe(true);
    expect(status.lock.holder).toBeNull();
  });

  it("returns the resolved current origin/master head in status output when provided", () => {
    const currentHeadSha = "f".repeat(40);

    const status = getLocalMacProductionReleaseStatus({
      currentHeadSha,
      homeDir: createTempDirectory("homecook-release-status-head-home-"),
      manifestPath: null,
      currentBootSessionId: "boot-session-a",
    });

    expect(status.current_head_sha).toBe(currentHeadSha);
  });
});

describe("local Mac production mutation authority", () => {
  it("requires explicit manifest and lock-token authority for mutation commands", () => {
    expect(isLocalMacProductionMutationCommand("prepare-env")).toBe(true);
    expect(isLocalMacProductionMutationCommand("install")).toBe(true);
    expect(isLocalMacProductionMutationCommand("restart")).toBe(true);
    expect(isLocalMacProductionMutationCommand("uninstall")).toBe(true);
    expect(isLocalMacProductionMutationCommand("status")).toBe(false);

    expect(() =>
      validateLocalMacProductionMutationAuthority({
        command: "install",
        releaseManifestPath: null,
        lockToken: null,
      }),
    ).toThrow(/--release-manifest|--lock-token/iu);
  });

  it("does not accept ambient environment variables as a mutation bypass", () => {
    const homeDir = createTempDirectory("homecook-release-authority-home-");
    const rootDir = createTempDirectory("homecook-release-authority-root-");
    mkdirSync(join(rootDir, ".git"), { recursive: true });
    const manifestPath = join(homeDir, "release.json");
    const manifest = createManifest({ release_manifest_path: manifestPath });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    acquireLocalMacProductionPromotionLock({
      homeDir,
      manifest,
      manifestPath,
      lockToken: "33333333-3333-4333-8333-333333333333",
      pid: 4242,
      bootSessionId: "boot-session-a",
      promoterTaskId: "task-019-release",
      now: new Date("2026-08-25T10:00:00.000Z"),
      readCurrentHeadSha: () => manifest.release_sha,
      readGitEvidence: () => createGitEvidence(),
      verifyAttestation: VERIFIED_ATTESTATION,
    });

    expect(() =>
      validateLocalMacProductionMutationAuthority({
        command: "restart",
        rootDir,
        homeDir,
        releaseManifestPath: null,
        lockToken: null,
        env: {
          ...process.env,
          HOMECOOK_RELEASE_MANIFEST_PATH: manifestPath,
          HOMECOOK_RELEASE_LOCK_TOKEN: "lock-token-1",
        },
        readCurrentHeadSha: () => manifest.release_sha,
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/ambient|environment|--release-manifest|--lock-token/iu);
  });

  it("fails closed for mutation authority until a trusted attestation verifier explicitly approves the manifest", () => {
    const homeDir = createTempDirectory("homecook-release-attestation-home-");
    const rootDir = createTempDirectory("homecook-release-attestation-root-");
    const manifestPath = join(homeDir, "release.json");
    const manifest = createManifest({ release_manifest_path: manifestPath });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    acquireLocalMacProductionPromotionLock({
      homeDir,
      manifest,
      manifestPath,
      lockToken: "77777777-7777-4777-8777-777777777777",
      readCurrentHeadSha: () => manifest.release_sha,
      readGitEvidence: () => createGitEvidence(),
      verifyAttestation: VERIFIED_ATTESTATION,
    });

    expect(() =>
      validateLocalMacProductionMutationAuthority({
        command: "install",
        homeDir,
        rootDir,
        releaseManifestPath: manifestPath,
        lockToken: "77777777-7777-4777-8777-777777777777",
        readCurrentHeadSha: () => manifest.release_sha,
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/attestation|trusted/i);
  });
});

describe("local Mac production release prepare", () => {
  function createPrepareFixture() {
    const homeDir = createTempDirectory("homecook-release-prepare-home-");
    const rootDir = createTempDirectory("homecook-release-prepare-root-");
    const manifestPath = join(rootDir, "release.json");
    const manifest = createManifest({ release_manifest_path: manifestPath });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const paths = getLocalMacProductionReleasePaths(homeDir);
    mkdirSync(paths.releaseRoot, { recursive: true, mode: 0o700 });
    mkdirSync(paths.lockPath, { recursive: true, mode: 0o700 });
    writeFileSync(paths.currentDescriptorPath, "current-before\n");
    writeFileSync(paths.previousDescriptorPath, "previous-before\n");
    writeFileSync(paths.lockMetadataPath, "lock-before\n", { mode: 0o600 });

    return { homeDir, manifest, manifestPath, paths, rootDir };
  }

  function createPrepareCommandRunner({
    dirtyAfterBuild = false,
    failCommand = null,
    headSha = "a".repeat(40),
  }: {
    dirtyAfterBuild?: boolean,
    failCommand?: string | null,
    headSha?: string,
  } = {}) {
    const invocations: Array<{
      command: string,
      args: string[],
      cwd: string | undefined,
      env?: NodeJS.ProcessEnv,
    }> = [];
    let buildCompleted = false;

    const runCommand = ((
      command: string,
      args: readonly string[] = [],
      options?: { cwd?: string, env?: NodeJS.ProcessEnv },
    ) => {
      const normalizedArgs = [...args];
      invocations.push({ command, args: normalizedArgs, cwd: options?.cwd, env: options?.env });
      const commandKey = `${command} ${normalizedArgs.join(" ")}`;

      if (command === "git" && normalizedArgs[0] === "clone") {
        const checkoutDir = normalizedArgs.at(-1);
        if (!checkoutDir) throw new Error("missing fixture checkout directory");
        mkdirSync(join(checkoutDir, ".git"), { recursive: true });
        writeFileSync(join(checkoutDir, "README.md"), "fixture release\n");
      }

      if (failCommand && commandKey === failCommand) {
        return { status: 1, stdout: "", stderr: "fixture command failed" };
      }
      if (command === "git" && normalizedArgs.join(" ") === "rev-parse HEAD") {
        return { status: 0, stdout: `${headSha}\n`, stderr: "" };
      }
      if (command === "git" && normalizedArgs.join(" ") === "rev-parse HEAD^{tree}") {
        return { status: 0, stdout: `${"b".repeat(40)}\n`, stderr: "" };
      }
      if (command === "git" && normalizedArgs.join(" ") === "symbolic-ref -q HEAD") {
        return { status: 1, stdout: "", stderr: "" };
      }
      if (command === "git" && normalizedArgs.join(" ") === "status --porcelain=v1 --untracked-files=no") {
        return {
          status: 0,
          stdout: dirtyAfterBuild && buildCompleted ? " M package.json\n" : "",
          stderr: "",
        };
      }
      if (command === "git" && normalizedArgs.join(" ") === "ls-files -s -z") {
        return { status: 0, stdout: "", stderr: "" };
      }
      if (command === "pnpm" && normalizedArgs.join(" ") === "mac-production:build") {
        buildCompleted = true;
      }
      return { status: 0, stdout: "", stderr: "" };
    }) as typeof import("node:child_process").spawnSync;

    return { invocations, runCommand };
  }

  it("creates a complete immutable release directory from an exact detached checkout without touching production state", () => {
    const fixture = createPrepareFixture();
    const { invocations, runCommand } = createPrepareCommandRunner();
    writeFileSync(join(fixture.rootDir, ".env.production.local"), "app-runtime-fixture\n", {
      mode: 0o600,
    });
    mkdirSync(join(fixture.rootDir, "infra/full-local-supabase"), { recursive: true });
    writeFileSync(
      join(fixture.rootDir, "infra/full-local-supabase/.env.production.local"),
      "full-local-runtime-fixture\n",
      { mode: 0o600 },
    );

    const result = prepareLocalMacProductionRelease({
      homeDir: fixture.homeDir,
      manifestPath: fixture.manifestPath,
      readGitEvidence: () => createGitEvidence(),
      rootDir: fixture.rootDir,
      runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    });

    expect(result).toMatchObject({
      prepared: true,
      manifest: {
        release_sha: fixture.manifest.release_sha,
        release_tag: fixture.manifest.release_tag,
      },
    });
    expect(result.release_dir).toBe(realpathSync(join(
      fixture.paths.releaseRoot,
      fixture.manifest.release_tag,
    )));
    expect(JSON.parse(readFileSync(result.prepare_descriptor_path, "utf8"))).toMatchObject({
      status: "prepared",
      release_sha: fixture.manifest.release_sha,
      release_tree: fixture.manifest.release_tree,
      release_tag: fixture.manifest.release_tag,
    });
    expect(readFileSync(fixture.paths.currentDescriptorPath, "utf8")).toBe("current-before\n");
    expect(readFileSync(fixture.paths.previousDescriptorPath, "utf8")).toBe("previous-before\n");
    expect(readFileSync(fixture.paths.lockMetadataPath, "utf8")).toBe("lock-before\n");
    expect(readFileSync(join(result.release_dir, ".env.production.local"), "utf8"))
      .toBe("app-runtime-fixture\n");
    expect(readFileSync(
      join(result.release_dir, "infra/full-local-supabase/.env.production.local"),
      "utf8",
    )).toBe("full-local-runtime-fixture\n");
    expect(invocations.map(({ command, args }) => [command, args])).toEqual(expect.arrayContaining([
      ["git", ["clone", "--no-checkout", "--no-hardlinks", "--no-local", realpathSync(fixture.rootDir), expect.any(String)]],
      ["git", ["checkout", "--detach", fixture.manifest.release_sha]],
      ["pnpm", ["install", "--frozen-lockfile", "--offline", "--package-import-method=copy"]],
      ["pnpm", ["mac-production:build"]],
      ["pnpm", ["verify:security-functions:release"]],
      ["pnpm", ["verify:local-supabase-runtime:isolated"]],
    ]));
    expect(invocations.find(({ command, args }) =>
      command === "pnpm" && args.join(" ") === "mac-production:build")?.env
      ?.HOMECOOK_RELEASE_BUILD_ID).toBe(fixture.manifest.build_id);
    expect(invocations.some(({ command, args }) =>
      command.includes("launchctl")
      || args.some((argument) =>
        /mac-production:install|restart|uninstall|full-local-production:start|release:production:promote/u.test(argument),
      ),
    )).toBe(false);
    expect(readdirSync(fixture.paths.releaseRoot)).not.toContain(expect.stringMatching(/^\.prepare-/u));
  });

  it("accepts cwd-relative home, repository, and manifest paths before applying filesystem safety checks", () => {
    const fixture = createPrepareFixture();
    const { runCommand } = createPrepareCommandRunner();

    const result = prepareLocalMacProductionRelease({
      homeDir: relative(process.cwd(), fixture.homeDir),
      manifestPath: relative(process.cwd(), fixture.manifestPath),
      readGitEvidence: () => createGitEvidence(),
      rootDir: relative(process.cwd(), fixture.rootDir),
      runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    });

    expect(result.release_dir).toBe(realpathSync(join(
      fixture.paths.releaseRoot,
      fixture.manifest.release_tag,
    )));
    expect(JSON.parse(readFileSync(result.prepare_descriptor_path, "utf8")))
      .toMatchObject({ status: "prepared", release_sha: fixture.manifest.release_sha });
  });

  it("keeps a failed build reservation partial without a completion marker or production-state changes", () => {
    const fixture = createPrepareFixture();
    const { runCommand } = createPrepareCommandRunner({ failCommand: "pnpm mac-production:build" });

    expect(() => prepareLocalMacProductionRelease({
      homeDir: fixture.homeDir,
      manifestPath: fixture.manifestPath,
      readGitEvidence: () => createGitEvidence(),
      rootDir: fixture.rootDir,
      runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    })).toThrow(/pnpm mac-production:build|fixture command failed/iu);

    const reservedPath = join(fixture.paths.releaseRoot, fixture.manifest.release_tag);
    expect(lstatSync(reservedPath).isDirectory()).toBe(true);
    expect(existsSync(join(reservedPath, "prepare.json"))).toBe(false);
    expect(readFileSync(fixture.paths.lockMetadataPath, "utf8")).toBe("lock-before\n");
  });

  it("fails closed before validation commands when the detached checkout SHA is not exact", () => {
    const fixture = createPrepareFixture();
    const { invocations, runCommand } = createPrepareCommandRunner({ headSha: "f".repeat(40) });

    expect(() => prepareLocalMacProductionRelease({
      homeDir: fixture.homeDir,
      manifestPath: fixture.manifestPath,
      readGitEvidence: () => createGitEvidence(),
      rootDir: fixture.rootDir,
      runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    })).toThrow(/checkout|release SHA|exact/iu);
    expect(invocations.some(({ command }) => command === "pnpm")).toBe(false);
    expect(existsSync(join(
      fixture.paths.releaseRoot,
      fixture.manifest.release_tag,
      "prepare.json",
    ))).toBe(false);
  });

  it("fails closed when install or build changes tracked release source", () => {
    const fixture = createPrepareFixture();
    const { runCommand } = createPrepareCommandRunner({ dirtyAfterBuild: true });

    expect(() => prepareLocalMacProductionRelease({
      homeDir: fixture.homeDir,
      manifestPath: fixture.manifestPath,
      readGitEvidence: () => createGitEvidence(),
      rootDir: fixture.rootDir,
      runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    })).toThrow(/clean tracked source|tracked source|dirty/iu);
    const reservedPath = join(fixture.paths.releaseRoot, fixture.manifest.release_tag);
    expect(lstatSync(reservedPath).isDirectory()).toBe(true);
    expect(existsSync(join(reservedPath, "prepare.json"))).toBe(false);
  });

  it("rejects symlink release roots, partial prepare reuse, and a same-tag directory for another SHA", () => {
    const symlinkFixture = createPrepareFixture();
    const externalRoot = createTempDirectory("homecook-release-prepare-external-");
    rmSync(symlinkFixture.paths.releaseRoot, { recursive: true, force: true });
    symlinkSync(externalRoot, symlinkFixture.paths.releaseRoot);
    const { runCommand } = createPrepareCommandRunner();

    expect(() => prepareLocalMacProductionRelease({
      homeDir: symlinkFixture.homeDir,
      manifestPath: symlinkFixture.manifestPath,
      readGitEvidence: () => createGitEvidence(),
      rootDir: symlinkFixture.rootDir,
      runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    })).toThrow(/symlink|symbolic link/iu);
    expect(readdirSync(externalRoot)).toEqual([]);

    const partialFixture = createPrepareFixture();
    const partialPath = join(partialFixture.paths.releaseRoot, partialFixture.manifest.release_tag);
    mkdirSync(partialPath, { mode: 0o700 });
    writeFileSync(join(partialPath, "reservation-owner.txt"), "another prepare\n");
    expect(() => prepareLocalMacProductionRelease({
      homeDir: partialFixture.homeDir,
      manifestPath: partialFixture.manifestPath,
      readGitEvidence: () => createGitEvidence(),
      rootDir: partialFixture.rootDir,
      runCommand: createPrepareCommandRunner().runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    })).toThrow(/partial|reuse|already exists/iu);
    expect(readFileSync(join(partialPath, "reservation-owner.txt"), "utf8"))
      .toBe("another prepare\n");

    const conflictFixture = createPrepareFixture();
    const conflictPath = join(conflictFixture.paths.releaseRoot, conflictFixture.manifest.release_tag);
    mkdirSync(conflictPath, { mode: 0o700 });
    writeFileSync(join(conflictPath, "prepare.json"), JSON.stringify({
      status: "prepared",
      release_sha: "f".repeat(40),
    }));
    expect(() => prepareLocalMacProductionRelease({
      homeDir: conflictFixture.homeDir,
      manifestPath: conflictFixture.manifestPath,
      readGitEvidence: () => createGitEvidence(),
      rootDir: conflictFixture.rootDir,
      runCommand: createPrepareCommandRunner().runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    })).toThrow(/different SHA|collision|conflict/iu);
    expect(lstatSync(conflictPath).isDirectory()).toBe(true);
  });

  it("rejects a symlink release manifest before creating a staging directory", () => {
    const fixture = createPrepareFixture();
    const realManifestPath = join(fixture.rootDir, "release-real.json");
    writeFileSync(realManifestPath, readFileSync(fixture.manifestPath));
    unlinkSync(fixture.manifestPath);
    symlinkSync(realManifestPath, fixture.manifestPath);
    const { invocations, runCommand } = createPrepareCommandRunner();

    expect(() => prepareLocalMacProductionRelease({
      homeDir: fixture.homeDir,
      manifestPath: fixture.manifestPath,
      readGitEvidence: () => createGitEvidence(),
      rootDir: fixture.rootDir,
      runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    })).toThrow(/manifest.*symlink|symlink.*manifest/iu);

    expect(invocations).toEqual([]);
    expect(readdirSync(fixture.paths.releaseRoot)).toEqual(["current.json", "previous.json"]);
  });

  it("stores the exact manifest bytes that were validated even when the source path is replaced afterward", () => {
    const fixture = createPrepareFixture();
    const originalBytes = readFileSync(fixture.manifestPath);
    const originalDigest = createHash("sha256").update(originalBytes).digest("hex");
    const replacementManifest = createManifest({
      approved_by_task_id: "replacement-task",
      build_id: "replacement-build",
      release_manifest_path: fixture.manifestPath,
    });
    const { runCommand } = createPrepareCommandRunner();

    const result = prepareLocalMacProductionRelease({
      homeDir: fixture.homeDir,
      manifestPath: fixture.manifestPath,
      readGitEvidence: () => createGitEvidence(),
      rootDir: fixture.rootDir,
      runCommand,
      verifyAttestation: (input) => {
        expect(input.manifestDigest).toBe(originalDigest);
        writeFileSync(fixture.manifestPath, JSON.stringify(replacementManifest, null, 2));
        return VERIFIED_ATTESTATION();
      },
    });

    expect(readFileSync(join(result.release_dir, "release-manifest.json")))
      .toEqual(originalBytes);
    expect(JSON.parse(readFileSync(result.prepare_descriptor_path, "utf8")))
      .toMatchObject({
        build_id: fixture.manifest.build_id,
        source_manifest_sha256: originalDigest,
      });
  });

  it.each([
    ["Homecook state directory", (paths: ReturnType<typeof getLocalMacProductionReleasePaths>) =>
      join(paths.releaseRoot, "..")],
    ["release root", (paths: ReturnType<typeof getLocalMacProductionReleasePaths>) =>
      paths.releaseRoot],
  ])("rejects a group/world-writable %s before running commands", (_, selectPath) => {
    const fixture = createPrepareFixture();
    chmodSync(selectPath(fixture.paths), 0o777);
    const { invocations, runCommand } = createPrepareCommandRunner();

    expect(() => prepareLocalMacProductionRelease({
      homeDir: fixture.homeDir,
      manifestPath: fixture.manifestPath,
      readGitEvidence: () => createGitEvidence(),
      rootDir: fixture.rootDir,
      runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    })).toThrow(/group|world|writable|mode/iu);
    expect(invocations).toEqual([]);
  });

  it("rejects release state directories not owned by the current user", () => {
    const fixture = createPrepareFixture();
    const currentUid = process.getuid?.();
    if (!Number.isInteger(currentUid)) throw new Error("fixture requires a POSIX uid");
    const { invocations, runCommand } = createPrepareCommandRunner();
    const options = {
      getCurrentUid: () => Number(currentUid) + 1,
      homeDir: fixture.homeDir,
      manifestPath: fixture.manifestPath,
      readGitEvidence: () => createGitEvidence(),
      rootDir: fixture.rootDir,
      runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    } as Parameters<typeof prepareLocalMacProductionRelease>[0] & {
      getCurrentUid: () => number,
    };

    expect(() => prepareLocalMacProductionRelease(options)).toThrow(/owner|uid|current user/iu);
    expect(invocations).toEqual([]);
  });

  it("never replaces an empty destination won by a competing prepare reservation", () => {
    const fixture = createPrepareFixture();
    const destinationPath = join(
      realpathSync(fixture.paths.releaseRoot),
      fixture.manifest.release_tag,
    );
    const { invocations, runCommand } = createPrepareCommandRunner();
    const mkdir = ((path: string, options?: Parameters<typeof mkdirSync>[1]) => {
      if (realpathSync(join(destinationPath, "..")) === realpathSync(fixture.paths.releaseRoot)
        && path === destinationPath) {
        mkdirSync(path, options);
        const error = Object.assign(new Error("competing reservation won"), { code: "EEXIST" });
        throw error;
      }
      return mkdirSync(path, options);
    }) as typeof mkdirSync;
    const options = {
      homeDir: fixture.homeDir,
      manifestPath: fixture.manifestPath,
      mkdir,
      readGitEvidence: () => createGitEvidence(),
      rootDir: fixture.rootDir,
      runCommand,
      verifyAttestation: VERIFIED_ATTESTATION,
    } as Parameters<typeof prepareLocalMacProductionRelease>[0] & {
      mkdir: typeof mkdirSync,
    };

    expect(() => prepareLocalMacProductionRelease(options))
      .toThrow(/reservation|already exists|competing/iu);
    expect(lstatSync(destinationPath).isDirectory()).toBe(true);
    expect(readdirSync(destinationPath)).toEqual([]);
    expect(existsSync(join(destinationPath, "prepare.json"))).toBe(false);
    expect(invocations).toEqual([]);
  });
});
