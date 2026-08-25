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
  it("fails closed unless offline bundle, trusted root, and attested document are supplied explicitly", () => {
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
    ).toThrow(/bundle|trusted root|attested document|offline/iu);
  });

  it("binds repository, signer workflow, tag, sha, tree, manifest digest, and normalized checks", () => {
    const rootDir = createTempDirectory("homecook-gh-attestation-root-");
    const attestationPath = join(rootDir, "production-release-attestation.json");
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

    writeFileSync(attestationPath, JSON.stringify({
      schema: "homecook.github.production-release-attestation.v1",
      repository: "shj/homecook",
      release_tag: manifest.release_tag,
      release_sha: manifest.release_sha,
      release_tree: manifest.release_tree,
      manifest_sha256: "d".repeat(64),
      required_check_summary: manifest.required_check_summary,
    }, null, 2));
    writeFileSync(bundlePath, "{}\n");
    writeFileSync(trustedRootPath, "{}\n");

    const invocations: string[][] = [];
    const verifier = createGitHubProductionReleaseAttestationVerifier({
      attestationPath,
      bundlePath,
      repository: "shj/homecook",
      signerWorkflow: "shj/homecook/.github/workflows/production-release-attestation.yml",
      trustedRootPath,
      runGh: ((_: string, args?: readonly string[]) => {
        invocations.push([...(args ?? [])]);
        return {
          status: 0,
          stdout: JSON.stringify([{
            verificationResult: {
              statement: {
                predicateType: "https://slsa.dev/provenance/v1",
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
        attestationPath,
        "--repo",
        "shj/homecook",
        "--bundle",
        bundlePath,
        "--custom-trusted-root",
        trustedRootPath,
        "--signer-workflow",
        "shj/homecook/.github/workflows/production-release-attestation.yml",
        "--source-digest",
        manifest.release_sha,
        "--format",
        "json",
      ],
    ]);
  });
});
