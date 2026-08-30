import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  runLocalMacProductionReleaseCli,
  sanitizeLocalMacProductionReleaseCliError,
} from "../scripts/promote-local-mac-production-release.mjs";

const temporaryDirectories: string[] = [];
const SCRIPT_PATH = join(process.cwd(), "scripts", "promote-local-mac-production-release.mjs");
const PROMOTE_ACTIVATION_BLOCKED_ERROR = "activation_blocked: production promote requires the GitHub-attested repeatability receipt gate to be independently reviewed, current-head green, and merged before any adapter, lock, Docker, LaunchAgent, database, or runtime mutation setup.";

function createTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return String(result.stdout ?? "").trim();
}

function createFixtureRepo({
  includeOriginMaster = true,
} = {}) {
  const rootDir = createTempDirectory("homecook-release-cli-root-");
  writeFileSync(join(rootDir, "README.md"), "fixture\n");

  runGit(rootDir, ["init"]);
  runGit(rootDir, ["config", "user.name", "Codex Fixture"]);
  runGit(rootDir, ["config", "user.email", "fixture@example.com"]);
  runGit(rootDir, ["add", "README.md"]);
  runGit(rootDir, ["commit", "-m", "test: create release cli fixture"]);

  const releaseSha = runGit(rootDir, ["rev-parse", "HEAD"]);
  const releaseTree = runGit(rootDir, ["rev-parse", "HEAD^{tree}"]);

  if (includeOriginMaster) {
    runGit(rootDir, ["update-ref", "refs/remotes/origin/master", releaseSha]);
  }
  const releaseTagMessage = [
    "Approved production release prod-20260825.1",
    "build_id build-20260825-01",
    "rehearsal_receipt_schema homecook.local-mac-production-rehearsal-repeatability-receipt.v1",
    `sealed_bundle_digest ${"f".repeat(64)}`,
    `repeatability_receipt_digest ${"1".repeat(64)}`,
    "rehearsal_receipt_valid_until 2026-08-30T09:00:00.000Z",
  ].join("\n");
  runGit(rootDir, ["tag", "-a", "prod-20260825.1", "-m", releaseTagMessage]);
  const releaseTagObjectSha = runGit(rootDir, [
    "rev-parse",
    "refs/tags/prod-20260825.1^{tag}",
  ]);

  const manifestPath = join(rootDir, "release.json");
  writeFileSync(manifestPath, JSON.stringify({
    schema: "homecook.local-mac-production-release.v2",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    signer_workflow: "netsus/homecook/.github/workflows/production-release-attestation.yml",
    signer_digest: releaseSha,
    expected_release_integration_id: 15368,
    promotion_id: "promo-20260825-01",
    release_tag: "prod-20260825.1",
    release_tag_object_sha: releaseTagObjectSha,
    release_manifest_path: manifestPath,
    release_sha: releaseSha,
    release_tree: releaseTree,
    master_sha_at_approval: releaseSha,
    approved_at: "2026-08-25T09:00:00.000Z",
    approved_by_task_id: "task-019-release",
    migration_head: "20260825090000_release_gate",
    build_id: "build-20260825-01",
    rehearsal_receipt_schema: "homecook.local-mac-production-rehearsal-repeatability-receipt.v1",
    sealed_bundle_digest: "f".repeat(64),
    repeatability_receipt_digest: "1".repeat(64),
    rehearsal_receipt_valid_until: "2026-08-30T09:00:00.000Z",
    backup_readiness_evidence: "backup-20260825-01",
    previous_release_sha: "c".repeat(40),
    expected_release_contexts: [
      "build",
      "changes",
      "dependency-audit",
      "policy",
      "quality",
      "security-function-authorization",
      "security-smoke",
    ],
    required_check_summary: {
      total: 12,
      success: 10,
      intended_skip: 2,
    },
    attestation_digest: "d".repeat(64),
    app_launch_agent_enabled: true,
    full_local_launch_agent_enabled: true,
    youtube_worker_launch_agent_enabled: true,
  }, null, 2));

  return {
    manifestPath,
    releaseSha,
    rootDir,
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("promote-local-mac-production-release CLI", () => {
  it("never serializes secret freeze source paths, names, values, or native syscall errors", () => {
    const sourcePath = "/private/tmp/homecook/full-local-secrets/postgres_password";
    const secretValue = "database-password-that-must-not-escape";
    const nativeCause = new Error(`ENOENT: open '${sourcePath}' containing ${secretValue}`);
    const publicError = new Error(
      "runtime_input_freeze_failed: external runtime input authority is invalid.",
      { cause: nativeCause },
    );
    const stderr = `${sanitizeLocalMacProductionReleaseCliError(publicError)}\n`;
    const jsonArtifact = JSON.stringify({ error: stderr });
    for (const prohibited of [
      sourcePath,
      "postgres_password",
      secretValue,
      "ENOENT",
      "open '",
    ]) {
      expect(stderr).not.toContain(prohibited);
      expect(jsonArtifact).not.toContain(prohibited);
    }
    expect(stderr).toBe(
      "runtime_input_freeze_failed: external runtime input authority is invalid.\n",
    );
  });
  it("advertises the full canonical command family in help output", () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "help"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("plan");
    expect(result.stdout).toContain("prepare");
    expect(result.stdout).toContain("promote");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("verify");
    expect(result.stdout).toContain("ACTIVATION BLOCKED");
  });

  it("prints the exact resolved origin/master head for status and plan against a valid fixture repo", () => {
    const fixture = createFixtureRepo();

    const statusResult = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "status",
      ],
      {
        cwd: fixture.rootDir,
        encoding: "utf8",
      },
    );

    expect(statusResult.status, statusResult.stderr).toBe(0);
    expect(statusResult.stdout).toContain(`current_head_sha: ${fixture.releaseSha}`);
    expect(statusResult.stdout).toContain("release_tag: -");

    const planResult = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "plan",
        "--release-manifest",
        fixture.manifestPath,
      ],
      {
        cwd: fixture.rootDir,
        encoding: "utf8",
      },
    );

    expect(planResult.status, planResult.stderr).toBe(0);
    expect(planResult.stdout).toContain(`current_head_sha: ${fixture.releaseSha}`);
    expect(planResult.stdout).toContain("release_tag: prod-20260825.1");
    expect(planResult.stdout).toContain(`release_sha: ${fixture.releaseSha}`);
  });

  it("preserves relative path compatibility for plan and status CLI inputs", () => {
    const fixture = createFixtureRepo();
    mkdirSync(join(fixture.rootDir, "fixture-home"), { mode: 0o700 });
    const manifest = JSON.parse(readFileSync(fixture.manifestPath, "utf8"));
    manifest.release_manifest_path = join(realpathSync(fixture.rootDir), "release.json");
    writeFileSync(fixture.manifestPath, JSON.stringify(manifest, null, 2));

    const statusResult = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "status",
        "--root-dir",
        ".",
        "--home-dir",
        "./fixture-home",
      ],
      {
        cwd: fixture.rootDir,
        encoding: "utf8",
      },
    );

    expect(statusResult.status, statusResult.stderr).toBe(0);
    expect(statusResult.stdout).toContain(`current_head_sha: ${fixture.releaseSha}`);

    const planResult = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "plan",
        "--root-dir",
        ".",
        "--home-dir",
        "./fixture-home",
        "--release-manifest",
        "./release.json",
      ],
      {
        cwd: fixture.rootDir,
        encoding: "utf8",
      },
    );

    expect(planResult.status, planResult.stderr).toBe(0);
    expect(planResult.stdout).toContain("release_tag: prod-20260825.1");
    expect(planResult.stdout).toContain(`release_sha: ${fixture.releaseSha}`);
  });

  it("fails closed for status when the target repo cannot resolve exact origin/master", () => {
    const fixture = createFixtureRepo({ includeOriginMaster: false });

    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "status",
      ],
      {
        cwd: fixture.rootDir,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("origin/master");
    expect(result.stderr).toContain("could not be resolved");
  });

  it("requires the manifest and offline attestation inputs for prepare instead of blanket-blocking it", () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "prepare"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("prepare requires --release-manifest");
    expect(result.stderr).not.toContain("currently blocked");
  });

  it("blocks promote before attestation, adapter, lock, or mutation setup", async () => {
    const createAttestationVerifier = vi.fn(() => vi.fn());
    const createPromoteAdapters = vi.fn(() => {
      throw new Error("promote adapter factory reached");
    });

    await expect(runLocalMacProductionReleaseCli(
      [
        "promote",
        "--release-manifest", "/does/not/matter/release.json",
        "--bundle", "/does/not/matter/bundle.jsonl",
        "--subject-manifest", "/does/not/matter/subject.json",
        "--trusted-root", "/does/not/matter/trusted-root.jsonl",
        "--full-local-config", "/does/not/matter/full-local.json",
        "--worker-config", "/does/not/matter/worker.json",
        "--worker-manifest", "/does/not/matter/worker-manifest.json",
        "--worker-credential", "/does/not/matter/worker-credential",
        "--worker-app-descriptor", "/does/not/matter/app.json",
        "--worker-policy", "/does/not/matter/policy.json",
        "--worker-expected-schema", "/does/not/matter/schema.json",
        "--worker-secret-root", "/does/not/matter/secrets",
        "--confirm-production", "LOCAL_FULL_PRODUCTION_WORKER_INSTALL",
      ],
      { createAttestationVerifier, createPromoteAdapters },
    )).rejects.toThrow(/activation_blocked.*repeatability receipt/iu);

    expect(createAttestationVerifier).not.toHaveBeenCalled();
    expect(createPromoteAdapters).not.toHaveBeenCalled();
  });

  it("runs the dormant receipt and mixed-state gate before constructing promotion adapters", async () => {
    const mutation = vi.fn();
    const gate = vi.fn(() => { throw new Error("expired repeatability receipt"); });
    const createPromotionAuthorityVerifier = vi.fn(() => gate);
    const createPromoteAdapters = vi.fn(() => {
      mutation();
      return {};
    });
    const createAttestationVerifier = vi.fn(() => vi.fn());
    const parseArguments = vi.fn(() => ({
      command: "promote",
      bundlePath: "/private/bundle",
      confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL",
      fullLocalConfigPath: "/private/full-local",
      homeDir: "/private/home",
      json: true,
      memberReceiptPaths: ["/private/member-1", "/private/member-2"],
      nodeBin: process.execPath,
      productionInventoryPath: "/private/inventory",
      releaseManifestPath: "/private/manifest",
      repeatabilityReceiptPath: "/private/repeatability",
      rootDir: process.cwd(),
      sealedCandidatePath: "/private/candidate",
      subjectManifestPath: "/private/subject",
      trustedRootPath: "/private/trusted-root",
      workerAppDescriptorPath: "/private/worker-app",
      workerConfigPath: "/private/worker-config",
      workerCredentialPath: "/private/worker-credential",
      workerExpectedSchemaPath: "/private/worker-schema",
      workerManifestPath: "/private/worker-manifest",
      workerPolicyPath: "/private/worker-policy",
      workerSecretRoot: "/private/worker-secrets",
    }));

    await expect(runLocalMacProductionReleaseCli(["promote"], {
      assertPromoteActivated: vi.fn(),
      createAttestationVerifier,
      createPromotionAuthorityVerifier,
      createPromoteAdapters,
      parseArguments,
    } as unknown as Parameters<typeof runLocalMacProductionReleaseCli>[1]))
      .rejects.toThrow(/expired|repeatability|receipt/iu);

    expect(gate).toHaveBeenCalledTimes(1);
    expect(createPromoteAdapters).not.toHaveBeenCalled();
    expect(mutation).toHaveBeenCalledTimes(0);
  });

  it("carries the pre-adapter authority digest into internal initial and final verification", async () => {
    const authority = { verified: true, authority_digest: "a".repeat(64) };
    const verifyRehearsalAuthority = vi.fn(() => authority);
    const promoteRelease = vi.fn(async (options) => ({
      promoted: false,
      expected_digest: options.expectedRehearsalAuthorityDigest,
    }));
    const options = {
      command: "promote", bundlePath: "/private/bundle", confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL",
      fullLocalConfigPath: "/private/full-local", homeDir: "/private/home", json: true,
      memberReceiptPaths: ["/private/member-1", "/private/member-2"], nodeBin: process.execPath,
      productionInventoryPath: "/private/inventory", releaseManifestPath: "/private/manifest",
      repeatabilityReceiptPath: "/private/repeatability", rootDir: process.cwd(), sealedCandidatePath: "/private/candidate",
      subjectManifestPath: "/private/subject", trustedRootPath: "/private/trusted-root",
      workerAppDescriptorPath: "/private/worker-app", workerConfigPath: "/private/worker-config",
      workerCredentialPath: "/private/worker-credential", workerExpectedSchemaPath: "/private/worker-schema",
      workerManifestPath: "/private/worker-manifest", workerPolicyPath: "/private/worker-policy",
      workerSecretRoot: "/private/worker-secrets",
    };

    await runLocalMacProductionReleaseCli(["promote"], {
      assertPromoteActivated: vi.fn(),
      createAttestationVerifier: vi.fn(() => vi.fn()),
      createPromotionAuthorityVerifier: vi.fn(() => verifyRehearsalAuthority),
      createPromoteAdapters: vi.fn(() => ({})),
      parseArguments: vi.fn(() => options),
      promoteRelease,
    } as unknown as Parameters<typeof runLocalMacProductionReleaseCli>[1]);

    expect(promoteRelease).toHaveBeenCalledWith(expect.objectContaining({
      expectedRehearsalAuthorityDigest: authority.authority_digest,
      verifyRehearsalAuthority,
    }));
  });

  it("reports the promote activation block before argument or adapter validation", () => {
    const promote = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "promote"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(promote.status).toBe(1);
    expect(promote.stderr).toBe(`${PROMOTE_ACTIVATION_BLOCKED_ERROR}\n`);
  });

  it.each([
    ["unknown option", ["promote", "--unknown", "value"]],
    ["missing value", ["promote", "--release-manifest"]],
  ])("blocks malformed promote argv before parsing: %s", async (_name, argv) => {
    const parseArguments = vi.fn(() => {
      throw new Error("argument parser reached");
    });
    const createAttestationVerifier = vi.fn(() => vi.fn());
    const createPromoteAdapters = vi.fn(() => {
      throw new Error("promote adapter factory reached");
    });

    await expect(runLocalMacProductionReleaseCli(argv, {
      createAttestationVerifier,
      createPromoteAdapters,
      parseArguments,
    })).rejects.toThrow(new Error(PROMOTE_ACTIVATION_BLOCKED_ERROR));

    expect(parseArguments).not.toHaveBeenCalled();
    expect(createAttestationVerifier).not.toHaveBeenCalled();
    expect(createPromoteAdapters).not.toHaveBeenCalled();

    const result = spawnSync(process.execPath, [SCRIPT_PATH, ...argv], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(`${PROMOTE_ACTIVATION_BLOCKED_ERROR}\n`);
  });

  it("keeps verify argument validation available while promote is blocked", () => {
    const verify = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "verify"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(verify.status).toBe(1);
    expect(verify.stderr).toContain("verify requires --release-manifest");
    expect(verify.stderr).not.toContain("activation_blocked");
  });

});
