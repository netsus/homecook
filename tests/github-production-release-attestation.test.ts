import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildGitHubProductionReleaseAttestationArtifacts,
  createGitHubProductionReleaseAttestationVerifier,
  verifyGitHubProductionReleaseAttestation,
} from "../scripts/lib/github-production-release-attestation.mjs";
import {
  createLocalMacProductionGitEvidence,
  createLocalMacProductionReleaseManifest,
} from "./helpers/local-mac-production-release-fixtures";

const temporaryDirectories: string[] = [];

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
  it("rejects zero, missing, failed, pending, and ambiguous expected release contexts while still accepting status-only evidence", () => {
    const releaseInput = {
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260826.1",
      releaseTree: "b".repeat(40),
      repository: "shj/homecook",
    };

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [],
        commitStatuses: [],
      }),
    ).toThrow(/expected|context|status/iu);

    const successOnlyStatuses = [
      { context: "build", state: "success", updated_at: "2026-08-26T09:00:00Z" },
      { context: "changes", state: "success", updated_at: "2026-08-26T09:00:01Z" },
      { context: "policy", state: "success", updated_at: "2026-08-26T09:00:02Z" },
      { context: "quality", state: "success", updated_at: "2026-08-26T09:00:03Z" },
      { context: "security-function-authorization", state: "success", updated_at: "2026-08-26T09:00:04Z" },
      { context: "security-smoke", state: "success", updated_at: "2026-08-26T09:00:05Z" },
      { context: "template-check", state: "success", updated_at: "2026-08-26T09:00:06Z" },
    ];

    expect(
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [],
        commitStatuses: successOnlyStatuses,
      }).subject.expected_release_contexts,
    ).toEqual([
      "build",
      "changes",
      "policy",
      "quality",
      "security-function-authorization",
      "security-smoke",
      "template-check",
    ]);

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [],
        commitStatuses: successOnlyStatuses.slice(1),
      }),
    ).toThrow(/missing|expected|context/iu);

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [],
        commitStatuses: successOnlyStatuses.map((entry) =>
          entry.context === "quality"
            ? { ...entry, state: "failure" }
            : entry),
      }),
    ).toThrow(/failed|bad|terminal/iu);

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [],
        commitStatuses: successOnlyStatuses.map((entry) =>
          entry.context === "quality"
            ? { ...entry, state: "pending" }
            : entry),
      }),
    ).toThrow(/pending|bad|terminal/iu);

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [
          {
            workflow_name: "optional",
            name: "unexpected-pending-check",
            status: "in_progress",
            started_at: "2026-08-26T09:01:00Z",
          },
        ],
        commitStatuses: successOnlyStatuses,
      }),
    ).toThrow(/pending|terminal/iu);

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [
          {
            workflow_name: "quality",
            name: "quality",
            status: "completed",
            conclusion: "failure",
            completed_at: "2026-08-26T09:00:02Z",
          },
          {
            workflow_name: "quality",
            name: "quality",
            status: "completed",
            conclusion: "success",
            completed_at: "2026-08-26T09:00:04Z",
          },
        ],
        commitStatuses: successOnlyStatuses.filter((entry) => entry.context !== "quality"),
      }),
    ).toThrow(/rerun|terminal/iu);

    expect(() =>
      buildGitHubProductionReleaseAttestationArtifacts({
        ...releaseInput,
        checkRuns: [
          {
            workflow_name: "quality",
            name: "quality",
            status: "completed",
            conclusion: "success",
            completed_at: "2026-08-26T09:00:03Z",
          },
          {
            workflow_name: "quality",
            name: "quality",
            status: "completed",
            conclusion: "failure",
            completed_at: "2026-08-26T09:00:04Z",
          },
        ],
        commitStatuses: successOnlyStatuses.filter((entry) => entry.context !== "quality"),
      }),
    ).toThrow(/failed|bad|ambiguous|terminal/iu);
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
        repository: "shj/homecook",
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
      repository: "shj/homecook",
      release_tag: manifest.release_tag,
      release_sha: manifest.release_sha,
      release_tree: manifest.release_tree,
      expected_release_contexts: [
        "build",
        "changes",
        "policy",
        "quality",
        "security-function-authorization",
        "security-smoke",
        "template-check",
      ],
      required_check_summary: manifest.required_check_summary,
    }, null, 2));
    writeFileSync(bundlePath, "{}\n");
    writeFileSync(trustedRootPath, "{}\n");

    const invocations: string[][] = [];
    const verifier = createGitHubProductionReleaseAttestationVerifier({
      bundlePath,
      repository: "shj/homecook",
      signerWorkflow: "shj/homecook/.github/workflows/production-release-attestation.yml",
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
                  "https://github.com/shj/homecook/attestations/production-release/v1",
                predicate: {
                  schema: "homecook.github.production-release-predicate.v1",
                  repository: "shj/homecook",
                  release_tag: manifest.release_tag,
                  release_sha: manifest.release_sha,
                  release_tree: manifest.release_tree,
                  expected_release_contexts: [
                    "build",
                    "changes",
                    "policy",
                    "quality",
                    "security-function-authorization",
                    "security-smoke",
                    "template-check",
                  ],
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
      sha256File: () => "a".repeat(64),
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
        "shj/homecook",
        "--bundle",
        bundlePath,
        "--custom-trusted-root",
        trustedRootPath,
        "--signer-workflow",
        "shj/homecook/.github/workflows/production-release-attestation.yml",
        "--predicate-type",
        "https://github.com/shj/homecook/attestations/production-release/v1",
        "--source-digest",
        manifest.release_sha,
        "--format",
        "json",
      ],
    ]);

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
  });
});
