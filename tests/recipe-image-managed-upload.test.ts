import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  RECIPE_IMAGE_UPLOAD_DEADLINE_MS,
  runManagedRecipeImageUpload,
  type ManagedRecipeImageRpcClient,
} from "@/lib/server/recipe-image-managed-upload";
import { RECIPE_IMAGE_MAX_BYTES } from "@/lib/server/recipe-media";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY = "22222222-2222-4222-8222-222222222222";
const OBJECT_ID = "33333333-3333-4333-8333-333333333333";
const ATTEMPT_TOKEN = "44444444-4444-4444-8444-444444444444";
const OUTBOX_ID = "55555555-5555-4555-8555-555555555555";
const OBJECT_PATH = `${OWNER_UUID}/7/${OBJECT_ID}.png`;
const NOW = "2026-07-26T01:00:00.000Z";
const BODY_BYTES = new Uint8Array([1, 2, 3]);
const RAW_SHA256 = createHash("sha256").update(BODY_BYTES).digest("hex");
const READ_URL
  = `https://storage.invalid/storage/v1/object/sign/recipe-images-private/${OBJECT_PATH}?token=signed`;

const sessionAuthority = {
  authIdentityCreatedAt: "2026-07-01T00:00:00.000Z",
  hmacKeyVersion: 1,
  ownerUuid: OWNER_UUID,
  sessionKeyHash: "b".repeat(64),
};

const inspection = {
  actualMimeType: "image/png" as const,
  byteSize: 3,
  extension: "png" as const,
  rawSha256: RAW_SHA256,
};

const reserved = {
  account_generation: 7,
  attempt_token: ATTEMPT_TOKEN,
  bucket_id: "recipe-images-private",
  cleanup_generation: 0,
  object_id: OBJECT_ID,
  object_path: OBJECT_PATH,
  outcome: "reserved",
  state: "pending_upload",
};

const finalized = {
  object_id: OBJECT_ID,
  outcome: "succeeded",
  state: "uploaded_unlinked",
  unlinked_cleanup_after: "2026-07-27T01:00:00.000Z",
};

function rpcClient(
  handler: (
    name: string,
    params: Record<string, unknown>,
  ) => { data: unknown; error: { message: string } | null },
) {
  return {
    rpc: vi.fn(async (
      name: string,
      params: Record<string, unknown>,
    ) => handler(name, params)),
  } satisfies ManagedRecipeImageRpcClient;
}

function setup(
  client: ManagedRecipeImageRpcClient,
  overrides: Partial<Parameters<typeof runManagedRecipeImageUpload>[0]> = {},
) {
  return {
    body: new Blob([BODY_BYTES], { type: "image/png" }),
    dbClient: client,
    expectedReadUrlOrigin: "https://storage.invalid",
    idempotencyKey: IDEMPOTENCY_KEY,
    inspection,
    issueReadUrl: vi.fn(async () => ({
      expiresAt: "2026-07-26T01:05:00.000Z",
      readUrl: READ_URL,
    })),
    maxReadUrlTtlMs: 5 * 60 * 1_000,
    now: () => new Date(NOW),
    readTakeoverObject: vi.fn(async () => ({ kind: "absent" as const })),
    sessionAuthority,
    uploadObject: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("managed recipe image upload orchestration", () => {
  it.each([
    "IDEMPOTENCY_KEY_REUSED",
    "ACCOUNT_GENERATION_STALE",
    "ACCOUNT_SESSION_STALE",
    "IMAGE_UPLOAD_CONFLICT",
    "IMAGE_EXPIRED",
  ] as const)("preserves the official reservation rejection %s", async (code) => {
    const dbClient = rpcClient((name) => {
      if (name === "reserve_recipe_image_upload") {
        return {
          data: null,
          error: { message: code },
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const input = setup(dbClient);

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      code,
      kind: "rejected",
    });
    expect(input.uploadObject).not.toHaveBeenCalled();
    expect(input.issueReadUrl).not.toHaveBeenCalled();
  });

  it("does not promote an unrecognized reservation error into a public code", async () => {
    const dbClient = rpcClient((name) => {
      if (name === "reserve_recipe_image_upload") {
        return {
          data: null,
          error: { message: "IDEMPOTENCY_KEY_REUSED with internal detail" },
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });

    await expect(runManagedRecipeImageUpload(setup(dbClient))).resolves.toEqual({
      kind: "failed",
      reason: "reservation_failed",
    });
  });

  it("reserves before an exact private PUT, finalizes, then issues a read URL", async () => {
    const calls: string[] = [];
    const dbClient = rpcClient((name) => {
      calls.push(name);
      if (name === "reserve_recipe_image_upload") {
        return { data: reserved, error: null };
      }
      if (name === "finalize_recipe_image_upload") {
        return { data: finalized, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const input = setup(dbClient, {
      issueReadUrl: vi.fn(async (value) => {
        calls.push("issue_read_url");
        expect(value).toEqual({
          bucketId: "recipe-images-private",
          objectPath: OBJECT_PATH,
        });
        return {
          expiresAt: "2026-07-26T01:05:00.000Z",
          readUrl: READ_URL,
        };
      }),
      uploadObject: vi.fn(async (value) => {
        calls.push("upload_object");
        expect(value).toMatchObject({
          bucketId: "recipe-images-private",
          contentType: "image/png",
          objectPath: OBJECT_PATH,
          upsert: false,
        });
        expect(value.body).toBe(input.body);
      }),
    });

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      kind: "succeeded",
      objectId: OBJECT_ID,
      readUrl: READ_URL,
      readUrlExpiresAt: "2026-07-26T01:05:00.000Z",
      state: "uploaded_unlinked",
    });
    expect(calls).toEqual([
      "reserve_recipe_image_upload",
      "upload_object",
      "finalize_recipe_image_upload",
      "issue_read_url",
    ]);
    expect(dbClient.rpc).toHaveBeenNthCalledWith(
      1,
      "reserve_recipe_image_upload",
      {
        p_actual_mime_type: "image/png",
        p_auth_identity_created_at_snapshot:
          sessionAuthority.authIdentityCreatedAt,
        p_byte_size: 3,
        p_extension: "png",
        p_hmac_key_version: 1,
        p_idempotency_key: IDEMPOTENCY_KEY,
        p_now: NOW,
        p_owner_uuid: OWNER_UUID,
        p_payload_hash: createHash("sha256")
          .update(JSON.stringify({
            actual_mime_type: "image/png",
            byte_size: 3,
            extension: "png",
            raw_sha256: RAW_SHA256,
          }))
          .digest("hex"),
        p_raw_sha256: RAW_SHA256,
        p_session_key_hash: sessionAuthority.sessionKeyHash,
      },
    );
    expect(dbClient.rpc).toHaveBeenNthCalledWith(
      2,
      "finalize_recipe_image_upload",
      {
        p_attempt_token: ATTEMPT_TOKEN,
        p_auth_identity_created_at_snapshot:
          sessionAuthority.authIdentityCreatedAt,
        p_cleanup_generation: 0,
        p_hmac_key_version: 1,
        p_idempotency_key: IDEMPOTENCY_KEY,
        p_now: NOW,
        p_owner_uuid: OWNER_UUID,
        p_session_key_hash: sessionAuthority.sessionKeyHash,
      },
    );
  });

  it("reissues a fresh URL for a durable success replay without PUT or finalize", async () => {
    const dbClient = rpcClient(() => ({
      data: {
        ...reserved,
        attempt_token: undefined,
        outcome: "succeeded",
        state: "uploaded_unlinked",
      },
      error: null,
    }));
    const input = setup(dbClient);

    await expect(runManagedRecipeImageUpload(input)).resolves.toMatchObject({
      kind: "succeeded",
      objectId: OBJECT_ID,
      state: "uploaded_unlinked",
    });
    expect(input.uploadObject).not.toHaveBeenCalled();
    expect(input.issueReadUrl).toHaveBeenCalledOnce();
    expect(dbClient.rpc).toHaveBeenCalledOnce();
  });

  it.each([
    {
      expected: { kind: "live_replay", retryAfterSeconds: 23 },
      reservation: {
        ...reserved,
        outcome: "live_replay",
        retry_after_seconds: 23,
      },
    },
    {
      expected: { kind: "limited", retryAfterSeconds: 60 },
      reservation: {
        outcome: "limited",
        retry_after_seconds: 60,
      },
    },
  ])("returns $expected.kind without an external write", async ({
    expected,
    reservation,
  }) => {
    const dbClient = rpcClient(() => ({ data: reservation, error: null }));
    const input = setup(dbClient);

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual(expected);
    expect(input.uploadObject).not.toHaveBeenCalled();
    expect(input.issueReadUrl).not.toHaveBeenCalled();
    expect(dbClient.rpc).toHaveBeenCalledOnce();
  });

  it("uploads to the same path when takeover confirms the object is absent", async () => {
    const dbClient = rpcClient((name) => {
      if (name === "reserve_recipe_image_upload") {
        return {
          data: { ...reserved, outcome: "takeover" },
          error: null,
        };
      }
      if (name === "finalize_recipe_image_upload") {
        return { data: finalized, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const input = setup(dbClient);

    await expect(runManagedRecipeImageUpload(input)).resolves.toMatchObject({
      kind: "succeeded",
      objectId: OBJECT_ID,
    });
    expect(input.readTakeoverObject).toHaveBeenCalledWith({
      bucketId: "recipe-images-private",
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath: OBJECT_PATH,
    });
    expect(input.uploadObject).toHaveBeenCalledOnce();
  });

  it("rehashes matching takeover bytes and finalizes without overwriting", async () => {
    const dbClient = rpcClient((name) => {
      if (name === "reserve_recipe_image_upload") {
        return {
          data: { ...reserved, outcome: "takeover" },
          error: null,
        };
      }
      if (name === "finalize_recipe_image_upload") {
        return { data: finalized, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const input = setup(dbClient, {
      readTakeoverObject: vi.fn(async () => ({
        body: new Blob([BODY_BYTES]),
        kind: "found" as const,
      })),
    });

    await expect(runManagedRecipeImageUpload(input)).resolves.toMatchObject({
      kind: "succeeded",
      objectId: OBJECT_ID,
    });
    expect(input.uploadObject).not.toHaveBeenCalled();
    expect(dbClient.rpc).toHaveBeenCalledTimes(2);
  });

  it("fails as conflict and compensates mismatched takeover bytes", async () => {
    const dbClient = rpcClient((name, params) => {
      if (name === "reserve_recipe_image_upload") {
        return {
          data: { ...reserved, outcome: "takeover" },
          error: null,
        };
      }
      if (name === "compensate_recipe_image_upload") {
        expect(params.p_reason).toBe("storage_upload_failed");
        return {
          data: {
            account_generation: 7,
            cleanup_generation: 1,
            object_id: OBJECT_ID,
            outbox_id: OUTBOX_ID,
            outcome: "cleanup_pending",
            state: "cleanup_pending",
          },
          error: null,
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const input = setup(dbClient, {
      readTakeoverObject: vi.fn(async () => ({
        body: new Blob([new Uint8Array([1, 2, 4])]),
        kind: "found" as const,
      })),
    });

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      kind: "conflict",
    });
    expect(input.uploadObject).not.toHaveBeenCalled();
    expect(input.issueReadUrl).not.toHaveBeenCalled();
  });

  it("treats oversized takeover metadata as a compensated conflict", async () => {
    const dbClient = rpcClient((name) => {
      if (name === "reserve_recipe_image_upload") {
        return {
          data: { ...reserved, outcome: "takeover" },
          error: null,
        };
      }
      if (name === "compensate_recipe_image_upload") {
        return {
          data: {
            account_generation: 7,
            cleanup_generation: 1,
            object_id: OBJECT_ID,
            outbox_id: OUTBOX_ID,
            outcome: "cleanup_pending",
            state: "cleanup_pending",
          },
          error: null,
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const input = setup(dbClient, {
      readTakeoverObject: vi.fn(async () => ({
        kind: "oversized" as const,
      })),
    });

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      kind: "conflict",
    });
    expect(input.uploadObject).not.toHaveBeenCalled();
  });

  it("fails closed on an invalid reservation response", async () => {
    const dbClient = rpcClient(() => ({
      data: {
        ...reserved,
        bucket_id: "public-recipe-images",
      },
      error: null,
    }));
    const input = setup(dbClient);

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      kind: "failed",
      reason: "invalid_reservation",
    });
    expect(input.uploadObject).not.toHaveBeenCalled();
  });

  it("compensates the exact attempt when Storage PUT fails", async () => {
    const dbClient = rpcClient((name, params) => {
      if (name === "reserve_recipe_image_upload") {
        return { data: reserved, error: null };
      }
      if (name === "compensate_recipe_image_upload") {
        expect(params).toMatchObject({
          p_account_generation: 7,
          p_attempt_token: ATTEMPT_TOKEN,
          p_cleanup_generation: 0,
          p_idempotency_key: IDEMPOTENCY_KEY,
          p_image_object_id: OBJECT_ID,
          p_owner_uuid: OWNER_UUID,
          p_reason: "storage_upload_failed",
        });
        return {
          data: {
            account_generation: 7,
            cleanup_generation: 1,
            object_id: OBJECT_ID,
            outbox_id: OUTBOX_ID,
            outcome: "cleanup_pending",
            state: "cleanup_pending",
          },
          error: null,
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const input = setup(dbClient, {
      uploadObject: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
    });

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      kind: "failed",
      reason: "storage_upload_failed",
    });
    expect(dbClient.rpc).toHaveBeenCalledTimes(2);
  });

  it("enforces the 120-second PUT deadline and compensates as timeout", async () => {
    vi.useFakeTimers();
    try {
      const dbClient = rpcClient((name, params) => {
        if (name === "reserve_recipe_image_upload") {
          return { data: reserved, error: null };
        }
        if (name === "compensate_recipe_image_upload") {
          expect(params.p_reason).toBe("storage_upload_timeout");
          return {
            data: {
              account_generation: 7,
              cleanup_generation: 1,
              object_id: OBJECT_ID,
              outbox_id: OUTBOX_ID,
              outcome: "cleanup_pending",
              state: "cleanup_pending",
            },
            error: null,
          };
        }
        throw new Error(`unexpected RPC: ${name}`);
      });
      const input = setup(dbClient, {
        uploadObject: vi.fn(() => new Promise<void>(() => undefined)),
      });
      const result = runManagedRecipeImageUpload(input);

      await vi.advanceTimersByTimeAsync(RECIPE_IMAGE_UPLOAD_DEADLINE_MS);

      await expect(result).resolves.toEqual({
        kind: "failed",
        reason: "storage_upload_timeout",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("compensates when finalize fails and never issues a URL", async () => {
    const dbClient = rpcClient((name, params) => {
      if (name === "reserve_recipe_image_upload") {
        return { data: reserved, error: null };
      }
      if (name === "finalize_recipe_image_upload") {
        return { data: null, error: { message: "finalize failed" } };
      }
      if (name === "compensate_recipe_image_upload") {
        expect(params.p_reason).toBe("storage_finalize_failed");
        return {
          data: {
            account_generation: 7,
            cleanup_generation: 1,
            object_id: OBJECT_ID,
            outbox_id: OUTBOX_ID,
            outcome: "cleanup_pending",
            state: "cleanup_pending",
          },
          error: null,
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const input = setup(dbClient);

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      kind: "failed",
      reason: "storage_finalize_failed",
    });
    expect(input.issueReadUrl).not.toHaveBeenCalled();
    expect(dbClient.rpc).toHaveBeenCalledTimes(3);
  });

  it.each([
    "IMAGE_EXPIRED",
    "ACCOUNT_SESSION_STALE",
  ])("never issues a URL when a lifecycle winner rejects finalize with %s", async (
    finalizeError,
  ) => {
    const dbClient = rpcClient((name, params) => {
      if (name === "reserve_recipe_image_upload") {
        return { data: reserved, error: null };
      }
      if (name === "finalize_recipe_image_upload") {
        return { data: null, error: { message: finalizeError } };
      }
      if (name === "compensate_recipe_image_upload") {
        expect(params.p_reason).toBe("storage_finalize_failed");
        return {
          data: {
            account_generation: 7,
            cleanup_generation: 1,
            object_id: OBJECT_ID,
            outbox_id: OUTBOX_ID,
            outcome: "cleanup_pending",
            state: "cleanup_pending",
          },
          error: null,
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const input = setup(dbClient);

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      kind: "failed",
      reason: "storage_finalize_failed",
    });
    expect(input.issueReadUrl).not.toHaveBeenCalled();
    expect(dbClient.rpc).toHaveBeenCalledTimes(3);
  });

  it("reports compensation failure instead of hiding an orphan risk", async () => {
    const dbClient = rpcClient((name) => {
      if (name === "reserve_recipe_image_upload") {
        return { data: reserved, error: null };
      }
      if (name === "compensate_recipe_image_upload") {
        return { data: null, error: { message: "compensation failed" } };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const input = setup(dbClient, {
      uploadObject: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
    });

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      kind: "failed",
      reason: "storage_compensation_failed",
    });
  });

  it("does not roll back a finalized object when read URL issuance fails", async () => {
    const dbClient = rpcClient((name) => {
      if (name === "reserve_recipe_image_upload") {
        return { data: reserved, error: null };
      }
      if (name === "finalize_recipe_image_upload") {
        return { data: finalized, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const input = setup(dbClient, {
      issueReadUrl: vi.fn(async () => {
        throw new Error("signing unavailable");
      }),
    });

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      kind: "failed",
      reason: "read_url_failed",
    });
    expect(dbClient.rpc).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      expiresAt: "2026-07-26T01:05:00.000Z",
      readUrl:
        `https://evil.invalid/storage/v1/object/sign/recipe-images-private/${OBJECT_PATH}?token=signed`,
    },
    {
      expiresAt: "2026-07-26T01:05:00.000Z",
      readUrl:
        `http://storage.invalid/storage/v1/object/sign/recipe-images-private/${OBJECT_PATH}?token=signed`,
    },
    {
      expiresAt: "2026-07-26T01:05:00.000Z",
      readUrl:
        "https://storage.invalid/storage/v1/object/sign/recipe-images-private/wrong.png?token=signed",
    },
    {
      expiresAt: "2026-07-26T00:59:59.000Z",
      readUrl: READ_URL,
    },
    {
      expiresAt: "2026-07-26T01:05:01.000Z",
      readUrl: READ_URL,
    },
  ])("rejects an unsafe or out-of-policy signed URL: $readUrl", async ({
    expiresAt,
    readUrl,
  }) => {
    const dbClient = rpcClient(() => ({
      data: {
        ...reserved,
        attempt_token: undefined,
        outcome: "succeeded",
        state: "uploaded_unlinked",
      },
      error: null,
    }));
    const input = setup(dbClient, {
      issueReadUrl: vi.fn(async () => ({ expiresAt, readUrl })),
    });

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      kind: "failed",
      reason: "read_url_failed",
    });
    expect(input.uploadObject).not.toHaveBeenCalled();
  });

  it.each([
    {
      body: new Blob(
        [new Uint8Array(RECIPE_IMAGE_MAX_BYTES + 1)],
        { type: "image/png" },
      ),
      inspection: {
        ...inspection,
        byteSize: RECIPE_IMAGE_MAX_BYTES + 1,
      },
      label: "oversized body",
    },
    {
      body: new Blob([BODY_BYTES], { type: "image/png" }),
      inspection: {
        ...inspection,
        extension: "jpg" as const,
      },
      label: "MIME-extension mismatch",
    },
  ])("rejects $label before reservation", async ({ body, inspection }) => {
    const dbClient = rpcClient(() => {
      throw new Error("RPC must not run");
    });
    const input = setup(dbClient, { body, inspection });

    await expect(runManagedRecipeImageUpload(input)).resolves.toEqual({
      kind: "failed",
      reason: "invalid_input",
    });
    expect(dbClient.rpc).not.toHaveBeenCalled();
  });
});
