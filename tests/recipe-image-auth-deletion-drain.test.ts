import { describe, expect, it, vi } from "vitest";

import {
  runRecipeImageAuthDeletionDrain,
} from "@/lib/server/recipe-image-auth-deletion-drain";
import {
  unavailableRecipeImageAuthDeletionProviderBarrier,
} from "@/lib/server/recipe-image-auth-conditional-delete";

const OUTBOX_ID = "00000000-0000-4000-8000-000000000801";
const OWNER_UUID = "00000000-0000-4000-8000-000000000802";
const LEASE_TOKEN = "00000000-0000-4000-8000-000000000803";
const SECOND_OUTBOX_ID = "00000000-0000-4000-8000-000000000811";
const SECOND_OWNER_UUID = "00000000-0000-4000-8000-000000000812";
const SECOND_LEASE_TOKEN = "00000000-0000-4000-8000-000000000813";
const IDENTITY_EPOCH = "2030-07-26T00:00:00.123456Z";
const NOW = "2030-07-26T01:00:00.000Z";
const LEASE_EXPIRES_AT = "2030-07-26T01:02:00.000Z";
const RETRY_AT = "2030-07-26T01:05:00.000Z";
const RECOVERY_NOW = "2030-07-26T01:03:00.000Z";
const RECOVERY_LEASE_EXPIRES_AT = "2030-07-26T01:05:00.000Z";

function rpcResult(data: unknown, error: unknown = null) {
  return { data, error };
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    outbox_id: OUTBOX_ID,
    owner_uuid: OWNER_UUID,
    account_generation: 3,
    auth_identity_created_at_snapshot: IDENTITY_EPOCH,
    next_attempt_at: NOW,
    ...overrides,
  };
}

function claimRow(overrides: Record<string, unknown> = {}) {
  return {
    id: OUTBOX_ID,
    owner_uuid: OWNER_UUID,
    account_generation: 3,
    auth_identity_created_at_snapshot: IDENTITY_EPOCH,
    state: "processing",
    attempts: 1,
    lease_token: LEASE_TOKEN,
    lease_expires_at: LEASE_EXPIRES_AT,
    ...overrides,
  };
}

function terminalRow(
  terminalResult: "already_absent" | "deleted" | "identity_replaced",
  overrides: Record<string, unknown> = {},
) {
  return {
    id: OUTBOX_ID,
    owner_uuid: OWNER_UUID,
    account_generation: 3,
    auth_identity_created_at_snapshot: IDENTITY_EPOCH,
    auth_identity_deleted_at: NOW,
    state: "succeeded",
    terminal_result: terminalResult,
    attempts: 1,
    next_attempt_at: IDENTITY_EPOCH,
    ...overrides,
  };
}

function retryRow(overrides: Record<string, unknown> = {}) {
  return terminalRow("deleted", {
    auth_identity_deleted_at: null,
    state: "failed",
    terminal_result: null,
    next_attempt_at: RETRY_AT,
    ...overrides,
  });
}

function baseInput(
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<unknown>,
) {
  return {
    createLeaseToken: () => LEASE_TOKEN,
    dbClient: { rpc },
    now: () => new Date(NOW),
  };
}

describe("managed recipe image Auth deletion drain", () => {
  it("returns an empty bounded tick without creating a lease", async () => {
    const rpc = vi.fn(async () => rpcResult([]));
    const createLeaseToken = vi.fn(() => LEASE_TOKEN);
    const deleteIfIdentityUnchanged = vi.fn();

    await expect(runRecipeImageAuthDeletionDrain({
      createLeaseToken,
      dbClient: { rpc },
      now: () => new Date(NOW),
      providerBarrier: { deleteIfIdentityUnchanged },
    })).resolves.toEqual({
      alreadyAbsentCount: 0,
      candidateCount: 0,
      claimedCount: 0,
      deletedCount: 0,
      identityReplacedCount: 0,
    });
    expect(createLeaseToken).not.toHaveBeenCalled();
    expect(deleteIfIdentityUnchanged).not.toHaveBeenCalled();
  });

  it.each([
    "deleted",
    "already_absent",
    "identity_replaced",
  ] as const)("claims, conditionally resolves and finalizes one %s identity", async (
    terminalResult,
  ) => {
    const calls: string[] = [];
    const rpc = vi.fn(async (name: string) => {
      calls.push(name);
      if (name === "list_recipe_image_auth_deletion_candidates") {
        return rpcResult([candidateRow()]);
      }
      if (name === "claim_recipe_image_auth_deletion_if_ready") {
        return rpcResult(claimRow());
      }
      if (name === "finalize_recipe_image_auth_deletion_claim") {
        return rpcResult(terminalRow(terminalResult));
      }
      throw new Error("unexpected RPC");
    });
    const deleteIfIdentityUnchanged = vi.fn(async () => {
      calls.push("provider_barrier");
      return {
        authIdentityCreatedAt: IDENTITY_EPOCH,
        ownerUuid: OWNER_UUID,
        status: terminalResult,
        ...(terminalResult === "identity_replaced"
          ? {
              actualAuthIdentityCreatedAt:
                "2030-07-26T00:00:00.123457Z",
            }
          : {}),
      };
    });

    await expect(runRecipeImageAuthDeletionDrain({
      ...baseInput(rpc),
      providerBarrier: { deleteIfIdentityUnchanged },
    })).resolves.toEqual({
      alreadyAbsentCount: terminalResult === "already_absent" ? 1 : 0,
      candidateCount: 1,
      claimedCount: 1,
      deletedCount: terminalResult === "deleted" ? 1 : 0,
      identityReplacedCount: terminalResult === "identity_replaced" ? 1 : 0,
    });
    expect(calls).toEqual([
      "list_recipe_image_auth_deletion_candidates",
      "claim_recipe_image_auth_deletion_if_ready",
      "provider_barrier",
      "finalize_recipe_image_auth_deletion_claim",
    ]);
    expect(deleteIfIdentityUnchanged).toHaveBeenCalledWith({
      expectedAuthIdentityCreatedAt: IDENTITY_EPOCH,
      ownerUuid: OWNER_UUID,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "list_recipe_image_auth_deletion_candidates",
      {
        p_after_next_attempt_at: null,
        p_after_outbox_id: null,
        p_limit: 50,
        p_now: NOW,
      },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      "finalize_recipe_image_auth_deletion_claim",
      expect.objectContaining({
        p_error: null,
        p_expected_attempts: 1,
        p_lease_token: LEASE_TOKEN,
        p_terminal_result: terminalResult,
      }),
    );
  });

  it("records a provider failure through the live lease before failing the drain", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "list_recipe_image_auth_deletion_candidates") {
        return rpcResult([candidateRow()]);
      }
      if (name === "claim_recipe_image_auth_deletion_if_ready") {
        return rpcResult(claimRow());
      }
      if (name === "finalize_recipe_image_auth_deletion_claim") {
        return rpcResult(retryRow());
      }
      throw new Error("unexpected RPC");
    });

    await expect(runRecipeImageAuthDeletionDrain({
      ...baseInput(rpc),
      providerBarrier: {
        deleteIfIdentityUnchanged: async () => {
          throw new Error("sensitive provider error");
        },
      },
    })).rejects.toThrow("recipe image Auth deletion drain failed");
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      "finalize_recipe_image_auth_deletion_claim",
      expect.objectContaining({
        p_error: "AUTH_DELETION_PROVIDER_FAILED",
        p_terminal_result: null,
      }),
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(
      "sensitive provider error",
    );
  });

  it("cannot turn an unavailable provider barrier into terminal success", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "list_recipe_image_auth_deletion_candidates") {
        return rpcResult([candidateRow()]);
      }
      if (name === "claim_recipe_image_auth_deletion_if_ready") {
        return rpcResult(claimRow());
      }
      if (name === "finalize_recipe_image_auth_deletion_claim") {
        return rpcResult(retryRow());
      }
      throw new Error("unexpected RPC");
    });

    await expect(runRecipeImageAuthDeletionDrain({
      ...baseInput(rpc),
      providerBarrier: unavailableRecipeImageAuthDeletionProviderBarrier,
    })).rejects.toThrow("recipe image Auth deletion drain failed");
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      "finalize_recipe_image_auth_deletion_claim",
      expect.objectContaining({
        p_error: "AUTH_DELETION_PROVIDER_BARRIER_UNAVAILABLE",
        p_terminal_result: null,
      }),
    );
  });

  it("continues after one provider failure with a fresh lease and throws after the page", async () => {
    const rpcNames: string[] = [];
    const rpc = vi.fn(async (
      name: string,
      params: Record<string, unknown>,
    ) => {
      rpcNames.push(name);
      if (name === "list_recipe_image_auth_deletion_candidates") {
        return rpcResult([
          candidateRow(),
          candidateRow({
            outbox_id: SECOND_OUTBOX_ID,
            owner_uuid: SECOND_OWNER_UUID,
          }),
        ]);
      }
      if (name === "claim_recipe_image_auth_deletion_if_ready") {
        return params.p_outbox_id === OUTBOX_ID
          ? rpcResult(claimRow())
          : rpcResult(claimRow({
              id: SECOND_OUTBOX_ID,
              lease_token: SECOND_LEASE_TOKEN,
              owner_uuid: SECOND_OWNER_UUID,
            }));
      }
      if (name === "finalize_recipe_image_auth_deletion_claim") {
        return params.p_outbox_id === OUTBOX_ID
          ? rpcResult(retryRow())
          : rpcResult(terminalRow("deleted", {
              id: SECOND_OUTBOX_ID,
              owner_uuid: SECOND_OWNER_UUID,
            }));
      }
      throw new Error("unexpected RPC");
    });
    const createLeaseToken = vi.fn()
      .mockReturnValueOnce(LEASE_TOKEN)
      .mockReturnValueOnce(SECOND_LEASE_TOKEN);
    const deleteIfIdentityUnchanged = vi.fn(async ({
      ownerUuid,
    }: {
      ownerUuid: string;
    }) => {
      if (ownerUuid === OWNER_UUID) {
        throw new Error("first provider failure");
      }
      return {
        authIdentityCreatedAt: IDENTITY_EPOCH,
        ownerUuid,
        status: "deleted",
      };
    });

    await expect(runRecipeImageAuthDeletionDrain({
      createLeaseToken,
      dbClient: { rpc },
      now: () => new Date(NOW),
      providerBarrier: { deleteIfIdentityUnchanged },
    })).rejects.toThrow("recipe image Auth deletion drain failed");
    expect(createLeaseToken).toHaveBeenCalledTimes(2);
    expect(deleteIfIdentityUnchanged).toHaveBeenCalledTimes(2);
    expect(rpcNames).toEqual([
      "list_recipe_image_auth_deletion_candidates",
      "claim_recipe_image_auth_deletion_if_ready",
      "finalize_recipe_image_auth_deletion_claim",
      "claim_recipe_image_auth_deletion_if_ready",
      "finalize_recipe_image_auth_deletion_claim",
    ]);
    expect(rpc).toHaveBeenNthCalledWith(
      4,
      "claim_recipe_image_auth_deletion_if_ready",
      expect.objectContaining({
        p_lease_token: SECOND_LEASE_TOKEN,
        p_outbox_id: SECOND_OUTBOX_ID,
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      5,
      "finalize_recipe_image_auth_deletion_claim",
      expect.objectContaining({
        p_error: null,
        p_lease_token: SECOND_LEASE_TOKEN,
        p_outbox_id: SECOND_OUTBOX_ID,
        p_terminal_result: "deleted",
      }),
    );
  });

  it("does not call the provider or finalize after a stale claim", async () => {
    const rpcNames: string[] = [];
    const rpc = vi.fn(async (name: string) => {
      rpcNames.push(name);
      if (name === "list_recipe_image_auth_deletion_candidates") {
        return rpcResult([candidateRow()]);
      }
      if (name === "claim_recipe_image_auth_deletion_if_ready") {
        return rpcResult(null, {
          code: "40001",
          message: "stale claim",
        });
      }
      throw new Error("unexpected RPC");
    });
    const deleteIfIdentityUnchanged = vi.fn();

    await expect(runRecipeImageAuthDeletionDrain({
      ...baseInput(rpc),
      providerBarrier: { deleteIfIdentityUnchanged },
    })).rejects.toThrow("recipe image Auth deletion drain failed");
    expect(rpcNames).toEqual([
      "list_recipe_image_auth_deletion_candidates",
      "claim_recipe_image_auth_deletion_if_ready",
    ]);
    expect(deleteIfIdentityUnchanged).not.toHaveBeenCalled();
  });

  it("recovers an ambiguous finalize after lease expiry as already absent", async () => {
    let claimAttempt = 0;
    let finalizeAttempt = 0;
    const rpc = vi.fn(async (
      name: string,
      params: Record<string, unknown>,
    ) => {
      if (name === "list_recipe_image_auth_deletion_candidates") {
        return rpcResult([candidateRow()]);
      }
      if (name === "claim_recipe_image_auth_deletion_if_ready") {
        claimAttempt += 1;
        return claimAttempt === 1
          ? rpcResult(claimRow())
          : rpcResult(claimRow({
              attempts: 2,
              lease_expires_at: RECOVERY_LEASE_EXPIRES_AT,
              lease_token: SECOND_LEASE_TOKEN,
            }));
      }
      if (name === "finalize_recipe_image_auth_deletion_claim") {
        finalizeAttempt += 1;
        if (finalizeAttempt === 1) {
          throw new Error("ambiguous finalize transport failure");
        }
        return rpcResult(terminalRow("already_absent", {
          attempts: 2,
          auth_identity_deleted_at: params.p_now,
        }));
      }
      throw new Error("unexpected RPC");
    });
    const createLeaseToken = vi.fn()
      .mockReturnValueOnce(LEASE_TOKEN)
      .mockReturnValueOnce(SECOND_LEASE_TOKEN);
    const deleteIfIdentityUnchanged = vi.fn()
      .mockResolvedValueOnce({
        authIdentityCreatedAt: IDENTITY_EPOCH,
        ownerUuid: OWNER_UUID,
        status: "deleted",
      })
      .mockResolvedValueOnce({
        authIdentityCreatedAt: IDENTITY_EPOCH,
        ownerUuid: OWNER_UUID,
        status: "already_absent",
      });

    await expect(runRecipeImageAuthDeletionDrain({
      createLeaseToken,
      dbClient: { rpc },
      now: () => new Date(NOW),
      providerBarrier: { deleteIfIdentityUnchanged },
    })).rejects.toThrow("recipe image Auth deletion drain failed");

    await expect(runRecipeImageAuthDeletionDrain({
      createLeaseToken,
      dbClient: { rpc },
      now: () => new Date(RECOVERY_NOW),
      providerBarrier: { deleteIfIdentityUnchanged },
    })).resolves.toEqual({
      alreadyAbsentCount: 1,
      candidateCount: 1,
      claimedCount: 1,
      deletedCount: 0,
      identityReplacedCount: 0,
    });
    expect(createLeaseToken).toHaveBeenCalledTimes(2);
    expect(deleteIfIdentityUnchanged).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith(
      "finalize_recipe_image_auth_deletion_claim",
      expect.objectContaining({
        p_error: null,
        p_expected_attempts: 2,
        p_lease_token: SECOND_LEASE_TOKEN,
        p_now: RECOVERY_NOW,
        p_terminal_result: "already_absent",
      }),
    );
  });

  it("fails without provider access when the claimed identity epoch differs by one microsecond", async () => {
    const claimedEpoch = "2030-07-26T00:00:00.123457Z";
    const rpc = vi.fn(async (name: string) => {
      if (name === "list_recipe_image_auth_deletion_candidates") {
        return rpcResult([candidateRow()]);
      }
      if (name === "claim_recipe_image_auth_deletion_if_ready") {
        return rpcResult(claimRow({
          auth_identity_created_at_snapshot: claimedEpoch,
        }));
      }
      if (name === "finalize_recipe_image_auth_deletion_claim") {
        return rpcResult(retryRow({
          auth_identity_created_at_snapshot: claimedEpoch,
        }));
      }
      throw new Error("unexpected RPC");
    });
    const deleteIfIdentityUnchanged = vi.fn();

    await expect(runRecipeImageAuthDeletionDrain({
      ...baseInput(rpc),
      providerBarrier: { deleteIfIdentityUnchanged },
    })).rejects.toThrow("recipe image Auth deletion drain failed");
    expect(deleteIfIdentityUnchanged).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      "finalize_recipe_image_auth_deletion_claim",
      expect.objectContaining({
        p_auth_identity_created_at_snapshot: claimedEpoch,
        p_error: "AUTH_DELETION_CLAIM_EPOCH_MISMATCH",
        p_terminal_result: null,
      }),
    );
  });

  it("never claims or calls the provider when candidate listing fails", async () => {
    const rpc = vi.fn(async () => rpcResult(null, {
      message: "sensitive database error",
    }));
    const createLeaseToken = vi.fn(() => LEASE_TOKEN);
    const deleteIfIdentityUnchanged = vi.fn();

    await expect(runRecipeImageAuthDeletionDrain({
      createLeaseToken,
      dbClient: { rpc },
      now: () => new Date(NOW),
      providerBarrier: { deleteIfIdentityUnchanged },
    })).rejects.toThrow(
      "recipe image Auth deletion candidate listing failed",
    );
    expect(rpc).toHaveBeenCalledOnce();
    expect(createLeaseToken).not.toHaveBeenCalled();
    expect(deleteIfIdentityUnchanged).not.toHaveBeenCalled();
  });
});
