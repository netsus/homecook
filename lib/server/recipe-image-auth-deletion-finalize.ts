const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const RETRY_DELAY_MS = 300_000;
const TERMINAL_RESULTS = new Set([
  "deleted",
  "already_absent",
  "identity_replaced",
]);

export interface RecipeImageAuthDeletionFinalizeRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<unknown>;
}

interface FinalizeInput {
  accountGeneration: number;
  attempts: number;
  authIdentityCreatedAt: string;
  dbClient: RecipeImageAuthDeletionFinalizeRpcClient;
  error: string | null;
  leaseToken: string;
  now?: () => Date;
  outboxId: string;
  ownerUuid: string;
  terminalResult: "deleted" | "already_absent" | "identity_replaced" | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (
    typeof value !== "string"
    || !POSITIVE_INTEGER_PATTERN.test(value)
  ) {
    return null;
  }

  const parsed = BigInt(value);
  return parsed <= MAX_SAFE_INTEGER ? Number(parsed) : null;
}

function timestamp(value: unknown): {
  iso: string;
  milliseconds: number;
} | null {
  if (typeof value !== "string") {
    return null;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? { iso: new Date(milliseconds).toISOString(), milliseconds }
    : null;
}

function exactUuid(value: unknown, expected: string) {
  return typeof value === "string"
    && UUID_PATTERN.test(value)
    && value.toLowerCase() === expected.toLowerCase();
}

export async function finalizeRecipeImageAuthDeletionClaim({
  accountGeneration,
  attempts,
  authIdentityCreatedAt,
  dbClient,
  error,
  leaseToken,
  now = () => new Date(),
  outboxId,
  ownerUuid,
  terminalResult,
}: FinalizeInput) {
  const finalizeTime = now();
  const finalizeTimeMs = finalizeTime.getTime();
  const identityCreatedAt = timestamp(authIdentityCreatedAt);
  const hasTerminalResult = typeof terminalResult === "string"
    && TERMINAL_RESULTS.has(terminalResult);
  if (
    !UUID_PATTERN.test(outboxId)
    || !UUID_PATTERN.test(ownerUuid)
    || !Number.isSafeInteger(accountGeneration)
    || accountGeneration < 1
    || !identityCreatedAt
    || !Number.isFinite(finalizeTimeMs)
    || identityCreatedAt.milliseconds > finalizeTimeMs
    || !UUID_PATTERN.test(leaseToken)
    || !Number.isSafeInteger(attempts)
    || attempts < 1
    || (
      terminalResult !== null
      && !hasTerminalResult
    )
    || (
      terminalResult === null
      && (typeof error !== "string" || error.length === 0)
    )
    || (
      error !== null
      && typeof error !== "string"
    )
  ) {
    throw new Error("invalid recipe image Auth deletion finalize input");
  }

  let result: unknown;
  try {
    result = await dbClient.rpc(
      "finalize_recipe_image_auth_deletion_claim",
      {
        p_account_generation: accountGeneration,
        p_auth_identity_created_at_snapshot: identityCreatedAt.iso,
        p_error: error,
        p_expected_attempts: attempts,
        p_lease_token: leaseToken,
        p_now: finalizeTime.toISOString(),
        p_outbox_id: outboxId,
        p_owner_uuid: ownerUuid,
        p_terminal_result: terminalResult,
      },
    );
  } catch {
    throw new Error("recipe image Auth deletion finalize failed");
  }

  const resultRecord = record(result);
  const row = resultRecord ? record(resultRecord.data) : null;
  const returnedGeneration = row
    ? positiveInteger(row.account_generation)
    : null;
  const returnedAttempts = row ? positiveInteger(row.attempts) : null;
  const returnedIdentityCreatedAt = row
    ? timestamp(row.auth_identity_created_at_snapshot)
    : null;
  const deletedAt = row?.auth_identity_deleted_at === null
    ? null
    : timestamp(row?.auth_identity_deleted_at);
  const nextAttemptAt = row ? timestamp(row.next_attempt_at) : null;
  const terminalResultMatches = hasTerminalResult
    ? row?.state === "succeeded"
      && row.terminal_result === terminalResult
      && typeof row.auth_identity_deleted_at === "string"
      && deletedAt !== null
      && deletedAt.milliseconds === finalizeTimeMs
    : (row?.state === "failed" || row?.state === "dead_letter")
      && row.terminal_result === null
      && row.auth_identity_deleted_at === null
      && deletedAt === null
      && (
        row.state === "dead_letter"
        || nextAttemptAt?.milliseconds === finalizeTimeMs + RETRY_DELAY_MS
      );

  if (
    !resultRecord
    || resultRecord.error !== null
    || !row
    || !exactUuid(row.id, outboxId)
    || !exactUuid(row.owner_uuid, ownerUuid)
    || returnedGeneration !== accountGeneration
    || !returnedIdentityCreatedAt
    || returnedIdentityCreatedAt.milliseconds
      !== identityCreatedAt.milliseconds
    || returnedAttempts !== attempts
    || !nextAttemptAt
    || !terminalResultMatches
  ) {
    throw new Error("recipe image Auth deletion finalize failed");
  }

  return {
    accountGeneration: returnedGeneration,
    attempts: returnedAttempts,
    authIdentityCreatedAt: returnedIdentityCreatedAt.iso,
    authIdentityDeletedAt: deletedAt?.iso ?? null,
    nextAttemptAt: nextAttemptAt.iso,
    outboxId: row.id as string,
    ownerUuid: row.owner_uuid as string,
    state: row.state as "succeeded" | "failed" | "dead_letter",
    terminalResult: row.terminal_result as
      | "deleted"
      | "already_absent"
      | "identity_replaced"
      | null,
  };
}
