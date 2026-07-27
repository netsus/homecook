import { beforeEach, describe, expect, it, vi } from "vitest";

import { runAccountMaintenanceTick } from
  "@/lib/account-maintenance/tick";

const listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates = vi.fn();
const runRecipeImageAuthDeletionCandidateDrain = vi.fn();
const runRecipeImageLifecycleCompletionDrain = vi.fn();

vi.mock("@/lib/server/recipe-image-auth-deletion-eligibility", () => ({
  listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates,
}));
vi.mock("@/lib/server/recipe-image-auth-deletion-drain", () => ({
  runRecipeImageAuthDeletionCandidateDrain,
}));
vi.mock("@/lib/server/recipe-image-lifecycle-completion-drain", () => ({
  runRecipeImageLifecycleCompletionDrain,
}));

const NOW = new Date("2030-07-27T02:00:00.000Z");
const OWNER_UUID = "00000000-0000-4000-8000-000000000a01";
const OUTBOX_ID = "00000000-0000-4000-8000-000000000a11";
const LEASE_TOKEN = "00000000-0000-4000-8000-000000000a21";
const eligibleCandidate = {
  accountGeneration: 3,
  authIdentityCreatedAt: "2029-01-02T00:00:00.000001Z",
  nextAttemptAt: "2030-07-27T01:59:00.000002Z",
  outboxId: OUTBOX_ID,
  ownerUuid: OWNER_UUID,
};

describe("recipe image post-Storage maintenance phase bundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("partitions owner signals before Auth deletion and then completes lifecycle", async () => {
    const { createRecipeImagePostStorageMaintenancePhases } = await import(
      "@/lib/account-maintenance/recipe-image-post-storage-phases"
    );
    const dbClient = { rpc: vi.fn() };
    const providerBarrier = { deleteIfIdentityUnchanged: vi.fn() };
    const now = () => NOW;
    const createLeaseToken = vi.fn(() => LEASE_TOKEN);
    const calls: string[] = [];
    listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates
      .mockImplementation(async () => {
        calls.push("expected_owner_signal_union_zero");
        return {
          blockedCount: 1,
          candidateCount: 2,
          eligibleCandidates: [eligibleCandidate],
        };
      });
    runRecipeImageAuthDeletionCandidateDrain.mockImplementation(async () => {
      calls.push("auth_delete");
      return {
        alreadyAbsentCount: 0,
        candidateCount: 1,
        claimedCount: 1,
        deletedCount: 1,
        identityReplacedCount: 0,
      };
    });
    runRecipeImageLifecycleCompletionDrain.mockImplementation(async () => {
      calls.push("complete");
      return {
        candidateCount: 1,
        changedCount: 1,
        idempotentCount: 0,
      };
    });

    const phases = createRecipeImagePostStorageMaintenancePhases({
      createLeaseToken,
      dbClient,
      now,
      providerBarrier,
    });

    expect(Object.keys(phases)).toEqual([
      "expectedOwnerSignalUnionZero",
      "authDelete",
      "complete",
    ]);
    expect(createLeaseToken).not.toHaveBeenCalled();

    await expect(runAccountMaintenanceTick({
      authDelete: phases.authDelete,
      complete: phases.complete,
      expectedOwnerSignalUnionZero:
        phases.expectedOwnerSignalUnionZero,
      jointActivationReady: true,
      normalDrain: async () => undefined,
      quarantineRecheck: async () => undefined,
      scanner: async () => undefined,
      terminalTombstoneScan: async () => undefined,
    })).resolves.toMatchObject({
      featureState: "joint_activation_ready",
      status: "completed",
      blockedAt: null,
    });

    expect(calls).toEqual([
      "expected_owner_signal_union_zero",
      "auth_delete",
      "complete",
    ]);
    expect(
      listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates,
    ).toHaveBeenCalledWith({ dbClient, now });
    expect(runRecipeImageAuthDeletionCandidateDrain).toHaveBeenCalledWith({
      candidates: [eligibleCandidate],
      createLeaseToken,
      dbClient,
      now,
      providerBarrier,
    });
    expect(runRecipeImageLifecycleCompletionDrain).toHaveBeenCalledWith({
      dbClient,
      now,
    });
  });

  it("does not create Auth leases when every account is owner-signal blocked", async () => {
    const { createRecipeImagePostStorageMaintenancePhases } = await import(
      "@/lib/account-maintenance/recipe-image-post-storage-phases"
    );
    const createLeaseToken = vi.fn(() => LEASE_TOKEN);
    listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates
      .mockResolvedValue({
        blockedCount: 2,
        candidateCount: 2,
        eligibleCandidates: [],
      });

    const phases = createRecipeImagePostStorageMaintenancePhases({
      createLeaseToken,
      dbClient: { rpc: vi.fn() },
      now: () => NOW,
      providerBarrier: { deleteIfIdentityUnchanged: vi.fn() },
    });

    await expect(phases.expectedOwnerSignalUnionZero()).resolves.toBeUndefined();
    await expect(phases.authDelete()).resolves.toBeUndefined();
    expect(runRecipeImageAuthDeletionCandidateDrain).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: [] }),
    );
    expect(createLeaseToken).not.toHaveBeenCalled();
  });

  it("fails closed if Auth deletion runs without the current pass partition", async () => {
    const { createRecipeImagePostStorageMaintenancePhases } = await import(
      "@/lib/account-maintenance/recipe-image-post-storage-phases"
    );
    const phases = createRecipeImagePostStorageMaintenancePhases({
      dbClient: { rpc: vi.fn() },
      providerBarrier: { deleteIfIdentityUnchanged: vi.fn() },
    });

    await expect(phases.authDelete()).rejects.toThrow(
      "recipe image post-Storage maintenance phase failed",
    );
    expect(runRecipeImageAuthDeletionCandidateDrain).not.toHaveBeenCalled();
  });

  it("rejects a contradictory eligibility partition before Auth deletion", async () => {
    const { createRecipeImagePostStorageMaintenancePhases } = await import(
      "@/lib/account-maintenance/recipe-image-post-storage-phases"
    );
    listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates
      .mockResolvedValue({
        blockedCount: 1,
        candidateCount: 1,
        eligibleCandidates: [eligibleCandidate],
      });
    const phases = createRecipeImagePostStorageMaintenancePhases({
      dbClient: { rpc: vi.fn() },
      providerBarrier: { deleteIfIdentityUnchanged: vi.fn() },
    });

    await expect(phases.expectedOwnerSignalUnionZero()).rejects.toThrow(
      "recipe image post-Storage maintenance phase failed",
    );
    await expect(phases.authDelete()).rejects.toThrow(
      "recipe image post-Storage maintenance phase failed",
    );
    expect(runRecipeImageAuthDeletionCandidateDrain).not.toHaveBeenCalled();
  });

  it("discards a consumed partition so one pass cannot replay it", async () => {
    const { createRecipeImagePostStorageMaintenancePhases } = await import(
      "@/lib/account-maintenance/recipe-image-post-storage-phases"
    );
    listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates
      .mockResolvedValue({
        blockedCount: 0,
        candidateCount: 1,
        eligibleCandidates: [eligibleCandidate],
      });
    runRecipeImageAuthDeletionCandidateDrain.mockResolvedValue({
      alreadyAbsentCount: 0,
      candidateCount: 1,
      claimedCount: 1,
      deletedCount: 1,
      identityReplacedCount: 0,
    });
    const phases = createRecipeImagePostStorageMaintenancePhases({
      dbClient: { rpc: vi.fn() },
      providerBarrier: { deleteIfIdentityUnchanged: vi.fn() },
    });

    await phases.expectedOwnerSignalUnionZero();
    await phases.authDelete();
    await expect(phases.authDelete()).rejects.toThrow(
      "recipe image post-Storage maintenance phase failed",
    );
    expect(runRecipeImageAuthDeletionCandidateDrain).toHaveBeenCalledOnce();
  });

  it("redacts eligibility, Auth and completion failures", async () => {
    const { createRecipeImagePostStorageMaintenancePhases } = await import(
      "@/lib/account-maintenance/recipe-image-post-storage-phases"
    );
    const phases = createRecipeImagePostStorageMaintenancePhases({
      dbClient: { rpc: vi.fn() },
      providerBarrier: { deleteIfIdentityUnchanged: vi.fn() },
    });
    listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates
      .mockRejectedValueOnce(new Error("sensitive-eligibility-detail"));

    await expect(phases.expectedOwnerSignalUnionZero()).rejects.toThrow(
      "recipe image post-Storage maintenance phase failed",
    );

    listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates
      .mockResolvedValueOnce({
        blockedCount: 0,
        candidateCount: 1,
        eligibleCandidates: [eligibleCandidate],
      });
    runRecipeImageAuthDeletionCandidateDrain.mockRejectedValueOnce(
      new Error("sensitive-auth-detail"),
    );
    await phases.expectedOwnerSignalUnionZero();
    await expect(phases.authDelete()).rejects.toThrow(
      "recipe image post-Storage maintenance phase failed",
    );

    runRecipeImageLifecycleCompletionDrain.mockRejectedValueOnce(
      new Error("sensitive-completion-detail"),
    );
    await expect(phases.complete()).rejects.toThrow(
      "recipe image post-Storage maintenance phase failed",
    );
  });
});
