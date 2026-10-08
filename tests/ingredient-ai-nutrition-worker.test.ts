import { describe, it, expect, vi } from 'vitest';
import { createIngredientAiNutritionWorker, type AiNutritionRpcClient } from '@/lib/server/ingredient-ai-nutrition-worker';
import { AiNutritionError, type AiNutritionEstimate } from '@/lib/server/ingredient-ai-nutrition-model';
const job = { status: 'claimed', job_id: 'job', ingredient_id: 'ingredient', lease_token: 'lease', policy_version: 'v1', prompt_version: 'p1', model: 'gemini-test' };
const context = { status: 'ready', ingredient_id: 'ingredient', standard_name: '생 삼나물', category: '채소', definition: '생잎 100g', context_hash: 'hash' };
const estimate: AiNutritionEstimate = { values: { energy_kcal: 25, carbohydrate_g: 4, protein_g: 2, fat_g: 0.2, sodium_mg: null, sugars_g: null, fiber_g: 2, saturated_fat_g: null }, assumptions: ['생것'], uncertainty: 'high' };
function setup(overrides: Record<string, unknown> = {}) { const calls: Array<{
  name: string;
  args: Record<string, unknown>;
}> = []; const client: AiNutritionRpcClient = { rpc: async (name, args) => { calls.push({ name, args }); return { data: overrides[name] ?? ({ 'claim_ingredient_ai_nutrition_job': job, 'get_ingredient_ai_nutrition_context': context, 'complete_ingredient_ai_nutrition_job': { status: 'applied' }, 'list_ingredient_ai_nutrition_refresh_jobs': [] } as Record<string, unknown>)[name] ?? {}, error: null }; } }; return { calls, client }; }
describe('durable AI nutrition worker', () => {
  it('keeps an applied result when the subsequent snapshot list is unavailable', async () => {
    const base = setup();
    let lists = 0;
    const client: AiNutritionRpcClient = {
      rpc: async (name, args) => {
        if (name === 'list_ingredient_ai_nutrition_refresh_jobs' && ++lists === 2) {
          return { data: null, error: { message: 'temporary database outage' } };
        }
        return base.client.rpc(name, args);
      },
    };
    const worker = createIngredientAiNutritionWorker({ client, generate: async () => estimate, refresh: vi.fn() });
    expect((await worker.runOnce()).status).toBe('applied');
    expect(base.calls.some(call => call.name === 'fail_ingredient_ai_nutrition_job')).toBe(false);
  });
  it('does not invoke a model when claim is disabled or empty', async () => { for (const status of ['disabled', 'idle', 'daily_limit']) {
    const s = setup({ claim_ingredient_ai_nutrition_job: { status } });
    const generate = vi.fn();
    const w = createIngredientAiNutritionWorker({ ...s, generate, refresh: vi.fn() });
    expect((await w.runOnce()).status).toBe(status);
    expect(generate).not.toHaveBeenCalled();
  } });
  it('sends only validated metadata and preserves nullable values', async () => { const s = setup(); const generate = vi.fn(async () => estimate); const w = createIngredientAiNutritionWorker({ ...s, generate, refresh: vi.fn(), now: () => new Date('2026-10-08T00:00:00Z') }); await w.runOnce(); const complete = s.calls.find(c => c.name === 'complete_ingredient_ai_nutrition_job')!; expect(complete.args).toMatchObject({ p_job_id: 'job', p_lease_token: 'lease', p_result: { context_hash: 'hash', model: 'gemini-test', basis: { amount: 100, unit: 'g' }, values: { sodium_mg: null } } }); expect(generate).toHaveBeenCalledWith(expect.objectContaining({ standard_name: '생 삼나물' }), 'gemini-test'); });
  it('lets an official source win after generation without forcing replacement', async () => { const s = setup({ complete_ingredient_ai_nutrition_job: { status: 'skipped_official' } }); const w = createIngredientAiNutritionWorker({ ...s, generate: async () => estimate, refresh: vi.fn() }); expect((await w.runOnce()).status).toBe('skipped_official'); expect(s.calls.find(c => c.name === 'complete_ingredient_ai_nutrition_job')?.args).not.toHaveProperty('force'); });
  it('does not generate after the context check skips a now-covered ingredient', async () => { const s = setup({ get_ingredient_ai_nutrition_context: { status: 'skipped' } }); const generate = vi.fn(); const w = createIngredientAiNutritionWorker({ ...s, generate, refresh: vi.fn() }); await w.runOnce(); expect(generate).not.toHaveBeenCalled(); });
  it('records normalized retryable errors without leaking provider text', async () => { const s = setup(); const w = createIngredientAiNutritionWorker({ ...s, generate: async () => { throw new Error('https://provider?key=secret'); }, refresh: vi.fn() }); const result = await w.runOnce(); expect(JSON.stringify(result)).not.toContain('secret'); expect(s.calls.find(c => c.name === 'fail_ingredient_ai_nutrition_job')?.args).toMatchObject({ p_error_code: 'INTERNAL_ERROR', p_retryable: true }); });
  it('requeues a disabled context without calling the provider', async () => { const s = setup({ get_ingredient_ai_nutrition_context: { status: 'disabled' } }); const generate = vi.fn(); await createIngredientAiNutritionWorker({ ...s, generate, refresh: vi.fn() }).runOnce(); expect(generate).not.toHaveBeenCalled(); expect(s.calls.find(c => c.name === 'fail_ingredient_ai_nutrition_job')?.args).toMatchObject({ p_error_code: 'CONFIGURATION_ERROR', p_retryable: true }); });
  it('does not endlessly retry structurally invalid estimates', async () => { const s = setup(); const w = createIngredientAiNutritionWorker({ ...s, generate: async () => { throw new AiNutritionError('AI_NUTRITION_UNESTIMABLE'); }, refresh: vi.fn() }); await w.runOnce(); expect(s.calls.find(c => c.name === 'fail_ingredient_ai_nutrition_job')?.args.p_retryable).toBe(false); });
  it('leaves failed snapshot refreshes pending and acknowledges successful ones only', async () => { const s = setup({ claim_ingredient_ai_nutrition_job: { status: 'idle' }, list_ingredient_ai_nutrition_refresh_jobs: [{ job_id: 'j', pending_recipe_ids: ['good', 'bad'] }] }); const refresh = vi.fn(async (_j, id) => { if (id === 'bad')
    throw Error('retry later'); }); await createIngredientAiNutritionWorker({ ...s, generate: vi.fn(), refresh }).runOnce(); expect(s.calls.filter(c => c.name === 'acknowledge_ingredient_ai_nutrition_refresh')).toEqual([{ name: 'acknowledge_ingredient_ai_nutrition_refresh', args: { p_job_id: 'j', p_recipe_ids: ['good'] } }]); });
  it('serializes overlapping local wakes while DB leases cover other processes', async () => { const s = setup(); let release!: () => void; const pending = new Promise<void>(r => { release = r; }); const generate = vi.fn(async () => { await pending; return estimate; }); const w = createIngredientAiNutritionWorker({ ...s, generate, refresh: vi.fn() }); const a = w.runOnce(), b = w.runOnce(); expect(a).toBe(b); release(); await a; expect(s.calls.filter(c => c.name === 'claim_ingredient_ai_nutrition_job')).toHaveLength(1); });
});
