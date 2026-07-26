import {
  millisecondsToMicroseconds,
  parsePostgresTimestamp,
} from "@/lib/server/postgres-timestamp";

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RecipeImageAuthConditionalDeleteInput {
  expectedAuthIdentityCreatedAt: string;
  ownerUuid: string;
}

export interface RecipeImageAuthDeletionProviderBarrier {
  deleteIfIdentityUnchanged(
    input: RecipeImageAuthConditionalDeleteInput,
  ): PromiseLike<unknown>;
}

interface ExecuteInput extends RecipeImageAuthConditionalDeleteInput {
  now?: () => Date;
  providerBarrier: RecipeImageAuthDeletionProviderBarrier;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactUuid(value: unknown, expected: string) {
  return typeof value === "string"
    && UUID_PATTERN.test(value)
    && value.toLowerCase() === expected.toLowerCase();
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
) {
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

export const unavailableRecipeImageAuthDeletionProviderBarrier
  : RecipeImageAuthDeletionProviderBarrier = Object.freeze({
    deleteIfIdentityUnchanged: () => Promise.resolve({
      status: "barrier_unavailable",
    }),
  });

export async function executeRecipeImageAuthConditionalDeletion({
  expectedAuthIdentityCreatedAt,
  now = () => new Date(),
  ownerUuid,
  providerBarrier,
}: ExecuteInput) {
  const executionTimeMs = now().getTime();
  const expectedIdentityCreatedAt = parsePostgresTimestamp(
    expectedAuthIdentityCreatedAt,
  );
  if (
    !UUID_PATTERN.test(ownerUuid)
    || !expectedIdentityCreatedAt
    || !Number.isFinite(executionTimeMs)
    || expectedIdentityCreatedAt.microseconds
      > millisecondsToMicroseconds(executionTimeMs)
  ) {
    throw new Error("invalid recipe image conditional Auth deletion input");
  }

  let evidence: unknown;
  try {
    evidence = await providerBarrier.deleteIfIdentityUnchanged({
      expectedAuthIdentityCreatedAt: expectedIdentityCreatedAt.iso,
      ownerUuid,
    });
  } catch {
    throw new Error("recipe image conditional Auth deletion failed");
  }

  const evidenceRecord = record(evidence);
  if (
    evidenceRecord?.status === "barrier_unavailable"
    && hasExactKeys(evidenceRecord, ["status"])
  ) {
    return {
      status: "barrier_unavailable" as const,
    };
  }

  const evidenceIdentityCreatedAt = evidenceRecord
    ? parsePostgresTimestamp(evidenceRecord.authIdentityCreatedAt)
    : null;
  if (
    !evidenceRecord
    || !exactUuid(evidenceRecord.ownerUuid, ownerUuid)
    || !evidenceIdentityCreatedAt
    || evidenceIdentityCreatedAt.microseconds
      !== expectedIdentityCreatedAt.microseconds
  ) {
    throw new Error("recipe image conditional Auth deletion failed");
  }

  if (
    evidenceRecord.status === "deleted"
    || evidenceRecord.status === "already_absent"
  ) {
    if (!hasExactKeys(evidenceRecord, [
      "authIdentityCreatedAt",
      "ownerUuid",
      "status",
    ])) {
      throw new Error("recipe image conditional Auth deletion failed");
    }
    return {
      authIdentityCreatedAt: evidenceIdentityCreatedAt.iso,
      ownerUuid: evidenceRecord.ownerUuid as string,
      status: evidenceRecord.status,
    };
  }

  const actualIdentityCreatedAt = parsePostgresTimestamp(
    evidenceRecord.actualAuthIdentityCreatedAt,
  );
  if (
    evidenceRecord.status !== "identity_replaced"
    || !hasExactKeys(evidenceRecord, [
      "actualAuthIdentityCreatedAt",
      "authIdentityCreatedAt",
      "ownerUuid",
      "status",
    ])
    || !actualIdentityCreatedAt
    || actualIdentityCreatedAt.microseconds
      <= expectedIdentityCreatedAt.microseconds
    || actualIdentityCreatedAt.microseconds
      > millisecondsToMicroseconds(executionTimeMs)
  ) {
    throw new Error("recipe image conditional Auth deletion failed");
  }

  return {
    actualAuthIdentityCreatedAt: actualIdentityCreatedAt.iso,
    authIdentityCreatedAt: evidenceIdentityCreatedAt.iso,
    ownerUuid: evidenceRecord.ownerUuid as string,
    status: "identity_replaced" as const,
  };
}
