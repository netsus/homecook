import {
  listRecipeImageAuthDeletionCandidates,
  type RecipeImageAuthDeletionCandidateRpcClient,
} from "@/lib/server/recipe-image-auth-deletion-candidates";
import {
  inspectRecipeImageExpectedOwnerSignal,
  type RecipeImageExpectedOwnerSignalRpcClient,
} from "@/lib/server/recipe-image-expected-owner-signal";

const CANDIDATE_LIMIT = 50;

type EligibilityDbClient =
  RecipeImageAuthDeletionCandidateRpcClient
  & RecipeImageExpectedOwnerSignalRpcClient;

interface EligibilityInput {
  dbClient: EligibilityDbClient;
  now?: () => Date;
}

export async function
listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates({
  dbClient,
  now = () => new Date(),
}: EligibilityInput) {
  try {
    const candidates = await listRecipeImageAuthDeletionCandidates({
      dbClient,
      limit: CANDIDATE_LIMIT,
      now,
    });
    const eligibleCandidates = [];

    for (const candidate of candidates) {
      const signal = await inspectRecipeImageExpectedOwnerSignal({
        accountGeneration: candidate.accountGeneration,
        dbClient,
        ownerUuid: candidate.ownerUuid,
      });
      if (!signal.available) {
        throw new Error("expected-owner signal is unavailable");
      }
      if (signal.unionZero) {
        eligibleCandidates.push(candidate);
      }
    }

    return {
      blockedCount: candidates.length - eligibleCandidates.length,
      candidateCount: candidates.length,
      eligibleCandidates,
    };
  } catch {
    throw new Error("recipe image Auth deletion eligibility failed");
  }
}
