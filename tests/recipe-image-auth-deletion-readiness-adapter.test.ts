import { describe, expect, it, vi } from "vitest";

import { inspectRecipeImageAuthDeletionReadiness } from "@/lib/server/recipe-image-auth-deletion-readiness";

const OWNER_UUID = "00000000-0000-4000-8000-000000000405";
const NOW = "2030-07-24T01:00:00.000Z";

function rpcResult(data: unknown, error: { message: string } | null = null) {
  return { data, error };
}

function readyRow(overrides: Record<string, unknown> = {}) {
  return {
    lifecycle_ready: true,
    auth_outbox_due_count: "1",
    required_cleanup_generation: 2,
    terminal_cleanup_generation_count: "2",
    storage_nonterminal_count: 0,
    storage_dead_letter_count: "0",
    storage_generation_mismatch_count: 0,
    registry_nonterminal_count: "0",
    registry_generation_mismatch_count: 0,
    owner_signal_union_count: "0",
    owner_signal_union_zero: true,
    ready: true,
    ...overrides,
  };
}

describe("managed recipe image Auth deletion readiness adapter", () => {
  it("calls the exact authority and accepts one internally ready row", async () => {
    const rpc = vi.fn(async () => rpcResult([readyRow()]));

    await expect(inspectRecipeImageAuthDeletionReadiness({
      accountGeneration: 3,
      dbClient: { rpc },
      now: () => new Date(NOW),
      ownerUuid: OWNER_UUID,
    })).resolves.toEqual({
      available: true,
      authOutboxDueCount: 1,
      lifecycleReady: true,
      ownerSignalUnionCount: 0,
      ownerSignalUnionZero: true,
      ready: true,
      registryGenerationMismatchCount: 0,
      registryNonterminalCount: 0,
      requiredCleanupGeneration: 2,
      storageDeadLetterCount: 0,
      storageGenerationMismatchCount: 0,
      storageNonterminalCount: 0,
      terminalCleanupGenerationCount: 2,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "inspect_recipe_image_auth_deletion_readiness",
      {
        p_account_generation: 3,
        p_now: NOW,
        p_owner_uuid: OWNER_UUID,
      },
    );
  });

  it("returns consistent blocked evidence without treating it as ready", async () => {
    const rpc = vi.fn(async () => rpcResult([readyRow({
      lifecycle_ready: false,
      auth_outbox_due_count: 0,
      terminal_cleanup_generation_count: 1,
      storage_nonterminal_count: 1,
      registry_nonterminal_count: 1,
      ready: false,
    })]));

    await expect(inspectRecipeImageAuthDeletionReadiness({
      accountGeneration: 1,
      dbClient: { rpc },
      now: () => new Date(NOW),
      ownerUuid: OWNER_UUID,
    })).resolves.toMatchObject({
      available: true,
      lifecycleReady: false,
      ready: false,
      storageNonterminalCount: 1,
    });
  });

  it.each([
    ["undefined result", undefined],
    ["missing error field", { data: [readyRow()] }],
    ["RPC error", rpcResult(null, { message: "sensitive-db-error" })],
    ["missing row", rpcResult([])],
    ["duplicate rows", rpcResult([readyRow(), readyRow()])],
    ["non-array row", rpcResult(readyRow())],
    ["negative count", rpcResult([readyRow({
      storage_nonterminal_count: -1,
    })])],
    ["unsafe bigint", rpcResult([readyRow({
      required_cleanup_generation: "9007199254740992",
      terminal_cleanup_generation_count: "9007199254740992",
    })])],
    ["duplicate due identity", rpcResult([readyRow({
      auth_outbox_due_count: 2,
      ready: false,
    })])],
    ["terminal exceeds required", rpcResult([readyRow({
      required_cleanup_generation: 1,
      terminal_cleanup_generation_count: 2,
      ready: false,
    })])],
    ["dead-letter exceeds nonterminal", rpcResult([readyRow({
      storage_nonterminal_count: 0,
      storage_dead_letter_count: 1,
      ready: false,
    })])],
    ["false owner zero assertion", rpcResult([readyRow({
      owner_signal_union_zero: false,
      ready: false,
    })])],
    ["true nonzero owner assertion", rpcResult([readyRow({
      owner_signal_union_count: 1,
      owner_signal_union_zero: true,
      ready: false,
    })])],
    ["false ready assertion", rpcResult([readyRow({
      ready: false,
    })])],
    ["true blocked assertion", rpcResult([readyRow({
      lifecycle_ready: false,
      ready: true,
    })])],
  ])("fails closed for %s", async (_label, result) => {
    await expect(inspectRecipeImageAuthDeletionReadiness({
      accountGeneration: 1,
      dbClient: { rpc: async () => result },
      now: () => new Date(NOW),
      ownerUuid: OWNER_UUID,
    })).rejects.toThrow(
      "recipe image Auth deletion readiness inspection failed",
    );
  });

  it("does not expose thrown RPC details", async () => {
    await expect(inspectRecipeImageAuthDeletionReadiness({
      accountGeneration: 1,
      dbClient: {
        rpc: async () => {
          throw new Error("sensitive-rpc-detail");
        },
      },
      now: () => new Date(NOW),
      ownerUuid: OWNER_UUID,
    })).rejects.toThrow(
      "recipe image Auth deletion readiness inspection failed",
    );
  });

  it.each([
    ["invalid owner", {
      ownerUuid: "not-a-uuid",
      accountGeneration: 1,
      now: () => new Date(NOW),
    }],
    ["zero generation", {
      ownerUuid: OWNER_UUID,
      accountGeneration: 0,
      now: () => new Date(NOW),
    }],
    ["fractional generation", {
      ownerUuid: OWNER_UUID,
      accountGeneration: 1.5,
      now: () => new Date(NOW),
    }],
    ["invalid time", {
      ownerUuid: OWNER_UUID,
      accountGeneration: 1,
      now: () => new Date(Number.NaN),
    }],
  ])("rejects %s before calling the authority", async (_label, input) => {
    const rpc = vi.fn(async () => rpcResult([]));

    await expect(inspectRecipeImageAuthDeletionReadiness({
      ...input,
      dbClient: { rpc },
    })).rejects.toThrow(
      "invalid recipe image Auth deletion readiness input",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
