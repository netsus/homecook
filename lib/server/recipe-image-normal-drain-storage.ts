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

export interface RecipeImageNormalDrainRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
}

type ObjectPresence = { kind: "absent" | "failed" | "present" };
type DeleteResult = { kind: "deleted" | "failed" };

interface DrainInput {
  checkObjectPresence(input: {
    bucketId: string;
    objectPath: string;
  }): Promise<ObjectPresence>;
  dbClient: RecipeImageNormalDrainRpcClient;
  deleteObject(input: {
    bucketId: string;
    objectPath: string;
  }): Promise<DeleteResult>;
  leaseToken: string;
  now?: () => Date;
}

interface CleanupClaim {
  accountGeneration: number;
  bucketId: string;
  cleanupGeneration: number;
  leaseToken: string;
  objectPath: string;
  outboxId: string;
  ownerUuid: string;
  reason: string;
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

function operationTimeIso(now: () => Date) {
  const time = now();
  if (!Number.isFinite(time.getTime())) {
    throw new Error("invalid recipe image normal drain time");
  }
  return time.toISOString();
}

function parseClaim(
  value: unknown,
  expectedLeaseToken: string,
): CleanupClaim | null {
  const candidate = record(value);
  if (!candidate) {
    return null;
  }

  const accountGeneration = positiveInteger(candidate.account_generation);
  const bucketId = nonEmptyString(candidate, "bucket_id");
  const cleanupGeneration = positiveInteger(candidate.cleanup_generation);
  const leaseToken = nonEmptyString(candidate, "lease_token");
  const objectPath = nonEmptyString(candidate, "object_path");
  const outboxId = nonEmptyString(candidate, "outbox_id");
  const ownerUuid = nonEmptyString(candidate, "owner_uuid");
  const reason = nonEmptyString(candidate, "reason");
  const pathMatch = objectPath?.match(OBJECT_PATH_PATTERN);

  if (
    accountGeneration === null
    || bucketId !== PRIVATE_RECIPE_IMAGE_BUCKET
    || cleanupGeneration === null
    || !leaseToken
    || !UUID_PATTERN.test(leaseToken)
    || leaseToken.toLowerCase() !== expectedLeaseToken.toLowerCase()
    || !objectPath
    || !outboxId
    || !UUID_PATTERN.test(outboxId)
    || !ownerUuid
    || !UUID_PATTERN.test(ownerUuid)
    || !reason
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
    cleanupGeneration,
    leaseToken,
    objectPath,
    outboxId,
    ownerUuid,
    reason,
  };
}

function exactLeaseParams(claim: CleanupClaim) {
  return {
    p_account_generation: claim.accountGeneration,
    p_cleanup_generation: claim.cleanupGeneration,
    p_lease_token: claim.leaseToken,
    p_outbox_id: claim.outboxId,
    p_owner_uuid: claim.ownerUuid,
  };
}

async function failClaim(
  dbClient: RecipeImageNormalDrainRpcClient,
  claim: CleanupClaim,
  errorCode: string,
  now: () => Date,
): Promise<"failed" | "stale"> {
  try {
    const result = await dbClient.rpc(
      "fail_recipe_image_cleanup",
      {
        ...exactLeaseParams(claim),
        p_error_code: errorCode,
        p_failed_at: operationTimeIso(now),
      },
    );
    if (!result.error && result.data === null) {
      return "stale";
    }
    if (
      !result.error
      && (result.data === "failed" || result.data === "dead_letter")
    ) {
      return "failed";
    }
  } catch {
    // The expired lease recovery remains the final fallback.
  }
  return "failed";
}

async function authorizeClaim(
  dbClient: RecipeImageNormalDrainRpcClient,
  claim: CleanupClaim,
  now: () => Date,
) {
  try {
    const result = await dbClient.rpc(
      "authorize_recipe_image_cleanup_delete",
      {
        ...exactLeaseParams(claim),
        p_authorized_at: operationTimeIso(now),
      },
    );
    if (!result.error && typeof result.data === "boolean") {
      return result.data ? "authorized" : "stale";
    }
  } catch {
    // Convert the bounded authority failure into the exact retry state below.
  }
  return failClaim(
    dbClient,
    claim,
    "DELETE_AUTHORIZATION_FAILED",
    now,
  );
}

export async function runRecipeImageNormalDrainStorage({
  checkObjectPresence,
  dbClient,
  deleteObject,
  leaseToken,
  now = () => new Date(),
}: DrainInput) {
  if (!UUID_PATTERN.test(leaseToken)) {
    throw new Error("invalid recipe image normal drain lease");
  }

  const claimTimeIso = operationTimeIso(now);
  let claimResult: RpcResult;
  try {
    claimResult = await dbClient.rpc(
      "claim_recipe_image_cleanup",
      {
        p_lease_token: leaseToken,
        p_limit: CLAIM_LIMIT,
        p_now: claimTimeIso,
      },
    );
  } catch {
    throw new Error("recipe image normal drain claim failed");
  }
  if (
    claimResult.error
    || !Array.isArray(claimResult.data)
    || claimResult.data.length > CLAIM_LIMIT
  ) {
    throw new Error("recipe image normal drain claim failed");
  }

  const claims = claimResult.data.map((value) => (
    parseClaim(value, leaseToken)
  ));
  if (claims.some((claim) => !claim)) {
    throw new Error("invalid recipe image normal drain claim");
  }

  let deletedCount = 0;
  let failedCount = 0;
  let quarantinedCount = 0;
  let staleCount = 0;

  const recordFailure = async (
    claim: CleanupClaim,
    errorCode: string,
  ) => {
    const result = await failClaim(dbClient, claim, errorCode, now);
    if (result === "stale") {
      staleCount += 1;
    } else {
      failedCount += 1;
    }
  };

  for (const claim of claims as CleanupClaim[]) {
    const firstAuthorization = await authorizeClaim(dbClient, claim, now);
    if (firstAuthorization === "stale") {
      staleCount += 1;
      continue;
    }
    if (firstAuthorization !== "authorized") {
      failedCount += 1;
      continue;
    }

    let presence: ObjectPresence;
    try {
      presence = await checkObjectPresence({
        bucketId: claim.bucketId,
        objectPath: claim.objectPath,
      });
    } catch {
      presence = { kind: "failed" };
    }

    if (presence?.kind === "absent") {
      try {
        const observation = await dbClient.rpc(
          "observe_recipe_image_cleanup_not_found",
          {
            ...exactLeaseParams(claim),
            p_observed_at: operationTimeIso(now),
          },
        );
        if (!observation.error && observation.data === true) {
          quarantinedCount += 1;
        } else if (!observation.error && observation.data === false) {
          staleCount += 1;
        } else {
          await recordFailure(claim, "NOT_FOUND_OBSERVATION_FAILED");
        }
      } catch {
        await recordFailure(claim, "NOT_FOUND_OBSERVATION_FAILED");
      }
      continue;
    }
    if (presence?.kind !== "present") {
      await recordFailure(claim, "STORAGE_PRESENCE_FAILED");
      continue;
    }

    const finalAuthorization = await authorizeClaim(dbClient, claim, now);
    if (finalAuthorization === "stale") {
      staleCount += 1;
      continue;
    }
    if (finalAuthorization !== "authorized") {
      failedCount += 1;
      continue;
    }

    let deletion: DeleteResult;
    try {
      deletion = await deleteObject({
        bucketId: claim.bucketId,
        objectPath: claim.objectPath,
      });
    } catch {
      deletion = { kind: "failed" };
    }
    if (deletion?.kind !== "deleted") {
      await recordFailure(claim, "STORAGE_DELETE_FAILED");
      continue;
    }

    try {
      const completion = await dbClient.rpc(
        "complete_recipe_image_cleanup_deleted",
        {
          ...exactLeaseParams(claim),
          p_completed_at: operationTimeIso(now),
        },
      );
      if (!completion.error && completion.data === true) {
        deletedCount += 1;
      } else if (!completion.error && completion.data === false) {
        staleCount += 1;
      } else {
        await recordFailure(claim, "DELETE_FINALIZE_FAILED");
      }
    } catch {
      await recordFailure(claim, "DELETE_FINALIZE_FAILED");
    }
  }

  if (failedCount > 0) {
    throw new Error("recipe image normal drain Storage failed");
  }

  return {
    claimedCount: claims.length,
    deletedCount,
    quarantinedCount,
    staleCount,
  };
}
