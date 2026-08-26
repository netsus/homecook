import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildGitHubProductionReleaseAttestationArtifacts,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
  GITHUB_ACTIONS_APP_INTEGRATION_ID,
  GITHUB_CLI_TRUSTED_ROOT_SHA256,
  createGitHubProductionReleaseAttestationVerifier,
  verifyGitHubProductionReleaseAttestation,
} from "../scripts/lib/github-production-release-attestation.mjs";
import {
  createLocalMacProductionGitEvidence,
  createLocalMacProductionReleaseManifest,
} from "./helpers/local-mac-production-release-fixtures";

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

function createTrustedCheckRuns(checkSuiteId = 200) {
  return EXPECTED_RELEASE_CONTEXTS.map((name, index) => ({
    app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
    check_suite: { id: checkSuiteId },
    completed_at: `2026-08-26T09:00:${String(index).padStart(2, "0")}Z`,
    conclusion: "success",
    name,
    status: "completed",
  }));
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
  it("accepts expected contexts only from the trusted GitHub Actions App and never from commit statuses", () => {
    const releaseInput = {
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.1",
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

  it("excludes only the explicitly supplied current workflow suite and blocks every other non-terminal check or latest bad status", () => {
    const releaseInput = {
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.1",
      releaseTree: "b".repeat(40),
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
    };
    const currentSuiteId = 777;
    const currentSuitePending = {
      app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
      check_suite: { id: currentSuiteId },
      name: "approve-and-tag",
      status: "in_progress",
      started_at: "2026-08-26T09:02:00Z",
    };

    expect(
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [...createTrustedCheckRuns(), currentSuitePending],
        excludedCheckSuiteId: currentSuiteId,
      }).subject.required_check_summary,
    ).toMatchObject({ total: EXPECTED_RELEASE_CONTEXTS.length });

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [
          ...createTrustedCheckRuns(),
          currentSuitePending,
          {
            app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
            check_suite: { id: 778 },
            name: "other-pending-check",
            status: "in_progress",
            started_at: "2026-08-26T09:03:00Z",
          },
        ],
        excludedCheckSuiteId: currentSuiteId,
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

  it("rejects an older failed check run even when a later rerun succeeds", () => {
    const releaseInput = {
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.1",
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
    });
    const gitEvidence = createLocalMacProductionGitEvidence({
      releaseSha: manifest.release_sha,
      releaseTree: manifest.release_tree,
    });

    writeFileSync(subjectManifestPath, JSON.stringify({
      schema: "homecook.github.production-release-manifest.v1",
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      source_ref: CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
      signer_workflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
      signer_digest: manifest.release_sha,
      expected_release_integration_id: GITHUB_ACTIONS_APP_INTEGRATION_ID,
      release_tag: manifest.release_tag,
      release_sha: manifest.release_sha,
      release_tree: manifest.release_tree,
      expected_release_contexts: EXPECTED_RELEASE_CONTEXTS,
      required_check_summary: manifest.required_check_summary,
    }, null, 2));
    writeFileSync(bundlePath, "{}\n");
    writeFileSync(trustedRootPath, "{}\n");

    const invocations: string[][] = [];
    const verifier = createGitHubProductionReleaseAttestationVerifier({
      bundlePath,
      repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
      signerWorkflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
      subjectManifestPath,
      trustedRootPath,
      runGh: ((_: string, args?: readonly string[]) => {
        invocations.push([...(args ?? [])]);
        return {
          status: 0,
          stdout: JSON.stringify([{
            verificationResult: {
              statement: {
                predicateType:
                  "https://github.com/netsus/homecook/attestations/production-release/v1",
                predicate: {
                  schema: "homecook.github.production-release-predicate.v1",
                  repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
                  source_ref: CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
                  signer_workflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
                  signer_digest: manifest.release_sha,
                  expected_release_integration_id: GITHUB_ACTIONS_APP_INTEGRATION_ID,
                  release_tag: manifest.release_tag,
                  release_sha: manifest.release_sha,
                  release_tree: manifest.release_tree,
                  expected_release_contexts: EXPECTED_RELEASE_CONTEXTS,
                  required_check_summary: manifest.required_check_summary,
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
        manifest.release_sha,
        "--predicate-type",
        "https://github.com/netsus/homecook/attestations/production-release/v1",
        "--format",
        "json",
      ],
    ]);

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
