const PRIVATE_RECIPE_IMAGE_BUCKET = "recipe-images-private";
const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_PATH_PATTERN
  = /^([0-9a-f-]{36})\/([1-9][0-9]*)\/([0-9a-f-]{36})\.(jpg|png|webp)$/i;
const CLAIM_LIMIT = 50;

interface RpcError {
  message: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

export interface RecipeImageQuarantineRecheckRpcClient {
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
  dbClient: RecipeImageQuarantineRecheckRpcClient;
  now?: () => Date;
}

interface QuarantineClaim {
  accountGeneration: number;
  bucketId: string;
  claimedCursor: string;
  cleanupGeneration: number;
  objectPath: string;
  outboxId: string;
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

function parseClaim(value: unknown): QuarantineClaim | null {
  const candidate = record(value);
  if (!candidate) {
    return null;
  }

  const accountGeneration = positiveInteger(candidate.account_generation);
  const bucketId = nonEmptyString(candidate, "bucket_id");
  const claimedCursor = nonEmptyString(
    candidate,
    "claimed_next_attempt_at",
  );
  const cleanupGeneration = positiveInteger(candidate.cleanup_generation);
  const objectPath = nonEmptyString(candidate, "object_path");
  const outboxId = nonEmptyString(candidate, "outbox_id");
  const ownerUuid = nonEmptyString(candidate, "owner_uuid");
  const pathMatch = objectPath?.match(OBJECT_PATH_PATTERN);

  if (
    accountGeneration === null
    || bucketId !== PRIVATE_RECIPE_IMAGE_BUCKET
    || !claimedCursor
    || !validTimestamp(claimedCursor)
    || cleanupGeneration === null
    || !objectPath
    || !outboxId
    || !UUID_PATTERN.test(outboxId)
    || !ownerUuid
    || !UUID_PATTERN.test(ownerUuid)
    || !pathMatch
    || pathMatch[1]?.toLowerCase() !== ownerUuid.toLowerCase()
    || Number(pathMatch[2]) !== accountGeneration
    || !pathMatch[3]
    || !UUID_PATTERN.test(pathMatch[3])
  ) {
    return null;
  }

  return {
    accountGeneration,
    bucketId,
    claimedCursor,
    cleanupGeneration,
    objectPath,
    outboxId,
    ownerUuid,
  };
}

export async function runRecipeImageQuarantineRecheckStorageScan({
  checkObjectPresence,
  dbClient,
  now = () => new Date(),
}: ScanInput) {
  const recheckTime = now();
  if (!Number.isFinite(recheckTime.getTime())) {
    throw new Error("invalid recipe image quarantine recheck time");
  }
  const recheckTimeIso = recheckTime.toISOString();
  let claimResult: RpcResult;
  try {
    claimResult = await dbClient.rpc(
      "claim_recipe_image_cleanup_not_found_rechecks",
      { p_limit: CLAIM_LIMIT, p_now: recheckTimeIso },
    );
  } catch {
    throw new Error("recipe image quarantine recheck claim failed");
  }
  if (
    claimResult.error
    || !Array.isArray(claimResult.data)
    || claimResult.data.length > CLAIM_LIMIT
  ) {
    throw new Error("recipe image quarantine recheck claim failed");
  }

  const claims = claimResult.data.map(parseClaim);
  if (claims.some((claim) => !claim)) {
    throw new Error("invalid recipe image quarantine recheck claim");
  }

  let failedCount = 0;
  let pendingCount = 0;
  let staleCount = 0;
  let verifiedNotFoundCount = 0;

  for (const claim of claims as QuarantineClaim[]) {
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

    if (!presence || (
      presence.kind !== "absent"
      && presence.kind !== "present"
    )) {
      failedCount += 1;
      continue;
    }

    const objectFound = presence.kind === "present";
    const expectedResult = objectFound ? "pending" : "verified_not_found";
    try {
      const recheckResult = await dbClient.rpc(
        "recheck_claimed_recipe_image_cleanup_not_found",
        {
          p_account_generation: claim.accountGeneration,
          p_cleanup_generation: claim.cleanupGeneration,
          p_expected_next_attempt_at: claim.claimedCursor,
          p_object_found: objectFound,
          p_outbox_id: claim.outboxId,
          p_owner_uuid: claim.ownerUuid,
          p_rechecked_at: recheckTimeIso,
        },
      );
      if (recheckResult.error) {
        failedCount += 1;
      } else if (recheckResult.data === null) {
        staleCount += 1;
      } else if (recheckResult.data !== expectedResult) {
        failedCount += 1;
      } else if (objectFound) {
        pendingCount += 1;
      } else {
        verifiedNotFoundCount += 1;
      }
    } catch {
      failedCount += 1;
    }
  }

  if (failedCount > 0) {
    throw new Error("recipe image quarantine recheck Storage scan failed");
  }

  return {
    claimedCount: claims.length,
    pendingCount,
    staleCount,
    verifiedNotFoundCount,
  };
}
