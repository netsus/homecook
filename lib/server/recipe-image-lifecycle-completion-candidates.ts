import {
  millisecondsToMicroseconds,
  parsePostgresTimestamp,
} from "@/lib/server/postgres-timestamp";

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const ROW_KEYS = [
  "account_generation",
  "auth_identity_deleted_at",
  "owner_uuid",
].sort();

export interface RecipeImageLifecycleCompletionCandidateRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<unknown>;
}

interface CandidateListInput {
  afterAccountGeneration?: number;
  afterAuthIdentityDeletedAt?: string;
  afterOwnerUuid?: string;
  dbClient: RecipeImageLifecycleCompletionCandidateRpcClient;
  limit: number;
  now?: () => Date;
}

interface CursorTuple {
  accountGeneration: number;
  authIdentityDeletedAtMicros: bigint;
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

function isExactCandidateRow(row: Record<string, unknown>) {
  const keys = Object.keys(row).sort();
  return keys.length === ROW_KEYS.length
    && keys.every((key, index) => key === ROW_KEYS[index]);
}

function isAfter(left: CursorTuple, right: CursorTuple) {
  return left.authIdentityDeletedAtMicros
    > right.authIdentityDeletedAtMicros
    || (
      left.authIdentityDeletedAtMicros
        === right.authIdentityDeletedAtMicros
      && (
        left.ownerUuid > right.ownerUuid
        || (
          left.ownerUuid === right.ownerUuid
          && left.accountGeneration > right.accountGeneration
        )
      )
    );
}

export async function listRecipeImageLifecycleCompletionCandidates({
  afterAccountGeneration,
  afterAuthIdentityDeletedAt,
  afterOwnerUuid,
  dbClient,
  limit,
  now = () => new Date(),
}: CandidateListInput) {
  const listTime = now();
  const listTimeMs = listTime.getTime();
  const hasCursorGeneration = afterAccountGeneration !== undefined;
  const hasCursorTime = afterAuthIdentityDeletedAt !== undefined;
  const hasCursorOwner = afterOwnerUuid !== undefined;
  const cursorGeneration = hasCursorGeneration
    ? positiveInteger(afterAccountGeneration)
    : null;
  const cursorTime = hasCursorTime
    ? parsePostgresTimestamp(afterAuthIdentityDeletedAt)
    : null;
  const cursorOwner = hasCursorOwner
    && UUID_PATTERN.test(afterOwnerUuid!)
    ? afterOwnerUuid!.toLowerCase()
    : null;
  const hasCompleteCursor = hasCursorGeneration
    && hasCursorTime
    && hasCursorOwner;

  if (
    !Number.isSafeInteger(limit)
    || limit < 1
    || limit > 50
    || !Number.isFinite(listTimeMs)
    || (hasCursorGeneration || hasCursorTime || hasCursorOwner)
      !== hasCompleteCursor
    || (hasCompleteCursor && (
      cursorGeneration === null
      || !cursorTime
      || cursorTime.microseconds > millisecondsToMicroseconds(listTimeMs)
      || !cursorOwner
    ))
  ) {
    throw new Error("invalid recipe image lifecycle completion candidate input");
  }

  let result: unknown;
  try {
    result = await dbClient.rpc(
      "list_recipe_image_lifecycle_completion_candidates",
      {
        p_after_account_generation: cursorGeneration,
        p_after_auth_identity_deleted_at: cursorTime?.iso ?? null,
        p_after_owner_uuid: cursorOwner,
        p_limit: limit,
        p_now: listTime.toISOString(),
      },
    );
  } catch {
    throw new Error("recipe image lifecycle completion candidate listing failed");
  }

  const resultRecord = record(result);
  const rows = resultRecord?.data;
  if (
    !resultRecord
    || resultRecord.error !== null
    || !Array.isArray(rows)
    || rows.length > limit
  ) {
    throw new Error("recipe image lifecycle completion candidate listing failed");
  }

  let previous: CursorTuple | null = cursorGeneration && cursorTime && cursorOwner
    ? {
        accountGeneration: cursorGeneration,
        authIdentityDeletedAtMicros: cursorTime.microseconds,
        ownerUuid: cursorOwner,
      }
    : null;

  return rows.map((value) => {
    const row = record(value);
    const accountGeneration = row
      ? positiveInteger(row.account_generation)
      : null;
    const authIdentityDeletedAt = row
      ? parsePostgresTimestamp(row.auth_identity_deleted_at)
      : null;
    const ownerUuid = typeof row?.owner_uuid === "string"
      && UUID_PATTERN.test(row.owner_uuid)
      ? row.owner_uuid.toLowerCase()
      : null;
    const current = accountGeneration && authIdentityDeletedAt && ownerUuid
      ? {
          accountGeneration,
          authIdentityDeletedAtMicros: authIdentityDeletedAt.microseconds,
          ownerUuid,
        }
      : null;

    if (
      !row
      || !isExactCandidateRow(row)
      || accountGeneration === null
      || !authIdentityDeletedAt
      || authIdentityDeletedAt.microseconds
        > millisecondsToMicroseconds(listTimeMs)
      || !ownerUuid
      || !current
      || (previous !== null && !isAfter(current, previous))
    ) {
      throw new Error("recipe image lifecycle completion candidate listing failed");
    }

    previous = current;
    return {
      accountGeneration,
      authIdentityDeletedAt: authIdentityDeletedAt.iso,
      ownerUuid,
    };
  });
}
