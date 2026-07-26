const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_COUNT_PATTERN = /^(0|[1-9][0-9]*)$/;
const MAX_SAFE_COUNT = BigInt(Number.MAX_SAFE_INTEGER);

export interface RecipeImageAuthDeletionReadinessRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<unknown>;
}

interface InspectionInput {
  accountGeneration: number;
  dbClient: RecipeImageAuthDeletionReadinessRpcClient;
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

export async function inspectRecipeImageAuthDeletionReadiness({
  accountGeneration,
  dbClient,
  now = () => new Date(),
  ownerUuid,
}: InspectionInput) {
  const inspectionTime = now();
  if (
    !UUID_PATTERN.test(ownerUuid)
    || !Number.isSafeInteger(accountGeneration)
    || accountGeneration < 1
    || !Number.isFinite(inspectionTime.getTime())
  ) {
    throw new Error("invalid recipe image Auth deletion readiness input");
  }

  let result: unknown;
  try {
    result = await dbClient.rpc(
      "inspect_recipe_image_auth_deletion_readiness",
      {
        p_account_generation: accountGeneration,
        p_now: inspectionTime.toISOString(),
        p_owner_uuid: ownerUuid,
      },
    );
  } catch {
    throw new Error(
      "recipe image Auth deletion readiness inspection failed",
    );
  }

  const resultRecord = record(result);
  const data = resultRecord?.data;
  if (
    !resultRecord
    || resultRecord.error !== null
    || !Array.isArray(data)
    || data.length !== 1
  ) {
    throw new Error(
      "recipe image Auth deletion readiness inspection failed",
    );
  }

  const row = record(data[0]);
  const lifecycleReady = row?.lifecycle_ready;
  const authOutboxDueCount = row
    ? parseCount(row.auth_outbox_due_count)
    : null;
  const requiredCleanupGeneration = row
    ? parseCount(row.required_cleanup_generation)
    : null;
  const terminalCleanupGenerationCount = row
    ? parseCount(row.terminal_cleanup_generation_count)
    : null;
  const storageNonterminalCount = row
    ? parseCount(row.storage_nonterminal_count)
    : null;
  const storageDeadLetterCount = row
    ? parseCount(row.storage_dead_letter_count)
    : null;
  const storageGenerationMismatchCount = row
    ? parseCount(row.storage_generation_mismatch_count)
    : null;
  const registryNonterminalCount = row
    ? parseCount(row.registry_nonterminal_count)
    : null;
  const registryGenerationMismatchCount = row
    ? parseCount(row.registry_generation_mismatch_count)
    : null;
  const ownerSignalUnionCount = row
    ? parseCount(row.owner_signal_union_count)
    : null;
  const ownerSignalUnionZero = row?.owner_signal_union_zero;
  const ready = row?.ready;

  if (
    typeof lifecycleReady !== "boolean"
    || authOutboxDueCount === null
    || requiredCleanupGeneration === null
    || terminalCleanupGenerationCount === null
    || storageNonterminalCount === null
    || storageDeadLetterCount === null
    || storageGenerationMismatchCount === null
    || registryNonterminalCount === null
    || registryGenerationMismatchCount === null
    || ownerSignalUnionCount === null
    || typeof ownerSignalUnionZero !== "boolean"
    || typeof ready !== "boolean"
    || authOutboxDueCount > 1
    || terminalCleanupGenerationCount > requiredCleanupGeneration
    || storageDeadLetterCount > storageNonterminalCount
    || ownerSignalUnionZero !== (ownerSignalUnionCount === 0)
  ) {
    throw new Error(
      "recipe image Auth deletion readiness inspection failed",
    );
  }

  const calculatedReady = (
    lifecycleReady
    && authOutboxDueCount === 1
    && terminalCleanupGenerationCount === requiredCleanupGeneration
    && storageNonterminalCount === 0
    && storageDeadLetterCount === 0
    && storageGenerationMismatchCount === 0
    && registryNonterminalCount === 0
    && registryGenerationMismatchCount === 0
    && ownerSignalUnionCount === 0
    && ownerSignalUnionZero
  );
  if (ready !== calculatedReady) {
    throw new Error(
      "recipe image Auth deletion readiness inspection failed",
    );
  }

  return {
    available: true,
    authOutboxDueCount,
    lifecycleReady,
    ownerSignalUnionCount,
    ownerSignalUnionZero,
    ready,
    registryGenerationMismatchCount,
    registryNonterminalCount,
    requiredCleanupGeneration,
    storageDeadLetterCount,
    storageGenerationMismatchCount,
    storageNonterminalCount,
    terminalCleanupGenerationCount,
  };
}
