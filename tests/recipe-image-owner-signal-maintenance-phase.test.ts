import { beforeEach, describe, expect, it, vi } from "vitest";

import { runAccountMaintenanceTick } from "@/lib/account-maintenance/tick";

const listRecipeImageAuthDeletionCandidates = vi.fn();
const inspectRecipeImageExpectedOwnerSignal = vi.fn();

vi.mock("@/lib/server/recipe-image-auth-deletion-candidates", () => ({
  listRecipeImageAuthDeletionCandidates,
}));
vi.mock("@/lib/server/recipe-image-expected-owner-signal", () => ({
  inspectRecipeImageExpectedOwnerSignal,
}));

const NOW = new Date("2030-07-27T00:00:00.000Z");
const FIRST_OWNER = "00000000-0000-4000-8000-000000000401";
const SECOND_OWNER = "00000000-0000-4000-8000-000000000402";

const candidates = [
  {
    accountGeneration: 2,
    authIdentityCreatedAt: "2029-01-01T00:00:00.000001Z",
    nextAttemptAt: "2030-07-26T23:59:00.000001Z",
    outboxId: "00000000-0000-4000-8000-000000000411",
    ownerUuid: FIRST_OWNER,
  },
  {
    accountGeneration: 3,
    authIdentityCreatedAt: "2029-01-02T00:00:00.000001Z",
    nextAttemptAt: "2030-07-26T23:59:00.000002Z",
    outboxId: "00000000-0000-4000-8000-000000000412",
    ownerUuid: SECOND_OWNER,
  },
];

describe("recipe image expected-owner maintenance phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks one bounded due candidate page and unlocks only an all-zero union", async () => {
    const {
      createRecipeImageExpectedOwnerSignalMaintenancePhase,
    } = await import(
      "@/lib/account-maintenance/recipe-image-expected-owner-signal-phase"
    );
    const dbClient = { rpc: vi.fn() };
    const now = () => NOW;
    listRecipeImageAuthDeletionCandidates.mockResolvedValue(candidates);
    inspectRecipeImageExpectedOwnerSignal
      .mockResolvedValueOnce({ available: true, unionZero: true })
      .mockResolvedValueOnce({ available: true, unionZero: true });

    const phase = createRecipeImageExpectedOwnerSignalMaintenancePhase({
      dbClient,
      now,
    });

    expect(Object.keys(phase)).toEqual([
      "expectedOwnerSignalUnionZero",
    ]);
    await expect(
      phase.expectedOwnerSignalUnionZero(),
    ).resolves.toEqual({
      available: true,
      unionZero: true,
    });
    expect(listRecipeImageAuthDeletionCandidates).toHaveBeenCalledWith({
      dbClient,
      limit: 50,
      now,
    });
    expect(inspectRecipeImageExpectedOwnerSignal.mock.calls).toEqual([
      [{
        accountGeneration: 2,
        dbClient,
        ownerUuid: FIRST_OWNER,
      }],
      [{
        accountGeneration: 3,
        dbClient,
        ownerUuid: SECOND_OWNER,
      }],
    ]);
  });

  it("reports a nonzero page after inspecting every bounded candidate", async () => {
    const {
      createRecipeImageExpectedOwnerSignalMaintenancePhase,
    } = await import(
      "@/lib/account-maintenance/recipe-image-expected-owner-signal-phase"
    );
    listRecipeImageAuthDeletionCandidates.mockResolvedValue(candidates);
    inspectRecipeImageExpectedOwnerSignal
      .mockResolvedValueOnce({
        available: true,
        unionZero: false,
      })
      .mockResolvedValueOnce({
        available: true,
        unionZero: true,
      });
    const phase = createRecipeImageExpectedOwnerSignalMaintenancePhase({
      dbClient: { rpc: vi.fn() },
      now: () => NOW,
    });

    await expect(
      phase.expectedOwnerSignalUnionZero(),
    ).resolves.toEqual({
      available: true,
      unionZero: false,
    });
    expect(inspectRecipeImageExpectedOwnerSignal).toHaveBeenCalledTimes(2);
  });

  it("advances the ordered tick only to the feature-off Auth boundary", async () => {
    const {
      createRecipeImageExpectedOwnerSignalMaintenancePhase,
    } = await import(
      "@/lib/account-maintenance/recipe-image-expected-owner-signal-phase"
    );
    const calls: string[] = [];
    listRecipeImageAuthDeletionCandidates.mockResolvedValue([candidates[0]]);
    inspectRecipeImageExpectedOwnerSignal.mockImplementation(async () => {
      calls.push("expected_owner_signal_union_zero");
      return { available: true, unionZero: true };
    });
    const ownerSignalPhase
      = createRecipeImageExpectedOwnerSignalMaintenancePhase({
        dbClient: { rpc: vi.fn() },
        now: () => NOW,
      });

    await expect(runAccountMaintenanceTick({
      normalDrain: async () => {
        calls.push("normal_drain");
      },
      quarantineRecheck: async () => {
        calls.push("quarantine_recheck");
      },
      scanner: async () => {
        calls.push("scanner");
      },
      terminalTombstoneScan: async () => {
        calls.push("terminal_tombstone_scan");
      },
      ...ownerSignalPhase,
    })).resolves.toMatchObject({
      blockedAt: "auth_delete",
      featureState: "feature_off",
      phases: [
        { phase: "scanner", status: "completed" },
        { phase: "terminal_tombstone_scan", status: "completed" },
        { phase: "quarantine_recheck", status: "completed" },
        { phase: "normal_drain", status: "completed" },
        {
          phase: "expected_owner_signal_union_zero",
          status: "completed",
        },
        { phase: "auth_delete", status: "feature_off" },
        { phase: "complete", status: "blocked" },
      ],
      status: "blocked",
    });
    expect(calls).toEqual([
      "scanner",
      "terminal_tombstone_scan",
      "quarantine_recheck",
      "normal_drain",
      "expected_owner_signal_union_zero",
    ]);
  });

  it("fails closed without exposing candidate or signal adapter details", async () => {
    const {
      createRecipeImageExpectedOwnerSignalMaintenancePhase,
    } = await import(
      "@/lib/account-maintenance/recipe-image-expected-owner-signal-phase"
    );
    const dbClient = { rpc: vi.fn() };
    const phase = createRecipeImageExpectedOwnerSignalMaintenancePhase({
      dbClient,
      now: () => NOW,
    });

    listRecipeImageAuthDeletionCandidates.mockRejectedValueOnce(
      new Error("sensitive-candidate-detail"),
    );
    await expect(
      phase.expectedOwnerSignalUnionZero(),
    ).rejects.toThrow("recipe image expected-owner signal phase failed");

    listRecipeImageAuthDeletionCandidates.mockResolvedValueOnce(candidates);
    inspectRecipeImageExpectedOwnerSignal.mockRejectedValueOnce(
      new Error("sensitive-signal-detail"),
    );
    await expect(
      phase.expectedOwnerSignalUnionZero(),
    ).rejects.toThrow("recipe image expected-owner signal phase failed");
  });
});
