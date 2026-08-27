import {
  generateKeyPairSync,
  verify as verifySignature,
} from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildYoutubeExtractionAppDescriptor,
  buildYoutubeExtractionCurrentPolicy,
  buildYoutubeExtractionWorkerArtifactManifest,
  buildYoutubeExtractionWorkerQueueState,
  ensureAbsolutePath,
  materializeYoutubeExtractionWorkerArtifact,
  readYoutubeExtractionExpectedSchema,
  sha256File,
  sha256Text,
  stableStringify,
  verifyYoutubeExtractionWorkerArtifact,
  YOUTUBE_EXTRACTION_RUNTIME_BUNDLE_REQUIRED_FILES,
  YOUTUBE_EXTRACTION_WORKER_LABEL,
  YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
} from "../scripts/lib/youtube-extraction-worker-artifact.mjs";
import {
  buildYoutubeExtractionWorkerCredentialState,
  buildYoutubeExtractionWorkerDrainPlan,
  buildYoutubeExtractionWorkerHealth,
  buildYoutubeExtractionWorkerInstallPlan,
  buildYoutubeExtractionWorkerLifecyclePlan,
  buildYoutubeExtractionWorkerRollbackPlan,
  evaluateYoutubeExtractionWorkerPreflight,
  installYoutubeExtractionWorkerLaunchAgent,
  parseLaunchctlPrintStatus,
  readYoutubeExtractionWorkerCredential,
  renderYoutubeExtractionWorkerPlist,
  rotateYoutubeExtractionWorkerCredential,
  validateYoutubeExtractionWorkerConfigPath,
  validateYoutubeExtractionWorkerSecretFile,
  validateYoutubeExtractionWorkerSecretRoot,
  writeCredentialMetadata,
} from "../scripts/lib/youtube-extraction-worker-ops.mjs";
import {
  issueYoutubeExtractionWorkerCredential,
} from "../scripts/lib/youtube-extraction-worker-local-credential.mjs";
import {
  createValidatedLocalMacMutationAuthority,
} from "./helpers/local-mac-production-release-fixtures";

const tempDirs: string[] = [];
const GREEN_I031_PREFLIGHT = Object.freeze({
  ready: true,
  codexCliVersion: "0.144.0-alpha.4",
  chatGptLogin: true,
  toolsReady: true,
});
function createReleaseAuthority({
  homeDir,
  rootDir,
  manifestPath,
}: {
  homeDir: string;
  rootDir: string;
  manifestPath: string;
}) {
  return createValidatedLocalMacMutationAuthority({
    command: "install",
    homeDir,
    rootDir,
    lockToken: "66666666-6666-4666-8666-666666666666",
    manifestPath,
  }).mutationAuthority;
}

function futureIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function createTempDir(prefix: string) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  tempDirs.push(directory);
  return directory;
}

function writeModeFile(path: string, contents: string, mode = 0o600) {
  writeFileSync(path, contents, { encoding: "utf8", mode });
  chmodSync(path, mode);
}

function makeRemovable(path: string) {
  if (!existsSync(path)) return;
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) makeRemovable(join(path, entry.name));
  }
}

function createReleaseInputs(privateDir: string, {
  releaseSha = "0123456789abcdef0123456789abcdef01234567",
  digest = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  enabled = true,
  rootDir = process.cwd(),
} = {}) {
  const tokenPath = join(privateDir, "worker.jwt");
  const credentialPath = join(privateDir, "credential.json");
  const appPath = join(privateDir, "app.json");
  const policyPath = join(privateDir, "policy.json");
  const artifactDir = join(createTempDir("yta-worker-release-parent-"), "worker-release");
  writeModeFile(tokenPath, "worker-token\n");
  const materialized = materializeYoutubeExtractionWorkerArtifact({
    rootDir,
    outputDir: artifactDir,
    releaseSha,
    schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
    allowedSnapshotDigest: digest,
  });
  writeModeFile(appPath, JSON.stringify(buildYoutubeExtractionAppDescriptor({
    releaseSha,
    schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
    expectedPolicyVersion: 1,
    expectedPolicySnapshotDigest: digest,
    artifactSha256: materialized.manifest.artifact_sha256,
    expectedSchemaSha256: materialized.manifest.expected_schema_sha256,
  })));
  writeModeFile(policyPath, JSON.stringify(buildYoutubeExtractionCurrentPolicy({
    policySnapshotDigest: digest,
    enabled,
  })));
  writeCredentialMetadata(credentialPath, buildYoutubeExtractionWorkerCredentialState({
    tokenFile: tokenPath,
    generation: 1,
    jtiHash: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    releaseSha,
    schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
    allowedSnapshotDigest: digest,
  }));
  return {
    appPath,
    artifactDir,
    credentialPath,
    digest,
    expectedSchemaPath: join(
      artifactDir,
      "scripts/manifests/youtube-extraction-expected-schema.json",
    ),
    manifestPath: materialized.manifest_path,
    policyPath,
    releaseSha,
    tokenPath,
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      makeRemovable(directory);
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("YTASYNC-OPS deterministic artifact", () => {
  it("issues an exact ES256 local-only worker credential with a bounded lifetime", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const privateJwk = privateKey.export({ format: "jwk" });
    const issued = issueYoutubeExtractionWorkerCredential({
      jwtKeys: [{
        ...privateJwk,
        alg: "ES256",
        kid: "local-worker-signing-key",
        use: "sig",
      }],
      generation: 2,
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: "youtube-extraction-worker-schema-v1",
      allowedSnapshotDigest: "a".repeat(64),
      now: new Date("2026-08-14T12:00:00.000Z"),
      ttlSeconds: 6 * 24 * 60 * 60,
      jti: "worker-jti-test-value",
    });
    const [headerPart, claimsPart, signaturePart] = issued.token.split(".");
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(claimsPart, "base64url").toString("utf8"));

    expect(header).toEqual({
      alg: "ES256",
      kid: "local-worker-signing-key",
      typ: "JWT",
    });
    expect(claims).toMatchObject({
      role: "youtube_extraction_worker",
      scope: "youtube-extraction-worker",
      iss: "https://worker.mumeok.kr",
      aud: "youtube-extraction",
      generation: 2,
      release_sha: "0123456789abcdef0123456789abcdef01234567",
      schema_identity: "youtube-extraction-worker-schema-v1",
      allowed_snapshot_digest: "a".repeat(64),
      jti_hash: issued.jtiHash,
    });
    expect(claims.exp - claims.iat).toBe(6 * 24 * 60 * 60);
    expect(verifySignature(
      "SHA256",
      Buffer.from(`${headerPart}.${claimsPart}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signaturePart, "base64url"),
    )).toBe(true);
    expect(JSON.stringify(issued.metadata)).not.toContain(issued.token);

    expect(() => issueYoutubeExtractionWorkerCredential({
      jwtKeys: [{ ...privateJwk, alg: "ES256", kid: "local-worker-signing-key" }],
      generation: 2,
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: "youtube-extraction-worker-schema-v1",
      allowedSnapshotDigest: "a".repeat(64),
      now: new Date("2026-08-14T12:00:00.000Z"),
      ttlSeconds: (7 * 24 * 60 * 60) + 1,
    })).toThrow(/7 days/iu);
  });

  it("materializes a local worker credential as create-only mode-0600 files without printing the JWT", () => {
    const privateDir = createTempDir("yta-local-credential-");
    const signingDir = createTempDir("yta-local-signing-");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwtKeysPath = join(signingDir, "jwt_keys");
    const tokenPath = join(privateDir, "worker.jwt");
    const metadataPath = join(privateDir, "credential.json");
    writeModeFile(jwtKeysPath, JSON.stringify([{
      ...privateKey.export({ format: "jwk" }),
      alg: "ES256",
      kid: "local-worker-signing-key",
      use: "sig",
    }]));

    const credentialCliPath = join(
      process.cwd(),
      "scripts/youtube-extraction-worker-local-credential.mjs",
    );
    const baseArgs = [
      credentialCliPath,
      "issue",
      "--jwt-keys-file", jwtKeysPath,
      "--secret-root", privateDir,
      "--token-file", tokenPath,
      "--metadata-output", metadataPath,
      "--generation", "2",
      "--release-sha", "0123456789abcdef0123456789abcdef01234567",
      "--schema-identity", "youtube-extraction-worker-schema-v1",
      "--allowed-snapshot-digest", "a".repeat(64),
      "--ttl-seconds", String(6 * 24 * 60 * 60),
    ];
    const denied = spawnSync(process.execPath, [
      ...baseArgs,
      "--confirm-production", "wrong",
    ], { cwd: process.cwd(), encoding: "utf8" });
    expect(denied.status).toBe(1);
    expect(denied.stderr).toMatch(/confirmation/iu);
    expect(existsSync(tokenPath)).toBe(false);

    const repoKeyDir = realpathSync(mkdtempSync(join(process.cwd(), ".yta-repo-key-")));
    tempDirs.push(repoKeyDir);
    const repoJwtKeysPath = join(repoKeyDir, "jwt_keys");
    writeModeFile(repoJwtKeysPath, readFileSync(jwtKeysPath, "utf8"));
    const repoKeyDenied = spawnSync(process.execPath, [
      ...baseArgs.map((value) => value === jwtKeysPath ? repoJwtKeysPath : value),
      "--confirm-production", "LOCAL_FULL_PRODUCTION_WORKER_CREDENTIAL",
    ], { cwd: process.cwd(), encoding: "utf8" });
    expect(repoKeyDenied.status).toBe(1);
    expect(repoKeyDenied.stderr).toMatch(/repository/iu);
    expect(existsSync(tokenPath)).toBe(false);

    const repoLinkParent = realpathSync(mkdtempSync(join(process.cwd(), ".yta-repo-link-")));
    tempDirs.push(repoLinkParent);
    const repoLinkedSigningDir = join(repoLinkParent, "external-signing-dir");
    symlinkSync(signingDir, repoLinkedSigningDir, "dir");
    const repoLinkedKeyDenied = spawnSync(process.execPath, [
      ...baseArgs.map((value) => value === jwtKeysPath
        ? join(repoLinkedSigningDir, "jwt_keys")
        : value),
      "--confirm-production", "LOCAL_FULL_PRODUCTION_WORKER_CREDENTIAL",
    ], { cwd: process.cwd(), encoding: "utf8" });
    expect(repoLinkedKeyDenied.status).toBe(1);
    expect(repoLinkedKeyDenied.stderr).toMatch(/symbolic link|repository/iu);
    expect(existsSync(tokenPath)).toBe(false);

    const outsideCwdKeyDenied = spawnSync(process.execPath, [
      ...baseArgs.map((value) => value === jwtKeysPath ? repoJwtKeysPath : value),
      "--confirm-production", "LOCAL_FULL_PRODUCTION_WORKER_CREDENTIAL",
    ], { cwd: signingDir, encoding: "utf8" });
    expect(outsideCwdKeyDenied.status).toBe(1);
    expect(outsideCwdKeyDenied.stderr).toMatch(/repository/iu);
    expect(existsSync(tokenPath)).toBe(false);

    const issued = spawnSync(process.execPath, [
      ...baseArgs,
      "--confirm-production", "LOCAL_FULL_PRODUCTION_WORKER_CREDENTIAL",
    ], { cwd: process.cwd(), encoding: "utf8" });
    expect(issued.status, issued.stderr).toBe(0);
    const result = JSON.parse(issued.stdout);
    const token = readFileSync(tokenPath, "utf8").trim();
    expect(result).toMatchObject({ issued: true, generation: 2 });
    expect(issued.stdout).not.toContain(token);
    expect((lstatSync(tokenPath).mode & 0o777)).toBe(0o600);
    expect((lstatSync(metadataPath).mode & 0o777)).toBe(0o600);
    expect(readYoutubeExtractionWorkerCredential(metadataPath, {
      secretRoot: privateDir,
    })).toMatchObject({ generation: 2, token_file: tokenPath });

    const repeated = spawnSync(process.execPath, [
      ...baseArgs,
      "--confirm-production", "LOCAL_FULL_PRODUCTION_WORKER_CREDENTIAL",
    ], { cwd: process.cwd(), encoding: "utf8" });
    expect(repeated.status).toBe(1);
    expect(repeated.stderr).toMatch(/already exists|create-only/iu);
  });

  it("installs the worker LaunchAgent atomically only after an explicit local-production confirmation", () => {
    const homeDir = createTempDir("yta-worker-home-");
    const privateDir = createTempDir("yta-worker-private-");
    const release = createReleaseInputs(privateDir);
    const manifestPath = join(homeDir, "release.json");
    const mutationAuthority = createReleaseAuthority({
      homeDir,
      rootDir: release.artifactDir,
      manifestPath,
    });
    const configPath = join(privateDir, "worker.env");
    writeModeFile(configPath, [
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1",
      `HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE=${join(privateDir, "provider.env")}`,
      "HOMECOOK_YOUTUBE_WORKER_RUNTIME_ROOT=/tmp/homecook-youtube-worker",
    ].join("\n"));
    writeModeFile(join(privateDir, "provider.env"), "YOUTUBE_API_KEY=test-provider-key\n");
    const calls: string[] = [];

    expect(() => installYoutubeExtractionWorkerLaunchAgent({
      mutationAuthority,
      configPath,
      manifestPath: release.manifestPath,
      credentialPath: release.credentialPath,
      appDescriptorPath: release.appPath,
      currentPolicyPath: release.policyPath,
      expectedSchemaPath: release.expectedSchemaPath,
      secretRoot: privateDir,
      homeDir,
      rootDir: release.artifactDir,
      i031Preflight: GREEN_I031_PREFLIGHT,
      confirmation: "wrong",
      spawn: () => ({ status: 0, stdout: "", stderr: "" }),
    })).toThrow(/confirmation/iu);

    const installed = installYoutubeExtractionWorkerLaunchAgent({
      mutationAuthority,
      configPath,
      manifestPath: release.manifestPath,
      credentialPath: release.credentialPath,
      appDescriptorPath: release.appPath,
      currentPolicyPath: release.policyPath,
      expectedSchemaPath: release.expectedSchemaPath,
      secretRoot: privateDir,
      homeDir,
      rootDir: release.artifactDir,
      i031Preflight: GREEN_I031_PREFLIGHT,
      confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL",
      spawn: (_command, args) => {
        calls.push(args.join(" "));
        if (args[0] === "print") {
          return { status: 0, stdout: "state = running\npid = 123\n", stderr: "" };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    expect(installed).toMatchObject({ changed: true, running: true, pid: 123 });
    expect(readFileSync(installed.plist_path, "utf8")).toContain(
      "com.homecook.youtube-extraction-worker",
    );
    expect((lstatSync(installed.plist_path).mode & 0o777)).toBe(0o600);
    expect(calls).toEqual(expect.arrayContaining([
      expect.stringContaining("bootstrap"),
      expect.stringContaining("kickstart -k"),
      expect.stringContaining("print"),
    ]));
  });

  it("restores the previous worker plist when a replacement bootstrap fails", () => {
    const homeDir = createTempDir("yta-worker-rollback-home-");
    const privateDir = createTempDir("yta-worker-rollback-private-");
    const release = createReleaseInputs(privateDir);
    const mutationAuthority = createReleaseAuthority({
      homeDir,
      rootDir: release.artifactDir,
      manifestPath: join(homeDir, "release.json"),
    });
    const configPath = join(privateDir, "worker.env");
    writeModeFile(configPath, [
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1",
      `HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE=${join(privateDir, "provider.env")}`,
      "HOMECOOK_YOUTUBE_WORKER_RUNTIME_ROOT=/tmp/homecook-youtube-worker",
    ].join("\n"));
    writeModeFile(join(privateDir, "provider.env"), "YOUTUBE_API_KEY=test-provider-key\n");
    const plistPath = join(
      homeDir,
      "Library",
      "LaunchAgents",
      "com.homecook.youtube-extraction-worker.plist",
    );
    mkdirSync(dirname(plistPath), { recursive: true });
    writeModeFile(plistPath, "previous-plist\n");
    const launchctlCalls: string[] = [];

    expect(() => installYoutubeExtractionWorkerLaunchAgent({
      mutationAuthority,
      configPath,
      manifestPath: release.manifestPath,
      credentialPath: release.credentialPath,
      appDescriptorPath: release.appPath,
      currentPolicyPath: release.policyPath,
      expectedSchemaPath: release.expectedSchemaPath,
      secretRoot: privateDir,
      homeDir,
      rootDir: release.artifactDir,
      i031Preflight: GREEN_I031_PREFLIGHT,
      confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL",
      spawn: (_command, args) => {
        launchctlCalls.push(args.join(" "));
        return {
          status: args[0] === "bootstrap" || args[0] === "print" ? 1 : 0,
          stdout: "",
          stderr: args[0] === "bootstrap" ? "bootstrap failed" : "unloaded",
        };
      },
    })).toThrow(/bootstrap failed/iu);

    expect(readFileSync(plistPath, "utf8")).toBe("previous-plist\n");
    expect((lstatSync(plistPath).mode & 0o777)).toBe(0o600);
    expect(launchctlCalls.filter((call) => call.startsWith("bootstrap "))).toHaveLength(1);
    expect(launchctlCalls.some((call) => call.startsWith("kickstart "))).toBe(false);
  });

  it("blocks the direct install helper before launchctl when no validated authority is provided", () => {
    const homeDir = createTempDir("yta-worker-no-authority-home-");
    const privateDir = createTempDir("yta-worker-no-authority-private-");
    const release = createReleaseInputs(privateDir);
    const configPath = join(privateDir, "worker.env");
    writeModeFile(configPath, [
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1",
      `HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE=${join(privateDir, "provider.env")}`,
      "HOMECOOK_YOUTUBE_WORKER_RUNTIME_ROOT=/tmp/homecook-youtube-worker",
    ].join("\n"));
    writeModeFile(join(privateDir, "provider.env"), "YOUTUBE_API_KEY=test-provider-key\n");
    const calls: string[] = [];

    expect(() => installYoutubeExtractionWorkerLaunchAgent({
      configPath,
      manifestPath: release.manifestPath,
      credentialPath: release.credentialPath,
      appDescriptorPath: release.appPath,
      currentPolicyPath: release.policyPath,
      expectedSchemaPath: release.expectedSchemaPath,
      secretRoot: privateDir,
      homeDir,
      rootDir: release.artifactDir,
      i031Preflight: GREEN_I031_PREFLIGHT,
      confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL",
      spawn: (_command, args) => {
        calls.push(args.join(" "));
        return { status: 0, stdout: "", stderr: "" };
      },
    })).toThrow(/validated release authority|release authority|--release-manifest/iu);

    expect(calls).toEqual([]);
  });

  it("rejects relative paths instead of silently resolving them against cwd", () => {
    expect(() => ensureAbsolutePath("relative/worker.json", "workerArtifactPath"))
      .toThrow(/absolute path/i);
  });

  it("builds the same manifest for the same repo state and exact attestation inputs", () => {
    const manifestA = buildYoutubeExtractionWorkerArtifactManifest({
      rootDir: process.cwd(),
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    const manifestB = buildYoutubeExtractionWorkerArtifactManifest({
      rootDir: process.cwd(),
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });

    expect(manifestA).toEqual(manifestB);
    expect(manifestA.files.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      "lib/server/youtube-i031-runtime/bundle/manifest.json",
      "lib/server/youtube-i031-runtime/bundle/worker.mjs",
      "scripts/lib/local-mac-production-release.mjs",
      "scripts/lib/production-release-approval-policy.mjs",
      "scripts/lib/youtube-extraction-worker-artifact.mjs",
      "scripts/lib/youtube-extraction-worker-ops.mjs",
      "scripts/lib/youtube-extraction-worker-runtime.mjs",
      "scripts/manifests/youtube-extraction-expected-schema.json",
      "scripts/youtube-extraction-worker-runner.mjs",
    ]));
    expect(manifestA.artifact_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(manifestA).toMatchObject({
      lease_seconds: 300,
      heartbeat_interval_seconds: 30,
    });
    expect(manifestA.expected_schema_sha256).toBe(sha256File(
      join(process.cwd(), "scripts/manifests/youtube-extraction-expected-schema.json"),
    ));
    const app = buildYoutubeExtractionAppDescriptor({
      releaseSha: manifestA.release_sha,
      schemaIdentity: manifestA.schema_identity,
      expectedPolicyVersion: manifestA.policy_version,
      expectedPolicySnapshotDigest: manifestA.allowed_snapshot_digest,
      artifactSha256: manifestA.artifact_sha256,
      expectedSchemaSha256: manifestA.expected_schema_sha256,
    });
    expect(app).toMatchObject({
      artifact_sha256: manifestA.artifact_sha256,
      expected_schema_sha256: manifestA.expected_schema_sha256,
    });
  });

  it("rejects duplicate and incomplete expected-schema authority inventories", () => {
    const privateDir = createTempDir("yta-expected-schema-invalid-");
    const schemaPath = join(privateDir, "expected-schema.json");
    const canonicalPath = join(
      process.cwd(),
      "scripts/manifests/youtube-extraction-expected-schema.json",
    );
    const valid = JSON.parse(readFileSync(
      canonicalPath,
      "utf8",
    ));
    expect(readYoutubeExtractionExpectedSchema(canonicalPath)).toMatchObject({
      catalog_fingerprint_components: expect.arrayContaining([
        "columns",
        "constraints",
        "indexes",
        "table_owners",
        "sequence_owners",
        "schema_owners",
        "owner_role_attributes",
        "memberships",
        "rpc_function_definitions",
        "shared_dependency_contract",
        "internal_scope_function_definition",
      ]),
      fence_function_signatures: expect.arrayContaining([
        "private.youtube_extraction_worker_write_fence_is_active(uuid,text,bigint,bigint)",
      ]),
      internal_scope_function_signature:
        "private.youtube_extraction_internal_scope_contract_v1()",
      shared_dependency_contract_function_signature:
        "private.youtube_extraction_shared_dependency_contract_v1()",
      memberships: [
        {
          member: "authenticator",
          role: "youtube_extraction_credential_manager",
          admin: false,
          inherit: false,
          set: true,
        },
        {
          member: "authenticator",
          role: "youtube_extraction_worker",
          admin: false,
          inherit: false,
          set: true,
        },
      ],
    });
    const duplicate = JSON.stringify(valid).replace(
      '"memberships":',
      '"memberships": [], "memberships":',
    );
    writeModeFile(schemaPath, duplicate);
    expect(() => readYoutubeExtractionExpectedSchema(schemaPath))
      .toThrow(/duplicate json key/i);

    const incomplete = {
      ...valid,
      catalog_fingerprint_components: valid.catalog_fingerprint_components.filter(
        (component: string) => component !== "owner_role_attributes",
      ),
      memberships: [{
        member: "authenticator",
        role: "youtube_extraction_worker",
        admin: false,
      }],
    };
    writeModeFile(schemaPath, JSON.stringify(incomplete));
    expect(() => readYoutubeExtractionExpectedSchema(schemaPath))
      .toThrow(/expected schema manifest is invalid/i);
  });

  it("rejects self-consistent shortened artifacts that omit canonical required files", () => {
    expect(() => buildYoutubeExtractionWorkerArtifactManifest({
      rootDir: process.cwd(),
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      includedPaths: [
        "scripts/youtube-extraction-worker-runner.mjs",
        "scripts/manifests/youtube-extraction-expected-schema.json",
        "scripts/templates/com.homecook.youtube-extraction-worker.plist.template",
      ],
    }))
      .toThrow(/required file is missing/i);
  });

  it("rejects a self-consistent artifact that drifts from the frozen timing contract", () => {
    const privateDir = createTempDir("yta-artifact-timing-drift-private-");
    const inputs = createReleaseInputs(privateDir);
    const manifestPath = inputs.manifestPath;
    const original = JSON.parse(readFileSync(manifestPath, "utf8"));
    const driftedBase = {
      ...original,
      lease_seconds: 120,
      artifact_sha256: undefined,
    };
    chmodSync(manifestPath, 0o600);
    writeModeFile(manifestPath, `${JSON.stringify({
      ...driftedBase,
      artifact_sha256: sha256Text(stableStringify(driftedBase)),
    }, null, 2)}\n`, 0o444);

    expect(() => verifyYoutubeExtractionWorkerArtifact(manifestPath))
      .toThrow(/timing contract is invalid/i);
  });

  it("rejects a self-consistent artifact that shortens the declared runtime bundle closure", () => {
    const privateDir = createTempDir("yta-short-runtime-bundle-private-");
    const inputs = createReleaseInputs(privateDir);
    const manifestPath = inputs.manifestPath;
    const bundleManifestRelativePath =
      "lib/server/youtube-i031-runtime/bundle/manifest.json";
    const omittedInnerPath = "lib/server/recipe-extraction-lab/extract.mjs";
    const omittedOuterPath =
      `lib/server/youtube-i031-runtime/bundle/${omittedInnerPath}`;
    const bundleManifestPath = join(inputs.artifactDir, bundleManifestRelativePath);
    const omittedMaterializedPath = join(inputs.artifactDir, omittedOuterPath);
    const bundleManifest = JSON.parse(readFileSync(bundleManifestPath, "utf8"));
    delete bundleManifest.files[omittedInnerPath];
    chmodSync(bundleManifestPath, 0o600);
    writeModeFile(bundleManifestPath, `${JSON.stringify(bundleManifest, null, 2)}\n`, 0o444);
    makeRemovable(join(
      inputs.artifactDir,
      "lib/server/youtube-i031-runtime/bundle/lib/server/recipe-extraction-lab",
    ));
    chmodSync(omittedMaterializedPath, 0o600);
    unlinkSync(omittedMaterializedPath);

    const outerManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const shortenedFiles = outerManifest.files
      .filter((file: { path: string }) => file.path !== omittedOuterPath)
      .map((file: { path: string; sha256: string }) => file.path === bundleManifestRelativePath
        ? { ...file, sha256: sha256File(bundleManifestPath) }
        : file);
    const shortenedBase = {
      ...outerManifest,
      files: shortenedFiles,
    };
    delete shortenedBase.artifact_sha256;
    chmodSync(manifestPath, 0o600);
    writeModeFile(manifestPath, `${JSON.stringify({
      ...shortenedBase,
      artifact_sha256: sha256Text(stableStringify(shortenedBase)),
    }, null, 2)}\n`, 0o444);

    expect(() => verifyYoutubeExtractionWorkerArtifact(manifestPath))
      .toThrow(/runtime bundle.*closure|required runtime bundle file/iu);
  });

  it("rejects artifacts whose entrypoint or launchd template path is not attested by the inventory", () => {
    const privateDir = createTempDir("yta-artifact-path-drift-private-");
    const inputs = createReleaseInputs(privateDir);
    const manifestPath = join(inputs.artifactDir, "artifact.json");
    const original = JSON.parse(readFileSync(manifestPath, "utf8"));

    const withEntrypointDrift = {
      ...original,
      entrypoint_relative_path: "scripts/lib/youtube-extraction-worker-runtime.mjs",
    };
    const entrypointBase = {
      ...withEntrypointDrift,
      artifact_sha256: undefined,
    };
    chmodSync(manifestPath, 0o600);
    writeModeFile(
      manifestPath,
      `${JSON.stringify({
        ...withEntrypointDrift,
        artifact_sha256: sha256Text(stableStringify(entrypointBase)),
      }, null, 2)}\n`,
      0o444,
    );
    expect(() => verifyYoutubeExtractionWorkerArtifact(manifestPath))
      .toThrow(/entrypoint relative path is invalid/i);

    const withLaunchdDrift = {
      ...original,
      launchd_template_relative_path: "scripts/lib/youtube-extraction-worker-runtime.mjs",
    };
    const launchdBase = {
      ...withLaunchdDrift,
      artifact_sha256: undefined,
    };
    chmodSync(manifestPath, 0o600);
    writeModeFile(
      manifestPath,
      `${JSON.stringify({
        ...withLaunchdDrift,
        artifact_sha256: sha256Text(stableStringify(launchdBase)),
      }, null, 2)}\n`,
      0o444,
    );
    expect(() => verifyYoutubeExtractionWorkerArtifact(manifestPath))
      .toThrow(/launchd template relative path is invalid/i);
  });
});

describe("YTASYNC-OPS launchd contract", () => {
  it("requires an external 0700 worker secret root and rejects symlink ancestors", () => {
    const sandbox = createTempDir("yta-worker-secret-root-");
    const simulatedRepo = join(sandbox, "repo");
    const externalRoot = join(sandbox, "secrets");
    mkdirSync(simulatedRepo, { mode: 0o700 });
    mkdirSync(externalRoot, { mode: 0o700 });

    expect(() => validateYoutubeExtractionWorkerSecretRoot(simulatedRepo, {
      repoRoot: simulatedRepo,
    })).toThrow(/outside.*repository/iu);

    chmodSync(externalRoot, 0o755);
    expect(() => validateYoutubeExtractionWorkerSecretRoot(externalRoot, {
      repoRoot: simulatedRepo,
    })).toThrow(/mode 0700/iu);
    chmodSync(externalRoot, 0o700);

    const realParent = join(externalRoot, "real-parent");
    const linkedParent = join(externalRoot, "linked-parent");
    mkdirSync(realParent, { mode: 0o700 });
    symlinkSync(realParent, linkedParent);
    const secretPath = join(realParent, "provider.env");
    writeModeFile(secretPath, "YOUTUBE_API_KEY=fixture-key\n");

    expect(() => validateYoutubeExtractionWorkerSecretFile(
      join(linkedParent, "provider.env"),
      { secretRoot: externalRoot, repoRoot: simulatedRepo },
    )).toThrow(/symbolic link ancestor/iu);
    expect(validateYoutubeExtractionWorkerSecretFile(secretPath, {
      secretRoot: externalRoot,
      repoRoot: simulatedRepo,
    })).toBe(realpathSync(secretPath));
  });

  it("rejects a worker secret root reached through any lexical parent symlink", () => {
    const sandbox = createTempDir("yta-worker-secret-root-parent-link-");
    const simulatedRepo = join(sandbox, "repo");
    const realParent = join(sandbox, "real-parent");
    const linkedParent = join(sandbox, "linked-parent");
    const realSecretRoot = join(realParent, "secrets");
    mkdirSync(simulatedRepo, { mode: 0o700 });
    mkdirSync(realParent, { mode: 0o700 });
    mkdirSync(realSecretRoot, { mode: 0o700 });
    symlinkSync(realParent, linkedParent);

    expect(() => validateYoutubeExtractionWorkerSecretRoot(
      join(linkedParent, "secrets"),
      { repoRoot: simulatedRepo },
    )).toThrow(/symbolic link ancestor/iu);
  });

  it("rejects symlinked or wrong-owner secret inputs and returns canonical paths", () => {
    const privateDir = createTempDir("yta-worker-secret-provenance-");
    const configPath = join(privateDir, ".env.production.local");
    const configLink = join(privateDir, "config-link");
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );
    symlinkSync(configPath, configLink);

    expect(() => validateYoutubeExtractionWorkerConfigPath(configLink))
      .toThrow(/symbolic link/iu);
    expect(() => validateYoutubeExtractionWorkerSecretFile(configPath, {
      expectedUserId: (process.getuid?.() ?? 0) + 1,
    })).toThrow(/owner/iu);
    expect(validateYoutubeExtractionWorkerSecretFile(configPath))
      .toBe(realpathSync(configPath));

    const inputs = createReleaseInputs(privateDir);
    const credentialLink = join(privateDir, "credential-link.json");
    symlinkSync(inputs.credentialPath, credentialLink);
    expect(() => readYoutubeExtractionWorkerCredential(credentialLink))
      .toThrow(/symbolic link/iu);
  });

  it.each(["symlink", "0644"] as const)(
    "rejects a %s provider secret before reading it or invoking i031 commands",
    (provenance) => {
      const privateDir = createTempDir(`yta-worker-provider-${provenance}-`);
      const inputs = createReleaseInputs(privateDir);
      const homeDir = join(privateDir, "worker-home");
      const authDir = join(homeDir, ".codex");
      const configPath = join(privateDir, ".env.production.local");
      const providerTarget = join(privateDir, "provider.env");
      const providerPath = provenance === "symlink"
        ? join(privateDir, "provider-link.env")
        : providerTarget;
      const commandMarker = join(privateDir, "codex-invoked");
      const codexBin = join(privateDir, "fake-codex");
      mkdirSync(authDir, { recursive: true });
      writeModeFile(join(authDir, "auth.json"), "{}\n");
      writeModeFile(codexBin, [
        "#!/bin/sh",
        `touch ${JSON.stringify(commandMarker)}`,
        "if [ \"$1\" = \"--version\" ]; then echo 'codex 0.144.0-alpha.4'; else echo 'Logged in using ChatGPT'; fi",
        "",
      ].join("\n"), 0o700);
      writeModeFile(providerTarget, [
        "YOUTUBE_API_KEY=fixture-key",
        `YOUTUBE_I031_CODEX_BIN=${codexBin}`,
        "",
      ].join("\n"), provenance === "0644" ? 0o644 : 0o600);
      if (provenance === "symlink") symlinkSync(providerTarget, providerPath);
      writeModeFile(configPath, [
        "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1",
        `HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE=${providerPath}`,
        "HOMECOOK_YOUTUBE_WORKER_ID=fixture-worker",
        "",
      ].join("\n"));

      const result = spawnSync(process.execPath, [
        "scripts/youtube-extraction-worker-mac-production.mjs",
        "preflight",
        "--secret-root", privateDir,
        "--config", configPath,
        "--manifest", inputs.manifestPath,
        "--credential", inputs.credentialPath,
        "--app-descriptor", inputs.appPath,
        "--policy", inputs.policyPath,
        "--expected-schema", inputs.expectedSchemaPath,
        "--home-dir", homeDir,
        "--user-id", String(process.getuid?.() ?? 0),
      ], { cwd: process.cwd(), encoding: "utf8" });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(provenance === "symlink" ? /symbolic link/iu : /mode/iu);
      expect(existsSync(commandMarker)).toBe(false);
    },
  );

  it("renders a plist that runs the worker via env -i and never embeds token contents", () => {
    const homeDir = createTempDir("yta-worker-home-");
    const privateDir = createTempDir("yta-worker-private-");
    const configPath = join(privateDir, ".env.production.local");
    const inputs = createReleaseInputs(privateDir);

    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );
    const plist = renderYoutubeExtractionWorkerPlist({
      configPath,
      manifestPath: inputs.manifestPath,
      credentialPath: inputs.credentialPath,
      appDescriptorPath: inputs.appPath,
      currentPolicyPath: inputs.policyPath,
      expectedSchemaPath: inputs.expectedSchemaPath,
      secretRoot: privateDir,
      homeDir,
      nodeBin: "/opt/homebrew/bin/node",
      rootDir: inputs.artifactDir,
    });

    expect(plist).toContain(`<string>${YOUTUBE_EXTRACTION_WORKER_LABEL}</string>`);
    expect(plist).toContain("<string>/usr/bin/env</string>");
    expect(plist).toContain("<string>-i</string>");
    expect(plist).toContain(`<string>HOME=${homeDir}</string>`);
    expect(plist).toContain("<string>/opt/homebrew/bin/node</string>");
    expect(plist).toContain("<string>run</string>");
    expect(plist).toContain("<string>--secret-root</string>");
    expect(plist).toContain(`<string>${realpathSync(privateDir)}</string>`);
    expect(plist).toContain(`<string>${realpathSync(configPath)}</string>`);
    expect(plist).toContain(`<string>${realpathSync(inputs.manifestPath)}</string>`);
    expect(plist).toContain(`<string>${realpathSync(inputs.credentialPath)}</string>`);
    expect(plist).not.toContain("worker-token");
    expect(plist).not.toContain("HOMECOOK_YOUTUBE_WORKER_DATA_API_URL");
    expect(plist).not.toContain("<key>EnvironmentVariables</key>");
  });

  it("builds install and lifecycle plans only in dry-run mode", () => {
    const privateDir = createTempDir("yta-worker-lifecycle-");
    const configPath = join(privateDir, ".env.production.local");
    const inputs = createReleaseInputs(privateDir);
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );
    const installPlan = buildYoutubeExtractionWorkerInstallPlan({
      configPath,
      manifestPath: inputs.manifestPath,
      credentialPath: inputs.credentialPath,
      appDescriptorPath: inputs.appPath,
      currentPolicyPath: inputs.policyPath,
      expectedSchemaPath: inputs.expectedSchemaPath,
      secretRoot: privateDir,
      homeDir: "/Users/tester",
      rootDir: inputs.artifactDir,
      nodeBin: "/usr/bin/node",
      userId: 501,
      dryRun: true,
      i031Preflight: GREEN_I031_PREFLIGHT,
    });
    expect(installPlan.commands).toHaveLength(2);
    expect(installPlan.preflight.ready).toBe(true);
    expect(installPlan.service_target).toBe(
      "gui/501/com.homecook.youtube-extraction-worker",
    );

    const restartPlan = buildYoutubeExtractionWorkerLifecyclePlan({
      action: "restart",
      homeDir: "/Users/tester",
      userId: 501,
      dryRun: true,
      i031Preflight: GREEN_I031_PREFLIGHT,
    });
    expect(restartPlan.commands).toHaveLength(3);

    expect(() =>
      buildYoutubeExtractionWorkerLifecyclePlan({
        action: "start",
        homeDir: "/Users/tester",
        userId: 501,
        dryRun: false,
      }),
    ).toThrow(/manual only/i);
  });

  it("blocks install --execute unless explicit release authority flags are provided", () => {
    const result = spawnSync(process.execPath, [
      "scripts/youtube-extraction-worker-mac-production.mjs",
      "install",
      "--execute",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOMECOOK_RELEASE_MANIFEST_PATH: "/tmp/ambient-release.json",
        HOMECOOK_RELEASE_LOCK_TOKEN: "ambient-lock-token",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--release-manifest");
    expect(result.stderr).toContain("--lock-token");
    expect(result.stderr).not.toContain("/tmp/ambient-release.json");
    expect(result.stderr).not.toContain("ambient-lock-token");
  });

  it("rejects a launchd root outside the attested artifact directory", () => {
    const privateDir = createTempDir("yta-worker-root-drift-");
    const configPath = join(privateDir, ".env.production.local");
    const inputs = createReleaseInputs(privateDir);
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );

    expect(() => buildYoutubeExtractionWorkerInstallPlan({
      configPath,
      manifestPath: inputs.manifestPath,
      credentialPath: inputs.credentialPath,
      appDescriptorPath: inputs.appPath,
      currentPolicyPath: inputs.policyPath,
      expectedSchemaPath: inputs.expectedSchemaPath,
      secretRoot: privateDir,
      homeDir: "/Users/tester",
      rootDir: process.cwd(),
      nodeBin: "/usr/bin/node",
      userId: 501,
      dryRun: true,
      i031Preflight: GREEN_I031_PREFLIGHT,
    })).toThrow(/artifact root mismatch/iu);
  });

  it("refuses to emit launchctl commands when release preflight does not match", () => {
    const privateDir = createTempDir("yta-worker-install-blocked-");
    const configPath = join(privateDir, ".env.production.local");
    const inputs = createReleaseInputs(privateDir, { enabled: false });
    writeModeFile(inputs.appPath, JSON.stringify(buildYoutubeExtractionAppDescriptor({
      releaseSha: inputs.releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      expectedPolicyVersion: 1,
      expectedPolicySnapshotDigest: "f".repeat(64),
      artifactSha256: JSON.parse(readFileSync(inputs.manifestPath, "utf8")).artifact_sha256,
      expectedSchemaSha256: sha256File(inputs.expectedSchemaPath),
    })));
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );

    expect(() => buildYoutubeExtractionWorkerInstallPlan({
      configPath,
      manifestPath: inputs.manifestPath,
      credentialPath: inputs.credentialPath,
      appDescriptorPath: inputs.appPath,
      currentPolicyPath: inputs.policyPath,
      expectedSchemaPath: inputs.expectedSchemaPath,
      secretRoot: privateDir,
      homeDir: "/Users/tester",
      rootDir: inputs.artifactDir,
      nodeBin: "/usr/bin/node",
      userId: 501,
      dryRun: true,
    })).toThrow(/preflight failed: allowed_snapshot_digest_mismatch/u);
  });

  it("refuses install when the exact i031 startup preflight is not attested", () => {
    const privateDir = createTempDir("yta-worker-i031-preflight-");
    const configPath = join(privateDir, ".env.production.local");
    const inputs = createReleaseInputs(privateDir);
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );

    expect(() => buildYoutubeExtractionWorkerInstallPlan({
      configPath,
      manifestPath: inputs.manifestPath,
      credentialPath: inputs.credentialPath,
      appDescriptorPath: inputs.appPath,
      currentPolicyPath: inputs.policyPath,
      expectedSchemaPath: inputs.expectedSchemaPath,
      secretRoot: privateDir,
      homeDir: "/Users/tester",
      rootDir: inputs.artifactDir,
      nodeBin: "/usr/bin/node",
      userId: 501,
      dryRun: true,
      i031Preflight: {
        ready: true,
        codexCliVersion: "0.145.0",
        chatGptLogin: true,
        toolsReady: true,
      },
    })).toThrow(/i031 preflight/i);
  });

  it("rejects service-role and secret-bearing worker config keys", () => {
    const privateDir = createTempDir("yta-worker-forbidden-config-");
    const configPath = join(privateDir, ".env.production.local");
    writeModeFile(configPath, "SUPABASE_SERVICE_ROLE_KEY=must-never-reach-worker\n");

    expect(() => renderYoutubeExtractionWorkerPlist({
      configPath,
      manifestPath: configPath,
      credentialPath: configPath,
      appDescriptorPath: configPath,
      currentPolicyPath: configPath,
      expectedSchemaPath: configPath,
      secretRoot: privateDir,
      homeDir: "/Users/tester",
      nodeBin: "/usr/bin/node",
      rootDir: "/Users/tester/homecook",
    })).toThrow(/forbidden/i);
  });

  it("parses launchctl print output without requiring a live launchctl call", () => {
    expect(
      parseLaunchctlPrintStatus({
        serviceTarget: "gui/501/com.homecook.youtube-extraction-worker",
        status: 0,
        stdout: "state = waiting\npid = 4321\n",
      }),
    ).toMatchObject({
      loaded: true,
      state: "waiting",
      pid: 4321,
    });

    expect(
      parseLaunchctlPrintStatus({
        serviceTarget: "gui/501/com.homecook.youtube-extraction-worker",
        status: 113,
        stderr: "Could not find service",
      }),
    ).toMatchObject({
      loaded: false,
      state: "unloaded",
      pid: null,
    });
  });
});

describe("YTASYNC-OPS preflight, drain, rollback, credential", () => {
  it("fails closed when descriptor artifact or expected-schema byte digests drift", () => {
    const privateDir = createTempDir("yta-worker-digest-drift-");
    const inputs = createReleaseInputs(privateDir);
    const artifact = JSON.parse(readFileSync(inputs.manifestPath, "utf8"));
    const app = buildYoutubeExtractionAppDescriptor({
      releaseSha: inputs.releaseSha,
      schemaIdentity: artifact.schema_identity,
      expectedPolicyVersion: artifact.policy_version,
      expectedPolicySnapshotDigest: inputs.digest,
      artifactSha256: "a".repeat(64),
      expectedSchemaSha256: "b".repeat(64),
    });
    const preflight = evaluateYoutubeExtractionWorkerPreflight({
      appDescriptor: app,
      workerArtifact: artifact,
      currentPolicy: buildYoutubeExtractionCurrentPolicy({
        policySnapshotDigest: inputs.digest,
        enabled: true,
      }),
      credentialState: JSON.parse(readFileSync(inputs.credentialPath, "utf8")),
      expectedSchema: JSON.parse(readFileSync(inputs.expectedSchemaPath, "utf8")),
      expectedSchemaSha256: sha256File(inputs.expectedSchemaPath),
      requirePolicyEnabled: true,
    });

    expect(preflight.ready).toBe(false);
    expect(preflight.blockers).toEqual(expect.arrayContaining([
      "artifact_digest_mismatch",
      "expected_schema_digest_mismatch",
    ]));
  });

  it("passes expected schema bytes into the mac-production preflight loader", () => {
    const privateDir = createTempDir("yta-worker-cli-schema-drift-");
    const inputs = createReleaseInputs(privateDir);
    chmodSync(inputs.expectedSchemaPath, 0o600);
    writeFileSync(inputs.expectedSchemaPath, `${readFileSync(inputs.expectedSchemaPath, "utf8")} `);
    const result = spawnSync(process.execPath, [
      "scripts/youtube-extraction-worker-mac-production.mjs",
      "preflight",
      "--secret-root", privateDir,
      "--manifest", inputs.manifestPath,
      "--credential", inputs.credentialPath,
      "--app-descriptor", inputs.appPath,
      "--policy", inputs.policyPath,
      "--expected-schema", inputs.expectedSchemaPath,
    ], { cwd: process.cwd(), encoding: "utf8" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/artifact file drift|expected schema/i);
  });

  it("fails closed on release, schema, digest, and queue drift", () => {
    const releaseSha = "0123456789abcdef0123456789abcdef01234567";
    const digest =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const privateDir = createTempDir("yta-worker-preflight-");
    const tokenPath = join(privateDir, "worker.jwt");
    writeModeFile(tokenPath, "worker-token\n");
    const credential = buildYoutubeExtractionWorkerCredentialState({
      tokenFile: tokenPath,
      generation: 1,
      jtiHash:
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      expiresAt: futureIso(7),
      releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest: digest,
    });
    const artifact = buildYoutubeExtractionWorkerArtifactManifest({
      rootDir: process.cwd(),
      releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest: digest,
    });
    const app = buildYoutubeExtractionAppDescriptor({
      releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      expectedPolicyVersion: 1,
      expectedPolicySnapshotDigest: digest,
      artifactSha256: artifact.artifact_sha256,
      expectedSchemaSha256: artifact.expected_schema_sha256,
    });
    const policy = buildYoutubeExtractionCurrentPolicy({
      policySnapshotDigest: digest,
      enabled: true,
    });
    const queueState = buildYoutubeExtractionWorkerQueueState({
      queuedJobs: 0,
      processingJobs: 0,
      permitHeld: false,
      maintenanceMode: true,
      activeReleaseSha: releaseSha,
      activeSchemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      activePolicySnapshotDigest: digest,
    });

    const green = evaluateYoutubeExtractionWorkerPreflight({
      appDescriptor: app,
      workerArtifact: artifact,
      currentPolicy: policy,
      credentialState: credential,
      queueState,
      requirePolicyEnabled: true,
    });
    expect(green.ready).toBe(true);
    expect(green.blockers).toEqual([]);

    const red = evaluateYoutubeExtractionWorkerPreflight({
      appDescriptor: { ...app, release_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      workerArtifact: artifact,
      currentPolicy: { ...policy, policy_snapshot_digest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      credentialState: credential,
      queueState: { ...queueState, active_schema_identity: "other-schema" },
      requirePolicyEnabled: true,
    });
    expect(red.ready).toBe(false);
    expect(red.blockers).toEqual(expect.arrayContaining([
      "release_sha_mismatch",
      "allowed_snapshot_digest_mismatch",
      "queue_schema_identity_mismatch",
    ]));
  });

  it("requires an empty maintenance queue before drain and rollback rehearsal", () => {
    const artifact = buildYoutubeExtractionWorkerArtifactManifest({
      rootDir: process.cwd(),
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    const blockedDrain = buildYoutubeExtractionWorkerDrainPlan({
      workerArtifact: artifact,
      queueState: buildYoutubeExtractionWorkerQueueState({
        queuedJobs: 1,
        processingJobs: 0,
        permitHeld: true,
        maintenanceMode: false,
      }),
    });
    expect(blockedDrain.safe_to_stop).toBe(false);
    expect(blockedDrain.blockers).toEqual(expect.arrayContaining([
      "queued_jobs_present",
      "provider_permit_still_held",
      "maintenance_mode_disabled",
    ]));

    const privateDir = createTempDir("yta-worker-rollback-");
    const tokenPath = join(privateDir, "worker.jwt");
    writeModeFile(tokenPath, "worker-token\n");
    const credential = buildYoutubeExtractionWorkerCredentialState({
      tokenFile: tokenPath,
      generation: 1,
      jtiHash:
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      expiresAt: futureIso(7),
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    const rollback = buildYoutubeExtractionWorkerRollbackPlan({
      currentArtifact: artifact,
      previousAppDescriptor: buildYoutubeExtractionAppDescriptor({
        releaseSha: "0123456789abcdef0123456789abcdef01234567",
        schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
        expectedPolicyVersion: 1,
        expectedPolicySnapshotDigest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        artifactSha256: artifact.artifact_sha256,
        expectedSchemaSha256: artifact.expected_schema_sha256,
      }),
      queueState: buildYoutubeExtractionWorkerQueueState({
        queuedJobs: 0,
        processingJobs: 0,
        permitHeld: false,
        maintenanceMode: true,
        activeReleaseSha: "0123456789abcdef0123456789abcdef01234567",
        activeSchemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
        activePolicySnapshotDigest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      }),
      currentPolicy: buildYoutubeExtractionCurrentPolicy({
        policySnapshotDigest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        enabled: false,
      }),
      credentialState: credential,
      dryRun: true,
    });
    expect(rollback.ready).toBe(true);
    expect(rollback.steps[0]).toContain("freeze enqueue publish");
  });

  it("writes secret-safe credential metadata and enforces exact generation increments", () => {
    const privateDir = createTempDir("yta-worker-credential-");
    const tokenPath = join(privateDir, "worker.jwt");
    const metadataPath = join(privateDir, "credential.json");
    writeModeFile(tokenPath, "worker-token\n");

    const bootstrap = buildYoutubeExtractionWorkerCredentialState({
      tokenFile: tokenPath,
      generation: 1,
      jtiHash:
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      expiresAt: futureIso(7),
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    writeCredentialMetadata(metadataPath, bootstrap);
    const metadataText = readFileSync(metadataPath, "utf8");

    expect(metadataText).toContain("\"token_file_sha256\"");
    expect(metadataText).not.toContain("worker-token");
    expect(() =>
      rotateYoutubeExtractionWorkerCredential({
        tokenFile: tokenPath,
        expectedGeneration: 1,
        nextGeneration: 3,
        jtiHash:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        expiresAt: futureIso(14),
        releaseSha: "0123456789abcdef0123456789abcdef01234567",
        schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
        allowedSnapshotDigest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      }),
    ).toThrow(/expectedgeneration \+ 1/i);
  });

  it("keeps the CLIs dry-run and redacted by default", () => {
    const privateDir = createTempDir("yta-worker-cli-");
    const inputs = createReleaseInputs(privateDir);
    const configPath = join(privateDir, ".env.production.local");
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );

    const runner = spawnSync(
      process.execPath,
      [
        join(
          inputs.artifactDir,
          "scripts/youtube-extraction-worker-runner.mjs",
        ),
        "run",
        "--dry-run",
        "--secret-root",
        privateDir,
        "--config",
        configPath,
        "--manifest",
        inputs.manifestPath,
        "--credential",
        inputs.credentialPath,
        "--app-descriptor",
        inputs.appPath,
        "--policy",
        inputs.policyPath,
        "--expected-schema",
        inputs.expectedSchemaPath,
      ],
      {
        cwd: inputs.artifactDir,
        encoding: "utf8",
      },
    );

    expect(runner.status, runner.stderr).toBe(0);
    expect(runner.stdout).toContain("\"dry_run\": true");
    expect(runner.stdout).not.toContain("worker-token");

    const credentialWithoutDryRun = spawnSync(
      process.execPath,
      [
        "scripts/youtube-extraction-worker-mac-production.mjs",
        "credential-bootstrap",
        "--secret-root",
        privateDir,
        "--token-file",
        inputs.tokenPath,
        "--generation",
        "1",
        "--jti-hash",
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "--expires-at",
        "2026-08-19T00:00:00.000Z",
        "--release-sha",
        inputs.releaseSha,
        "--schema-identity",
        YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
        "--allowed-snapshot-digest",
        inputs.digest,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(credentialWithoutDryRun.status).not.toBe(0);
    expect(credentialWithoutDryRun.stderr).toMatch(/manual only/i);

    const health = buildYoutubeExtractionWorkerHealth({
      status: { loaded: true, state: "running", pid: 1234 },
      preflight: { ready: true, blockers: [] },
      drain: { safe_to_stop: true, blockers: [] },
    });
    expect(health.ok).toBe(true);
  });

  it("runs an immutable i031 artifact through claim, persistence, finalize, and SIGTERM", async () => {
    const privateDir = createTempDir("yta-worker-non-dry-run-");
    const fixtureRoot = createTempDir("yta-worker-fixture-root-");
    for (const relativePath of [
      "lib/server/youtube-extraction-worker-timing.json",
      "scripts/youtube-extraction-worker-runner.mjs",
      "scripts/lib/youtube-extraction-worker-artifact.mjs",
      "scripts/lib/local-mac-production-release.mjs",
      "scripts/lib/production-release-approval-policy.mjs",
      "scripts/lib/youtube-extraction-worker-ops.mjs",
      "scripts/lib/youtube-extraction-worker-runtime.mjs",
      "scripts/manifests/youtube-extraction-expected-schema.json",
      "scripts/templates/com.homecook.youtube-extraction-worker.plist.template",
    ]) {
      const destination = join(fixtureRoot, relativePath);
      mkdirSync(join(destination, ".."), { recursive: true });
      cpSync(join(process.cwd(), relativePath), destination);
    }
    const fixtureBundle = join(fixtureRoot, "lib/server/youtube-i031-runtime/bundle");
    mkdirSync(fixtureBundle, { recursive: true });
    for (const relativePath of YOUTUBE_EXTRACTION_RUNTIME_BUNDLE_REQUIRED_FILES) {
      if (relativePath === "worker.mjs") continue;
      const destination = join(fixtureBundle, relativePath);
      mkdirSync(join(destination, ".."), { recursive: true });
      writeModeFile(destination, "// deterministic fixture\n");
    }
    writeModeFile(join(fixtureBundle, "worker.mjs"), `
      import { writeFile } from "node:fs/promises";
      const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => {
        if (value.startsWith("--")) all.push([value.slice(2), list[index + 1]]);
        return all;
      }, []));
      let sequence = 0;
      const pending = new Map();
      process.on("message", (message) => {
        if (message?.type !== "homecook-worker-rpc-response") return;
        const entry = pending.get(message.requestId);
        if (!entry) return;
        pending.delete(message.requestId);
        message.ok ? entry.resolve(message.data) : entry.reject(new Error(message.errorCode));
      });
      function request(operation, payload) {
        const requestId = String(++sequence);
        return new Promise((resolve, reject) => {
          pending.set(requestId, { resolve, reject });
          process.send({ type: "homecook-worker-rpc-request", requestId, operation, payload });
        });
      }
      await request("title", { title: "provider artifact title" });
      await writeFile(args.metadata, JSON.stringify({ videoTitle: "provider artifact title" }));
      const transcript = await request("cache", {
        operation: "transcript_read",
        payload: {},
      });
      if (!transcript.cache) {
        await request("cache", {
          operation: "transcript_upsert",
          payload: {
            language: "ko",
            source_provider: "youtube_timedtext",
            source_kind: "caption",
            transcript_text: "bounded transcript",
            segments_json: [],
            expires_at: "2099-01-01T00:00:00.000Z",
          },
        });
      }
      await request("event", {
        kind: "transcript",
        payload: { provider: "youtube_timedtext", cache_hit: false, status: "success" },
      });
      await request("methods", { methodLabels: ["boil"] });
      await writeFile(args.result, JSON.stringify({
        identity: { pipeline: "i031" },
        videoTitle: "provider artifact title",
        recipe: { title: "artifact recipe title", ingredients: [], steps: ["끓인다"] },
        meta: { modelCallCount: 2 },
        workerDataPersisted: true,
      }));
      process.disconnect();
    `, 0o700);
    const fixtureBundleManifestPath = join(fixtureBundle, "manifest.json");
    const fixtureBundleManifest = {
      schemaVersion: 1,
      files: Object.fromEntries(
        YOUTUBE_EXTRACTION_RUNTIME_BUNDLE_REQUIRED_FILES.map(
          (relativePath) => [relativePath, sha256File(join(fixtureBundle, relativePath))],
        ),
      ),
    };
    writeModeFile(
      fixtureBundleManifestPath,
      JSON.stringify(fixtureBundleManifest, null, 2),
    );
    const providerPath = join(privateDir, "provider.env");
    const dataApiKeyPath = join(privateDir, "data-api-publishable.key");
    const runtimePath = join(privateDir, "runtime");
    const configPath = join(privateDir, ".env.production.local");
    const fakeHome = join(privateDir, "home");
    const fakeBin = join(privateDir, "bin");
    const authDir = join(fakeHome, ".codex");
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(authDir, { recursive: true });
    writeModeFile(join(authDir, "auth.json"), "{}\n");
    const codexBin = join(fakeBin, "codex");
    writeModeFile(codexBin, [
      "#!/bin/sh",
      "if [ \"$1\" = \"--version\" ]; then echo 'codex-cli 0.144.0-alpha.4'; exit 0; fi",
      "if [ \"$1\" = \"login\" ]; then echo 'Logged in using ChatGPT'; exit 0; fi",
      "exit 1",
      "",
    ].join("\n"), 0o700);
    for (const executable of [
      "python3",
      "yt-dlp",
      "ffmpeg",
      "ffprobe",
      "sandbox-exec",
      "swiftc",
    ]) {
      writeModeFile(join(fakeBin, executable), "#!/bin/sh\necho ok\n", 0o700);
    }
    const getconfBin = join(fakeBin, "getconf");
    writeModeFile(
      getconfBin,
      "#!/bin/sh\nprintf '/var/folders/zz/homecook/T/\\n'\n",
      0o700,
    );
    const fixtureRuntimePath = join(
      fixtureRoot,
      "scripts/lib/youtube-extraction-worker-runtime.mjs",
    );
    const fixtureRuntimeSource = readFileSync(fixtureRuntimePath, "utf8");
    expect(fixtureRuntimeSource).toContain("platform = process.platform,");
    const fixtureDarwinRuntimeSource = fixtureRuntimeSource
      .replaceAll("platform = process.platform,", 'platform = "darwin",')
      .replace('"/usr/bin/getconf"', JSON.stringify(getconfBin));
    expect(fixtureDarwinRuntimeSource).not.toContain("platform = process.platform,");
    expect(fixtureDarwinRuntimeSource).not.toContain('"/usr/bin/getconf"');
    expect(fixtureRuntimeSource).toContain('accessPath("/usr/bin/sandbox-exec")');
    expect(fixtureRuntimeSource).toContain('accessPath("/usr/bin/swiftc")');
    writeFileSync(
      fixtureRuntimePath,
      fixtureDarwinRuntimeSource
        .replace(
          'accessPath("/usr/bin/sandbox-exec")',
          `accessPath(${JSON.stringify(join(fakeBin, "sandbox-exec"))})`,
        )
        .replace(
          'accessPath("/usr/bin/swiftc")',
          `accessPath(${JSON.stringify(join(fakeBin, "swiftc"))})`,
        ),
      "utf8",
    );
    const inputs = createReleaseInputs(privateDir, { rootDir: fixtureRoot });
    writeModeFile(providerPath, [
      "YOUTUBE_API_KEY=fake-test-key",
      `YOUTUBE_I031_CODEX_BIN=${codexBin}`,
      "",
    ].join("\n"));
    writeModeFile(dataApiKeyPath, "local-publishable-key\n");
    mkdirSync(runtimePath, { mode: 0o700 });

    let observedAuthorization: string | undefined;
    let observedApiKey: string | undefined;
    const rpcCalls: string[] = [];
    let resolveSucceeded!: () => void;
    const succeeded = new Promise<void>((resolve) => { resolveSucceeded = resolve; });
    const server = createServer((request, response) => {
      observedAuthorization = request.headers.authorization;
      observedApiKey = request.headers.apikey as string | undefined;
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.once("end", () => {
        const rpcName = request.url?.split("/").at(-1) ?? "";
        rpcCalls.push(rpcName);
        const payloadByRpc: Record<string, unknown> = {
          claim_youtube_extraction_job: {
            job_id: "99999999-9999-4999-8999-999999999999",
            youtube_video_id: "abc123DEF45",
            lease_generation: 2,
            policy_snapshot_digest: inputs.digest,
            result_affecting_options: {},
          },
          claim_youtube_extractor_permit: { claimed: true, permit_generation: 3 },
          start_youtube_extraction_attempt: { started: true, attempt_count: 1 },
          heartbeat_youtube_extraction_job: { updated: true },
          heartbeat_youtube_extractor_permit: { updated: true },
          read_youtube_extraction_worker_catalog: {
            applied: true,
            ingredients: [],
            ingredient_synonyms: [],
            cooking_methods: [],
          },
          access_youtube_extraction_worker_cache: {
            applied: true,
            cache: body.includes("transcript_read") ? null : { id: "cache-row" },
          },
          record_youtube_extraction_worker_event: { applied: true, recorded: true },
          resolve_youtube_extraction_worker_methods: { applied: true, methods: [] },
          update_youtube_extraction_job_title: { applied: true, updated: true },
          report_youtube_extraction_progress: [{ applied: true }],
          resolve_youtube_extraction_job_draft: { title: "artifact recipe title" },
          finalize_youtube_extraction_job: { finalized: true },
          release_youtube_extractor_permit: { released: true },
        };
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(payloadByRpc[rpcName] ?? null));
        if (rpcName === "finalize_youtube_extraction_job") resolveSucceeded();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test address");
    writeModeFile(configPath, [
      `HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:${address.port}/rest/v1`,
      `HOMECOOK_YOUTUBE_WORKER_DATA_API_KEY_FILE=${dataApiKeyPath}`,
      `HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE=${providerPath}`,
      `HOMECOOK_YOUTUBE_WORKER_RUNTIME_ROOT=${runtimePath}`,
      "HOMECOOK_YOUTUBE_WORKER_ID=test-worker",
      "HOMECOOK_YOUTUBE_WORKER_POLL_INTERVAL_MS=10",
      "",
    ].join("\n"));

    const child = spawn(process.execPath, [
      join(inputs.artifactDir, "scripts/youtube-extraction-worker-runner.mjs"),
      "run",
      "--secret-root", privateDir,
      "--config", configPath,
      "--manifest", inputs.manifestPath,
      "--credential", inputs.credentialPath,
      "--app-descriptor", inputs.appPath,
      "--policy", inputs.policyPath,
      "--expected-schema", inputs.expectedSchemaPath,
    ], {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        HOME: realpathSync(fakeHome),
        PATH: fakeBin,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const childExit = new Promise<number | null>((resolve) => child.once("exit", resolve));
    try {
      await Promise.race([
        succeeded,
        childExit.then((exitCode) => {
          throw new Error(`worker exited before finalize (${String(exitCode)}): ${stderr}`);
        }),
      ]);
      child.kill("SIGTERM");
      const exitCode = await childExit;
      expect(exitCode, stderr).toBe(0);
      expect(observedAuthorization).toBe("Bearer worker-token");
      expect(observedApiKey).toBe("local-publishable-key");
      expect(rpcCalls).toEqual(expect.arrayContaining([
        "claim_youtube_extraction_job",
        "read_youtube_extraction_worker_catalog",
        "access_youtube_extraction_worker_cache",
        "record_youtube_extraction_worker_event",
        "resolve_youtube_extraction_worker_methods",
        "update_youtube_extraction_job_title",
        "resolve_youtube_extraction_job_draft",
        "finalize_youtube_extraction_job",
      ]));
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);
});
