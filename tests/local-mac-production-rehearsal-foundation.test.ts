import { access } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const MODULE_PATHS = [
  "scripts/lib/rfc8785-jcs.mjs",
  "scripts/lib/local-mac-production-rehearsal-receipts.mjs",
  "scripts/lib/local-mac-production-rehearsal-inventory.mjs",
  "scripts/lib/local-mac-production-rehearsal-classifier.mjs",
  "scripts/lib/local-mac-production-rehearsal-candidate.mjs",
  "scripts/lib/local-mac-production-rehearsal-runner.mjs",
  "scripts/lib/local-mac-production-rehearsal-runner-adapters.mjs",
  "scripts/local-mac-production-rehearsal.mjs",
  "scripts/local-mac-production-rehearsal-run.mjs",
  "scripts/schemas/local-mac-production-rehearsal-candidate.schema.json",
  "scripts/schemas/local-mac-production-rehearsal-inventory.schema.json",
  "scripts/schemas/local-mac-production-rehearsal-classification.schema.json",
  "scripts/schemas/local-mac-production-rehearsal-run-evidence.schema.json",
] as const;

describe("local Mac production rehearsal foundation", () => {
  it("provides the split-one receipt, inventory, classifier, and CLI modules", async () => {
    const results = await Promise.allSettled(
      MODULE_PATHS.map((path) => access(path)),
    );

    expect(results.map((result) => result.status)).toEqual(
      MODULE_PATHS.map(() => "fulfilled"),
    );
  });

  it("exports the strict JCS, receipt, inventory, classifier, and CLI APIs", async () => {
    const [jcs, receipts, inventory, classifier, candidate, runner, runnerAdapters, cli, runnerCli] = await Promise.all([
      import("../scripts/lib/rfc8785-jcs.mjs"),
      import("../scripts/lib/local-mac-production-rehearsal-receipts.mjs"),
      import("../scripts/lib/local-mac-production-rehearsal-inventory.mjs"),
      import("../scripts/lib/local-mac-production-rehearsal-classifier.mjs"),
      import("../scripts/lib/local-mac-production-rehearsal-candidate.mjs"),
      import("../scripts/lib/local-mac-production-rehearsal-runner.mjs"),
      import("../scripts/lib/local-mac-production-rehearsal-runner-adapters.mjs"),
      import("../scripts/local-mac-production-rehearsal.mjs"),
      import("../scripts/local-mac-production-rehearsal-run.mjs"),
    ]);

    expect(jcs).toMatchObject({
      canonicalizeJcs: expect.any(Function),
      parseCanonicalJcs: expect.any(Function),
      sha256Jcs: expect.any(Function),
    });
    expect(receipts).toMatchObject({
      buildRunReceipt: expect.any(Function),
      buildRepeatabilityReceipt: expect.any(Function),
      parseAndValidateRunReceipt: expect.any(Function),
      parseAndValidateRepeatabilityReceipt: expect.any(Function),
      readCanonicalReceiptFile: expect.any(Function),
    });
    expect(inventory).toMatchObject({
      collectReadOnlyProductionInventory: expect.any(Function),
      createLocalProductionInventoryAdapters: expect.any(Function),
      createProductionSurfaceSnapshot: expect.any(Function),
      readCanonicalInventoryFile: expect.any(Function),
    });
    expect(classifier).toMatchObject({
      classifyProductionInventory: expect.any(Function),
      parseAndClassifyProductionInventory: expect.any(Function),
    });
    expect(candidate).toMatchObject({
      buildReleaseRehearsalCandidate: expect.any(Function),
      createReleaseRehearsalCandidateAdapters: expect.any(Function),
      parseAndValidateCandidateManifest: expect.any(Function),
      readBuildEnvironmentSnapshot: expect.any(Function),
    });
    expect(runner).toMatchObject({
      runIsolatedReleaseRehearsal: expect.any(Function),
      validateRunEvidence: expect.any(Function),
      cleanupOwnedResources: expect.any(Function),
    });
    expect(runnerAdapters).toMatchObject({
      createLocalReleaseRehearsalRunnerAdapters: expect.any(Function),
    });
    expect(cli).toMatchObject({
      runLocalMacProductionRehearsalCli: expect.any(Function),
    });
    expect(runnerCli).toMatchObject({
      runLocalMacProductionRehearsalRunnerCli: expect.any(Function),
    });
  });
});
