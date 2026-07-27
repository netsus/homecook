const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const ROW_FIELDS = new Set([
  "account_generation",
  "cleanup_generation",
  "object_id",
  "outbox_id",
  "owner_uuid",
  "previous_state",
]);
const PREVIOUS_STATES = new Set([
  "pending_upload",
  "uploaded_unlinked",
]);

export interface RecipeImageStaleScannerRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<unknown>;
}

interface ScannerInput {
  dbClient: RecipeImageStaleScannerRpcClient;
  limit: number;
  now?: () => Date;
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

function uuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

function hasExactFields(row: Record<string, unknown>) {
  const fields = Object.keys(row);
  return fields.length === ROW_FIELDS.size
    && fields.every((field) => ROW_FIELDS.has(field));
}

export async function scanStaleRecipeImageUploads({
  dbClient,
  limit,
  now = () => new Date(),
}: ScannerInput) {
  const scanTime = now();
  if (
    !Number.isSafeInteger(limit)
    || limit < 1
    || limit > 50
    || !Number.isFinite(scanTime.getTime())
  ) {
    throw new Error("invalid recipe image stale scanner input");
  }

  let result: unknown;
  try {
    result = await dbClient.rpc(
      "scan_stale_recipe_image_uploads",
      {
        p_limit: limit,
        p_now: scanTime.toISOString(),
      },
    );
  } catch {
    throw new Error("recipe image stale scanner failed");
  }

  const resultRecord = record(result);
  const rows = resultRecord?.data;
  if (
    !resultRecord
    || resultRecord.error !== null
    || !Array.isArray(rows)
    || rows.length > limit
  ) {
    throw new Error("recipe image stale scanner failed");
  }

  const seenObjectIds = new Set<string>();
  const seenOutboxIds = new Set<string>();

  return rows.map((value) => {
    const row = record(value);
    const accountGeneration = row
      ? positiveInteger(row.account_generation)
      : null;
    const cleanupGeneration = row
      ? positiveInteger(row.cleanup_generation)
      : null;
    const objectId = uuid(row?.object_id);
    const outboxId = uuid(row?.outbox_id);
    const ownerUuid = uuid(row?.owner_uuid);
    const previousState = row?.previous_state;

    if (
      !row
      || !hasExactFields(row)
      || accountGeneration === null
      || cleanupGeneration === null
      || !objectId
      || !outboxId
      || !ownerUuid
      || typeof previousState !== "string"
      || !PREVIOUS_STATES.has(previousState)
      || seenObjectIds.has(objectId)
      || seenOutboxIds.has(outboxId)
    ) {
      throw new Error("recipe image stale scanner failed");
    }

    seenObjectIds.add(objectId);
    seenOutboxIds.add(outboxId);
    return {
      accountGeneration,
      cleanupGeneration,
      objectId,
      outboxId,
      ownerUuid,
      previousState,
    };
  });
}
