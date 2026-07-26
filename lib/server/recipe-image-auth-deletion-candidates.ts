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
  "auth_identity_created_at_snapshot",
  "next_attempt_at",
  "outbox_id",
  "owner_uuid",
].sort();

export interface RecipeImageAuthDeletionCandidateRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<unknown>;
}

interface CandidateListInput {
  afterNextAttemptAt?: string;
  afterOutboxId?: string;
  dbClient: RecipeImageAuthDeletionCandidateRpcClient;
  limit: number;
  now?: () => Date;
}

interface CursorTuple {
  nextAttemptAtMicros: bigint;
  outboxId: string;
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
  return left.nextAttemptAtMicros > right.nextAttemptAtMicros
    || (
      left.nextAttemptAtMicros === right.nextAttemptAtMicros
      && left.outboxId > right.outboxId
    );
}

export async function listRecipeImageAuthDeletionCandidates({
  afterNextAttemptAt,
  afterOutboxId,
  dbClient,
  limit,
  now = () => new Date(),
}: CandidateListInput) {
  const listTime = now();
  const listTimeMs = listTime.getTime();
  const hasCursorTime = afterNextAttemptAt !== undefined;
  const hasCursorId = afterOutboxId !== undefined;
  const cursorTime = hasCursorTime
    ? parsePostgresTimestamp(afterNextAttemptAt)
    : null;
  const cursorId = hasCursorId && UUID_PATTERN.test(afterOutboxId!)
    ? afterOutboxId!.toLowerCase()
    : null;

  if (
    !Number.isSafeInteger(limit)
    || limit < 1
    || limit > 50
    || !Number.isFinite(listTimeMs)
    || hasCursorTime !== hasCursorId
    || (hasCursorTime && (
      !cursorTime
      || cursorTime.microseconds > millisecondsToMicroseconds(listTimeMs)
      || !cursorId
    ))
  ) {
    throw new Error("invalid recipe image Auth deletion candidate input");
  }

  let result: unknown;
  try {
    result = await dbClient.rpc(
      "list_recipe_image_auth_deletion_candidates",
      {
        p_after_next_attempt_at: cursorTime?.iso ?? null,
        p_after_outbox_id: cursorId,
        p_limit: limit,
        p_now: listTime.toISOString(),
      },
    );
  } catch {
    throw new Error("recipe image Auth deletion candidate listing failed");
  }

  const resultRecord = record(result);
  const rows = resultRecord?.data;
  if (
    !resultRecord
    || resultRecord.error !== null
    || !Array.isArray(rows)
    || rows.length > limit
  ) {
    throw new Error("recipe image Auth deletion candidate listing failed");
  }

  let previous: CursorTuple | null = cursorTime && cursorId
    ? {
        nextAttemptAtMicros: cursorTime.microseconds,
        outboxId: cursorId,
      }
    : null;
  const seenOutboxIds = new Set<string>();

  const candidates = rows.map((value) => {
    const row = record(value);
    const accountGeneration = row
      ? positiveInteger(row.account_generation)
      : null;
    const identityEpoch = row
      ? parsePostgresTimestamp(row.auth_identity_created_at_snapshot)
      : null;
    const nextAttemptAt = row
      ? parsePostgresTimestamp(row.next_attempt_at)
      : null;
    const outboxId = typeof row?.outbox_id === "string"
      && UUID_PATTERN.test(row.outbox_id)
      ? row.outbox_id.toLowerCase()
      : null;
    const ownerUuid = typeof row?.owner_uuid === "string"
      && UUID_PATTERN.test(row.owner_uuid)
      ? row.owner_uuid.toLowerCase()
      : null;
    const current = nextAttemptAt && outboxId
      ? {
          nextAttemptAtMicros: nextAttemptAt.microseconds,
          outboxId,
        }
      : null;

    if (
      !row
      || !isExactCandidateRow(row)
      || accountGeneration === null
      || !identityEpoch
      || identityEpoch.microseconds > millisecondsToMicroseconds(listTimeMs)
      || !nextAttemptAt
      || nextAttemptAt.microseconds > millisecondsToMicroseconds(listTimeMs)
      || !outboxId
      || !ownerUuid
      || !current
      || seenOutboxIds.has(outboxId)
      || (previous !== null && !isAfter(current, previous))
    ) {
      throw new Error("recipe image Auth deletion candidate listing failed");
    }

    seenOutboxIds.add(outboxId);
    previous = current;
    return {
      accountGeneration,
      authIdentityCreatedAt: identityEpoch.iso,
      nextAttemptAt: nextAttemptAt.iso,
      outboxId,
      ownerUuid,
    };
  });

  return candidates;
}
