import { describe, expect, it, vi } from "vitest";

import { finalizeRecipeImageAuthDeletionClaim } from "@/lib/server/recipe-image-auth-deletion-finalize";

const OUTBOX_ID = "00000000-0000-4000-8000-000000000601";
const OWNER_UUID = "00000000-0000-4000-8000-000000000602";
const LEASE_TOKEN = "00000000-0000-4000-8000-000000000603";
const AUTH_IDENTITY_CREATED_AT = "2030-07-25T00:00:00.000Z";
const NOW = "2030-07-25T01:00:00.000Z";
const RETRY_AT = "2030-07-25T01:05:00.000Z";

function rpcResult(data: unknown, error: { message: string } | null = null) {
  return { data, error };
}

function terminalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: OUTBOX_ID,
    owner_uuid: OWNER_UUID,
    account_generation: 3,
    auth_identity_created_at_snapshot: AUTH_IDENTITY_CREATED_AT,
    auth_identity_deleted_at: NOW,
    state: "succeeded",
    terminal_result: "deleted",
    attempts: 1,
    next_attempt_at: AUTH_IDENTITY_CREATED_AT,
    ...overrides,
  };
}

function retryRow(overrides: Record<string, unknown> = {}) {
  return terminalRow({
    auth_identity_deleted_at: null,
    state: "failed",
    terminal_result: null,
    next_attempt_at: RETRY_AT,
    ...overrides,
  });
}

const baseInput = {
  accountGeneration: 3,
  attempts: 1,
  authIdentityCreatedAt: AUTH_IDENTITY_CREATED_AT,
  leaseToken: LEASE_TOKEN,
  now: () => new Date(NOW),
  outboxId: OUTBOX_ID,
  ownerUuid: OWNER_UUID,
};

describe("managed recipe image Auth deletion finalize adapter", () => {
  it("calls the guarded authority and accepts one exact terminal result", async () => {
    const rpc = vi.fn(async () => rpcResult(terminalRow()));

    await expect(finalizeRecipeImageAuthDeletionClaim({
      ...baseInput,
      dbClient: { rpc },
      error: null,
      terminalResult: "deleted",
    })).resolves.toEqual({
      accountGeneration: 3,
      attempts: 1,
      authIdentityCreatedAt: AUTH_IDENTITY_CREATED_AT,
      authIdentityDeletedAt: NOW,
      nextAttemptAt: AUTH_IDENTITY_CREATED_AT,
      outboxId: OUTBOX_ID,
      ownerUuid: OWNER_UUID,
      state: "succeeded",
      terminalResult: "deleted",
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "finalize_recipe_image_auth_deletion_claim",
      {
        p_account_generation: 3,
        p_auth_identity_created_at_snapshot: AUTH_IDENTITY_CREATED_AT,
        p_error: null,
        p_expected_attempts: 1,
        p_lease_token: LEASE_TOKEN,
        p_now: NOW,
        p_outbox_id: OUTBOX_ID,
        p_owner_uuid: OWNER_UUID,
        p_terminal_result: "deleted",
      },
    );
  });

  it.each([
    "deleted",
    "already_absent",
    "identity_replaced",
  ] as const)("accepts the %s terminal result", async (terminalResult) => {
    const rpc = vi.fn(async () => rpcResult(terminalRow({
      terminal_result: terminalResult,
    })));

    await expect(finalizeRecipeImageAuthDeletionClaim({
      ...baseInput,
      dbClient: { rpc },
      error: null,
      terminalResult,
    })).resolves.toMatchObject({
      authIdentityDeletedAt: NOW,
      state: "succeeded",
      terminalResult,
    });
  });

  it.each([
    ["failed", RETRY_AT],
    ["dead_letter", AUTH_IDENTITY_CREATED_AT],
  ] as const)("accepts an exact unresolved %s result", async (
    state,
    nextAttemptAt,
  ) => {
    const rpc = vi.fn(async () => rpcResult(retryRow({
      next_attempt_at: nextAttemptAt,
      state,
    })));

    await expect(finalizeRecipeImageAuthDeletionClaim({
      ...baseInput,
      dbClient: { rpc },
      error: "ADMIN_DELETE_FAILED",
      terminalResult: null,
    })).resolves.toMatchObject({
      authIdentityDeletedAt: null,
      nextAttemptAt,
      state,
      terminalResult: null,
    });
  });

  it("normalizes safe bigint strings and equivalent PostgreSQL timestamps", async () => {
    const rpc = vi.fn(async () => rpcResult(terminalRow({
      account_generation: "3",
      attempts: "1",
      auth_identity_created_at_snapshot: "2030-07-25T00:00:00+00:00",
      auth_identity_deleted_at: "2030-07-25T01:00:00+00:00",
      next_attempt_at: "2030-07-25T00:00:00+00:00",
    })));

    await expect(finalizeRecipeImageAuthDeletionClaim({
      ...baseInput,
      dbClient: { rpc },
      error: null,
      terminalResult: "deleted",
    })).resolves.toMatchObject({
      accountGeneration: 3,
      attempts: 1,
      authIdentityCreatedAt: AUTH_IDENTITY_CREATED_AT,
      authIdentityDeletedAt: NOW,
      nextAttemptAt: AUTH_IDENTITY_CREATED_AT,
    });
  });

  it.each([
    ["undefined result", undefined],
    ["missing error field", { data: terminalRow() }],
    ["RPC error", rpcResult(null, { message: "sensitive-db-error" })],
    ["array result", rpcResult([terminalRow()])],
    ["wrong outbox", rpcResult(terminalRow({
      id: "00000000-0000-4000-8000-000000000699",
    }))],
    ["wrong owner", rpcResult(terminalRow({
      owner_uuid: "00000000-0000-4000-8000-000000000698",
    }))],
    ["wrong generation", rpcResult(terminalRow({
      account_generation: 4,
    }))],
    ["wrong identity epoch", rpcResult(terminalRow({
      auth_identity_created_at_snapshot: "2030-07-24T00:00:00.000Z",
    }))],
    ["wrong attempts", rpcResult(terminalRow({ attempts: 2 }))],
    ["wrong state", rpcResult(terminalRow({ state: "failed" }))],
    ["wrong terminal result", rpcResult(terminalRow({
      terminal_result: "already_absent",
    }))],
    ["missing deletion timestamp", rpcResult(terminalRow({
      auth_identity_deleted_at: null,
    }))],
    ["wrong deletion timestamp", rpcResult(terminalRow({
      auth_identity_deleted_at: "2030-07-25T01:00:01.000Z",
    }))],
    ["invalid next attempt", rpcResult(terminalRow({
      next_attempt_at: "not-a-time",
    }))],
  ])("fails closed for terminal %s", async (_label, result) => {
    await expect(finalizeRecipeImageAuthDeletionClaim({
      ...baseInput,
      dbClient: { rpc: async () => result },
      error: null,
      terminalResult: "deleted",
    })).rejects.toThrow("recipe image Auth deletion finalize failed");
  });

  it.each([
    ["succeeded retry", retryRow({ state: "succeeded" })],
    ["terminal retry", retryRow({ terminal_result: "deleted" })],
    ["resolved retry", retryRow({ auth_identity_deleted_at: NOW })],
    ["missing unresolved marker", retryRow({
      auth_identity_deleted_at: undefined,
    })],
    ["wrong retry time", retryRow({
      next_attempt_at: "2030-07-25T01:04:59.000Z",
    })],
  ])("fails closed for malformed retry %s", async (_label, row) => {
    await expect(finalizeRecipeImageAuthDeletionClaim({
      ...baseInput,
      dbClient: { rpc: async () => rpcResult(row) },
      error: "ADMIN_DELETE_FAILED",
      terminalResult: null,
    })).rejects.toThrow("recipe image Auth deletion finalize failed");
  });

  it("does not expose thrown RPC details", async () => {
    await expect(finalizeRecipeImageAuthDeletionClaim({
      ...baseInput,
      dbClient: {
        rpc: async () => {
          throw new Error("sensitive-rpc-detail");
        },
      },
      error: null,
      terminalResult: "deleted",
    })).rejects.toThrow("recipe image Auth deletion finalize failed");
  });

  it.each([
    ["invalid outbox", { outboxId: "not-a-uuid" }],
    ["invalid owner", { ownerUuid: "not-a-uuid" }],
    ["zero generation", { accountGeneration: 0 }],
    ["fractional generation", { accountGeneration: 1.5 }],
    ["invalid identity epoch", { authIdentityCreatedAt: "not-a-time" }],
    ["future identity epoch", {
      authIdentityCreatedAt: "2030-07-25T02:00:00.000Z",
    }],
    ["invalid lease", { leaseToken: "not-a-uuid" }],
    ["zero attempts", { attempts: 0 }],
    ["fractional attempts", { attempts: 1.5 }],
    ["invalid time", { now: () => new Date(Number.NaN) }],
    ["invalid terminal", { terminalResult: "missing" }],
    ["empty retry error", { error: "", terminalResult: null }],
  ])("rejects %s before calling the authority", async (_label, override) => {
    const rpc = vi.fn(async () => rpcResult(terminalRow()));

    await expect(finalizeRecipeImageAuthDeletionClaim({
      ...baseInput,
      dbClient: { rpc },
      error: null,
      terminalResult: "deleted",
      ...override,
    // The invalid terminal case intentionally exercises the runtime boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)).rejects.toThrow(
      "invalid recipe image Auth deletion finalize input",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
