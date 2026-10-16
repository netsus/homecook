import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildYoutubeExtractionAppDescriptor,
  materializeYoutubeExtractionWorkerArtifact,
  stableStringify,
  YOUTUBE_EXTRACTION_WORKER_REQUIRED_ARTIFACT_FILES,
} from "../scripts/lib/youtube-extraction-worker-artifact.mjs";
import {
  buildYoutubeExtractionWorkerCredentialState,
  installYoutubeExtractionWorkerLaunchAgent,
  writeCredentialMetadata,
} from "../scripts/lib/youtube-extraction-worker-ops.mjs";
import {
  YOUTUBE_V71_APP_DESCRIPTOR_FILE_SHA256,
  YOUTUBE_V71_ARTIFACT_IDENTITY,
  YOUTUBE_V71_ARTIFACT_MANIFEST_FILE_SHA256,
  YOUTUBE_V71_BUILD_ID,
  YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
  YOUTUBE_V71_CREDENTIAL_TTL_SECONDS,
  YOUTUBE_V71_EXPECTED_SCHEMA_SHA256,
  YOUTUBE_V71_PIPELINE_IDENTITY,
  YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
  YOUTUBE_V71_POLICY_VERSION,
  YOUTUBE_V71_PROMOTION_ID,
  YOUTUBE_V71_RELEASE_SHA,
  YOUTUBE_V71_RELEASE_TREE,
  YOUTUBE_V71_SCHEMA_IDENTITY,
  assertYoutubeV71CredentialBinding,
  buildYoutubeV71CandidatePolicy,
  buildYoutubeV71PreparationManifest,
  writeYoutubeV71PreparationFiles,
} from "../scripts/lib/youtube-v71-worker-preparation.mjs";
import {
  createValidatedLocalMacMutationAuthority,
} from "./helpers/local-mac-production-release-fixtures";

const temporaryDirectories: string[] = [];
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function createTempDir(prefix: string) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  temporaryDirectories.push(directory);
  return directory;
}

function makeRemovable(path: string) {
  if (!existsSync(path)) return;
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) makeRemovable(join(path, entry.name));
  }
}

function writePrivate(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, contents, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function createCandidate(root: string) {
  const artifactDir = join(root, "artifact");
  const historicalRoot = join(root, "source-8e");
  mkdirSync(historicalRoot, { mode: 0o700 });
  const archive = execFileSync("git", ["archive", "--format=tar", YOUTUBE_V71_RELEASE_SHA,
    ...YOUTUBE_EXTRACTION_WORKER_REQUIRED_ARTIFACT_FILES, "lib/server/youtube-i031-runtime/bundle"], { maxBuffer: 16 * 1024 * 1024 });
  execFileSync("tar", ["-xf", "-", "-C", historicalRoot], { input: archive });
  const artifact = materializeYoutubeExtractionWorkerArtifact({
    rootDir: historicalRoot,
    outputDir: artifactDir,
    releaseSha: YOUTUBE_V71_RELEASE_SHA,
    releaseTree: YOUTUBE_V71_RELEASE_TREE,
    buildId: YOUTUBE_V71_BUILD_ID,
    promotionId: YOUTUBE_V71_PROMOTION_ID,
    schemaIdentity: YOUTUBE_V71_SCHEMA_IDENTITY,
    allowedSnapshotDigest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    policyVersion: YOUTUBE_V71_POLICY_VERSION,
    pipelineIdentity: YOUTUBE_V71_PIPELINE_IDENTITY,
  });
  const descriptor = buildYoutubeExtractionAppDescriptor({
    releaseSha: YOUTUBE_V71_RELEASE_SHA,
    schemaIdentity: YOUTUBE_V71_SCHEMA_IDENTITY,
    expectedPolicyVersion: YOUTUBE_V71_POLICY_VERSION,
    expectedPolicySnapshotDigest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    artifactSha256: artifact.manifest.artifact_sha256,
    expectedSchemaSha256: artifact.manifest.expected_schema_sha256,
  });
  const descriptorPath = join(root, "app-descriptor.json");
  writePrivate(descriptorPath, `${stableStringify(descriptor)}\n`);
  return { artifact, artifactDir, descriptorPath };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (!directory) continue;
    makeRemovable(directory);
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("YouTube v71 worker preparation", () => {
  it("seals the exact 8e artifact, descriptor, policy, and non-operational cutover plan", () => {
    const root = createTempDir("youtube-v71-preparation-");
    const candidate = createCandidate(root);
    const policyPath = join(root, "candidate-policy.json");
    const planPath = join(root, "preparation.json");
    const plan = writeYoutubeV71PreparationFiles({
      artifactManifestPath: candidate.artifact.manifest_path,
      appDescriptorPath: candidate.descriptorPath,
      candidatePolicyPath: policyPath,
      preparationManifestPath: planPath,
    });

    expect(candidate.artifact.manifest.artifact_sha256).toBe(YOUTUBE_V71_ARTIFACT_IDENTITY);
    expect(sha256(readFileSync(candidate.artifact.manifest_path))).toBe(
      YOUTUBE_V71_ARTIFACT_MANIFEST_FILE_SHA256,
    );
    expect(sha256(readFileSync(candidate.descriptorPath))).toBe(
      YOUTUBE_V71_APP_DESCRIPTOR_FILE_SHA256,
    );
    expect(candidate.artifact.manifest.expected_schema_sha256).toBe(
      YOUTUBE_V71_EXPECTED_SCHEMA_SHA256,
    );
    expect(plan).toMatchObject({
      production_mutation_authorized: false,
      production_state: {
        credential_created: false,
        credential_registered: false,
        policy_registered: false,
        queue_or_worker_changed: false,
      },
      candidate: {
        credential: { generation: 47, ttl_seconds: 518400, issued: false },
      },
      cutover_effects: {
        generation_46_invalid_immediately_after_registration: true,
        predecessor_plist_only_rollback_sufficient_after_registration: false,
      },
    });
    expect(buildYoutubeV71PreparationManifest({
      artifactManifestPath: candidate.artifact.manifest_path,
      appDescriptorPath: candidate.descriptorPath,
      candidatePolicyPath: policyPath,
    }).candidatePolicy).toEqual(buildYoutubeV71CandidatePolicy());
    expect(lstatSync(policyPath).mode & 0o777).toBe(0o600);
    expect(lstatSync(planPath).mode & 0o777).toBe(0o600);
    expect(() => writeYoutubeV71PreparationFiles({
      artifactManifestPath: candidate.artifact.manifest_path,
      appDescriptorPath: candidate.descriptorPath,
      candidatePolicyPath: policyPath,
      preparationManifestPath: planPath,
    })).toThrow(/already exists/iu);
  });

  it("requires the exact generation-47 binding and a six-day worker lifetime", () => {
    const issuedAt = 1_800_000_000;
    const claims = {
      role: "youtube_extraction_worker",
      scope: "youtube-extraction-worker",
      iss: "https://worker.mumeok.kr",
      aud: "youtube-extraction",
      generation: YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
      jti_hash: "a".repeat(64),
      release_sha: YOUTUBE_V71_RELEASE_SHA,
      schema_identity: YOUTUBE_V71_SCHEMA_IDENTITY,
      allowed_snapshot_digest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
      iat: issuedAt,
      exp: issuedAt + YOUTUBE_V71_CREDENTIAL_TTL_SECONDS,
    };
    const metadata = {
      generation: YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
      jti_sha256: claims.jti_hash,
      expires_at: new Date(claims.exp * 1_000).toISOString(),
      release_sha: YOUTUBE_V71_RELEASE_SHA,
      schema_identity: YOUTUBE_V71_SCHEMA_IDENTITY,
      allowed_snapshot_digest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    };
    expect(assertYoutubeV71CredentialBinding({ claims, metadata })).toBe(true);
    expect(() => assertYoutubeV71CredentialBinding({
      claims: { ...claims, generation: 46 },
      metadata,
    })).toThrow(/credential claim generation/iu);
    expect(() => assertYoutubeV71CredentialBinding({
      claims: { ...claims, exp: claims.exp + 1 },
      metadata,
    })).toThrow(/six-day lifetime/iu);
  });

  it("rejects a shared output path before creating either preparation file", () => {
    const root = createTempDir("youtube-v71-shared-output-");
    const candidate = createCandidate(root);
    const sharedPath = join(root, "shared.json");

    expect(() => writeYoutubeV71PreparationFiles({
      artifactManifestPath: candidate.artifact.manifest_path,
      appDescriptorPath: candidate.descriptorPath,
      candidatePolicyPath: sharedPath,
      preparationManifestPath: sharedPath,
    })).toThrow(/output paths must be distinct/iu);
    expect(existsSync(sharedPath)).toBe(false);
  });

  it("removes the policy file when the manifest create fails", () => {
    const root = createTempDir("youtube-v71-second-create-failure-");
    const candidate = createCandidate(root);
    const policyPath = join(root, "nested", "candidate-policy.json");
    const manifestPath = join(root, "nested");

    expect(() => writeYoutubeV71PreparationFiles({
      artifactManifestPath: candidate.artifact.manifest_path,
      appDescriptorPath: candidate.descriptorPath,
      candidatePolicyPath: policyPath,
      preparationManifestPath: manifestPath,
    })).toThrow();
    expect(existsSync(policyPath)).toBe(false);
  });

  it("installs the candidate in isolation and restores the predecessor plist on bootstrap failure", () => {
    const root = createTempDir("youtube-v71-install-");
    const homeDir = createTempDir("youtube-v71-home-");
    const secretRoot = createTempDir("youtube-v71-secrets-");
    const candidate = createCandidate(root);
    const policyPath = join(secretRoot, "policy.json");
    const tokenPath = join(secretRoot, "worker.jwt");
    const credentialPath = join(secretRoot, "credential.json");
    const configPath = join(secretRoot, "worker.env");
    writePrivate(policyPath, `${stableStringify(buildYoutubeV71CandidatePolicy())}\n`);
    writePrivate(tokenPath, "synthetic-isolated-token\n");
    writeCredentialMetadata(credentialPath, buildYoutubeExtractionWorkerCredentialState({
      tokenFile: tokenPath,
      generation: YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
      jtiHash: "b".repeat(64),
      expiresAt: new Date(Date.now() + YOUTUBE_V71_CREDENTIAL_TTL_SECONDS * 1_000).toISOString(),
      releaseSha: YOUTUBE_V71_RELEASE_SHA,
      schemaIdentity: YOUTUBE_V71_SCHEMA_IDENTITY,
      allowedSnapshotDigest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    }));
    writePrivate(configPath, [
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1",
      `HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE=${join(secretRoot, "provider.env")}`,
      "HOMECOOK_YOUTUBE_WORKER_RUNTIME_ROOT=/tmp/homecook-youtube-v71-isolated",
    ].join("\n"));
    writePrivate(join(secretRoot, "provider.env"), "YOUTUBE_API_KEY=isolated-fixture\n");
    const expectedSchemaPath = join(
      candidate.artifactDir,
      "scripts/manifests/youtube-extraction-expected-schema.json",
    );
    const releaseAuthorityPath = join(homeDir, "release-authority.json");
    const mutationAuthority = createValidatedLocalMacMutationAuthority({
      command: "install",
      homeDir,
      rootDir: candidate.artifactDir,
      lockToken: "77777777-7777-4777-8777-777777777777",
      manifestPath: releaseAuthorityPath,
    }).mutationAuthority;
    const plistPath = join(
      homeDir,
      "Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist",
    );
    writePrivate(plistPath, "predecessor-plist\n");
    const calls: string[] = [];

    const installed = installYoutubeExtractionWorkerLaunchAgent({
      mutationAuthority,
      configPath,
      manifestPath: candidate.artifact.manifest_path,
      credentialPath,
      appDescriptorPath: candidate.descriptorPath,
      currentPolicyPath: policyPath,
      expectedSchemaPath,
      secretRoot,
      homeDir,
      rootDir: candidate.artifactDir,
      i031Preflight: {
        ready: true,
        codexCliVersion: "0.154.0-alpha.6.2",
        chatGptLogin: true,
        toolsReady: true,
      },
      confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL",
      spawn: (_command: string, args: readonly string[]) => {
        calls.push(args.join(" "));
        if (args[0] === "print") {
          return { status: 0, stdout: "state = running\npid = 47\n", stderr: "" };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    expect(installed).toMatchObject({ changed: true, running: true, pid: 47 });
    expect(readFileSync(plistPath, "utf8")).toContain(
      candidate.artifact.entrypoint_path,
    );

    writePrivate(plistPath, "predecessor-plist\n");
    calls.length = 0;

    expect(() => installYoutubeExtractionWorkerLaunchAgent({
      mutationAuthority,
      configPath,
      manifestPath: candidate.artifact.manifest_path,
      credentialPath,
      appDescriptorPath: candidate.descriptorPath,
      currentPolicyPath: policyPath,
      expectedSchemaPath,
      secretRoot,
      homeDir,
      rootDir: candidate.artifactDir,
      i031Preflight: {
        ready: true,
        codexCliVersion: "0.154.0-alpha.6.2",
        chatGptLogin: true,
        toolsReady: true,
      },
      confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL",
      spawn: (_command: string, args: readonly string[]) => {
        calls.push(args.join(" "));
        if (args[0] === "bootstrap") {
          return { status: 1, stdout: "", stderr: "isolated bootstrap failure" };
        }
        if (args[0] === "print") {
          return { status: 1, stdout: "", stderr: "unloaded" };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    })).toThrow(/isolated bootstrap failure/iu);

    expect(readFileSync(plistPath, "utf8")).toBe("predecessor-plist\n");
    expect(lstatSync(plistPath).mode & 0o777).toBe(0o600);
    expect(calls.some((call) => call.startsWith("bootstrap "))).toBe(true);
    expect(calls.some((call) => call.startsWith("kickstart "))).toBe(false);
  });
});
