import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
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
  it("fails closed unless offline bundle, trusted root, and subject manifest are supplied explicitly", () => {
    const manifestPath = "/tmp/release.json";
    const manifest = createLocalMacProductionReleaseManifest(manifestPath);
    const gitEvidence = createLocalMacProductionGitEvidence({
      releaseSha: manifest.release_sha,
      releaseTree: manifest.release_tree,
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
  });
});
