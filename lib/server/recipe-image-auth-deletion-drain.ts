import { randomUUID } from "node:crypto";

import {
  listRecipeImageAuthDeletionCandidates,
  type RecipeImageAuthDeletionCandidateRpcClient,
} from "@/lib/server/recipe-image-auth-deletion-candidates";
import {
  claimRecipeImageAuthDeletionIfReady,
  type RecipeImageAuthDeletionClaimRpcClient,
} from "@/lib/server/recipe-image-auth-deletion-claim";
import {
  executeRecipeImageAuthConditionalDeletion,
  type RecipeImageAuthDeletionProviderBarrier,
} from "@/lib/server/recipe-image-auth-conditional-delete";
import {
  finalizeRecipeImageAuthDeletionClaim,
  type RecipeImageAuthDeletionFinalizeRpcClient,
} from "@/lib/server/recipe-image-auth-deletion-finalize";

const CANDIDATE_LIMIT = 50;

type AuthDeletionDbClient =
  RecipeImageAuthDeletionCandidateRpcClient
  & RecipeImageAuthDeletionClaimRpcClient
  & RecipeImageAuthDeletionFinalizeRpcClient;

interface DrainInput {
  createLeaseToken?: () => string;
  dbClient: AuthDeletionDbClient;
  now?: () => Date;
  providerBarrier: RecipeImageAuthDeletionProviderBarrier;
}

export async function runRecipeImageAuthDeletionDrain({
  createLeaseToken = randomUUID,
  dbClient,
  now = () => new Date(),
  providerBarrier,
}: DrainInput) {
  const candidates = await listRecipeImageAuthDeletionCandidates({
    dbClient,
    limit: CANDIDATE_LIMIT,
    now,
  });
  let alreadyAbsentCount = 0;
  let claimedCount = 0;
  let deletedCount = 0;
  let failedCount = 0;
  let identityReplacedCount = 0;

  for (const candidate of candidates) {
    let claim;
    try {
      claim = await claimRecipeImageAuthDeletionIfReady({
        accountGeneration: candidate.accountGeneration,
        dbClient,
        leaseToken: createLeaseToken(),
        now,
        outboxId: candidate.outboxId,
        ownerUuid: candidate.ownerUuid,
      });
      claimedCount += 1;
    } catch {
      failedCount += 1;
      continue;
    }

    let error: string | null = null;
    let terminalResult:
      | "already_absent"
      | "deleted"
      | "identity_replaced"
      | null = null;

    if (
      claim.authIdentityCreatedAt
      !== candidate.authIdentityCreatedAt
    ) {
      error = "AUTH_DELETION_CLAIM_EPOCH_MISMATCH";
    } else {
      try {
        const resolution = await executeRecipeImageAuthConditionalDeletion({
          expectedAuthIdentityCreatedAt: claim.authIdentityCreatedAt,
          now,
          ownerUuid: claim.ownerUuid,
          providerBarrier,
        });
        if (resolution.status === "barrier_unavailable") {
          error = "AUTH_DELETION_PROVIDER_BARRIER_UNAVAILABLE";
        } else if (
          resolution.status === "deleted"
          || resolution.status === "already_absent"
          || resolution.status === "identity_replaced"
        ) {
          terminalResult = resolution.status;
        }
      } catch {
        error = "AUTH_DELETION_PROVIDER_FAILED";
      }
    }

    try {
      await finalizeRecipeImageAuthDeletionClaim({
        accountGeneration: claim.accountGeneration,
        attempts: claim.attempts,
        authIdentityCreatedAt: claim.authIdentityCreatedAt,
        dbClient,
        error,
        leaseToken: claim.leaseToken,
        now,
        outboxId: claim.outboxId,
        ownerUuid: claim.ownerUuid,
        terminalResult,
      });
    } catch {
      failedCount += 1;
      continue;
    }

    if (terminalResult === "deleted") {
      deletedCount += 1;
    } else if (terminalResult === "already_absent") {
      alreadyAbsentCount += 1;
    } else if (terminalResult === "identity_replaced") {
      identityReplacedCount += 1;
    } else {
      failedCount += 1;
    }
  }

  if (failedCount > 0) {
    throw new Error("recipe image Auth deletion drain failed");
  }

  return {
    alreadyAbsentCount,
    candidateCount: candidates.length,
    claimedCount,
    deletedCount,
    identityReplacedCount,
  };
}
