import { describe, expect, it, vi } from "vitest";

import {
  executeRecipeImageAuthConditionalDeletion,
  unavailableRecipeImageAuthDeletionProviderBarrier,
} from "@/lib/server/recipe-image-auth-conditional-delete";

const OWNER_UUID = "00000000-0000-4000-8000-000000000711";
const EXPECTED_IDENTITY_CREATED_AT = "2030-07-26T00:00:00.000Z";
const NEWER_IDENTITY_CREATED_AT = "2030-07-26T02:00:00.000Z";
const NOW = "2030-07-26T03:00:00.000Z";

const baseInput = {
  expectedAuthIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
  now: () => new Date(NOW),
  ownerUuid: OWNER_UUID,
};

function exactResult(status: "already_absent" | "deleted") {
  return {
    authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
    ownerUuid: OWNER_UUID,
    status,
  };
}

describe("managed recipe image conditional Auth deletion port", () => {
  it.each(["deleted", "already_absent"] as const)(
    "accepts exact atomic %s evidence",
    async (status) => {
      const deleteIfIdentityUnchanged = vi.fn(async () => exactResult(status));

      await expect(executeRecipeImageAuthConditionalDeletion({
        ...baseInput,
        providerBarrier: { deleteIfIdentityUnchanged },
      })).resolves.toEqual(exactResult(status));
      expect(deleteIfIdentityUnchanged).toHaveBeenCalledOnce();
      expect(deleteIfIdentityUnchanged).toHaveBeenCalledWith({
        expectedAuthIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
        ownerUuid: OWNER_UUID,
      });
    },
  );

  it("normalizes equivalent exact identity timestamps", async () => {
    const deleteIfIdentityUnchanged = vi.fn(async () => ({
      authIdentityCreatedAt: "2030-07-26T00:00:00+00:00",
      ownerUuid: OWNER_UUID,
      status: "deleted",
    }));

    await expect(executeRecipeImageAuthConditionalDeletion({
      ...baseInput,
      providerBarrier: { deleteIfIdentityUnchanged },
    })).resolves.toEqual(exactResult("deleted"));
  });

  it("accepts only a strictly newer same-UUID replacement identity", async () => {
    const deleteIfIdentityUnchanged = vi.fn(async () => ({
      actualAuthIdentityCreatedAt: NEWER_IDENTITY_CREATED_AT,
      authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
      ownerUuid: OWNER_UUID,
      status: "identity_replaced",
    }));

    await expect(executeRecipeImageAuthConditionalDeletion({
      ...baseInput,
      providerBarrier: { deleteIfIdentityUnchanged },
    })).resolves.toEqual({
      actualAuthIdentityCreatedAt: NEWER_IDENTITY_CREATED_AT,
      authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
      ownerUuid: OWNER_UUID,
      status: "identity_replaced",
    });
  });

  it("fails closed when no provider-supported barrier exists", async () => {
    await expect(executeRecipeImageAuthConditionalDeletion({
      ...baseInput,
      providerBarrier: unavailableRecipeImageAuthDeletionProviderBarrier,
    })).resolves.toEqual({
      status: "barrier_unavailable",
    });
  });

  it("never falls back to separate lookup or delete operations", async () => {
    const deleteIfIdentityUnchanged = vi.fn(async () => exactResult("deleted"));
    const getUserById = vi.fn();
    const deleteUser = vi.fn();
    const providerBarrier = {
      deleteIfIdentityUnchanged,
      deleteUser,
      getUserById,
    };

    await executeRecipeImageAuthConditionalDeletion({
      ...baseInput,
      providerBarrier,
    });

    expect(getUserById).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ["undefined evidence", undefined],
    ["raw Supabase success", {
      data: { user: { id: OWNER_UUID } },
      error: null,
    }],
    ["raw Supabase error", {
      data: { user: null },
      error: { status: 503 },
    }],
    ["missing status", {
      authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
      ownerUuid: OWNER_UUID,
    }],
    ["wrong owner", {
      ...exactResult("deleted"),
      ownerUuid: "00000000-0000-4000-8000-000000000799",
    }],
    ["wrong expected epoch", {
      ...exactResult("deleted"),
      authIdentityCreatedAt: "2030-07-25T23:59:59.000Z",
    }],
    ["future replacement epoch", {
      actualAuthIdentityCreatedAt: "2030-07-26T04:00:00.000Z",
      authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
      ownerUuid: OWNER_UUID,
      status: "identity_replaced",
    }],
    ["older replacement epoch", {
      actualAuthIdentityCreatedAt: "2030-07-25T23:59:59.000Z",
      authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
      ownerUuid: OWNER_UUID,
      status: "identity_replaced",
    }],
    ["replacement without actual epoch", {
      authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
      ownerUuid: OWNER_UUID,
      status: "identity_replaced",
    }],
    ["unknown status", {
      ...exactResult("deleted"),
      status: "retry",
    }],
    ["deleted with conflicting replacement epoch", {
      ...exactResult("deleted"),
      actualAuthIdentityCreatedAt: NEWER_IDENTITY_CREATED_AT,
    }],
    ["replacement with unexpected evidence", {
      actualAuthIdentityCreatedAt: NEWER_IDENTITY_CREATED_AT,
      authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
      ownerUuid: OWNER_UUID,
      providerRequestId: "sensitive-request-id",
      status: "identity_replaced",
    }],
  ])("fails closed for %s", async (_label, evidence) => {
    await expect(executeRecipeImageAuthConditionalDeletion({
      ...baseInput,
      providerBarrier: {
        deleteIfIdentityUnchanged: async () => evidence,
      },
    })).rejects.toThrow("recipe image conditional Auth deletion failed");
  });

  it("does not expose thrown provider details", async () => {
    await expect(executeRecipeImageAuthConditionalDeletion({
      ...baseInput,
      providerBarrier: {
        deleteIfIdentityUnchanged: async () => {
          throw new Error("sensitive-provider-barrier-detail");
        },
      },
    })).rejects.toThrow("recipe image conditional Auth deletion failed");
  });

  it.each([
    ["invalid owner", { ownerUuid: "not-a-uuid" }],
    ["invalid expected epoch", {
      expectedAuthIdentityCreatedAt: "not-a-time",
    }],
    ["future expected epoch", {
      expectedAuthIdentityCreatedAt: "2030-07-26T04:00:00.000Z",
    }],
    ["invalid time", { now: () => new Date(Number.NaN) }],
  ])("rejects %s before invoking the port", async (_label, override) => {
    const deleteIfIdentityUnchanged = vi.fn(async () => exactResult("deleted"));

    await expect(executeRecipeImageAuthConditionalDeletion({
      ...baseInput,
      providerBarrier: { deleteIfIdentityUnchanged },
      ...override,
    })).rejects.toThrow(
      "invalid recipe image conditional Auth deletion input",
    );
    expect(deleteIfIdentityUnchanged).not.toHaveBeenCalled();
  });
});
