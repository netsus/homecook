import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runLocalMacProductionRehearsalCli } from "../scripts/local-mac-production-rehearsal.mjs";

const SCRIPT = join(process.cwd(), "scripts", "local-mac-production-rehearsal.mjs");

function outputBuffer() {
  let value = "";
  return {
    stream: { write: (chunk: unknown) => { value += String(chunk); } },
    value: () => value,
  };
}

describe("local Mac production rehearsal CLI", () => {
  it("documents the split-two candidate command while preserving production mutation zero exclusions", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "help"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("inventory");
    expect(result.stdout).toContain("classify");
    expect(result.stdout).toContain("candidate");
    expect(result.stdout).toContain("selection");
    expect(result.stdout).toContain("verify");
    expect(result.stdout).toContain("PRODUCTION MUTATION: 0");
    expect(result.stdout).toContain("Docker rehearsal runner");
    expect(result.stdout).toContain("recovery execution");
    expect(result.stdout).not.toContain(" promote ");
  });

  it("creates an explicit closed rehearsal selection only after exact confirmation", async () => {
    const output = outputBuffer();
    const buildSelection = vi.fn(() => ({
      schema: "homecook.local-mac-production-rehearsal-selection.v1",
      selection_digest: "e".repeat(64),
    }));
    const writeSelection = vi.fn(() => "/private/selections/selected.json");
    const resolveSelectionGitAuthority = vi.fn(async () => ({
      selected_release_tree: "b".repeat(40),
      observed_master_sha: "c".repeat(40),
      observed_master_tree: "d".repeat(40),
    }));

    await runLocalMacProductionRehearsalCli([
      "selection",
      "--release-sha", "a".repeat(40),
      "--selection", "/private/selections/selected.json",
      "--valid-until", "2026-08-31T07:00:00.000Z",
      "--approved-by", "release-coordinator",
      "--approval-id", "approval-1",
      "--issuer-task-id", "task-author",
      "--confirm", "APPROVE_RELEASE_REHEARSAL_SELECTION",
      "--json",
    ], {
      now: new Date("2026-08-31T03:00:00.000Z"),
      output: output.stream,
      buildSelection,
      writeSelection,
      resolveSelectionGitAuthority,
    });

    expect(resolveSelectionGitAuthority).toHaveBeenCalledWith(expect.objectContaining({
      releaseSha: "a".repeat(40),
      repositoryRoot: process.cwd(),
    }));
    expect(buildSelection).toHaveBeenCalledWith(expect.objectContaining({
      confirmation: "APPROVE_RELEASE_REHEARSAL_SELECTION",
      selected_release_sha: "a".repeat(40),
      selected_release_tree: "b".repeat(40),
      observed_master_sha: "c".repeat(40),
      observed_master_tree: "d".repeat(40),
      selected_at: "2026-08-31T03:00:00.000Z",
      valid_until: "2026-08-31T07:00:00.000Z",
    }));
    expect(writeSelection).toHaveBeenCalledWith({
      path: "/private/selections/selected.json",
      selection: expect.objectContaining({ selection_digest: "e".repeat(64) }),
      now: new Date("2026-08-31T03:00:00.000Z"),
    });
    expect(JSON.parse(output.value())).toEqual({
      selection: {
        schema: "homecook.local-mac-production-rehearsal-selection.v1",
        selection_digest: "e".repeat(64),
      },
      selection_path: "/private/selections/selected.json",
      status: "created",
    });
  });

  it("builds an exact-SHA candidate through injected trusted adapters", async () => {
    const output = outputBuffer();
    const adapters = { trusted: true };
    const createCandidateAdapters = vi.fn(() => adapters);
    const beforeCandidateComplete = vi.fn(() => ({
      builder_input_digest: "b".repeat(64),
      verified: true,
    }));
    const buildCandidate = vi.fn(async (options) => {
      await options.beforeComplete({ builder_input_digest: "b".repeat(64) });
      return {
        candidate_root: "/private/candidate/run-a",
        manifest: {
          schema: "candidate-fixture",
          release_sha: options.releaseSha,
        },
      };
    });

    await runLocalMacProductionRehearsalCli([
      "candidate", "--release-sha", "a".repeat(40),
      "--production-env-authority", "/private/server/full-local-production.env", "--json",
    ], {
      immutableBuilderInputDigest: "b".repeat(64),
      immutableBuilderInputEntries: [{ blob_oid: "c".repeat(40), git_mode: "100644", path: "scripts/fixture.mjs", sha256: "d".repeat(64) }],
      immutableBootstrapVerified: true,
      immutableObservedMasterSha: "a".repeat(40),
      immutableObservedMasterTree: "f".repeat(40),
      beforeCandidateComplete,
      output: output.stream,
      createCandidateAdapters,
      buildCandidate,
      candidateNamespaceResolver: () => "/private/rehearsal",
      runIdFactory: () => "run-a",
    });

    expect(createCandidateAdapters).toHaveBeenCalledWith(expect.objectContaining({
      builderInputDigest: "b".repeat(64),
      builderInputEntries: expect.any(Array),
      productionEnvAuthorityPath: "/private/server/full-local-production.env",
      rootDir: process.cwd(),
      sourceAuthorization: expect.objectContaining({
        mode: "current-tip",
        release_sha: "a".repeat(40),
        release_tree: "f".repeat(40),
      }),
    }));
    expect(buildCandidate).toHaveBeenCalledWith(expect.objectContaining({
      releaseSha: "a".repeat(40),
      sourceAuthorization: expect.objectContaining({ mode: "current-tip" }),
      namespaceRoot: "/private/rehearsal",
      adapters,
      runId: "run-a",
      beforeComplete: expect.any(Function),
    }));
    expect(beforeCandidateComplete).toHaveBeenCalledWith({
      builder_input_digest: "b".repeat(64),
    });
    expect(JSON.parse(output.value())).toMatchObject({
      candidate_root: "/private/candidate/run-a",
      manifest: { release_sha: "a".repeat(40) },
    });
  });

  it("prints no candidate path when immutable finalization fails", async () => {
    const output = outputBuffer();
    const buildCandidate = vi.fn(async (options) => {
      await options.beforeComplete({ builder_input_digest: "b".repeat(64) });
      return { candidate_root: "/private/must-not-print", manifest: {} };
    });
    await expect(runLocalMacProductionRehearsalCli([
      "candidate", "--release-sha", "a".repeat(40),
      "--production-env-authority", "/private/server/full-local-production.env", "--json",
    ], {
      immutableBuilderInputDigest: "b".repeat(64),
      immutableBuilderInputEntries: [{ blob_oid: "c".repeat(40), git_mode: "100644", path: "scripts/fixture.mjs", sha256: "d".repeat(64) }],
      immutableBootstrapVerified: true,
      immutableObservedMasterSha: "a".repeat(40),
      immutableObservedMasterTree: "f".repeat(40),
      beforeCandidateComplete: vi.fn(() => { throw new Error("immutable graph drift"); }),
      output: output.stream,
      createCandidateAdapters: vi.fn(() => ({})),
      buildCandidate,
      candidateNamespaceResolver: () => "/private/rehearsal",
      runIdFactory: () => "run-a",
    })).rejects.toThrow(/immutable graph drift/iu);
    expect(output.value()).toBe("");
  });

  it("requires and revalidates an approved ancestor selection around candidate finalization", async () => {
    const output = outputBuffer();
    const revalidate = vi.fn(() => true);
    const selectionAuthority = {
      selection: {
        observed_master_sha: "b".repeat(40),
        selection_digest: "c".repeat(64),
      },
      revalidate,
    };
    const readSelection = vi.fn(() => selectionAuthority);
    const sourceAuthorization = {
      mode: "approved-ancestor",
      release_sha: "a".repeat(40),
      release_tree: "d".repeat(40),
      observed_master_sha: "b".repeat(40),
      observed_master_tree: "e".repeat(40),
      selection_digest: "c".repeat(64),
      selection_valid_until: "2026-08-31T07:00:00.000Z",
    };
    const authorizeCandidateSource = vi.fn(async () => sourceAuthorization);
    const beforeCandidateComplete = vi.fn(() => ({
      builder_input_digest: "f".repeat(64),
      verified: true,
    }));
    const buildCandidate = vi.fn(async (options) => {
      await options.beforeComplete({ builder_input_digest: "f".repeat(64) });
      return { candidate_root: "/private/candidate/ancestor", manifest: { release_sha: options.releaseSha } };
    });

    await runLocalMacProductionRehearsalCli([
      "candidate",
      "--release-sha", "a".repeat(40),
      "--selection", "/private/selections/ancestor.json",
      "--production-env-authority", "/private/server/full-local-production.env",
      "--json",
    ], {
      immutableBuilderInputDigest: "f".repeat(64),
      immutableBuilderInputEntries: [{ blob_oid: "1".repeat(40), git_mode: "100644", path: "scripts/fixture.mjs", sha256: "2".repeat(64) }],
      immutableBootstrapVerified: true,
      immutableObservedMasterSha: "b".repeat(40),
      immutableObservedMasterTree: "e".repeat(40),
      now: new Date("2026-08-31T03:00:00.000Z"),
      nowFactory: () => new Date("2026-08-31T03:30:00.000Z"),
      output: output.stream,
      readSelection,
      authorizeCandidateSource,
      resolveCandidateHistory: vi.fn(),
      beforeCandidateComplete,
      createCandidateAdapters: vi.fn(() => ({})),
      buildCandidate,
      candidateNamespaceResolver: () => "/private/rehearsal",
      runIdFactory: () => "run-ancestor",
    });

    expect(readSelection).toHaveBeenCalledWith(
      "/private/selections/ancestor.json",
      { now: new Date("2026-08-31T03:00:00.000Z") },
    );
    expect(authorizeCandidateSource).toHaveBeenCalledWith(expect.objectContaining({
      releaseSha: "a".repeat(40),
      observedMasterSha: "b".repeat(40),
      selectionAuthority,
    }));
    expect(buildCandidate).toHaveBeenCalledWith(expect.objectContaining({
      sourceAuthorization,
    }));
    expect(revalidate).toHaveBeenCalledWith({ now: new Date("2026-08-31T03:30:00.000Z") });
    expect(beforeCandidateComplete).toHaveBeenCalledTimes(1);
  });

  it("refuses direct candidate module evaluation without immutable bootstrap verification", async () => {
    await expect(runLocalMacProductionRehearsalCli([
      "candidate", "--release-sha", "a".repeat(40), "--json",
    ], {
      buildCandidate: vi.fn(),
      createCandidateAdapters: vi.fn(),
      candidateNamespaceResolver: () => "/private/rehearsal",
    })).rejects.toThrow(/immutable|bootstrap|verified|authority/iu);
  });

  it("runs inventory through injected read-only adapters and canonical JSON output", async () => {
    const output = outputBuffer();
    const adapters = { readOnly: true };
    const createAdapters = vi.fn(() => adapters);
    const collectInventory = vi.fn(async ({ adapters: received }) => ({
      schema: "inventory-fixture",
      adapters_match: received === adapters,
    }));

    await runLocalMacProductionRehearsalCli([
      "inventory", "--production-env-authority", "/private/server/full-local-production.env", "--json",
    ], {
      output: output.stream,
      createInventoryAdapters: createAdapters,
      collectInventory,
      probeIdentity: () => ({ fixture: true }),
    });

    expect(createAdapters).toHaveBeenCalledTimes(1);
    expect(createAdapters).toHaveBeenCalledWith(expect.objectContaining({
      productionEnvAuthorityPath: "/private/server/full-local-production.env",
    }));
    expect(collectInventory).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output.value())).toEqual({
      adapters_match: true,
      schema: "inventory-fixture",
    });
  });

  it("accepts pnpm's literal option separator before command options", async () => {
    const output = outputBuffer();
    await runLocalMacProductionRehearsalCli(["inventory", "--", "--json"], {
      output: output.stream,
      createInventoryAdapters: () => ({}),
      collectInventory: async () => ({ schema: "separator-fixture" }),
      probeIdentity: () => ({}),
    });

    expect(JSON.parse(output.value())).toEqual({ schema: "separator-fixture" });
  });

  it("classifies and verifies offline artifacts without constructing inventory adapters", async () => {
    const output = outputBuffer();
    const createAdapters = vi.fn(() => { throw new Error("must not construct adapters"); });
    const readInventory = vi.fn(() => ({ inventory_digest: "a".repeat(64) }));
    const classify = vi.fn(() => ({ schema: "classification-fixture", promotion_safe: false }));
    const readReceipt = vi.fn(() => ({ schema: "run-receipt-fixture", receipt_digest: "b".repeat(64) }));

    await runLocalMacProductionRehearsalCli([
      "classify", "--inventory", "/private/tmp/inventory.json", "--json",
    ], { output: output.stream, createInventoryAdapters: createAdapters, readInventory, classify });
    await runLocalMacProductionRehearsalCli([
      "verify", "--receipt", "/private/tmp/receipt.json", "--json",
    ], { output: output.stream, createInventoryAdapters: createAdapters, readReceipt });

    expect(createAdapters).not.toHaveBeenCalled();
    expect(readInventory).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(readReceipt).toHaveBeenCalledTimes(1);
    expect(output.value()).toContain("classification-fixture");
    expect(output.value()).toContain("run-receipt-fixture");
  });

  it("issues run and repeatability receipts through offline create-only commands", async () => {
    const output = outputBuffer();
    const createAdapters = vi.fn(() => { throw new Error("must not construct adapters"); });
    const readCandidate = vi.fn(() => ({ manifest: { candidate: true } }));
    const readRunEvidence = vi.fn(() => ({ evidence: { run: true } }));
    const buildRunReceipt = vi.fn(() => ({ schema: "run-receipt", run_id: "run-1" }));
    const buildRepeatabilityReceipt = vi.fn(() => ({ schema: "repeatability-receipt", repeatability_receipt_digest: "a".repeat(64) }));
    const readReceipt = vi.fn((path: string) => ({ schema: "member-receipt", path }));
    const writeReceipt = vi.fn(({ receipt }) => `/private/receipts/${receipt.schema}.json`);

    await runLocalMacProductionRehearsalCli([
      "receipt",
      "--candidate", "/private/candidate",
      "--run-evidence", "/private/run/run-evidence.json",
      "--receipt-root", "/private/receipts",
      "--issuer-task-id", "task-author",
      "--json",
    ], {
      output: output.stream,
      createInventoryAdapters: createAdapters,
      readCandidate,
      readRunEvidence,
      buildRunReceiptFromEvidence: buildRunReceipt,
      writeReceipt,
    });
    await runLocalMacProductionRehearsalCli([
      "repeatability",
      "--member-receipt", "/private/receipts/run-1.json",
      "--member-receipt", "/private/receipts/run-2.json",
      "--receipt-root", "/private/receipts",
      "--issuer-task-id", "task-author",
      "--json",
    ], {
      output: output.stream,
      createInventoryAdapters: createAdapters,
      readReceipt,
      buildRepeatability: buildRepeatabilityReceipt,
      writeReceipt,
    });

    expect(createAdapters).not.toHaveBeenCalled();
    expect(buildRunReceipt).toHaveBeenCalledWith(expect.objectContaining({ issuerTaskId: "task-author" }));
    expect(buildRepeatabilityReceipt).toHaveBeenCalledWith(expect.objectContaining({ issuerTaskId: "task-author" }));
    expect(writeReceipt).toHaveBeenCalledTimes(2);
    expect(output.value()).toContain("run-receipt.json");
    expect(output.value()).toContain("repeatability-receipt.json");
  });

  it("fails closed on unknown commands and missing absolute artifact paths before any adapter call", async () => {
    const createAdapters = vi.fn();

    await expect(runLocalMacProductionRehearsalCli(["recover"], { createInventoryAdapters: createAdapters }))
      .rejects.toThrow(/unknown|recover/iu);
    await expect(runLocalMacProductionRehearsalCli(["candidate", "--json"], { createInventoryAdapters: createAdapters }))
      .rejects.toThrow(/release-sha|required/iu);
    await expect(runLocalMacProductionRehearsalCli(["candidate", "--release-sha", "short", "--json"], { createInventoryAdapters: createAdapters }))
      .rejects.toThrow(/40|sha/iu);
    const createCandidateAdapters = vi.fn();
    await expect(runLocalMacProductionRehearsalCli([
      "candidate", "--release-sha", "a".repeat(40), "--json",
    ], {
      immutableBuilderInputDigest: "b".repeat(64),
      immutableBuilderInputEntries: [{ blob_oid: "c".repeat(40), git_mode: "100644", path: "scripts/fixture.mjs", sha256: "d".repeat(64) }],
      immutableBootstrapVerified: true,
      immutableObservedMasterSha: "a".repeat(40),
      immutableObservedMasterTree: "f".repeat(40),
      beforeCandidateComplete: vi.fn(),
      createCandidateAdapters,
      buildCandidate: vi.fn(),
      candidateNamespaceResolver: () => "/private/rehearsal",
    })).rejects.toThrow(/production env authority|production-env-authority|required/iu);
    expect(createCandidateAdapters).not.toHaveBeenCalled();
    await expect(runLocalMacProductionRehearsalCli(["classify", "--inventory", "relative.json", "--json"], { createInventoryAdapters: createAdapters }))
      .rejects.toThrow(/absolute/iu);
    expect(createAdapters).not.toHaveBeenCalled();
  });

  it("rejects a caller-controlled root that differs from the actual repository root", async () => {
    const readReceipt = vi.fn(() => ({ schema: "must-not-read" }));

    await expect(runLocalMacProductionRehearsalCli([
      "verify",
      "--root-dir",
      join(process.cwd(), "tests"),
      "--receipt",
      "/private/tmp/receipt.json",
      "--json",
    ], { readReceipt })).rejects.toThrow(/Git root|repository root|root-dir|exact/iu);
    expect(readReceipt).not.toHaveBeenCalled();
  });

  it("registers the exact package script family without changing the production promote kill switch", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    expect(packageJson.scripts["release:rehearsal:inventory"]).toBe("node scripts/local-mac-production-rehearsal.mjs inventory");
    expect(packageJson.scripts["release:rehearsal:candidate"]).toBe("node --experimental-vm-modules scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs");
    expect(packageJson.scripts["release:rehearsal:selection"]).toBe("node scripts/local-mac-production-rehearsal.mjs selection");
    expect(packageJson.scripts["release:rehearsal:run"]).toBe("node scripts/local-mac-production-rehearsal-run.mjs");
    expect(packageJson.scripts["release:rehearsal:classify"]).toBe("node scripts/local-mac-production-rehearsal.mjs classify");
    expect(packageJson.scripts["release:rehearsal:verify"]).toBe("node scripts/local-mac-production-rehearsal.mjs verify");
    expect(packageJson.scripts["release:rehearsal:receipt"]).toBe("node scripts/local-mac-production-rehearsal.mjs receipt");
    expect(packageJson.scripts["release:rehearsal:repeatability"]).toBe("node scripts/local-mac-production-rehearsal.mjs repeatability");
    expect(packageJson.scripts["release:production:promote"]).toBe("node scripts/promote-local-mac-production-release.mjs promote");

    const productionCli = readFileSync("scripts/promote-local-mac-production-release.mjs", "utf8");
    expect(productionCli).toContain("assertPromoteActivated(argv[0])");
    expect(productionCli).toContain("assertPromoteActivated = assertProductionPromoteActivated");
    expect(productionCli).toContain("activation_blocked");

    const rehearsalRunbook = readFileSync("docs/engineering/local-mac-production-release-rehearsal.md", "utf8");
    expect(rehearsalRunbook).toContain("homecook.local-mac-production-rehearsal-selection.v1");
    expect(rehearsalRunbook).toContain("release:rehearsal:selection");
    expect(rehearsalRunbook).toContain("production authority가 아니다");
    expect(rehearsalRunbook).toContain("candidate 시작 뒤 `origin/master`가 앞으로 이동");
    expect(rehearsalRunbook).toContain("R2 isolated run, R3 create-only run receipt");
    expect(rehearsalRunbook).toContain("trusted receipt가 아닌 run evidence");

    const promotionRunbook = readFileSync("docs/engineering/local-mac-production-release-promotion.md", "utf8");
    expect(promotionRunbook).toContain("rehearsal-selection artifact는 production approval 또는 deployment authority가 아니다");
    expect(promotionRunbook).toContain("repeatability receipt");
    expect(promotionRunbook).toContain("tag");
    expect(promotionRunbook).toContain("attestation");
  });
});
