import { beforeEach, describe, expect, it, vi } from "vitest";

import { runAccountMaintenanceTick } from "@/lib/account-maintenance/tick";

const scanStaleRecipeImageUploads = vi.fn();
const runRecipeImageTerminalTombstoneStorageScan = vi.fn();
const runRecipeImageQuarantineRecheckStorageScan = vi.fn();
const runRecipeImageNormalDrainStorage = vi.fn();

vi.mock("@/lib/server/recipe-image-stale-scanner", () => ({
  scanStaleRecipeImageUploads,
}));
vi.mock("@/lib/server/recipe-image-terminal-tombstone-storage", () => ({
  runRecipeImageTerminalTombstoneStorageScan,
}));
vi.mock("@/lib/server/recipe-image-quarantine-recheck-storage", () => ({
  runRecipeImageQuarantineRecheckStorageScan,
}));
vi.mock("@/lib/server/recipe-image-normal-drain-storage", () => ({
  runRecipeImageNormalDrainStorage,
}));

const NOW = new Date("2030-07-27T00:00:00.000Z");
const LEASE_TOKEN = "11111111-1111-4111-8111-111111111111";

describe("recipe image Storage maintenance phase bundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes only the four ordered Storage callbacks without activating later phases", async () => {
    const { createRecipeImageStorageMaintenancePhases } = await import(
      "@/lib/account-maintenance/recipe-image-storage-phases"
    );
    const dbClient = { rpc: vi.fn() };
    const storage = {
      checkObjectPresence: vi.fn(),
      deleteObject: vi.fn(),
    };
    const now = () => NOW;
    const createLeaseToken = vi.fn(() => LEASE_TOKEN);
    const calls: string[] = [];
    scanStaleRecipeImageUploads.mockImplementation(async () => {
      calls.push("scanner");
    });
    runRecipeImageTerminalTombstoneStorageScan.mockImplementation(async () => {
      calls.push("terminal_tombstone_scan");
    });
    runRecipeImageQuarantineRecheckStorageScan.mockImplementation(async () => {
      calls.push("quarantine_recheck");
    });
    runRecipeImageNormalDrainStorage.mockImplementation(async () => {
      calls.push("normal_drain");
    });

    const phases = createRecipeImageStorageMaintenancePhases({
      createLeaseToken,
      dbClient,
      now,
      storage,
    });

    expect(Object.keys(phases)).toEqual([
      "scanner",
      "terminalTombstoneScan",
      "quarantineRecheck",
      "normalDrain",
    ]);
    expect(scanStaleRecipeImageUploads).not.toHaveBeenCalled();
    expect(createLeaseToken).not.toHaveBeenCalled();

    await expect(runAccountMaintenanceTick(phases)).resolves.toMatchObject({
      featureState: "feature_off",
      status: "blocked",
      blockedAt: "expected_owner_signal_union_zero",
    });
    expect(calls).toEqual([
      "scanner",
      "terminal_tombstone_scan",
      "quarantine_recheck",
      "normal_drain",
    ]);

    expect(scanStaleRecipeImageUploads).toHaveBeenCalledWith({
      dbClient,
      limit: 50,
      now,
    });
    expect(runRecipeImageTerminalTombstoneStorageScan).toHaveBeenCalledWith({
      checkObjectPresence: storage.checkObjectPresence,
      dbClient,
      now,
    });
    expect(runRecipeImageQuarantineRecheckStorageScan).toHaveBeenCalledWith({
      checkObjectPresence: storage.checkObjectPresence,
      dbClient,
      now,
    });
    expect(runRecipeImageNormalDrainStorage).toHaveBeenCalledWith({
      checkObjectPresence: storage.checkObjectPresence,
      dbClient,
      deleteObject: storage.deleteObject,
      leaseToken: LEASE_TOKEN,
      now,
    });
    expect(createLeaseToken).toHaveBeenCalledOnce();
  });

  it("lets an earlier phase failure reject without constructing a normal-drain lease", async () => {
    scanStaleRecipeImageUploads.mockRejectedValueOnce(
      new Error("scanner failed"),
    );
    const { createRecipeImageStorageMaintenancePhases } = await import(
      "@/lib/account-maintenance/recipe-image-storage-phases"
    );
    const createLeaseToken = vi.fn(() => LEASE_TOKEN);
    const phases = createRecipeImageStorageMaintenancePhases({
      createLeaseToken,
      dbClient: { rpc: vi.fn() },
      now: () => NOW,
      storage: {
        checkObjectPresence: vi.fn(),
        deleteObject: vi.fn(),
      },
    });

    await expect(phases.scanner()).rejects.toThrow("scanner failed");
    expect(createLeaseToken).not.toHaveBeenCalled();
    expect(runRecipeImageNormalDrainStorage).not.toHaveBeenCalled();
  });
});
