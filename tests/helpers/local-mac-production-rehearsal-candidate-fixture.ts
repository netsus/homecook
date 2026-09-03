import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  buildBundleAuthorityManifest,
  buildCandidateManifest,
  createSealedCandidateBundle,
  issueCompletedCandidatePhysicalAuthority,
  withCandidatePnpmStoreView,
  writeCandidateTerminalMarker,
} from "../../scripts/lib/local-mac-production-rehearsal-candidate.mjs";
import { canonicalizeJcs, sha256Jcs } from "../../scripts/lib/rfc8785-jcs.mjs";
import { EXPECTED_RELEASE_CONTEXTS } from "../../scripts/lib/production-release-approval-policy.mjs";
import type { OwnedTempRegistry } from "./owned-temp-root";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);

function sandboxStageCapabilityPolicy() {
  const policyText = canonicalizeJcs({
    schema: "homecook.sandbox-stage-capability-policy-text.v1",
    stages: [
      { stage: "offline-install", allowed_mach_lookup_global_names: ["com.apple.SystemConfiguration.DNSConfiguration"] },
      { stage: "next-build", allowed_mach_lookup_global_names: [] },
    ],
    network_policy: "deny-all",
    no_log_denials: ["com.apple.diagnosticd"],
  });
  return {
    schema: "homecook.sandbox-stage-capability-policy.v1",
    policy_text: policyText,
    policy_digest: createHash("sha256").update(policyText).digest("hex"),
    install: { stage: "offline-install", allowed_mach_lookup_global_names: ["com.apple.SystemConfiguration.DNSConfiguration"], allow_count: 1 },
    build: { stage: "next-build", allowed_mach_lookup_global_names: [], allow_count: 0 },
    observed: {
      install_audit_digest: DIGEST_A, install_denial_count: 0, install_process_attempt_count: 0,
      build_audit_digest: DIGEST_B, build_denial_count: 0, build_process_attempt_count: 0,
    },
  };
}

function privateRoot(prefix: string, tempRegistry: OwnedTempRegistry) {
  return tempRegistry.createOwnedTempRoot(prefix);
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

function toolchain() {
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

function storedCiEvidence(releaseSha = SHA_A) {
  const checkRuns = EXPECTED_RELEASE_CONTEXTS.map((name, index) => ({
    id: 11 + index,
    app_id: 15_368,
    check_suite_id: 21 + index,
    head_sha: releaseSha,
    name,
    status: "completed",
    conclusion: "success",
    started_at: `2026-08-29T00:00:${String(index).padStart(2, "0")}Z`,
    completed_at: `2026-08-29T00:01:${String(index).padStart(2, "0")}Z`,
  }));
  const summary = {
    total: EXPECTED_RELEASE_CONTEXTS.length,
    success: EXPECTED_RELEASE_CONTEXTS.length,
    intended_skip: 0,
    bad: 0,
    cancelled: 0,
    failed: 0,
    pending: 0,
    queued: 0,
    rerun: 0,
  };
  const projection = {
    repository: "netsus/homecook",
    head_sha: releaseSha,
    remote_master_sha: releaseSha,
    check_runs: checkRuns,
    commit_statuses: [],
    summary,
  };
  return {
    projection,
    snapshotDigest: sha256Jcs(projection),
    summaryDigest: sha256Jcs(summary),
    suiteRunSetDigest: sha256Jcs(checkRuns.map(({ app_id, check_suite_id, id }) => ({
      app_id,
      check_suite_id,
      id,
    }))),
  };
}

export async function createCompletedRehearsalCandidateFixture(
  prefix = "homecook-r2-real-candidate-",
  {
    releaseSha = SHA_A,
    releaseTree = SHA_B,
    tempRegistry,
  }: {
    releaseSha?: string;
    releaseTree?: string;
    tempRegistry: OwnedTempRegistry;
  },
) {
  const authorityRoot = privateRoot(prefix, tempRegistry);
  const candidateRoot = join(authorityRoot, "candidate");
  mkdirSync(candidateRoot, { mode: 0o700 });

  const sourceStore = join(privateRoot(`${prefix}store-`, tempRegistry), "v10");
  const blobBytes = Buffer.from("package bytes\n");
  const blobIntegrity = createHash("sha512").update(blobBytes).digest("hex");
  const blobRelativePath = join("files", blobIntegrity.slice(0, 2), blobIntegrity.slice(2));
  for (const path of [
    sourceStore,
    join(sourceStore, "files"),
    join(sourceStore, "files", blobIntegrity.slice(0, 2)),
    join(sourceStore, "index"),
    join(sourceStore, "projects"),
    join(sourceStore, "tmp"),
  ]) mkdirSync(path, { mode: 0o700 });
  writeFileSync(join(sourceStore, blobRelativePath), blobBytes, { mode: 0o400 });
  writeFileSync(join(sourceStore, "index", "package.json"), "{}\n", { mode: 0o400 });
  const storeSnapshot = await withCandidatePnpmStoreView({
    sourceStore,
    storeRoot: join(candidateRoot, "pnpm-store"),
    currentUid: process.getuid?.(),
  }, ({ sealInstallIndex }) => sealInstallIndex());

  const componentSource = privateRoot(`${prefix}components-`, tempRegistry);
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

  const bundlesRoot = join(candidateRoot, "bundles");
  const bundleRoot = join(bundlesRoot, "bundle");
  mkdirSync(bundlesRoot, { mode: 0o700 });
  const physical = createSealedCandidateBundle({ bundleRoot, componentRoots });
  const ci = storedCiEvidence(releaseSha);
  const evidenceRoot = join(candidateRoot, "evidence");
  mkdirSync(evidenceRoot, { mode: 0o700 });
  writeFileSync(join(evidenceRoot, "ci-evidence.json"), canonicalizeJcs(ci.projection), { mode: 0o400 });
  chmodSync(evidenceRoot, 0o500);

  const migrationEntries = [
    { path: "supabase/migrations/20260101000000_one.sql", sha256: "1".repeat(64) },
    { path: "supabase/migrations/20260102000000_two.sql", sha256: "2".repeat(64) },
  ];
  const migration = {
    ordered_migration_files: migrationEntries.map(({ path }) => path),
    ordered_migration_files_digest: sha256Jcs(migrationEntries),
    migration_head: "20260102000000_two",
  };
  const environmentSnapshot = {
    source_allowlist_id: "homecook-release-rehearsal-build-env-v1",
    opaque_source_identity_digest: DIGEST_A,
    opaque_override_digest: DIGEST_B,
    exposed_value_count: 0,
  };
  const productionGuard = {
    snapshot_schema: "homecook.local-mac-production-surface-snapshot.v1",
    production_snapshot_pre_digest: DIGEST_A,
    production_snapshot_post_digest: DIGEST_A,
    equal: true,
    mutation_attempt_count: 0,
    production_db_connection_count: 0,
    production_db_write_count: 0,
  };
  const generatedBuildInventoryDigest = sha256Jcs(
    physical.file_inventory.filter((entry: { source_kind: string }) => entry.source_kind === "generated_build"),
  );
  const bundleInput = {
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    selection_digest: null,
    artifacts: physical.artifacts,
    build_id: "build-r2",
    build_tools: { next_cli: tool("next-cli") },
    ci_check_summary_digest: ci.summaryDigest,
    ci_snapshot_digest: ci.snapshotDigest,
    ci_suite_run_set_digest: ci.suiteRunSetDigest,
    environment_snapshot: environmentSnapshot,
    file_inventory: physical.file_inventory,
    images: [{
      service: "fixture",
      reference: `example/fixture@sha256:${DIGEST_A}`,
      digest: `sha256:${DIGEST_A}`,
      platform: "linux/arm64",
      image_id: `sha256:${DIGEST_C}`,
      local_cache_provenance_digest: DIGEST_B,
    }],
    migration,
    production_guard: productionGuard,
    release_sha: releaseSha,
    release_tree: releaseTree,
    sandbox_policy_digest: DIGEST_B,
    sandbox_stage_capability_policy: sandboxStageCapabilityPolicy(),
    generated_build_inventory_digest: generatedBuildInventoryDigest,
    pnpm_store_snapshot_inventory_digest: storeSnapshot.snapshot_inventory_digest,
    pnpm_store_final_index_inventory_digest: storeSnapshot.final_index_inventory_digest,
    sealed_bundle_digest: physical.sealed_bundle_digest,
    source_manifest_digest: DIGEST_A,
    builder_input_digest: DIGEST_B,
    compose_source_digest: DIGEST_C,
    source_snapshot_digest: DIGEST_A,
    toolchain: toolchain(),
    toolchain_lock_digest: DIGEST_B,
  };
  const bundle = buildBundleAuthorityManifest(bundleInput);
  chmodSync(bundleRoot, 0o700);
  writeFileSync(join(bundleRoot, "bundle-manifest.json"), canonicalizeJcs(bundle), { mode: 0o400 });
  chmodSync(bundleRoot, 0o500);
  chmodSync(bundlesRoot, 0o500);

  const candidateIdentityDigest = sha256Jcs({
    schema: "homecook.local-mac-production-rehearsal-candidate-identity.v1",
    selection_digest: null,
    bundle_manifest_digest: bundle.bundle_manifest_digest,
    sealed_bundle_digest: physical.sealed_bundle_digest,
  });
  chmodSync(bundlesRoot, 0o700);
  writeFileSync(join(bundlesRoot, "candidate-identity.json"), canonicalizeJcs({
    schema: "homecook.local-mac-production-rehearsal-candidate-identity.v1",
    candidate_identity_digest: candidateIdentityDigest,
  }), { mode: 0o400 });
  chmodSync(bundlesRoot, 0o500);

  const candidate = buildCandidateManifest({
    schema: "homecook.local-mac-production-rehearsal-candidate.v1",
    canonicalization: "RFC8785-JCS+SHA256",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    selection_digest: null,
    release_sha: releaseSha,
    release_tree: releaseTree,
    ci_check_summary_digest: ci.summaryDigest,
    ci_snapshot_digest: ci.snapshotDigest,
    ci_suite_run_set_digest: ci.suiteRunSetDigest,
    builder_input_digest: DIGEST_B,
    source_manifest_digest: DIGEST_A,
    compose_source_digest: DIGEST_C,
    sandbox_policy_digest: DIGEST_B,
    sandbox_stage_capability_policy: sandboxStageCapabilityPolicy(),
    generated_build_inventory_digest: generatedBuildInventoryDigest,
    pnpm_store_snapshot_inventory_digest: storeSnapshot.snapshot_inventory_digest,
    pnpm_store_final_index_inventory_digest: storeSnapshot.final_index_inventory_digest,
    build_id: "build-r2",
    sealed_bundle_digest: physical.sealed_bundle_digest,
    bundle_manifest_digest: bundle.bundle_manifest_digest,
    toolchain: toolchain(),
    build_tools: { next_cli: tool("next-cli") },
    toolchain_lock_digest: DIGEST_B,
    images: bundleInput.images,
    migration,
    artifacts: physical.artifacts,
    file_inventory: physical.file_inventory,
    environment_snapshot: environmentSnapshot,
    production_guard: productionGuard,
    candidate_identity_digest: candidateIdentityDigest,
  });
  writeFileSync(join(candidateRoot, "candidate.json"), canonicalizeJcs(candidate), { mode: 0o400 });
  writeCandidateTerminalMarker(candidateRoot, "complete", {
    candidate_identity_digest: candidateIdentityDigest,
    manifest_digest: candidate.manifest_digest,
  });
  chmodSync(candidateRoot, 0o500);
  const physicalAuthorityPath = `${candidateRoot}.physical-authority.json`;
  issueCompletedCandidatePhysicalAuthority({ candidateRoot, authorityPath: physicalAuthorityPath });

  return {
    authorityRoot,
    blobRelativePath,
    candidateRoot,
    manifest: candidate,
    physicalAuthorityPath,
  };
}
