import { describe, expect, it, vi } from "vitest";

import { runRecipeImageTerminalTombstoneStorageScan } from
  "@/lib/server/recipe-image-terminal-tombstone-storage";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const OBJECT_ID = "33333333-3333-4333-8333-333333333333";
const OUTBOX_ID = "44444444-4444-4444-8444-444444444444";
const BUCKET_ID = "recipe-images-private";
const OBJECT_PATH = `${OWNER_UUID}/7/${OBJECT_ID}.png`;
const NOW = "2026-07-26T09:15:00.000Z";
const CLAIMED_CURSOR = "2026-07-26T09:20:00.000Z";

function claim(overrides: Record<string, unknown> = {}) {
  return {
    account_generation: 7,
    bucket_id: BUCKET_ID,
    claimed_next_terminal_scan_at: CLAIMED_CURSOR,
    expected_cleanup_generation: 3,
    object_id: OBJECT_ID,
    object_path: OBJECT_PATH,
    owner_uuid: OWNER_UUID,
    terminal_state: "deleted",
    ...overrides,
  };
}

function setup({
  claims = [claim()],
  presence = { kind: "present" },
  reopenData = [{
    cleanup_generation: 4,
    object_id: OBJECT_ID,
    outbox_id: OUTBOX_ID,
  }],
}: {
  claims?: unknown;
  presence?: { kind: "absent" | "failed" | "present" };
  reopenData?: unknown;
} = {}) {
  const rpc = vi.fn(async (name: string) => name
    === "claim_recipe_image_terminal_tombstones"
    ? { data: claims, error: null }
    : { data: reopenData, error: null });
  const checkObjectPresence = vi.fn(async () => presence);

  return {
    checkObjectPresence,
    rpc,
    run: () => runRecipeImageTerminalTombstoneStorageScan({
      checkObjectPresence,
      dbClient: { rpc },
      now: () => new Date(NOW),
    }),
  };
}

describe("recipe image terminal tombstone Storage scan", () => {
  it("claims at most 50 and reopens only an exact present object cursor", async () => {
    const { checkObjectPresence, rpc, run } = setup();

    await expect(run()).resolves.toEqual({
      absentCount: 0,
      claimedCount: 1,
      reopenedCount: 1,
      staleCount: 0,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "claim_recipe_image_terminal_tombstones",
      { p_limit: 50, p_now: NOW },
    );
    expect(checkObjectPresence).toHaveBeenCalledWith({
      bucketId: BUCKET_ID,
      objectPath: OBJECT_PATH,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "reopen_recipe_image_terminal_tombstone",
      {
        p_account_generation: 7,
        p_expected_cleanup_generation: 3,
        p_expected_next_terminal_scan_at: CLAIMED_CURSOR,
        p_object_id: OBJECT_ID,
        p_owner_uuid: OWNER_UUID,
        p_reopened_at: NOW,
      },
    );
  });

  it("leaves an absent object terminal without calling reopen", async () => {
    const { rpc, run } = setup({ presence: { kind: "absent" } });

    await expect(run()).resolves.toEqual({
      absentCount: 1,
      claimedCount: 1,
      reopenedCount: 0,
      staleCount: 0,
    });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("treats an empty exact-CAS reopen result as a harmless stale worker", async () => {
    const { run } = setup({ reopenData: [] });

    await expect(run()).resolves.toEqual({
      absentCount: 0,
      claimedCount: 1,
      reopenedCount: 0,
      staleCount: 1,
    });
  });

  it("rejects a claimed path that does not match owner, generation and object identity", async () => {
    const { checkObjectPresence, run } = setup({
      claims: [claim({ object_path: `${OWNER_UUID}/8/${OBJECT_ID}.png` })],
    });

    await expect(run()).rejects.toThrow(
      "invalid recipe image terminal tombstone claim",
    );
    expect(checkObjectPresence).not.toHaveBeenCalled();
  });

  it("fails the phase after processing safe rows when Storage is indeterminate", async () => {
    const secondObjectId = "55555555-5555-4555-8555-555555555555";
    const secondPath = `${OWNER_UUID}/7/${secondObjectId}.png`;
    const rpc = vi.fn(async (name: string) => name
      === "claim_recipe_image_terminal_tombstones"
      ? {
          data: [
            claim(),
            claim({
              object_id: secondObjectId,
              object_path: secondPath,
            }),
          ],
          error: null,
        }
      : {
          data: [{
            cleanup_generation: 4,
            object_id: OBJECT_ID,
            outbox_id: OUTBOX_ID,
          }],
          error: null,
        });
    const checkObjectPresence = vi.fn(async ({ objectPath }) => objectPath
      === OBJECT_PATH
      ? { kind: "present" } as const
      : { kind: "failed" } as const);

    await expect(runRecipeImageTerminalTombstoneStorageScan({
      checkObjectPresence,
      dbClient: { rpc },
      now: () => new Date(NOW),
    })).rejects.toThrow("recipe image terminal tombstone Storage scan failed");
    expect(rpc).toHaveBeenCalledWith(
      "reopen_recipe_image_terminal_tombstone",
      expect.objectContaining({ p_object_id: OBJECT_ID }),
    );
  });

  it("fails closed on a claim RPC error without probing Storage", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "sensitive database detail" },
    }));
    const checkObjectPresence = vi.fn();

    await expect(runRecipeImageTerminalTombstoneStorageScan({
      checkObjectPresence,
      dbClient: { rpc },
      now: () => new Date(NOW),
    })).rejects.toThrow("recipe image terminal tombstone claim failed");
    expect(checkObjectPresence).not.toHaveBeenCalled();
  });

  it("replaces a thrown claim transport detail with a stable internal failure", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("sensitive database transport detail");
    });

    await expect(runRecipeImageTerminalTombstoneStorageScan({
      checkObjectPresence: vi.fn(),
      dbClient: { rpc },
      now: () => new Date(NOW),
    })).rejects.toThrow("recipe image terminal tombstone claim failed");
  });
});
