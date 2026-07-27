import { beforeEach, describe, expect, it, vi } from "vitest";

const listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates = vi.fn();
const claimRecipeImageAuthDeletionIfReady = vi.fn();
const executeRecipeImageAuthConditionalDeletion = vi.fn();
const finalizeRecipeImageAuthDeletionClaim = vi.fn();

vi.mock("@/lib/server/recipe-image-auth-deletion-eligibility", () => ({
  listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates,
}));
vi.mock("@/lib/server/recipe-image-auth-deletion-claim", () => ({
  claimRecipeImageAuthDeletionIfReady,
}));
vi.mock("@/lib/server/recipe-image-auth-conditional-delete", () => ({
  executeRecipeImageAuthConditionalDeletion,
}));
vi.mock("@/lib/server/recipe-image-auth-deletion-finalize", () => ({
  finalizeRecipeImageAuthDeletionClaim,
}));

const NOW = new Date("2030-07-27T00:00:00.000Z");
const OWNER_UUID = "00000000-0000-4000-8000-000000000502";
const OUTBOX_ID = "00000000-0000-4000-8000-000000000512";
const LEASE_TOKEN = "00000000-0000-4000-8000-000000000522";
const AUTH_EPOCH = "2029-01-02T00:00:00.000001Z";
const eligibleCandidate = {
  accountGeneration: 3,
  authIdentityCreatedAt: AUTH_EPOCH,
  nextAttemptAt: "2030-07-26T23:59:00.000002Z",
  outboxId: OUTBOX_ID,
  ownerUuid: OWNER_UUID,
};

describe("expected-owner eligible Auth deletion drain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes only zero-union candidates while preserving blocked progress", async () => {
    const {
      runRecipeImageExpectedOwnerEligibleAuthDeletionDrain,
    } = await import("@/lib/server/recipe-image-auth-deletion-drain");
    const dbClient = { rpc: vi.fn() };
    const providerBarrier = { deleteIfIdentityUnchanged: vi.fn() };
    const now = () => NOW;
    const createLeaseToken = vi.fn(() => LEASE_TOKEN);
    listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates
      .mockResolvedValue({
        blockedCount: 1,
        candidateCount: 2,
        eligibleCandidates: [eligibleCandidate],
      });
    claimRecipeImageAuthDeletionIfReady.mockResolvedValue({
      accountGeneration: 3,
      attempts: 1,
      authIdentityCreatedAt: AUTH_EPOCH,
      leaseExpiresAt: "2030-07-27T00:02:00.000000Z",
      leaseToken: LEASE_TOKEN,
      outboxId: OUTBOX_ID,
      ownerUuid: OWNER_UUID,
    });
    executeRecipeImageAuthConditionalDeletion.mockResolvedValue({
      status: "deleted",
    });
    finalizeRecipeImageAuthDeletionClaim.mockResolvedValue({
      status: "succeeded",
      terminalResult: "deleted",
    });

    await expect(
      runRecipeImageExpectedOwnerEligibleAuthDeletionDrain({
        createLeaseToken,
        dbClient,
        now,
        providerBarrier,
      }),
    ).resolves.toEqual({
      alreadyAbsentCount: 0,
      blockedCount: 1,
      candidateCount: 2,
      claimedCount: 1,
      deletedCount: 1,
      identityReplacedCount: 0,
    });
    expect(
      listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates,
    ).toHaveBeenCalledWith({ dbClient, now });
    expect(claimRecipeImageAuthDeletionIfReady).toHaveBeenCalledOnce();
    expect(claimRecipeImageAuthDeletionIfReady).toHaveBeenCalledWith({
      accountGeneration: 3,
      dbClient,
      leaseToken: LEASE_TOKEN,
      now,
      outboxId: OUTBOX_ID,
      ownerUuid: OWNER_UUID,
    });
    expect(executeRecipeImageAuthConditionalDeletion).toHaveBeenCalledOnce();
    expect(finalizeRecipeImageAuthDeletionClaim).toHaveBeenCalledOnce();
  });

  it("does not create leases or call the provider when every candidate is blocked", async () => {
    const {
      runRecipeImageExpectedOwnerEligibleAuthDeletionDrain,
    } = await import("@/lib/server/recipe-image-auth-deletion-drain");
    const createLeaseToken = vi.fn(() => LEASE_TOKEN);
    listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates
      .mockResolvedValue({
        blockedCount: 2,
        candidateCount: 2,
        eligibleCandidates: [],
      });

    await expect(
      runRecipeImageExpectedOwnerEligibleAuthDeletionDrain({
        createLeaseToken,
        dbClient: { rpc: vi.fn() },
        now: () => NOW,
        providerBarrier: { deleteIfIdentityUnchanged: vi.fn() },
      }),
    ).resolves.toMatchObject({
      blockedCount: 2,
      candidateCount: 2,
      claimedCount: 0,
      deletedCount: 0,
    });
    expect(createLeaseToken).not.toHaveBeenCalled();
    expect(claimRecipeImageAuthDeletionIfReady).not.toHaveBeenCalled();
    expect(executeRecipeImageAuthConditionalDeletion).not.toHaveBeenCalled();
    expect(finalizeRecipeImageAuthDeletionClaim).not.toHaveBeenCalled();
  });

  it("fails closed when eligibility cannot be established", async () => {
    const {
      runRecipeImageExpectedOwnerEligibleAuthDeletionDrain,
    } = await import("@/lib/server/recipe-image-auth-deletion-drain");
    listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates
      .mockRejectedValue(new Error("sensitive-eligibility-detail"));

    await expect(
      runRecipeImageExpectedOwnerEligibleAuthDeletionDrain({
        dbClient: { rpc: vi.fn() },
        providerBarrier: { deleteIfIdentityUnchanged: vi.fn() },
      }),
    ).rejects.toThrow("recipe image Auth deletion drain failed");
    expect(claimRecipeImageAuthDeletionIfReady).not.toHaveBeenCalled();
  });
});
