import {
  millisecondsToMicroseconds,
  parsePostgresTimestamp,
} from "@/lib/server/postgres-timestamp";

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RecipeImageAuthIdentityAdminClient {
  getUserById(ownerUuid: string): PromiseLike<unknown>;
}

interface LookupInput {
  authAdminClient: RecipeImageAuthIdentityAdminClient;
  expectedAuthIdentityCreatedAt: string;
  now?: () => Date;
  ownerUuid: string;
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

export async function inspectRecipeImageAuthDeletionIdentity({
  authAdminClient,
  expectedAuthIdentityCreatedAt,
  now = () => new Date(),
  ownerUuid,
}: LookupInput) {
  const lookupTimeMs = now().getTime();
  const expectedIdentityCreatedAt = parsePostgresTimestamp(
    expectedAuthIdentityCreatedAt,
  );
  if (
    !UUID_PATTERN.test(ownerUuid)
    || !expectedIdentityCreatedAt
    || !Number.isFinite(lookupTimeMs)
    || expectedIdentityCreatedAt.microseconds
      > millisecondsToMicroseconds(lookupTimeMs)
  ) {
    throw new Error("invalid recipe image Auth identity lookup input");
  }

  let result: unknown;
  try {
    result = await authAdminClient.getUserById(ownerUuid);
  } catch {
    throw new Error("recipe image Auth identity lookup failed");
  }

  const resultRecord = record(result);
  const data = resultRecord ? record(resultRecord.data) : null;
  const error = resultRecord ? record(resultRecord.error) : null;
  if (
    resultRecord
    && data
    && error?.status === 404
    && data.user === null
  ) {
    return {
      authIdentityCreatedAt: expectedIdentityCreatedAt.iso,
      ownerUuid,
      status: "already_absent" as const,
    };
  }

  const user = data ? record(data.user) : null;
  const actualIdentityCreatedAt = user
    ? parsePostgresTimestamp(user.created_at)
    : null;
  if (
    !resultRecord
    || resultRecord.error !== null
    || !data
    || !user
    || !exactUuid(user.id, ownerUuid)
    || !actualIdentityCreatedAt
    || actualIdentityCreatedAt.microseconds
      > millisecondsToMicroseconds(lookupTimeMs)
    || actualIdentityCreatedAt.microseconds
      < expectedIdentityCreatedAt.microseconds
  ) {
    throw new Error("recipe image Auth identity lookup failed");
  }

  if (
    actualIdentityCreatedAt.microseconds
    > expectedIdentityCreatedAt.microseconds
  ) {
    return {
      actualAuthIdentityCreatedAt: actualIdentityCreatedAt.iso,
      authIdentityCreatedAt: expectedIdentityCreatedAt.iso,
      ownerUuid: user.id as string,
      status: "identity_replaced" as const,
    };
  }

  return {
    authIdentityCreatedAt: actualIdentityCreatedAt.iso,
    ownerUuid: user.id as string,
    status: "matched" as const,
  };
}
