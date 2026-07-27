import type { AccountMaintenanceTickDependencies } from
  "@/lib/account-maintenance/tick";
import {
  listRecipeImageAuthDeletionCandidates,
  type RecipeImageAuthDeletionCandidateRpcClient,
} from "@/lib/server/recipe-image-auth-deletion-candidates";
import {
  inspectRecipeImageExpectedOwnerSignal,
  type RecipeImageExpectedOwnerSignalRpcClient,
} from "@/lib/server/recipe-image-expected-owner-signal";

const CANDIDATE_LIMIT = 50;

type ExpectedOwnerSignalDbClient =
  RecipeImageAuthDeletionCandidateRpcClient
  & RecipeImageExpectedOwnerSignalRpcClient;

interface ExpectedOwnerSignalPhaseInput {
  dbClient: ExpectedOwnerSignalDbClient;
  now?: () => Date;
}

type ExpectedOwnerSignalPhase = {
  expectedOwnerSignalUnionZero: NonNullable<
    AccountMaintenanceTickDependencies["expectedOwnerSignalUnionZero"]
  >;
};

export function createRecipeImageExpectedOwnerSignalMaintenancePhase({
  dbClient,
  now = () => new Date(),
}: ExpectedOwnerSignalPhaseInput): ExpectedOwnerSignalPhase {
  return {
    expectedOwnerSignalUnionZero: async () => {
      try {
        const candidates = await listRecipeImageAuthDeletionCandidates({
          dbClient,
          limit: CANDIDATE_LIMIT,
          now,
        });
        let unionZero = true;

        for (const candidate of candidates) {
          const signal = await inspectRecipeImageExpectedOwnerSignal({
            accountGeneration: candidate.accountGeneration,
            dbClient,
            ownerUuid: candidate.ownerUuid,
          });
          if (!signal.available) {
            throw new Error("expected-owner signal is unavailable");
          }
          unionZero = unionZero && signal.unionZero;
        }

        return {
          available: true,
          unionZero,
        };
      } catch {
        throw new Error("recipe image expected-owner signal phase failed");
      }
    },
  };
}
