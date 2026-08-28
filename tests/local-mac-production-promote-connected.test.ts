import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalMacProductionPromoteAdapters } from "../scripts/lib/local-mac-production-promote-adapters.mjs";
import {
  getLocalMacProductionReleasePaths,
  promoteLocalMacProductionRelease,
} from "../scripts/lib/local-mac-production-release.mjs";
import {
  getLocalMacProductionPaths,
  renderLocalMacProductionPlist,
} from "../scripts/lib/local-mac-production.mjs";
import {
  getFullLocalLaunchAgentPaths,
  renderFullLocalLaunchAgentPlist,
} from "../scripts/lib/full-local-launch-agent.mjs";
import {
  buildGitHubProductionReleaseAttestationArtifacts,
  GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE,
} from "../scripts/lib/github-production-release-attestation.mjs";
import {
  FULL_LOCAL_SECRET_NAMES,
  generateFullLocalSecretBundle,
} from "../scripts/lib/full-local-production-runtime.mjs";
import { resumeCurrentRelease } from "../scripts/full-local-production-runtime.mjs";
import { resolveTrustedGhExecutable } from "../scripts/lib/trusted-production-release-tools.mjs";
import { FULL_LOCAL_OAUTH_SECRET_NAMES } from "../scripts/lib/full-local-oauth-providers.mjs";
import {
  buildYoutubeExtractionAppDescriptor,
  buildYoutubeExtractionCurrentPolicy,
  materializeYoutubeExtractionWorkerArtifact,
  sha256Text,
  stableStringify,
} from "../scripts/lib/youtube-extraction-worker-artifact.mjs";
import {
  buildYoutubeExtractionWorkerCredentialState,
  getYoutubeExtractionWorkerPaths,
  renderYoutubeExtractionWorkerPlist,
} from "../scripts/lib/youtube-extraction-worker-ops.mjs";
import {
  createLocalMacProductionGitEvidence,
  createLocalMacProductionReleaseManifest,
} from "./helpers/local-mac-production-release-fixtures";

const roots: string[] = [];
const E02 = "e02f02a87d1d955dc598728e7029a745a650a5c3";
const FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA =
  "3bdd814da8f9849805185d1b3be5a6ee703133a0";
const FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA =
  "36e7aecfe429875f2dc12f3effc020ab1296a818";

function temp(prefix: string) {
  const path = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(path);
  return path;
}

function makeWritable(path: string) {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) makeWritable(join(path, name));
  } else chmodSync(path, 0o600);
}

function seal(path: string) {
  const stat = lstatSync(path);
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) seal(join(path, name));
    chmodSync(path, 0o500);
  } else if (!stat.isSymbolicLink()) chmodSync(path, (stat.mode & 0o111) ? 0o500 : 0o400);
}

function digest(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function executionTreeDigest(root: string) {
  const hash = createHash("sha256");
  const visit = (path: string, relativePath: string) => {
    const stat = lstatSync(path);
    if (stat.isDirectory()) {
      hash.update(`dir\0${relativePath}\0`);
      for (const name of readdirSync(path).sort()) {
        visit(join(path, name), relativePath ? `${relativePath}/${name}` : name);
      }
      return;
    }
    hash.update(`file\0${relativePath}\0${(stat.mode & 0o111) === 0 ? "data" : "exec"}\0`);
    hash.update(readFileSync(path));
    hash.update("\0");
  };
  visit(root, "");
  return hash.digest("hex");
}

function writePrepare(
  root: string,
  manifest: Record<string, unknown>,
  manifestBytes: Buffer,
  { executableRuntime = false } = {},
) {
  mkdirSync(join(root, ".git"), { recursive: true, mode: 0o700 });
  mkdirSync(join(root, ".next"), { recursive: true, mode: 0o700 });
  if (executableRuntime) {
    cpSync(join(process.cwd(), "scripts"), join(root, "scripts"), { recursive: true });
    cpSync(
      join(process.cwd(), "infra/full-local-supabase"),
      join(root, "infra/full-local-supabase"),
      { recursive: true },
    );
    mkdirSync(join(root, "lib/server"), { recursive: true, mode: 0o700 });
    cpSync(
      join(process.cwd(), "lib/server/youtube-extraction-worker-timing.json"),
      join(root, "lib/server/youtube-extraction-worker-timing.json"),
    );
  }
  for (const file of [
    "scripts/start-local-mac-production.mjs",
    "scripts/start-production.mjs",
    "scripts/full-local-production-runtime.mjs",
    ".env.production.local",
    "infra/full-local-supabase/.env.production.local",
  ]) {
    const path = join(root, file);
    if (executableRuntime && existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, "// fixture\n", { mode: 0o600 });
  }
  writeFileSync(join(root, ".next/BUILD_ID"), `${manifest.build_id}\n`);
  writeFileSync(join(root, "release-manifest.json"), manifestBytes, { mode: 0o600 });
  writeFileSync(join(root, "prepare.json"), JSON.stringify({
    schema: "homecook.local-mac-production-prepare.v1",
    status: "prepared",
    prepared_at: "2026-08-25T10:00:00.000Z",
    promotion_id: manifest.promotion_id,
    release_tag: manifest.release_tag,
    release_sha: manifest.release_sha,
    release_tree: manifest.release_tree,
    build_id: manifest.build_id,
    source_manifest_path: manifest.release_manifest_path,
    source_manifest_sha256: digest(manifestBytes),
    attestation_source: "fixture",
    validation_commands: [],
  }, null, 2), { mode: 0o600 });
}

function workerFixture(
  root: string,
  identity: Record<string, string>,
  legacy = false,
  artifactAtRoot = false,
) {
  const artifactRoot = artifactAtRoot ? root : join(root, "artifact");
  const secretRoot = artifactAtRoot ? `${root}-secrets` : join(root, "secrets");
  if (!artifactAtRoot) mkdirSync(secretRoot, { recursive: true, mode: 0o700 });
  const allowed = "9".repeat(64);
  const materialized = materializeYoutubeExtractionWorkerArtifact({
    rootDir: process.cwd(),
    outputDir: artifactRoot,
    releaseSha: identity.release_sha,
    releaseTree: identity.release_tree,
    buildId: identity.build_id,
    promotionId: identity.promotion_id,
    allowedSnapshotDigest: allowed,
  });
  if (artifactAtRoot) mkdirSync(secretRoot, { recursive: true, mode: 0o700 });
  let artifact = materialized.manifest;
  if (legacy) {
    makeWritable(artifactRoot);
    const base = { ...artifact } as Record<string, unknown>;
    delete base.artifact_sha256;
    delete base.release_tree;
    delete base.build_id;
    delete base.promotion_id;
    artifact = { ...base, version: 1 } as typeof artifact;
    artifact.artifact_sha256 = sha256Text(stableStringify(artifact));
    writeFileSync(materialized.manifest_path, JSON.stringify(artifact, null, 2));
    seal(artifactRoot);
  }
  const expectedSchemaPath = join(artifactRoot, "scripts/manifests/youtube-extraction-expected-schema.json");
  const authorityRoot = artifactAtRoot ? secretRoot : root;
  const appDescriptorPath = join(authorityRoot, "app.json");
  writeFileSync(appDescriptorPath, JSON.stringify(buildYoutubeExtractionAppDescriptor({
    releaseSha: identity.release_sha,
    expectedPolicySnapshotDigest: allowed,
    artifactSha256: artifact.artifact_sha256,
    expectedSchemaSha256: artifact.expected_schema_sha256,
  })), { mode: 0o600 });
  const policyPath = join(authorityRoot, "policy.json");
  writeFileSync(policyPath, JSON.stringify(buildYoutubeExtractionCurrentPolicy({
    policySnapshotDigest: allowed,
    enabled: true,
  })), { mode: 0o600 });
  const tokenPath = join(secretRoot, "token.jwt");
  writeFileSync(tokenPath, "token-fixture\n", { mode: 0o600 });
  const credentialPath = join(secretRoot, "credential.json");
  writeFileSync(credentialPath, JSON.stringify(buildYoutubeExtractionWorkerCredentialState({
    tokenFile: tokenPath,
    generation: 1,
    jtiHash: "8".repeat(64),
    expiresAt: "2099-01-01T00:00:00.000Z",
    releaseSha: identity.release_sha,
    schemaIdentity: artifact.schema_identity,
    allowedSnapshotDigest: allowed,
    secretRoot,
  })), { mode: 0o600 });
  const providerPath = join(secretRoot, "provider.env");
  writeFileSync(providerPath, "YOUTUBE_API_KEY=fixture-key\n", { mode: 0o600 });
  const configPath = join(secretRoot, "worker.env");
  writeFileSync(configPath, `HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE=${providerPath}\n`, { mode: 0o600 });
  return { artifactRoot, manifestPath: materialized.manifest_path, appDescriptorPath, expectedSchemaPath, policyPath, secretRoot, credentialPath, configPath };
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop()!;
    makeWritable(root);
    rmSync(root, { recursive: true, force: true });
  }
});

describe("connected local Mac production promotion", () => {
  it("adopts the exact split predecessor once when current and previous descriptors are absent", async () => {
    const homeDir = temp("homecook-bridge-home-");
    const repoRoot = temp("homecook-bridge-repo-");
    const fullLocalRoot = join(homeDir, "01_vibe_coding/homecook-session-refresh-storm-deploy-v9");
    mkdirSync(fullLocalRoot, { recursive: true, mode: 0o700 });
    const binDir = join(repoRoot, "bin");
    mkdirSync(binDir, { mode: 0o700 });
    const nodeBin = join(binDir, "node");
    symlinkSync(process.execPath, nodeBin);
    const state = getLocalMacProductionReleasePaths(homeDir);
    mkdirSync(state.releaseRoot, { recursive: true, mode: 0o700 });
    chmodSync(join(state.releaseRoot, ".."), 0o700);

    const predecessorIdentity = {
      release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
      release_tree: "d".repeat(40),
      build_id: "bridge-build",
      promotion_id: "bridge-promotion",
    };
    const currentRoot = join(homeDir, "01_vibe_coding/homecook-production-current");
    mkdirSync(currentRoot, { recursive: true, mode: 0o700 });
    mkdirSync(join(currentRoot, ".next"), { mode: 0o700 });
    writeFileSync(join(currentRoot, ".next/BUILD_ID"), predecessorIdentity.build_id, {
      mode: 0o600,
    });
    const currentWorker = workerFixture(
      join(
        homeDir,
        ".homecook/youtube-extraction-releases/3bdd814da8f9849805185d1b3be5a6ee703133a0-admin-acl-v1",
      ),
      predecessorIdentity,
      false,
      true,
    );

    const launchAgents = join(homeDir, "Library/LaunchAgents");
    mkdirSync(launchAgents, { recursive: true, mode: 0o700 });
    chmodSync(join(homeDir, "Library"), 0o700);
    const fullConfig = join(homeDir, ".homecook/config/full-local-production.env");
    const legacyFullConfig = join(
      fullLocalRoot,
      "infra/full-local-supabase/.env.production.local",
    );
    mkdirSync(dirname(fullConfig), { recursive: true, mode: 0o700 });
    mkdirSync(dirname(legacyFullConfig), { recursive: true, mode: 0o700 });
    const fullLocalConfig = readFileSync(
      join(process.cwd(), "infra/full-local-supabase/.env.production.example"),
      "utf8",
    ).replaceAll("/Users/REPLACE_ME", homeDir);
    writeFileSync(fullConfig, fullLocalConfig, { mode: 0o600 });
    writeFileSync(legacyFullConfig, fullLocalConfig, { mode: 0o600 });
    const fullLocalSecrets = generateFullLocalSecretBundle();
    const fullLocalSecretDir = join(homeDir, ".homecook/secrets/full-local-supabase");
    mkdirSync(fullLocalSecretDir, { recursive: true, mode: 0o700 });
    for (const name of FULL_LOCAL_SECRET_NAMES) {
      writeFileSync(
        join(fullLocalSecretDir, name),
        String(fullLocalSecrets[name as keyof typeof fullLocalSecrets]),
        { mode: 0o600 },
      );
    }
    writeFileSync(
      getLocalMacProductionPaths(homeDir).plistPath,
      renderLocalMacProductionPlist({ homeDir, nodeBin, rootDir: currentRoot }),
      { mode: 0o644 },
    );
    writeFileSync(
      getFullLocalLaunchAgentPaths(homeDir).plistPath,
      renderFullLocalLaunchAgentPlist({
        configPath: legacyFullConfig,
        homeDir,
        includeReleaseIdentity: false,
        nodeBin,
        rootDir: fullLocalRoot,
        runtimeCommand: "start",
      }),
      { mode: 0o600 },
    );
    writeFileSync(
      getYoutubeExtractionWorkerPaths(homeDir).plistPath,
      renderYoutubeExtractionWorkerPlist({
        ...currentWorker,
        currentPolicyPath: currentWorker.policyPath,
        homeDir,
        nodeBin,
        rootDir: currentWorker.artifactRoot,
      }),
      { mode: 0o600 },
    );

    let activeIdentity = predecessorIdentity;
    let appRoot = currentRoot;
    let workerRoot = currentWorker.artifactRoot;
    let appPid = 110;
    let workerPid = 210;
    const commandRunner = ((command: string, args: readonly string[] = [], options: Record<string, unknown> = {}) => {
      if (command === "git") {
        const cwd = String(options.cwd ?? "");
        const joined = args.join(" ");
        if (cwd === fullLocalRoot && joined === "rev-parse HEAD") {
          return { status: 0, stdout: `${FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA}\n`, stderr: "" };
        }
        if (cwd === fullLocalRoot && joined === "rev-parse HEAD^{tree}") {
          return { status: 0, stdout: `${"e".repeat(40)}\n`, stderr: "" };
        }
        const marker = existsSync(join(cwd, "prepare.json"))
          ? JSON.parse(readFileSync(join(cwd, "prepare.json"), "utf8"))
          : activeIdentity;
        if (joined === "rev-parse HEAD") return { status: 0, stdout: `${marker.release_sha}\n`, stderr: "" };
        if (joined === "rev-parse HEAD^{tree}") return { status: 0, stdout: `${marker.release_tree}\n`, stderr: "" };
        if (joined === "symbolic-ref -q HEAD") return { status: 1, stdout: "", stderr: "" };
        if (joined.startsWith("status ") || joined.startsWith("ls-files ")) {
          return { status: 0, stdout: "", stderr: "" };
        }
      }
      if (command === "/usr/sbin/lsof") {
        const pid = Number(args[2]);
        return { status: 0, stdout: `p${pid}\nfcwd\nn${pid === appPid ? appRoot : workerRoot}\n`, stderr: "" };
      }
      if (command === "/bin/launchctl") {
        const joined = args.join(" ");
        if (args[0] === "print") {
          const worker = joined.includes("youtube-extraction-worker");
          if (worker && workerRoot === currentWorker.artifactRoot) {
            return {
              status: 0,
              stdout: "state = spawn scheduled\nruns = 1269\nlast exit code = 1\n",
              stderr: "",
            };
          }
          const pid = worker ? workerPid : appPid;
          return { status: 0, stdout: `state = running\npid = ${pid}\n`, stderr: "" };
        }
        if (joined.includes("youtube-extraction-worker")) {
          const plist = readFileSync(getYoutubeExtractionWorkerPaths(homeDir).plistPath, "utf8");
          workerRoot = plist.match(/<key>WorkingDirectory<\/key>\s*<string>([^<]+)/u)?.[1] ?? workerRoot;
          workerPid += 1;
        } else if (joined.includes("com.homecook.production")) {
          const plist = readFileSync(getLocalMacProductionPaths(homeDir).plistPath, "utf8");
          appRoot = plist.match(/<key>WorkingDirectory<\/key>\s*<string>([^<]+)/u)?.[1] ?? appRoot;
          appPid += 1;
        }
        return { status: 0, stdout: "", stderr: "" };
      }
      if (command === nodeBin) {
        const scriptPath = String(args[0] ?? "");
        const subcommand = String(args[1] ?? "");
        if (scriptPath.endsWith("full-local-production-runtime.mjs")) {
          const identityPath = args.includes("--release-identity")
            ? String(args[args.indexOf("--release-identity") + 1])
            : null;
          const releaseIdentity = identityPath
            ? JSON.parse(readFileSync(identityPath, "utf8"))
            : activeIdentity;
          if (subcommand === "start") {
            activeIdentity = releaseIdentity;
            return { status: 0, stdout: JSON.stringify({ release_identity: releaseIdentity }), stderr: "" };
          }
          if (subcommand === "status") {
            return {
              status: 0,
              stdout: JSON.stringify({
                healthy: true,
                authorization_contract_status: "PASS",
                product_catalog_status: "PASS",
                release_identity: releaseIdentity,
              }),
              stderr: "",
            };
          }
        }
        if (subcommand === "status") {
          return {
            status: 0,
            stdout: JSON.stringify({
              healthy: true,
              authorization_contract_status: "PASS",
              product_catalog_status: "PASS",
              release_identity: activeIdentity,
            }),
            stderr: "",
          };
        }
      }
      return { status: 0, stdout: "", stderr: "" };
    }) as typeof spawnSync;

    const identity = {
      release_sha: "a".repeat(40),
      release_tree: "b".repeat(40),
      build_id: "build-1",
      promotion_id: "promotion-1",
    };
    const manifestPath = join(repoRoot, "release-bridge.json");
    const subjectManifestPath = join(repoRoot, "subject-bridge.json");
    const bundlePath = join(repoRoot, "bundle-bridge.jsonl");
    const releaseTag = "prod-20260828.1";
    const releaseTagObjectSha = "2".repeat(40);
    const checkRuns = [
      "build", "changes", "dependency-audit", "policy", "quality",
      "security-function-authorization", "security-smoke",
    ].map((name, checkIndex) => ({
      app: { id: 15368 },
      check_suite: { id: 900 + checkIndex },
      completed_at: `2026-08-28T09:00:${String(checkIndex).padStart(2, "0")}Z`,
      conclusion: "success",
      name,
      status: "completed",
    }));
    const artifacts = buildGitHubProductionReleaseAttestationArtifacts({
      checkRuns,
      releaseSha: identity.release_sha,
      releaseTag,
      releaseTagObjectSha,
      releaseTree: identity.release_tree,
      repository: "netsus/homecook",
      subjectOutputPath: subjectManifestPath,
    });
    const manifest = createLocalMacProductionReleaseManifest(manifestPath, {
      ...identity,
      attestation_digest: artifacts.subject_manifest_sha256,
      previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
      release_tag: releaseTag,
      release_tag_object_sha: releaseTagObjectSha,
      required_check_summary: artifacts.subject.required_check_summary,
      signer_digest: identity.release_sha,
      master_sha_at_approval: identity.release_sha,
    });
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
    writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });
    writeFileSync(bundlePath, `${JSON.stringify([{ verificationResult: { statement: {
      predicateType: GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE,
      predicate: artifacts.predicate,
      subject: [{ digest: { sha256: artifacts.subject_manifest_sha256 } }],
    } } }])}\n`, { mode: 0o600 });
    const candidateRoot = join(state.releaseRoot, String(manifest.release_tag));
    mkdirSync(candidateRoot, { mode: 0o700 });
    writePrepare(candidateRoot, manifest, manifestBytes, { executableRuntime: true });
    const worker = workerFixture(temp("homecook-bridge-worker-next-"), identity);
    const adapters = createLocalMacProductionPromoteAdapters({
      confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL",
      bundlePath,
      subjectManifestPath,
      trustedRootPath: join(process.cwd(), "tests/fixtures/github-attestation-trusted-root.jsonl"),
      fullLocalConfigPath: fullConfig,
      homeDir,
      nodeBin,
      workerConfigPath: worker.configPath,
      workerManifestPath: worker.manifestPath,
      workerCredentialPath: worker.credentialPath,
      workerAppDescriptorPath: worker.appDescriptorPath,
      workerPolicyPath: worker.policyPath,
      workerExpectedSchemaPath: worker.expectedSchemaPath,
      workerSecretRoot: worker.secretRoot,
    }, {
      commandRunner,
      i031PreflightVerifier: vi.fn(async () => ({ codexCliVersion: "0.144.0-alpha.4" })),
      appReadinessWaiter: vi.fn(async () => undefined),
      platform: "darwin",
    });

    const promoted = await promoteLocalMacProductionRelease({
      ...adapters,
      homeDir,
      lockToken: "11111111-1111-4111-8111-111111111111",
      manifestPath,
      readGitEvidence: () => createLocalMacProductionGitEvidence({
        releaseSha: identity.release_sha,
        releaseTree: identity.release_tree,
        overrides: { releaseTagObjectSha: manifest.release_tag_object_sha },
      }),
      rootDir: repoRoot,
      runCommand: commandRunner,
      verifyAttestation: () => ({ verified: true, source: "fixture" }),
    } as unknown as Parameters<typeof promoteLocalMacProductionRelease>[0]);

    expect(promoted.promoted).toBe(true);
    expect(existsSync(state.previousDescriptorPath)).toBe(false);
    expect(JSON.parse(readFileSync(state.currentDescriptorPath, "utf8"))).toMatchObject({
      release_sha: identity.release_sha,
      promotion_id: identity.promotion_id,
    });
    expect(JSON.parse(readFileSync(state.currentDescriptorPath, "utf8")).restart_capability)
      .toBeUndefined();
    expect(readFileSync(getFullLocalLaunchAgentPaths(homeDir).plistPath, "utf8"))
      .toContain("<string>start</string>");
  }, 120_000);

  it("promotes exact e02 legacy state and then consumes the v2 descriptor on the next promotion", async () => {
    const homeDir = temp("homecook-connected-home-");
    const repoRoot = temp("homecook-connected-repo-");
    const binDir = join(repoRoot, "bin");
    mkdirSync(binDir, { mode: 0o700 });
    const nodeBin = join(binDir, "node");
    symlinkSync(process.execPath, nodeBin);
    const state = getLocalMacProductionReleasePaths(homeDir);
    mkdirSync(state.releaseRoot, { recursive: true, mode: 0o700 });
    chmodSync(join(state.releaseRoot, ".."), 0o700);
    const legacyIdentity = { release_sha: E02, release_tree: "d".repeat(40), build_id: "legacy-build", promotion_id: "legacy-promotion" };
    const currentRoot = join(state.releaseRoot, "prod-20260820.1");
    mkdirSync(currentRoot, { mode: 0o700 });
    const legacyManifest = { release_manifest_path: join(repoRoot, "legacy.json"), release_tag: "prod-20260820.1", ...legacyIdentity };
    writePrepare(currentRoot, legacyManifest, Buffer.from("{}"));
    writeFileSync(state.currentDescriptorPath, JSON.stringify({
      schema: "homecook.local-mac-production-running-release.v1",
      release_tag: "prod-20260820.1",
      ...legacyIdentity,
      promoted_at: "2026-08-24T09:00:00.000Z",
      source_manifest_sha256: "1".repeat(64),
    }, null, 2), { mode: 0o600 });
    const legacyWorker = workerFixture(temp("homecook-connected-worker-v1-"), legacyIdentity, true);

    const launchAgents = join(homeDir, "Library/LaunchAgents");
    mkdirSync(launchAgents, { recursive: true, mode: 0o700 });
    chmodSync(join(homeDir, "Library"), 0o700);
    const fullConfig = join(homeDir, ".homecook/config/full-local-production.env");
    mkdirSync(dirname(fullConfig), { recursive: true, mode: 0o700 });
    const fullLocalConfig = readFileSync(
      join(process.cwd(), "infra/full-local-supabase/.env.production.example"),
      "utf8",
    )
      .replaceAll("/Users/REPLACE_ME", homeDir)
      .replace(
        "FULL_LOCAL_ENABLE_SOCIAL_PROVIDERS=false",
        "FULL_LOCAL_ENABLE_SOCIAL_PROVIDERS=true",
      );
    writeFileSync(fullConfig, fullLocalConfig, { mode: 0o600 });
    const fullLocalSecrets = generateFullLocalSecretBundle();
    const fullLocalOauthSecrets = Object.fromEntries(
      FULL_LOCAL_OAUTH_SECRET_NAMES.map((name, index) => [name, `${name}-fixture-${index}`]),
    );
    const fullLocalSecretDir = join(homeDir, ".homecook/secrets/full-local-supabase");
    mkdirSync(fullLocalSecretDir, { recursive: true, mode: 0o700 });
    for (const name of FULL_LOCAL_SECRET_NAMES) {
      writeFileSync(
        join(fullLocalSecretDir, name),
        String(fullLocalSecrets[name as keyof typeof fullLocalSecrets]),
        {
        mode: 0o600,
        },
      );
    }
    for (const [name, value] of Object.entries(fullLocalOauthSecrets)) {
      writeFileSync(join(fullLocalSecretDir, name), value, { mode: 0o600 });
    }
    writeFileSync(getLocalMacProductionPaths(homeDir).plistPath, renderLocalMacProductionPlist({ homeDir, nodeBin, rootDir: currentRoot }), { mode: 0o644 });
    writeFileSync(getFullLocalLaunchAgentPaths(homeDir).plistPath, renderFullLocalLaunchAgentPlist({ configPath: fullConfig, homeDir, includeReleaseIdentity: false, nodeBin, rootDir: currentRoot, runtimeCommand: "start" }), { mode: 0o600 });
    writeFileSync(getYoutubeExtractionWorkerPaths(homeDir).plistPath, renderYoutubeExtractionWorkerPlist({ ...legacyWorker, homeDir, nodeBin, rootDir: legacyWorker.artifactRoot, currentPolicyPath: legacyWorker.policyPath }), { mode: 0o600 });

    let activeIdentity = legacyIdentity;
    let appRoot = currentRoot;
    let workerRoot = legacyWorker.artifactRoot;
    let appPid = 110;
    let workerPid = 210;
    const calls: string[] = [];
    const commandRunner = ((command: string, args: readonly string[] = [], options: Record<string, unknown> = {}) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "git") {
        const cwd = String(options.cwd ?? "");
        const marker = existsSync(join(cwd, "prepare.json")) ? JSON.parse(readFileSync(join(cwd, "prepare.json"), "utf8")) : activeIdentity;
        const joined = args.join(" ");
        if (joined === "rev-parse HEAD") return { status: 0, stdout: `${marker.release_sha}\n`, stderr: "" };
        if (joined === "rev-parse HEAD^{tree}") return { status: 0, stdout: `${marker.release_tree}\n`, stderr: "" };
        if (joined === "symbolic-ref -q HEAD") return { status: 1, stdout: "", stderr: "" };
        if (joined.startsWith("status ") || joined.startsWith("ls-files ")) return { status: 0, stdout: "", stderr: "" };
      }
      if (command === "/usr/sbin/lsof") {
        const pid = Number(args[2]);
        return { status: 0, stdout: `p${pid}\nfcwd\nn${pid === appPid ? appRoot : workerRoot}\n`, stderr: "" };
      }
      if (command === "/bin/launchctl") {
        const joined = args.join(" ");
        if (args[0] === "print") {
          const worker = joined.includes("youtube-extraction-worker");
          const pid = worker ? workerPid : appPid;
          return { status: 0, stdout: `state = running\npid = ${pid}\n`, stderr: "" };
        }
        if (joined.includes("youtube-extraction-worker")) {
          const plist = readFileSync(getYoutubeExtractionWorkerPaths(homeDir).plistPath, "utf8");
          workerRoot = plist.match(/<key>WorkingDirectory<\/key>\s*<string>([^<]+)/u)?.[1] ?? workerRoot;
          workerPid += 1;
        } else if (joined.includes("com.homecook.production")) {
          const plist = readFileSync(getLocalMacProductionPaths(homeDir).plistPath, "utf8");
          appRoot = plist.match(/<key>WorkingDirectory<\/key>\s*<string>([^<]+)/u)?.[1] ?? appRoot;
          appPid += 1;
        }
        return { status: 0, stdout: "", stderr: "" };
      }
      if (command === nodeBin) {
        const subcommand = args[1];
        if (subcommand === "start") {
          const identityPath = args[args.indexOf("--release-identity") + 1];
          activeIdentity = JSON.parse(readFileSync(identityPath, "utf8"));
          return { status: 0, stdout: "", stderr: "" };
        }
        if (subcommand === "status") return { status: 0, stdout: JSON.stringify({ healthy: true, authorization_contract_status: "PASS", product_catalog_status: "PASS", release_identity: activeIdentity }), stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    }) as typeof spawnSync;

    const runPromotion = async (index: number, previousSha: string) => {
      const identity = { release_sha: index === 1 ? "a".repeat(40) : "f".repeat(40), release_tree: index === 1 ? "b".repeat(40) : "e".repeat(40), build_id: `build-${index}`, promotion_id: `promotion-${index}` };
      const manifestPath = join(repoRoot, `release-${index}.json`);
      const subjectManifestPath = join(repoRoot, `subject-${index}.json`);
      const bundlePath = join(repoRoot, `bundle-${index}.jsonl`);
      const releaseTag = `prod-2026082${index}.1`;
      const releaseTagObjectSha = index === 1 ? "2".repeat(40) : "3".repeat(40);
      const checkRuns = [
        "build", "changes", "dependency-audit", "policy", "quality",
        "security-function-authorization", "security-smoke",
      ].map((name, checkIndex) => ({
        app: { id: 15368 },
        check_suite: { id: 800 + checkIndex },
        completed_at: `2026-08-25T09:00:${String(checkIndex).padStart(2, "0")}Z`,
        conclusion: "success",
        name,
        status: "completed",
      }));
      const artifacts = buildGitHubProductionReleaseAttestationArtifacts({
        checkRuns,
        releaseSha: identity.release_sha,
        releaseTag,
        releaseTagObjectSha,
        releaseTree: identity.release_tree,
        repository: "netsus/homecook",
        subjectOutputPath: subjectManifestPath,
      });
      const manifest = createLocalMacProductionReleaseManifest(manifestPath, {
        ...identity,
        attestation_digest: artifacts.subject_manifest_sha256,
        previous_release_sha: previousSha,
        release_tag: releaseTag,
        release_tag_object_sha: releaseTagObjectSha,
        required_check_summary: artifacts.subject.required_check_summary,
        signer_digest: identity.release_sha,
        master_sha_at_approval: identity.release_sha,
      });
      const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
      writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });
      writeFileSync(bundlePath, `${JSON.stringify([{ verificationResult: { statement: {
        predicateType: GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE,
        predicate: artifacts.predicate,
        subject: [{ digest: { sha256: artifacts.subject_manifest_sha256 } }],
      } } }])}\n`, { mode: 0o600 });
      const candidateRoot = join(state.releaseRoot, String(manifest.release_tag));
      mkdirSync(candidateRoot, { mode: 0o700 });
      writePrepare(candidateRoot, manifest, manifestBytes, { executableRuntime: true });
      const worker = workerFixture(temp(`homecook-connected-worker-v2-${index}-`), identity);
      const adapters = createLocalMacProductionPromoteAdapters({ confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL", bundlePath, subjectManifestPath, trustedRootPath: join(process.cwd(), "tests/fixtures/github-attestation-trusted-root.jsonl"), fullLocalConfigPath: fullConfig, homeDir, nodeBin, workerConfigPath: worker.configPath, workerManifestPath: worker.manifestPath, workerCredentialPath: worker.credentialPath, workerAppDescriptorPath: worker.appDescriptorPath, workerPolicyPath: worker.policyPath, workerExpectedSchemaPath: worker.expectedSchemaPath, workerSecretRoot: worker.secretRoot }, { commandRunner, i031PreflightVerifier: vi.fn(async () => ({ codexCliVersion: "0.144.0-alpha.4" })), appReadinessWaiter: vi.fn(async () => undefined), platform: "darwin" });
      const promoteOptions = { ...adapters, homeDir, manifestPath, rootDir: repoRoot, runCommand: commandRunner, readGitEvidence: () => createLocalMacProductionGitEvidence({ releaseSha: identity.release_sha, releaseTree: identity.release_tree, overrides: { releaseTagObjectSha: manifest.release_tag_object_sha } }), verifyAttestation: () => ({ verified: true, source: "fixture" }), lockToken: `${index}${index}${index}${index}${index}${index}${index}${index}-1111-4111-8111-111111111111` } as unknown as Parameters<typeof promoteLocalMacProductionRelease>[0];
      return promoteLocalMacProductionRelease(promoteOptions);
    };

    const first = await runPromotion(1, E02);
    const firstDescriptor = JSON.parse(readFileSync(state.currentDescriptorPath, "utf8"));
    expect(first.promoted).toBe(true);
    expect(firstDescriptor.release_sha).toBe("a".repeat(40));
    expect(firstDescriptor.restart_capability).toBe("full-local-resume-current-v1");
    expect(firstDescriptor.worker_artifact_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(firstDescriptor)).not.toMatch(/credential_path|secret_root|config_path|policy_path/u);
    const baseAbacDescriptor = { ...firstDescriptor };
    delete baseAbacDescriptor.restart_capability;
    writeFileSync(state.currentDescriptorPath, JSON.stringify(baseAbacDescriptor, null, 2), {
      mode: 0o600,
    });
    writeFileSync(
      getFullLocalLaunchAgentPaths(homeDir).plistPath,
      renderFullLocalLaunchAgentPlist({
        configPath: fullConfig,
        homeDir,
        includeReleaseIdentity: true,
        nodeBin,
        releaseIdentityPath: join(baseAbacDescriptor.execution_app_root, "prepare.json"),
        rootDir: baseAbacDescriptor.execution_app_root,
        runtimeCommand: "start",
      }),
      { mode: 0o600 },
    );
    const second = await runPromotion(2, "a".repeat(40));
    expect(second.promoted).toBe(true);
    expect(JSON.parse(readFileSync(state.previousDescriptorPath, "utf8"))).toEqual(baseAbacDescriptor);
    expect(JSON.parse(readFileSync(state.currentDescriptorPath, "utf8"))).toMatchObject({ release_sha: "f".repeat(40), promotion_id: "promotion-2", restart_capability: "full-local-resume-current-v1" });
    expect(calls.findIndex((call) => call.includes(" start "))).toBeLessThan(calls.findIndex((call) => call.includes("bootstrap") && call.includes("com.homecook.production")));

    expect(existsSync(state.lockPath)).toBe(false);
    const currentDescriptorBytes = readFileSync(state.currentDescriptorPath);
    const previousDescriptorBytes = readFileSync(state.previousDescriptorPath);
    const currentDescriptor = JSON.parse(currentDescriptorBytes.toString("utf8"));
    const resumeMarker = join(repoRoot, "resume-docker-calls.log");
    const fakeGhPath = join(binDir, "gh");
    writeFileSync(fakeGhPath, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const bundle = args[args.indexOf("--bundle") + 1];
process.stdout.write(fs.readFileSync(bundle, "utf8"));
`, { mode: 0o700 });
    const fakeSecurityPath = join(binDir, "security");
    writeFileSync(fakeSecurityPath, `#!/usr/bin/env node
const values = ${JSON.stringify({ ...fullLocalSecrets, ...fullLocalOauthSecrets })};
const args = process.argv.slice(2);
const account = args[args.indexOf("-a") + 1] || "";
if (account.endsWith("__count")) process.stdout.write("1\\n");
else {
  const name = account.replace(/__000$/, "");
  if (!(name in values)) process.exit(44);
  process.stdout.write(String(values[name]) + "\\n");
}
`, { mode: 0o700 });
    const fakeDockerPath = join(binDir, "docker");
    const resumeFaultModePath = join(repoRoot, "resume-fault-mode");
    const dockerStartedPath = join(repoRoot, "resume-docker-started");
    const services = ["auth", "auth-proxy", "api-gateway", "postgres", "postgrest", "realtime", "storage"];
    const composeModel = {
      services: {
        auth: {},
        "auth-proxy": { ports: [{ host_ip: "127.0.0.1", published: "54482", target: 8080 }] },
        "api-gateway": { ports: [{ host_ip: "127.0.0.1", published: "54481", target: 54481 }] },
        postgres: {},
        postgrest: {},
        realtime: {},
        storage: {},
      },
    };
    writeFileSync(fakeDockerPath, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(resumeMarker)}, args.join(" ") + "\\n");
const startedPath = ${JSON.stringify(dockerStartedPath)};
const faultPath = ${JSON.stringify(resumeFaultModePath)};
const preRunning = ["pre-running-0", "pre-running-1", "pre-running-2", "pre-running-3", "pre-running-4"];
const services = ${JSON.stringify(services)};
const ids = () => fs.existsSync(startedPath)
  ? [...preRunning, "pre-stopped", "new-container"]
  : [...preRunning, "pre-stopped"];
const container = (id, index) => ({
  Id: id,
  Config: { Labels: {
    "com.docker.compose.project": "homecook-full-local-isolated",
    "com.docker.compose.service": services[index] || "storage",
    "homecook.release.sha": fs.existsSync(faultPath) && ["identity", "cleanup-failure"].includes(fs.readFileSync(faultPath, "utf8"))
      ? ${JSON.stringify("0".repeat(40))}
      : ${JSON.stringify(currentDescriptor.release_sha)},
    "homecook.release.tree": ${JSON.stringify(currentDescriptor.release_tree)},
    "homecook.release.build-id": ${JSON.stringify(currentDescriptor.build_id)},
    "homecook.release.promotion-id": ${JSON.stringify(currentDescriptor.promotion_id)},
  } },
  State: { Running: id !== "pre-stopped" || fs.existsSync(startedPath) },
});
if (args.includes("config") && args.includes("--services")) process.stdout.write(services.join("\\n") + "\\n");
else if (args.includes("config") && args.includes("--format")) process.stdout.write(${JSON.stringify(JSON.stringify(composeModel))});
else if (args.includes("up") && args.includes("-d")) {
  fs.writeFileSync(startedPath, "started");
  const fault = fs.existsSync(faultPath) ? fs.readFileSync(faultPath, "utf8") : "";
  if (fault === "descriptor") {
    const path = ${JSON.stringify(state.currentDescriptorPath)};
    const value = JSON.parse(fs.readFileSync(path, "utf8"));
    value.promotion_id = "post-start-descriptor-drift";
    fs.writeFileSync(path, JSON.stringify(value, null, 2));
  } else if (fault === "snapshot") {
    const path = ${JSON.stringify(join(currentDescriptor.execution_app_root, "prepare.json"))};
    fs.chmodSync(path, 0o600);
    fs.appendFileSync(path, " ");
    fs.chmodSync(path, 0o400);
  } else if (fault === "secret") {
    fs.writeFileSync(${JSON.stringify(join(fullLocalSecretDir, "postgres_password"))}, "post-start-secret-drift");
  } else if (fault === "oauth-secret") {
    fs.writeFileSync(${JSON.stringify(join(fullLocalSecretDir, "google_client_secret"))}, "post-start-oauth-secret-drift");
  } else if (fault === "attestation") {
    const path = ${JSON.stringify(join(dirname(currentDescriptor.execution_app_root), "authority/attestation-subject.json"))};
    fs.chmodSync(path, 0o600);
    fs.appendFileSync(path, " ");
    fs.chmodSync(path, 0o400);
  }
}
else if (args.includes("ps") && args.includes("--quiet")) process.stdout.write(ids().join("\\n") + "\\n");
else if (args[0] === "inspect" && args.includes("--format")) {
  const id = args.at(-1);
  const running = id !== "pre-stopped" || fs.existsSync(startedPath);
  process.stdout.write(JSON.stringify({ Status: running ? "running" : "exited", Health: running ? { Status: "healthy" } : undefined }) + "\\n");
}
else if (args[0] === "container" && args[1] === "ls") process.stdout.write(ids().join("\\n") + "\\n");
else if (args[0] === "container" && args[1] === "inspect") {
  process.stdout.write(JSON.stringify(args.slice(2).map((id, index) => container(id, index))));
}
else if (args[0] === "stop" && fs.existsSync(faultPath) && fs.readFileSync(faultPath, "utf8") === "cleanup-failure") process.exit(42);
else if (args[0] === "rm" && args.includes("new-container")) fs.rmSync(startedPath, { force: true });
`, { mode: 0o700 });
    for (const path of [fakeGhPath, fakeSecurityPath, fakeDockerPath]) chmodSync(path, 0o700);

    const plist = readFileSync(getFullLocalLaunchAgentPaths(homeDir).plistPath, "utf8");
    const workingDirectory = plist.match(
      /<key>WorkingDirectory<\/key>\s*<string>([^<]+)<\/string>/u,
    )?.[1];
    const programArguments = [
      ...(plist.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/u)?.[1]
        ?.matchAll(/<string>([^<]*)<\/string>/gu) ?? []),
    ].map((match) => match[1]);
    expect(programArguments).toEqual([
      "/usr/bin/env",
      "-i",
      `HOME=${homeDir}`,
      expect.stringContaining(`PATH=${binDir}`),
      nodeBin,
      join(currentDescriptor.execution_app_root, "scripts/full-local-production-runtime.mjs"),
      "resume-current",
      "--current-descriptor",
      state.currentDescriptorPath,
      "--config",
      fullConfig,
    ]);
    expect(programArguments.join(" ")).not.toMatch(/lock-token|release-manifest/iu);
    expect(workingDirectory).toBe(currentDescriptor.execution_app_root);
    const hostileBinDir = join(repoRoot, "hostile-bin");
    mkdirSync(hostileBinDir, { mode: 0o700 });
    writeFileSync(join(hostileBinDir, "gh"), "#!/bin/sh\nexit 91\n", { mode: 0o700 });
    const resumeArgs = programArguments.slice(programArguments.indexOf("resume-current") + 1);
    const invokeResume = async () => {
      const previousHome = process.env.HOME;
      const previousPath = process.env.PATH;
      process.env.HOME = homeDir;
      process.env.PATH = `${hostileBinDir}:${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`;
      try {
        const result = await resumeCurrentRelease(resumeArgs, {
          resolveGhExecutable: () => resolveTrustedGhExecutable({
            allowedRealpaths: [realpathSync(fakeGhPath)],
            candidates: [fakeGhPath],
            currentUid: process.getuid?.(),
            pathEnvironment: process.env.PATH,
          }),
          runtimeRoot: currentDescriptor.execution_app_root,
        });
        return { status: 0, stdout: JSON.stringify(result), stderr: "" };
      } catch (error) {
        return {
          status: 1,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
        };
      } finally {
        if (previousHome === undefined) delete process.env.HOME;
        else process.env.HOME = previousHome;
        if (previousPath === undefined) delete process.env.PATH;
        else process.env.PATH = previousPath;
      }
    };
    const resumed = await invokeResume();
    expect(resumed.status, resumed.stderr).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({
      resumed_current: true,
      release_identity: {
        release_sha: currentDescriptor.release_sha,
        release_tree: currentDescriptor.release_tree,
        build_id: currentDescriptor.build_id,
        promotion_id: currentDescriptor.promotion_id,
      },
      status: "PASS",
    });
    expect(readFileSync(resumeMarker, "utf8")).toContain("up -d");
    const markerAfterSuccess = readFileSync(resumeMarker);

    const snapshotRoot = dirname(currentDescriptor.execution_app_root);
    const authorityRoot = join(snapshotRoot, "authority");
    const policyPath = join(authorityRoot, "policy.json");
    const snapshotEvidencePath = join(snapshotRoot, "evidence.json");
    const policyBytes = readFileSync(policyPath);
    const snapshotEvidenceBytes = readFileSync(snapshotEvidencePath);
    chmodSync(policyPath, 0o600);
    writeFileSync(policyPath, JSON.stringify({ tampered: true }), { mode: 0o600 });
    chmodSync(policyPath, 0o400);
    const modifiedEvidence = JSON.parse(snapshotEvidenceBytes.toString("utf8"));
    modifiedEvidence.authority_digest = executionTreeDigest(authorityRoot);
    chmodSync(snapshotEvidencePath, 0o600);
    writeFileSync(snapshotEvidencePath, JSON.stringify(modifiedEvidence, null, 2), {
      mode: 0o600,
    });
    chmodSync(snapshotEvidencePath, 0o400);
    expect((await invokeResume()).status).toBe(1);
    expect(readFileSync(resumeMarker)).toEqual(markerAfterSuccess);
    chmodSync(policyPath, 0o600);
    writeFileSync(policyPath, policyBytes, { mode: 0o600 });
    chmodSync(policyPath, 0o400);
    chmodSync(snapshotEvidencePath, 0o600);
    writeFileSync(snapshotEvidencePath, snapshotEvidenceBytes, { mode: 0o600 });
    chmodSync(snapshotEvidencePath, 0o400);

    writeFileSync(state.currentDescriptorPath, JSON.stringify({
      ...currentDescriptor,
      promotion_id: "tampered-promotion",
    }, null, 2), { mode: 0o600 });
    expect((await invokeResume()).status).toBe(1);
    expect(readFileSync(resumeMarker)).toEqual(markerAfterSuccess);
    writeFileSync(state.currentDescriptorPath, currentDescriptorBytes, { mode: 0o600 });

    const preparePath = join(currentDescriptor.execution_app_root, "prepare.json");
    const prepareBytes = readFileSync(preparePath);
    chmodSync(preparePath, 0o600);
    writeFileSync(preparePath, `${prepareBytes.toString("utf8")} `, { mode: 0o600 });
    chmodSync(preparePath, 0o400);
    expect((await invokeResume()).status).toBe(1);
    expect(readFileSync(resumeMarker)).toEqual(markerAfterSuccess);
    chmodSync(preparePath, 0o600);
    writeFileSync(preparePath, prepareBytes, { mode: 0o600 });
    chmodSync(preparePath, 0o400);

    writeFileSync(state.currentDescriptorPath, JSON.stringify(firstDescriptor, null, 2), {
      mode: 0o600,
    });
    expect((await invokeResume()).status).toBe(1);
    expect(readFileSync(resumeMarker)).toEqual(markerAfterSuccess);
    writeFileSync(state.currentDescriptorPath, currentDescriptorBytes, { mode: 0o600 });
    expect(readFileSync(state.currentDescriptorPath)).toEqual(currentDescriptorBytes);
    expect(readFileSync(state.previousDescriptorPath)).toEqual(previousDescriptorBytes);

    const attestationSubjectPath = join(
      dirname(currentDescriptor.execution_app_root),
      "authority/attestation-subject.json",
    );
    const attestationSubjectBytes = readFileSync(attestationSubjectPath);
    const coreSecretPath = join(fullLocalSecretDir, "postgres_password");
    const coreSecretBytes = readFileSync(coreSecretPath);
    const restoreFaultTarget = (fault: string) => {
      if (fault === "descriptor") {
        writeFileSync(state.currentDescriptorPath, currentDescriptorBytes, { mode: 0o600 });
      } else if (fault === "snapshot") {
        chmodSync(preparePath, 0o600);
        writeFileSync(preparePath, prepareBytes, { mode: 0o600 });
        chmodSync(preparePath, 0o400);
      } else if (fault === "secret") {
        writeFileSync(coreSecretPath, coreSecretBytes, { mode: 0o600 });
      } else if (fault === "attestation") {
        chmodSync(attestationSubjectPath, 0o600);
        writeFileSync(attestationSubjectPath, attestationSubjectBytes, { mode: 0o600 });
        chmodSync(attestationSubjectPath, 0o400);
      }
    };
    for (const fault of ["identity", "descriptor", "snapshot", "secret", "attestation"]) {
      rmSync(dockerStartedPath, { force: true });
      writeFileSync(resumeFaultModePath, fault, { mode: 0o600 });
      const logOffset = existsSync(resumeMarker) ? readFileSync(resumeMarker, "utf8").length : 0;
      const faultResult = await invokeResume();
      expect(faultResult.status).toBe(1);
      expect(faultResult.stderr).toContain("Failure evidence:");
      const cleanupLog = readFileSync(resumeMarker, "utf8").slice(logOffset);
      expect(cleanupLog).toMatch(/stop.*new-container/iu);
      expect(cleanupLog).toMatch(/stop.*pre-stopped/iu);
      expect(cleanupLog).toMatch(/rm.*new-container/iu);
      expect(cleanupLog).not.toMatch(/^(?:volume|(?:stop|rm)\b.*pre-running)/imu);
      restoreFaultTarget(fault);
      rmSync(resumeFaultModePath, { force: true });
      rmSync(dockerStartedPath, { force: true });
    }

    writeFileSync(resumeFaultModePath, "cleanup-failure", { mode: 0o600 });
    const cleanupFailure = await invokeResume();
    expect(cleanupFailure.status).toBe(1);
    const recoveryRequiredPath = join(
      state.releaseRoot,
      "resume-failures/recovery-required.json",
    );
    expect(existsSync(recoveryRequiredPath)).toBe(true);
    rmSync(resumeFaultModePath, { force: true });
    const retryLogOffset = readFileSync(resumeMarker, "utf8").length;
    const blockedRetry = await invokeResume();
    expect(blockedRetry.status).toBe(1);
    expect(blockedRetry.stderr).toMatch(/manual recovery|recovery required/iu);
    expect(readFileSync(resumeMarker, "utf8").slice(retryLogOffset)).toBe("");
    rmSync(recoveryRequiredPath);
    rmSync(dockerStartedPath, { force: true });

    writeFileSync(resumeFaultModePath, "oauth-secret", { mode: 0o600 });
    const oauthLogOffset = readFileSync(resumeMarker, "utf8").length;
    const oauthFaultResult = await invokeResume();
    expect(oauthFaultResult.status).toBe(1);
    expect(oauthFaultResult.stderr).toContain("Failure evidence:");
    const oauthCleanupLog = readFileSync(resumeMarker, "utf8").slice(oauthLogOffset);
    expect(oauthCleanupLog).toMatch(/stop.*new-container/iu);
    expect(oauthCleanupLog).toMatch(/rm.*new-container/iu);
    expect(oauthCleanupLog).not.toMatch(/^(?:volume|(?:stop|rm)\b.*pre-running)/imu);
    expect(JSON.stringify({ currentDescriptor, oauthCleanupLog })).not.toContain(
      String(fullLocalOauthSecrets.google_client_secret),
    );
    rmSync(resumeFaultModePath, { force: true });
    rmSync(dockerStartedPath, { force: true });
    const failureEvidenceRoot = join(state.releaseRoot, "resume-failures");
    const failureEvidence = readdirSync(failureEvidenceRoot)
      .filter((name) => name !== "recovery-required.json")
      .map((name) => readFileSync(join(failureEvidenceRoot, name), "utf8"));
    expect(failureEvidence.length).toBeGreaterThanOrEqual(6);
    expect(failureEvidence.every((value) =>
      JSON.parse(value).cleanup.volumes_removed === false)).toBe(true);
    expect(failureEvidence.join("\n")).not.toContain(
      String(fullLocalOauthSecrets.google_client_secret),
    );
  }, 120_000);
});
