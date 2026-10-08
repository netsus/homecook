import { randomUUID } from 'node:crypto';
import { AiNutritionError, generateAiNutritionEstimate, type AiIngredientContext, type AiNutritionEstimate } from '@/lib/server/ingredient-ai-nutrition-model';
export interface AiNutritionRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
}
interface ClaimedJob {
  status: 'claimed';
  job_id: string;
  ingredient_id: string;
  lease_token: string;
  policy_version: string;
  prompt_version: string;
  model: string;
}
interface RefreshJob {
  job_id: string;
  pending_recipe_ids: string[];
}
interface WorkerDependencies {
  client: AiNutritionRpcClient;
  generate: (context: AiIngredientContext, model: string) => Promise<AiNutritionEstimate>;
  refresh: (jobId: string, recipeId: string) => Promise<unknown>;
  workerId?: string;
  now?: () => Date;
}
function record(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function text(v: unknown): v is string { return typeof v === 'string' && v.length > 0; }
function persistedErrorCode(code: string) {
  if (code === 'AI_NUTRITION_UNESTIMABLE')
    return 'NO_ESTIMATE';
  if (code === 'AI_NUTRITION_RATE_LIMITED' || code === 'AI_NUTRITION_PROVIDER_UNAVAILABLE')
    return 'MODEL_UNAVAILABLE';
  if (code === 'AI_NUTRITION_DISABLED' || code === 'AI_NUTRITION_INVALID_CONTEXT')
    return 'CONFIGURATION_ERROR';
  if (['AI_NUTRITION_INVALID_RESULT', 'AI_NUTRITION_INVALID_JSON', 'AI_NUTRITION_INCOMPLETE_RESULT', 'AI_NUTRITION_RESPONSE_TOO_LARGE'].includes(code))
    return 'MODEL_OUTPUT_INVALID';
  if (code === 'AI_NUTRITION_PROVIDER_FAILED')
    return 'MODEL_REQUEST_FAILED';
  return 'INTERNAL_ERROR';
}
export function createIngredientAiNutritionWorker(deps: WorkerDependencies) {
  const workerId = deps.workerId ?? `web-${randomUUID()}`;
  const now = deps.now ?? (() => new Date());
  let active: Promise<Record<string, unknown>> | null = null;
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await deps.client.rpc(name, args);
    if (result.error) throw new AiNutritionError('AI_NUTRITION_DATABASE_FAILED', true);
    return result.data;
  }
  async function refreshPending() {
    const result = await rpc('list_ingredient_ai_nutrition_refresh_jobs', { p_limit: 5 });
    const jobs = Array.isArray(result) ? result : record(result) && Array.isArray(result.jobs) ? result.jobs : [];
    let refreshed = 0;
    for (const raw of jobs) {
      if (!record(raw) || !text(raw.job_id) || !Array.isArray(raw.pending_recipe_ids))
        continue;
      const job = raw as unknown as RefreshJob;
      for (const recipeId of job.pending_recipe_ids.slice(0, 10)) {
        if (!text(recipeId))
          continue;
        try {
          await deps.refresh(job.job_id, recipeId);
          await rpc('acknowledge_ingredient_ai_nutrition_refresh', { p_job_id: job.job_id, p_recipe_ids: [recipeId] });
          refreshed++;
        }
        catch { /* Pending ID stays in DB for the next tick. */ }
      }
    }
    return refreshed;
  }
  async function run() {
    const refreshed = await refreshPending();
    const raw = await rpc('claim_ingredient_ai_nutrition_job', { p_worker_id: workerId, p_lease_seconds: 180 });
    if (!record(raw) || raw.status !== 'claimed')
      return { status: record(raw) && text(raw.status) ? raw.status : 'idle', refreshed };
    if (!['job_id', 'ingredient_id', 'lease_token', 'policy_version', 'prompt_version', 'model'].every(k => text(raw[k])))
      throw new AiNutritionError('AI_NUTRITION_INVALID_CLAIM');
    const job = raw as unknown as ClaimedJob;
    let completed: unknown;
    try {
      const context = await rpc('get_ingredient_ai_nutrition_context', { p_job_id: job.job_id, p_lease_token: job.lease_token });
      if (record(context) && context.status === 'skipped')
        return { status: 'skipped', refreshed };
      if (record(context) && context.status === 'disabled')
        throw new AiNutritionError('AI_NUTRITION_DISABLED', true);
      if (!record(context) || context.status !== 'ready' || !text(context.ingredient_id) || !text(context.standard_name) || !text(context.context_hash)
        || context.ingredient_id !== job.ingredient_id)
        throw new AiNutritionError('AI_NUTRITION_INVALID_CONTEXT');
      const ingredient: AiIngredientContext = { ingredient_id: context.ingredient_id, standard_name: context.standard_name, category: typeof context.category === 'string' ? context.category : null, definition: typeof context.definition === 'string' ? context.definition : null, context_hash: context.context_hash };
      const estimate = await deps.generate(ingredient, job.model);
      completed = await rpc('complete_ingredient_ai_nutrition_job', { p_job_id: job.job_id, p_lease_token: job.lease_token, p_result: { ...estimate, model: job.model, policy_version: job.policy_version, prompt_version: job.prompt_version, context_hash: ingredient.context_hash, generated_at: now().toISOString(), basis: { amount: 100, unit: 'g' } } });
    }
    catch (error) {
      const normalized = error instanceof AiNutritionError ? error : new AiNutritionError('AI_NUTRITION_WORK_FAILED', true);
      await rpc('fail_ingredient_ai_nutrition_job', { p_job_id: job.job_id, p_lease_token: job.lease_token, p_error_code: persistedErrorCode(normalized.code), p_retryable: normalized.retryable });
      return { status: 'failed', error_code: normalized.code, refreshed };
    }
    // A snapshot outage must not fail an already committed nutrition job.
    let refreshedAfterApply = 0;
    try { refreshedAfterApply = await refreshPending(); } catch { /* Persisted IDs retry next tick. */ }
    return { status: record(completed) && text(completed.status) ? completed.status : 'completed', refreshed: refreshed + refreshedAfterApply };
  }
  return {
    runOnce() {
      if (active) return active;
      active = run().finally(() => { active = null; });
      return active;
    },
  };
}
let runtimeWorker: ReturnType<typeof createIngredientAiNutritionWorker> | null = null;
export async function runIngredientAiNutritionTick() {
  if (process.env.AI_NUTRITION_ESTIMATION_ENABLED !== '1')
    return { status: 'disabled' };
  const { getGeminiApiKeyCandidates } = await import('@/lib/server/gemini-key-failover');
  if (getGeminiApiKeyCandidates().length === 0)
    return { status: 'provider_unavailable' };
  if (!runtimeWorker) {
    const { createIngredientAiNutritionInternalClient } = await import('@/lib/supabase/server');
    const { refreshIngredientAiRecipeNutrition } = await import('@/lib/server/ingredient-ai-nutrition-refresh');
    const client = createIngredientAiNutritionInternalClient();
    if (!client)
      return { status: 'database_unavailable' };
    runtimeWorker = createIngredientAiNutritionWorker({ client, generate: generateAiNutritionEstimate, refresh: (jobId, recipeId) => refreshIngredientAiRecipeNutrition(client, { jobId, recipeId }) });
  }
  return runtimeWorker.runOnce();
}
