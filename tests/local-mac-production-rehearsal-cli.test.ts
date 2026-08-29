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
    expect(result.stdout).toContain("verify");
    expect(result.stdout).toContain("PRODUCTION MUTATION: 0");
    expect(result.stdout).toContain("Docker rehearsal runner");
    expect(result.stdout).toContain("recovery execution");
    expect(result.stdout).not.toContain(" promote ");
  });

  it("builds an exact-SHA candidate through injected trusted adapters", async () => {
    const output = outputBuffer();
    const adapters = { trusted: true };
    const createCandidateAdapters = vi.fn(() => adapters);
    const buildCandidate = vi.fn(async (options) => ({
      candidate_root: "/private/candidate/run-a",
      manifest: {
        schema: "candidate-fixture",
        release_sha: options.releaseSha,
      },
    }));

    await runLocalMacProductionRehearsalCli([
      "candidate", "--release-sha", "a".repeat(40), "--json",
    ], {
      immutableBuilderInputDigest: "b".repeat(64),
      immutableBuilderInputEntries: [{ blob_oid: "c".repeat(40), git_mode: "100644", path: "scripts/fixture.mjs", sha256: "d".repeat(64) }],
      immutableBootstrapVerified: true,
      output: output.stream,
      createCandidateAdapters,
      buildCandidate,
      candidateNamespaceResolver: () => "/private/rehearsal",
      runIdFactory: () => "run-a",
    });

    expect(createCandidateAdapters).toHaveBeenCalledWith(expect.objectContaining({
      builderInputDigest: "b".repeat(64),
      builderInputEntries: expect.any(Array),
      rootDir: process.cwd(),
    }));
    expect(buildCandidate).toHaveBeenCalledWith(expect.objectContaining({
      releaseSha: "a".repeat(40),
      namespaceRoot: "/private/rehearsal",
      adapters,
      runId: "run-a",
    }));
    expect(JSON.parse(output.value())).toMatchObject({
      candidate_root: "/private/candidate/run-a",
      manifest: { release_sha: "a".repeat(40) },
    });
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

    await runLocalMacProductionRehearsalCli(["inventory", "--json"], {
      output: output.stream,
      createInventoryAdapters: createAdapters,
      collectInventory,
      probeIdentity: () => ({ fixture: true }),
    });

    expect(createAdapters).toHaveBeenCalledTimes(1);
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

  it("fails closed on unknown commands and missing absolute artifact paths before any adapter call", async () => {
    const createAdapters = vi.fn();

    await expect(runLocalMacProductionRehearsalCli(["recover"], { createInventoryAdapters: createAdapters }))
      .rejects.toThrow(/unknown|recover/iu);
    await expect(runLocalMacProductionRehearsalCli(["candidate", "--json"], { createInventoryAdapters: createAdapters }))
      .rejects.toThrow(/release-sha|required/iu);
    await expect(runLocalMacProductionRehearsalCli(["candidate", "--release-sha", "short", "--json"], { createInventoryAdapters: createAdapters }))
      .rejects.toThrow(/40|sha/iu);
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
    expect(packageJson.scripts["release:rehearsal:candidate"]).toBe("node scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs");
    expect(packageJson.scripts["release:rehearsal:classify"]).toBe("node scripts/local-mac-production-rehearsal.mjs classify");
    expect(packageJson.scripts["release:rehearsal:verify"]).toBe("node scripts/local-mac-production-rehearsal.mjs verify");
    expect(packageJson.scripts["release:production:promote"]).toBe("node scripts/promote-local-mac-production-release.mjs promote");

    const productionCli = readFileSync("scripts/promote-local-mac-production-release.mjs", "utf8");
    expect(productionCli).toContain("assertProductionPromoteActivated(argv[0])");
    expect(productionCli).toContain("activation_blocked");

    const rehearsalRunbook = readFileSync("docs/engineering/local-mac-production-release-rehearsal.md", "utf8");
    expect(rehearsalRunbook).toContain("상태: **canonical / implementation split 2 in review**");
    expect(rehearsalRunbook).toContain("R0 inventory, mixed-state classify, receipt schema/JCS/offline verify와 R1 candidate build/seal");
    expect(rehearsalRunbook).toContain("isolated run은 아직 구현되지 않았다");
  });
});
