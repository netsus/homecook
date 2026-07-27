import { describe, expect, it, vi } from "vitest";

import { listRecipeImageLifecycleCompletionCandidates } from "@/lib/server/recipe-image-lifecycle-completion-candidates";

const FIRST_OWNER_UUID = "00000000-0000-4000-8000-000000000801";
const SECOND_OWNER_UUID = "00000000-0000-4000-8000-000000000802";
const FIRST_DELETED_AT = "2030-07-27T00:30:00.123456Z";
const SECOND_DELETED_AT = "2030-07-27T00:45:00.123456Z";
const NOW = "2030-07-27T01:00:00.000Z";

function rpcResult(data: unknown, error: { message: string } | null = null) {
  return { data, error };
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    owner_uuid: FIRST_OWNER_UUID,
    account_generation: 3,
    auth_identity_deleted_at: FIRST_DELETED_AT,
    ...overrides,
  };
}

describe("managed recipe image lifecycle completion candidate adapter", () => {
  it("lists a bounded exact cursor page and normalizes PostgreSQL values", async () => {
    const rpc = vi.fn(async () => rpcResult([
      candidateRow({
        account_generation: "3",
        auth_identity_deleted_at: "2030-07-27T00:30:00.123456+00:00",
      }),
      candidateRow({
        owner_uuid: SECOND_OWNER_UUID,
        account_generation: 1,
        auth_identity_deleted_at: SECOND_DELETED_AT,
      }),
    ]));

    await expect(listRecipeImageLifecycleCompletionCandidates({
      afterAccountGeneration: 2,
      afterAuthIdentityDeletedAt: "2030-07-27T00:15:00.123455+00:00",
      afterOwnerUuid: FIRST_OWNER_UUID,
      dbClient: { rpc },
      limit: 2,
      now: () => new Date(NOW),
    })).resolves.toEqual([
      {
        accountGeneration: 3,
        authIdentityDeletedAt: FIRST_DELETED_AT,
        ownerUuid: FIRST_OWNER_UUID,
      },
      {
        accountGeneration: 1,
        authIdentityDeletedAt: SECOND_DELETED_AT,
        ownerUuid: SECOND_OWNER_UUID,
      },
    ]);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "list_recipe_image_lifecycle_completion_candidates",
      {
        p_after_account_generation: 2,
        p_after_auth_identity_deleted_at: "2030-07-27T00:15:00.123455Z",
        p_after_owner_uuid: FIRST_OWNER_UUID,
        p_limit: 2,
        p_now: NOW,
      },
    );
  });

  it("passes an absent cursor as an exact null triple and accepts an empty page", async () => {
    const rpc = vi.fn(async () => rpcResult([]));

    await expect(listRecipeImageLifecycleCompletionCandidates({
      dbClient: { rpc },
      limit: 50,
      now: () => new Date(NOW),
    })).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith(
      "list_recipe_image_lifecycle_completion_candidates",
      {
        p_after_account_generation: null,
        p_after_auth_identity_deleted_at: null,
        p_after_owner_uuid: null,
        p_limit: 50,
        p_now: NOW,
      },
    );
  });

  it("preserves microsecond cursors and orders same-time rows by owner then generation", async () => {
    const rpc = vi.fn(async () => rpcResult([
      candidateRow({
        account_generation: 4,
      }),
      candidateRow({
        owner_uuid: SECOND_OWNER_UUID,
        account_generation: 1,
      }),
      candidateRow({
        owner_uuid: SECOND_OWNER_UUID,
        account_generation: 2,
      }),
    ]));

    await expect(listRecipeImageLifecycleCompletionCandidates({
      afterAccountGeneration: 3,
      afterAuthIdentityDeletedAt: FIRST_DELETED_AT,
      afterOwnerUuid: FIRST_OWNER_UUID,
      dbClient: { rpc },
      limit: 3,
      now: () => new Date(NOW),
    })).resolves.toEqual([
      {
        accountGeneration: 4,
        authIdentityDeletedAt: FIRST_DELETED_AT,
        ownerUuid: FIRST_OWNER_UUID,
      },
      {
        accountGeneration: 1,
        authIdentityDeletedAt: FIRST_DELETED_AT,
        ownerUuid: SECOND_OWNER_UUID,
      },
      {
        accountGeneration: 2,
        authIdentityDeletedAt: FIRST_DELETED_AT,
        ownerUuid: SECOND_OWNER_UUID,
      },
    ]);
  });

  it.each([
    ["undefined result", undefined],
    ["missing error field", { data: [] }],
    ["RPC error", rpcResult(null, { message: "sensitive-db-error" })],
    ["non-array data", rpcResult(candidateRow())],
    ["too many rows", rpcResult([
      candidateRow({ account_generation: 3 }),
      candidateRow({ account_generation: 4 }),
      candidateRow({ account_generation: 5 }),
    ])],
    ["invalid owner", rpcResult([candidateRow({ owner_uuid: "not-a-uuid" })])],
    ["zero generation", rpcResult([candidateRow({ account_generation: 0 })])],
    ["unsafe generation", rpcResult([candidateRow({
      account_generation: "9007199254740992",
    })])],
    ["invalid deleted time", rpcResult([candidateRow({
      auth_identity_deleted_at: "not-a-time",
    })])],
    ["invalid deleted calendar date", rpcResult([candidateRow({
      auth_identity_deleted_at: "2030-02-30T00:00:00.123456Z",
    })])],
    ["future deleted time", rpcResult([candidateRow({
      auth_identity_deleted_at: "2030-07-27T01:00:00.000001Z",
    })])],
    ["extra row field", rpcResult([candidateRow({ status: "cleanup_pending" })])],
    ["duplicate cursor tuple", rpcResult([
      candidateRow(),
      candidateRow(),
    ])],
    ["descending account generation", rpcResult([
      candidateRow({ account_generation: 4 }),
      candidateRow({ account_generation: 3 }),
    ])],
    ["descending owner", rpcResult([
      candidateRow({ owner_uuid: SECOND_OWNER_UUID }),
      candidateRow(),
    ])],
    ["descending timestamp", rpcResult([
      candidateRow({ auth_identity_deleted_at: SECOND_DELETED_AT }),
      candidateRow(),
    ])],
    ["row before requested cursor", rpcResult([candidateRow({
      account_generation: 2,
    })])],
  ])("fails closed for %s", async (_label, result) => {
    await expect(listRecipeImageLifecycleCompletionCandidates({
      afterAccountGeneration: 2,
      afterAuthIdentityDeletedAt: FIRST_DELETED_AT,
      afterOwnerUuid: FIRST_OWNER_UUID,
      dbClient: { rpc: async () => result },
      limit: 2,
      now: () => new Date(NOW),
    })).rejects.toThrow("recipe image lifecycle completion candidate listing failed");
  });

  it("does not expose thrown RPC details", async () => {
    await expect(listRecipeImageLifecycleCompletionCandidates({
      dbClient: {
        rpc: async () => {
          throw new Error("sensitive-rpc-detail");
        },
      },
      limit: 1,
      now: () => new Date(NOW),
    })).rejects.toThrow("recipe image lifecycle completion candidate listing failed");
  });

  it.each([
    ["zero limit", { limit: 0 }],
    ["limit above maximum", { limit: 51 }],
    ["fractional limit", { limit: 1.5 }],
    ["invalid now", { now: () => new Date(Number.NaN) }],
    ["cursor timestamp only", {
      afterAuthIdentityDeletedAt: FIRST_DELETED_AT,
    }],
    ["cursor owner only", {
      afterOwnerUuid: FIRST_OWNER_UUID,
    }],
    ["cursor generation only", {
      afterAccountGeneration: 3,
    }],
    ["cursor timestamp and owner only", {
      afterAuthIdentityDeletedAt: FIRST_DELETED_AT,
      afterOwnerUuid: FIRST_OWNER_UUID,
    }],
    ["invalid cursor timestamp", {
      afterAccountGeneration: 3,
      afterAuthIdentityDeletedAt: "not-a-time",
      afterOwnerUuid: FIRST_OWNER_UUID,
    }],
    ["invalid cursor calendar date", {
      afterAccountGeneration: 3,
      afterAuthIdentityDeletedAt: "2030-02-30T00:00:00.123456Z",
      afterOwnerUuid: FIRST_OWNER_UUID,
    }],
    ["future cursor timestamp", {
      afterAccountGeneration: 3,
      afterAuthIdentityDeletedAt: "2030-07-27T01:00:00.000001Z",
      afterOwnerUuid: FIRST_OWNER_UUID,
    }],
    ["invalid cursor owner", {
      afterAccountGeneration: 3,
      afterAuthIdentityDeletedAt: FIRST_DELETED_AT,
      afterOwnerUuid: "not-a-uuid",
    }],
    ["zero cursor generation", {
      afterAccountGeneration: 0,
      afterAuthIdentityDeletedAt: FIRST_DELETED_AT,
      afterOwnerUuid: FIRST_OWNER_UUID,
    }],
    ["unsafe cursor generation", {
      afterAccountGeneration: Number.MAX_SAFE_INTEGER + 1,
      afterAuthIdentityDeletedAt: FIRST_DELETED_AT,
      afterOwnerUuid: FIRST_OWNER_UUID,
    }],
  ])("rejects %s before calling the authority", async (_label, override) => {
    const rpc = vi.fn(async () => rpcResult([]));

    await expect(listRecipeImageLifecycleCompletionCandidates({
      dbClient: { rpc },
      limit: 2,
      now: () => new Date(NOW),
      ...override,
    })).rejects.toThrow("invalid recipe image lifecycle completion candidate input");
    expect(rpc).not.toHaveBeenCalled();
  });
});
