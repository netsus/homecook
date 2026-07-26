import { describe, expect, it, vi } from "vitest";

import { runRecipeImageQuarantineRecheckStorageScan } from
  "@/lib/server/recipe-image-quarantine-recheck-storage";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const OBJECT_ID = "33333333-3333-4333-8333-333333333333";
const OUTBOX_ID = "44444444-4444-4444-8444-444444444444";
const BUCKET_ID = "recipe-images-private";
const OBJECT_PATH = `${OWNER_UUID}/7/${OBJECT_ID}.png`;
const NOW = "2026-07-26T10:30:00.000Z";
const CLAIMED_CURSOR = "2026-07-26T10:35:00.000Z";

function claim(overrides: Record<string, unknown> = {}) {
  return {
    account_generation: 7,
    bucket_id: BUCKET_ID,
    claimed_next_attempt_at: CLAIMED_CURSOR,
    cleanup_generation: 3,
    object_path: OBJECT_PATH,
    outbox_id: OUTBOX_ID,
    owner_uuid: OWNER_UUID,
    ...overrides,
  };
}

function setup({
  claims = [claim()],
  presence = { kind: "present" },
  recheckData = "pending",
}: {
  claims?: unknown;
  presence?: { kind: "absent" | "failed" | "present" };
  recheckData?: unknown;
} = {}) {
  const rpc = vi.fn(async (name: string) => name
    === "claim_recipe_image_cleanup_not_found_rechecks"
    ? { data: claims, error: null }
    : { data: recheckData, error: null });
  const checkObjectPresence = vi.fn(async () => presence);

  return {
    checkObjectPresence,
    rpc,
    run: () => runRecipeImageQuarantineRecheckStorageScan({
      checkObjectPresence,
      dbClient: { rpc },
      now: () => new Date(NOW),
    }),
  };
}

describe("recipe image quarantine recheck Storage scan", () => {
  it("claims at most 50 and returns an exact present object to pending", async () => {
    const { checkObjectPresence, rpc, run } = setup();

    await expect(run()).resolves.toEqual({
      claimedCount: 1,
      pendingCount: 1,
      staleCount: 0,
      verifiedNotFoundCount: 0,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "claim_recipe_image_cleanup_not_found_rechecks",
      { p_limit: 50, p_now: NOW },
    );
    expect(checkObjectPresence).toHaveBeenCalledWith({
      bucketId: BUCKET_ID,
      objectPath: OBJECT_PATH,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "recheck_claimed_recipe_image_cleanup_not_found",
      {
        p_account_generation: 7,
        p_cleanup_generation: 3,
        p_expected_next_attempt_at: CLAIMED_CURSOR,
        p_object_found: true,
        p_outbox_id: OUTBOX_ID,
        p_owner_uuid: OWNER_UUID,
        p_rechecked_at: NOW,
      },
    );
  });

  it("records an independent exact-path absence as verified_not_found", async () => {
    const { rpc, run } = setup({
      presence: { kind: "absent" },
      recheckData: "verified_not_found",
    });

    await expect(run()).resolves.toEqual({
      claimedCount: 1,
      pendingCount: 0,
      staleCount: 0,
      verifiedNotFoundCount: 1,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "recheck_claimed_recipe_image_cleanup_not_found",
      expect.objectContaining({ p_object_found: false }),
    );
  });

  it("treats a null exact-CAS result as a harmless stale worker", async () => {
    const { run } = setup({ recheckData: null });

    await expect(run()).resolves.toEqual({
      claimedCount: 1,
      pendingCount: 0,
      staleCount: 1,
      verifiedNotFoundCount: 0,
    });
  });

  it("rejects a claim whose private path does not match owner and account generation", async () => {
    const { checkObjectPresence, run } = setup({
      claims: [claim({ object_path: `${OWNER_UUID}/8/${OBJECT_ID}.png` })],
    });

    await expect(run()).rejects.toThrow(
      "invalid recipe image quarantine recheck claim",
    );
    expect(checkObjectPresence).not.toHaveBeenCalled();
  });

  it("fails the phase without resolving an indeterminate Storage result", async () => {
    const { rpc, run } = setup({ presence: { kind: "failed" } });

    await expect(run()).rejects.toThrow(
      "recipe image quarantine recheck Storage scan failed",
    );
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("fails closed on an unexpected Storage presence shape", async () => {
    const rpc = vi.fn(async () => ({ data: [claim()], error: null }));

    await expect(runRecipeImageQuarantineRecheckStorageScan({
      checkObjectPresence: vi.fn(async () => (
        { kind: "unknown" } as unknown as { kind: "present" }
      )),
      dbClient: { rpc },
      now: () => new Date(NOW),
    })).rejects.toThrow(
      "recipe image quarantine recheck Storage scan failed",
    );
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("rejects a claim response that exceeds the hard batch limit", async () => {
    const checkObjectPresence = vi.fn();
    const rpc = vi.fn(async () => ({
      data: Array.from({ length: 51 }, () => claim()),
      error: null,
    }));

    await expect(runRecipeImageQuarantineRecheckStorageScan({
      checkObjectPresence,
      dbClient: { rpc },
      now: () => new Date(NOW),
    })).rejects.toThrow("recipe image quarantine recheck claim failed");
    expect(checkObjectPresence).not.toHaveBeenCalled();
  });

  it("fails closed on a claim RPC error without probing Storage", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "sensitive database detail" },
    }));
    const checkObjectPresence = vi.fn();

    await expect(runRecipeImageQuarantineRecheckStorageScan({
      checkObjectPresence,
      dbClient: { rpc },
      now: () => new Date(NOW),
    })).rejects.toThrow("recipe image quarantine recheck claim failed");
    expect(checkObjectPresence).not.toHaveBeenCalled();
  });

  it("fails closed when the DB result contradicts the observed presence", async () => {
    const { run } = setup({
      presence: { kind: "absent" },
      recheckData: "pending",
    });

    await expect(run()).rejects.toThrow(
      "recipe image quarantine recheck Storage scan failed",
    );
  });
});
