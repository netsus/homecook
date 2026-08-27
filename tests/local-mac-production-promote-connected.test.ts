import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
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

function writePrepare(root: string, manifest: Record<string, unknown>, manifestBytes: Buffer) {
  mkdirSync(join(root, ".git"), { recursive: true, mode: 0o700 });
  mkdirSync(join(root, ".next"), { recursive: true, mode: 0o700 });
  for (const file of [
    "scripts/start-local-mac-production.mjs",
    "scripts/start-production.mjs",
    "scripts/full-local-production-runtime.mjs",
    ".env.production.local",
    "infra/full-local-supabase/.env.production.local",
  ]) {
    const path = join(root, file);
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

function workerFixture(root: string, identity: Record<string, string>, legacy = false) {
  const artifactRoot = join(root, "artifact");
  const secretRoot = join(root, "secrets");
  mkdirSync(secretRoot, { recursive: true, mode: 0o700 });
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
  const appDescriptorPath = join(root, "app.json");
  writeFileSync(appDescriptorPath, JSON.stringify(buildYoutubeExtractionAppDescriptor({
    releaseSha: identity.release_sha,
    expectedPolicySnapshotDigest: allowed,
    artifactSha256: artifact.artifact_sha256,
    expectedSchemaSha256: artifact.expected_schema_sha256,
  })), { mode: 0o600 });
  const policyPath = join(root, "policy.json");
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
  it("promotes exact e02 legacy state and then consumes the v2 descriptor on the next promotion", async () => {
    const homeDir = temp("homecook-connected-home-");
    const repoRoot = temp("homecook-connected-repo-");
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
    const fullConfig = join(homeDir, "full-local.env");
    writeFileSync(fullConfig, "fixture\n", { mode: 0o600 });
    writeFileSync(getLocalMacProductionPaths(homeDir).plistPath, renderLocalMacProductionPlist({ homeDir, nodeBin: process.execPath, rootDir: currentRoot }), { mode: 0o644 });
    writeFileSync(getFullLocalLaunchAgentPaths(homeDir).plistPath, renderFullLocalLaunchAgentPlist({ configPath: fullConfig, homeDir, includeReleaseIdentity: false, nodeBin: process.execPath, rootDir: currentRoot, runtimeCommand: "start" }), { mode: 0o600 });
    writeFileSync(getYoutubeExtractionWorkerPaths(homeDir).plistPath, renderYoutubeExtractionWorkerPlist({ ...legacyWorker, homeDir, nodeBin: process.execPath, rootDir: legacyWorker.artifactRoot, currentPolicyPath: legacyWorker.policyPath }), { mode: 0o600 });

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
      if (command === process.execPath) {
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
      const manifest = createLocalMacProductionReleaseManifest(manifestPath, { ...identity, previous_release_sha: previousSha, release_tag: `prod-2026082${index}.1`, release_tag_object_sha: index === 1 ? "2".repeat(40) : "3".repeat(40), signer_digest: identity.release_sha, master_sha_at_approval: identity.release_sha });
      const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
      writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });
      const candidateRoot = join(state.releaseRoot, String(manifest.release_tag));
      mkdirSync(candidateRoot, { mode: 0o700 });
      writePrepare(candidateRoot, manifest, manifestBytes);
      const worker = workerFixture(temp(`homecook-connected-worker-v2-${index}-`), identity);
      const adapters = createLocalMacProductionPromoteAdapters({ confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL", bundlePath: join(repoRoot, "bundle"), subjectManifestPath: join(repoRoot, "subject"), trustedRootPath: join(process.cwd(), "tests/fixtures/github-attestation-trusted-root.jsonl"), fullLocalConfigPath: fullConfig, homeDir, nodeBin: process.execPath, workerConfigPath: worker.configPath, workerManifestPath: worker.manifestPath, workerCredentialPath: worker.credentialPath, workerAppDescriptorPath: worker.appDescriptorPath, workerPolicyPath: worker.policyPath, workerExpectedSchemaPath: worker.expectedSchemaPath, workerSecretRoot: worker.secretRoot }, { commandRunner, i031PreflightVerifier: vi.fn(async () => ({ codexCliVersion: "0.144.0-alpha.4" })), appReadinessWaiter: vi.fn(async () => undefined) });
      const promoteOptions = { ...adapters, homeDir, manifestPath, rootDir: repoRoot, runCommand: commandRunner, readGitEvidence: () => createLocalMacProductionGitEvidence({ releaseSha: identity.release_sha, releaseTree: identity.release_tree, overrides: { releaseTagObjectSha: manifest.release_tag_object_sha } }), verifyAttestation: () => ({ verified: true, source: "fixture" }), lockToken: `${index}${index}${index}${index}${index}${index}${index}${index}-1111-4111-8111-111111111111` } as unknown as Parameters<typeof promoteLocalMacProductionRelease>[0];
      return promoteLocalMacProductionRelease(promoteOptions);
    };

    const first = await runPromotion(1, E02);
    const firstDescriptor = JSON.parse(readFileSync(state.currentDescriptorPath, "utf8"));
    expect(first.promoted).toBe(true);
    expect(firstDescriptor.release_sha).toBe("a".repeat(40));
    expect(firstDescriptor.worker_artifact_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(firstDescriptor)).not.toMatch(/credential_path|secret_root|config_path|policy_path/u);
    const second = await runPromotion(2, "a".repeat(40));
    expect(second.promoted).toBe(true);
    expect(JSON.parse(readFileSync(state.previousDescriptorPath, "utf8"))).toEqual(firstDescriptor);
    expect(JSON.parse(readFileSync(state.currentDescriptorPath, "utf8"))).toMatchObject({ release_sha: "f".repeat(40), promotion_id: "promotion-2" });
    expect(calls.findIndex((call) => call.includes(" start "))).toBeLessThan(calls.findIndex((call) => call.includes("bootstrap") && call.includes("com.homecook.production")));
  }, 120_000);
});
