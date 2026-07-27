import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("recipe image Auth deletion expected-owner eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a later zero-union account eligible when an older account is blocked", async () => {
    const {
      listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates,
    } = await import(
      "@/lib/server/recipe-image-auth-deletion-eligibility"
    );
    const dbClient = { rpc: vi.fn() };
    const now = () => NOW;
    listRecipeImageAuthDeletionCandidates.mockResolvedValue(candidates);
    inspectRecipeImageExpectedOwnerSignal
      .mockResolvedValueOnce({ available: true, unionZero: false })
      .mockResolvedValueOnce({ available: true, unionZero: true });

    await expect(
      listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates({
        dbClient,
        now,
      }),
    ).resolves.toEqual({
      blockedCount: 1,
      candidateCount: 2,
      eligibleCandidates: [candidates[1]],
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

  it("returns every zero-union candidate and accepts an empty due page", async () => {
    const {
      listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates,
    } = await import(
      "@/lib/server/recipe-image-auth-deletion-eligibility"
    );
    const input = {
      dbClient: { rpc: vi.fn() },
      now: () => NOW,
    };
    listRecipeImageAuthDeletionCandidates.mockResolvedValueOnce(candidates);
    inspectRecipeImageExpectedOwnerSignal
      .mockResolvedValueOnce({ available: true, unionZero: true })
      .mockResolvedValueOnce({ available: true, unionZero: true });

    await expect(
      listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates(input),
    ).resolves.toEqual({
      blockedCount: 0,
      candidateCount: 2,
      eligibleCandidates: candidates,
    });

    listRecipeImageAuthDeletionCandidates.mockResolvedValueOnce([]);
    await expect(
      listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates(input),
    ).resolves.toEqual({
      blockedCount: 0,
      candidateCount: 0,
      eligibleCandidates: [],
    });
  });

  it("fails closed without exposing candidate or signal adapter details", async () => {
    const {
      listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates,
    } = await import(
      "@/lib/server/recipe-image-auth-deletion-eligibility"
    );
    const input = {
      dbClient: { rpc: vi.fn() },
      now: () => NOW,
    };

    listRecipeImageAuthDeletionCandidates.mockRejectedValueOnce(
      new Error("sensitive-candidate-detail"),
    );
    await expect(
      listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates(input),
    ).rejects.toThrow("recipe image Auth deletion eligibility failed");

    listRecipeImageAuthDeletionCandidates.mockResolvedValueOnce(candidates);
    inspectRecipeImageExpectedOwnerSignal.mockRejectedValueOnce(
      new Error("sensitive-signal-detail"),
    );
    await expect(
      listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates(input),
    ).rejects.toThrow("recipe image Auth deletion eligibility failed");

    listRecipeImageAuthDeletionCandidates.mockResolvedValueOnce(candidates);
    inspectRecipeImageExpectedOwnerSignal.mockResolvedValueOnce({
      available: false,
      unionZero: false,
    });
    await expect(
      listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates(input),
    ).rejects.toThrow("recipe image Auth deletion eligibility failed");
  });
});
