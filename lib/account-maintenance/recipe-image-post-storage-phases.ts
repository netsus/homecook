import type { AccountMaintenanceTickDependencies } from
  "@/lib/account-maintenance/tick";
import {
  runRecipeImageAuthDeletionCandidateDrain,
} from "@/lib/server/recipe-image-auth-deletion-drain";
import {
  listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates,
} from "@/lib/server/recipe-image-auth-deletion-eligibility";
import type { RecipeImageAuthDeletionProviderBarrier } from
  "@/lib/server/recipe-image-auth-conditional-delete";
import { runRecipeImageLifecycleCompletionDrain } from
  "@/lib/server/recipe-image-lifecycle-completion-drain";

interface RecipeImagePostStorageDbClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<unknown>;
}

interface PostStoragePhaseInput {
  createLeaseToken?: () => string;
  dbClient: RecipeImagePostStorageDbClient;
  now?: () => Date;
  providerBarrier: RecipeImageAuthDeletionProviderBarrier;
}

type PostStoragePhaseName =
  | "authDelete"
  | "complete"
  | "expectedOwnerSignalUnionZero";

type PostStoragePhases = {
  [Phase in PostStoragePhaseName]-?: NonNullable<
    AccountMaintenanceTickDependencies[Phase]
  >;
};

type EligibilityPartition = Awaited<
  ReturnType<
    typeof listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates
  >
>;

const PHASE_ERROR = "recipe image post-Storage maintenance phase failed";

function validPartition(partition: EligibilityPartition) {
  return (
    Number.isSafeInteger(partition.blockedCount)
    && partition.blockedCount >= 0
    && Number.isSafeInteger(partition.candidateCount)
    && partition.candidateCount >= 0
    && partition.candidateCount
      === partition.blockedCount + partition.eligibleCandidates.length
  );
}

export function createRecipeImagePostStorageMaintenancePhases({
  createLeaseToken,
  dbClient,
  now = () => new Date(),
  providerBarrier,
}: PostStoragePhaseInput): PostStoragePhases {
  let currentPartition: EligibilityPartition | null = null;

  return {
    expectedOwnerSignalUnionZero: async () => {
      currentPartition = null;

      try {
        const partition =
          await listRecipeImageExpectedOwnerEligibleAuthDeletionCandidates({
            dbClient,
            now,
          });
        if (!validPartition(partition)) {
          throw new Error(PHASE_ERROR);
        }
        currentPartition = partition;
      } catch {
        throw new Error(PHASE_ERROR);
      }
    },
    authDelete: async () => {
      const partition = currentPartition;
      currentPartition = null;
      if (!partition) {
        throw new Error(PHASE_ERROR);
      }

      try {
        await runRecipeImageAuthDeletionCandidateDrain({
          candidates: partition.eligibleCandidates,
          createLeaseToken,
          dbClient,
          now,
          providerBarrier,
        });
      } catch {
        throw new Error(PHASE_ERROR);
      }
    },
    complete: async () => {
      try {
        await runRecipeImageLifecycleCompletionDrain({
          dbClient,
          now,
        });
      } catch {
        throw new Error(PHASE_ERROR);
      }
    },
  };
}
