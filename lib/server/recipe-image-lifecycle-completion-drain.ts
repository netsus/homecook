import {
  listRecipeImageLifecycleCompletionCandidates,
  type RecipeImageLifecycleCompletionCandidateRpcClient,
} from "@/lib/server/recipe-image-lifecycle-completion-candidates";
import {
  completeRecipeImageAccountLifecycle,
  type RecipeImageLifecycleCompletionRpcClient,
} from "@/lib/server/recipe-image-lifecycle-completion";

const CANDIDATE_LIMIT = 50;

type LifecycleCompletionDbClient =
  RecipeImageLifecycleCompletionCandidateRpcClient
  & RecipeImageLifecycleCompletionRpcClient;

interface DrainInput {
  dbClient: LifecycleCompletionDbClient;
  now?: () => Date;
}

export async function runRecipeImageLifecycleCompletionDrain({
  dbClient,
  now = () => new Date(),
}: DrainInput) {
  let candidates;
  try {
    candidates = await listRecipeImageLifecycleCompletionCandidates({
      dbClient,
      limit: CANDIDATE_LIMIT,
      now,
    });
  } catch {
    throw new Error("recipe image lifecycle completion drain failed");
  }

  let changedCount = 0;
  let failedCount = 0;
  let idempotentCount = 0;

  for (const candidate of candidates) {
    try {
      const result = await completeRecipeImageAccountLifecycle({
        accountGeneration: candidate.accountGeneration,
        dbClient,
        now,
        ownerUuid: candidate.ownerUuid,
      });

      if (result.changed === true) {
        changedCount += 1;
      } else if (result.changed === false) {
        idempotentCount += 1;
      } else {
        failedCount += 1;
      }
    } catch {
      failedCount += 1;
    }
  }

  if (failedCount > 0) {
    throw new Error("recipe image lifecycle completion drain failed");
  }

  return {
    candidateCount: candidates.length,
    changedCount,
    idempotentCount,
  };
}
