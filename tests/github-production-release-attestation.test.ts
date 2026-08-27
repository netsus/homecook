import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
  resolveTrustedGitHubCliExecutable,
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
const RELEASE_TAG_OBJECT_SHA = "e".repeat(40);

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
  it("resolves only the absolute validated GitHub CLI beside the pinned Node executable", () => {
    const root = createTempDirectory("trusted-gh-");
    const trustedBin = join(root, "trusted-bin");
    const hostileBin = join(root, "hostile-bin");
    mkdirSync(trustedBin, { mode: 0o700 });
    mkdirSync(hostileBin, { mode: 0o700 });
    const nodePath = join(trustedBin, "node");
    const trustedGh = join(trustedBin, "gh");
    const hostileGh = join(hostileBin, "gh");
    writeFileSync(nodePath, "node", { mode: 0o700 });
    writeFileSync(trustedGh, "trusted", { mode: 0o700 });
    writeFileSync(hostileGh, "hostile", { mode: 0o700 });

    expect(resolveTrustedGitHubCliExecutable({
      currentUid: statSync(root).uid,
      nodeExecutablePath: nodePath,
      pathEnvironment: hostileBin,
    })).toBe(realpathSync(trustedGh));

    chmodSync(trustedGh, 0o722);
    expect(() => resolveTrustedGitHubCliExecutable({
      currentUid: statSync(root).uid,
      nodeExecutablePath: nodePath,
      pathEnvironment: hostileBin,
    })).toThrow(/GitHub CLI|mode|unsafe/iu);
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
            completed_at: "2026-08-26T08:00:00Z",
            conclusion: "skipped",
          },
        ],
      }),
    ).not.toThrow();

    expect(
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [
          ...checks,
          {
            app: { id: GITHUB_ACTIONS_APP_INTEGRATION_ID },
            check_suite: { id: 999 },
            completed_at: "2026-08-26T10:01:00Z",
            conclusion: "neutral",
            name: "optional-security-advisory",
            status: "completed",
          },
        ],
      }).subject.required_check_summary,
    ).toMatchObject({ intended_skip: 1 });
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
    { excludedCheckSuiteIds: [] },
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
      release_tag_object_sha: manifest.release_tag_object_sha,
      release_sha: manifest.release_sha,
      release_tree: manifest.release_tree,
      expected_release_contexts: EXPECTED_RELEASE_CONTEXTS,
      required_check_summary: manifest.required_check_summary,
    }, null, 2));
    writeFileSync(bundlePath, "{}\n");
    writeFileSync(trustedRootPath, "{}\n");

    const invocations: string[][] = [];
    const invokedCommands: string[] = [];
    let attestedPredicateTagObjectSha = manifest.release_tag_object_sha;
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
                  "https://github.com/netsus/homecook/attestations/production-release/v1",
                predicate: {
                  schema: "homecook.github.production-release-predicate.v1",
                  repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
                  source_ref: CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
                  signer_workflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
                  signer_digest: manifest.release_sha,
                  expected_release_integration_id: GITHUB_ACTIONS_APP_INTEGRATION_ID,
                  release_tag: manifest.release_tag,
                  release_tag_object_sha: attestedPredicateTagObjectSha,
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
    expect(invokedCommands).toEqual(["/opt/homebrew/bin/gh"]);

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
