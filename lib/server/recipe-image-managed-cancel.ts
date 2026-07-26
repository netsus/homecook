import type {
  AccountGenerationSessionAuthority,
} from "./account-generation/session-authority";

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

interface RpcError {
  message: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

export interface ManagedRecipeImageCancelRpcClient {
  rpc(
    name: "cancel_recipe_image_upload",
    params: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
}

export type ManagedRecipeImageCancelRejectionCode =
  | "ACCOUNT_CUTOVER_UNCLASSIFIED"
  | "ACCOUNT_CUTOVER_QUARANTINED"
  | "ACCOUNT_DELETING"
  | "IDEMPOTENCY_KEY_REUSED"
  | "ACCOUNT_GENERATION_STALE"
  | "ACCOUNT_SESSION_STALE"
  | "IMAGE_EXPIRED"
  | "IMAGE_NOT_FOUND";

export type ManagedRecipeImageCancelResult =
  | {
      kind: "succeeded";
      objectId: string;
      state: "cleanup_pending";
    }
  | {
      code: ManagedRecipeImageCancelRejectionCode;
      kind: "rejected";
    }
  | { kind: "failed" };

interface ManagedRecipeImageCancelInput {
  dbClient: ManagedRecipeImageCancelRpcClient;
  idempotencyKey: string;
  imageObjectId: string;
  sessionAuthority: AccountGenerationSessionAuthority;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function rejectionCode(
  error: RpcError,
): ManagedRecipeImageCancelRejectionCode | null {
  switch (error.message) {
    case "ACCOUNT_CUTOVER_UNCLASSIFIED":
    case "ACCOUNT_CUTOVER_QUARANTINED":
    case "ACCOUNT_DELETING":
    case "IDEMPOTENCY_KEY_REUSED":
    case "ACCOUNT_GENERATION_STALE":
    case "ACCOUNT_SESSION_STALE":
    case "IMAGE_EXPIRED":
    case "IMAGE_NOT_FOUND":
      return error.message;
    default:
      return null;
  }
}

function validInput(input: ManagedRecipeImageCancelInput) {
  return UUID_PATTERN.test(input.idempotencyKey)
    && UUID_PATTERN.test(input.imageObjectId)
    && UUID_PATTERN.test(input.sessionAuthority.ownerUuid)
    && Number.isFinite(
      Date.parse(input.sessionAuthority.authIdentityCreatedAt),
    )
    && SHA256_PATTERN.test(input.sessionAuthority.sessionKeyHash)
    && Number.isSafeInteger(input.sessionAuthority.hmacKeyVersion)
    && input.sessionAuthority.hmacKeyVersion > 0;
}

export async function runManagedRecipeImageCancel(
  input: ManagedRecipeImageCancelInput,
): Promise<ManagedRecipeImageCancelResult> {
  if (!validInput(input)) {
    return { kind: "failed" };
  }

  let result: RpcResult;
  try {
    result = await input.dbClient.rpc("cancel_recipe_image_upload", {
      p_auth_identity_created_at_snapshot:
        input.sessionAuthority.authIdentityCreatedAt,
      p_hmac_key_version: input.sessionAuthority.hmacKeyVersion,
      p_idempotency_key: input.idempotencyKey,
      p_image_object_id: input.imageObjectId,
      p_owner_uuid: input.sessionAuthority.ownerUuid,
      p_session_key_hash: input.sessionAuthority.sessionKeyHash,
    });
  } catch {
    return { kind: "failed" };
  }

  if (result.error) {
    const code = rejectionCode(result.error);
    return code ? { code, kind: "rejected" } : { kind: "failed" };
  }

  const data = record(result.data);
  if (
    !data
    || data.outcome !== "succeeded"
    || data.object_id !== input.imageObjectId
    || data.state !== "cleanup_pending"
    || !positiveInteger(data.account_generation)
    || !positiveInteger(data.cleanup_generation)
    || typeof data.outbox_id !== "string"
    || !UUID_PATTERN.test(data.outbox_id)
  ) {
    return { kind: "failed" };
  }

  return {
    kind: "succeeded",
    objectId: input.imageObjectId,
    state: "cleanup_pending",
  };
}
