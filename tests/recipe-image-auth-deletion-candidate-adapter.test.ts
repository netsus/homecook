import { describe, expect, it, vi } from "vitest";

import { listRecipeImageAuthDeletionCandidates } from "@/lib/server/recipe-image-auth-deletion-candidates";

const FIRST_OUTBOX_ID = "00000000-0000-4000-8000-000000000601";
const SECOND_OUTBOX_ID = "00000000-0000-4000-8000-000000000602";
const OWNER_UUID = "00000000-0000-4000-8000-000000000603";
const IDENTITY_EPOCH = "2030-07-25T00:00:00.000Z";
const FIRST_DUE_AT = "2030-07-25T00:30:00.000Z";
const SECOND_DUE_AT = "2030-07-25T00:45:00.000Z";
const NOW = "2030-07-25T01:00:00.000Z";

function rpcResult(data: unknown, error: { message: string } | null = null) {
  return { data, error };
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    outbox_id: FIRST_OUTBOX_ID,
    owner_uuid: OWNER_UUID,
    account_generation: 3,
    auth_identity_created_at_snapshot: IDENTITY_EPOCH,
    next_attempt_at: FIRST_DUE_AT,
    ...overrides,
  };
}

describe("managed recipe image Auth deletion candidate adapter", () => {
  it("lists a bounded exact cursor page and normalizes PostgreSQL values", async () => {
    const rpc = vi.fn(async () => rpcResult([
      candidateRow({
        account_generation: "3",
        auth_identity_created_at_snapshot: "2030-07-25T00:00:00+00:00",
        next_attempt_at: "2030-07-25T00:30:00+00:00",
      }),
      candidateRow({
        outbox_id: SECOND_OUTBOX_ID,
        next_attempt_at: SECOND_DUE_AT,
      }),
    ]));

    await expect(listRecipeImageAuthDeletionCandidates({
      afterNextAttemptAt: "2030-07-25T00:15:00+00:00",
      afterOutboxId: "00000000-0000-4000-8000-000000000600",
      dbClient: { rpc },
      limit: 2,
      now: () => new Date(NOW),
    })).resolves.toEqual([
      {
        accountGeneration: 3,
        authIdentityCreatedAt: IDENTITY_EPOCH,
        nextAttemptAt: FIRST_DUE_AT,
        outboxId: FIRST_OUTBOX_ID,
        ownerUuid: OWNER_UUID,
      },
      {
        accountGeneration: 3,
        authIdentityCreatedAt: IDENTITY_EPOCH,
        nextAttemptAt: SECOND_DUE_AT,
        outboxId: SECOND_OUTBOX_ID,
        ownerUuid: OWNER_UUID,
      },
    ]);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "list_recipe_image_auth_deletion_candidates",
      {
        p_after_next_attempt_at: "2030-07-25T00:15:00.000Z",
        p_after_outbox_id: "00000000-0000-4000-8000-000000000600",
        p_limit: 2,
        p_now: NOW,
      },
    );
  });

  it("passes an absent cursor as an exact null pair and accepts an empty page", async () => {
    const rpc = vi.fn(async () => rpcResult([]));

    await expect(listRecipeImageAuthDeletionCandidates({
      dbClient: { rpc },
      limit: 50,
      now: () => new Date(NOW),
    })).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith(
      "list_recipe_image_auth_deletion_candidates",
      {
        p_after_next_attempt_at: null,
        p_after_outbox_id: null,
        p_limit: 50,
        p_now: NOW,
      },
    );
  });

  it("preserves microsecond cursors and orders rows within one millisecond", async () => {
    const rpc = vi.fn(async () => rpcResult([
      candidateRow({
        outbox_id: SECOND_OUTBOX_ID,
        auth_identity_created_at_snapshot: "2030-07-25T00:00:00.123456+00:00",
        next_attempt_at: "2030-07-25T00:30:00.123456+00:00",
      }),
      candidateRow({
        outbox_id: FIRST_OUTBOX_ID,
        next_attempt_at: "2030-07-25T00:30:00.123457+00:00",
      }),
    ]));

    await expect(listRecipeImageAuthDeletionCandidates({
      afterNextAttemptAt: "2030-07-25T00:30:00.123455+00:00",
      afterOutboxId: FIRST_OUTBOX_ID,
      dbClient: { rpc },
      limit: 2,
      now: () => new Date(NOW),
    })).resolves.toEqual([
      {
        accountGeneration: 3,
        authIdentityCreatedAt: "2030-07-25T00:00:00.123456Z",
        nextAttemptAt: "2030-07-25T00:30:00.123456Z",
        outboxId: SECOND_OUTBOX_ID,
        ownerUuid: OWNER_UUID,
      },
      {
        accountGeneration: 3,
        authIdentityCreatedAt: IDENTITY_EPOCH,
        nextAttemptAt: "2030-07-25T00:30:00.123457Z",
        outboxId: FIRST_OUTBOX_ID,
        ownerUuid: OWNER_UUID,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith(
      "list_recipe_image_auth_deletion_candidates",
      {
        p_after_next_attempt_at: "2030-07-25T00:30:00.123455Z",
        p_after_outbox_id: FIRST_OUTBOX_ID,
        p_limit: 2,
        p_now: NOW,
      },
    );
  });

  it.each([
    ["undefined result", undefined],
    ["missing error field", { data: [] }],
    ["RPC error", rpcResult(null, { message: "sensitive-db-error" })],
    ["non-array data", rpcResult(candidateRow())],
    ["too many rows", rpcResult(Array.from({ length: 3 }, (_, index) =>
      candidateRow({
        outbox_id: `00000000-0000-4000-8000-${String(610 + index).padStart(12, "0")}`,
      })))],
    ["invalid outbox", rpcResult([candidateRow({ outbox_id: "not-a-uuid" })])],
    ["invalid owner", rpcResult([candidateRow({ owner_uuid: "not-a-uuid" })])],
    ["zero generation", rpcResult([candidateRow({ account_generation: 0 })])],
    ["unsafe generation", rpcResult([candidateRow({
      account_generation: "9007199254740992",
    })])],
    ["invalid identity epoch", rpcResult([candidateRow({
      auth_identity_created_at_snapshot: "not-a-time",
    })])],
    ["invalid identity calendar date", rpcResult([candidateRow({
      auth_identity_created_at_snapshot: "2030-02-30T00:00:00.123456Z",
    })])],
    ["future identity epoch", rpcResult([candidateRow({
      auth_identity_created_at_snapshot: "2030-07-25T02:00:00.000Z",
    })])],
    ["invalid due time", rpcResult([candidateRow({
      next_attempt_at: "not-a-time",
    })])],
    ["not yet due", rpcResult([candidateRow({
      next_attempt_at: "2030-07-25T01:00:00.001Z",
    })])],
    ["extra row field", rpcResult([candidateRow({ state: "pending" })])],
    ["duplicate cursor tuple", rpcResult([
      candidateRow(),
      candidateRow(),
    ])],
    ["duplicate outbox at different due times", rpcResult([
      candidateRow(),
      candidateRow({ next_attempt_at: SECOND_DUE_AT }),
    ])],
    ["descending cursor tuple", rpcResult([
      candidateRow({ next_attempt_at: SECOND_DUE_AT }),
      candidateRow({ outbox_id: SECOND_OUTBOX_ID }),
    ])],
    ["row before requested cursor", rpcResult([candidateRow({
      outbox_id: "00000000-0000-4000-8000-000000000599",
      next_attempt_at: "2030-07-25T00:15:00.000Z",
    })])],
  ])("fails closed for %s", async (_label, result) => {
    await expect(listRecipeImageAuthDeletionCandidates({
      afterNextAttemptAt: "2030-07-25T00:15:00.000Z",
      afterOutboxId: "00000000-0000-4000-8000-000000000600",
      dbClient: { rpc: async () => result },
      limit: 2,
      now: () => new Date(NOW),
    })).rejects.toThrow("recipe image Auth deletion candidate listing failed");
  });

  it("does not expose thrown RPC details", async () => {
    await expect(listRecipeImageAuthDeletionCandidates({
      dbClient: {
        rpc: async () => {
          throw new Error("sensitive-rpc-detail");
        },
      },
      limit: 1,
      now: () => new Date(NOW),
    })).rejects.toThrow("recipe image Auth deletion candidate listing failed");
  });

  it.each([
    ["zero limit", { limit: 0 }],
    ["limit above maximum", { limit: 51 }],
    ["fractional limit", { limit: 1.5 }],
    ["invalid now", { now: () => new Date(Number.NaN) }],
    ["cursor timestamp only", { afterNextAttemptAt: FIRST_DUE_AT }],
    ["cursor id only", { afterOutboxId: FIRST_OUTBOX_ID }],
    ["invalid cursor timestamp", {
      afterNextAttemptAt: "not-a-time",
      afterOutboxId: FIRST_OUTBOX_ID,
    }],
    ["invalid cursor calendar date", {
      afterNextAttemptAt: "2030-02-30T00:00:00.123456Z",
      afterOutboxId: FIRST_OUTBOX_ID,
    }],
    ["future cursor timestamp", {
      afterNextAttemptAt: "2030-07-25T01:00:00.001Z",
      afterOutboxId: FIRST_OUTBOX_ID,
    }],
    ["invalid cursor id", {
      afterNextAttemptAt: FIRST_DUE_AT,
      afterOutboxId: "not-a-uuid",
    }],
  ])("rejects %s before calling the authority", async (_label, override) => {
    const rpc = vi.fn(async () => rpcResult([]));

    await expect(listRecipeImageAuthDeletionCandidates({
      dbClient: { rpc },
      limit: 2,
      now: () => new Date(NOW),
      ...override,
    })).rejects.toThrow("invalid recipe image Auth deletion candidate input");
    expect(rpc).not.toHaveBeenCalled();
  });
});
