import {
  millisecondsToMicroseconds,
  parsePostgresTimestamp,
} from "@/lib/server/postgres-timestamp";

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const LEASE_DURATION_MS = 120_000;

export interface RecipeImageAuthDeletionClaimRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<unknown>;
}

interface ClaimInput {
  accountGeneration: number;
  dbClient: RecipeImageAuthDeletionClaimRpcClient;
  leaseToken: string;
  now?: () => Date;
  outboxId: string;
  ownerUuid: string;
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

function exactUuid(value: unknown, expected: string) {
  return typeof value === "string"
    && UUID_PATTERN.test(value)
    && value.toLowerCase() === expected.toLowerCase();
}

export async function claimRecipeImageAuthDeletionIfReady({
  accountGeneration,
  dbClient,
  leaseToken,
  now = () => new Date(),
  outboxId,
  ownerUuid,
}: ClaimInput) {
  const claimTime = now();
  const claimTimeMs = claimTime.getTime();
  if (
    !UUID_PATTERN.test(outboxId)
    || !UUID_PATTERN.test(ownerUuid)
    || !Number.isSafeInteger(accountGeneration)
    || accountGeneration < 1
    || !UUID_PATTERN.test(leaseToken)
    || !Number.isFinite(claimTimeMs)
  ) {
    throw new Error("invalid recipe image Auth deletion claim input");
  }

  let result: unknown;
  try {
    result = await dbClient.rpc(
      "claim_recipe_image_auth_deletion_if_ready",
      {
        p_account_generation: accountGeneration,
        p_lease_token: leaseToken,
        p_now: claimTime.toISOString(),
        p_outbox_id: outboxId,
        p_owner_uuid: ownerUuid,
      },
    );
  } catch {
    throw new Error("recipe image Auth deletion claim failed");
  }

  const resultRecord = record(result);
  const row = resultRecord ? record(resultRecord.data) : null;
  const returnedGeneration = row
    ? positiveInteger(row.account_generation)
    : null;
  const attempts = row ? positiveInteger(row.attempts) : null;
  const identityCreatedAt = row
    ? parsePostgresTimestamp(row.auth_identity_created_at_snapshot)
    : null;
  const leaseExpiresAt = row
    ? parsePostgresTimestamp(row.lease_expires_at)
    : null;

  if (
    !resultRecord
    || resultRecord.error !== null
    || !row
    || !exactUuid(row.id, outboxId)
    || !exactUuid(row.owner_uuid, ownerUuid)
    || returnedGeneration !== accountGeneration
    || !identityCreatedAt
    || identityCreatedAt.microseconds
      > millisecondsToMicroseconds(claimTimeMs)
    || row.state !== "processing"
    || attempts === null
    || !exactUuid(row.lease_token, leaseToken)
    || !leaseExpiresAt
    || leaseExpiresAt.microseconds !== millisecondsToMicroseconds(
      claimTimeMs + LEASE_DURATION_MS,
    )
  ) {
    throw new Error("recipe image Auth deletion claim failed");
  }

  return {
    accountGeneration: returnedGeneration,
    attempts,
    authIdentityCreatedAt: identityCreatedAt.iso,
    leaseExpiresAt: leaseExpiresAt.iso,
    leaseToken: row.lease_token as string,
    outboxId: row.id as string,
    ownerUuid: row.owner_uuid as string,
    state: "processing" as const,
  };
}
