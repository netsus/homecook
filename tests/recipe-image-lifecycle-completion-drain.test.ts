import { beforeEach, describe, expect, it, vi } from "vitest";

const listRecipeImageLifecycleCompletionCandidates = vi.fn();
const completeRecipeImageAccountLifecycle = vi.fn();

vi.mock("@/lib/server/recipe-image-lifecycle-completion-candidates", () => ({
  listRecipeImageLifecycleCompletionCandidates,
}));
vi.mock("@/lib/server/recipe-image-lifecycle-completion", () => ({
  completeRecipeImageAccountLifecycle,
}));

const NOW = new Date("2030-07-27T01:00:00.000Z");
const FIRST_OWNER_UUID = "00000000-0000-4000-8000-000000000901";
const SECOND_OWNER_UUID = "00000000-0000-4000-8000-000000000902";
const candidates = [
  {
    accountGeneration: 3,
    authIdentityDeletedAt: "2030-07-27T00:30:00.000001Z",
    ownerUuid: FIRST_OWNER_UUID,
  },
  {
    accountGeneration: 4,
    authIdentityDeletedAt: "2030-07-27T00:45:00.000002Z",
    ownerUuid: SECOND_OWNER_UUID,
  },
];

describe("managed recipe image lifecycle completion drain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts from a null cursor and completes one bounded ready-only page", async () => {
    const { runRecipeImageLifecycleCompletionDrain } = await import(
      "@/lib/server/recipe-image-lifecycle-completion-drain"
    );
    const dbClient = { rpc: vi.fn() };
    const now = () => NOW;
    listRecipeImageLifecycleCompletionCandidates.mockResolvedValue(candidates);
    completeRecipeImageAccountLifecycle
      .mockResolvedValueOnce({ changed: true })
      .mockResolvedValueOnce({ changed: false });

    await expect(runRecipeImageLifecycleCompletionDrain({
      dbClient,
      now,
    })).resolves.toEqual({
      candidateCount: 2,
      changedCount: 1,
      idempotentCount: 1,
    });
    expect(
      listRecipeImageLifecycleCompletionCandidates,
    ).toHaveBeenCalledOnce();
    expect(
      listRecipeImageLifecycleCompletionCandidates,
    ).toHaveBeenCalledWith({
      dbClient,
      limit: 50,
      now,
    });
    expect(completeRecipeImageAccountLifecycle).toHaveBeenCalledTimes(2);
    expect(completeRecipeImageAccountLifecycle).toHaveBeenNthCalledWith(
      1,
      {
        accountGeneration: 3,
        dbClient,
        now,
        ownerUuid: FIRST_OWNER_UUID,
      },
    );
    expect(completeRecipeImageAccountLifecycle).toHaveBeenNthCalledWith(
      2,
      {
        accountGeneration: 4,
        dbClient,
        now,
        ownerUuid: SECOND_OWNER_UUID,
      },
    );
  });

  it("returns zero counts without calling completion for an empty page", async () => {
    const { runRecipeImageLifecycleCompletionDrain } = await import(
      "@/lib/server/recipe-image-lifecycle-completion-drain"
    );
    listRecipeImageLifecycleCompletionCandidates.mockResolvedValue([]);

    await expect(runRecipeImageLifecycleCompletionDrain({
      dbClient: { rpc: vi.fn() },
    })).resolves.toEqual({
      candidateCount: 0,
      changedCount: 0,
      idempotentCount: 0,
    });
    expect(completeRecipeImageAccountLifecycle).not.toHaveBeenCalled();
  });

  it("continues later candidates but fails closed when one completion races", async () => {
    const { runRecipeImageLifecycleCompletionDrain } = await import(
      "@/lib/server/recipe-image-lifecycle-completion-drain"
    );
    listRecipeImageLifecycleCompletionCandidates.mockResolvedValue(candidates);
    completeRecipeImageAccountLifecycle
      .mockRejectedValueOnce(new Error("sensitive-completion-detail"))
      .mockResolvedValueOnce({ changed: true });

    await expect(runRecipeImageLifecycleCompletionDrain({
      dbClient: { rpc: vi.fn() },
    })).rejects.toThrow("recipe image lifecycle completion drain failed");
    expect(completeRecipeImageAccountLifecycle).toHaveBeenCalledTimes(2);
  });

  it("redacts candidate listing failures and never calls completion", async () => {
    const { runRecipeImageLifecycleCompletionDrain } = await import(
      "@/lib/server/recipe-image-lifecycle-completion-drain"
    );
    listRecipeImageLifecycleCompletionCandidates.mockRejectedValue(
      new Error("sensitive-listing-detail"),
    );

    await expect(runRecipeImageLifecycleCompletionDrain({
      dbClient: { rpc: vi.fn() },
    })).rejects.toThrow("recipe image lifecycle completion drain failed");
    expect(completeRecipeImageAccountLifecycle).not.toHaveBeenCalled();
  });

  it("fails closed for an impossible completion result", async () => {
    const { runRecipeImageLifecycleCompletionDrain } = await import(
      "@/lib/server/recipe-image-lifecycle-completion-drain"
    );
    listRecipeImageLifecycleCompletionCandidates.mockResolvedValue([
      candidates[0],
    ]);
    completeRecipeImageAccountLifecycle.mockResolvedValue({
      changed: "true",
    });

    await expect(runRecipeImageLifecycleCompletionDrain({
      dbClient: { rpc: vi.fn() },
    })).rejects.toThrow("recipe image lifecycle completion drain failed");
  });
});
