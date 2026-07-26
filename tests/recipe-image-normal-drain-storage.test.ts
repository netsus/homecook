import { describe, expect, it, vi } from "vitest";

import { runRecipeImageNormalDrainStorage } from
  "@/lib/server/recipe-image-normal-drain-storage";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const OBJECT_ID = "33333333-3333-4333-8333-333333333333";
const OUTBOX_ID = "44444444-4444-4444-8444-444444444444";
const LEASE_TOKEN = "55555555-5555-4555-8555-555555555555";
const BUCKET_ID = "recipe-images-private";
const OBJECT_PATH = `${OWNER_UUID}/7/${OBJECT_ID}.png`;
const NOW = "2026-07-26T12:00:00.000Z";

type PresenceResult = { kind: "absent" | "failed" | "present" };
type DeleteResult = { kind: "deleted" | "failed" };
type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

function claim(overrides: Record<string, unknown> = {}) {
  return {
    account_generation: 7,
    bucket_id: BUCKET_ID,
    cleanup_generation: 3,
    lease_token: LEASE_TOKEN,
    object_path: OBJECT_PATH,
    outbox_id: OUTBOX_ID,
    owner_uuid: OWNER_UUID,
    reason: "stale_upload",
    ...overrides,
  };
}

function runWith({
  checkObjectPresence = vi.fn(async () => ({ kind: "present" as const })),
  claims = [claim()],
  deleteObject = vi.fn(async () => ({ kind: "deleted" as const })),
  rpc,
}: {
  checkObjectPresence?: (
    input: { bucketId: string; objectPath: string },
  ) => Promise<PresenceResult>;
  claims?: unknown;
  deleteObject?: (
    input: { bucketId: string; objectPath: string },
  ) => Promise<DeleteResult>;
  rpc?: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<RpcResult>;
} = {}) {
  const rpcMock = rpc ?? vi.fn(async (name: string) => {
    if (name === "claim_recipe_image_cleanup") {
      return { data: claims, error: null };
    }
    if (name === "authorize_recipe_image_cleanup_delete") {
      return { data: true, error: null };
    }
    if (name === "complete_recipe_image_cleanup_deleted") {
      return { data: true, error: null };
    }
    return { data: null, error: { message: "unexpected rpc" } };
  });

  return {
    checkObjectPresence,
    deleteObject,
    rpc: rpcMock,
    run: () => runRecipeImageNormalDrainStorage({
      checkObjectPresence,
      dbClient: { rpc: rpcMock },
      deleteObject,
      leaseToken: LEASE_TOKEN,
      now: () => new Date(NOW),
    }),
  };
}

describe("recipe image normal drain Storage", () => {
  it("authorizes twice, deletes an exact present object, and completes the lease", async () => {
    const { checkObjectPresence, deleteObject, rpc, run } = runWith();

    await expect(run()).resolves.toEqual({
      claimedCount: 1,
      deletedCount: 1,
      quarantinedCount: 0,
      staleCount: 0,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "claim_recipe_image_cleanup",
      { p_lease_token: LEASE_TOKEN, p_limit: 50, p_now: NOW },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "authorize_recipe_image_cleanup_delete",
      {
        p_account_generation: 7,
        p_authorized_at: NOW,
        p_cleanup_generation: 3,
        p_lease_token: LEASE_TOKEN,
        p_outbox_id: OUTBOX_ID,
        p_owner_uuid: OWNER_UUID,
      },
    );
    expect(checkObjectPresence).toHaveBeenCalledWith({
      bucketId: BUCKET_ID,
      objectPath: OBJECT_PATH,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      "authorize_recipe_image_cleanup_delete",
      expect.objectContaining({ p_authorized_at: NOW }),
    );
    expect(deleteObject).toHaveBeenCalledWith({
      bucketId: BUCKET_ID,
      objectPath: OBJECT_PATH,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      4,
      "complete_recipe_image_cleanup_deleted",
      expect.objectContaining({
        p_completed_at: NOW,
        p_lease_token: LEASE_TOKEN,
        p_outbox_id: OUTBOX_ID,
      }),
    );
  });

  it("moves an exact first absence to quarantine without deleting", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_recipe_image_cleanup") {
        return { data: [claim()], error: null };
      }
      if (name === "authorize_recipe_image_cleanup_delete") {
        return { data: true, error: null };
      }
      if (name === "observe_recipe_image_cleanup_not_found") {
        return { data: true, error: null };
      }
      return { data: null, error: { message: "unexpected rpc" } };
    });
    const { deleteObject, run } = runWith({
      checkObjectPresence: vi.fn(async () => ({ kind: "absent" as const })),
      rpc,
    });

    await expect(run()).resolves.toEqual({
      claimedCount: 1,
      deletedCount: 0,
      quarantinedCount: 1,
      staleCount: 0,
    });
    expect(deleteObject).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      "observe_recipe_image_cleanup_not_found",
      expect.objectContaining({
        p_observed_at: NOW,
        p_outbox_id: OUTBOX_ID,
      }),
    );
  });

  it("fails the exact lease with a stable code when Storage deletion fails", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_recipe_image_cleanup") {
        return { data: [claim()], error: null };
      }
      if (name === "authorize_recipe_image_cleanup_delete") {
        return { data: true, error: null };
      }
      if (name === "fail_recipe_image_cleanup") {
        return { data: "failed", error: null };
      }
      return { data: null, error: { message: "unexpected rpc" } };
    });
    const { run } = runWith({
      deleteObject: vi.fn(async () => ({ kind: "failed" as const })),
      rpc,
    });

    await expect(run()).rejects.toThrow(
      "recipe image normal drain Storage failed",
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "fail_recipe_image_cleanup",
      expect.objectContaining({
        p_error_code: "STORAGE_DELETE_FAILED",
        p_failed_at: NOW,
      }),
    );
  });

  it("fails the exact lease without delete when presence is indeterminate", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_recipe_image_cleanup") {
        return { data: [claim()], error: null };
      }
      if (name === "authorize_recipe_image_cleanup_delete") {
        return { data: true, error: null };
      }
      if (name === "fail_recipe_image_cleanup") {
        return { data: "failed", error: null };
      }
      return { data: null, error: { message: "unexpected rpc" } };
    });
    const { deleteObject, run } = runWith({
      checkObjectPresence: vi.fn(async () => ({ kind: "failed" as const })),
      rpc,
    });

    await expect(run()).rejects.toThrow(
      "recipe image normal drain Storage failed",
    );
    expect(deleteObject).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith(
      "fail_recipe_image_cleanup",
      expect.objectContaining({ p_error_code: "STORAGE_PRESENCE_FAILED" }),
    );
  });

  it("treats a false exact authorization as stale without touching Storage", async () => {
    const rpc = vi.fn(async (name: string) => name
      === "claim_recipe_image_cleanup"
      ? { data: [claim()], error: null }
      : { data: false, error: null });
    const { checkObjectPresence, deleteObject, run } = runWith({ rpc });

    await expect(run()).resolves.toEqual({
      claimedCount: 1,
      deletedCount: 0,
      quarantinedCount: 0,
      staleCount: 1,
    });
    expect(checkObjectPresence).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("stops before deletion when the second exact authorization is stale", async () => {
    let authorizationCount = 0;
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_recipe_image_cleanup") {
        return { data: [claim()], error: null };
      }
      if (name === "authorize_recipe_image_cleanup_delete") {
        authorizationCount += 1;
        return { data: authorizationCount === 1, error: null };
      }
      return { data: null, error: { message: "unexpected rpc" } };
    });
    const { deleteObject, run } = runWith({ rpc });

    await expect(run()).resolves.toEqual({
      claimedCount: 1,
      deletedCount: 0,
      quarantinedCount: 0,
      staleCount: 1,
    });
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("treats a false completion after deletion as a harmless stale finalize", async () => {
    let authorizationCount = 0;
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_recipe_image_cleanup") {
        return { data: [claim()], error: null };
      }
      if (name === "authorize_recipe_image_cleanup_delete") {
        authorizationCount += 1;
        return { data: true, error: null };
      }
      if (name === "complete_recipe_image_cleanup_deleted") {
        return { data: false, error: null };
      }
      return { data: null, error: { message: "unexpected rpc" } };
    });
    const { run } = runWith({ rpc });

    await expect(run()).resolves.toEqual({
      claimedCount: 1,
      deletedCount: 0,
      quarantinedCount: 0,
      staleCount: 1,
    });
    expect(authorizationCount).toBe(2);
  });

  it("fails the lease when a post-delete completion is indeterminate", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_recipe_image_cleanup") {
        return { data: [claim()], error: null };
      }
      if (name === "authorize_recipe_image_cleanup_delete") {
        return { data: true, error: null };
      }
      if (name === "complete_recipe_image_cleanup_deleted") {
        return { data: null, error: { message: "database unavailable" } };
      }
      if (name === "fail_recipe_image_cleanup") {
        return { data: "failed", error: null };
      }
      return { data: null, error: { message: "unexpected rpc" } };
    });
    const { deleteObject, run } = runWith({ rpc });

    await expect(run()).rejects.toThrow(
      "recipe image normal drain Storage failed",
    );
    expect(deleteObject).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenLastCalledWith(
      "fail_recipe_image_cleanup",
      expect.objectContaining({ p_error_code: "DELETE_FINALIZE_FAILED" }),
    );
  });

  it("rejects a claim whose lease or canonical owner path is inconsistent", async () => {
    const { checkObjectPresence, run } = runWith({
      claims: [claim({
        lease_token: "66666666-6666-4666-8666-666666666666",
        object_path: `${OWNER_UUID}/8/${OBJECT_ID}.png`,
      })],
    });

    await expect(run()).rejects.toThrow(
      "invalid recipe image normal drain claim",
    );
    expect(checkObjectPresence).not.toHaveBeenCalled();
  });

  it("rejects an oversized claim response before Storage", async () => {
    const { checkObjectPresence, run } = runWith({
      claims: Array.from({ length: 51 }, () => claim()),
    });

    await expect(run()).rejects.toThrow(
      "recipe image normal drain claim failed",
    );
    expect(checkObjectPresence).not.toHaveBeenCalled();
  });

  it("normalizes a malformed presence result into an exact failed lease", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_recipe_image_cleanup") {
        return { data: [claim()], error: null };
      }
      if (name === "authorize_recipe_image_cleanup_delete") {
        return { data: true, error: null };
      }
      if (name === "fail_recipe_image_cleanup") {
        return { data: "failed", error: null };
      }
      return { data: null, error: { message: "unexpected rpc" } };
    });
    const { run } = runWith({
      checkObjectPresence: vi.fn(async () => (
        null as unknown as PresenceResult
      )),
      rpc,
    });

    await expect(run()).rejects.toThrow(
      "recipe image normal drain Storage failed",
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "fail_recipe_image_cleanup",
      expect.objectContaining({ p_error_code: "STORAGE_PRESENCE_FAILED" }),
    );
  });

  it("fails closed on a claim RPC error without touching Storage", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "sensitive database detail" },
    }));
    const { checkObjectPresence, deleteObject, run } = runWith({ rpc });

    await expect(run()).rejects.toThrow(
      "recipe image normal drain claim failed",
    );
    expect(checkObjectPresence).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
