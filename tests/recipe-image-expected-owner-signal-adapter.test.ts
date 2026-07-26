import { describe, expect, it, vi } from "vitest";

import { inspectRecipeImageExpectedOwnerSignal } from "@/lib/server/recipe-image-expected-owner-signal";

const OWNER_UUID = "00000000-0000-4000-8000-000000000347";

function rpcResult(data: unknown, error: { message: string } | null = null) {
  return { data, error };
}

describe("managed recipe image expected-owner signal adapter", () => {
  it("calls the exact owner/generation authority and returns a consistent union", async () => {
    const rpc = vi.fn(async () => rpcResult([
      {
        owner_id_signal_count: "2",
        legacy_owner_path_signal_count: 2,
        registry_signal_count: "1",
        union_signal_count: 4,
        union_zero: false,
      },
    ]));

    await expect(inspectRecipeImageExpectedOwnerSignal({
      accountGeneration: 3,
      dbClient: { rpc },
      ownerUuid: OWNER_UUID,
    })).resolves.toEqual({
      available: true,
      legacyOwnerPathSignalCount: 2,
      ownerIdSignalCount: 2,
      registrySignalCount: 1,
      unionSignalCount: 4,
      unionZero: false,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "inspect_recipe_image_expected_owner_signal",
      {
        p_account_generation: 3,
        p_owner_uuid: OWNER_UUID,
      },
    );
  });

  it("accepts exact zero evidence without treating registry tombstones as objects", async () => {
    const rpc = vi.fn(async () => rpcResult([
      {
        owner_id_signal_count: 0,
        legacy_owner_path_signal_count: "0",
        registry_signal_count: 0,
        union_signal_count: "0",
        union_zero: true,
      },
    ]));

    await expect(inspectRecipeImageExpectedOwnerSignal({
      accountGeneration: 1,
      dbClient: { rpc },
      ownerUuid: OWNER_UUID,
    })).resolves.toMatchObject({
      available: true,
      unionSignalCount: 0,
      unionZero: true,
    });
  });

  it.each([
    ["undefined result", undefined],
    ["missing error field", {
      data: [{
        owner_id_signal_count: 0,
        legacy_owner_path_signal_count: 0,
        registry_signal_count: 0,
        union_signal_count: 0,
        union_zero: true,
      }],
    }],
    ["RPC error", rpcResult(null, { message: "sensitive-db-error" })],
    ["missing row", rpcResult([])],
    ["duplicate rows", rpcResult([{}, {}])],
    ["non-array row", rpcResult({ union_zero: true })],
    ["negative count", rpcResult([{
      owner_id_signal_count: -1,
      legacy_owner_path_signal_count: 0,
      registry_signal_count: 0,
      union_signal_count: 0,
      union_zero: true,
    }])],
    ["unsafe bigint", rpcResult([{
      owner_id_signal_count: "9007199254740992",
      legacy_owner_path_signal_count: 0,
      registry_signal_count: 0,
      union_signal_count: "9007199254740992",
      union_zero: false,
    }])],
    ["kind count exceeds union", rpcResult([{
      owner_id_signal_count: 2,
      legacy_owner_path_signal_count: 0,
      registry_signal_count: 0,
      union_signal_count: 1,
      union_zero: false,
    }])],
    ["union exceeds signal sum", rpcResult([{
      owner_id_signal_count: 1,
      legacy_owner_path_signal_count: 0,
      registry_signal_count: 0,
      union_signal_count: 2,
      union_zero: false,
    }])],
    ["false zero assertion", rpcResult([{
      owner_id_signal_count: 0,
      legacy_owner_path_signal_count: 0,
      registry_signal_count: 0,
      union_signal_count: 0,
      union_zero: false,
    }])],
    ["true nonzero assertion", rpcResult([{
      owner_id_signal_count: 1,
      legacy_owner_path_signal_count: 0,
      registry_signal_count: 0,
      union_signal_count: 1,
      union_zero: true,
    }])],
  ])("fails closed for %s", async (_label, result) => {
    await expect(inspectRecipeImageExpectedOwnerSignal({
      accountGeneration: 1,
      dbClient: { rpc: async () => result },
      ownerUuid: OWNER_UUID,
    })).rejects.toThrow("recipe image expected-owner signal inspection failed");
  });

  it("does not expose thrown RPC details", async () => {
    await expect(inspectRecipeImageExpectedOwnerSignal({
      accountGeneration: 1,
      dbClient: {
        rpc: async () => {
          throw new Error("sensitive-rpc-detail");
        },
      },
      ownerUuid: OWNER_UUID,
    })).rejects.toThrow("recipe image expected-owner signal inspection failed");
  });

  it.each([
    ["invalid owner", { ownerUuid: "not-a-uuid", accountGeneration: 1 }],
    ["zero generation", { ownerUuid: OWNER_UUID, accountGeneration: 0 }],
    ["fractional generation", {
      ownerUuid: OWNER_UUID,
      accountGeneration: 1.5,
    }],
  ])("rejects %s before calling the authority", async (_label, input) => {
    const rpc = vi.fn(async () => rpcResult([]));

    await expect(inspectRecipeImageExpectedOwnerSignal({
      ...input,
      dbClient: { rpc },
    })).rejects.toThrow("invalid recipe image expected-owner signal identity");
    expect(rpc).not.toHaveBeenCalled();
  });
});
