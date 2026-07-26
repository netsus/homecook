import { describe, expect, it, vi } from "vitest";

import { completeRecipeImageAccountLifecycle } from "@/lib/server/recipe-image-lifecycle-completion";

const OWNER_UUID = "00000000-0000-4000-8000-000000000701";
const NOW = "2030-07-27T00:00:00.123Z";
const EARLIER = "2030-07-26T23:59:00.123456Z";

function rpcResult(data: unknown, error: { message: string } | null = null) {
  return { data, error };
}

function completionRow(overrides: Record<string, unknown> = {}) {
  return {
    owner_uuid: OWNER_UUID,
    account_generation: 3,
    status: "complete",
    required_cleanup_generation: 2,
    completed_cleanup_generation: 2,
    updated_at: NOW,
    changed: true,
    ...overrides,
  };
}

const baseInput = {
  accountGeneration: 3,
  now: () => new Date(NOW),
  ownerUuid: OWNER_UUID,
};

describe("managed recipe image lifecycle completion adapter", () => {
  it("calls the exact authority and accepts one changed completion", async () => {
    const rpc = vi.fn(async () => rpcResult(completionRow()));

    await expect(completeRecipeImageAccountLifecycle({
      ...baseInput,
      dbClient: { rpc },
    })).resolves.toEqual({
      accountGeneration: 3,
      changed: true,
      completedCleanupGeneration: 2,
      ownerUuid: OWNER_UUID,
      requiredCleanupGeneration: 2,
      status: "complete",
      updatedAt: NOW,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "complete_recipe_image_account_lifecycle",
      {
        p_account_generation: 3,
        p_now: NOW,
        p_owner_uuid: OWNER_UUID,
      },
    );
  });

  it("accepts an exact idempotent replay without advancing completion time", async () => {
    const rpc = vi.fn(async () => rpcResult(completionRow({
      changed: false,
      updated_at: EARLIER,
    })));

    await expect(completeRecipeImageAccountLifecycle({
      ...baseInput,
      dbClient: { rpc },
    })).resolves.toMatchObject({
      changed: false,
      updatedAt: EARLIER,
    });
  });

  it("accepts generation zero cleanup when no Storage work was required", async () => {
    const rpc = vi.fn(async () => rpcResult(completionRow({
      required_cleanup_generation: "0",
      completed_cleanup_generation: 0,
    })));

    await expect(completeRecipeImageAccountLifecycle({
      ...baseInput,
      dbClient: { rpc },
    })).resolves.toMatchObject({
      completedCleanupGeneration: 0,
      requiredCleanupGeneration: 0,
    });
  });

  it("normalizes safe bigint strings and equivalent PostgreSQL timestamps", async () => {
    const rpc = vi.fn(async () => rpcResult(completionRow({
      account_generation: "3",
      required_cleanup_generation: "2",
      completed_cleanup_generation: "2",
      updated_at: "2030-07-27T00:00:00.123000+00:00",
    })));

    await expect(completeRecipeImageAccountLifecycle({
      ...baseInput,
      dbClient: { rpc },
    })).resolves.toEqual({
      accountGeneration: 3,
      changed: true,
      completedCleanupGeneration: 2,
      ownerUuid: OWNER_UUID,
      requiredCleanupGeneration: 2,
      status: "complete",
      updatedAt: NOW,
    });
  });

  it.each([
    ["undefined result", undefined],
    ["missing error field", { data: completionRow() }],
    ["RPC error", rpcResult(null, { message: "sensitive-db-error" })],
    ["array data", rpcResult([completionRow()])],
    ["missing field", rpcResult((() => {
      const row = completionRow();
      delete (row as Partial<typeof row>).changed;
      return row;
    })())],
    ["extra field", rpcResult(completionRow({ extra: "unexpected" }))],
    ["wrong owner", rpcResult(completionRow({
      owner_uuid: "00000000-0000-4000-8000-000000000799",
    }))],
    ["invalid owner", rpcResult(completionRow({ owner_uuid: "not-a-uuid" }))],
    ["wrong account generation", rpcResult(completionRow({
      account_generation: 4,
    }))],
    ["unsafe account generation", rpcResult(completionRow({
      account_generation: "9007199254740992",
    }))],
    ["wrong status", rpcResult(completionRow({
      status: "cleanup_pending",
    }))],
    ["negative required generation", rpcResult(completionRow({
      required_cleanup_generation: -1,
    }))],
    ["fractional completed generation", rpcResult(completionRow({
      completed_cleanup_generation: 1.5,
    }))],
    ["generation mismatch", rpcResult(completionRow({
      completed_cleanup_generation: 1,
    }))],
    ["invalid changed flag", rpcResult(completionRow({
      changed: "true",
    }))],
    ["invalid timestamp", rpcResult(completionRow({
      updated_at: "not-a-time",
    }))],
    ["changed timestamp mismatch", rpcResult(completionRow({
      updated_at: EARLIER,
    }))],
    ["replay timestamp in future", rpcResult(completionRow({
      changed: false,
      updated_at: "2030-07-27T00:00:00.123001Z",
    }))],
  ])("fails closed for %s", async (_label, result) => {
    await expect(completeRecipeImageAccountLifecycle({
      ...baseInput,
      dbClient: { rpc: async () => result },
    })).rejects.toThrow("recipe image lifecycle completion failed");
  });

  it("does not expose thrown RPC details", async () => {
    await expect(completeRecipeImageAccountLifecycle({
      ...baseInput,
      dbClient: {
        rpc: async () => {
          throw new Error("sensitive-rpc-detail");
        },
      },
    })).rejects.toThrow("recipe image lifecycle completion failed");
  });

  it.each([
    ["invalid owner", { ownerUuid: "not-a-uuid" }],
    ["zero account generation", { accountGeneration: 0 }],
    ["fractional account generation", { accountGeneration: 1.5 }],
    ["unsafe account generation", {
      accountGeneration: Number.MAX_SAFE_INTEGER + 1,
    }],
    ["invalid time", { now: () => new Date(Number.NaN) }],
  ])("rejects %s before calling the authority", async (_label, override) => {
    const rpc = vi.fn(async () => rpcResult(completionRow()));

    await expect(completeRecipeImageAccountLifecycle({
      ...baseInput,
      ...override,
      dbClient: { rpc },
    })).rejects.toThrow("invalid recipe image lifecycle completion input");
    expect(rpc).not.toHaveBeenCalled();
  });
});
