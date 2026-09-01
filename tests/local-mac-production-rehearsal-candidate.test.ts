import {
  chmodSync,
  copyFileSync,
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
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

import {
  buildCandidateManifest,
  buildBundleAuthorityManifest,
  buildCandidateSandboxProfile,
  buildReleaseRehearsalCandidate,
  createReleaseRehearsalCandidateAdapters,
  createSealedCandidateBundle,
  assembleCandidateArtifacts,
  collectSealedMigrationInventory,
  materializeExactGitTree,
  materializeCandidateBuildWorkspace,
  verifyExactMaterializedTree,
  loadRehearsalToolchainLock,
  parseCanonicalComposeImageInventory,
  writeCandidateTerminalMarker,
  parseAndValidateCandidateManifest,
  readBuildEnvironmentSnapshot,
  readCompletedCandidateRoot,
  issueCompletedCandidatePhysicalAuthority,
  verifyCompletedCandidatePhysicalStability,
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
  validateCanonicalComposeAuthority,
  withCandidateBuildWorkAuthority,
  withCandidatePnpmStoreView,
} from "../scripts/lib/local-mac-production-rehearsal-candidate.mjs";
import {
  copyLocalMacProductionExecutionTree,
  sealLocalMacProductionExecutionTree,
} from "../scripts/lib/local-mac-production-release.mjs";
import { buildRehearsalSelection } from "../scripts/lib/local-mac-production-rehearsal-selection.mjs";
import { canonicalizeJcs } from "../scripts/lib/rfc8785-jcs.mjs";
import {
  materializeImmutableCandidateBootstrap,
  verifyImmutableCandidateModuleGraph,
} from "../scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs";
import * as candidateBootstrapModule from "../scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs";
import {
  EXPECTED_RELEASE_CONTEXTS,
} from "../scripts/lib/production-release-approval-policy.mjs";
import { createCompletedRehearsalCandidateFixture } from "./helpers/local-mac-production-rehearsal-candidate-fixture";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const RUN_A = "00000000-0000-4000-8000-000000000001";
const RUN_B = "00000000-0000-4000-8000-000000000002";
const RUN_TOOL_CHANGE = "00000000-0000-4000-8000-000000000003";
const RUN_FAILED = "00000000-0000-4000-8000-000000000006";
const RUN_FINALIZE_FAILED = "00000000-0000-4000-8000-000000000007";
const CURRENT_MASTER_SHA = "5e9bf7929c762dc6371ff64ae288159ddb9dc317";

const CURRENT_MASTER_CHECK_RUNS = ([
  [99_587_894_041, "accessibility", "skipped", 90_563_911_335, "2026-08-31T17:58:28Z", "2026-08-31T17:58:28Z"],
  [99_587_904_361, "build", "success", 90_563_911_120, "2026-08-31T17:58:32Z", "2026-08-31T18:01:38Z"],
  [99_587_807_613, "changes", "success", 90_563_911_335, "2026-08-31T17:58:12Z", "2026-08-31T17:58:27Z"],
  [99_587_808_361, "ci-scope", "success", 90_563_911_120, "2026-08-31T17:58:12Z", "2026-08-31T17:58:30Z"],
  [99_587_934_096, "dependency-audit", "success", 90_563_911_570, "2026-08-31T17:58:39Z", "2026-08-31T17:59:08Z"],
  [99_587_893_691, "full-regression", "skipped", 90_563_911_335, "2026-08-31T17:58:28Z", "2026-08-31T17:58:28Z"],
  [99_587_893_999, "lighthouse", "skipped", 90_563_911_335, "2026-08-31T17:58:28Z", "2026-08-31T17:58:28Z"],
  [99_587_808_085, "policy", "success", 90_563_911_553, "2026-08-31T17:58:13Z", "2026-08-31T17:58:41Z"],
  [99_587_808_256, "qa-eval", "success", 90_563_911_579, "2026-08-31T17:58:13Z", "2026-08-31T17:58:43Z"],
  [99_587_904_537, "quality", "success", 90_563_911_120, "2026-08-31T17:58:32Z", "2026-08-31T18:06:17Z"],
  [99_587_904_357, "security-function-authorization", "success", 90_563_911_120, "2026-08-31T17:58:33Z", "2026-08-31T18:00:55Z"],
  [99_587_808_064, "security-review-scope", "success", 90_563_911_570, "2026-08-31T17:58:13Z", "2026-08-31T17:58:36Z"],
  [99_587_891_157, "security-smoke", "success", 90_563_911_610, "2026-08-31T17:58:30Z", "2026-08-31T18:00:21Z"],
  [99_587_807_840, "security-smoke-scope", "success", 90_563_911_610, "2026-08-31T17:58:12Z", "2026-08-31T17:58:27Z"],
  [99_587_894_617, "smoke", "skipped", 90_563_911_335, "2026-08-31T17:58:28Z", "2026-08-31T17:58:28Z"],
  [99_587_934_200, "snyk", "success", 90_563_911_570, "2026-08-31T17:58:39Z", "2026-08-31T17:59:02Z"],
  [99_587_894_155, "visual", "skipped", 90_563_911_335, "2026-08-31T17:58:28Z", "2026-08-31T17:58:28Z"],
] as const).map(([id, name, conclusion, checkSuiteId, startedAt, completedAt]) => ({
  id,
  app_id: 15_368,
  check_suite_id: checkSuiteId,
  head_sha: CURRENT_MASTER_SHA,
  name,
  status: "completed",
  conclusion,
  started_at: startedAt,
  completed_at: completedAt,
}));

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
  const checkRuns = EXPECTED_RELEASE_CONTEXTS.map((name, index) => ({
    id: 11 + index,
    app_id: 15_368,
    check_suite_id: 21 + index,
    head_sha: SHA_A,
    name,
    status: "completed",
    conclusion: "success",
    started_at: `2026-08-29T00:00:${String(index).padStart(2, "0")}Z`,
    completed_at: `2026-08-29T00:01:${String(index).padStart(2, "0")}Z`,
  }));
  const safeProjection = {
    repository: "netsus/homecook",
    head_sha: SHA_A,
    remote_master_sha: SHA_A,
    check_runs: checkRuns,
    commit_statuses: [],
    summary: { total: 7, success: 7, intended_skip: 0, bad: 0, cancelled: 0, failed: 0, pending: 0, queued: 0, rerun: 0 },
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

function storedCiManifest(projection: {
  check_runs: Array<{ app_id: number, check_suite_id: number, id: number }>,
  head_sha: string,
  summary: Record<string, number>,
}) {
  return {
    release_sha: projection.head_sha,
    selection_digest: null,
    ci_snapshot_digest: createHash("sha256")
      .update(canonicalizeJcs(projection)).digest("hex"),
    ci_check_summary_digest: createHash("sha256")
      .update(canonicalizeJcs(projection.summary)).digest("hex"),
    ci_suite_run_set_digest: createHash("sha256").update(canonicalizeJcs(
      projection.check_runs.map((entry) => ({
        app_id: entry.app_id,
        check_suite_id: entry.check_suite_id,
        id: entry.id,
      })),
    )).digest("hex"),
  };
}

function validManifestInput() {
  const fileInventory = [{
    component: "app",
    source_kind: "generated_build",
    path: ".next/BUILD_ID",
    type: "file",
    mode: 0o400,
    uid: "501",
    gid: "20",
    nlink: "1",
    device: "1",
    inode: "1",
    size: "6",
    ctime: "2026-08-29T00:00:00.000Z",
    sha256: DIGEST_B,
    symlink_target: null,
    dereferenced_sha256: null,
  }, {
    component: "app",
    source_kind: "generated_build",
    path: "node_modules/runtime.js",
    type: "file",
    mode: 0o400,
    uid: "501",
    gid: "20",
    nlink: "1",
    device: "1",
    inode: "2",
    size: "10",
    ctime: "2026-08-29T00:00:00.000Z",
    sha256: DIGEST_C,
    symlink_target: null,
    dereferenced_sha256: null,
  }, {
    component: "app",
    source_kind: "tracked_source",
    path: "package.json",
    type: "file",
    mode: 0o400,
    uid: "501",
    gid: "20",
    nlink: "1",
    device: "1",
    inode: "3",
    size: "3",
    ctime: "2026-08-29T00:00:00.000Z",
    sha256: DIGEST_A,
    symlink_target: null,
    dereferenced_sha256: null,
  }];
  return {
    schema: "homecook.local-mac-production-rehearsal-candidate.v1",
    canonicalization: "RFC8785-JCS+SHA256",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    selection_digest: null,
    release_sha: SHA_A,
    release_tree: SHA_B,
    ci_check_summary_digest: DIGEST_A,
    ci_snapshot_digest: DIGEST_B,
    ci_suite_run_set_digest: DIGEST_C,
    builder_input_digest: DIGEST_B,
    source_manifest_digest: DIGEST_A,
    compose_source_digest: DIGEST_C,
    sandbox_policy_digest: DIGEST_B,
    generated_build_inventory_digest: createHash("sha256").update(canonicalizeJcs(
      fileInventory.filter((entry) => entry.source_kind === "generated_build"),
    )).digest("hex"),
    pnpm_store_snapshot_inventory_digest: DIGEST_C,
    pnpm_store_final_index_inventory_digest: DIGEST_A,
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
    file_inventory: fileInventory,
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
        "selection_digest",
        "release_sha",
        "release_tree",
        "ci_check_summary_digest",
        "ci_snapshot_digest",
        "ci_suite_run_set_digest",
        "source_manifest_digest",
        "compose_source_digest",
        "sandbox_policy_digest",
        "generated_build_inventory_digest",
        "pnpm_store_snapshot_inventory_digest",
        "pnpm_store_final_index_inventory_digest",
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

  it("cross-binds generated build and pnpm store snapshot inventories into candidate and bundle authority", () => {
    const manifest = buildCandidateManifest(validManifestInput());
    expect(manifest.generated_build_inventory_digest).toBe(createHash("sha256")
      .update(canonicalizeJcs(manifest.file_inventory.filter(
        (entry: { source_kind: string }) => entry.source_kind === "generated_build",
      ))).digest("hex"));
    expect(() => validateCandidateBundleCrossBinding(manifest, {
      ...manifest,
      source_snapshot_digest: manifest.source_manifest_digest,
      generated_build_inventory_digest: DIGEST_A,
    })).toThrow(/generated|inventory|cross-binding|digest/iu);
    expect(() => validateCandidateBundleCrossBinding(manifest, {
      ...manifest,
      source_snapshot_digest: manifest.source_manifest_digest,
      pnpm_store_snapshot_inventory_digest: DIGEST_A,
    })).toThrow(/pnpm|store|inventory|cross-binding|digest/iu);
    expect(() => validateCandidateBundleCrossBinding(manifest, {
      ...manifest,
      source_snapshot_digest: manifest.source_manifest_digest,
      pnpm_store_final_index_inventory_digest: DIGEST_B,
    })).toThrow(/pnpm|index|inventory|cross-binding|digest/iu);
    expect(manifest).not.toHaveProperty("pnpm_store_snapshot_identity_digest");
    expect(() => buildCandidateManifest({
      ...validManifestInput(),
      file_inventory: validManifestInput().file_inventory.filter(
        (entry) => entry.source_kind !== "generated_build",
      ),
    })).toThrow(/generated|inventory|digest/iu);
  });

  it("cross-binds an approved selection digest while preserving explicit current-tip null", () => {
    const currentTip = buildCandidateManifest({
      ...validManifestInput(),
      selection_digest: null,
    });
    const selectedAncestor = buildCandidateManifest({
      ...validManifestInput(),
      selection_digest: DIGEST_A,
    });

    expect(currentTip.selection_digest).toBeNull();
    expect(selectedAncestor.selection_digest).toBe(DIGEST_A);
    expect(() => validateCandidateBundleCrossBinding(selectedAncestor, {
      ...selectedAncestor,
      selection_digest: DIGEST_B,
    })).toThrow(/selection|cross-binding|digest/iu);
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

    const modeAttackTable = [
      0, 0o400, 0o444, 0o500, 0o522, 0o555, 0o600, 0o644, 0o700, 0o711, 0o755, 0o777, 0o7777,
    ];
    const runtimeAccepts = (input: ReturnType<typeof validManifestInput>) => {
      try { buildCandidateManifest(input); return true; } catch { return false; }
    };
    for (const mode of modeAttackTable) {
      const executableSchemaCandidate = {
        ...manifest,
        toolchain: { ...manifest.toolchain, git: { ...manifest.toolchain.git, mode } },
      };
      const executableRuntimeInput = {
        ...validManifestInput(),
        toolchain: { ...validToolchain(), git: { ...tool("git"), mode } },
      };
      expect(
        validate(executableSchemaCandidate),
        `executable mode parity ${mode.toString(8)}: ${JSON.stringify(validate.errors)}`,
      ).toBe(runtimeAccepts(executableRuntimeInput));

      const readableSchemaCandidate = {
        ...manifest,
        toolchain: {
          ...manifest.toolchain,
          candidate_builder: { ...manifest.toolchain.candidate_builder, mode },
        },
        build_tools: { next_cli: { ...manifest.build_tools.next_cli, mode } },
      };
      const readableRuntimeInput = {
        ...validManifestInput(),
        toolchain: {
          ...validToolchain(),
          candidate_builder: { ...tool("candidate-builder"), mode },
        },
        build_tools: { next_cli: { ...tool("next-cli"), mode } },
      };
      expect(
        validate(readableSchemaCandidate),
        `readable mode parity ${mode.toString(8)}: ${JSON.stringify(validate.errors)}`,
      ).toBe(runtimeAccepts(readableRuntimeInput));
    }
  });
});

describe("release rehearsal candidate input gates", () => {
  it("uses current-master builder blobs while keeping a differing approved ancestor as payload data", async () => {
    const repo = privateRoot("homecook-selected-payload-repo-");
    const origin = join(privateRoot("homecook-selected-payload-origin-"), "origin.git");
    const gitHome = privateRoot("homecook-selected-payload-home-");
    const runGit = (args: string[]) => {
      const result = spawnSync("/usr/bin/git", args, {
        cwd: repo,
        encoding: "utf8",
        env: {
          HOME: gitHome,
          NODE_ENV: "test",
          PATH: "/usr/bin:/bin",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_AUTHOR_EMAIL: "builder-boundary@test.invalid",
          GIT_AUTHOR_NAME: "Builder Boundary Test",
          GIT_COMMITTER_EMAIL: "builder-boundary@test.invalid",
          GIT_COMMITTER_NAME: "Builder Boundary Test",
        },
      });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    runGit(["init", "--bare", origin]);
    runGit(["init", "--initial-branch=master"]);
    mkdirSync(join(repo, "scripts", "config"), { recursive: true, mode: 0o700 });
    writeFileSync(join(repo, "scripts", "entry.mjs"), "export const builder = 'selected-ancestor'\n");
    writeFileSync(join(repo, "scripts", "config", "lock.json"), "{\"generation\":1}\n");
    writeFileSync(join(repo, "release-payload.txt"), "approved ancestor payload\n");
    runGit(["add", "."]);
    runGit(["commit", "-m", "approved ancestor"]);
    const selectedSha = runGit(["rev-parse", "HEAD"]);

    writeFileSync(join(repo, "scripts", "entry.mjs"), "export const builder = 'trusted-current-master'\n");
    writeFileSync(join(repo, "scripts", "config", "lock.json"), "{\"generation\":2}\n");
    runGit(["commit", "-am", "advance trusted builder"]);
    const currentMasterSha = runGit(["rev-parse", "HEAD"]);
    const currentMasterTree = runGit(["rev-parse", "HEAD^{tree}"]);
    runGit(["remote", "add", "origin", origin]);
    runGit(["push", "-u", "origin", "master"]);

    runGit(["switch", "-c", "divergent-observed", selectedSha]);
    writeFileSync(join(repo, "release-payload.txt"), "divergent observed payload\n");
    runGit(["commit", "-am", "divergent observed master"]);
    const divergentObservedSha = runGit(["rev-parse", "HEAD"]);
    const divergentObservedTree = runGit(["rev-parse", "HEAD^{tree}"]);
    runGit(["switch", "master"]);

    const selectedRoot = join(privateRoot("homecook-selected-payload-root-"), "source");
    const selectedPayload = materializeExactGitTree({
      gitPath: "/usr/bin/git",
      repositoryRoot: repo,
      releaseSha: selectedSha,
      outputRoot: selectedRoot,
      homeDir: gitHome,
    });
    const currentBuilderRoot = join(privateRoot("homecook-current-builder-root-"), "source");
    materializeImmutableCandidateBootstrap({
      gitPath: "/usr/bin/git",
      tarPath: "/usr/bin/tar",
      repositoryRoot: repo,
      releaseSha: currentMasterSha,
      outputRoot: currentBuilderRoot,
      homeDir: gitHome,
    });
    const currentBuilderGraph = verifyImmutableCandidateModuleGraph({
      entryPaths: ["scripts/entry.mjs"],
      gitPath: "/usr/bin/git",
      homeDir: gitHome,
      lockPaths: ["scripts/config/lock.json"],
      releaseSha: currentMasterSha,
      repositoryRoot: repo,
      sourceRoot: currentBuilderRoot,
    });
    const selectedBuilderEntry = selectedPayload.source_manifest.entries.find(
      (entry: { path: string }) => entry.path === "scripts/entry.mjs",
    );
    const currentBuilderEntry = currentBuilderGraph.entries.find(
      (entry: { path: string }) => entry.path === "scripts/entry.mjs",
    );
    expect(selectedBuilderEntry?.blob_oid).not.toBe(currentBuilderEntry?.blob_oid);

    const now = new Date();
    const selectionInput = {
      schema: "homecook.local-mac-production-rehearsal-selection.v1",
      canonicalization: "RFC8785-JCS+SHA256",
      repository: "netsus/homecook",
      source_ref: "refs/heads/master",
      selected_sha: selectedSha,
      selected_tree: runGit(["rev-parse", `${selectedSha}^{tree}`]),
      observed_master_sha: currentMasterSha,
      observed_master_tree: currentMasterTree,
      selected_at: new Date(now.getTime() - 1_000).toISOString(),
      expires_at: new Date(now.getTime() + 60 * 60 * 1_000).toISOString(),
      approver_role: "human-release-approver",
      approver_id: "adapter-fixture-approver",
      approval_digest: DIGEST_A,
    } as const;
    const selection = buildRehearsalSelection(selectionInput, { now });
    const namespaceRoot = join(privateRoot("homecook-selected-payload-namespace-"), "rehearsal");
    const candidateAdapterFactory = createReleaseRehearsalCandidateAdapters as unknown as (
      options: Record<string, unknown>,
      dependencies: { resolveToolPaths: () => { gitPath: string } },
    ) => {
      resolveSourceAuthority(input: Record<string, unknown>): Promise<Record<string, unknown>>;
      prepareSource(input: Record<string, unknown>): Promise<{
        checkout_dir: string;
        evidence: Record<string, unknown>;
        source_manifest: Record<string, unknown>;
      }>;
    };
    const adapters = candidateAdapterFactory({
      builderAuthoritySha: currentMasterSha,
      builderInputDigest: currentBuilderGraph.builder_input_digest,
      builderInputEntries: currentBuilderGraph.entries,
      homeDir: gitHome,
      namespaceRoot,
      rootDir: repo,
      selection,
    }, {
      resolveToolPaths: () => ({ gitPath: "/usr/bin/git" }),
    });
    const sourceAuthority = await adapters.resolveSourceAuthority({ releaseSha: selectedSha, selection });
    expect(sourceAuthority).toMatchObject({
      current_master_sha: currentMasterSha,
      release_sha: selectedSha,
      release_tree: selection.selected_tree,
    });
    const preparedSource = await adapters.prepareSource({
      releaseSha: selectedSha,
      runRoot: privateRoot("homecook-selected-payload-run-"),
    });
    expect(preparedSource).toMatchObject({
      evidence: {
        builder_input_digest: currentBuilderGraph.builder_input_digest,
        checkout_sha: selectedSha,
        release_tree: selection.selected_tree,
      },
    });
    writeFileSync(join(preparedSource.checkout_dir, "release-payload.txt"), "tampered payload\n");
    expect(() => verifyExactMaterializedTree({
      sourceRoot: preparedSource.checkout_dir,
      sourceManifest: preparedSource.source_manifest,
    })).toThrow(/materialized|blob|drift/iu);

    const treeMismatchSelection = buildRehearsalSelection({
      ...selectionInput,
      selected_tree: currentMasterTree,
    }, { now });
    const treeMismatchAdapters = candidateAdapterFactory({
      builderAuthoritySha: currentMasterSha,
      builderInputDigest: currentBuilderGraph.builder_input_digest,
      builderInputEntries: currentBuilderGraph.entries,
      homeDir: gitHome,
      namespaceRoot: join(privateRoot("homecook-tree-mismatch-namespace-"), "rehearsal"),
      rootDir: repo,
      selection: treeMismatchSelection,
    }, {
      resolveToolPaths: () => ({ gitPath: "/usr/bin/git" }),
    });
    await expect(treeMismatchAdapters.resolveSourceAuthority({
      releaseSha: selectedSha,
      selection: treeMismatchSelection,
    })).rejects.toThrow(/tree|authority|mismatch/iu);

    const divergentSelection = buildRehearsalSelection({
      ...selectionInput,
      observed_master_sha: divergentObservedSha,
      observed_master_tree: divergentObservedTree,
    }, { now });
    const divergentAdapters = candidateAdapterFactory({
      builderAuthoritySha: currentMasterSha,
      builderInputDigest: currentBuilderGraph.builder_input_digest,
      builderInputEntries: currentBuilderGraph.entries,
      homeDir: gitHome,
      namespaceRoot: join(privateRoot("homecook-divergent-namespace-"), "rehearsal"),
      rootDir: repo,
      selection: divergentSelection,
    }, {
      resolveToolPaths: () => ({ gitPath: "/usr/bin/git" }),
    });
    await expect(divergentAdapters.resolveSourceAuthority({
      releaseSha: selectedSha,
      selection: divergentSelection,
    })).rejects.toThrow(/force|diverg|ancestor|observed|master/iu);

    const verifiedSourceManifestDigest = verifyExactMaterializedTree({
      sourceRoot: selectedRoot,
      sourceManifest: selectedPayload.source_manifest,
    });
    expect(validateCandidateBuilderAuthority({
      currentHead: currentMasterSha,
      releaseSha: selectedSha,
      builderAuthoritySha: currentMasterSha,
      trackedStatus: "",
      sourceManifestDigest: selectedPayload.source_manifest.source_manifest_digest,
      verifiedSourceManifestDigest,
      builderEntries: currentBuilderGraph.entries,
      expectedBuilderInputDigest: currentBuilderGraph.builder_input_digest,
    })).toEqual({ builder_input_digest: currentBuilderGraph.builder_input_digest });

    const tamperedBuilderEntries = currentBuilderGraph.entries.map((entry) => (
      entry.path === "scripts/entry.mjs" ? { ...entry, sha256: DIGEST_A } : entry
    ));
    expect(() => validateCandidateBuilderAuthority({
      currentHead: currentMasterSha,
      releaseSha: selectedSha,
      builderAuthoritySha: currentMasterSha,
      trackedStatus: "",
      sourceManifestDigest: selectedPayload.source_manifest.source_manifest_digest,
      verifiedSourceManifestDigest,
      builderEntries: tamperedBuilderEntries,
      expectedBuilderInputDigest: currentBuilderGraph.builder_input_digest,
    })).toThrow(/builder|digest|graph|authority/iu);

  });

  it("runs selected-ancestor candidate tooling from current master while preserving current-tip compatibility", () => {
    const resolveImmutableBootstrapAuthority = (candidateBootstrapModule as unknown as {
      resolveImmutableBootstrapAuthority?: (input: {
        releaseSha: string;
        remoteSha: string;
        selectionPath: string | null;
      }) => { builder_authority_sha: string; release_sha: string };
    }).resolveImmutableBootstrapAuthority;
    if (typeof resolveImmutableBootstrapAuthority !== "function") throw new Error("bootstrap authority resolver is unavailable");
    expect(resolveImmutableBootstrapAuthority({
      releaseSha: SHA_A,
      remoteSha: SHA_B,
      selectionPath: "/private/selection.json",
    })).toEqual({ builder_authority_sha: SHA_B, release_sha: SHA_A });
    expect(resolveImmutableBootstrapAuthority({
      releaseSha: SHA_A,
      remoteSha: SHA_A,
      selectionPath: null,
    })).toEqual({ builder_authority_sha: SHA_A, release_sha: SHA_A });
    expect(() => resolveImmutableBootstrapAuthority({
      releaseSha: SHA_A,
      remoteSha: SHA_B,
      selectionPath: null,
    })).toThrow(/current|master|selection|release/iu);
  });

  it("keeps the bootstrap-start master as immutable builder authority while allowing only descendant advancement", () => {
    const assertLineage = (candidateBootstrapModule as unknown as {
      assertImmutableBootstrapMasterLineage?: (input: {
        builderAuthoritySha: string;
        currentMasterSha: string;
        gitPath: string;
        homeDir: string;
        repositoryRoot: string;
      }) => unknown;
    }).assertImmutableBootstrapMasterLineage;
    expect(typeof assertLineage).toBe("function");
    if (typeof assertLineage !== "function") return;

    const repo = privateRoot("homecook-bootstrap-lineage-repo-");
    const gitHome = privateRoot("homecook-bootstrap-lineage-home-");
    const runGit = (args: string[]) => {
      const result = spawnSync("/usr/bin/git", args, {
        cwd: repo,
        encoding: "utf8",
        env: {
          HOME: gitHome,
          NODE_ENV: "test",
          PATH: "/usr/bin:/bin",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_AUTHOR_EMAIL: "bootstrap@test.invalid",
          GIT_AUTHOR_NAME: "Bootstrap Test",
          GIT_COMMITTER_EMAIL: "bootstrap@test.invalid",
          GIT_COMMITTER_NAME: "Bootstrap Test",
        },
      });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    runGit(["init", "--initial-branch=master"]);
    writeFileSync(join(repo, "authority.txt"), "observed\n");
    runGit(["add", "authority.txt"]);
    runGit(["commit", "-m", "observed master"]);
    const observedMasterSha = runGit(["rev-parse", "HEAD"]);
    writeFileSync(join(repo, "authority.txt"), "advanced\n");
    runGit(["commit", "-am", "normal advance"]);
    const advancedMasterSha = runGit(["rev-parse", "HEAD"]);

    expect(() => assertLineage({
      builderAuthoritySha: observedMasterSha,
      currentMasterSha: advancedMasterSha,
      gitPath: "/usr/bin/git",
      homeDir: gitHome,
      repositoryRoot: repo,
    })).not.toThrow();

    runGit(["checkout", "--orphan", "rewritten"]);
    writeFileSync(join(repo, "authority.txt"), "rewritten\n");
    runGit(["add", "authority.txt"]);
    runGit(["commit", "-m", "divergent master"]);
    const divergentMasterSha = runGit(["rev-parse", "HEAD"]);
    expect(() => assertLineage({
      builderAuthoritySha: observedMasterSha,
      currentMasterSha: divergentMasterSha,
      gitPath: "/usr/bin/git",
      homeDir: gitHome,
      repositoryRoot: repo,
    })).toThrow(/ancestor|diverg|force|builder|master/iu);
  });

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
    writeFileSync(join(repo, "scripts", "entry.mjs"), `import { readFileSync } from "node:fs"
const decoy = 'from "./not-a-module"'
const templateDecoy = \`import("./template-ghost.mjs") \${String.raw\`from "./nested-ghost.mjs"\`}\`
const regexDecoy = /import\\("\\.\\/regex-ghost\\.mjs"\\)/u
// from "./line-comment-ghost.mjs"
/* import "./block-comment-ghost.mjs" */
import "./lib/bare.mjs"
const dynamicConfig = await import("./lib/dynamic.json", { with: { type: "json" } })
const loadedCandidate = await import("./lib/candidate.mjs")
export { dependency as exposedDependency } from "./lib/dependency.mjs"
export const candidate = loadedCandidate.candidate
`, { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "lib", "candidate.mjs"), "import {\n  dependency,\n} from './dependency.mjs'\nimport config from './config.json' with { type: \"json\" }\nexport { dependency as localDependency };\nexport const candidate = `exact-${dependency}-${config.value}`\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "lib", "bare.mjs"), "export const bare = true\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "lib", "dependency.mjs"), "export const dependency = 'blob'\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "lib", "config.json"), "{\"value\":\"exact\"}\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "lib", "dynamic.json"), "{\"value\":\"dynamic\"}\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "lib", "unsupported.mjs"), "const path = './dynamic.json'\nawait import(path)\n", { mode: 0o600 });
    writeFileSync(join(repo, "scripts", "lib", "bad-json.mjs"), "import config from './config.json'\nexport default config\n", { mode: 0o600 });
    const forbiddenExternalSpecifiers = [
      "/tmp/absolute.mjs", "file:///tmp/file.mjs", "left-pad", "data:text/javascript,export default 1",
      "http://example.invalid/module.mjs", "https://example.invalid/module.mjs", "custom:module",
    ];
    for (const [index, specifier] of forbiddenExternalSpecifiers.entries()) {
      writeFileSync(
        join(repo, "scripts", "lib", `external-${index}.mjs`),
        `import ${JSON.stringify(specifier)}\n`,
        { mode: 0o600 },
      );
    }
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
    expect(readFileSync(join(outputRoot, "scripts", "entry.mjs"), "utf8")).toContain("./lib/candidate.mjs");
    expect(readFileSync(join(outputRoot, "scripts", "lib", "candidate.mjs"), "utf8")).toContain("exact-${dependency}");
    expect(readFileSync(join(outputRoot, "scripts", "config", "lock.json"), "utf8")).toBe("{}");
    expect(result.release_sha).toBe(releaseSha);

    const graph = verifyImmutableCandidateModuleGraph({
      entryPaths: ["scripts/entry.mjs", "scripts/lib/candidate.mjs"],
      gitPath: "/usr/bin/git",
      homeDir: gitHome,
      lockPaths: ["scripts/config/lock.json"],
      releaseSha,
      repositoryRoot: repo,
      sourceRoot: outputRoot,
    });
    expect(graph.builder_input_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(graph.entries.map((entry: { path: string }) => entry.path)).toEqual([
      "scripts/config/lock.json",
      "scripts/entry.mjs",
      "scripts/lib/bare.mjs",
      "scripts/lib/candidate.mjs",
      "scripts/lib/config.json",
      "scripts/lib/dependency.mjs",
      "scripts/lib/dynamic.json",
    ]);
    const restoredBeforeFinalizePath = join(outputRoot, "scripts", "lib", "bare.mjs");
    const restoredBeforeFinalizeBytes = readFileSync(restoredBeforeFinalizePath);
    const restoredBeforeFinalizeMode = lstatSync(restoredBeforeFinalizePath).mode & 0o7777;
    chmodSync(restoredBeforeFinalizePath, 0o600);
    writeFileSync(restoredBeforeFinalizePath, "export const attacker = true\n", { mode: 0o600 });
    writeFileSync(restoredBeforeFinalizePath, restoredBeforeFinalizeBytes, { mode: 0o600 });
    chmodSync(restoredBeforeFinalizePath, restoredBeforeFinalizeMode);
    const restoredGraph = verifyImmutableCandidateModuleGraph({
      entryPaths: ["scripts/entry.mjs", "scripts/lib/candidate.mjs"],
      gitPath: "/usr/bin/git",
      homeDir: gitHome,
      lockPaths: ["scripts/config/lock.json"],
      releaseSha,
      repositoryRoot: repo,
      sourceRoot: outputRoot,
    });
    expect(restoredGraph.builder_input_digest).toBe(graph.builder_input_digest);
    expect(restoredGraph).not.toEqual(graph);
    for (const index of forbiddenExternalSpecifiers.keys()) {
      expect(() => verifyImmutableCandidateModuleGraph({
        entryPaths: [`scripts/lib/external-${index}.mjs`],
        gitPath: "/usr/bin/git",
        homeDir: gitHome,
        lockPaths: [],
        releaseSha,
        repositoryRoot: repo,
        sourceRoot: outputRoot,
      })).toThrow(/external|specifier|node:|scheme|package|absolute/iu);
    }

    const maliciousMarker = join(dirname(outputRoot), "malicious-path-import-executed");
    const bootstrapPath = join(process.cwd(), "scripts", "local-mac-production-rehearsal-candidate-bootstrap.mjs");
    const memoryExecution = spawnSync(process.execPath, [
      "--experimental-vm-modules",
      "--input-type=module",
      "-e",
      `import { chmodSync, existsSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
const bootstrap = await import(pathToFileURL(${JSON.stringify(bootstrapPath)}).href);
const graph = bootstrap.verifyImmutableCandidateModuleGraph(${JSON.stringify({
        entryPaths: ["scripts/entry.mjs", "scripts/lib/candidate.mjs"],
        gitPath: "/usr/bin/git",
        homeDir: gitHome,
        lockPaths: ["scripts/config/lock.json"],
        releaseSha,
        repositoryRoot: repo,
        sourceRoot: outputRoot,
      })});
const entry = ${JSON.stringify(join(outputRoot, "scripts", "entry.mjs"))};
const aside = entry + ".exact";
chmodSync(dirname(entry), 0o700);
renameSync(entry, aside);
writeFileSync(entry, ${JSON.stringify(`import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(maliciousMarker)}, "bad"); export const candidate = "malicious";\n`)}, { mode: 0o400 });
try {
  const namespace = await bootstrap.evaluateVerifiedCandidateModuleGraph({ graph, entryPath: "scripts/entry.mjs", sourceRoot: ${JSON.stringify(outputRoot)} });
  if (namespace.candidate !== "exact-blob-exact") throw new Error("verified namespace mismatch");
  if (existsSync(${JSON.stringify(maliciousMarker)})) throw new Error("malicious pathname module executed");
} finally {
  unlinkSync(entry);
  renameSync(aside, entry);
  chmodSync(dirname(entry), 0o500);
}
`,
    ], { cwd: process.cwd(), encoding: "utf8" });
    expect(memoryExecution.status, memoryExecution.stderr).toBe(0);
    expect(existsSync(maliciousMarker)).toBe(false);
    for (const entryPath of ["scripts/lib/unsupported.mjs", "scripts/lib/bad-json.mjs"]) {
      expect(() => verifyImmutableCandidateModuleGraph({
        entryPaths: [entryPath],
        gitPath: "/usr/bin/git",
        homeDir: gitHome,
        lockPaths: [],
        releaseSha,
        repositoryRoot: repo,
        sourceRoot: outputRoot,
      })).toThrow(/import|literal|unsupported|attribute|JSON|module graph/iu);
    }

    const candidatePath = join(outputRoot, "scripts", "lib", "candidate.mjs");
    const candidateMode = lstatSync(candidatePath).mode & 0o7777;
    chmodSync(candidatePath, 0o600);
    const exactCandidate = readFileSync(candidatePath);
    writeFileSync(candidatePath, "export const candidate = 'attacker'\n", { mode: 0o600 });
    expect(() => verifyImmutableCandidateModuleGraph({
      entryPaths: ["scripts/entry.mjs", "scripts/lib/candidate.mjs"],
      gitPath: "/usr/bin/git",
      homeDir: gitHome,
      lockPaths: ["scripts/config/lock.json"],
      releaseSha,
      repositoryRoot: repo,
      sourceRoot: outputRoot,
    })).toThrow(/immutable|Git|blob|drift|authority/iu);
    writeFileSync(candidatePath, exactCandidate, { mode: 0o600 });
    chmodSync(candidatePath, candidateMode);
    const importedJsonPath = join(outputRoot, "scripts", "lib", "dynamic.json");
    const importedJsonMode = lstatSync(importedJsonPath).mode & 0o7777;
    chmodSync(importedJsonPath, 0o600);
    const exactImportedJson = readFileSync(importedJsonPath);
    writeFileSync(importedJsonPath, "{\"attacker\":true}\n", { mode: 0o600 });
    expect(() => verifyImmutableCandidateModuleGraph({
      entryPaths: ["scripts/entry.mjs"],
      gitPath: "/usr/bin/git",
      homeDir: gitHome,
      lockPaths: ["scripts/config/lock.json"],
      releaseSha,
      repositoryRoot: repo,
      sourceRoot: outputRoot,
    })).toThrow(/immutable|Git|blob|drift|authority/iu);
    writeFileSync(importedJsonPath, exactImportedJson, { mode: 0o600 });
    chmodSync(importedJsonPath, importedJsonMode);
    const lockPath = join(outputRoot, "scripts", "config", "lock.json");
    const lockMode = lstatSync(lockPath).mode & 0o7777;
    chmodSync(lockPath, 0o600);
    const exactLock = readFileSync(lockPath);
    writeFileSync(lockPath, "{\"attacker\":true}", { mode: 0o600 });
    expect(() => verifyImmutableCandidateModuleGraph({
      entryPaths: ["scripts/entry.mjs"],
      gitPath: "/usr/bin/git",
      homeDir: gitHome,
      lockPaths: ["scripts/config/lock.json"],
      releaseSha,
      repositoryRoot: repo,
      sourceRoot: outputRoot,
    })).toThrow(/immutable|Git|blob|drift|authority/iu);
    writeFileSync(lockPath, exactLock, { mode: 0o600 });
    chmodSync(lockPath, lockMode);
  });

  it("requires stable pre/post remote-master and full CI run/status identity", () => {
    const validEvidence = validCiEvidence();
    const projection = {
      ...validEvidence.safe_projection,
      commit_statuses: [{ id: 31, sha: SHA_A, context: "external", state: "success" }],
    };
    const evidence = {
      expected_head_sha: SHA_A,
      head_sha: SHA_A,
      remote_master_sha: SHA_A,
      summary: validEvidence.summary,
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

    const advancedMaster = structuredClone(evidence);
    advancedMaster.remote_master_sha = SHA_B;
    advancedMaster.safe_projection.remote_master_sha = SHA_B;
    advancedMaster.safe_projection_digest = createHash("sha256")
      .update(canonicalizeJcs(advancedMaster.safe_projection)).digest("hex");
    expect(validateStableCiSnapshots(evidence, advancedMaster, SHA_A, {
      selectionDigest: DIGEST_A,
    })).toMatchObject({ head_sha: SHA_A, remote_master_sha: SHA_A });
  });

  it("accounts for every Compose service and rejects tag-only, build, missing-image, and mixed input", () => {
    const valid = `name: fixture\nx-restore-attempt-labels: &restore-attempt-labels\n  homecook.local/restore-attempt: runtime\n  homecook.release.sha: unmanaged\n  homecook.release.tree: unmanaged\n  homecook.release.build-id: unmanaged\n  homecook.release.promotion-id: unmanaged\n  homecook.release.sealed-bundle-digest: unmanaged\n  homecook.release.repeatability-receipt-digest: unmanaged\nservices:\n  app:\n    image: example/app@sha256:${DIGEST_A}\n    platform: \${FULL_LOCAL_DOCKER_PLATFORM:?required}\n  db:\n    image: example/db@sha256:${DIGEST_B}\n    platform: \${FULL_LOCAL_DOCKER_PLATFORM:?required}\nnetworks:\n  data-internal:\n`;
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
      `${valid.replace(`    image: example/app@sha256:${DIGEST_A}`, `    !!str "image": example/attacker:latest\n    image: example/app@sha256:${DIGEST_A}`)}`,
      `${valid.replace("    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}", "    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}\n    environment: {\"EVIL\":\"x\"}")}`,
      `${valid.replace("    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}", "    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}\n    \"oth\\\"er\": ignored")}`,
      `${valid.replace("networks:", "\"networks\":")}`,
      `${valid.replace("    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}", "    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}\n    \"\": ignored")}`,
      `${valid.replace("    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}", "    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}\n    \"opposite'quote\": ignored")}`,
      `${valid.replace("  app:", "  !!str \"app\":")}`,
      `${valid.replace("    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}", "    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}\n    other: ignored")}`,
      `${valid.replace("    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}", "    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?required}\n    ? image")}`,
      `${valid.replace("services:", "x-evil: ignored\nservices:")}`,
    ]) {
      expect(() => parseCanonicalComposeImageInventory(invalid))
        .toThrow(/image|digest|tag|build|service|complete|section|duplicate|unsupported|top-level|plain-key|grammar|whitespace|control|BOM|noncharacter/iu);
    }
  });

  it("parses the exact Git canonical production Compose and rejects structural mutations", () => {
    const composePath = "infra/full-local-supabase/docker-compose.production.yml";
    const blob = spawnSync("/usr/bin/git", [
      "--no-replace-objects", "cat-file", "blob", `HEAD:${composePath}`,
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { HOME: privateRoot("homecook-compose-git-home-"), PATH: "/usr/bin:/bin", NODE_ENV: "test", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
    });
    expect(blob.status, blob.stderr).toBe(0);
    const canonical = blob.stdout;
    const lock = loadRehearsalToolchainLock(
      "scripts/config/local-mac-production-rehearsal-toolchain-lock.json",
    );
    const expected = [...lock.full_local_images]
      .map(({ service, reference, digest, platform_expression }) => ({ service, reference, digest, platform_expression }))
      .sort((left, right) => left.service.localeCompare(right.service));
    const actual = validateCanonicalComposeAuthority(canonical, lock)
      .sort((left, right) => left.service.localeCompare(right.service));
    expect(actual).toEqual(expected);
    expect(actual).toHaveLength(7);

    const postgresImage = "    image: public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
    const postgresPlatform = "    platform: ${FULL_LOCAL_DOCKER_PLATFORM:?FULL_LOCAL_DOCKER_PLATFORM is required}";
    const restoreBlock = canonical.slice(
      canonical.indexOf("x-restore-attempt-labels:"),
      canonical.indexOf("\n\nservices:"),
    );
    const movedRestoreBlock = canonical.replace(`${restoreBlock}\n\n`, "")
      .replace("\nnetworks:\n", `\n${restoreBlock}\n\nnetworks:\n`);
    const structuralMutations = [
      canonical.replace("networks:\n", "  injected:\n    image: example/injected:latest\n    platform: linux/arm64\n\nnetworks:\n"),
      canonical.replace(postgresImage, `${postgresImage}\n${postgresImage}`),
      canonical.replace(postgresImage, `    \"image\": ${postgresImage.slice("    image: ".length)}`),
      canonical.replace(postgresImage, `    !!str image: ${postgresImage.slice("    image: ".length)}`),
      canonical.replace(postgresImage, postgresImage.replace("image: ", "image:")),
      canonical.replace(postgresPlatform, postgresPlatform.replace("platform: ", "platform:")),
      canonical.replace("    environment:\n", "    environment:\n      image: example/nested:latest\n"),
      canonical.replace(postgresImage, `    <<: *restore-attempt-labels\n${postgresImage}`),
      canonical.replace("services:\n", "unknown-top-level: rejected\n\nservices:\n"),
      canonical.replace(postgresImage, `${postgresImage}\n    unknown_service_key: rejected`),
      canonical.replace(postgresImage, postgresImage.replace("    image", "   image")),
      canonical.replace("  postgres:\n", "  postgres:{ }\n"),
      canonical.replace("    internal: true", "    internal: {}"),
      canonical.replace("  auth-egress: {}", "  attacker: {}"),
      canonical.replace("  storage-data:\n", "  storage-data:\n    labels: *restore-attempt-labels\n"),
      movedRestoreBlock,
    ];
    const structuralSurvivors = structuralMutations.flatMap((mutation, index) => {
      try {
        validateCanonicalComposeAuthority(mutation, lock);
        return [index];
      } catch {
        return [];
      }
    });
    expect(structuralMutations).toHaveLength(16);
    expect(structuralSurvivors).toEqual([]);

    const directParserMutations = [
      canonical.replace('    command: ["docker-entrypoint.sh","postgres","-D","/etc/postgresql"]', '    command: ["postgres"] '),
      canonical.replace("    restart: unless-stopped", "    restart: unless-stopped !evil"),
      canonical.replace("      FULL_LOCAL_AUTH_EXPECTED_ISSUER: ${FULL_LOCAL_API_EXTERNAL_URL:?FULL_LOCAL_API_EXTERNAL_URL is required}", "      FULL_LOCAL_AUTH_EXPECTED_ISSUER: ${FULL_LOCAL_API_EXTERNAL_URL:?FULL_LOCAL_API_EXTERNAL_URL is required}!evil"),
      canonical.replace("    internal: true", "    internal: {}"),
      canonical.replace("  auth-egress: {}", "  attacker: {}"),
      canonical.replace("  storage-data:", "  attacker-volume:"),
      movedRestoreBlock,
    ];
    const directParserSurvivors = directParserMutations.flatMap((mutation, index) => {
      try {
        parseCanonicalComposeImageInventory(mutation, { requireCanonicalSemantics: true });
        return [index];
      } catch {
        return [];
      }
    });
    expect(directParserSurvivors).toEqual([]);

    const lexicalAndTokenMutations = [
      `\uFEFF${canonical}`,
      canonical.replace("services:", "serv\uFEFFices:"),
      canonical.replace("\n\nservices:", "\n\uFEFF\nservices:"),
      canonical.replace("# Compose mounts", "\uFEFF# Compose mounts"),
      canonical.replace(postgresImage, postgresImage.replace("image", "\uFEFFimage")),
      canonical.replace(postgresImage, postgresImage.replace("image: ", "image: \uFEFF")),
      canonical.replace("services:", "services:\u0000"),
      canonical.replace("services:", "services:\u0001"),
      canonical.replace("services:", "services:\uFDD0"),
      canonical.replace('    entrypoint: ["/homecook/secret-entrypoint.sh"]', '    entrypoint: ["unterminated]'),
      canonical.replace('    command: ["docker-entrypoint.sh","postgres","-D","/etc/postgresql"]', "    command: {image: attacker}"),
      canonical.replace("    restart: unless-stopped", "    restart: !!str attacker"),
      canonical.replace("      - data-internal", "      - *restore-attempt-labels"),
      canonical.replace("      - postgres-data:/var/lib/postgresql/data", "      - {image: attacker}"),
      canonical.replace("      - no-new-privileges:true", '      - ["unterminated]'),
      canonical.replace("      POSTGRES_DB: postgres", "      POSTGRES_DB: !!str attacker"),
      canonical.replace("      interval: 5s", "      interval: *restore-attempt-labels"),
      canonical.replace("    restart: unless-stopped", "    restart: [always]"),
      canonical.replace("      POSTGRES_DB: postgres", "      POSTGRES_DB: {value: postgres}"),
      canonical.replace("      POSTGRES_DB: postgres", '      POSTGRES_DB: "unterminated'),
      canonical.replace("      - data-internal", "      - 'unterminated"),
      canonical.replace('    command: ["docker-entrypoint.sh","postgres","-D","/etc/postgresql"]', '    command: ["postgres"}'),
      canonical.replace('    command: ["docker-entrypoint.sh","postgres","-D","/etc/postgresql"]', '    command: ["postgres"] '),
      canonical.replace("    restart: unless-stopped", "    restart: unless-stopped !evil"),
      canonical.replace("      FULL_LOCAL_AUTH_EXPECTED_ISSUER: ${FULL_LOCAL_API_EXTERNAL_URL:?FULL_LOCAL_API_EXTERNAL_URL is required}", "      FULL_LOCAL_AUTH_EXPECTED_ISSUER: ${FULL_LOCAL_API_EXTERNAL_URL:?FULL_LOCAL_API_EXTERNAL_URL is required}!evil"),
    ];
    const survivors = lexicalAndTokenMutations.flatMap((mutation, index) => {
      try {
        validateCanonicalComposeAuthority(mutation, lock);
        return [index];
      } catch {
        return [];
      }
    });
    expect(lexicalAndTokenMutations).toHaveLength(25);
    expect(survivors).toEqual([]);

    const validButUnauthorizedCommand = canonical.replace(
      '    command: ["docker-entrypoint.sh","postgres","-D","/etc/postgresql"]',
      '    command: ["postgres"]',
    );
    expect(() => parseCanonicalComposeImageInventory(validButUnauthorizedCommand)).not.toThrow();
    expect(() => validateCanonicalComposeAuthority(validButUnauthorizedCommand, lock))
      .toThrow(/Compose|digest|authority|lock/iu);

    const coUpdatedSemanticMutations = [
      canonical.replace("  auth-egress: {}\n", ""),
      canonical.replace("  data-internal:\n    internal: true", "  data-internal: {}"),
      canonical.replace("  storage-data:\n    name: ${FULL_LOCAL_STORAGE_VOLUME_NAME:?FULL_LOCAL_STORAGE_VOLUME_NAME is required}\n    labels: *restore-attempt-labels\n", ""),
      canonical.replace("    labels: *restore-attempt-labels\n", ""),
      canonical.replace("    networks:\n      - data-internal\n", "    networks:\n      - auth-egress\n"),
      canonical.replace("      - data-internal\n      - auth-egress", "      - data-internal"),
      canonical.replace("      - auth-edge\n      - data-internal", "      - auth-edge"),
      canonical.replace("      - postgres-data:/var/lib/postgresql/data", "      - /tmp:/var/lib/postgresql/data"),
      canonical.replace("      - storage-data:/var/lib/storage\n", ""),
      canonical.replace("      - storage-data:/var/lib/storage", "      - storage-data:/srv/storage:ro"),
      canonical.replace("    networks:\n      - data-internal\n    restart:", "    networks:\n      - data-internal\n      - auth-edge\n    restart:"),
      canonical.replace("      - ./start-auth.sh:/homecook/start-auth.sh:ro", "      - ./start-auth.sh:/homecook/start-auth.sh:ro\n      - /tmp:/tmp"),
      canonical.replace("      - postgres_password\n    volumes:", "      - postgres_password\n      - jwt_secret\n    volumes:"),
      canonical.replace("    tmpfs:\n      - /tmp:mode=1777", "    tmpfs:\n      - /tmp"),
      canonical.replace("  auth_flow_hmac_key:\n    file: ${FULL_LOCAL_SECRET_DIR:?FULL_LOCAL_SECRET_DIR is required}/auth_flow_hmac_key\n", ""),
      canonical.replace("\nvolumes:\n", "  attacker_secret:\n    file: ${FULL_LOCAL_SECRET_DIR:?FULL_LOCAL_SECRET_DIR is required}/attacker_secret\n\nvolumes:\n"),
      canonical.replace(
        "    file: ${FULL_LOCAL_SECRET_DIR:?FULL_LOCAL_SECRET_DIR is required}/postgres_password",
        "    file: /tmp/substitute",
      ),
      canonical.replace(
        "    file: ${FULL_LOCAL_SECRET_DIR:?FULL_LOCAL_SECRET_DIR is required}/jwt_secret",
        "    file: ${FULL_LOCAL_SECRET_DIR:?FULL_LOCAL_SECRET_DIR is required}/jwt_keys",
      ),
      canonical.replace("  jwt_keys:\n    file:", "  jwt_keys:\n    source:"),
    ];
    const semanticSurvivors = coUpdatedSemanticMutations.flatMap((mutation, index) => {
      const coUpdatedLock = {
        ...lock,
        full_local_compose_sha256: createHash("sha256").update(mutation).digest("hex"),
      };
      try {
        validateCanonicalComposeAuthority(mutation, coUpdatedLock);
        return [index];
      } catch {
        return [];
      }
    });
    expect(coUpdatedSemanticMutations).toHaveLength(19);
    expect(semanticSurvivors).toEqual([]);
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

  it("audits the full sandbox wall-clock interval and catches an early swallowed denial", () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const start = Date.UTC(2026, 7, 29, 0, 0, 0);
    const times = [start, start + 45_999, start + 46_999];
    const runCommand = vi.fn((command: string, args: string[]) => {
      calls.push({ command, args });
      if (command === "/usr/bin/sandbox-exec") {
        return { status: 0, signal: null, stdout: "ok", stderr: "", pid: 4242 };
      }
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify([{
          eventMessage: "Sandbox: node(4242) deny(1) file-write-data",
          timestamp: "2026-08-29 00:00:45.999000+0000",
        }, {
          eventMessage: "Sandbox: node(4242) deny(1) network-outbound",
          timestamp: "2026-08-29 00:00:01.000000+0000",
        }]),
        stderr: "",
      };
    });
    expect(() => runObservedSandboxCommand({
      sandboxPath: "/usr/bin/sandbox-exec",
      logPath: "/usr/bin/log",
      profile: "(version 1) (deny default)",
      command: "/usr/bin/node",
      args: ["fixture.mjs"],
      cwd: "/private/tmp",
      env: { HOME: "/private/tmp", PATH: "/usr/bin:/bin" },
      label: "long fixture build",
      timeout: 60_000,
      runCommand,
      now: () => times.shift(),
      waitForAuditFlush: vi.fn(),
      formatAuditTime: (milliseconds: number) => new Date(milliseconds).toISOString().replace("T", " ").slice(0, 19),
    })).toThrow(/observed|denied|sandbox|attempt/iu);
    expect(calls[1].args).not.toContain("--last");
    expect(calls[1].args).toEqual(expect.arrayContaining(["--start", "2026-08-28 23:59:59", "--end", "2026-08-29 00:00:48"]));
    expect(calls[1].args.at(-1)).toContain('eventMessage CONTAINS "Sandbox: node(4242)"');

    const unavailableAudit = vi.fn((command: string) => command === "/usr/bin/sandbox-exec"
      ? { status: 0, signal: null, stdout: "ok", stderr: "", pid: 4242 }
      : { status: null, signal: null, stdout: "", stderr: "truncated", error: { code: "ENOBUFS" } });
    expect(() => runObservedSandboxCommand({
      sandboxPath: "/usr/bin/sandbox-exec",
      logPath: "/usr/bin/log",
      profile: "(version 1) (deny default)",
      command: "/usr/bin/node",
      args: ["fixture.mjs"],
      cwd: "/private/tmp",
      env: { HOME: "/private/tmp", PATH: "/usr/bin:/bin" },
      label: "unavailable audit fixture",
      runCommand: unavailableAudit,
      now: vi.fn()
        .mockReturnValueOnce(start)
        .mockReturnValueOnce(start + 1)
        .mockReturnValueOnce(start + 1_501),
      waitForAuditFlush: vi.fn(),
      formatAuditTime: (milliseconds: number) => new Date(milliseconds).toISOString().replace("T", " ").slice(0, 19),
    })).toThrow(/audit|failed closed|query/iu);
  });

  it("loads the canonical tool lock and rejects self-reported Supabase identity without the pinned binary digest", () => {
    const lock = loadRehearsalToolchainLock(
      "scripts/config/local-mac-production-rehearsal-toolchain-lock.json",
    );
    expect(lock).toMatchObject({
      schema: "homecook.local-mac-production-rehearsal-toolchain-lock.v1",
      platform: "darwin-arm64",
      full_local_compose_sha256: "cb2cd61202caa9a35a8301500870ce8f277c8e8570f8539715bf7958de2c8797",
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
      selection_digest: null,
      checkout_sha: SHA_A,
      release_tree: SHA_B,
      checkout_tree: SHA_B,
      detached: true,
      clean: true,
      tracked_symlinks_contained: true,
      hardlink_count: 0,
      source_snapshot_pre_digest: DIGEST_A,
      source_snapshot_post_digest: DIGEST_A,
      builder_input_digest: DIGEST_B,
    };
    expect(validateCandidateSourceEvidence(valid)).toEqual(valid);

    const selectedAncestor = {
      ...valid,
      origin_master_sha: SHA_B,
      selection_digest: DIGEST_A,
    };
    expect(validateCandidateSourceEvidence(selectedAncestor)).toEqual(selectedAncestor);

    for (const patch of [
      { origin_master_sha: SHA_B },
      { checkout_sha: SHA_B },
      { checkout_tree: SHA_A },
      { detached: false },
      { clean: false },
      { tracked_symlinks_contained: false },
      { hardlink_count: 1 },
      { source_snapshot_post_digest: DIGEST_B },
      { builder_input_digest: "not-a-digest" },
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

  it("accepts intended skips only when the canonical required contexts remain successful", () => {
    const valid = {
      head_sha: SHA_A,
      expected_head_sha: SHA_A,
      summary_digest: DIGEST_A,
      summary: { total: 8, success: 7, intended_skip: 1, bad: 0, cancelled: 0, failed: 0, pending: 0, queued: 0, rerun: 0 },
    };
    expect(validateCandidateCiEvidence(valid)).toEqual(valid);

    for (const patch of [
      { head_sha: SHA_B },
      { summary: { ...valid.summary, success: 6, intended_skip: 2 } },
      { summary: { ...valid.summary, success: 6, pending: 1 } },
      { summary: { ...valid.summary, success: 6, failed: 1 } },
      { summary: { ...valid.summary, rerun: 1 } },
    ]) {
      expect(() => validateCandidateCiEvidence({ ...valid, ...patch }))
        .toThrow(/head|required|pending|failed|rerun|terminal|success/iu);
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
  it("separates portable candidate bytes from exact root-local physical authority", async () => {
    const fixture = await createCompletedRehearsalCandidateFixture();
    expect(readCompletedCandidateRoot(fixture.candidateRoot).manifest)
      .toEqual(fixture.manifest);
    expect(JSON.parse(readFileSync(fixture.physicalAuthorityPath, "utf8")))
      .toMatchObject({ authority_path_digest: expect.stringMatching(/^[0-9a-f]{64}$/u) });

    const copyRoot = (label: string) => {
      const parent = privateRoot(`homecook-candidate-portable-${label}-`);
      const executionRoot = join(parent, "execution-candidate");
      copyLocalMacProductionExecutionTree(fixture.candidateRoot, executionRoot);
      sealLocalMacProductionExecutionTree(executionRoot);
      return { parent, executionRoot };
    };

    const portable = copyRoot("pass");
    expect(() => readCompletedCandidateRoot(portable.executionRoot, {
      physicalAuthorityPath: fixture.physicalAuthorityPath,
    })).toThrow(/physical|authority|root|path|identity|stale/iu);
    const copiedAuthority = join(portable.parent, "copied-physical-authority.json");
    copyFileSync(fixture.physicalAuthorityPath, copiedAuthority);
    expect(() => readCompletedCandidateRoot(portable.executionRoot, {
      physicalAuthorityPath: copiedAuthority,
    })).toThrow(/physical|authority|root|path|identity|stale/iu);
    const executionAuthority = `${portable.executionRoot}.physical-authority.json`;
    issueCompletedCandidatePhysicalAuthority({
      candidateRoot: portable.executionRoot,
      authorityPath: executionAuthority,
    });
    expect(readCompletedCandidateRoot(portable.executionRoot, {
      physicalAuthorityPath: executionAuthority,
    }).manifest).toEqual(fixture.manifest);
    const copiedSameRootAuthority = join(portable.parent, "copied-same-root-authority.json");
    copyFileSync(executionAuthority, copiedSameRootAuthority);
    expect(() => readCompletedCandidateRoot(portable.executionRoot, {
      physicalAuthorityPath: copiedSameRootAuthority,
    })).toThrow(/authority|canonical|exact|location|path/iu);

    const tamper = (label: string, mutate: (root: string) => void) => {
      const copy = copyRoot(label);
      const authorityPath = `${copy.executionRoot}.physical-authority.json`;
      issueCompletedCandidatePhysicalAuthority({ candidateRoot: copy.executionRoot, authorityPath });
      mutate(copy.executionRoot);
      expect(() => readCompletedCandidateRoot(copy.executionRoot, { physicalAuthorityPath: authorityPath }))
        .toThrow(/candidate|pnpm|store|physical|authority|inventory|identity|content|mode|path|hard.?link|symlink|drift/iu);
    };

    tamper("byte", (root) => {
      const path = join(root, "pnpm-store", "v10", "index", "package.json");
      chmodSync(path, 0o600);
      writeFileSync(path, "{\"tampered\":true}\n");
      chmodSync(path, 0o400);
    });
    tamper("path", (root) => {
      const indexRoot = join(root, "pnpm-store", "v10", "index");
      chmodSync(indexRoot, 0o700);
      renameSync(
        join(indexRoot, "package.json"),
        join(indexRoot, "renamed.json"),
      );
      chmodSync(indexRoot, 0o500);
    });
    tamper("mode", (root) => {
      chmodSync(join(root, "pnpm-store", "v10", "index", "package.json"), 0o500);
    });
    tamper("hardlink", (root) => {
      const indexRoot = join(root, "pnpm-store", "v10", "index");
      chmodSync(indexRoot, 0o700);
      linkSync(
        join(indexRoot, "package.json"),
        join(indexRoot, "hardlink.json"),
      );
      chmodSync(indexRoot, 0o500);
    });
    tamper("symlink", (root) => {
      const indexRoot = join(root, "pnpm-store", "v10", "index");
      const path = join(indexRoot, "package.json");
      chmodSync(indexRoot, 0o700);
      renameSync(path, `${path}.real`);
      symlinkSync("package.json.real", path);
      chmodSync(indexRoot, 0o500);
    });

    const swapped = copyRoot("swap-during-read");
    const swappedAuthority = `${swapped.executionRoot}.physical-authority.json`;
    issueCompletedCandidatePhysicalAuthority({
      candidateRoot: swapped.executionRoot,
      authorityPath: swappedAuthority,
    });
    let swappedOnce = false;
    expect(() => readCompletedCandidateRoot(swapped.executionRoot, {
      physicalAuthorityPath: swappedAuthority,
      afterPnpmStoreFileOpen: ({ path }: { path: string }) => {
        if (swappedOnce || !path.endsWith("/index/package.json")) return;
        swappedOnce = true;
        const indexRoot = dirname(path);
        chmodSync(indexRoot, 0o700);
        renameSync(path, `${path}.old`);
        writeFileSync(path, "{}\n", { mode: 0o400 });
        chmodSync(indexRoot, 0o500);
      },
    })).toThrow(/swap|drift|identity|physical|authority/iu);
    expect(swappedOnce).toBe(true);

    const authorityHardlink = copyRoot("authority-hardlink");
    const authorityPath = `${authorityHardlink.executionRoot}.physical-authority.json`;
    issueCompletedCandidatePhysicalAuthority({
      candidateRoot: authorityHardlink.executionRoot,
      authorityPath,
    });
    linkSync(authorityPath, join(authorityHardlink.parent, "authority-hardlink.json"));
    expect(() => readCompletedCandidateRoot(authorityHardlink.executionRoot, { physicalAuthorityPath: authorityPath }))
      .toThrow(/authority|hard.?link|nlink|identity/iu);
    const authoritySymlink = join(authorityHardlink.parent, "authority-symlink.json");
    symlinkSync("execution-physical-authority.json", authoritySymlink);
    expect(() => readCompletedCandidateRoot(authorityHardlink.executionRoot, { physicalAuthorityPath: authoritySymlink }))
      .toThrow(/authority|symlink|nofollow|canonical/iu);

    for (const childName of ["projects", "tmp", "unexpected-after-authority"]) {
      const residue = copyRoot(`store-residue-${childName}`);
      const residueAuthority = `${residue.executionRoot}.physical-authority.json`;
      issueCompletedCandidatePhysicalAuthority({
        candidateRoot: residue.executionRoot,
        authorityPath: residueAuthority,
      });
      const storeRoot = join(residue.executionRoot, "pnpm-store", "v10");
      chmodSync(storeRoot, 0o700);
      const residueRoot = join(storeRoot, childName);
      mkdirSync(residueRoot, { mode: 0o700 });
      writeFileSync(join(residueRoot, "residue"), "unexpected bytes\n", { mode: 0o400 });
      chmodSync(residueRoot, 0o500);
      chmodSync(storeRoot, 0o500);
      expect(() => readCompletedCandidateRoot(residue.executionRoot, {
        physicalAuthorityPath: residueAuthority,
      })).toThrow(/pnpm|store|child|children|unexpected|inventory|physical|authority/iu);
    }
  });

  it("uses a separate container-portable authority and rejects tamper before child startup", async () => {
    const candidateModule = await import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs") as Record<string, unknown>;
    const adaptersModule = await import("../scripts/lib/local-mac-production-rehearsal-runner-adapters.mjs") as Record<string, unknown>;
    const issueContainerAuthority = candidateModule.issueCompletedCandidateContainerAuthority;
    const readContainerCandidate = candidateModule.readCompletedCandidateContainerRoot;
    const buildStartupIdentity = candidateModule.buildCandidateStartupIdentity;
    const buildContainerContract = adaptersModule.buildCandidateContainerVerificationContract;
    expect(typeof issueContainerAuthority).toBe("function");
    expect(typeof readContainerCandidate).toBe("function");
    expect(typeof buildStartupIdentity).toBe("function");
    expect(typeof buildContainerContract).toBe("function");
    if (
      typeof issueContainerAuthority !== "function"
      || typeof readContainerCandidate !== "function"
      || typeof buildStartupIdentity !== "function"
      || typeof buildContainerContract !== "function"
    ) return;

    const fixture = await createCompletedRehearsalCandidateFixture("homecook-container-candidate-");
    const containerAuthorityRoot = `${fixture.candidateRoot}.container-authority`;
    const containerAuthorityPath = join(containerAuthorityRoot, "authority.json");
    const issued = (issueContainerAuthority as (options: {
      candidateRoot: string;
      containerCandidateRoot: string;
      containerAuthorityPath: string;
    }) => { authority_path: string })({
      candidateRoot: fixture.candidateRoot,
      containerCandidateRoot: fixture.candidateRoot,
      containerAuthorityPath,
    });
    expect(issued.authority_path).toBe(containerAuthorityPath);
    expect((readContainerCandidate as (root: string, options: { containerAuthorityPath: string }) => {
      manifest: unknown;
    })(fixture.candidateRoot, { containerAuthorityPath }).manifest).toEqual(fixture.manifest);

    const repoRoot = realpathSync(process.cwd());
    const contract = (buildContainerContract as (options: {
      candidateRoot: string;
      containerCandidateRoot?: string;
      containerAuthorityRoot?: string;
      candidateModuleUrl?: string;
      jcsModuleUrl?: string;
      expectedIdentity?: Record<string, unknown>;
    }) => {
      container_candidate_root: string;
      container_authority_path: string;
      host_authority_root: string;
      mount_args: string[];
      identitySource: (options?: { outputPath?: string | null }) => string;
    })({
      candidateRoot: fixture.candidateRoot,
      containerCandidateRoot: fixture.candidateRoot,
      containerAuthorityRoot,
      candidateModuleUrl: `file://${join(repoRoot, "scripts/lib/local-mac-production-rehearsal-candidate.mjs")}`,
      jcsModuleUrl: `file://${join(repoRoot, "scripts/lib/rfc8785-jcs.mjs")}`,
      expectedIdentity: (buildStartupIdentity as (manifest: Record<string, unknown>) => Record<string, unknown>)(fixture.manifest),
    });
    expect(contract).toMatchObject({
      container_candidate_root: fixture.candidateRoot,
      container_authority_path: containerAuthorityPath,
      host_authority_root: containerAuthorityRoot,
    });
    expect(contract.mount_args).toEqual([
      "--mount", `type=bind,src=${fixture.candidateRoot},dst=${fixture.candidateRoot},readonly`,
      "--mount", `type=bind,src=${containerAuthorityRoot},dst=${containerAuthorityRoot},readonly`,
    ]);

    const started = join(fixture.authorityRoot, "app-started");
    const identity = join(fixture.authorityRoot, "container-identity.json");
    const success = spawnSync(process.execPath, [
      "-e",
      `${contract.identitySource({ outputPath: identity })}.then(()=>require('node:fs').writeFileSync(${JSON.stringify(started)},'started',{flag:'wx',mode:0o400})).catch((error)=>{console.error(error);process.exit(70)})`,
    ], { encoding: "utf8" });
    expect(success.status, success.stderr).toBe(0);
    expect(existsSync(identity)).toBe(true);
    expect(existsSync(started)).toBe(true);

    const copiedAuthority = join(fixture.authorityRoot, "copied-container-authority.json");
    copyFileSync(containerAuthorityPath, copiedAuthority);
    expect(() => (readContainerCandidate as (root: string, options: { containerAuthorityPath: string }) => unknown)(
      fixture.candidateRoot,
      { containerAuthorityPath: copiedAuthority },
    )).toThrow(/authority|container|exact|path|location/iu);

    const indexPath = join(fixture.candidateRoot, "pnpm-store", "v10", "index", "package.json");
    chmodSync(indexPath, 0o600);
    writeFileSync(indexPath, "{\"tampered\":true}\n");
    chmodSync(indexPath, 0o400);
    const tamperedStarted = join(fixture.authorityRoot, "worker-started-after-tamper");
    const tampered = spawnSync(process.execPath, [
      "-e",
      `${contract.identitySource()}.then(()=>require('node:fs').writeFileSync(${JSON.stringify(tamperedStarted)},'started',{flag:'wx',mode:0o400})).catch(()=>process.exit(70))`,
    ], { encoding: "utf8" });
    expect(tampered.status).toBe(70);
    expect(existsSync(tamperedStarted)).toBe(false);
  });

  it("bounds full CAFS verification to trust transitions while stable checks reject physical drift", async () => {
    const candidateModule = await import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs") as Record<string, unknown>;
    const verifyStable = candidateModule.verifyCompletedCandidatePhysicalStability;
    expect(typeof verifyStable).toBe("function");
    if (typeof verifyStable !== "function") return;

    const fixture = await createCompletedRehearsalCandidateFixture("homecook-candidate-stable-scan-");
    let fullCafsReads = 0;
    const observe = (entry: { contentVerified?: boolean; relativePath: string }) => {
      if (entry.contentVerified === true && entry.relativePath.startsWith("files/")) fullCafsReads += 1;
    };
    expect(readCompletedCandidateRoot(fixture.candidateRoot, {
      afterPnpmStoreFileOpen: observe,
    }).manifest).toEqual(fixture.manifest);
    expect(fullCafsReads).toBe(1);
    for (let index = 0; index < 12; index += 1) {
      expect((verifyStable as (root: string, options: {
        physicalAuthorityPath: string;
        afterPnpmStoreFileOpen: typeof observe;
      }) => { manifest: unknown })(fixture.candidateRoot, {
        physicalAuthorityPath: fixture.physicalAuthorityPath,
        afterPnpmStoreFileOpen: observe,
      }).manifest).toEqual(fixture.manifest);
    }
    expect(fullCafsReads).toBe(1);

    const cafsPath = join(fixture.candidateRoot, "pnpm-store", "v10", fixture.blobRelativePath);
    chmodSync(cafsPath, 0o600);
    writeFileSync(cafsPath, "tampered bytes\n");
    chmodSync(cafsPath, 0o400);
    expect(() => (verifyStable as (root: string, options: {
      physicalAuthorityPath: string;
    }) => unknown)(fixture.candidateRoot, {
      physicalAuthorityPath: fixture.physicalAuthorityPath,
    })).toThrow(/candidate|pnpm|physical|identity|authority|drift/iu);
  });

  it("binds candidate and bundle parent directory identities across stable gates", async () => {
    for (const attack of ["mutate-restore", "swap-restore"] as const) {
      const fixture = await createCompletedRehearsalCandidateFixture(
        `homecook-candidate-directory-${attack}-`,
      );
      const bundleRoot = join(fixture.candidateRoot, "bundles", "bundle");
      const appRoot = join(bundleRoot, "app");

      if (attack === "mutate-restore") {
        chmodSync(appRoot, 0o700);
        const transient = join(appRoot, "transient-entry");
        writeFileSync(transient, "transient\n", { mode: 0o400 });
        unlinkSync(transient);
        chmodSync(appRoot, 0o500);
      } else {
        chmodSync(bundleRoot, 0o700);
        const held = join(bundleRoot, "app-held");
        renameSync(appRoot, held);
        renameSync(held, appRoot);
        chmodSync(bundleRoot, 0o500);
      }

      expect(() => verifyCompletedCandidatePhysicalStability(fixture.candidateRoot, {
        physicalAuthorityPath: fixture.physicalAuthorityPath,
      })).toThrow(/candidate|bundle|directory|parent|physical|identity|authority|drift/iu);
    }
  });

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

    const aliasRoot = privateRoot("homecook-candidate-authority-alias-");
    const actual = join(aliasRoot, "actual");
    const alternate = join(aliasRoot, "alternate");
    mkdirSync(actual, { mode: 0o700 });
    mkdirSync(alternate, { mode: 0o700 });
    writeFileSync(join(actual, "authority.json"), canonicalizeJcs({ schema: "actual" }), { mode: 0o400 });
    writeFileSync(join(alternate, "authority.json"), canonicalizeJcs({ schema: "alternate" }), { mode: 0o400 });
    chmodSync(actual, 0o500);
    chmodSync(alternate, 0o500);
    symlinkSync("actual", join(aliasRoot, "alias"));
    expect(() => readSealedAuthorityFile(
      aliasRoot, join(aliasRoot, "alias", "authority.json"), "intermediate alias authority",
    )).toThrow(/lexical|symlink|alias|parent|canonical/iu);

    chmodSync(actual, 0o700);
    mkdirSync(join(actual, "nested"), { mode: 0o700 });
    writeFileSync(join(actual, "nested", "authority.json"), canonicalizeJcs({ schema: "nested" }), { mode: 0o400 });
    chmodSync(join(actual, "nested"), 0o500);
    chmodSync(actual, 0o500);
    symlinkSync(join("..", "actual", "nested"), join(aliasRoot, "nested-alias"));
    expect(() => readSealedAuthorityFile(
      aliasRoot, join(aliasRoot, "nested-alias", "authority.json"), "nested alias authority",
    )).toThrow(/lexical|symlink|alias|parent|canonical/iu);

    const movedActual = join(aliasRoot, "actual-swapped");
    expect(() => readSealedAuthorityFile(
      aliasRoot, join(actual, "authority.json"), "transient alias authority", {
        afterOpen: () => {
          renameSync(actual, movedActual);
          symlinkSync(basename(movedActual), actual);
          unlinkSync(actual);
          renameSync(movedActual, actual);
        },
      },
    )).toThrow(/lexical|symlink|alias|parent|drift|race/iu);

    const rootAlias = join(dirname(aliasRoot), `${basename(aliasRoot)}-root-alias`);
    symlinkSync(aliasRoot, rootAlias);
    expect(() => readSealedAuthorityFile(
      rootAlias, join(rootAlias, "actual", "authority.json"), "root alias authority",
    )).toThrow(/root|canonical|symlink|alias/iu);
    symlinkSync(join("actual", "authority.json"), join(aliasRoot, "file-alias.json"));
    expect(() => readSealedAuthorityFile(
      aliasRoot, join(aliasRoot, "file-alias.json"), "file alias authority",
    )).toThrow(/file|symlink|alias|nofollow/iu);
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
      builder_input_digest: candidate.builder_input_digest,
      compose_source_digest: candidate.compose_source_digest,
      sandbox_policy_digest: candidate.sandbox_policy_digest,
      toolchain_lock_digest: candidate.toolchain_lock_digest,
      environment_snapshot: candidate.environment_snapshot,
      production_guard: candidate.production_guard,
      selection_digest: null,
    })).toThrow(/release_sha|cross.?binding|candidate|bundle/iu);
  });

  it("accepts the actual current master fixture with optional skips and unique scope contexts", async () => {
    const projection = {
      repository: "netsus/homecook",
      head_sha: CURRENT_MASTER_SHA,
      remote_master_sha: CURRENT_MASTER_SHA,
      check_runs: structuredClone(CURRENT_MASTER_CHECK_RUNS),
      commit_statuses: [],
      summary: {
        total: 17,
        success: 12,
        intended_skip: 5,
        bad: 0,
        cancelled: 0,
        failed: 0,
        pending: 0,
        queued: 0,
        rerun: 0,
      },
    };

    expect(validateStoredCiProjection(projection, storedCiManifest(projection))).toBeUndefined();

    const hardcodedAllSuccess = structuredClone(projection);
    hardcodedAllSuccess.summary = {
      ...hardcodedAllSuccess.summary,
      success: 17,
      intended_skip: 0,
    };
    expect(() => validateStoredCiProjection(
      hardcodedAllSuccess,
      storedCiManifest(hardcodedAllSuccess),
    )).toThrow(/stored summary|canonical|recomputed|check arrays/iu);

    const adapterHome = privateRoot("homecook-candidate-ci-adapter-home-");
    const adapterRoot = privateRoot("homecook-candidate-ci-adapter-root-");
    const rawCheckRuns = CURRENT_MASTER_CHECK_RUNS.map((entry) => ({
      id: entry.id,
      app: { id: entry.app_id },
      check_suite: { id: entry.check_suite_id },
      head_sha: entry.head_sha,
      completed_at: entry.completed_at,
      conclusion: entry.conclusion,
      name: entry.name,
      started_at: entry.started_at,
      status: entry.status,
    }));
    const createCandidateAdapters = createReleaseRehearsalCandidateAdapters as unknown as (
      options: Record<string, unknown>,
      dependencies: Record<string, unknown>,
    ) => {
      collectCiEvidence: (options: { releaseSha: string }) => Promise<Record<string, unknown>>,
    };
    const adapters = createCandidateAdapters({
      rootDir: adapterRoot,
      homeDir: adapterHome,
      builderAuthoritySha: CURRENT_MASTER_SHA,
    }, {
      resolveToolPaths: () => ({ ghPath: "/trusted/gh", gitPath: "/trusted/git" }),
      runCommand: (command: string, args: string[]) => {
        let stdout = "";
        if (command === "/trusted/git" && args.includes("rev-parse")) {
          stdout = `${CURRENT_MASTER_SHA}\n`;
        } else if (command === "/trusted/gh" && args.some((arg) => arg.includes("/check-runs?"))) {
          stdout = JSON.stringify([{ check_runs: rawCheckRuns }]);
        } else if (command === "/trusted/gh" && args.some((arg) => arg.includes("/statuses?"))) {
          stdout = JSON.stringify([[]]);
        }
        return { status: 0, signal: null, stdout, stderr: "" };
      },
    });
    await expect(adapters.collectCiEvidence({ releaseSha: CURRENT_MASTER_SHA }))
      .resolves.toMatchObject({
        summary: projection.summary,
        safe_projection: { summary: projection.summary },
      });
  });

  it("rejects required skips and the old duplicate generic scope projection", () => {
    const requiredSkipped = {
      repository: "netsus/homecook",
      head_sha: CURRENT_MASTER_SHA,
      remote_master_sha: CURRENT_MASTER_SHA,
      check_runs: structuredClone(CURRENT_MASTER_CHECK_RUNS),
      commit_statuses: [],
      summary: {
        total: 17,
        success: 11,
        intended_skip: 6,
        bad: 0,
        cancelled: 0,
        failed: 0,
        pending: 0,
        queued: 0,
        rerun: 0,
      },
    };
    requiredSkipped.check_runs.find((entry) => entry.name === "build")!.conclusion = "skipped";
    expect(() => validateStoredCiProjection(
      requiredSkipped,
      storedCiManifest(requiredSkipped),
    )).toThrow(/required|expected|build|success/iu);

    const duplicateGenericScope = {
      repository: "netsus/homecook",
      head_sha: CURRENT_MASTER_SHA,
      remote_master_sha: CURRENT_MASTER_SHA,
      check_runs: structuredClone(CURRENT_MASTER_CHECK_RUNS).map((entry) => ({
        ...entry,
        name: ["ci-scope", "security-review-scope", "security-smoke-scope"].includes(entry.name)
          ? "scope"
          : entry.name,
      })),
      commit_statuses: [],
      summary: {
        total: 15,
        success: 10,
        intended_skip: 5,
        bad: 0,
        cancelled: 0,
        failed: 0,
        pending: 0,
        queued: 0,
        rerun: 2,
      },
    };
    expect(() => validateStoredCiProjection(
      duplicateGenericScope,
      storedCiManifest(duplicateGenericScope),
    )).toThrow(/rerun|fresh|duplicate|context/iu);
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
        "-p", profile, process.execPath, "-e", [
          'const socket = require("node:net").connect("/var/run/docker.sock");',
          'socket.once("connect", () => process.exit(0));',
          'socket.once("error", () => process.exit(1));',
          'setTimeout(() => process.exit(2), 1000);',
        ].join(" "),
      ], { cwd: runRoot });
      const sourceWrite = spawnSync("/usr/bin/sandbox-exec", [
        "-p", profile, "/usr/bin/touch", join(immutableSource, "mutated"),
      ], { cwd: runRoot });
      expect(allowed.status).toBe(0);
      expect(denied.status).not.toBe(0);
      expect(socketRead.status).not.toBe(0);
      expect(sourceWrite.status).not.toBe(0);
      expect(existsSync(join(productionRoot, "denied"))).toBe(false);
      const childSignal = spawnSync("/usr/bin/sandbox-exec", [
        "-p", profile, process.execPath, "-e", [
          'const { spawn } = require("node:child_process");',
          'const child = spawn("/bin/sleep", ["30"]);',
          'child.on("spawn", () => child.kill("SIGTERM"));',
          'child.on("exit", (code, signal) => process.exit(code === null && signal === "SIGTERM" ? 0 : 1));',
          'setTimeout(() => process.exit(2), 2000);',
        ].join(" "),
      ], { cwd: runRoot });
      expect(childSignal.status).toBe(0);
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

  it("allows only root metadata for the observed macOS /etc and /var aliases", () => {
    const root = privateRoot("homecook-candidate-macos-root-aliases-");
    const profile = buildCandidateSandboxProfile({
      readRoots: [root, process.execPath],
      writeRoots: [root],
    });
    const aliasEnv: NodeJS.ProcessEnv = {
      HOME: root,
      NODE_ENV: "test",
      PATH: "/usr/bin:/bin",
    };
    expect(profile).toContain(
      '(allow file-read-metadata (literal "/etc") (literal "/var"))',
    );
    expect(profile).not.toContain('(allow file-read-data (literal "/etc")');
    expect(profile).not.toContain('(allow file-read-data (literal "/var")');
    expect(profile).not.toContain('(allow file-write* (subpath "/etc")');
    expect(profile).not.toContain('(allow file-write* (subpath "/var")');

    if (
      process.platform !== "darwin"
      || !existsSync("/usr/bin/sandbox-exec")
      || !existsSync("/usr/bin/log")
    ) return;

    const auditStartedAt = Date.now();
    const metadataChild = spawnSync("/usr/bin/sandbox-exec", [
      "-p", profile, process.execPath, "-e", [
        'const { lstatSync } = require("node:fs");',
        'for (const path of ["/etc", "/var"]) {',
        '  const stat = lstatSync(path);',
        '  if (!stat.isSymbolicLink()) process.exit(2);',
        '}',
      ].join("\n"),
    ], { cwd: root, env: aliasEnv });
    expect(metadataChild.status).toBe(0);
    expect(metadataChild.pid).toBeGreaterThan(0);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_500);
    const auditEndedAt = Date.now();
    const formatAuditTime = (milliseconds: number) => {
      const date = new Date(milliseconds);
      const part = (value: number) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
    };
    const metadataAudit = spawnSync("/usr/bin/log", [
      "show",
      "--start", formatAuditTime(Math.floor((auditStartedAt - 1_000) / 1_000) * 1_000),
      "--end", formatAuditTime(Math.ceil((auditEndedAt + 1_000) / 1_000) * 1_000),
      "--style", "json",
      "--predicate",
      [
        'process == "kernel"',
        `eventMessage CONTAINS "Sandbox: node(${metadataChild.pid})"`,
        '(eventMessage CONTAINS "file-read-metadata /etc" OR eventMessage CONTAINS "file-read-metadata /var")',
      ].join(" AND "),
    ], { cwd: root, env: aliasEnv, encoding: "utf8" });
    expect(metadataAudit.status).toBe(0);
    expect(JSON.parse(metadataAudit.stdout)).toEqual([]);

    const deniedContentPath = join(
      "/var/tmp",
      `homecook-sandbox-read-${process.pid}-${Date.now()}`,
    );
    writeFileSync(deniedContentPath, "private fixture\n", { flag: "wx", mode: 0o600 });
    try {
      const deniedScripts = [
        'require("node:fs").readdirSync("/etc")',
        'require("node:fs").readdirSync("/var")',
        `require("node:fs").readFileSync(${JSON.stringify(deniedContentPath)})`,
        `require("node:fs").writeFileSync(${JSON.stringify(join("/var/tmp", `homecook-sandbox-${process.pid}`))}, "x")`,
      ];
      for (const script of deniedScripts) {
        const denied = spawnSync("/usr/bin/sandbox-exec", [
          "-p", profile, process.execPath, "-e", script,
        ], { cwd: root, env: aliasEnv });
        expect(denied.status).not.toBe(0);
      }
    } finally {
      unlinkSync(deniedContentPath);
    }
  });

  it("allows only canonical generated build-work directories and rejects adjacent or escaping writes", () => {
    if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec")) return;

    const root = privateRoot("homecook-candidate-build-work-sandbox-");
    const runRoot = join(root, "attempt");
    const sourceRoot = join(runRoot, "source");
    const buildRoot = join(runRoot, "build-work");
    const nodeModulesRoot = join(buildRoot, "node_modules");
    const nextRoot = join(buildRoot, ".next");
    const privateHome = join(runRoot, "build-home");
    const privateTmp = join(runRoot, "tmp");
    const authorityRoot = join(root, "authority");
    const productionRoot = join(root, "production");
    const escapeRoot = join(root, "escape");
    for (const path of [
      runRoot, sourceRoot, buildRoot, nodeModulesRoot, nextRoot,
      privateHome, privateTmp, authorityRoot, productionRoot, escapeRoot,
    ]) mkdirSync(path, { mode: 0o700 });
    writeFileSync(join(sourceRoot, "immutable.ts"), "export {}\n", { mode: 0o400 });
    writeFileSync(join(buildRoot, "package.json"), "{}\n", { mode: 0o400 });
    symlinkSync(escapeRoot, join(nodeModulesRoot, "escape"));
    chmodSync(sourceRoot, 0o500);
    chmodSync(buildRoot, 0o500);
    chmodSync(authorityRoot, 0o500);

    const profileOptions = {
      readRoots: [sourceRoot, buildRoot, privateHome, privateTmp],
      writeRoots: [nodeModulesRoot, nextRoot, privateHome, privateTmp],
      deniedWritePaths: [sourceRoot, authorityRoot],
      deniedPaths: [productionRoot, "/var/run/docker.sock"],
    };
    const profile = buildCandidateSandboxProfile(
      profileOptions as Parameters<typeof buildCandidateSandboxProfile>[0],
    );
    const run = (command: string, args: string[]) => spawnSync("/usr/bin/sandbox-exec", [
      "-p", profile, command, ...args,
    ], { cwd: buildRoot });

    const nodeModulesWrite = run("/bin/mkdir", ["-p", join(buildRoot, "node_modules", ".pnpm", "fixture")]);
    const nextWrite = run("/usr/bin/touch", [join(buildRoot, ".next", "BUILD_ID")]);
    const adjacentBuildWrite = run("/usr/bin/touch", [join(buildRoot, "adjacent.txt")]);
    const sourceWrite = run("/usr/bin/touch", [join(sourceRoot, "mutated.ts")]);
    const authorityWrite = run("/usr/bin/touch", [join(authorityRoot, "mutated.json")]);
    const productionWrite = run("/usr/bin/touch", [join(productionRoot, "mutated.json")]);
    const symlinkEscapeWrite = run("/usr/bin/touch", [join(buildRoot, "node_modules", "escape", "escaped")]);

    expect(nodeModulesWrite.status).toBe(0);
    expect(nextWrite.status).toBe(0);
    for (const denied of [
      adjacentBuildWrite, sourceWrite, authorityWrite,
      productionWrite, symlinkEscapeWrite,
    ]) expect(denied.status).not.toBe(0);
    expect(existsSync(join(buildRoot, "node_modules", ".pnpm", "fixture"))).toBe(true);
    expect(existsSync(join(buildRoot, ".next", "BUILD_ID"))).toBe(true);
    expect(existsSync(join(escapeRoot, "escaped"))).toBe(false);
  });

  it("runs offline pnpm install and a real Next production build inside the exact macOS build-work sandbox", async () => {
    if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec")) return;

    const root = privateRoot("homecook-candidate-real-offline-build-");
    const runRoot = join(root, "attempt");
    const buildRoot = join(runRoot, "build-work");
    const nodeModulesRoot = join(buildRoot, "node_modules");
    const nextRoot = join(buildRoot, ".next");
    const privateHome = join(runRoot, "build-home");
    const privateTmp = join(runRoot, "tmp");
    const storeRoot = join(runRoot, "pnpm-store");
    const sourceRoot = join(root, "source");
    const appRoot = join(sourceRoot, "app");
    const patchesRoot = join(sourceRoot, "patches");
    for (const path of [runRoot, privateHome, privateTmp, sourceRoot, appRoot, patchesRoot]) {
      mkdirSync(path, { mode: 0o700 });
    }
    copyFileSync("package.json", join(sourceRoot, "package.json"));
    copyFileSync("pnpm-lock.yaml", join(sourceRoot, "pnpm-lock.yaml"));
    copyFileSync("pnpm-workspace.yaml", join(sourceRoot, "pnpm-workspace.yaml"));
    copyFileSync("next.config.ts", join(sourceRoot, "next.config.ts"));
    copyFileSync("patches/minimatch@3.1.5.patch", join(patchesRoot, "minimatch@3.1.5.patch"));
    writeFileSync(join(appRoot, "layout.js"), [
      "export default function Layout({ children }) {",
      "  return <html><body>{children}</body></html>;",
      "}",
      "",
    ].join("\n"), { mode: 0o600 });
    writeFileSync(join(appRoot, "page.js"), "export default function Page() { return <main>fixture</main>; }\n", { mode: 0o600 });
    const trackedPaths = [
      "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "next.config.ts",
      "patches/minimatch@3.1.5.patch", "app/layout.js", "app/page.js",
    ];
    const sourceManifest = {
      entries: trackedPaths.map((path) => {
        const bytes = readFileSync(join(sourceRoot, path));
        return {
          path,
          git_mode: "100644",
          blob_oid: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"),
          sha256: createHash("sha256").update(bytes).digest("hex"),
          symlink_target: null,
        };
      }),
    };
    materializeCandidateBuildWorkspace({ sourceRoot, sourceManifest, buildRoot });
    expect(lstatSync(buildRoot).mode & 0o777).toBe(0o500);
    expect(lstatSync(nodeModulesRoot).mode & 0o777).toBe(0o700);
    expect(lstatSync(nextRoot).mode & 0o777).toBe(0o700);

    const pnpmArtifactRoot = realpathSync(join(
      process.env.HOME ?? "",
      ".cache/node/corepack/v1/pnpm/10.32.1",
    ));
    const pnpmCli = join(pnpmArtifactRoot, "bin/pnpm.cjs");
    const packageStore = realpathSync(join(process.env.HOME ?? "", "Library/pnpm/store/v10"));
    await withCandidateBuildWorkAuthority({
      runRoot,
      buildRoot,
      nodeModulesRoot,
      nextRoot,
      privateHome,
      privateTmp,
      currentUid: process.getuid?.(),
    }, async ({ writeRoots }) => withCandidatePnpmStoreView({
      sourceStore: packageStore,
      storeRoot,
      currentUid: process.getuid?.(),
    }, async ({
      storePath: packageStoreView,
      installWritableRoots,
      sealInstallIndex,
    }) => {
    const installProfile = buildCandidateSandboxProfile({
      readRoots: [
        buildRoot, privateHome, privateTmp, pnpmArtifactRoot,
        packageStoreView, process.execPath,
      ],
      writeRoots: [...writeRoots, ...installWritableRoots],
      deniedWritePaths: [
        packageStore,
        join(packageStoreView, "files"),
      ],
      deniedPaths: [join(root, "production"), join(root, "authority"), "/var/run/docker.sock"],
    });
    const env: NodeJS.ProcessEnv = {
      CI: "1",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      HOME: privateHome,
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "production",
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
      TMPDIR: privateTmp,
      npm_config_offline: "true",
    };
    const allowedWorkingIndexWrite = spawnSync("/usr/bin/sandbox-exec", [
      "-p", installProfile, "/usr/bin/touch", join(packageStoreView, "index", "sandbox-phase-write.json"),
    ], { cwd: buildRoot, env });
    const deniedPrivateFilesWrite = spawnSync("/usr/bin/sandbox-exec", [
      "-p", installProfile, "/usr/bin/touch", join(packageStoreView, "files", "unexpected"),
    ], { cwd: buildRoot, env });
    const deniedStoreRootWrite = spawnSync("/usr/bin/sandbox-exec", [
      "-p", installProfile, "/usr/bin/touch", join(packageStoreView, "unexpected"),
    ], { cwd: buildRoot, env });
    const deniedSourceStoreWrite = spawnSync("/usr/bin/sandbox-exec", [
      "-p", installProfile, "/usr/bin/touch", join(packageStore, "index", "unexpected"),
    ], { cwd: buildRoot, env });
    expect(allowedWorkingIndexWrite.status).toBe(0);
    for (const denied of [
      deniedPrivateFilesWrite,
      deniedStoreRootWrite,
      deniedSourceStoreWrite,
    ]) expect(denied.status).not.toBe(0);

    const install = spawnSync("/usr/bin/sandbox-exec", [
      "-p", installProfile, process.execPath, pnpmCli,
        "install", "--frozen-lockfile", "--offline", "--package-import-method=copy",
        "--store-dir", packageStoreView,
    ], { cwd: buildRoot, env, encoding: "utf8", maxBuffer: 1_048_576, timeout: 120_000 });
    expect(install.status, JSON.stringify({
      signal: install.signal,
      stdout: install.stdout,
      stderr: install.stderr,
    })).toBe(0);
    expect(existsSync(join(nodeModulesRoot, "next", "dist", "bin", "next"))).toBe(true);
    const finalIndexAuthority = sealInstallIndex();
    expect(finalIndexAuthority.inventory_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(finalIndexAuthority.physical_identity_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(readdirSync(packageStoreView).sort()).toEqual(["files", "index"]);

    const buildProfile = buildCandidateSandboxProfile({
      readRoots: [
        buildRoot, privateHome, privateTmp, pnpmArtifactRoot,
        packageStoreView, process.execPath,
      ],
      writeRoots,
      deniedWritePaths: [packageStore, packageStoreView],
      deniedPaths: [join(root, "production"), join(root, "authority"), "/var/run/docker.sock"],
    });
    const deniedPostSealIndexWrite = spawnSync("/usr/bin/sandbox-exec", [
      "-p", buildProfile, "/usr/bin/touch", join(packageStoreView, "index", "post-seal"),
    ], { cwd: buildRoot, env });
    expect(deniedPostSealIndexWrite.status).not.toBe(0);

    expect(lstatSync(join(nodeModulesRoot, "next")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(nodeModulesRoot, "next"))).toMatch(/^\.pnpm\/next@15\.5\.21_/u);
    const candidateModule = await import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs") as Record<string, unknown>;
    const withNextEntrypointAuthority = candidateModule.withCandidateNextEntrypointAuthority;
    expect(typeof withNextEntrypointAuthority).toBe("function");
    if (typeof withNextEntrypointAuthority !== "function") return;
    const nextAuthority = await (withNextEntrypointAuthority as (
      options: { buildRoot: string, currentUid: number | undefined },
      callback: (authority: { entrypointPath: string, verifyBeforeSpawn: () => void }) => unknown,
    ) => Promise<{ authority_digest: string, value: ReturnType<typeof spawnSync> }>)(
      { buildRoot, currentUid: process.getuid?.() },
      ({ entrypointPath, verifyBeforeSpawn }) => {
        verifyBeforeSpawn();
        return spawnSync("/usr/bin/sandbox-exec", [
          "-p", buildProfile, process.execPath, entrypointPath, "build", "--no-lint",
        ], { cwd: buildRoot, env, encoding: "utf8", maxBuffer: 1_048_576, timeout: 120_000 });
      },
    );
    const build = nextAuthority.value;
    expect(nextAuthority.authority_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(build.status, JSON.stringify({
      signal: build.signal,
      stdout: build.stdout,
      stderr: build.stderr,
    })).toBe(0);
    expect(readFileSync(join(nextRoot, "BUILD_ID"), "utf8").trim()).not.toBe("");
    expect(existsSync(join(nextRoot, "server", "app-paths-manifest.json"))).toBe(true);
    }));
  }, 240_000);

  it("accepts the normal pnpm Next link only inside candidate-owned node_modules/.pnpm", async () => {
    const candidateModule = await import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs") as Record<string, unknown>;
    const withNextEntrypointAuthority = candidateModule.withCandidateNextEntrypointAuthority;
    expect(typeof withNextEntrypointAuthority).toBe("function");
    if (typeof withNextEntrypointAuthority !== "function") return;

    const root = privateRoot("homecook-candidate-next-entrypoint-allowed-");
    const buildRoot = join(root, "build-work");
    const nodeModulesRoot = join(buildRoot, "node_modules");
    const packageRoot = join(
      nodeModulesRoot,
      ".pnpm",
      "next@15.5.21_react@19.1.1",
      "node_modules",
      "next",
    );
    const entrypointTarget = join(packageRoot, "dist", "bin", "next");
    mkdirSync(dirname(entrypointTarget), { recursive: true, mode: 0o700 });
    writeFileSync(join(packageRoot, "package.json"), '{"name":"next","version":"15.5.21"}\n', { mode: 0o400 });
    writeFileSync(entrypointTarget, "#!/usr/bin/env node\n", { mode: 0o500 });
    symlinkSync(
      ".pnpm/next@15.5.21_react@19.1.1/node_modules/next",
      join(nodeModulesRoot, "next"),
    );

    const result = await (withNextEntrypointAuthority as (
      options: { buildRoot: string, currentUid: number | undefined },
      callback: (authority: {
        entrypointPath: string,
        entrypointTarget: string,
        packageJsonTarget: string,
        verifyBeforeSpawn: () => void,
      }) => unknown,
    ) => Promise<{
      authority_digest: string,
      inventory_binding: {
        package_link_path: string,
        package_link_target: string,
        package_json_path: string,
        package_json_sha256: string,
        entrypoint_path: string,
        entrypoint_sha256: string,
      },
      value: unknown,
    }>)(
      { buildRoot, currentUid: process.getuid?.() },
      (authority) => {
        expect(authority.entrypointPath).toBe(join(nodeModulesRoot, "next", "dist", "bin", "next"));
        expect(authority.entrypointTarget).toBe(entrypointTarget);
        expect(authority.packageJsonTarget).toBe(join(packageRoot, "package.json"));
        authority.verifyBeforeSpawn();
        return "verified";
      },
    );

    expect(result.value).toBe("verified");
    expect(result.authority_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.inventory_binding).toEqual({
      package_link_path: "node_modules/next",
      package_link_target: ".pnpm/next@15.5.21_react@19.1.1/node_modules/next",
      package_json_path: "node_modules/.pnpm/next@15.5.21_react@19.1.1/node_modules/next/package.json",
      package_json_sha256: createHash("sha256")
        .update('{"name":"next","version":"15.5.21"}\n').digest("hex"),
      entrypoint_path: "node_modules/.pnpm/next@15.5.21_react@19.1.1/node_modules/next/dist/bin/next",
      entrypoint_sha256: createHash("sha256").update("#!/usr/bin/env node\n").digest("hex"),
    });
  });

  it("cross-binds the verified Next link and package bytes to generated build inventory", async () => {
    const candidateModule = await import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs") as Record<string, unknown>;
    const validateBinding = candidateModule.validateCandidateNextEntrypointInventoryBinding;
    expect(typeof validateBinding).toBe("function");
    if (typeof validateBinding !== "function") return;

    const packageLinkTarget = ".pnpm/next@15.5.21_react@19.1.1/node_modules/next";
    const binding = {
      package_link_path: "node_modules/next",
      package_link_target: packageLinkTarget,
      package_json_path: `node_modules/${packageLinkTarget}/package.json`,
      package_json_sha256: DIGEST_A,
      entrypoint_path: `node_modules/${packageLinkTarget}/dist/bin/next`,
      entrypoint_sha256: DIGEST_B,
    };
    const generated = [
      {
        component: "app", source_kind: "generated_build", path: binding.package_link_path,
        type: "symlink", mode: 0o755, sha256: createHash("sha256").update(packageLinkTarget).digest("hex"),
        symlink_target: packageLinkTarget, dereferenced_sha256: DIGEST_C,
        uid: String(process.getuid?.()), gid: String(process.getgid?.()), nlink: "1",
      },
      {
        component: "app", source_kind: "generated_build", path: binding.package_json_path,
        type: "file", mode: 0o400, sha256: DIGEST_A, symlink_target: null,
        dereferenced_sha256: null, uid: String(process.getuid?.()), gid: String(process.getgid?.()), nlink: "1",
      },
      {
        component: "app", source_kind: "generated_build", path: binding.entrypoint_path,
        type: "file", mode: 0o500, sha256: DIGEST_B, symlink_target: null,
        dereferenced_sha256: null, uid: String(process.getuid?.()), gid: String(process.getgid?.()), nlink: "1",
      },
    ];
    const invoke = (inventory = generated, candidateBinding = binding) => (
      validateBinding as (value: typeof binding, fileInventory: typeof generated) => unknown
    )(candidateBinding, inventory);

    expect(invoke()).toEqual(binding);
    expect(() => invoke(generated.slice(1))).toThrow(/link|inventory|missing|exact/iu);
    expect(() => invoke(generated.map((entry) => entry.path === binding.entrypoint_path
      ? { ...entry, sha256: DIGEST_C }
      : entry))).toThrow(/entrypoint|bytes|digest|inventory/iu);
    expect(() => invoke(generated.map((entry) => entry.path === binding.package_json_path
      ? { ...entry, nlink: "2" }
      : entry))).toThrow(/package|hard.?link|nlink|inventory/iu);
    expect(() => invoke(generated.map((entry) => entry.path === binding.entrypoint_path
      ? { ...entry, mode: 0o522 }
      : entry))).toThrow(/entrypoint|mode|writ/iu);
  });

  it("rejects a changed Next target before the sandboxed process can spawn", async () => {
    const candidateModule = await import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs") as Record<string, unknown>;
    const withNextEntrypointAuthority = candidateModule.withCandidateNextEntrypointAuthority;
    expect(typeof withNextEntrypointAuthority).toBe("function");
    if (typeof withNextEntrypointAuthority !== "function") return;

    const root = privateRoot("homecook-candidate-next-entrypoint-pre-spawn-");
    const buildRoot = join(root, "build-work");
    const nodeModulesRoot = join(buildRoot, "node_modules");
    const packageRoot = join(nodeModulesRoot, ".pnpm", "next@15.5.21", "node_modules", "next");
    const entrypointTarget = join(packageRoot, "dist", "bin", "next");
    mkdirSync(dirname(entrypointTarget), { recursive: true, mode: 0o700 });
    writeFileSync(join(packageRoot, "package.json"), '{"name":"next","version":"15.5.21"}\n', { mode: 0o400 });
    writeFileSync(entrypointTarget, "original entrypoint\n", { mode: 0o500 });
    symlinkSync(".pnpm/next@15.5.21/node_modules/next", join(nodeModulesRoot, "next"));
    const runCommand = vi.fn(() => ({
      status: 0, signal: null, stdout: "[]", stderr: "", pid: 4242,
    }));

    await expect((withNextEntrypointAuthority as (
      options: { buildRoot: string, currentUid: number | undefined },
      callback: (authority: { verifyBeforeSpawn: () => void }) => unknown,
    ) => Promise<unknown>)(
      { buildRoot, currentUid: process.getuid?.() },
      ({ verifyBeforeSpawn }) => {
        chmodSync(entrypointTarget, 0o600);
        writeFileSync(entrypointTarget, "swapped before spawn\n");
        chmodSync(entrypointTarget, 0o500);
        return runObservedSandboxCommand({
          sandboxPath: "/usr/bin/sandbox-exec",
          logPath: "/usr/bin/log",
          profile: "(version 1) (deny default)",
          command: "/usr/bin/node",
          args: [entrypointTarget, "build"],
          cwd: buildRoot,
          env: { HOME: root },
          label: "Next pre-spawn target guard",
          beforeSpawn: verifyBeforeSpawn,
          runCommand,
          now: () => Date.parse("2026-09-01T00:00:00.000Z"),
          waitForAuditFlush: () => undefined,
        });
      },
    )).rejects.toThrow(/Next|entrypoint|changed|drift|verification/iu);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("rejects a noncanonical pnpm package target even when it stays inside .pnpm", async () => {
    const candidateModule = await import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs") as Record<string, unknown>;
    const withNextEntrypointAuthority = candidateModule.withCandidateNextEntrypointAuthority;
    expect(typeof withNextEntrypointAuthority).toBe("function");
    if (typeof withNextEntrypointAuthority !== "function") return;

    const root = privateRoot("homecook-candidate-next-entrypoint-shape-");
    const buildRoot = join(root, "build-work");
    const nodeModulesRoot = join(buildRoot, "node_modules");
    const packageRoot = join(nodeModulesRoot, ".pnpm", "next@15.5.21", "node_modules", "renamed");
    mkdirSync(join(packageRoot, "dist", "bin"), { recursive: true, mode: 0o700 });
    writeFileSync(join(packageRoot, "package.json"), '{"name":"next","version":"15.5.21"}\n', { mode: 0o400 });
    writeFileSync(join(packageRoot, "dist", "bin", "next"), "entrypoint\n", { mode: 0o500 });
    symlinkSync(".pnpm/next@15.5.21/node_modules/renamed", join(nodeModulesRoot, "next"));

    await expect((withNextEntrypointAuthority as (
      options: { buildRoot: string, currentUid: number | undefined },
      callback: () => unknown,
    ) => Promise<unknown>)(
      { buildRoot, currentUid: process.getuid?.() },
      () => undefined,
    )).rejects.toThrow(/pnpm|target|shape|next|lexical/iu);
  });

  it("fails closed without exposing candidate paths when the Next target is missing", async () => {
    const candidateModule = await import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs") as Record<string, unknown>;
    const withNextEntrypointAuthority = candidateModule.withCandidateNextEntrypointAuthority;
    expect(typeof withNextEntrypointAuthority).toBe("function");
    if (typeof withNextEntrypointAuthority !== "function") return;

    const root = privateRoot("homecook-candidate-next-entrypoint-missing-");
    const buildRoot = join(root, "build-work");
    const nodeModulesRoot = join(buildRoot, "node_modules");
    mkdirSync(nodeModulesRoot, { recursive: true, mode: 0o700 });
    symlinkSync(".pnpm/next@15.5.21/node_modules/next", join(nodeModulesRoot, "next"));

    let thrown: unknown;
    try {
      await (withNextEntrypointAuthority as (
        options: { buildRoot: string, currentUid: number | undefined },
        callback: () => unknown,
      ) => Promise<unknown>)({ buildRoot, currentUid: process.getuid?.() }, () => undefined);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/Next|entrypoint|authority|missing|unsafe/iu);
    expect((thrown as Error).message).not.toContain(root);
  });

  it("rejects external, traversing, nested-link, hardlink, owner, mode, directory, and link-swap attacks", async () => {
    const candidateModule = await import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs") as Record<string, unknown>;
    const withNextEntrypointAuthority = candidateModule.withCandidateNextEntrypointAuthority;
    expect(typeof withNextEntrypointAuthority).toBe("function");
    if (typeof withNextEntrypointAuthority !== "function") return;

    const fixture = (prefix: string, packageSegment = "next@15.5.21") => {
      const root = privateRoot(prefix);
      const buildRoot = join(root, "build-work");
      const nodeModulesRoot = join(buildRoot, "node_modules");
      const packageRoot = join(nodeModulesRoot, ".pnpm", packageSegment, "node_modules", "next");
      const entrypoint = join(packageRoot, "dist", "bin", "next");
      mkdirSync(dirname(entrypoint), { recursive: true, mode: 0o700 });
      writeFileSync(join(packageRoot, "package.json"), '{"name":"next","version":"15.5.21"}\n', { mode: 0o400 });
      writeFileSync(entrypoint, "entrypoint\n", { mode: 0o500 });
      symlinkSync(`.pnpm/${packageSegment}/node_modules/next`, join(nodeModulesRoot, "next"));
      return { root, buildRoot, nodeModulesRoot, packageRoot, entrypoint };
    };
    const invoke = (
      value: ReturnType<typeof fixture>,
      callback: (authority: { verifyBeforeSpawn: () => void }) => unknown = (
        { verifyBeforeSpawn },
      ) => verifyBeforeSpawn(),
      currentUid = process.getuid?.(),
    ) => (withNextEntrypointAuthority as (
      options: { buildRoot: string, currentUid: number | undefined },
      authorityCallback: typeof callback,
    ) => Promise<unknown>)({ buildRoot: value.buildRoot, currentUid }, callback);

    const absolute = fixture("homecook-next-absolute-");
    const externalPackage = join(absolute.root, "original-store", "next");
    mkdirSync(join(externalPackage, "dist", "bin"), { recursive: true, mode: 0o700 });
    writeFileSync(join(externalPackage, "package.json"), '{"name":"next","version":"15.5.21"}\n', { mode: 0o400 });
    writeFileSync(join(externalPackage, "dist", "bin", "next"), "external\n", { mode: 0o500 });
    unlinkSync(join(absolute.nodeModulesRoot, "next"));
    symlinkSync(externalPackage, join(absolute.nodeModulesRoot, "next"));
    await expect(invoke(absolute)).rejects.toThrow(/Next|pnpm|authority|target|lexical/iu);

    const traversing = fixture("homecook-next-traversal-");
    unlinkSync(join(traversing.nodeModulesRoot, "next"));
    symlinkSync(
      ".pnpm/next@15.5.21/node_modules/../node_modules/next",
      join(traversing.nodeModulesRoot, "next"),
    );
    await expect(invoke(traversing)).rejects.toThrow(/pnpm|target|lexical|authority/iu);

    const unsafeSegment = fixture(
      "homecook-next-unsafe-segment-",
      "next@15.5.21_unsafe\nsegment",
    );
    await expect(invoke(unsafeSegment)).rejects.toThrow(/pnpm|target|lexical|segment/iu);

    const malformedPackage = fixture("homecook-next-malformed-package-");
    const packageJson = join(malformedPackage.packageRoot, "package.json");
    chmodSync(packageJson, 0o600);
    writeFileSync(packageJson, Buffer.concat([
      Buffer.from('{"name":"next","version":"15.5.21","note":"'),
      Buffer.from([0xff]),
      Buffer.from('"}\n'),
    ]));
    chmodSync(packageJson, 0o400);
    await expect(invoke(malformedPackage)).rejects.toThrow(/package|utf|encoding|bytes|invalid/iu);

    const nestedEscape = fixture("homecook-next-nested-escape-");
    unlinkSync(nestedEscape.entrypoint);
    rmdirSync(dirname(nestedEscape.entrypoint));
    rmdirSync(join(nestedEscape.packageRoot, "dist"));
    const outsideDist = join(nestedEscape.root, "outside-dist");
    mkdirSync(join(outsideDist, "bin"), { recursive: true, mode: 0o700 });
    writeFileSync(join(outsideDist, "bin", "next"), "outside\n", { mode: 0o500 });
    symlinkSync(outsideDist, join(nestedEscape.packageRoot, "dist"));
    await expect(invoke(nestedEscape)).rejects.toThrow(/Next|unsafe|authority|directory/iu);

    const hardlinked = fixture("homecook-next-hardlink-");
    linkSync(hardlinked.entrypoint, join(hardlinked.root, "entrypoint-alias"));
    await expect(invoke(hardlinked)).rejects.toThrow(/Next|unsafe|authority|hard|identity/iu);

    const wrongMode = fixture("homecook-next-mode-");
    chmodSync(wrongMode.entrypoint, 0o522);
    await expect(invoke(wrongMode)).rejects.toThrow(/Next|unsafe|mode|identity/iu);

    const wrongOwner = fixture("homecook-next-owner-");
    await expect(invoke(wrongOwner, () => undefined, (process.getuid?.() ?? 0) + 1))
      .rejects.toThrow(/Next|unsafe|owner|authority/iu);

    const directDirectory = fixture("homecook-next-direct-directory-");
    unlinkSync(join(directDirectory.nodeModulesRoot, "next"));
    mkdirSync(join(directDirectory.nodeModulesRoot, "next"), { mode: 0o700 });
    await expect(invoke(directDirectory)).rejects.toThrow(/Next|pnpm|symlink|authority/iu);

    const unguarded = fixture("homecook-next-unguarded-");
    await expect(invoke(unguarded, () => undefined))
      .rejects.toThrow(/pre.?spawn|guard|verification|use/iu);

    const swappedLink = fixture("homecook-next-link-swap-");
    const alternate = join(
      swappedLink.nodeModulesRoot,
      ".pnpm",
      "next@15.5.21_alternate",
      "node_modules",
      "next",
    );
    mkdirSync(join(alternate, "dist", "bin"), { recursive: true, mode: 0o700 });
    writeFileSync(join(alternate, "package.json"), '{"name":"next","version":"15.5.21"}\n', { mode: 0o400 });
    writeFileSync(join(alternate, "dist", "bin", "next"), "alternate\n", { mode: 0o500 });
    await expect(invoke(swappedLink, ({ verifyBeforeSpawn }) => {
      unlinkSync(join(swappedLink.nodeModulesRoot, "next"));
      symlinkSync(".pnpm/next@15.5.21_alternate/node_modules/next", join(swappedLink.nodeModulesRoot, "next"));
      verifyBeforeSpawn();
    })).rejects.toThrow(/Next|symlink|changed|verification|authority/iu);

    const restoredLink = fixture("homecook-next-restored-link-");
    await expect(invoke(restoredLink, ({ verifyBeforeSpawn }) => {
      const linkPath = join(restoredLink.nodeModulesRoot, "next");
      unlinkSync(linkPath);
      symlinkSync(".pnpm/missing/node_modules/next", linkPath);
      unlinkSync(linkPath);
      symlinkSync(".pnpm/next@15.5.21/node_modules/next", linkPath);
      verifyBeforeSpawn();
    })).rejects.toThrow(/Next|symlink|changed|verification|identity/iu);

    const restoredEntrypoint = fixture("homecook-next-restored-entrypoint-");
    await expect(invoke(restoredEntrypoint, ({ verifyBeforeSpawn }) => {
      const original = readFileSync(restoredEntrypoint.entrypoint);
      chmodSync(restoredEntrypoint.entrypoint, 0o700);
      writeFileSync(restoredEntrypoint.entrypoint, "swapped\n");
      writeFileSync(restoredEntrypoint.entrypoint, original);
      chmodSync(restoredEntrypoint.entrypoint, 0o500);
      verifyBeforeSpawn();
    })).rejects.toThrow(/Next|entrypoint|package|changed|verification/iu);

    const failedMutatedEntrypoint = fixture("homecook-next-failed-mutated-entrypoint-");
    await expect(invoke(failedMutatedEntrypoint, ({ verifyBeforeSpawn }) => {
      verifyBeforeSpawn();
      chmodSync(failedMutatedEntrypoint.entrypoint, 0o700);
      writeFileSync(failedMutatedEntrypoint.entrypoint, "mutated-before-failure\n");
      throw new Error("sandboxed Next build failed");
    })).rejects.toThrow(/package or entrypoint changed during verification/iu);

    const restoredTarget = fixture("homecook-next-restored-target-");
    await expect(invoke(restoredTarget, ({ verifyBeforeSpawn }) => {
      const parked = `${restoredTarget.packageRoot}-parked`;
      renameSync(restoredTarget.packageRoot, parked);
      mkdirSync(restoredTarget.packageRoot, { mode: 0o700 });
      rmdirSync(restoredTarget.packageRoot);
      renameSync(parked, restoredTarget.packageRoot);
      verifyBeforeSpawn();
    })).rejects.toThrow(/Next|target|directory|changed|verification/iu);
  });

  it("holds canonical private build-work path authority across generation and rejects path substitution", async () => {
    const candidateModule = await import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs") as Record<string, unknown>;
    const withBuildWorkAuthority = candidateModule.withCandidateBuildWorkAuthority;
    expect(typeof withBuildWorkAuthority).toBe("function");
    if (typeof withBuildWorkAuthority !== "function") return;

    const fixture = (prefix: string) => {
      const root = privateRoot(prefix);
      const runRoot = join(root, "attempt");
      const buildRoot = join(runRoot, "build-work");
      const nodeModulesRoot = join(buildRoot, "node_modules");
      const nextRoot = join(buildRoot, ".next");
      const privateHome = join(runRoot, "build-home");
      const privateTmp = join(runRoot, "tmp");
      for (const path of [
        runRoot, buildRoot, nodeModulesRoot, nextRoot, privateHome, privateTmp,
      ]) mkdirSync(path, { mode: 0o700 });
      chmodSync(buildRoot, 0o500);
      return {
        root, runRoot, buildRoot, nodeModulesRoot, nextRoot,
        privateHome, privateTmp, currentUid: process.getuid?.(),
      };
    };
    const invoke = async (
      paths: ReturnType<typeof fixture>,
      callback: (authority: { writeRoots: string[] }) => unknown,
    ) => (withBuildWorkAuthority as (
      options: ReturnType<typeof fixture>,
      callback: (authority: { writeRoots: string[] }) => unknown,
    ) => Promise<{ authority_digest: string, value: unknown }>)(paths, callback);

    const allowed = fixture("homecook-build-work-authority-allowed-");
    const result = await invoke(allowed, ({ writeRoots }) => {
      expect(writeRoots).toEqual([
        allowed.nodeModulesRoot, allowed.nextRoot, allowed.privateHome, allowed.privateTmp,
      ]);
      mkdirSync(join(allowed.nodeModulesRoot, ".pnpm"), { mode: 0o700 });
      writeFileSync(join(allowed.nodeModulesRoot, ".pnpm", "fixture"), "ok\n", { mode: 0o600 });
      writeFileSync(join(allowed.nextRoot, "BUILD_ID"), "build\n", { mode: 0o600 });
      writeFileSync(join(allowed.privateTmp, "scratch"), "tmp\n", { mode: 0o600 });
      return "built";
    });
    expect(result.value).toBe("built");
    expect(result.authority_digest).toMatch(/^[0-9a-f]{64}$/u);

    const swapped = fixture("homecook-build-work-authority-swapped-");
    await expect(withBuildWorkAuthority({
      ...swapped,
      nodeModulesRoot: swapped.nextRoot,
      nextRoot: swapped.nodeModulesRoot,
    }, () => undefined)).rejects.toThrow(/exact|canonical|run-owned|path/iu);

    const escaped = fixture("homecook-build-work-authority-escape-");
    const outside = join(escaped.root, "outside");
    mkdirSync(outside, { mode: 0o700 });
    chmodSync(escaped.buildRoot, 0o700);
    rmdirSync(escaped.nodeModulesRoot);
    symlinkSync(outside, join(escaped.buildRoot, "node_modules"));
    chmodSync(escaped.buildRoot, 0o500);
    await expect(invoke(escaped, () => undefined)).rejects.toThrow(/symlink|target|escape|canonical/iu);

    const hardlinked = fixture("homecook-build-work-authority-hardlink-");
    const generatedFile = join(hardlinked.nodeModulesRoot, "preloaded");
    writeFileSync(generatedFile, "fixture\n", { mode: 0o600 });
    linkSync(generatedFile, join(hardlinked.root, "hardlink-alias"));
    await expect(invoke(hardlinked, () => undefined)).rejects.toThrow(/hard.?link|empty|generated/iu);

    const substituted = fixture("homecook-build-work-authority-substitution-");
    await expect(invoke(substituted, () => {
      const parked = join(substituted.buildRoot, "node_modules-parked");
      renameSync(substituted.nodeModulesRoot, parked);
      mkdirSync(substituted.nodeModulesRoot, { mode: 0o700 });
      rmdirSync(substituted.nodeModulesRoot);
      renameSync(parked, substituted.nodeModulesRoot);
    })).rejects.toThrow(/identity|substitution|drift|parent/iu);
  });

  it("holds a sealed private pnpm v10 store snapshot outside broad home writes", async () => {
    const candidateModule = await import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs") as Record<string, unknown>;
    const withStoreView = candidateModule.withCandidatePnpmStoreView;
    expect(typeof withStoreView).toBe("function");
    if (typeof withStoreView !== "function") return;

    const fixture = (prefix: string) => {
      const root = privateRoot(prefix);
      const sourceStore = join(root, "approved-store-v10");
      const privateHome = join(root, "candidate-home");
      const storeRoot = join(root, "candidate-store");
      const blobBytes = Buffer.from("package bytes\n");
      const blobIntegrity = createHash("sha512").update(blobBytes).digest("hex");
      const blobRelativePath = join("files", blobIntegrity.slice(0, 2), blobIntegrity.slice(2));
      for (const path of [
        sourceStore, join(sourceStore, "files"), join(sourceStore, "files", blobIntegrity.slice(0, 2)),
        join(sourceStore, "index"), join(sourceStore, "projects"), join(sourceStore, "tmp"), privateHome,
      ]) {
        mkdirSync(path, { mode: 0o700 });
      }
      writeFileSync(join(sourceStore, blobRelativePath), blobBytes, { mode: 0o400 });
      writeFileSync(join(sourceStore, "index", "package.json"), "{}\n", { mode: 0o400 });
      return {
        root, sourceStore, privateHome, storeRoot, blobRelativePath, currentUid: process.getuid?.(),
      };
    };
    const invoke = async (
      paths: ReturnType<typeof fixture>,
      callback: (authority: {
        storePath: string,
        installWritableRoots: string[],
        snapshotInventoryDigest: string,
        sealInstallIndex: () => {
          inventory_digest: string,
          physical_identity_digest: string,
        },
      }) => unknown,
    ) => (withStoreView as (
      options: ReturnType<typeof fixture>,
      callback: (authority: {
        storePath: string,
        installWritableRoots: string[],
        snapshotInventoryDigest: string,
        sealInstallIndex: () => {
          inventory_digest: string,
          physical_identity_digest: string,
        },
      }) => unknown,
    ) => Promise<{
      authority_digest: string,
      final_index_inventory_digest: string,
      final_index_identity_digest: string,
      value: unknown,
    }>)(paths, callback);

    const allowed = fixture("homecook-pnpm-store-view-allowed-");
    const result = await invoke(allowed, ({
      storePath,
      installWritableRoots,
      snapshotInventoryDigest,
      sealInstallIndex,
    }) => {
      expect(storePath).toBe(join(allowed.storeRoot, "v10"));
      expect(storePath.startsWith(`${allowed.privateHome}/`)).toBe(false);
      expect(lstatSync(storePath).mode & 0o777).toBe(0o500);
      expect(lstatSync(join(storePath, "files")).isSymbolicLink()).toBe(false);
      expect(lstatSync(join(storePath, allowed.blobRelativePath)).nlink).toBe(1);
      expect(lstatSync(join(storePath, allowed.blobRelativePath)).mode & 0o777).toBe(0o600);
      expect(realpathSync(join(storePath, "files"))).toBe(join(storePath, "files"));
      expect(realpathSync(join(storePath, "index"))).toBe(join(storePath, "index"));
      expect(lstatSync(join(storePath, "index")).mode & 0o777).toBe(0o700);
      expect(lstatSync(join(storePath, "index", "package.json")).mode & 0o777).toBe(0o600);
      expect(installWritableRoots).toEqual([
        join(storePath, "projects"),
        join(storePath, "tmp"),
        join(storePath, "index"),
      ]);
      expect(snapshotInventoryDigest).toMatch(/^[0-9a-f]{64}$/u);
      expect(readFileSync(join(storePath, allowed.blobRelativePath), "utf8")).toBe("package bytes\n");
      expect(readFileSync(join(storePath, "index", "package.json"), "utf8")).toBe("{}\n");
      writeFileSync(join(storePath, "projects", "candidate"), "owned\n", { mode: 0o600 });
      writeFileSync(join(storePath, "tmp", "metadata"), "scratch\n", { mode: 0o600 });
      writeFileSync(join(storePath, "index", "candidate.json"), "{\"candidate\":true}\n", { mode: 0o600 });
      const sealedIndex = sealInstallIndex();
      expect(sealedIndex.inventory_digest).toMatch(/^[0-9a-f]{64}$/u);
      expect(sealedIndex.physical_identity_digest).toMatch(/^[0-9a-f]{64}$/u);
      expect(readdirSync(storePath).sort()).toEqual(["files", "index"]);
      expect(lstatSync(join(storePath, "index")).mode & 0o777).toBe(0o500);
      expect(lstatSync(join(storePath, "index", "candidate.json")).mode & 0o777).toBe(0o400);
      return "ready";
    });
    expect(result.value).toBe("ready");
    expect(result.authority_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.final_index_inventory_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.final_index_identity_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(lstatSync(join(allowed.storeRoot, "v10", allowed.blobRelativePath)).mode & 0o777).toBe(0o400);
    expect(readFileSync(join(allowed.sourceStore, allowed.blobRelativePath), "utf8")).toBe("package bytes\n");
    expect(readdirSync(join(allowed.storeRoot, "v10")).sort()).toEqual(["files", "index"]);
    expect(existsSync(join(allowed.storeRoot, "v10", "projects"))).toBe(false);
    expect(existsSync(join(allowed.storeRoot, "v10", "tmp"))).toBe(false);

    const missingSeal = fixture("homecook-pnpm-store-view-missing-index-seal-");
    await expect(invoke(missingSeal, () => "unsealed"))
      .rejects.toThrow(/install|index|seal|transition/iu);

    const postSealMutation = fixture("homecook-pnpm-store-view-post-seal-mutation-");
    await expect(invoke(postSealMutation, ({ storePath, sealInstallIndex }) => {
      sealInstallIndex();
      const indexFile = join(storePath, "index", "package.json");
      chmodSync(indexFile, 0o600);
      writeFileSync(indexFile, "{\"mutated\":true}\n");
      chmodSync(indexFile, 0o400);
    })).rejects.toThrow(/index|sealed|inventory|identity|drift/iu);

    const hardlinkedIndex = fixture("homecook-pnpm-store-view-hardlinked-index-");
    await expect(invoke(hardlinkedIndex, ({ storePath, sealInstallIndex }) => {
      linkSync(
        join(storePath, "index", "package.json"),
        join(storePath, "index", "hardlink.json"),
      );
      sealInstallIndex();
    })).rejects.toThrow(/index|hard.?link|nlink|unsafe|seal/iu);

    const symlinkedIndex = fixture("homecook-pnpm-store-view-symlinked-index-");
    await expect(invoke(symlinkedIndex, ({ storePath, sealInstallIndex }) => {
      symlinkSync("package.json", join(storePath, "index", "symlink.json"));
      sealInstallIndex();
    })).rejects.toThrow(/index|symbolic|symlink|unsafe|seal/iu);

    const unexpectedChild = fixture("homecook-pnpm-store-view-unexpected-child-");
    await expect(invoke(unexpectedChild, ({ storePath, sealInstallIndex }) => {
      chmodSync(storePath, 0o700);
      mkdirSync(join(storePath, "unknown"), { mode: 0o700 });
      chmodSync(storePath, 0o500);
      sealInstallIndex();
    })).rejects.toThrow(/unexpected|child|store|seal/iu);

    const filesMutation = fixture("homecook-pnpm-store-view-files-mutation-");
    await expect(invoke(filesMutation, ({ storePath, sealInstallIndex }) => {
      writeFileSync(join(storePath, filesMutation.blobRelativePath), "mutated files bytes\n");
      sealInstallIndex();
    })).rejects.toThrow(/files|store|inventory|identity|drift/iu);

    const sourceDrift = fixture("homecook-pnpm-store-view-source-drift-");
    await expect(invoke(sourceDrift, ({ storePath, sealInstallIndex }) => {
      const sourceBlob = join(sourceDrift.sourceStore, sourceDrift.blobRelativePath);
      chmodSync(sourceBlob, 0o600);
      writeFileSync(sourceBlob, "mutated source bytes\n");
      chmodSync(sourceBlob, 0o400);
      expect(readFileSync(join(storePath, sourceDrift.blobRelativePath), "utf8")).toBe("package bytes\n");
      sealInstallIndex();
    })).rejects.toThrow(/source|store|inventory|identity|drift/iu);

    const escaped = fixture("homecook-pnpm-store-view-escape-");
    const outside = join(escaped.root, "outside");
    mkdirSync(outside, { mode: 0o700 });
    unlinkSync(join(escaped.sourceStore, "index", "package.json"));
    rmdirSync(join(escaped.sourceStore, "index"));
    symlinkSync(outside, join(escaped.sourceStore, "index"));
    await expect(invoke(escaped, () => undefined)).rejects.toThrow(/store|symlink|canonical|identity/iu);

    const substituted = fixture("homecook-pnpm-store-view-substitution-");
    await expect(invoke(substituted, ({ sealInstallIndex }) => {
      const parked = join(substituted.sourceStore, "index-parked");
      renameSync(join(substituted.sourceStore, "index"), parked);
      mkdirSync(join(substituted.sourceStore, "index"), { mode: 0o700 });
      rmdirSync(join(substituted.sourceStore, "index"));
      renameSync(parked, join(substituted.sourceStore, "index"));
      sealInstallIndex();
    })).rejects.toThrow(/store|identity|substitution|drift/iu);
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

  it("accepts only complete roots with exact candidate and bundle authority manifests", async () => {
    const authorityRoot = privateRoot("homecook-candidate-reader-");
    const root = join(authorityRoot, "candidate");
    mkdirSync(root, { mode: 0o700 });
    const sourceStore = join(privateRoot("homecook-candidate-reader-store-source-"), "v10");
    const sourceBlobBytes = Buffer.from("package bytes\n");
    const sourceBlobIntegrity = createHash("sha512").update(sourceBlobBytes).digest("hex");
    const sourceBlobRelativePath = join(
      "files", sourceBlobIntegrity.slice(0, 2), sourceBlobIntegrity.slice(2),
    );
    for (const path of [
      sourceStore, join(sourceStore, "files"), join(sourceStore, "files", sourceBlobIntegrity.slice(0, 2)),
      join(sourceStore, "index"), join(sourceStore, "projects"), join(sourceStore, "tmp"),
    ]) mkdirSync(path, { mode: 0o700 });
    writeFileSync(join(sourceStore, sourceBlobRelativePath), sourceBlobBytes, { mode: 0o400 });
    writeFileSync(join(sourceStore, "index", "package.json"), "{}\n", { mode: 0o400 });
    const storeSnapshot = await withCandidatePnpmStoreView({
      sourceStore,
      storeRoot: join(root, "pnpm-store"),
      currentUid: process.getuid?.(),
    }, ({ sealInstallIndex }) => sealInstallIndex());
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
    mkdirSync(join(componentRoots.app, ".next"), { mode: 0o700 });
    mkdirSync(join(componentRoots.app, "node_modules"), { mode: 0o700 });
    writeFileSync(join(componentRoots.app, ".next", "BUILD_ID"), "fixture-build\n", { mode: 0o600 });
    writeFileSync(join(componentRoots.app, "node_modules", "runtime.js"), "export {};\n", { mode: 0o600 });
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
      selection_digest: manifestInput.selection_digest,
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
      generated_build_inventory_digest: createHash("sha256").update(canonicalizeJcs(
        physical.file_inventory.filter((entry) => entry.source_kind === "generated_build"),
      )).digest("hex"),
      pnpm_store_snapshot_inventory_digest: storeSnapshot.snapshot_inventory_digest,
      pnpm_store_final_index_inventory_digest: storeSnapshot.final_index_inventory_digest,
      sealed_bundle_digest: physical.sealed_bundle_digest,
      source_manifest_digest: manifestInput.source_manifest_digest,
      builder_input_digest: manifestInput.builder_input_digest,
      compose_source_digest: manifestInput.compose_source_digest,
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
      selection_digest: manifestInput.selection_digest,
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
      generated_build_inventory_digest: bundleInput.generated_build_inventory_digest,
      pnpm_store_snapshot_inventory_digest: bundleInput.pnpm_store_snapshot_inventory_digest,
      pnpm_store_final_index_inventory_digest: bundleInput.pnpm_store_final_index_inventory_digest,
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
    const originalPhysicalAuthority = `${root}.physical-authority.json`;
    issueCompletedCandidatePhysicalAuthority({
      candidateRoot: root,
      authorityPath: originalPhysicalAuthority,
    });
    expect(JSON.parse(readFileSync(originalPhysicalAuthority, "utf8"))).toMatchObject({
      schema: "homecook.local-mac-production-rehearsal-candidate-physical-authority.v2",
      pnpm_store_snapshot_inventory_digest: storeSnapshot.snapshot_inventory_digest,
      pnpm_store_final_index_inventory_digest: storeSnapshot.final_index_inventory_digest,
      pnpm_store_final_index_identity_digest: storeSnapshot.final_index_identity_digest,
    });
    expect(readCompletedCandidateRoot(root, {
      physicalAuthorityPath: originalPhysicalAuthority,
    }).manifest).toEqual(candidate);

    chmodSync(root, 0o700);
    chmodSync(join(root, "bundles"), 0o700);
    chmodSync(bundleRoot, 0o700);
    chmodSync(join(bundleRoot, "bundle-manifest.json"), 0o600);
    writeFileSync(join(bundleRoot, "bundle-manifest.json"), canonicalizeJcs({
      ...bundle,
      generated_build_inventory_digest: "f".repeat(64),
    }));
    chmodSync(join(bundleRoot, "bundle-manifest.json"), 0o400);
    chmodSync(bundleRoot, 0o500);
    chmodSync(join(root, "bundles"), 0o500);
    chmodSync(root, 0o500);
    expect(() => readCompletedCandidateRoot(root, {
      physicalAuthorityPath: originalPhysicalAuthority,
    })).toThrow(/generated|inventory|digest|bundle/iu);

    chmodSync(root, 0o700);
    chmodSync(join(root, "bundles"), 0o700);
    chmodSync(bundleRoot, 0o700);
    chmodSync(join(bundleRoot, "bundle-manifest.json"), 0o600);
    writeFileSync(join(bundleRoot, "bundle-manifest.json"), canonicalizeJcs(bundle));
    chmodSync(join(bundleRoot, "bundle-manifest.json"), 0o400);
    chmodSync(bundleRoot, 0o500);
    chmodSync(join(root, "bundles"), 0o500);
    chmodSync(root, 0o500);

    chmodSync(root, 0o700);
    chmodSync(evidenceRoot, 0o700);
    chmodSync(join(evidenceRoot, "ci-evidence.json"), 0o600);
    writeFileSync(join(evidenceRoot, "ci-evidence.json"), canonicalizeJcs({ ...ciEvidence, head_sha: SHA_B }));
    chmodSync(join(evidenceRoot, "ci-evidence.json"), 0o400);
    chmodSync(evidenceRoot, 0o500);
    chmodSync(root, 0o500);
    expect(() => readCompletedCandidateRoot(root, {
      physicalAuthorityPath: originalPhysicalAuthority,
    })).toThrow(/ci|evidence|snapshot|digest|head/iu);

    chmodSync(root, 0o700);
    chmodSync(evidenceRoot, 0o700);
    chmodSync(join(evidenceRoot, "ci-evidence.json"), 0o600);
    writeFileSync(join(evidenceRoot, "ci-evidence.json"), canonicalizeJcs(ciEvidence));
    chmodSync(join(evidenceRoot, "ci-evidence.json"), 0o400);
    chmodSync(evidenceRoot, 0o500);
    chmodSync(root, 0o500);
    const sealedStoreBlob = join(root, "pnpm-store", "v10", sourceBlobRelativePath);
    chmodSync(sealedStoreBlob, 0o600);
    writeFileSync(sealedStoreBlob, "mutated bytes\n");
    chmodSync(sealedStoreBlob, 0o400);
    expect(() => readCompletedCandidateRoot(root, {
      physicalAuthorityPath: originalPhysicalAuthority,
    })).toThrow(/pnpm|store|CAFS|inventory|identity|content/iu);

    const incomplete = privateRoot("homecook-candidate-reader-incomplete-");
    writeFileSync(join(incomplete, "candidate.json"), canonicalizeJcs(candidate), { mode: 0o400 });
    expect(() => readCompletedCandidateRoot(incomplete))
      .toThrow(/complete|terminal|marker|physical|authority|missing/iu);
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
        pnpm_store_snapshot_inventory_digest: DIGEST_C,
        pnpm_store_snapshot_identity_digest: DIGEST_A,
        pnpm_store_final_index_inventory_digest: DIGEST_A,
        pnpm_store_final_index_identity_digest: DIGEST_B,
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
          selection_digest: null,
          checkout_sha: SHA_A,
          release_tree: SHA_B,
          checkout_tree: SHA_B,
          detached: true,
          clean: true,
          tracked_symlinks_contained: true,
          hardlink_count: 0,
          source_snapshot_pre_digest: DIGEST_A,
          source_snapshot_post_digest: DIGEST_A,
          builder_input_digest: DIGEST_B,
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
      collectImages: vi.fn(() => ({
        images: validManifestInput().images,
        compose_source_digest: validManifestInput().compose_source_digest,
      })),
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
      const first = await buildReleaseRehearsalCandidate({
        releaseSha: SHA_A, namespaceRoot, adapters, runId: RUN_A,
        beforeComplete: vi.fn(() => ({ builder_input_digest: DIGEST_B, verified: true })),
      });
      expect(callOrder.slice(0, 4)).toEqual(["tool-lock", "tool", "source", "ci"]);
      const second = await buildReleaseRehearsalCandidate({
        releaseSha: SHA_A, namespaceRoot, adapters, runId: RUN_B,
        beforeComplete: vi.fn(() => ({ builder_input_digest: DIGEST_B, verified: true })),
      });
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
        beforeComplete: vi.fn(() => ({ builder_input_digest: DIGEST_B, verified: true })),
      });
      expect(toolChanged.manifest.sealed_bundle_digest)
        .toBe(first.manifest.sealed_bundle_digest);
      expect(toolChanged.manifest.bundle_manifest_digest)
        .not.toBe(first.manifest.bundle_manifest_digest);
      expect(toolChanged.manifest.candidate_identity_digest)
        .not.toBe(first.manifest.candidate_identity_digest);
      expect(adapters.captureProductionSurface).toHaveBeenCalledTimes(6);

      await expect(buildReleaseRehearsalCandidate({
        releaseSha: SHA_A,
        namespaceRoot,
        adapters,
        runId: RUN_FINALIZE_FAILED,
        beforeComplete: vi.fn(() => { throw new Error("immutable graph drift before completion"); }),
      })).rejects.toThrow(/failed|graph|candidate_build_failed/iu);
      const failedRoot = join(namespaceRoot, "attempts", RUN_FINALIZE_FAILED);
      expect(existsSync(join(failedRoot, "complete.json"))).toBe(false);
      expect(existsSync(join(failedRoot, "candidate.json"))).toBe(false);
      expect(JSON.parse(readFileSync(join(failedRoot, "failed.json"), "utf8"))).toMatchObject({ status: "failed" });
      expect(readdirSync(failedRoot)).toEqual(["failed.json"]);
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

    await expect(buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: RUN_FAILED, beforeComplete: vi.fn() }))
      .rejects.toThrow(/candidate_build_failed|path_digest/iu);
    const failedRoot = join(namespaceRoot, "attempts", RUN_FAILED);
    const failedMarker = join(failedRoot, "failed.json");
    expect(JSON.parse(readFileSync(failedMarker, "utf8"))).toMatchObject({ status: "failed" });
    expect(readdirSync(failedRoot)).toEqual(["failed.json"]);

    await expect(buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: RUN_FAILED, beforeComplete: vi.fn() }))
      .rejects.toThrow(/collision|exists|create-only/iu);
  });

  it("rejects non-cryptorandom run IDs before reserving any namespace path", async () => {
    const namespaceRoot = privateRoot("homecook-rehearsal-run-id-");
    await expect(buildReleaseRehearsalCandidate({
      releaseSha: SHA_A,
      namespaceRoot,
      adapters: {},
      runId: "../escaped",
      beforeComplete: vi.fn(),
    })).rejects.toThrow(/run.?id|uuid|cryptorandom/iu);
    expect(existsSync(join(namespaceRoot, "escaped"))).toBe(false);
  });
});
