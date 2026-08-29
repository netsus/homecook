import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

import {
  buildCandidateManifest,
  buildBundleAuthorityManifest,
  buildCandidateSandboxProfile,
  buildReleaseRehearsalCandidate,
  createSealedCandidateBundle,
  assembleCandidateArtifacts,
  collectSealedMigrationInventory,
  materializeExactGitTree,
  loadRehearsalToolchainLock,
  parseCanonicalComposeImageInventory,
  writeCandidateTerminalMarker,
  parseAndValidateCandidateManifest,
  readBuildEnvironmentSnapshot,
  readCompletedCandidateRoot,
  validateCandidateCiEvidence,
  validateCandidateImages,
  validateCandidateSourceEvidence,
  validateCandidateToolchain,
  validateProductionGuardSnapshots,
  validatePinnedSupabaseCliIdentity,
  validateCandidateDockerReadOnlyArgs,
  validateStableCiSnapshots,
  validateSandboxedBuildResult,
  validateCandidateBuilderAuthority,
  validateCandidateBundleCrossBinding,
  validateStoredCiProjection,
  readSealedAuthorityFile,
  snapshotTrustedPnpmArtifact,
  validatePinnedPnpmArtifactIdentity,
  runObservedSandboxCommand,
  resolvePinnedPnpmArtifact,
} from "../scripts/lib/local-mac-production-rehearsal-candidate.mjs";
import { canonicalizeJcs } from "../scripts/lib/rfc8785-jcs.mjs";
import { materializeImmutableCandidateBootstrap } from "../scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const RUN_A = "00000000-0000-4000-8000-000000000001";
const RUN_B = "00000000-0000-4000-8000-000000000002";
const RUN_TOOL_CHANGE = "00000000-0000-4000-8000-000000000003";
const RUN_FAILED = "00000000-0000-4000-8000-000000000006";

function privateRoot(prefix = "homecook-candidate-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  chmodSync(root, 0o700);
  return realpathSync(root);
}

function tool(name: string) {
  return {
    version: `${name}-1`,
    realpath: `/trusted/${name}`,
    device: "1",
    inode: "2",
    mode: 0o500,
    ctime: "2026-08-29T00:00:00.000Z",
    size: "3",
    sha256: DIGEST_A,
  };
}

function validToolchain() {
  return {
    node: tool("node"),
    pnpm: tool("pnpm"),
    supabase_cli: tool("supabase"),
    git: tool("git"),
    gh: tool("gh"),
    docker_client: tool("docker-client"),
    docker_daemon: tool("docker-daemon"),
    launchctl: tool("launchctl"),
    lsof: tool("lsof"),
    audit_log: tool("audit-log"),
    sandbox_exec: tool("sandbox-exec"),
    candidate_builder: tool("candidate-builder"),
  };
}

function validCiEvidence() {
  const safeProjection = {
    repository: "netsus/homecook",
    head_sha: SHA_A,
    remote_master_sha: SHA_A,
    check_runs: [{
      id: 11,
      app_id: 15368,
      check_suite_id: 21,
      head_sha: SHA_A,
      name: "build",
      status: "completed",
      conclusion: "success",
      started_at: "2026-08-29T00:00:00Z",
      completed_at: "2026-08-29T00:01:00Z",
    }],
    commit_statuses: [],
    summary: { total: 1, success: 1, intended_skip: 0, bad: 0, cancelled: 0, failed: 0, pending: 0, queued: 0, rerun: 0 },
  };
  return {
    head_sha: SHA_A,
    expected_head_sha: SHA_A,
    remote_master_sha: SHA_A,
    summary_digest: DIGEST_A,
    suite_run_set_digest: DIGEST_B,
    safe_projection_digest: DIGEST_C,
    safe_projection: safeProjection,
    summary: safeProjection.summary,
  };
}

function validManifestInput() {
  return {
    schema: "homecook.local-mac-production-rehearsal-candidate.v1",
    canonicalization: "RFC8785-JCS+SHA256",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    release_sha: SHA_A,
    release_tree: SHA_B,
    ci_check_summary_digest: DIGEST_A,
    ci_snapshot_digest: DIGEST_B,
    ci_suite_run_set_digest: DIGEST_C,
    source_manifest_digest: DIGEST_A,
    sandbox_policy_digest: DIGEST_B,
    build_id: `candidate-${SHA_A}`,
    sealed_bundle_digest: DIGEST_B,
    bundle_manifest_digest: DIGEST_C,
    toolchain: validToolchain(),
    build_tools: { next_cli: tool("next-cli") },
    toolchain_lock_digest: DIGEST_B,
    images: [{
      service: "fixture",
      reference: `example/fixture@sha256:${DIGEST_A}`,
      digest: `sha256:${DIGEST_A}`,
      platform: "linux/arm64",
      image_id: `sha256:${DIGEST_C}`,
      local_cache_provenance_digest: DIGEST_B,
    }],
    migration: {
      ordered_migration_files: ["supabase/migrations/20260101000000_fixture.sql"],
      ordered_migration_files_digest: DIGEST_A,
      migration_head: "20260101000000_fixture",
    },
    artifacts: {
      app: { root: "app", digest: DIGEST_A },
      full_local: { root: "full_local", digest: DIGEST_B },
      worker: { root: "worker", digest: DIGEST_C },
    },
    file_inventory: [{
      component: "app",
      source_kind: "tracked_source",
      path: "package.json",
      type: "file",
      mode: 0o400,
      uid: "501",
      gid: "20",
      nlink: "1",
      device: "1",
      inode: "2",
      size: "3",
      ctime: "2026-08-29T00:00:00.000Z",
      sha256: DIGEST_A,
      symlink_target: null,
      dereferenced_sha256: null,
    }],
    environment_snapshot: {
      source_allowlist_id: "homecook-release-rehearsal-build-env-v1",
      opaque_source_identity_digest: DIGEST_A,
      opaque_override_digest: DIGEST_B,
      exposed_value_count: 0,
    },
    production_guard: {
      snapshot_schema: "homecook.local-mac-production-surface-snapshot.v1",
      production_snapshot_pre_digest: DIGEST_A,
      production_snapshot_post_digest: DIGEST_A,
      equal: true,
      mutation_attempt_count: 0,
      production_db_connection_count: 0,
      production_db_write_count: 0,
    },
    candidate_identity_digest: DIGEST_A,
  };
}

describe("release rehearsal candidate manifest", () => {
  it("publishes a closed JSON schema for the exact candidate manifest", () => {
    const schema = JSON.parse(readFileSync(
      "scripts/schemas/local-mac-production-rehearsal-candidate.schema.json",
      "utf8",
    ));
    expect(schema).toMatchObject({
      $id: "homecook.local-mac-production-rehearsal-candidate.v1",
      type: "object",
      additionalProperties: false,
      required: expect.arrayContaining([
        "release_sha",
        "release_tree",
        "ci_check_summary_digest",
        "ci_snapshot_digest",
        "ci_suite_run_set_digest",
        "source_manifest_digest",
        "sandbox_policy_digest",
        "sealed_bundle_digest",
        "bundle_manifest_digest",
        "toolchain",
        "build_tools",
        "toolchain_lock_digest",
        "images",
        "migration",
        "artifacts",
        "file_inventory",
        "environment_snapshot",
        "candidate_identity_digest",
        "manifest_digest",
      ]),
    });
    expect(schema.properties.toolchain.additionalProperties).toBe(false);
    expect(schema.properties.artifacts.required).toEqual(["app", "full_local", "worker"]);
    expect(schema.properties.production_guard.properties.mutation_attempt_count.const).toBe(0);
  });

  it("builds and validates a closed RFC8785-bound candidate manifest", () => {
    const manifest = buildCandidateManifest(validManifestInput());
    const parsed = parseAndValidateCandidateManifest(canonicalizeJcs(manifest));

    expect(parsed).toEqual(manifest);
    expect(parsed.manifest_digest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("rejects unknown, duplicate, missing, and digest-tampered fields", () => {
    const manifest = buildCandidateManifest(validManifestInput());
    const missing = { ...manifest };
    delete (missing as Partial<typeof manifest>).repository;

    expect(() => parseAndValidateCandidateManifest(canonicalizeJcs({ ...manifest, secret: "x" })))
      .toThrow(/unknown|secret/iu);
    expect(() => parseAndValidateCandidateManifest(
      canonicalizeJcs(manifest).replace('"repository":', '"repository":"netsus/homecook","repository":'),
    )).toThrow(/duplicate/iu);
    expect(() => parseAndValidateCandidateManifest(canonicalizeJcs(missing)))
      .toThrow(/missing|repository/iu);
    expect(() => parseAndValidateCandidateManifest(canonicalizeJcs({ ...manifest, build_id: "changed" })))
      .toThrow(/digest/iu);
  });

  it("rejects malformed UTF-8 candidate bytes before JCS parsing", () => {
    const manifest = buildCandidateManifest(validManifestInput());
    const bytes = Buffer.from(canonicalizeJcs(manifest));
    const invalid = Buffer.concat([bytes.subarray(0, bytes.length - 2), Buffer.from([0xff]), bytes.subarray(bytes.length - 2)]);
    expect(() => parseAndValidateCandidateManifest(invalid)).toThrow(/utf-?8|encoding/iu);
  });

  it("keeps runtime and JSON schema aligned for path, mode, and decimal identities", () => {
    const manifest = buildCandidateManifest(validManifestInput());
    const schema = JSON.parse(readFileSync(
      "scripts/schemas/local-mac-production-rehearsal-candidate.schema.json",
      "utf8",
    ));
    const require = createRequire(import.meta.url);
    const eslintPackage = require.resolve("@eslint/eslintrc/package.json");
    const Ajv = require(require.resolve("ajv", { paths: [eslintPackage] }));
    const schemaForAjv6 = { ...schema };
    delete schemaForAjv6.$schema;
    const validate = new Ajv({ allErrors: true, schemaId: "auto" }).compile(schemaForAjv6);
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);

    const attacks = [
      { ...manifest, artifacts: { ...manifest.artifacts, app: { ...manifest.artifacts.app, root: "/tmp/escape" } } },
      { ...manifest, file_inventory: [{ ...manifest.file_inventory[0], path: "../escape" }] },
      { ...manifest, file_inventory: [{ ...manifest.file_inventory[0], mode: 4096 }] },
      { ...manifest, file_inventory: [{ ...manifest.file_inventory[0], nlink: "2" }] },
      { ...manifest, file_inventory: [{ ...manifest.file_inventory[0], uid: "-1" }] },
      { ...manifest, file_inventory: [{ ...manifest.file_inventory[0], inode: "not-decimal" }] },
      { ...manifest, toolchain: { ...manifest.toolchain, git: { ...manifest.toolchain.git, mode: 0o522 } } },
      { ...manifest, toolchain: { ...manifest.toolchain, git: { ...manifest.toolchain.git, device: "not-decimal" } } },
    ];
    for (const attack of attacks) {
      expect(validate(attack), JSON.stringify(validate.errors)).toBe(false);
    }

    expect(() => buildCandidateManifest({
      ...validManifestInput(),
      toolchain: { ...validToolchain(), git: { ...tool("git"), device: "not-decimal" } },
    })).toThrow(/device|decimal|identity/iu);
    expect(() => buildCandidateManifest({
      ...validManifestInput(),
      toolchain: { ...validToolchain(), git: { ...tool("git"), mode: 0o711 } },
    })).toThrow(/mode|trusted|tool/iu);
    expect(() => buildCandidateManifest({
      ...validManifestInput(),
      file_inventory: [{ ...validManifestInput().file_inventory[0], mode: 4096 }],
    })).toThrow(/mode|safe|4095/iu);
    expect(() => buildCandidateManifest({
      ...validManifestInput(),
      file_inventory: [{ ...validManifestInput().file_inventory[0], nlink: "2" }],
    })).toThrow(/nlink|hard.?link|exactly one/iu);
  });
});

describe("release rehearsal candidate input gates", () => {
  it("loads candidate modules and locks only from the exact immutable Git object", () => {
    const repo = privateRoot("homecook-bootstrap-repo-");
    const gitHome = privateRoot("homecook-bootstrap-git-home-");
    const runGit = (args: string[]) => {
      const result = spawnSync("/usr/bin/git", args, {
        cwd: repo,
        encoding: "utf8",
        env: { HOME: gitHome, PATH: "/usr/bin:/bin", NODE_ENV: "test", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
      });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    runGit(["init"]);
    runGit(["config", "user.email", "fixture@example.invalid"]);
    runGit(["config", "user.name", "Fixture"]);
    mkdirSync(join(repo, "scripts", "lib"), { recursive: true, mode: 0o700 });
    mkdirSync(join(repo, "scripts", "config"), { recursive: true, mode: 0o700 });
    writeFileSync(join(repo, "scripts", "entry.mjs"), "export const authority = 'exact'\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "lib", "candidate.mjs"), "export const candidate = 'exact'\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "config", "lock.json"), "{}", { mode: 0o600 });
    runGit(["add", "."]);
    runGit(["commit", "-m", "fixture"]);
    const releaseSha = runGit(["rev-parse", "HEAD"]);
    writeFileSync(join(repo, "scripts", "entry.mjs"), "throw new Error('dirty launcher')\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "lib", "candidate.mjs"), "throw new Error('dirty candidate')\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "config", "lock.json"), "{\"dirty\":true}", { mode: 0o600 });

    const outputRoot = join(privateRoot("homecook-bootstrap-output-"), "source");
    const result = materializeImmutableCandidateBootstrap({
      gitPath: "/usr/bin/git",
      tarPath: "/usr/bin/tar",
      repositoryRoot: repo,
      releaseSha,
      outputRoot,
      homeDir: gitHome,
    });
    expect(readFileSync(join(outputRoot, "scripts", "entry.mjs"), "utf8")).toContain("authority = 'exact'");
    expect(readFileSync(join(outputRoot, "scripts", "lib", "candidate.mjs"), "utf8")).toContain("candidate = 'exact'");
    expect(readFileSync(join(outputRoot, "scripts", "config", "lock.json"), "utf8")).toBe("{}");
    expect(result.release_sha).toBe(releaseSha);
  });

  it("requires stable pre/post remote-master and full CI run/status identity", () => {
    const projection = {
      repository: "netsus/homecook",
      head_sha: SHA_A,
      remote_master_sha: SHA_A,
      check_runs: [{
        id: 11,
        check_suite_id: 21,
        app_id: 15368,
        head_sha: SHA_A,
        name: "build",
        status: "completed",
        conclusion: "success",
        started_at: "2026-08-29T00:00:00Z",
        completed_at: "2026-08-29T00:01:00Z",
      }],
      commit_statuses: [{ id: 31, sha: SHA_A, context: "external", state: "success" }],
    };
    const evidence = {
      expected_head_sha: SHA_A,
      head_sha: SHA_A,
      remote_master_sha: SHA_A,
      summary: { total: 1, success: 1, intended_skip: 0, bad: 0, cancelled: 0, failed: 0, pending: 0, queued: 0, rerun: 0 },
      summary_digest: DIGEST_A,
      suite_run_set_digest: DIGEST_B,
      safe_projection: projection,
      safe_projection_digest: DIGEST_C,
    };
    expect(validateStableCiSnapshots(evidence, structuredClone(evidence), SHA_A))
      .toMatchObject({ summary_digest: DIGEST_A, safe_projection_digest: DIGEST_C });
    expect(() => validateStableCiSnapshots(evidence, {
      ...structuredClone(evidence),
      remote_master_sha: SHA_B,
    }, SHA_A)).toThrow(/master|drift|sha/iu);
    expect(() => validateStableCiSnapshots(evidence, {
      ...structuredClone(evidence),
      safe_projection_digest: DIGEST_B,
      suite_run_set_digest: DIGEST_C,
    }, SHA_A)).toThrow(/ci|suite|run|drift|projection/iu);
    const wrongHead = structuredClone(evidence);
    wrongHead.safe_projection.check_runs[0].head_sha = SHA_B;
    expect(() => validateStableCiSnapshots(wrongHead, wrongHead, SHA_A))
      .toThrow(/head|sha/iu);
  });

  it("accounts for every Compose service and rejects tag-only, build, missing-image, and mixed input", () => {
    const valid = `services:\n  app:\n    image: example/app@sha256:${DIGEST_A}\n    platform: \${FULL_LOCAL_DOCKER_PLATFORM:?required}\n  db:\n    image: example/db@sha256:${DIGEST_B}\n    platform: \${FULL_LOCAL_DOCKER_PLATFORM:?required}\nnetworks:\n  internal:\n`;
    expect(parseCanonicalComposeImageInventory(valid)).toEqual([
      { service: "app", reference: `example/app@sha256:${DIGEST_A}`, digest: `sha256:${DIGEST_A}`, platform_expression: "${FULL_LOCAL_DOCKER_PLATFORM:?required}" },
      { service: "db", reference: `example/db@sha256:${DIGEST_B}`, digest: `sha256:${DIGEST_B}`, platform_expression: "${FULL_LOCAL_DOCKER_PLATFORM:?required}" },
    ]);
    for (const invalid of [
      valid.replace(`example/db@sha256:${DIGEST_B}`, "example/db:latest"),
      valid.replace(`    image: example/db@sha256:${DIGEST_B}\n`, "    build: .\n"),
      valid.replace(`    image: example/db@sha256:${DIGEST_B}\n`, ""),
      `${valid.replace("networks:", "  taggy:\n    image: example/taggy:latest\nnetworks:")}`,
      `${valid.replace("networks:", "  taggy: { image: example/taggy:latest }\nnetworks:")}`,
      `${valid.replace("networks:", "  merged:\n    <<: *defaults\nnetworks:")}`,
      `${valid.replace("networks:", "  templated:\n    image: \${IMAGE_REF}\n    platform: linux/arm64\nnetworks:")}`,
      `${valid.replace("networks:", `  "hidden":\n    image: example/hidden@sha256:${DIGEST_C}\n    platform: linux/arm64\nnetworks:`)}`,
      `${valid}\nservices:\n  duplicate:\n    image: example/duplicate@sha256:${DIGEST_C}\n    platform: linux/arm64\n`,
      `${valid.replace("  db:", "  app:")}`,
      `${valid.replace("    image:", "\timage:")}`,
      `${valid.replace(`example/db@sha256:${DIGEST_B}`, `>\n      example/db@sha256:${DIGEST_B}`)}`,
      `${valid.replace(`    image: example/app@sha256:${DIGEST_A}`, `    image: example/app@sha256:${DIGEST_A}\n    "image": example/attacker:latest`)}`,
      `${valid.replace(`    image: example/app@sha256:${DIGEST_A}`, `    'image': example/attacker:latest\n    image: example/app@sha256:${DIGEST_A}`)}`,
      `${valid.replace("    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}", "    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}\n    \"platform\": linux/amd64")}`,
      `${valid.replace("    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}", "    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}\n    \"build\": .")}`,
      `${valid.replace("    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}", "    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}\n    \"environment\": {}")}`,
      `${valid.replace("    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}", "    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}\n    'other': ignored")}`,
    ]) {
      expect(() => parseCanonicalComposeImageInventory(invalid))
        .toThrow(/image|digest|tag|build|service|complete|section|duplicate|unsupported/iu);
    }
  });

  it("allows only exact Docker version and digest inspect argv outside the build sandbox", () => {
    expect(validateCandidateDockerReadOnlyArgs(["version", "--format", "{{json .}}"]))
      .toEqual(["version", "--format", "{{json .}}"]);
    expect(validateCandidateDockerReadOnlyArgs([
      "image", "inspect", `example/app@sha256:${DIGEST_A}`, "--format", "{{json .}}",
    ])).toHaveLength(5);
    for (const args of [
      ["pull", "example/app:latest"],
      ["run", "example/app:latest"],
      ["image", "inspect", "example/app:latest", "--format", "{{json .}}"],
      ["inspect", "container-id"],
    ]) {
      expect(() => validateCandidateDockerReadOnlyArgs(args)).toThrow(/docker|allowlist|digest|read-only/iu);
    }
  });

  it("rejects a sandboxed child that ignores a denied network, socket, or process attempt", () => {
    expect(() => validateSandboxedBuildResult({
      status: 0,
      signal: null,
      stdout: "build continued",
      stderr: "",
      observed_denials: [{ operation: "network-outbound", process: "node" }],
    }, "fixture build")).toThrow(/sandbox|denied|network|attempt/iu);
    expect(validateSandboxedBuildResult({
      status: 0,
      signal: null,
      stdout: "ok",
      stderr: "",
      observed_denials: [],
    }, "fixture build")).toMatchObject({ audit_digest: expect.stringMatching(/^[0-9a-f]{64}$/u) });

    if (process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec") && existsSync("/usr/bin/log")) {
      const root = privateRoot("homecook-observed-denial-");
      const deniedRoot = join(root, "denied");
      mkdirSync(deniedRoot, { mode: 0o700 });
      const profile = buildCandidateSandboxProfile({
        readRoots: [root, process.execPath],
        writeRoots: [root],
        deniedPaths: [deniedRoot],
      });
      const script = `try { require("fs").writeFileSync(${JSON.stringify(join(deniedRoot, "swallowed"))}, "x") } catch {}\ntry { const socket=require("net").connect({host:"127.0.0.1",port:9}); socket.on("error",()=>{}) } catch {}\nsetTimeout(()=>process.exit(0),100)`;
      expect(() => runObservedSandboxCommand({
        sandboxPath: "/usr/bin/sandbox-exec",
        logPath: "/usr/bin/log",
        profile,
        command: process.execPath,
        args: ["-e", script],
        cwd: root,
        env: { HOME: root, PATH: "/usr/bin:/bin" },
        label: "ignored denial fixture",
      })).toThrow(/observed|denied|sandbox|attempt/iu);
      expect(existsSync(join(deniedRoot, "swallowed"))).toBe(false);
    }
  });

  it("loads the canonical tool lock and rejects self-reported Supabase identity without the pinned binary digest", () => {
    const lock = loadRehearsalToolchainLock(
      "scripts/config/local-mac-production-rehearsal-toolchain-lock.json",
    );
    expect(lock).toMatchObject({
      schema: "homecook.local-mac-production-rehearsal-toolchain-lock.v1",
      platform: "darwin-arm64",
      node: {
        version: "v22.13.1",
        binary_sha256: "79de4c62eb09c9cf7859e4a5fb27502f209533b54fa6a97f5a791015798282c0",
      },
      pnpm: {
        version: "10.32.1",
        entrypoint: "bin/pnpm.cjs",
        artifact_tree_sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      supabase_cli: {
        version: "2.110.0",
        binary_sha256: "d28538b3442e6c236fa8b8132e03dbdb240cc56c5594efd4778e09ab48fb8c96",
      },
    });
    expect(() => validatePinnedSupabaseCliIdentity({
      ...tool("supabase"), version: "2.110.0",
    }, lock)).toThrow(/digest|pinned|supabase/iu);
    expect(validatePinnedSupabaseCliIdentity({
      ...tool("supabase"),
      version: "2.110.0",
      sha256: lock.supabase_cli.binary_sha256,
    }, lock)).toMatchObject({ version: "2.110.0", sha256: lock.supabase_cli.binary_sha256 });

    const artifactRoot = privateRoot("homecook-pnpm-artifact-");
    mkdirSync(join(artifactRoot, "bin"), { mode: 0o700 });
    mkdirSync(join(artifactRoot, "dist"), { mode: 0o700 });
    writeFileSync(join(artifactRoot, "bin", "pnpm.cjs"), "require('../dist/pnpm.cjs')\n", { mode: 0o500 });
    writeFileSync(join(artifactRoot, "dist", "pnpm.cjs"), "export {}\n", { mode: 0o400 });
    const before = snapshotTrustedPnpmArtifact(artifactRoot, "bin/pnpm.cjs", "10.32.1");
    chmodSync(join(artifactRoot, "dist", "pnpm.cjs"), 0o600);
    writeFileSync(join(artifactRoot, "dist", "pnpm.cjs"), "export const changed = true\n", { mode: 0o400 });
    chmodSync(join(artifactRoot, "dist", "pnpm.cjs"), 0o400);
    const after = snapshotTrustedPnpmArtifact(artifactRoot, "bin/pnpm.cjs", "10.32.1");
    expect(after.sha256).not.toBe(before.sha256);
    expect(() => validatePinnedPnpmArtifactIdentity(after, {
      version: "10.32.1",
      entrypoint: "bin/pnpm.cjs",
      artifact_tree_sha256: before.sha256,
    })).toThrow(/pnpm|artifact|digest|pinned/iu);
    expect(resolvePinnedPnpmArtifact).toBeTypeOf("function");
    expect(() => resolvePinnedPnpmArtifact(privateRoot("homecook-empty-pnpm-home-"), lock.pnpm))
      .toThrow(/pnpm|artifact|missing|offline|approved/iu);
  });

  it("materializes exact Git blobs and excludes filters plus untracked executable/migration injection", () => {
    const repo = privateRoot("homecook-candidate-git-object-");
    const gitHome = privateRoot("homecook-candidate-git-home-");
    const runGit = (args: string[]) => {
      const result = spawnSync("/usr/bin/git", args, {
        cwd: repo,
        encoding: "utf8",
        env: { HOME: gitHome, PATH: "/usr/bin:/bin", NODE_ENV: "test", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
      });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    runGit(["init"]);
    runGit(["config", "user.email", "fixture@example.invalid"]);
    runGit(["config", "user.name", "Fixture"]);
    mkdirSync(join(repo, "scripts"), { mode: 0o700 });
    mkdirSync(join(repo, "supabase", "migrations"), { recursive: true, mode: 0o700 });
    writeFileSync(join(repo, ".gitattributes"), "filtered.txt filter=evil\n", { mode: 0o600 });
    writeFileSync(join(repo, "filtered.txt"), "original blob bytes\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "run.mjs"), "export {};\n", { mode: 0o700 });
    writeFileSync(join(repo, "supabase", "migrations", "20260101000000_base.sql"), "select 1;\n", { mode: 0o600 });
    symlinkSync("filtered.txt", join(repo, "filtered-link"));
    runGit(["add", "."]);
    runGit(["commit", "-m", "fixture"]);
    const releaseSha = runGit(["rev-parse", "HEAD"]);
    writeFileSync(join(gitHome, ".gitconfig"), "[filter \"evil\"]\n\tsmudge = /usr/bin/sed s/original/tampered/\n\trequired = true\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "untracked.mjs"), "throw new Error('injected');\n", { mode: 0o700 });
    writeFileSync(join(repo, "supabase", "migrations", "20260102000000_injected.sql"), "select injected;\n", { mode: 0o600 });

    const materializedRoot = join(privateRoot("homecook-candidate-materialized-"), "source");
    const materialized = materializeExactGitTree({
      gitPath: "/usr/bin/git",
      repositoryRoot: repo,
      releaseSha,
      outputRoot: materializedRoot,
      homeDir: gitHome,
    });
    expect(readFileSync(join(materializedRoot, "filtered.txt"), "utf8")).toBe("original blob bytes\n");
    expect(readlinkSync(join(materializedRoot, "filtered-link"))).toBe("filtered.txt");
    expect(lstatSync(join(materializedRoot, "scripts", "run.mjs")).mode & 0o111).not.toBe(0);
    expect(existsSync(join(materializedRoot, "scripts", "untracked.mjs"))).toBe(false);
    expect(existsSync(join(materializedRoot, "supabase", "migrations", "20260102000000_injected.sql"))).toBe(false);
    expect(materialized.source_manifest.entries).toContainEqual(expect.objectContaining({
      path: "filtered.txt",
      git_mode: "100644",
      blob_oid: expect.stringMatching(/^[0-9a-f]{40}$/u),
    }));

    const generatedRoot = privateRoot("homecook-candidate-generated-");
    mkdirSync(join(generatedRoot, ".next"), { mode: 0o700 });
    mkdirSync(join(generatedRoot, "node_modules"), { mode: 0o700 });
    writeFileSync(join(generatedRoot, ".next", "BUILD_ID"), "fixture-build\n", { mode: 0o600 });
    writeFileSync(join(generatedRoot, "node_modules", "runtime.js"), "export {};\n", { mode: 0o600 });
    writeFileSync(join(materializedRoot, "scripts", "late-untracked.mjs"), "throw new Error('late');\n", { mode: 0o700 });
    writeFileSync(join(materializedRoot, "supabase", "migrations", "20260103000000_late.sql"), "select late;\n", { mode: 0o600 });

    const artifacts = assembleCandidateArtifacts({
      sourceRoot: materializedRoot,
      generatedRoot,
      sourceManifest: materialized.source_manifest,
      artifactsRoot: join(privateRoot("homecook-candidate-assembled-"), "artifacts"),
    });
    expect(existsSync(join(artifacts.app, "scripts", "late-untracked.mjs"))).toBe(false);
    expect(existsSync(join(artifacts.full_local, "supabase", "migrations", "20260103000000_late.sql"))).toBe(false);

    const sealed = createSealedCandidateBundle({
      bundleRoot: join(privateRoot("homecook-candidate-git-sealed-"), "bundle"),
      componentRoots: {
        app: artifacts.app,
        full_local: artifacts.full_local,
        worker: artifacts.worker_fixture,
      },
    });
    const migration = collectSealedMigrationInventory({
      bundleRoot: sealed.bundle_root,
    });
    expect(migration.ordered_migration_files).toEqual([
      "supabase/migrations/20260101000000_base.sql",
    ]);
  });

  it("requires the exact fetched origin/master SHA/tree and clean detached race-free source", () => {
    const valid = {
      requested_sha: SHA_A,
      origin_master_sha: SHA_A,
      checkout_sha: SHA_A,
      release_tree: SHA_B,
      checkout_tree: SHA_B,
      detached: true,
      clean: true,
      tracked_symlinks_contained: true,
      hardlink_count: 0,
      source_snapshot_pre_digest: DIGEST_A,
      source_snapshot_post_digest: DIGEST_A,
    };
    expect(validateCandidateSourceEvidence(valid)).toEqual(valid);

    for (const patch of [
      { origin_master_sha: SHA_B },
      { checkout_sha: SHA_B },
      { checkout_tree: SHA_A },
      { detached: false },
      { clean: false },
      { tracked_symlinks_contained: false },
      { hardlink_count: 1 },
      { source_snapshot_post_digest: DIGEST_B },
    ]) {
      expect(() => validateCandidateSourceEvidence({ ...valid, ...patch }))
        .toThrow(/sha|tree|detached|clean|symlink|hardlink|drift|source/iu);
    }
  });

  it("requires builder, CLI, and tool lock bytes from the exact clean candidate Git authority", () => {
    const entries = [
      "scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs",
      "scripts/local-mac-production-rehearsal.mjs",
      "scripts/lib/local-mac-production-rehearsal-candidate.mjs",
      "scripts/config/local-mac-production-rehearsal-toolchain-lock.json",
    ].map((path) => ({ path, sha256: DIGEST_A }));
    expect(validateCandidateBuilderAuthority({
      currentHead: SHA_A,
      releaseSha: SHA_A,
      trackedStatus: "",
      sourceManifestDigest: DIGEST_B,
      verifiedSourceManifestDigest: DIGEST_B,
      entries,
    })).toMatchObject({ builder_input_digest: expect.stringMatching(/^[0-9a-f]{64}$/u) });
    for (const patch of [{ currentHead: SHA_B }, { trackedStatus: " M scripts/lib/local-mac-production-rehearsal-candidate.mjs" }]) {
      expect(() => validateCandidateBuilderAuthority({
        currentHead: SHA_A,
        releaseSha: SHA_A,
        trackedStatus: "",
        sourceManifestDigest: DIGEST_B,
        verifiedSourceManifestDigest: DIGEST_B,
        entries,
        ...patch,
      })).toThrow(/builder|head|dirty|authority|Git/iu);
    }
  });

  it("requires every current-head started check and status to be terminal success", () => {
    const valid = {
      head_sha: SHA_A,
      expected_head_sha: SHA_A,
      summary_digest: DIGEST_A,
      summary: { total: 2, success: 2, intended_skip: 0, bad: 0, cancelled: 0, failed: 0, pending: 0, queued: 0, rerun: 0 },
    };
    expect(validateCandidateCiEvidence(valid)).toEqual(valid);

    for (const patch of [
      { head_sha: SHA_B },
      { summary: { ...valid.summary, total: 2, success: 1, pending: 1 } },
      { summary: { ...valid.summary, total: 2, success: 1, failed: 1 } },
      { summary: { ...valid.summary, total: 2, success: 1, intended_skip: 1 } },
    ]) {
      expect(() => validateCandidateCiEvidence({ ...valid, ...patch }))
        .toThrow(/head|pending|failed|skip|terminal|success/iu);
    }
  });

  it("rejects unsafe or drifting trusted tools and tag-only/mismatched images", () => {
    expect(validateCandidateToolchain(validToolchain())).toEqual(validToolchain());
    expect(() => validateCandidateToolchain({ ...validToolchain(), git: { ...tool("git"), mode: 0o522 } }))
      .toThrow(/mode|writable|trusted/iu);
    expect(() => validateCandidateToolchain({ ...validToolchain(), git: { ...tool("git"), realpath: "/trusted/link" , symlink: true } }))
      .toThrow(/symlink|trusted/iu);
    expect(() => validateCandidateToolchain({ ...validToolchain(), git: { ...tool("git"), post_sha256: DIGEST_B } }))
      .toThrow(/drift|digest|changed/iu);

    const validImages = [{
      service: "fixture",
      reference: `example/fixture@sha256:${DIGEST_A}`,
      digest: `sha256:${DIGEST_A}`,
      platform: "linux/arm64",
      image_id: `sha256:${DIGEST_C}`,
      local_cache_provenance_digest: DIGEST_B,
    }];
    expect(validateCandidateImages(validImages)).toEqual(validImages);
    expect(() => validateCandidateImages([{ ...validImages[0], digest: "postgres:17" }]))
      .toThrow(/digest|tag/iu);
    expect(() => validateCandidateImages([{ ...validImages[0], platform: "linux/amd64", expected_platform: "linux/arm64" }]))
      .toThrow(/platform/iu);
  });
});

describe("release rehearsal build environment FD snapshot", () => {
  it("reads only canonical allowlisted public build values and returns opaque digests", () => {
    const root = privateRoot();
    const path = join(root, "build-env.json");
    writeFileSync(path, canonicalizeJcs({
      schema: "homecook.release-rehearsal-build-env.v1",
      values: {
        FULL_LOCAL_DOCKER_PLATFORM: "linux/arm64",
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      },
    }), { mode: 0o600 });

    const result = readBuildEnvironmentSnapshot(path);
    expect(result.values).toEqual({
      FULL_LOCAL_DOCKER_PLATFORM: "linux/arm64",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
    });
    expect(result.metadata).toMatchObject({ exposed_value_count: 0 });
    expect(JSON.stringify(result.metadata)).not.toContain("127.0.0.1");
  });

  it("rejects parent/target symlinks, unsafe mode, hardlinks, duplicate/unknown/secret keys, size, and TOCTOU", () => {
    const root = privateRoot();
    const validText = canonicalizeJcs({ schema: "homecook.release-rehearsal-build-env.v1", values: {} });
    const path = join(root, "build-env.json");
    writeFileSync(path, validText, { mode: 0o600 });

    const linkedTarget = join(root, "linked.json");
    symlinkSync(path, linkedTarget);
    expect(() => readBuildEnvironmentSnapshot(linkedTarget)).toThrow(/symlink|nofollow/iu);

    const realParent = privateRoot("homecook-candidate-parent-");
    const parentFile = join(realParent, "build-env.json");
    writeFileSync(parentFile, validText, { mode: 0o600 });
    const linkedParent = join(root, "linked-parent");
    symlinkSync(realParent, linkedParent);
    expect(() => readBuildEnvironmentSnapshot(join(linkedParent, "build-env.json")))
      .toThrow(/parent|symlink/iu);

    chmodSync(path, 0o644);
    expect(() => readBuildEnvironmentSnapshot(path)).toThrow(/0600|mode|private/iu);
    chmodSync(path, 0o600);

    const hardlink = join(root, "hardlink.json");
    linkSync(path, hardlink);
    expect(() => readBuildEnvironmentSnapshot(path)).toThrow(/hard.?link|nlink/iu);

    const isolated = join(root, "isolated.json");
    writeFileSync(isolated, '{"schema":"homecook.release-rehearsal-build-env.v1","values":{"NEXT_PUBLIC_APP_URL":"a","NEXT_PUBLIC_APP_URL":"b"}}', { mode: 0o600 });
    expect(() => readBuildEnvironmentSnapshot(isolated)).toThrow(/duplicate/iu);
    writeFileSync(isolated, canonicalizeJcs({ schema: "homecook.release-rehearsal-build-env.v1", values: { UNKNOWN: "x" } }), { mode: 0o600 });
    expect(() => readBuildEnvironmentSnapshot(isolated)).toThrow(/unknown|allowlist/iu);
    writeFileSync(isolated, canonicalizeJcs({ schema: "homecook.release-rehearsal-build-env.v1", values: { DATABASE_URL: "secret" } }), { mode: 0o600 });
    expect(() => readBuildEnvironmentSnapshot(isolated)).toThrow(/secret|unknown|allowlist/iu);
    writeFileSync(isolated, "x".repeat(4097), { mode: 0o600 });
    expect(() => readBuildEnvironmentSnapshot(isolated, { maxBytes: 4096 })).toThrow(/size|large|4096/iu);

    writeFileSync(isolated, validText, { mode: 0o600 });
    expect(() => readBuildEnvironmentSnapshot(isolated, {
      afterOpen: () => writeFileSync(isolated, `${validText}\n`),
    })).toThrow(/drift|race|changed|identity/iu);
  });

  it("rejects malformed UTF-8 before canonical build-env parsing", () => {
    const root = privateRoot("homecook-candidate-invalid-utf8-");
    const path = join(root, "build-env.json");
    writeFileSync(path, Buffer.from([
      ...Buffer.from('{"schema":"homecook.release-rehearsal-build-env.v1","values":{"NEXT_PUBLIC_APP_URL":"'),
      0xff,
      ...Buffer.from('"}}'),
    ]), { mode: 0o600 });

    expect(() => readBuildEnvironmentSnapshot(path)).toThrow(/utf-?8|encoding|canonical/iu);
  });
});

describe("release rehearsal candidate orchestration", () => {
  it("reads every authority file through a stable private O_NOFOLLOW FD", () => {
    const root = privateRoot("homecook-candidate-authority-read-");
    const authority = join(root, "candidate.json");
    writeFileSync(authority, canonicalizeJcs({ schema: "fixture" }), { mode: 0o400 });
    expect(readSealedAuthorityFile(root, authority, "fixture authority")).toEqual({ schema: "fixture" });

    const alias = join(root, "candidate-alias.json");
    linkSync(authority, alias);
    expect(() => readSealedAuthorityFile(root, authority, "fixture authority"))
      .toThrow(/hard.?link|nlink|identity/iu);

    const racedRoot = privateRoot("homecook-candidate-authority-race-");
    const raced = join(racedRoot, "candidate.json");
    const moved = join(racedRoot, "candidate-old.json");
    writeFileSync(raced, canonicalizeJcs({ schema: "fixture" }), { mode: 0o400 });
    expect(() => readSealedAuthorityFile(racedRoot, raced, "fixture authority", {
      afterOpen: () => {
        renameSync(raced, moved);
        writeFileSync(raced, canonicalizeJcs({ schema: "attacker" }), { mode: 0o400 });
      },
    })).toThrow(/drift|swap|identity|race/iu);

    for (const mode of [0o444, 0o440, 0o040]) {
      const modeRoot = privateRoot(`homecook-candidate-authority-mode-${mode.toString(8)}-`);
      const modeFile = join(modeRoot, "candidate.json");
      writeFileSync(modeFile, canonicalizeJcs({ schema: "fixture" }), { mode });
      expect(() => readSealedAuthorityFile(modeRoot, modeFile, "fixture authority"))
        .toThrow(/private|mode|0400|authority/iu);
      expect(lstatSync(modeFile).mode & 0o777).toBe(mode);
    }

    for (const mode of [0o555, 0o755]) {
      const parentRoot = privateRoot(`homecook-candidate-authority-parent-${mode.toString(8)}-`);
      const parent = join(parentRoot, "evidence");
      mkdirSync(parent, { mode: 0o700 });
      const parentFile = join(parent, "ci-evidence.json");
      writeFileSync(parentFile, canonicalizeJcs({ schema: "fixture" }), { mode: 0o400 });
      chmodSync(parent, mode);
      expect(() => readSealedAuthorityFile(parentRoot, parentFile, "fixture authority"))
        .toThrow(/parent|private|mode|authority/iu);
      expect(lstatSync(parent).mode & 0o777).toBe(mode);
    }
  });

  it("recomputes stored CI summary and rejects candidate-to-bundle authority divergence", () => {
    const projection = structuredClone(validCiEvidence().safe_projection);
    projection.check_runs = [];
    expect(() => validateStoredCiProjection(projection, {
      release_sha: SHA_A,
      ci_snapshot_digest: createHash("sha256").update(canonicalizeJcs(projection)).digest("hex"),
      ci_check_summary_digest: createHash("sha256").update(canonicalizeJcs(projection.summary)).digest("hex"),
      ci_suite_run_set_digest: createHash("sha256").update(canonicalizeJcs([])).digest("hex"),
    })).toThrow(/summary|count|runs|recompute|CI/iu);

    const candidate = buildCandidateManifest(validManifestInput());
    expect(() => validateCandidateBundleCrossBinding(candidate, {
      repository: candidate.repository,
      source_ref: candidate.source_ref,
      release_sha: SHA_B,
      release_tree: candidate.release_tree,
      build_id: candidate.build_id,
      toolchain: candidate.toolchain,
      build_tools: candidate.build_tools,
      images: candidate.images,
      migration: candidate.migration,
      artifacts: candidate.artifacts,
      file_inventory: candidate.file_inventory,
      sealed_bundle_digest: candidate.sealed_bundle_digest,
      bundle_manifest_digest: candidate.bundle_manifest_digest,
      ci_check_summary_digest: candidate.ci_check_summary_digest,
      ci_snapshot_digest: candidate.ci_snapshot_digest,
      ci_suite_run_set_digest: candidate.ci_suite_run_set_digest,
      source_manifest_digest: candidate.source_manifest_digest,
      sandbox_policy_digest: candidate.sandbox_policy_digest,
      toolchain_lock_digest: candidate.toolchain_lock_digest,
      environment_snapshot: candidate.environment_snapshot,
      production_guard: candidate.production_guard,
    })).toThrow(/release_sha|cross.?binding|candidate|bundle/iu);
  });

  it("builds a deny-default sandbox that permits only run-owned writes and rejects production/socket access", () => {
    const root = privateRoot("homecook-candidate-sandbox-");
    const runRoot = join(root, "attempt");
    const productionRoot = join(root, "production");
    mkdirSync(runRoot, { mode: 0o700 });
    mkdirSync(productionRoot, { mode: 0o700 });
    const immutableSource = join(runRoot, "source");
    mkdirSync(immutableSource, { mode: 0o500 });
    const profile = buildCandidateSandboxProfile({
      readRoots: [runRoot, "/usr/bin", "/System", "/usr/lib"],
      writeRoots: [runRoot],
      deniedWritePaths: [immutableSource],
      deniedPaths: [productionRoot, "/var/run/docker.sock"],
    });
    expect(profile).toContain("(deny default)");
    expect(profile).toContain("(deny network*)");
    expect(profile).toContain(productionRoot);
    expect(profile).toContain("/var/run/docker.sock");

    if (process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec")) {
      const allowed = spawnSync("/usr/bin/sandbox-exec", [
        "-p", profile, "/usr/bin/touch", join(runRoot, "allowed"),
      ], { cwd: runRoot });
      const denied = spawnSync("/usr/bin/sandbox-exec", [
        "-p", profile, "/usr/bin/touch", join(productionRoot, "denied"),
      ], { cwd: runRoot });
      const socketRead = spawnSync("/usr/bin/sandbox-exec", [
        "-p", profile, "/usr/bin/stat", "/var/run/docker.sock",
      ], { cwd: runRoot });
      const sourceWrite = spawnSync("/usr/bin/sandbox-exec", [
        "-p", profile, "/usr/bin/touch", join(immutableSource, "mutated"),
      ], { cwd: runRoot });
      expect(allowed.status).toBe(0);
      expect(denied.status).not.toBe(0);
      expect(socketRead.status).not.toBe(0);
      expect(sourceWrite.status).not.toBe(0);
      expect(existsSync(join(productionRoot, "denied"))).toBe(false);
      const sibling = spawn("/bin/sleep", ["30"], { stdio: "ignore" });
      try {
        const signalAttempt = spawnSync("/usr/bin/sandbox-exec", [
          "-p", profile, "/bin/kill", "-TERM", String(sibling.pid),
        ], { cwd: runRoot });
        const inspectAttempt = spawnSync("/usr/bin/sandbox-exec", [
          "-p", profile, "/bin/ps", "-p", String(sibling.pid),
        ], { cwd: runRoot });
        const launchctlAttempt = spawnSync("/usr/bin/sandbox-exec", [
          "-p", profile, "/bin/launchctl", "print", `gui/${process.getuid?.()}`,
        ], { cwd: runRoot });
        expect(signalAttempt.status).not.toBe(0);
        expect(inspectAttempt.status).not.toBe(0);
        expect(launchctlAttempt.status).not.toBe(0);
        expect(() => process.kill(sibling.pid!, 0)).not.toThrow();
      } finally {
        sibling.kill("SIGKILL");
      }
    }
  });

  it("creates mutually exclusive create-only terminal markers without replacing competitors", () => {
    const root = privateRoot("homecook-candidate-terminal-");
    const complete = writeCandidateTerminalMarker(root, "complete", {
      candidate_identity_digest: DIGEST_A,
      manifest_digest: DIGEST_B,
    });
    expect(JSON.parse(readFileSync(complete, "utf8"))).toMatchObject({ status: "complete" });
    expect(() => writeCandidateTerminalMarker(root, "failed", {
      reason_code: "candidate_failed",
      path_digest: DIGEST_C,
    })).toThrow(/terminal|coexist|collision|create-only/iu);
    expect(readFileSync(complete, "utf8")).toContain(DIGEST_A);

    const raced = privateRoot("homecook-candidate-terminal-race-");
    writeFileSync(join(raced, "complete.json"), "attacker", { flag: "wx", mode: 0o600 });
    expect(() => writeCandidateTerminalMarker(raced, "complete", {
      candidate_identity_digest: DIGEST_A,
      manifest_digest: DIGEST_B,
    })).toThrow(/terminal|collision|create-only/iu);
    expect(readFileSync(join(raced, "complete.json"), "utf8")).toBe("attacker");
  });

  it("accepts only complete roots with exact candidate and bundle authority manifests", () => {
    const root = privateRoot("homecook-candidate-reader-");
    const bundleRoot = join(root, "bundles", "bundle");
    mkdirSync(join(root, "bundles"), { mode: 0o700 });
    const componentSource = privateRoot("homecook-candidate-reader-components-");
    const componentRoots = {
      app: join(componentSource, "app"),
      full_local: join(componentSource, "full_local"),
      worker: join(componentSource, "worker"),
    };
    for (const componentRoot of Object.values(componentRoots)) {
      mkdirSync(componentRoot, { mode: 0o700 });
      writeFileSync(join(componentRoot, "runtime.txt"), "physical bytes\n", { mode: 0o600 });
    }
    const physical = createSealedCandidateBundle({ bundleRoot, componentRoots });
    const manifestInput = validManifestInput();
    const ciEvidence = validCiEvidence().safe_projection;
    const ciSnapshotDigest = createHash("sha256").update(canonicalizeJcs(ciEvidence)).digest("hex");
    const ciSummaryDigest = createHash("sha256").update(canonicalizeJcs(ciEvidence.summary)).digest("hex");
    expect(ciSummaryDigest).not.toBe(ciSnapshotDigest);
    const ciSuiteRunSetDigest = createHash("sha256").update(canonicalizeJcs(
      ciEvidence.check_runs.map((entry) => ({
        app_id: entry.app_id,
        check_suite_id: entry.check_suite_id,
        id: entry.id,
      })),
    )).digest("hex");
    const evidenceRoot = join(root, "evidence");
    mkdirSync(evidenceRoot, { mode: 0o700 });
    writeFileSync(join(evidenceRoot, "ci-evidence.json"), canonicalizeJcs(ciEvidence), { mode: 0o400 });
    chmodSync(evidenceRoot, 0o500);
    const bundleInput = {
      repository: manifestInput.repository,
      source_ref: manifestInput.source_ref,
      artifacts: physical.artifacts,
      build_id: manifestInput.build_id,
      build_tools: manifestInput.build_tools,
      ci_check_summary_digest: ciSummaryDigest,
      ci_snapshot_digest: ciSnapshotDigest,
      ci_suite_run_set_digest: ciSuiteRunSetDigest,
      environment_snapshot: manifestInput.environment_snapshot,
      file_inventory: physical.file_inventory,
      images: manifestInput.images,
      migration: manifestInput.migration,
      production_guard: manifestInput.production_guard,
      release_sha: manifestInput.release_sha,
      release_tree: manifestInput.release_tree,
      sandbox_policy_digest: manifestInput.sandbox_policy_digest,
      sealed_bundle_digest: physical.sealed_bundle_digest,
      source_manifest_digest: manifestInput.source_manifest_digest,
      source_snapshot_digest: manifestInput.source_manifest_digest,
      toolchain: manifestInput.toolchain,
      toolchain_lock_digest: manifestInput.toolchain_lock_digest,
    };
    const bundle = buildBundleAuthorityManifest(bundleInput);
    expect(() => buildBundleAuthorityManifest({ ...bundleInput, unexpected: true }))
      .toThrow(/unknown|unexpected|manifest/iu);
    chmodSync(bundleRoot, 0o700);
    writeFileSync(join(bundleRoot, "bundle-manifest.json"), canonicalizeJcs(bundle), { mode: 0o400 });
    chmodSync(bundleRoot, 0o500);
    chmodSync(join(root, "bundles"), 0o500);
    const candidateIdentityDigest = createHash("sha256").update(canonicalizeJcs({
      schema: "homecook.local-mac-production-rehearsal-candidate-identity.v1",
      bundle_manifest_digest: bundle.bundle_manifest_digest,
      sealed_bundle_digest: physical.sealed_bundle_digest,
    })).digest("hex");
    const candidate = buildCandidateManifest({
      ...validManifestInput(),
      ci_check_summary_digest: ciSummaryDigest,
      ci_snapshot_digest: ciSnapshotDigest,
      ci_suite_run_set_digest: ciSuiteRunSetDigest,
      sealed_bundle_digest: physical.sealed_bundle_digest,
      bundle_manifest_digest: bundle.bundle_manifest_digest,
      candidate_identity_digest: candidateIdentityDigest,
      artifacts: physical.artifacts,
      file_inventory: physical.file_inventory,
    });
    writeFileSync(join(root, "candidate.json"), canonicalizeJcs(candidate), { mode: 0o400 });
    writeCandidateTerminalMarker(root, "complete", {
      candidate_identity_digest: candidateIdentityDigest,
      manifest_digest: candidate.manifest_digest,
    });
    chmodSync(root, 0o500);
    expect(() => readCompletedCandidateRoot(root)).toThrow(/candidate.?identity|authority|missing/iu);
    chmodSync(root, 0o700);
    chmodSync(join(root, "bundles"), 0o700);
    writeFileSync(join(root, "bundles", "candidate-identity.json"), canonicalizeJcs({
      schema: "homecook.local-mac-production-rehearsal-candidate-identity.v1",
      candidate_identity_digest: candidateIdentityDigest,
    }), { mode: 0o400 });
    chmodSync(join(root, "bundles"), 0o500);
    chmodSync(root, 0o500);
    expect(readCompletedCandidateRoot(root).manifest).toEqual(candidate);

    chmodSync(root, 0o700);
    chmodSync(evidenceRoot, 0o700);
    chmodSync(join(evidenceRoot, "ci-evidence.json"), 0o600);
    writeFileSync(join(evidenceRoot, "ci-evidence.json"), canonicalizeJcs({ ...ciEvidence, head_sha: SHA_B }));
    chmodSync(join(evidenceRoot, "ci-evidence.json"), 0o400);
    chmodSync(evidenceRoot, 0o500);
    chmodSync(root, 0o500);
    expect(() => readCompletedCandidateRoot(root)).toThrow(/ci|evidence|snapshot|digest|head/iu);

    const incomplete = privateRoot("homecook-candidate-reader-incomplete-");
    writeFileSync(join(incomplete, "candidate.json"), canonicalizeJcs(candidate), { mode: 0o400 });
    expect(() => readCompletedCandidateRoot(incomplete)).toThrow(/complete|terminal|marker/iu);
  });

  it("requires complete split-one production snapshots and rejects pre/post drift", () => {
    const pre = {
      schema: "homecook.local-mac-production-surface-snapshot.v1",
      surface_digest: DIGEST_A,
      snapshot_digest: DIGEST_B,
      production_db_connection_count: 0,
      mutation_attempt_count: 0,
    };
    expect(validateProductionGuardSnapshots(pre, { ...pre, snapshot_digest: DIGEST_C }))
      .toEqual({
        snapshot_schema: pre.schema,
        production_snapshot_pre_digest: DIGEST_A,
        production_snapshot_post_digest: DIGEST_A,
        equal: true,
        mutation_attempt_count: 0,
        production_db_connection_count: 0,
        production_db_write_count: 0,
      });
    expect(() => validateProductionGuardSnapshots(pre, { ...pre, surface_digest: DIGEST_C }))
      .toThrow(/production|surface|drift/iu);
    expect(() => validateProductionGuardSnapshots(pre, { ...pre, schema: "incomplete" }))
      .toThrow(/schema|complete|snapshot/iu);
  });

  it("seals file bytes, executable modes, and contained symlinks with path-independent digests", () => {
    const source = privateRoot("homecook-candidate-components-");
    const app = join(source, "app");
    const fullLocal = join(source, "full-local");
    const worker = join(source, "worker");
    for (const root of [app, fullLocal, worker]) mkdirSync(root, { mode: 0o700 });
    writeFileSync(join(app, "data.txt"), "same-bytes\n", { mode: 0o600 });
    writeFileSync(join(app, "run.mjs"), "export {};\n", { mode: 0o700 });
    symlinkSync("data.txt", join(app, "data-link"));
    writeFileSync(join(fullLocal, "compose.yml"), "services: {}\n", { mode: 0o600 });
    writeFileSync(join(worker, "worker.mjs"), "export {};\n", { mode: 0o700 });

    const first = createSealedCandidateBundle({
      bundleRoot: join(privateRoot("homecook-candidate-bundle-a-"), "bundle"),
      componentRoots: { app, full_local: fullLocal, worker },
    });
    const second = createSealedCandidateBundle({
      bundleRoot: join(privateRoot("homecook-candidate-bundle-b-"), "bundle"),
      componentRoots: { app, full_local: fullLocal, worker },
    });

    expect(first.sealed_bundle_digest).toBe(second.sealed_bundle_digest);
    expect(first.physical_manifest_digest).toBe(second.physical_manifest_digest);
    expect(first.file_inventory).not.toEqual(second.file_inventory);
    expect(first.file_inventory).toContainEqual(expect.objectContaining({
      component: "app",
      path: "data.txt",
      type: "file",
      mode: 0o400,
      uid: String(process.getuid?.()),
      nlink: "1",
      device: expect.stringMatching(/^\d+$/u),
      inode: expect.stringMatching(/^\d+$/u),
      size: expect.stringMatching(/^\d+$/u),
      ctime: expect.stringMatching(/^\d{4}-/u),
      sha256: expect.any(String),
    }));
    expect(first.file_inventory).toContainEqual(expect.objectContaining({
      component: "app",
      path: "run.mjs",
      mode: 0o500,
    }));
    expect(first.file_inventory).toContainEqual(expect.objectContaining({
      component: "app",
      path: "data-link",
      type: "symlink",
      symlink_target: "data.txt",
      dereferenced_sha256: expect.any(String),
    }));

    writeFileSync(join(app, "data.txt"), "changed-bytes\n", { mode: 0o600 });
    const changed = createSealedCandidateBundle({
      bundleRoot: join(privateRoot("homecook-candidate-bundle-c-"), "bundle"),
      componentRoots: { app, full_local: fullLocal, worker },
    });
    expect(changed.sealed_bundle_digest).not.toBe(first.sealed_bundle_digest);
  });

  it("rejects source hardlinks, escaping symlinks, forbidden env/descriptors, and existing bundle roots", () => {
    const source = privateRoot("homecook-candidate-invalid-components-");
    const roots = { app: join(source, "app"), full_local: join(source, "full"), worker: join(source, "worker") };
    for (const root of Object.values(roots)) mkdirSync(root, { mode: 0o700 });
    writeFileSync(join(roots.app, "file"), "x", { mode: 0o600 });
    writeFileSync(join(roots.full_local, "compose"), "x", { mode: 0o600 });
    writeFileSync(join(roots.worker, "worker"), "x", { mode: 0o600 });
    linkSync(join(roots.app, "file"), join(roots.app, "alias"));
    expect(() => createSealedCandidateBundle({
      bundleRoot: join(privateRoot(), "bundle"), componentRoots: roots,
    })).toThrow(/hard.?link|nlink/iu);

    const symlinkRoots = { app: join(source, "app-symlink"), full_local: roots.full_local, worker: roots.worker };
    mkdirSync(symlinkRoots.app, { mode: 0o700 });
    symlinkSync(join(source, "outside"), join(symlinkRoots.app, "escape"));
    writeFileSync(join(source, "outside"), "outside", { mode: 0o600 });
    expect(() => createSealedCandidateBundle({
      bundleRoot: join(privateRoot(), "bundle"), componentRoots: symlinkRoots,
    })).toThrow(/symlink|escape|contain/iu);

    const forbiddenRoots = { app: join(source, "app-forbidden"), full_local: roots.full_local, worker: roots.worker };
    mkdirSync(forbiddenRoots.app, { mode: 0o700 });
    writeFileSync(join(forbiddenRoots.app, ".env.production.local"), "DATABASE_URL=secret\n", { mode: 0o600 });
    expect(() => createSealedCandidateBundle({
      bundleRoot: join(privateRoot(), "bundle"), componentRoots: forbiddenRoots,
    })).toThrow(/env|secret|forbidden/iu);
    writeFileSync(join(forbiddenRoots.app, "current.json"), "{}", { mode: 0o600 });

    const largeSecretRoots = { app: join(source, "large-secret-app"), full_local: roots.full_local, worker: roots.worker };
    mkdirSync(largeSecretRoots.app, { mode: 0o700 });
    writeFileSync(
      join(largeSecretRoots.app, "large.txt"),
      `${"x".repeat(70 * 1024)}\nDATABASE_URL=must-not-persist\n`,
      { mode: 0o600 },
    );
    expect(() => createSealedCandidateBundle({
      bundleRoot: join(privateRoot(), "bundle"), componentRoots: largeSecretRoots,
    })).toThrow(/secret|credential|database_url/iu);

    const keyRoots = { app: join(source, "key-app"), full_local: roots.full_local, worker: roots.worker };
    mkdirSync(keyRoots.app, { mode: 0o700 });
    writeFileSync(join(keyRoots.app, "operator.pem"), "not-even-a-real-key", { mode: 0o600 });
    expect(() => createSealedCandidateBundle({
      bundleRoot: join(privateRoot(), "bundle"), componentRoots: keyRoots,
    })).toThrow(/pem|key|credential|secret/iu);

    const existing = privateRoot("homecook-candidate-existing-bundle-");
    const validRoots = { app: join(source, "valid-app"), full_local: join(source, "valid-full"), worker: join(source, "valid-worker") };
    for (const root of Object.values(validRoots)) {
      mkdirSync(root, { mode: 0o700 });
      writeFileSync(join(root, "file"), "x", { mode: 0o600 });
    }
    expect(() => createSealedCandidateBundle({ bundleRoot: existing, componentRoots: validRoots }))
      .toThrow(/exists|create-only|collision/iu);
  });

  it("rejects secret-bearing symlink names and standard private-key filenames before type handling", () => {
    const source = privateRoot("homecook-candidate-secret-paths-");
    const roots = { app: join(source, "app"), full_local: join(source, "full"), worker: join(source, "worker") };
    for (const root of Object.values(roots)) mkdirSync(root, { mode: 0o700 });
    writeFileSync(join(roots.app, "payload"), "benign-public-data", { mode: 0o600 });
    symlinkSync("payload", join(roots.app, ".env"));
    writeFileSync(join(roots.full_local, "compose.yml"), "services: {}\n", { mode: 0o600 });
    writeFileSync(join(roots.worker, "worker.mjs"), "export {};\n", { mode: 0o700 });

    expect(() => createSealedCandidateBundle({
      bundleRoot: join(privateRoot(), "bundle"), componentRoots: roots,
    })).toThrow(/secret|forbidden|path_digest/iu);

    const keyRoots = { ...roots, app: join(source, "key-app") };
    mkdirSync(keyRoots.app, { mode: 0o700 });
    writeFileSync(join(keyRoots.app, "id_rsa"), Buffer.from([0x00, 0xff, 0x01, 0x02]), { mode: 0o600 });
    expect(() => createSealedCandidateBundle({
      bundleRoot: join(privateRoot(), "bundle"), componentRoots: keyRoots,
    })).toThrow(/secret|credential|path_digest/iu);
  });

  it("does not reject benign binary files merely containing token-like words", () => {
    const source = privateRoot("homecook-candidate-benign-binary-");
    const roots = { app: join(source, "app"), full_local: join(source, "full"), worker: join(source, "worker") };
    for (const root of Object.values(roots)) mkdirSync(root, { mode: 0o700 });
    mkdirSync(join(roots.app, "cookies"), { mode: 0o700 });
    writeFileSync(join(roots.app, "cookies", "parser.js"), "export const cookie = 'name';\n", { mode: 0o600 });
    writeFileSync(join(roots.app, "vocabulary.bin"), Buffer.from([0x00, ...Buffer.from("token cookie secret"), 0xff]), { mode: 0o600 });
    writeFileSync(join(roots.full_local, "compose.yml"), "services: {}\n", { mode: 0o600 });
    writeFileSync(join(roots.worker, "worker.mjs"), "export {};\n", { mode: 0o700 });

    expect(() => createSealedCandidateBundle({
      bundleRoot: join(privateRoot(), "bundle"), componentRoots: roots,
    })).not.toThrow();
  });

  it("uses an explicit child env, rejects network/pull attempts, and binds deterministic outputs", async () => {
    const namespaceRoot = privateRoot("homecook-rehearsal-namespace-");
    const checkoutFiles = new Map<string, string>([["package.json", "{}\n"]]);
    const callOrder: string[] = [];
    const executeBuild = vi.fn(({ childEnv, runRoot }: { childEnv: Record<string, string>; runRoot: string }) => {
      expect(childEnv).not.toHaveProperty("LEAK_FROM_PROCESS_ENV");
      expect(childEnv).toEqual(expect.objectContaining({ HOMECOOK_RELEASE_BUILD_ID: `candidate-${SHA_A}` }));
      writeFileSync(join(runRoot, "build-temp.txt"), "temporary build evidence\n", { mode: 0o600 });
      return {
        artifacts: {
          app: { root: "app", digest: DIGEST_A },
          full_local: { root: "full_local", digest: DIGEST_B },
          worker: { root: "worker", digest: DIGEST_C },
        },
        file_inventory: validManifestInput().file_inventory,
        sealed_bundle_digest: DIGEST_B,
        bundle_manifest_digest: DIGEST_C,
        sandbox_policy_digest: DIGEST_B,
        build_tools: { next_cli: tool("next-cli") },
      };
    });
    const adapters = {
      readToolchainLock: vi.fn(async () => {
        callOrder.push("tool-lock");
        return { toolchain_lock_digest: DIGEST_B };
      }),
      prepareSource: vi.fn(() => {
        callOrder.push("source");
        return ({
        evidence: validateCandidateSourceEvidence({
          requested_sha: SHA_A,
          origin_master_sha: SHA_A,
          checkout_sha: SHA_A,
          release_tree: SHA_B,
          checkout_tree: SHA_B,
          detached: true,
          clean: true,
          tracked_symlinks_contained: true,
          hardlink_count: 0,
          source_snapshot_pre_digest: DIGEST_A,
          source_snapshot_post_digest: DIGEST_A,
        }),
        tracked_files: checkoutFiles,
        });
      }),
      collectCiEvidence: vi.fn(() => {
        callOrder.push("ci");
        return validateCandidateCiEvidence(validCiEvidence());
      }),
      collectToolchain: vi.fn(() => {
        callOrder.push("tool");
        return validToolchain();
      }),
      collectImages: vi.fn(() => validManifestInput().images),
      collectMigration: vi.fn(() => validManifestInput().migration),
      readEnvironment: vi.fn(() => ({ values: {}, metadata: validManifestInput().environment_snapshot })),
      executeBuild,
      captureProductionSurface: vi.fn(async () => ({
        schema: "homecook.local-mac-production-surface-snapshot.v1",
        surface_digest: DIGEST_A,
        snapshot_digest: DIGEST_B,
        production_db_connection_count: 0,
        mutation_attempt_count: 0,
      })),
    };
    const previous = process.env.LEAK_FROM_PROCESS_ENV;
    process.env.LEAK_FROM_PROCESS_ENV = "must-not-leak";
    try {
      const first = await buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: RUN_A });
      expect(callOrder.slice(0, 4)).toEqual(["tool-lock", "tool", "source", "ci"]);
      const second = await buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: RUN_B });
      expect(first.manifest.sealed_bundle_digest).toBe(second.manifest.sealed_bundle_digest);
      expect(first.manifest.manifest_digest).toBe(second.manifest.manifest_digest);
      expect(first.candidate_root).not.toBe(second.candidate_root);
      expect(lstatSync(join(first.candidate_root, "build-temp.txt")).mode & 0o222).toBe(0);

      adapters.collectToolchain = vi.fn(() => ({
        ...validToolchain(),
        node: { ...tool("node"), version: "node-2" },
      }));
      const toolChanged = await buildReleaseRehearsalCandidate({
        releaseSha: SHA_A,
        namespaceRoot,
        adapters,
        runId: RUN_TOOL_CHANGE,
      });
      expect(toolChanged.manifest.sealed_bundle_digest)
        .toBe(first.manifest.sealed_bundle_digest);
      expect(toolChanged.manifest.bundle_manifest_digest)
        .not.toBe(first.manifest.bundle_manifest_digest);
      expect(toolChanged.manifest.candidate_identity_digest)
        .not.toBe(first.manifest.candidate_identity_digest);
      expect(adapters.captureProductionSurface).toHaveBeenCalledTimes(6);
    } finally {
      if (previous === undefined) delete process.env.LEAK_FROM_PROCESS_ENV;
      else process.env.LEAK_FROM_PROCESS_ENV = previous;
    }

  });

  it("preserves partial failures under a private failed root and rejects create-only collisions", async () => {
    const namespaceRoot = privateRoot("homecook-rehearsal-failure-");
    const adapters = {
      readToolchainLock: vi.fn(async () => ({ toolchain_lock_digest: DIGEST_B })),
      captureProductionSurface: vi.fn(async () => ({
        schema: "homecook.local-mac-production-surface-snapshot.v1",
        surface_digest: DIGEST_A,
        snapshot_digest: DIGEST_B,
        production_db_connection_count: 0,
        mutation_attempt_count: 0,
      })),
      collectToolchain: vi.fn(() => validToolchain()),
      prepareSource: vi.fn(({ runRoot }: { runRoot: string }) => {
        writeFileSync(join(runRoot, "leaked-build-env.txt"), "DATABASE_URL=must-not-persist\n", { mode: 0o600 });
        throw new Error("offline package miss");
      }),
    };

    await expect(buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: RUN_FAILED }))
      .rejects.toThrow(/candidate_build_failed|path_digest/iu);
    const failedRoot = join(namespaceRoot, "attempts", RUN_FAILED);
    const failedMarker = join(failedRoot, "failed.json");
    expect(JSON.parse(readFileSync(failedMarker, "utf8"))).toMatchObject({ status: "failed" });
    expect(readdirSync(failedRoot)).toEqual(["failed.json"]);

    await expect(buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: RUN_FAILED }))
      .rejects.toThrow(/collision|exists|create-only/iu);
  });

  it("rejects non-cryptorandom run IDs before reserving any namespace path", async () => {
    const namespaceRoot = privateRoot("homecook-rehearsal-run-id-");
    await expect(buildReleaseRehearsalCandidate({
      releaseSha: SHA_A,
      namespaceRoot,
      adapters: {},
      runId: "../escaped",
    })).rejects.toThrow(/run.?id|uuid|cryptorandom/iu);
    expect(existsSync(join(namespaceRoot, "escaped"))).toBe(false);
  });
});
