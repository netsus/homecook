const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_COUNT_PATTERN = /^(0|[1-9][0-9]*)$/;
const MAX_SAFE_COUNT = BigInt(Number.MAX_SAFE_INTEGER);

export interface RecipeImageExpectedOwnerSignalRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<unknown>;
}

interface InspectionInput {
  accountGeneration: number;
  dbClient: RecipeImageExpectedOwnerSignalRpcClient;
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

export async function inspectRecipeImageExpectedOwnerSignal({
  accountGeneration,
  dbClient,
  ownerUuid,
}: InspectionInput) {
  if (
    !UUID_PATTERN.test(ownerUuid)
    || !Number.isSafeInteger(accountGeneration)
    || accountGeneration < 1
  ) {
    throw new Error("invalid recipe image expected-owner signal identity");
  }

  let result: unknown;
  try {
    result = await dbClient.rpc(
      "inspect_recipe_image_expected_owner_signal",
      {
        p_account_generation: accountGeneration,
        p_owner_uuid: ownerUuid,
      },
    );
  } catch {
    throw new Error("recipe image expected-owner signal inspection failed");
  }

  const resultRecord = record(result);
  const data = resultRecord?.data;
  if (
    !resultRecord
    || resultRecord.error !== null
    || !Array.isArray(data)
    || data.length !== 1
  ) {
    throw new Error("recipe image expected-owner signal inspection failed");
  }

  const row = record(data[0]);
  const ownerIdSignalCount = row
    ? parseCount(row.owner_id_signal_count)
    : null;
  const legacyOwnerPathSignalCount = row
    ? parseCount(row.legacy_owner_path_signal_count)
    : null;
  const registrySignalCount = row
    ? parseCount(row.registry_signal_count)
    : null;
  const unionSignalCount = row
    ? parseCount(row.union_signal_count)
    : null;
  const unionZero = row?.union_zero;

  if (
    ownerIdSignalCount === null
    || legacyOwnerPathSignalCount === null
    || registrySignalCount === null
    || unionSignalCount === null
    || typeof unionZero !== "boolean"
    || ownerIdSignalCount > unionSignalCount
    || legacyOwnerPathSignalCount > unionSignalCount
    || registrySignalCount > unionSignalCount
    || unionSignalCount > (
      ownerIdSignalCount
      + legacyOwnerPathSignalCount
      + registrySignalCount
    )
    || unionZero !== (unionSignalCount === 0)
  ) {
    throw new Error("recipe image expected-owner signal inspection failed");
  }

  return {
    available: true,
    legacyOwnerPathSignalCount,
    ownerIdSignalCount,
    registrySignalCount,
    unionSignalCount,
    unionZero,
  };
}
