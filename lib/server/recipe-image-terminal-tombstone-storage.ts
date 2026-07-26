const PRIVATE_RECIPE_IMAGE_BUCKET = "recipe-images-private";
const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_PATH_PATTERN
  = /^([0-9a-f-]{36})\/([1-9][0-9]*)\/([0-9a-f-]{36})\.(jpg|png|webp)$/i;
const TERMINAL_STATES = new Set(["deleted", "verified_not_found"]);
const CLAIM_LIMIT = 50;

interface RpcError {
  message: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

export interface RecipeImageTerminalTombstoneRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
}

type ObjectPresence = { kind: "absent" | "failed" | "present" };

interface ScanInput {
  checkObjectPresence(input: {
    bucketId: string;
    objectPath: string;
  }): Promise<ObjectPresence>;
  dbClient: RecipeImageTerminalTombstoneRpcClient;
  now?: () => Date;
}

interface TerminalClaim {
  accountGeneration: number;
  bucketId: string;
  claimedCursor: string;
  cleanupGeneration: number;
  objectId: string;
  objectPath: string;
  ownerUuid: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : null;
}

function validTimestamp(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

function parseClaim(value: unknown): TerminalClaim | null {
  const candidate = record(value);
  if (!candidate) {
    return null;
  }

  const accountGeneration = positiveInteger(candidate.account_generation);
  const bucketId = nonEmptyString(candidate, "bucket_id");
  const claimedCursor = nonEmptyString(
    candidate,
    "claimed_next_terminal_scan_at",
  );
  const cleanupGeneration = positiveInteger(
    candidate.expected_cleanup_generation,
  );
  const objectId = nonEmptyString(candidate, "object_id");
  const objectPath = nonEmptyString(candidate, "object_path");
  const ownerUuid = nonEmptyString(candidate, "owner_uuid");
  const terminalState = nonEmptyString(candidate, "terminal_state");
  const pathMatch = objectPath?.match(OBJECT_PATH_PATTERN);

  if (
    accountGeneration === null
    || bucketId !== PRIVATE_RECIPE_IMAGE_BUCKET
    || !claimedCursor
    || !validTimestamp(claimedCursor)
    || cleanupGeneration === null
    || !objectId
    || !UUID_PATTERN.test(objectId)
    || !objectPath
    || !ownerUuid
    || !UUID_PATTERN.test(ownerUuid)
    || !terminalState
    || !TERMINAL_STATES.has(terminalState)
    || !pathMatch
    || pathMatch[1]?.toLowerCase() !== ownerUuid.toLowerCase()
    || Number(pathMatch[2]) !== accountGeneration
    || pathMatch[3]?.toLowerCase() !== objectId.toLowerCase()
  ) {
    return null;
  }

  return {
    accountGeneration,
    bucketId,
    claimedCursor,
    cleanupGeneration,
    objectId,
    objectPath,
    ownerUuid,
  };
}

function isValidReopenResult(value: unknown, claim: TerminalClaim) {
  if (!Array.isArray(value) || value.length !== 1) {
    return false;
  }
  const result = record(value[0]);
  const cleanupGeneration = result
    ? positiveInteger(result.cleanup_generation)
    : null;
  const objectId = result ? nonEmptyString(result, "object_id") : null;
  const outboxId = result ? nonEmptyString(result, "outbox_id") : null;

  return objectId?.toLowerCase() === claim.objectId.toLowerCase()
    && cleanupGeneration !== null
    && cleanupGeneration > claim.cleanupGeneration
    && outboxId !== null
    && UUID_PATTERN.test(outboxId);
}

export async function runRecipeImageTerminalTombstoneStorageScan({
  checkObjectPresence,
  dbClient,
  now = () => new Date(),
}: ScanInput) {
  const scanTime = now();
  if (!Number.isFinite(scanTime.getTime())) {
    throw new Error("invalid recipe image terminal tombstone scan time");
  }
  const scanTimeIso = scanTime.toISOString();
  let claimResult: RpcResult;
  try {
    claimResult = await dbClient.rpc(
      "claim_recipe_image_terminal_tombstones",
      { p_limit: CLAIM_LIMIT, p_now: scanTimeIso },
    );
  } catch {
    throw new Error("recipe image terminal tombstone claim failed");
  }
  if (
    claimResult.error
    || !Array.isArray(claimResult.data)
    || claimResult.data.length > CLAIM_LIMIT
  ) {
    throw new Error("recipe image terminal tombstone claim failed");
  }

  const claims = claimResult.data.map(parseClaim);
  if (claims.some((claim) => !claim)) {
    throw new Error("invalid recipe image terminal tombstone claim");
  }

  let absentCount = 0;
  let failedCount = 0;
  let reopenedCount = 0;
  let staleCount = 0;

  for (const claim of claims as TerminalClaim[]) {
    let presence: ObjectPresence;
    try {
      presence = await checkObjectPresence({
        bucketId: claim.bucketId,
        objectPath: claim.objectPath,
      });
    } catch {
      failedCount += 1;
      continue;
    }

    if (presence.kind === "absent") {
      absentCount += 1;
      continue;
    }
    if (presence.kind !== "present") {
      failedCount += 1;
      continue;
    }

    try {
      const reopenResult = await dbClient.rpc(
        "reopen_recipe_image_terminal_tombstone",
        {
          p_account_generation: claim.accountGeneration,
          p_expected_cleanup_generation: claim.cleanupGeneration,
          p_expected_next_terminal_scan_at: claim.claimedCursor,
          p_object_id: claim.objectId,
          p_owner_uuid: claim.ownerUuid,
          p_reopened_at: scanTimeIso,
        },
      );
      if (reopenResult.error) {
        failedCount += 1;
      } else if (
        Array.isArray(reopenResult.data)
        && reopenResult.data.length === 0
      ) {
        staleCount += 1;
      } else if (isValidReopenResult(reopenResult.data, claim)) {
        reopenedCount += 1;
      } else {
        failedCount += 1;
      }
    } catch {
      failedCount += 1;
    }
  }

  if (failedCount > 0) {
    throw new Error("recipe image terminal tombstone Storage scan failed");
  }

  return {
    absentCount,
    claimedCount: claims.length,
    reopenedCount,
    staleCount,
  };
}
