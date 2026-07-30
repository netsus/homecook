import { createHash } from "node:crypto";

import type { AccountGenerationSessionAuthority } from "./account-generation/session-authority";
import {
  getRecipeImageExtension,
  RECIPE_IMAGE_MAX_BYTES,
  type RecipeImageMimeType,
} from "./recipe-media";
import {
  normalizeExpectedRecipeImageStorageOrigin,
} from "./recipe-image-read";

const PRIVATE_RECIPE_IMAGE_BUCKET = "recipe-images-private";
const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const READABLE_STATES = new Set([
  "uploaded_unlinked",
  "attached_private",
]);

export const RECIPE_IMAGE_UPLOAD_DEADLINE_MS = 120_000;

interface RpcError {
  message: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

export type ManagedRecipeImageReservationRejectionCode =
  | "IDEMPOTENCY_KEY_REUSED"
  | "ACCOUNT_GENERATION_STALE"
  | "ACCOUNT_SESSION_STALE"
  | "IMAGE_UPLOAD_CONFLICT"
  | "IMAGE_EXPIRED";

export interface ManagedRecipeImageRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
}

export interface ManagedRecipeImageInspection {
  actualMimeType: RecipeImageMimeType;
  byteSize: number;
  extension: "jpg" | "png" | "webp";
  rawSha256: string;
}

interface UploadObjectInput {
  body: Blob;
  bucketId: string;
  contentType: RecipeImageMimeType;
  objectPath: string;
  upsert: false;
}

interface ReadUrlInput {
  bucketId: string;
  objectPath: string;
}

interface ReadUrlResult {
  expiresAt: string;
  readUrl: string;
}

type TakeoverObjectReadResult =
  | { kind: "absent" }
  | { kind: "found"; body: Blob }
  | { kind: "oversized" }
  | { kind: "failed" };

export type ManagedRecipeImageUploadResult =
  | {
    kind: "succeeded";
    objectId: string;
    readUrl: string;
    readUrlExpiresAt: string;
    state: string;
  }
  | { kind: "live_replay"; retryAfterSeconds: number }
  | { kind: "limited"; retryAfterSeconds: number }
  | { kind: "conflict" }
  | {
    kind: "rejected";
    code: ManagedRecipeImageReservationRejectionCode;
  }
  | {
    kind: "terminal";
    objectId: string;
    state: string;
    terminalResult: string;
  }
  | {
    kind: "failed";
    reason:
      | "invalid_input"
      | "reservation_failed"
      | "invalid_reservation"
      | "storage_upload_failed"
      | "storage_upload_timeout"
      | "takeover_verification_failed"
      | "storage_finalize_failed"
      | "storage_compensation_failed"
      | "read_url_failed";
  };

interface ManagedRecipeImageUploadInput {
  body: Blob;
  dbClient: ManagedRecipeImageRpcClient;
  expectedReadUrlOrigin: string;
  idempotencyKey: string;
  inspection: ManagedRecipeImageInspection;
  issueReadUrl(input: ReadUrlInput): Promise<ReadUrlResult>;
  maxReadUrlTtlMs: number;
  now?: () => Date;
  readTakeoverObject(input: {
    bucketId: string;
    maxBytes: number;
    objectPath: string;
  }): Promise<TakeoverObjectReadResult>;
  sessionAuthority: AccountGenerationSessionAuthority;
  uploadObject(input: UploadObjectInput): Promise<void>;
}

interface ReservedAttempt {
  accountGeneration: number;
  attemptToken: string;
  bucketId: string;
  cleanupGeneration: number;
  objectId: string;
  objectPath: string;
}

interface DurableSuccess {
  bucketId: string;
  objectId: string;
  objectPath: string;
  state: string;
}

type ParsedReservation =
  | { kind: "reserved"; value: ReservedAttempt }
  | { kind: "takeover"; value: ReservedAttempt }
  | { kind: "succeeded"; value: DurableSuccess }
  | { kind: "live_replay"; retryAfterSeconds: number }
  | { kind: "limited"; retryAfterSeconds: number }
  | {
    kind: "terminal";
    objectId: string;
    state: string;
    terminalResult: string;
  };

class UploadDeadlineError extends Error {}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function reservationRejectionCode(
  error: RpcError,
): ManagedRecipeImageReservationRejectionCode | null {
  switch (error.message) {
    case "IDEMPOTENCY_KEY_REUSED":
    case "ACCOUNT_GENERATION_STALE":
    case "ACCOUNT_SESSION_STALE":
    case "IMAGE_UPLOAD_CONFLICT":
    case "IMAGE_EXPIRED":
      return error.message;
    default:
      return null;
  }
}

function expectedObjectPath(
  ownerUuid: string,
  accountGeneration: number,
  objectId: string,
  extension: ManagedRecipeImageInspection["extension"],
) {
  return `${ownerUuid}/${accountGeneration}/${objectId}.${extension}`;
}

function parseObjectIdentity(
  value: Record<string, unknown>,
  ownerUuid: string,
  extension: ManagedRecipeImageInspection["extension"],
) {
  const objectId = nonEmptyString(value, "object_id");
  const accountGeneration = positiveInteger(value.account_generation);
  const cleanupGeneration = nonNegativeInteger(value.cleanup_generation);
  const bucketId = nonEmptyString(value, "bucket_id");
  const objectPath = nonEmptyString(value, "object_path");
  if (
    !objectId
    || !UUID_PATTERN.test(objectId)
    || accountGeneration === null
    || cleanupGeneration === null
    || bucketId !== PRIVATE_RECIPE_IMAGE_BUCKET
    || objectPath !== expectedObjectPath(
      ownerUuid,
      accountGeneration,
      objectId,
      extension,
    )
  ) {
    return null;
  }

  return {
    accountGeneration,
    bucketId,
    cleanupGeneration,
    objectId,
    objectPath,
  };
}

function parseReservation(
  value: unknown,
  ownerUuid: string,
  extension: ManagedRecipeImageInspection["extension"],
): ParsedReservation | null {
  const candidate = record(value);
  if (!candidate) {
    return null;
  }

  if (candidate.outcome === "limited") {
    const retryAfterSeconds = positiveInteger(candidate.retry_after_seconds);
    return retryAfterSeconds === null
      ? null
      : { kind: "limited", retryAfterSeconds };
  }

  const identity = parseObjectIdentity(candidate, ownerUuid, extension);
  if (!identity) {
    return null;
  }

  if (candidate.outcome === "live_replay") {
    const retryAfterSeconds = positiveInteger(candidate.retry_after_seconds);
    const attemptToken = nonEmptyString(candidate, "attempt_token");
    return retryAfterSeconds === null
      || !attemptToken
      || !UUID_PATTERN.test(attemptToken)
      || candidate.state !== "pending_upload"
      ? null
      : { kind: "live_replay", retryAfterSeconds };
  }

  if (candidate.outcome === "reserved" || candidate.outcome === "takeover") {
    const attemptToken = nonEmptyString(candidate, "attempt_token");
    return !attemptToken
      || !UUID_PATTERN.test(attemptToken)
      || candidate.state !== "pending_upload"
      ? null
      : {
        kind: candidate.outcome,
        value: {
          ...identity,
          attemptToken,
        },
      };
  }

  const state = nonEmptyString(candidate, "state");
  if (candidate.outcome === "succeeded") {
    return !state || !READABLE_STATES.has(state)
      ? null
      : {
        kind: "succeeded",
        value: {
          bucketId: identity.bucketId,
          objectId: identity.objectId,
          objectPath: identity.objectPath,
          state,
        },
      };
  }

  if (candidate.outcome === "terminal") {
    const terminalResult = nonEmptyString(candidate, "terminal_result");
    return !state || !terminalResult
      ? null
      : {
        kind: "terminal",
        objectId: identity.objectId,
        state,
        terminalResult,
      };
  }

  return null;
}

function canonicalPayloadHash(inspection: ManagedRecipeImageInspection) {
  return createHash("sha256")
    .update(JSON.stringify({
      actual_mime_type: inspection.actualMimeType,
      byte_size: inspection.byteSize,
      extension: inspection.extension,
      raw_sha256: inspection.rawSha256,
    }))
    .digest("hex");
}

function validInput(input: ManagedRecipeImageUploadInput) {
  const { inspection, sessionAuthority } = input;
  try {
    normalizeExpectedRecipeImageStorageOrigin(input.expectedReadUrlOrigin);
  } catch {
    return false;
  }

  return UUID_PATTERN.test(input.idempotencyKey)
    && UUID_PATTERN.test(sessionAuthority.ownerUuid)
    && Number.isFinite(Date.parse(sessionAuthority.authIdentityCreatedAt))
    && SHA256_PATTERN.test(sessionAuthority.sessionKeyHash)
    && Number.isSafeInteger(sessionAuthority.hmacKeyVersion)
    && sessionAuthority.hmacKeyVersion > 0
    && SHA256_PATTERN.test(inspection.rawSha256)
    && Number.isSafeInteger(inspection.byteSize)
    && inspection.byteSize > 0
    && inspection.byteSize <= RECIPE_IMAGE_MAX_BYTES
    && getRecipeImageExtension(inspection.actualMimeType)
      === inspection.extension
    && input.body.size === inspection.byteSize
    && input.body.type === inspection.actualMimeType
    && Number.isSafeInteger(input.maxReadUrlTtlMs)
    && input.maxReadUrlTtlMs > 0;
}

async function callRpc(
  client: ManagedRecipeImageRpcClient,
  name: string,
  params: Record<string, unknown>,
): Promise<RpcResult | null> {
  try {
    return await client.rpc(name, params);
  } catch {
    return null;
  }
}

async function uploadBeforeDeadline(
  upload: () => Promise<void>,
): Promise<"succeeded" | "failed" | "timeout"> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      upload(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new UploadDeadlineError());
        }, RECIPE_IMAGE_UPLOAD_DEADLINE_MS);
      }),
    ]);
    return "succeeded";
  } catch (error) {
    return error instanceof UploadDeadlineError ? "timeout" : "failed";
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function compensate(
  input: ManagedRecipeImageUploadInput,
  attempt: ReservedAttempt,
  reason:
    | "storage_upload_failed"
    | "storage_upload_timeout"
    | "storage_finalize_failed",
  now: () => Date,
) {
  const result = await callRpc(
    input.dbClient,
    "compensate_recipe_image_upload",
    {
      p_account_generation: attempt.accountGeneration,
      p_attempt_token: attempt.attemptToken,
      p_cleanup_generation: attempt.cleanupGeneration,
      p_idempotency_key: input.idempotencyKey,
      p_image_object_id: attempt.objectId,
      p_now: now().toISOString(),
      p_owner_uuid: input.sessionAuthority.ownerUuid,
      p_reason: reason,
    },
  );
  const data = record(result?.data);
  const outboxId = data ? nonEmptyString(data, "outbox_id") : null;
  return Boolean(
    result
    && !result.error
    && outboxId
    && UUID_PATTERN.test(outboxId)
    && data?.outcome === "cleanup_pending"
    && data.object_id === attempt.objectId
    && data.account_generation === attempt.accountGeneration
    && data.cleanup_generation === attempt.cleanupGeneration + 1
    && data.state === "cleanup_pending",
  );
}

async function issueValidatedReadUrl(
  input: ManagedRecipeImageUploadInput,
  value: DurableSuccess,
  now: () => Date,
) {
  try {
    const result = await input.issueReadUrl({
      bucketId: value.bucketId,
      objectPath: value.objectPath,
    });
    const url = new URL(result.readUrl);
    const expectedUrl = new URL(input.expectedReadUrlOrigin);
    const expiresAt = Date.parse(result.expiresAt);
    const nowMs = now().getTime();
    const expectedPath
      = `/storage/v1/object/sign/${value.bucketId}/${value.objectPath}`;
    return url.protocol === expectedUrl.protocol
      && url.origin === input.expectedReadUrlOrigin
      && decodeURIComponent(url.pathname) === expectedPath
      && Boolean(url.searchParams.get("token"))
      && Number.isFinite(expiresAt)
      && expiresAt > nowMs
      && expiresAt <= nowMs + input.maxReadUrlTtlMs
      ? result
      : null;
  } catch {
    return null;
  }
}

async function verifyTakeoverObject(
  input: ManagedRecipeImageUploadInput,
  attempt: ReservedAttempt,
): Promise<"absent" | "match" | "mismatch" | "failed"> {
  try {
    const result = await input.readTakeoverObject({
      bucketId: attempt.bucketId,
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath: attempt.objectPath,
    });
    if (result.kind === "absent") {
      return "absent";
    }
    if (
      result.kind !== "found"
      || !(result.body instanceof Blob)
      || result.body.size > RECIPE_IMAGE_MAX_BYTES
      || result.body.size !== input.inspection.byteSize
    ) {
      return result.kind === "failed" ? "failed" : "mismatch";
    }

    const rawSha256 = createHash("sha256")
      .update(new Uint8Array(await result.body.arrayBuffer()))
      .digest("hex");
    return rawSha256 === input.inspection.rawSha256 ? "match" : "mismatch";
  } catch {
    return "failed";
  }
}

export async function runManagedRecipeImageUpload(
  input: ManagedRecipeImageUploadInput,
): Promise<ManagedRecipeImageUploadResult> {
  if (!validInput(input)) {
    return { kind: "failed", reason: "invalid_input" };
  }

  const now = input.now ?? (() => new Date());
  const reservationResult = await callRpc(
    input.dbClient,
    "reserve_recipe_image_upload",
    {
      p_actual_mime_type: input.inspection.actualMimeType,
      p_auth_identity_created_at_snapshot:
        input.sessionAuthority.authIdentityCreatedAt,
      p_byte_size: input.inspection.byteSize,
      p_extension: input.inspection.extension,
      p_hmac_key_version: input.sessionAuthority.hmacKeyVersion,
      p_idempotency_key: input.idempotencyKey,
      p_now: now().toISOString(),
      p_owner_uuid: input.sessionAuthority.ownerUuid,
      p_payload_hash: canonicalPayloadHash(input.inspection),
      p_raw_sha256: input.inspection.rawSha256,
      p_session_key_hash: input.sessionAuthority.sessionKeyHash,
    },
  );
  if (!reservationResult) {
    return { kind: "failed", reason: "reservation_failed" };
  }
  if (reservationResult.error) {
    const code = reservationRejectionCode(reservationResult.error);
    return code
      ? { code, kind: "rejected" }
      : { kind: "failed", reason: "reservation_failed" };
  }

  const reservation = parseReservation(
    reservationResult.data,
    input.sessionAuthority.ownerUuid,
    input.inspection.extension,
  );
  if (!reservation) {
    return { kind: "failed", reason: "invalid_reservation" };
  }

  if (reservation.kind === "limited" || reservation.kind === "live_replay") {
    return reservation;
  }
  if (reservation.kind === "terminal") {
    return reservation;
  }
  if (reservation.kind === "succeeded") {
    const readUrl = await issueValidatedReadUrl(input, reservation.value, now);
    return readUrl
      ? {
        kind: "succeeded",
        objectId: reservation.value.objectId,
        readUrl: readUrl.readUrl,
        readUrlExpiresAt: readUrl.expiresAt,
        state: reservation.value.state,
      }
      : { kind: "failed", reason: "read_url_failed" };
  }

  const attempt = reservation.value;
  let uploadOutcome: "succeeded" | "failed" | "timeout" = "succeeded";
  if (reservation.kind === "takeover") {
    const takeover = await verifyTakeoverObject(input, attempt);
    if (takeover === "failed") {
      return { kind: "failed", reason: "takeover_verification_failed" };
    }
    if (takeover === "mismatch") {
      const compensated = await compensate(
        input,
        attempt,
        "storage_upload_failed",
        now,
      );
      return compensated
        ? { kind: "conflict" }
        : { kind: "failed", reason: "storage_compensation_failed" };
    }
    if (takeover === "absent") {
      uploadOutcome = await uploadBeforeDeadline(() => input.uploadObject({
        body: input.body,
        bucketId: attempt.bucketId,
        contentType: input.inspection.actualMimeType,
        objectPath: attempt.objectPath,
        upsert: false,
      }));
    }
  } else {
    uploadOutcome = await uploadBeforeDeadline(() => input.uploadObject({
      body: input.body,
      bucketId: attempt.bucketId,
      contentType: input.inspection.actualMimeType,
      objectPath: attempt.objectPath,
      upsert: false,
    }));
  }
  if (uploadOutcome !== "succeeded") {
    const reason = uploadOutcome === "timeout"
      ? "storage_upload_timeout"
      : "storage_upload_failed";
    const compensated = await compensate(input, attempt, reason, now);
    return compensated
      ? { kind: "failed", reason }
      : { kind: "failed", reason: "storage_compensation_failed" };
  }

  const finalizeResult = await callRpc(
    input.dbClient,
    "finalize_recipe_image_upload",
    {
      p_attempt_token: attempt.attemptToken,
      p_auth_identity_created_at_snapshot:
        input.sessionAuthority.authIdentityCreatedAt,
      p_cleanup_generation: attempt.cleanupGeneration,
      p_hmac_key_version: input.sessionAuthority.hmacKeyVersion,
      p_idempotency_key: input.idempotencyKey,
      p_now: now().toISOString(),
      p_owner_uuid: input.sessionAuthority.ownerUuid,
      p_session_key_hash: input.sessionAuthority.sessionKeyHash,
    },
  );
  const finalized = record(finalizeResult?.data);
  if (
    !finalizeResult
    || finalizeResult.error
    || finalized?.outcome !== "succeeded"
    || finalized.object_id !== attempt.objectId
    || finalized.state !== "uploaded_unlinked"
    || typeof finalized.unlinked_cleanup_after !== "string"
    || !Number.isFinite(Date.parse(finalized.unlinked_cleanup_after))
  ) {
    const compensated = await compensate(
      input,
      attempt,
      "storage_finalize_failed",
      now,
    );
    return compensated
      ? { kind: "failed", reason: "storage_finalize_failed" }
      : { kind: "failed", reason: "storage_compensation_failed" };
  }

  const readUrl = await issueValidatedReadUrl(input, {
    bucketId: attempt.bucketId,
    objectId: attempt.objectId,
    objectPath: attempt.objectPath,
    state: finalized.state,
  }, now);
  return readUrl
    ? {
      kind: "succeeded",
      objectId: attempt.objectId,
      readUrl: readUrl.readUrl,
      readUrlExpiresAt: readUrl.expiresAt,
      state: finalized.state,
    }
    : { kind: "failed", reason: "read_url_failed" };
}
