import { executionState, executionWeightSummary } from "@/lib/server/cooking-execution-quantities";
import { wantsCookedWeightEvidence } from "@/lib/cooking/cooked-weight-response-contract";
import { fail, ok } from "@/lib/api/response";
import { cookedWeightEvidenceEnabled, readSnapshotWeightPrediction, summarizeWeightPrediction } from "@/lib/server/cooked-batch-weight-evidence";
import { createRecipeMealWeightReadInternalClient } from "@/lib/supabase/server";
import { createHybridAuthorityRouteError } from "@/lib/server/hybrid-auth/route-error";
import type { CookingWeightSessionClient } from "@/lib/server/cooked-batch-weight-estimate";
import type { RecipeProductNutritionClient } from "@/lib/server/recipe-product-nutrition";
import type { SnapshotV2CookModeData } from "@/types/cooking";
import { readVerifiedAccountGenerationSession } from
  "@/lib/server/account-generation/session-authority";
import {
  buildSessionAuthorityRpcArgs,
  callFuturePropagationRpc,
  isUuid,
  projectSnapshotV2CookModeData,
  type FuturePropagationRpcClient,
} from "@/lib/server/recipe-content-snapshot-future-propagation";
import {
  createSnapshotV2SessionInternalClient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;
  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const { id: sessionId } = await context.params;
  if (!isUuid(sessionId)) {
    return fail("RESOURCE_NOT_FOUND", "요리 세션을 찾을 수 없어요.", 404);
  }

  const verifiedSession = await readVerifiedAccountGenerationSession(routeClient);
  if (
    !verifiedSession.ok
    || verifiedSession.sessionAuthority.ownerUuid !== user.id
  ) {
    return fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409);
  }

  const serviceClient = createSnapshotV2SessionInternalClient();
  if (!serviceClient) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }
  const result = await callFuturePropagationRpc(
    serviceClient as unknown as FuturePropagationRpcClient,
    "read_snapshot_v2_cook_mode",
    {
      ...buildSessionAuthorityRpcArgs(verifiedSession.sessionAuthority),
      p_session_id: sessionId,
    },
  );
  if (!result.ok) {
    return result.response;
  }

  let rawMode = result.data;
  let execution: ReturnType<typeof executionState> = null;
  if (_request.headers.get("X-Homecook-Execution-Quantities") === "execution-v1") {
    const stored = await callFuturePropagationRpc(serviceClient, "read_cooking_execution_quantities", {
      ...buildSessionAuthorityRpcArgs(verifiedSession.sessionAuthority), p_session_id: sessionId,
    });
    if (!stored.ok) return stored.response;
    execution = executionState(stored.data);
    if (!execution || !rawMode || typeof rawMode !== "object" || !("recipe" in rawMode)
      || !rawMode.recipe || typeof rawMode.recipe !== "object") return fail("INTERNAL_ERROR", "요리의 재료 기록을 확인하지 못했어요.", 500);
    rawMode = { ...rawMode, recipe: { ...rawMode.recipe, ingredients: execution.rows } };
  }
  const data = projectSnapshotV2CookModeData(rawMode);
  const metadata: Pick<SnapshotV2CookModeData, "weight_evidence_enabled" | "weight_prediction"> = {};
  if (data && !execution?.revision && wantsCookedWeightEvidence(_request) && cookedWeightEvidenceEnabled() && result.data && typeof result.data === "object"
    && "weight_evidence_enabled" in result.data && result.data.weight_evidence_enabled === true) {
    metadata.weight_evidence_enabled = true;
    try {
      const sessionClient: CookingWeightSessionClient & RecipeProductNutritionClient = {
        rpc: (name, params) => routeClient.rpc(name, params),
        from: (table) => ({ select: (columns) => {
          let query = routeClient.from(table).select(columns);
          const reader = {
            eq: (column: string, value: string) => { query = query.eq(column, value); return reader; },
            maybeSingle: async () => {
              const result = await query.maybeSingle();
              return { data: result.data, error: result.error };
            },
          };
          return reader;
        } }),
      };
      const prediction = await readSnapshotWeightPrediction({ client: sessionClient,
        weightClient: createRecipeMealWeightReadInternalClient(), ownerId: user.id, sessionId, cookingSteps: data.recipe.steps });
      if (prediction) metadata.weight_prediction = summarizeWeightPrediction(prediction);
    } catch (error) {
      const failure = createHybridAuthorityRouteError(error);
      if (failure) return failure;
      // Preview is optional. Completion remains available without a number.
    }
  }
  if (execution?.revision && execution.prediction && wantsCookedWeightEvidence(_request) && cookedWeightEvidenceEnabled()) metadata.weight_prediction = executionWeightSummary(execution);
  if (execution && cookedWeightEvidenceEnabled() && result.data && typeof result.data === "object" && "weight_evidence_enabled" in result.data
    && result.data.weight_evidence_enabled === true) metadata.weight_evidence_enabled = true;
  return data
    ? ok({ ...data, ...metadata, ...(execution ? { execution_revision: execution.revision } : {}) })
    : fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
}
