import {
  millisecondsToMicroseconds,
  parsePostgresTimestamp,
} from "@/lib/server/postgres-timestamp";

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_COUNT_PATTERN = /^(0|[1-9][0-9]*)$/;
const MAX_SAFE_COUNT = BigInt(Number.MAX_SAFE_INTEGER);
const COMPLETION_FIELDS = new Set([
  "owner_uuid",
  "account_generation",
  "status",
  "required_cleanup_generation",
  "completed_cleanup_generation",
  "updated_at",
  "changed",
]);

export interface RecipeImageLifecycleCompletionRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<unknown>;
}

interface CompletionInput {
  accountGeneration: number;
  dbClient: RecipeImageLifecycleCompletionRpcClient;
  now?: () => Date;
  ownerUuid: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (
    typeof value !== "string"
    || !DECIMAL_COUNT_PATTERN.test(value)
  ) {
    return null;
  }

  const parsed = BigInt(value);
  return parsed <= MAX_SAFE_COUNT ? Number(parsed) : null;
}

function exactUuid(value: unknown, expected: string) {
  return typeof value === "string"
    && UUID_PATTERN.test(value)
    && value.toLowerCase() === expected.toLowerCase();
}

function hasExactCompletionFields(row: Record<string, unknown>) {
  const keys = Object.keys(row);
  return keys.length === COMPLETION_FIELDS.size
    && keys.every((key) => COMPLETION_FIELDS.has(key));
}

export async function completeRecipeImageAccountLifecycle({
  accountGeneration,
  dbClient,
  now = () => new Date(),
  ownerUuid,
}: CompletionInput) {
  const completionTime = now();
  const completionTimeMs = completionTime.getTime();
  if (
    !UUID_PATTERN.test(ownerUuid)
    || !Number.isSafeInteger(accountGeneration)
    || accountGeneration < 1
    || !Number.isFinite(completionTimeMs)
  ) {
    throw new Error("invalid recipe image lifecycle completion input");
  }

  let result: unknown;
  try {
    result = await dbClient.rpc(
      "complete_recipe_image_account_lifecycle",
      {
        p_account_generation: accountGeneration,
        p_now: completionTime.toISOString(),
        p_owner_uuid: ownerUuid,
      },
    );
  } catch {
    throw new Error("recipe image lifecycle completion failed");
  }

  const resultRecord = record(result);
  const row = resultRecord ? record(resultRecord.data) : null;
  const returnedGeneration = row
    ? parseCount(row.account_generation)
    : null;
  const requiredCleanupGeneration = row
    ? parseCount(row.required_cleanup_generation)
    : null;
  const completedCleanupGeneration = row
    ? parseCount(row.completed_cleanup_generation)
    : null;
  const updatedAt = row
    ? parsePostgresTimestamp(row.updated_at)
    : null;
  const changed = row?.changed;
  const completionTimeMicros = millisecondsToMicroseconds(completionTimeMs);

  if (
    !resultRecord
    || resultRecord.error !== null
    || !row
    || !hasExactCompletionFields(row)
    || !exactUuid(row.owner_uuid, ownerUuid)
    || returnedGeneration !== accountGeneration
    || row.status !== "complete"
    || requiredCleanupGeneration === null
    || completedCleanupGeneration !== requiredCleanupGeneration
    || typeof changed !== "boolean"
    || !updatedAt
    || (
      changed
        ? updatedAt.microseconds !== completionTimeMicros
        : updatedAt.microseconds > completionTimeMicros
    )
  ) {
    throw new Error("recipe image lifecycle completion failed");
  }

  return {
    accountGeneration: returnedGeneration,
    changed,
    completedCleanupGeneration,
    ownerUuid: row.owner_uuid as string,
    requiredCleanupGeneration,
    status: "complete" as const,
    updatedAt: updatedAt.iso,
  };
}
