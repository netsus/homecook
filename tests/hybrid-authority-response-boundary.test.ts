import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  beginHybridAuthorityResponseBoundary,
  recordHybridAuthorityFailure,
} from "@/lib/server/hybrid-auth/route-error-context";

const mocks = vi.hoisted(() => ({
  bootstrapError: null as Error | null,
  queryError: true,
}));

function createUsersTable() {
  const result = {
    data: null,
    error: mocks.queryError ? { message: "masked PostgREST error" } : null,
  };
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query),
  };
  return {
    select: vi.fn(() => query),
    update: vi.fn(() => query),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createAccountLifecycleInternalRpcClient: vi.fn(),
  createRouteHandlerClient: vi.fn(async () => {
    beginHybridAuthorityResponseBoundary();
    recordHybridAuthorityFailure("ACCOUNT_LIFECYCLE_MAINTENANCE");
    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: "11111111-1111-4111-8111-111111111111",
            },
          },
        })),
      },
      from: vi.fn(() => createUsersTable()),
    };
  }),
}));

vi.mock("@/lib/server/user-bootstrap", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/server/user-bootstrap")
  >();
  return {
    ...actual,
    ensurePublicUserRow: vi.fn(async () => {
      if (mocks.bootstrapError) {
        throw mocks.bootstrapError;
      }
      return {};
    }),
    ensureUserBootstrapState: vi.fn(async () => {
      if (mocks.bootstrapError) {
        throw mocks.bootstrapError;
      }
    }),
  };
});

describe("hybrid authority common API response boundary", () => {
  beforeEach(() => {
    mocks.bootstrapError = null;
    mocks.queryError = true;
  });

  it("maps /users/me GET query masking to the existing maintenance response", async () => {
    const route = await import("@/app/api/v1/users/me/route");
    const response = await route.GET(new Request("http://localhost/api/v1/users/me"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: {
        code: "ACCOUNT_LIFECYCLE_MAINTENANCE",
        fields: [],
      },
    });
  });

  it("maps /users/me PATCH query masking to the existing stale response", async () => {
    const server = await import("@/lib/supabase/server");
    vi.mocked(server.createRouteHandlerClient).mockImplementationOnce(
      async () => {
        beginHybridAuthorityResponseBoundary();
        recordHybridAuthorityFailure("ACCOUNT_SESSION_STALE");
        return {
          auth: {
            getUser: vi.fn(async () => ({
              data: {
                user: {
                  id: "11111111-1111-4111-8111-111111111111",
                },
              },
            })),
          },
          from: vi.fn(() => createUsersTable()),
        } as never;
      },
    );
    const route = await import("@/app/api/v1/users/me/route");
    const response = await route.PATCH(new Request(
      "http://localhost/api/v1/users/me",
      {
        method: "PATCH",
        body: JSON.stringify({ nickname: "새닉네임" }),
      },
    ));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ACCOUNT_SESSION_STALE" },
    });
  });

  it("maps /users/me bootstrap masking instead of returning INTERNAL_ERROR", async () => {
    mocks.bootstrapError = new Error("masked bootstrap failure");
    mocks.queryError = false;
    const route = await import("@/app/api/v1/users/me/route");
    const response = await route.GET(new Request("http://localhost/api/v1/users/me"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ACCOUNT_LIFECYCLE_MAINTENANCE" },
    });
  });
});
