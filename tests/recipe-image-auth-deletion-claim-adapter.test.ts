import { describe, expect, it, vi } from "vitest";

import { claimRecipeImageAuthDeletionIfReady } from "@/lib/server/recipe-image-auth-deletion-claim";

const OUTBOX_ID = "00000000-0000-4000-8000-000000000501";
const OWNER_UUID = "00000000-0000-4000-8000-000000000502";
const LEASE_TOKEN = "00000000-0000-4000-8000-000000000503";
const AUTH_IDENTITY_CREATED_AT = "2030-07-25T00:00:00.000Z";
const NOW = "2030-07-25T01:00:00.000Z";
const LEASE_EXPIRES_AT = "2030-07-25T01:02:00.000Z";

function rpcResult(data: unknown, error: { message: string } | null = null) {
  return { data, error };
}

function claimedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: OUTBOX_ID,
    owner_uuid: OWNER_UUID,
    account_generation: 3,
    auth_identity_created_at_snapshot: AUTH_IDENTITY_CREATED_AT,
    state: "processing",
    attempts: 1,
    lease_token: LEASE_TOKEN,
    lease_expires_at: LEASE_EXPIRES_AT,
    ...overrides,
  };
}

describe("managed recipe image Auth deletion claim adapter", () => {
  it("calls the guarded authority and accepts one exact lease claim", async () => {
    const rpc = vi.fn(async () => rpcResult(claimedRow()));

    await expect(claimRecipeImageAuthDeletionIfReady({
      accountGeneration: 3,
      dbClient: { rpc },
      leaseToken: LEASE_TOKEN,
      now: () => new Date(NOW),
      outboxId: OUTBOX_ID,
      ownerUuid: OWNER_UUID,
    })).resolves.toEqual({
      accountGeneration: 3,
      attempts: 1,
      authIdentityCreatedAt: AUTH_IDENTITY_CREATED_AT,
      leaseExpiresAt: LEASE_EXPIRES_AT,
      leaseToken: LEASE_TOKEN,
      outboxId: OUTBOX_ID,
      ownerUuid: OWNER_UUID,
      state: "processing",
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "claim_recipe_image_auth_deletion_if_ready",
      {
        p_account_generation: 3,
        p_lease_token: LEASE_TOKEN,
        p_now: NOW,
        p_outbox_id: OUTBOX_ID,
        p_owner_uuid: OWNER_UUID,
      },
    );
  });

  it("normalizes safe bigint strings and equivalent PostgreSQL timestamps", async () => {
    const rpc = vi.fn(async () => rpcResult(claimedRow({
      account_generation: "3",
      attempts: "2",
      auth_identity_created_at_snapshot: "2030-07-25T00:00:00+00:00",
      lease_expires_at: "2030-07-25T01:02:00+00:00",
    })));

    await expect(claimRecipeImageAuthDeletionIfReady({
      accountGeneration: 3,
      dbClient: { rpc },
      leaseToken: LEASE_TOKEN,
      now: () => new Date(NOW),
      outboxId: OUTBOX_ID,
      ownerUuid: OWNER_UUID,
    })).resolves.toMatchObject({
      accountGeneration: 3,
      attempts: 2,
      authIdentityCreatedAt: AUTH_IDENTITY_CREATED_AT,
      leaseExpiresAt: LEASE_EXPIRES_AT,
    });
  });

  it("preserves the exact microsecond identity epoch returned by the claim", async () => {
    const exactEpoch = "2030-07-25T00:00:00.123456Z";
    const rpc = vi.fn(async () => rpcResult(claimedRow({
      auth_identity_created_at_snapshot: exactEpoch,
    })));

    await expect(claimRecipeImageAuthDeletionIfReady({
      accountGeneration: 3,
      dbClient: { rpc },
      leaseToken: LEASE_TOKEN,
      now: () => new Date(NOW),
      outboxId: OUTBOX_ID,
      ownerUuid: OWNER_UUID,
    })).resolves.toMatchObject({
      authIdentityCreatedAt: exactEpoch,
    });
  });

  it.each([
    ["undefined result", undefined],
    ["missing error field", { data: claimedRow() }],
    ["RPC error", rpcResult(null, { message: "sensitive-db-error" })],
    ["array result", rpcResult([claimedRow()])],
    ["wrong outbox", rpcResult(claimedRow({
      id: "00000000-0000-4000-8000-000000000599",
    }))],
    ["wrong owner", rpcResult(claimedRow({
      owner_uuid: "00000000-0000-4000-8000-000000000598",
    }))],
    ["wrong generation", rpcResult(claimedRow({
      account_generation: 4,
    }))],
    ["invalid identity epoch", rpcResult(claimedRow({
      auth_identity_created_at_snapshot: "not-a-time",
    }))],
    ["future identity epoch", rpcResult(claimedRow({
      auth_identity_created_at_snapshot: "2030-07-25T02:00:00.000Z",
    }))],
    ["wrong state", rpcResult(claimedRow({ state: "succeeded" }))],
    ["zero attempts", rpcResult(claimedRow({ attempts: 0 }))],
    ["unsafe attempts", rpcResult(claimedRow({
      attempts: "9007199254740992",
    }))],
    ["wrong lease", rpcResult(claimedRow({
      lease_token: "00000000-0000-4000-8000-000000000597",
    }))],
    ["invalid lease expiry", rpcResult(claimedRow({
      lease_expires_at: "not-a-time",
    }))],
    ["wrong lease duration", rpcResult(claimedRow({
      lease_expires_at: "2030-07-25T01:01:59.000Z",
    }))],
  ])("fails closed for %s", async (_label, result) => {
    await expect(claimRecipeImageAuthDeletionIfReady({
      accountGeneration: 3,
      dbClient: { rpc: async () => result },
      leaseToken: LEASE_TOKEN,
      now: () => new Date(NOW),
      outboxId: OUTBOX_ID,
      ownerUuid: OWNER_UUID,
    })).rejects.toThrow("recipe image Auth deletion claim failed");
  });

  it("does not expose thrown RPC details", async () => {
    await expect(claimRecipeImageAuthDeletionIfReady({
      accountGeneration: 3,
      dbClient: {
        rpc: async () => {
          throw new Error("sensitive-rpc-detail");
        },
      },
      leaseToken: LEASE_TOKEN,
      now: () => new Date(NOW),
      outboxId: OUTBOX_ID,
      ownerUuid: OWNER_UUID,
    })).rejects.toThrow("recipe image Auth deletion claim failed");
  });

  it.each([
    ["invalid outbox", { outboxId: "not-a-uuid" }],
    ["invalid owner", { ownerUuid: "not-a-uuid" }],
    ["zero generation", { accountGeneration: 0 }],
    ["fractional generation", { accountGeneration: 1.5 }],
    ["invalid lease", { leaseToken: "not-a-uuid" }],
    ["invalid time", { now: () => new Date(Number.NaN) }],
  ])("rejects %s before calling the authority", async (_label, override) => {
    const rpc = vi.fn(async () => rpcResult(claimedRow()));

    await expect(claimRecipeImageAuthDeletionIfReady({
      accountGeneration: 3,
      dbClient: { rpc },
      leaseToken: LEASE_TOKEN,
      now: () => new Date(NOW),
      outboxId: OUTBOX_ID,
      ownerUuid: OWNER_UUID,
      ...override,
    })).rejects.toThrow("invalid recipe image Auth deletion claim input");
    expect(rpc).not.toHaveBeenCalled();
  });
});
