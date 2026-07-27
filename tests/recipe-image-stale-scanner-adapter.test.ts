import { describe, expect, it, vi } from "vitest";

import { scanStaleRecipeImageUploads } from
  "@/lib/server/recipe-image-stale-scanner";

const OBJECT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_UUID = "22222222-2222-4222-8222-222222222222";
const OUTBOX_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_OBJECT_ID = "44444444-4444-4444-8444-444444444444";
const SECOND_OUTBOX_ID = "55555555-5555-4555-8555-555555555555";
const THIRD_OBJECT_ID = "66666666-6666-4666-8666-666666666666";
const THIRD_OUTBOX_ID = "77777777-7777-4777-8777-777777777777";
const NOW = "2030-07-26T01:00:00.000Z";

function rpcResult(data: unknown, error: { message: string } | null = null) {
  return { data, error };
}

function scanRow(overrides: Record<string, unknown> = {}) {
  return {
    object_id: OBJECT_ID,
    owner_uuid: OWNER_UUID,
    account_generation: 7,
    cleanup_generation: 3,
    outbox_id: OUTBOX_ID,
    previous_state: "pending_upload",
    ...overrides,
  };
}

describe("managed recipe image stale scanner adapter", () => {
  it("runs one bounded scan and normalizes exact authority rows", async () => {
    const rpc = vi.fn(async () => rpcResult([
      scanRow({
        account_generation: "7",
        cleanup_generation: "3",
      }),
      scanRow({
        object_id: SECOND_OBJECT_ID,
        outbox_id: SECOND_OUTBOX_ID,
        previous_state: "uploaded_unlinked",
      }),
    ]));

    await expect(scanStaleRecipeImageUploads({
      dbClient: { rpc },
      limit: 2,
      now: () => new Date(NOW),
    })).resolves.toEqual([
      {
        accountGeneration: 7,
        cleanupGeneration: 3,
        objectId: OBJECT_ID,
        outboxId: OUTBOX_ID,
        ownerUuid: OWNER_UUID,
        previousState: "pending_upload",
      },
      {
        accountGeneration: 7,
        cleanupGeneration: 3,
        objectId: SECOND_OBJECT_ID,
        outboxId: SECOND_OUTBOX_ID,
        ownerUuid: OWNER_UUID,
        previousState: "uploaded_unlinked",
      },
    ]);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "scan_stale_recipe_image_uploads",
      { p_limit: 2, p_now: NOW },
    );
  });

  it("accepts an empty exact authority page", async () => {
    const rpc = vi.fn(async () => rpcResult([]));

    await expect(scanStaleRecipeImageUploads({
      dbClient: { rpc },
      limit: 50,
      now: () => new Date(NOW),
    })).resolves.toEqual([]);
  });

  it.each([
    ["undefined result", undefined],
    ["missing error field", { data: [] }],
    ["RPC error", rpcResult(null, { message: "sensitive-db-detail" })],
    ["non-array data", rpcResult(scanRow())],
    ["too many rows", rpcResult([
      scanRow(),
      scanRow({
        object_id: SECOND_OBJECT_ID,
        outbox_id: SECOND_OUTBOX_ID,
      }),
      scanRow({
        object_id: THIRD_OBJECT_ID,
        outbox_id: THIRD_OUTBOX_ID,
      }),
    ])],
    ["invalid object", rpcResult([scanRow({ object_id: "not-a-uuid" })])],
    ["invalid owner", rpcResult([scanRow({ owner_uuid: "not-a-uuid" })])],
    ["invalid outbox", rpcResult([scanRow({ outbox_id: "not-a-uuid" })])],
    ["zero account generation", rpcResult([
      scanRow({ account_generation: 0 }),
    ])],
    ["zero cleanup generation", rpcResult([
      scanRow({ cleanup_generation: 0 }),
    ])],
    ["unsafe generation", rpcResult([
      scanRow({ cleanup_generation: "9007199254740992" }),
    ])],
    ["unknown previous state", rpcResult([
      scanRow({ previous_state: "cleanup_pending" }),
    ])],
    ["extra row field", rpcResult([scanRow({ bucket_id: "private" })])],
    ["duplicate object", rpcResult([
      scanRow(),
      scanRow({ outbox_id: SECOND_OUTBOX_ID }),
    ])],
    ["duplicate outbox", rpcResult([
      scanRow(),
      scanRow({
        object_id: SECOND_OBJECT_ID,
        outbox_id: OUTBOX_ID,
      }),
    ])],
  ])("fails closed for %s", async (_label, result) => {
    await expect(scanStaleRecipeImageUploads({
      dbClient: { rpc: async () => result },
      limit: 2,
      now: () => new Date(NOW),
    })).rejects.toThrow("recipe image stale scanner failed");
  });

  it("does not expose thrown RPC details", async () => {
    await expect(scanStaleRecipeImageUploads({
      dbClient: {
        rpc: async () => {
          throw new Error("sensitive-rpc-detail");
        },
      },
      limit: 1,
      now: () => new Date(NOW),
    })).rejects.toThrow("recipe image stale scanner failed");
  });

  it.each([
    ["zero limit", { limit: 0 }],
    ["limit above maximum", { limit: 51 }],
    ["fractional limit", { limit: 1.5 }],
    ["invalid now", { now: () => new Date(Number.NaN) }],
  ])("rejects %s before calling the authority", async (_label, override) => {
    const rpc = vi.fn(async () => rpcResult([]));

    await expect(scanStaleRecipeImageUploads({
      dbClient: { rpc },
      limit: 1,
      now: () => new Date(NOW),
      ...override,
    })).rejects.toThrow("invalid recipe image stale scanner input");
    expect(rpc).not.toHaveBeenCalled();
  });
});
