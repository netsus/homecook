import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildCandidateManifest,
  buildReleaseRehearsalCandidate,
  createSealedCandidateBundle,
  parseAndValidateCandidateManifest,
  readBuildEnvironmentSnapshot,
  validateCandidateCiEvidence,
  validateCandidateImages,
  validateCandidateSourceEvidence,
  validateCandidateToolchain,
} from "../scripts/lib/local-mac-production-rehearsal-candidate.mjs";
import { canonicalizeJcs } from "../scripts/lib/rfc8785-jcs.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);

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
    docker_client: tool("docker-client"),
    docker_daemon: tool("docker-daemon"),
    candidate_builder: tool("candidate-builder"),
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
    build_id: `candidate-${SHA_A}`,
    sealed_bundle_digest: DIGEST_B,
    bundle_manifest_digest: DIGEST_C,
    toolchain: validToolchain(),
    images: [{
      digest: `sha256:${DIGEST_A}`,
      platform: "linux/arm64",
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
      path: "package.json",
      type: "file",
      mode: 0o400,
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
      mutation_attempt_count: 0,
      production_db_connection_count: 0,
      production_db_write_count: 0,
    },
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
        "sealed_bundle_digest",
        "bundle_manifest_digest",
        "toolchain",
        "images",
        "migration",
        "artifacts",
        "file_inventory",
        "environment_snapshot",
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
});

describe("release rehearsal candidate input gates", () => {
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

    const validImages = [{ digest: `sha256:${DIGEST_A}`, platform: "linux/arm64", local_cache_provenance_digest: DIGEST_B }];
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
});

describe("release rehearsal candidate orchestration", () => {
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
    expect(first.bundle_manifest_digest).toBe(second.bundle_manifest_digest);
    expect(first.file_inventory).toEqual(second.file_inventory);
    expect(first.file_inventory).toContainEqual(expect.objectContaining({
      component: "app",
      path: "data.txt",
      type: "file",
      mode: 0o400,
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

  it("uses an explicit child env, rejects network/pull attempts, and binds deterministic outputs", async () => {
    const namespaceRoot = privateRoot("homecook-rehearsal-namespace-");
    const checkoutFiles = new Map<string, string>([["package.json", "{}\n"]]);
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
      };
    });
    const adapters = {
      prepareSource: vi.fn(() => ({
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
      })),
      collectCiEvidence: vi.fn(() => validateCandidateCiEvidence({
        head_sha: SHA_A,
        expected_head_sha: SHA_A,
        summary_digest: DIGEST_A,
        summary: { total: 1, success: 1, intended_skip: 0, bad: 0, cancelled: 0, failed: 0, pending: 0, queued: 0, rerun: 0 },
      })),
      collectToolchain: vi.fn(() => validToolchain()),
      collectImages: vi.fn(() => validManifestInput().images),
      collectMigration: vi.fn(() => validManifestInput().migration),
      readEnvironment: vi.fn(() => ({ values: {}, metadata: validManifestInput().environment_snapshot })),
      executeBuild,
      networkAttemptCount: vi.fn(() => 0),
      dockerPullAttemptCount: vi.fn(() => 0),
    };
    const previous = process.env.LEAK_FROM_PROCESS_ENV;
    process.env.LEAK_FROM_PROCESS_ENV = "must-not-leak";
    try {
      const first = await buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: "run-a" });
      const second = await buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: "run-b" });
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
        runId: "run-tool-change",
      });
      expect(toolChanged.manifest.sealed_bundle_digest)
        .not.toBe(first.manifest.sealed_bundle_digest);
    } finally {
      if (previous === undefined) delete process.env.LEAK_FROM_PROCESS_ENV;
      else process.env.LEAK_FROM_PROCESS_ENV = previous;
    }

    adapters.networkAttemptCount = vi.fn(() => 1);
    await expect(buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: "run-network" }))
      .rejects.toThrow(/network|offline/iu);
    adapters.networkAttemptCount = vi.fn(() => 0);
    adapters.dockerPullAttemptCount = vi.fn(() => 1);
    await expect(buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: "run-pull" }))
      .rejects.toThrow(/pull|image|offline/iu);
  });

  it("preserves partial failures under a private failed root and rejects create-only collisions", async () => {
    const namespaceRoot = privateRoot("homecook-rehearsal-failure-");
    const adapters = {
      prepareSource: vi.fn(({ runRoot }: { runRoot: string }) => {
        writeFileSync(join(runRoot, "leaked-build-env.txt"), "DATABASE_URL=must-not-persist\n", { mode: 0o600 });
        throw new Error("offline package miss");
      }),
    };

    await expect(buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: "failed-a" }))
      .rejects.toThrow(/offline package miss/iu);
    const failedMarker = join(namespaceRoot, "failed", "failed-a", "failure.json");
    expect(JSON.parse(readFileSync(failedMarker, "utf8"))).toMatchObject({ status: "failed" });
    expect(existsSync(join(namespaceRoot, "failed", "failed-a", "leaked-build-env.txt")))
      .toBe(false);

    await expect(buildReleaseRehearsalCandidate({ releaseSha: SHA_A, namespaceRoot, adapters, runId: "failed-a" }))
      .rejects.toThrow(/collision|exists|create-only/iu);
  });
});
