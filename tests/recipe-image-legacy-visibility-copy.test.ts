import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { runRecipeImageLegacyVisibilityCopy } from
  "@/lib/server/recipe-image-legacy-visibility-copy";

const MIGRATION_KEY = "11111111-1111-4111-8111-111111111111";
const INVENTORY_RUN_ID = "22222222-2222-4222-8222-222222222222";
const CUTOVER_ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";
const POSITIVE_REFERENCE_ID = "44444444-4444-4444-8444-444444444444";
const MIGRATION_RUN_ID = "55555555-5555-4555-8555-555555555555";
const TARGET_OBJECT_ID = "66666666-6666-4666-8666-666666666666";
const OWNER_UUID = "77777777-7777-4777-8777-777777777777";
const SOURCE_OBJECT_ID = "88888888-8888-4888-8888-888888888888";
const SOURCE_PATH = `${OWNER_UUID}/${SOURCE_OBJECT_ID}.png`;
const TARGET_PATH = `${OWNER_UUID}/7/${TARGET_OBJECT_ID}.png`;
const NOW = "2026-07-28T10:00:00.000Z";
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

function target(overrides: Record<string, unknown> = {}) {
  return {
    account_generation: 7,
    expected_visibility: "private",
    migration_run_id: MIGRATION_RUN_ID,
    owner_uuid: OWNER_UUID,
    source_bucket_id: "recipe-images",
    source_object_path: SOURCE_PATH,
    state: "planned",
    target_bucket_id: "recipe-images-private",
    target_object_id: TARGET_OBJECT_ID,
    target_object_path: TARGET_PATH,
    ...overrides,
  };
}

function blob(bytes = PNG_1X1, type = "image/png") {
  return new Blob([new Uint8Array(bytes)], { type });
}

function runWith({
  plan = [target()],
  readObject,
  rpc,
  uploadObject = vi.fn(async () => ({ kind: "uploaded" as const })),
}: {
  plan?: unknown;
  readObject?: (
    input: { bucketId: string; maxBytes: number; objectPath: string },
  ) => Promise<
    | { kind: "absent" | "failed" | "oversized" }
    | { kind: "found"; body: Blob }
  >;
  rpc?: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<RpcResult>;
  uploadObject?: (
    input: {
      body: Blob;
      bucketId: string;
      contentType: "image/jpeg" | "image/png" | "image/webp";
      objectPath: string;
      upsert: false;
    },
  ) => Promise<{ kind: "failed" | "uploaded" }>;
} = {}) {
  let targetReadCount = 0;
  const read = readObject ?? vi.fn(async ({ objectPath }) => {
    if (objectPath === SOURCE_PATH) {
      return { body: blob(), kind: "found" as const };
    }
    targetReadCount += 1;
    return targetReadCount === 1
      ? { kind: "absent" as const }
      : { body: blob(), kind: "found" as const };
  });
  const rpcMock = rpc ?? vi.fn(async (name: string) => {
    if (name === "prepare_recipe_image_legacy_visibility_migration") {
      return { data: plan, error: null };
    }
    if (name === "finalize_recipe_image_legacy_visibility_target") {
      return {
        data: {
          migration_run_id: MIGRATION_RUN_ID,
          replayed: false,
          state: "finalized",
          target_object_id: TARGET_OBJECT_ID,
        },
        error: null,
      };
    }
    return { data: null, error: { message: "unexpected rpc" } };
  });

  return {
    readObject: read,
    rpc: rpcMock,
    run: () => runRecipeImageLegacyVisibilityCopy({
      cutoverAttemptId: CUTOVER_ATTEMPT_ID,
      dbClient: { rpc: rpcMock },
      expectedCapabilityRevision: 2,
      inventoryRunId: INVENTORY_RUN_ID,
      migrationKey: MIGRATION_KEY,
      now: () => new Date(NOW),
      positiveReferenceIds: [POSITIVE_REFERENCE_ID],
      readObject: read,
      uploadObject,
    }),
    uploadObject,
  };
}

describe("recipe image legacy visibility copy executor", () => {
  it("copies exact bytes without overwrite, verifies the target, then finalizes", async () => {
    const { readObject, rpc, run, uploadObject } = runWith();

    await expect(run()).resolves.toEqual({
      failedCount: 0,
      failures: [],
      finalizedCount: 1,
      plannedCount: 1,
      replayedCount: 0,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "prepare_recipe_image_legacy_visibility_migration",
      {
        p_cutover_attempt_id: CUTOVER_ATTEMPT_ID,
        p_expected_capability_revision: 2,
        p_inventory_run_id: INVENTORY_RUN_ID,
        p_migration_key: MIGRATION_KEY,
        p_positive_reference_ids: [POSITIVE_REFERENCE_ID],
      },
    );
    expect(readObject).toHaveBeenNthCalledWith(1, {
      bucketId: "recipe-images",
      maxBytes: 5 * 1024 * 1024,
      objectPath: SOURCE_PATH,
    });
    expect(readObject).toHaveBeenNthCalledWith(2, {
      bucketId: "recipe-images-private",
      maxBytes: 5 * 1024 * 1024,
      objectPath: TARGET_PATH,
    });
    expect(uploadObject).toHaveBeenCalledWith({
      body: expect.any(Blob),
      bucketId: "recipe-images-private",
      contentType: "image/png",
      objectPath: TARGET_PATH,
      upsert: false,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "finalize_recipe_image_legacy_visibility_target",
      {
        p_actual_mime_type: "image/png",
        p_byte_size: PNG_1X1.length,
        p_expected_capability_revision: 2,
        p_migration_run_id: MIGRATION_RUN_ID,
        p_now: NOW,
        p_raw_sha256: createHash("sha256").update(PNG_1X1).digest("hex"),
        p_target_object_id: TARGET_OBJECT_ID,
      },
    );
  });

  it("verifies and finalizes an already copied target without uploading again", async () => {
    const readObject = vi.fn(async () => ({
      body: blob(),
      kind: "found" as const,
    }));
    const { run, uploadObject } = runWith({ readObject });

    await expect(run()).resolves.toEqual(
      expect.objectContaining({ finalizedCount: 1, failedCount: 0 }),
    );
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("adds the verified MIME to a stream-downloaded source before upload", async () => {
    let targetReadCount = 0;
    const readObject = vi.fn(async ({ objectPath }) => {
      if (objectPath === SOURCE_PATH) {
        return { body: blob(PNG_1X1, ""), kind: "found" as const };
      }
      targetReadCount += 1;
      return targetReadCount === 1
        ? { kind: "absent" as const }
        : { body: blob(PNG_1X1, ""), kind: "found" as const };
    });
    const uploadObject = vi.fn(async ({ body }: { body: Blob }) => (
      body.type === "image/png"
        ? { kind: "uploaded" as const }
        : { kind: "failed" as const }
    ));
    const { run } = runWith({ readObject, uploadObject });

    await expect(run()).resolves.toEqual(
      expect.objectContaining({ finalizedCount: 1, failedCount: 0 }),
    );
    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ type: "image/png" }),
      }),
    );
  });

  it("accepts a matching target created by a concurrent retry after upload reports failure", async () => {
    let targetReadCount = 0;
    const readObject = vi.fn(async ({ objectPath }) => {
      if (objectPath === SOURCE_PATH) {
        return { body: blob(), kind: "found" as const };
      }
      targetReadCount += 1;
      return targetReadCount === 1
        ? { kind: "absent" as const }
        : { body: blob(), kind: "found" as const };
    });
    const uploadObject = vi.fn(async () => ({ kind: "failed" as const }));
    const { run } = runWith({ readObject, uploadObject });

    await expect(run()).resolves.toEqual(
      expect.objectContaining({ finalizedCount: 1, failedCount: 0 }),
    );
  });

  it("never finalizes when copied bytes differ from the legacy source", async () => {
    const mismatched = new Blob(
      [new Uint8Array([...PNG_1X1, 0])],
      { type: "image/png" },
    );
    const readObject = vi.fn(async ({ objectPath }) => (
      objectPath === SOURCE_PATH
        ? { body: blob(), kind: "found" as const }
        : { body: mismatched, kind: "found" as const }
    ));
    const { rpc, run } = runWith({ readObject });

    await expect(run()).resolves.toEqual({
      failedCount: 1,
      failures: [{
        reason: "target_verification_failed",
        targetObjectId: TARGET_OBJECT_ID,
      }],
      finalizedCount: 0,
      plannedCount: 1,
      replayedCount: 0,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("leaves an uploaded target in place for retry when DB finalization fails", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "prepare_recipe_image_legacy_visibility_migration") {
        return { data: [target()], error: null };
      }
      return { data: null, error: { message: "finalize unavailable" } };
    });
    const { run, uploadObject } = runWith({ rpc });

    await expect(run()).resolves.toEqual({
      failedCount: 1,
      failures: [{
        reason: "finalize_failed",
        targetObjectId: TARGET_OBJECT_ID,
      }],
      finalizedCount: 0,
      plannedCount: 1,
      replayedCount: 0,
    });
    expect(uploadObject).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed plan rows before touching Storage", async () => {
    const { readObject, run, uploadObject } = runWith({
      plan: [target({ target_object_path: `shared/${TARGET_OBJECT_ID}.png` })],
    });

    await expect(run()).resolves.toEqual({
      kind: "failed",
      reason: "invalid_prepare_result",
    });
    expect(readObject).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
  });
});
