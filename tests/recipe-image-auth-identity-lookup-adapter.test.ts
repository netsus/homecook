import { describe, expect, it, vi } from "vitest";

import { inspectRecipeImageAuthDeletionIdentity } from "@/lib/server/recipe-image-auth-identity-lookup";

const OWNER_UUID = "00000000-0000-4000-8000-000000000701";
const EXPECTED_IDENTITY_CREATED_AT = "2030-07-25T00:00:00.000Z";
const NEWER_IDENTITY_CREATED_AT = "2030-07-25T02:00:00.000Z";
const NOW = "2030-07-25T03:00:00.000Z";

function authResult(
  user: unknown,
  error: { status?: number; message?: string } | null = null,
) {
  return { data: { user }, error };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: OWNER_UUID,
    created_at: EXPECTED_IDENTITY_CREATED_AT,
    ...overrides,
  };
}

const baseInput = {
  expectedAuthIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
  now: () => new Date(NOW),
  ownerUuid: OWNER_UUID,
};

describe("managed recipe image Auth identity lookup adapter", () => {
  it("accepts only the exact expected identity epoch", async () => {
    const getUserById = vi.fn(async () => authResult(user()));
    const deleteUser = vi.fn();
    const authAdminClient = { deleteUser, getUserById };

    await expect(inspectRecipeImageAuthDeletionIdentity({
      ...baseInput,
      authAdminClient,
    })).resolves.toEqual({
      authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
      ownerUuid: OWNER_UUID,
      status: "matched",
    });
    expect(getUserById).toHaveBeenCalledOnce();
    expect(getUserById).toHaveBeenCalledWith(OWNER_UUID);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("normalizes an equivalent PostgreSQL identity timestamp", async () => {
    const getUserById = vi.fn(async () => authResult(user({
      created_at: "2030-07-25T00:00:00+00:00",
    })));

    await expect(inspectRecipeImageAuthDeletionIdentity({
      ...baseInput,
      authAdminClient: { getUserById },
    })).resolves.toEqual({
      authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
      ownerUuid: OWNER_UUID,
      status: "matched",
    });
  });

  it("classifies an explicit 404 with a null user as already absent", async () => {
    const getUserById = vi.fn(async () => authResult(
      null,
      { status: 404, message: "sensitive-user-not-found" },
    ));

    await expect(inspectRecipeImageAuthDeletionIdentity({
      ...baseInput,
      authAdminClient: { getUserById },
    })).resolves.toEqual({
      authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
      ownerUuid: OWNER_UUID,
      status: "already_absent",
    });
  });

  it("classifies only a strictly newer same-UUID identity as replaced", async () => {
    const getUserById = vi.fn(async () => authResult(user({
      created_at: NEWER_IDENTITY_CREATED_AT,
    })));

    await expect(inspectRecipeImageAuthDeletionIdentity({
      ...baseInput,
      authAdminClient: { getUserById },
    })).resolves.toEqual({
      actualAuthIdentityCreatedAt: NEWER_IDENTITY_CREATED_AT,
      authIdentityCreatedAt: EXPECTED_IDENTITY_CREATED_AT,
      ownerUuid: OWNER_UUID,
      status: "identity_replaced",
    });
  });

  it("distinguishes replacement identities within the same millisecond", async () => {
    const expectedEpoch = "2030-07-25T00:00:00.000100Z";
    const actualEpoch = "2030-07-25T00:00:00.000900Z";
    const getUserById = vi.fn(async () => authResult(user({
      created_at: actualEpoch,
    })));

    await expect(inspectRecipeImageAuthDeletionIdentity({
      ...baseInput,
      authAdminClient: { getUserById },
      expectedAuthIdentityCreatedAt: expectedEpoch,
    })).resolves.toEqual({
      actualAuthIdentityCreatedAt: actualEpoch,
      authIdentityCreatedAt: expectedEpoch,
      ownerUuid: OWNER_UUID,
      status: "identity_replaced",
    });
  });

  it.each([
    ["undefined result", undefined],
    ["missing error field", { data: { user: user() } }],
    ["missing data", { error: null }],
    ["array data", { data: [user()], error: null }],
    ["null user without 404", authResult(null)],
    ["404 with a user", authResult(user(), { status: 404 })],
    ["non-404 error", authResult(null, {
      status: 503,
      message: "sensitive-provider-error",
    })],
    ["status-less error", authResult(null, {
      message: "sensitive-provider-error",
    })],
    ["wrong UUID", authResult(user({
      id: "00000000-0000-4000-8000-000000000799",
    }))],
    ["invalid actual identity epoch", authResult(user({
      created_at: "not-a-time",
    }))],
    ["future actual identity epoch", authResult(user({
      created_at: "2030-07-25T04:00:00.000Z",
    }))],
    ["older identity epoch", authResult(user({
      created_at: "2030-07-24T23:59:59.000Z",
    }))],
  ])("fails closed for %s", async (_label, result) => {
    await expect(inspectRecipeImageAuthDeletionIdentity({
      ...baseInput,
      authAdminClient: { getUserById: async () => result },
    })).rejects.toThrow("recipe image Auth identity lookup failed");
  });

  it("does not expose thrown provider details", async () => {
    await expect(inspectRecipeImageAuthDeletionIdentity({
      ...baseInput,
      authAdminClient: {
        getUserById: async () => {
          throw new Error("sensitive-provider-detail");
        },
      },
    })).rejects.toThrow("recipe image Auth identity lookup failed");
  });

  it.each([
    ["invalid owner", { ownerUuid: "not-a-uuid" }],
    ["invalid expected epoch", {
      expectedAuthIdentityCreatedAt: "not-a-time",
    }],
    ["future expected epoch", {
      expectedAuthIdentityCreatedAt: "2030-07-25T04:00:00.000Z",
    }],
    ["invalid time", { now: () => new Date(Number.NaN) }],
  ])("rejects %s before lookup", async (_label, override) => {
    const getUserById = vi.fn(async () => authResult(user()));

    await expect(inspectRecipeImageAuthDeletionIdentity({
      ...baseInput,
      authAdminClient: { getUserById },
      ...override,
    })).rejects.toThrow("invalid recipe image Auth identity lookup input");
    expect(getUserById).not.toHaveBeenCalled();
  });
});
