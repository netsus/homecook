import { describe, expect, it, vi } from "vitest";

import {
  runManagedRecipeImageCancel,
} from "@/lib/server/recipe-image-managed-cancel";

const ownerUuid = "550e8400-e29b-41d4-a716-446655440030";
const imageObjectId = "550e8400-e29b-41d4-a716-446655440031";
const idempotencyKey = "550e8400-e29b-41d4-a716-446655440032";
const outboxId = "550e8400-e29b-41d4-a716-446655440033";

const sessionAuthority = {
  authIdentityCreatedAt: "2026-07-24T01:00:00.000Z",
  hmacKeyVersion: 1,
  ownerUuid,
  sessionKeyHash: "a".repeat(64),
};

describe("managed recipe image cancel", () => {
  it("calls the service-only cancel CAS with exact owner and session authority", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        account_generation: 7,
        cleanup_generation: 3,
        object_id: imageObjectId,
        outcome: "succeeded",
        outbox_id: outboxId,
        state: "cleanup_pending",
      },
      error: null,
    }));

    const result = await runManagedRecipeImageCancel({
      dbClient: { rpc },
      idempotencyKey,
      imageObjectId,
      sessionAuthority,
    });

    expect(result).toEqual({
      kind: "succeeded",
      objectId: imageObjectId,
      state: "cleanup_pending",
    });
    expect(rpc).toHaveBeenCalledWith("cancel_recipe_image_upload", {
      p_auth_identity_created_at_snapshot:
        sessionAuthority.authIdentityCreatedAt,
      p_hmac_key_version: sessionAuthority.hmacKeyVersion,
      p_idempotency_key: idempotencyKey,
      p_image_object_id: imageObjectId,
      p_owner_uuid: ownerUuid,
      p_session_key_hash: sessionAuthority.sessionKeyHash,
    });
  });

  it.each([
    "ACCOUNT_CUTOVER_UNCLASSIFIED",
    "ACCOUNT_CUTOVER_QUARANTINED",
    "ACCOUNT_DELETING",
    "IDEMPOTENCY_KEY_REUSED",
    "ACCOUNT_GENERATION_STALE",
    "ACCOUNT_SESSION_STALE",
    "IMAGE_EXPIRED",
    "IMAGE_NOT_FOUND",
  ] as const)("preserves the official database rejection %s", async (code) => {
    const result = await runManagedRecipeImageCancel({
      dbClient: {
        rpc: vi.fn(async () => ({
          data: null,
          error: { message: code },
        })),
      },
      idempotencyKey,
      imageObjectId,
      sessionAuthority,
    });

    expect(result).toEqual({ code, kind: "rejected" });
  });

  it.each([
    null,
    {},
    {
      account_generation: 7,
      cleanup_generation: 0,
      object_id: imageObjectId,
      outcome: "succeeded",
      outbox_id: outboxId,
      state: "cleanup_pending",
    },
    {
      account_generation: 7,
      cleanup_generation: 3,
      object_id: imageObjectId,
      outcome: "succeeded",
      outbox_id: "not-a-uuid",
      state: "cleanup_pending",
    },
    {
      account_generation: 7,
      cleanup_generation: 3,
      object_id: "550e8400-e29b-41d4-a716-446655440099",
      outcome: "succeeded",
      outbox_id: outboxId,
      state: "cleanup_pending",
    },
  ])("fails closed on malformed durable result %#", async (data) => {
    const result = await runManagedRecipeImageCancel({
      dbClient: {
        rpc: vi.fn(async () => ({ data, error: null })),
      },
      idempotencyKey,
      imageObjectId,
      sessionAuthority,
    });

    expect(result).toEqual({ kind: "failed" });
  });

  it("fails closed without calling the RPC when public inputs are invalid", async () => {
    const rpc = vi.fn();

    const result = await runManagedRecipeImageCancel({
      dbClient: { rpc },
      idempotencyKey: "invalid",
      imageObjectId,
      sessionAuthority,
    });

    expect(result).toEqual({ kind: "failed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    {
      rpc: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    },
    {
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "unexpected internal detail" },
      })),
    },
  ])("fails closed on an unavailable or unknown RPC failure", async (
    dbClient,
  ) => {
    const result = await runManagedRecipeImageCancel({
      dbClient,
      idempotencyKey,
      imageObjectId,
      sessionAuthority,
    });

    expect(result).toEqual({ kind: "failed" });
  });
});
