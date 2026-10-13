import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CookedBatchProjection } from "@/types/cooking";
const spies = vi.hoisted(() => ({ rpc: vi.fn(), prediction: vi.fn(), gamification: vi.fn() }));
vi.mock("@/lib/server/cooked-batch-route", () => ({ authorizeCookedBatchRequest: async () => ({ ok: true, user: { id: "550e8400-e29b-41d4-a716-446655440802" }, client: { rpc: spies.rpc }, routeClient: {}, authorityArgs: { fixture_authority: "unchanged" } }), readJson: async (request: Request) => ({ ok: true, value: await request.json() }) }));
vi.mock("@/lib/supabase/server", () => ({ createRecipeMealWeightReadInternalClient: () => null, createSnapshotV2SessionInternalClient: () => ({ rpc: spies.rpc }), createRouteHandlerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "550e8400-e29b-41d4-a716-446655440802" } } }) } }) }));
vi.mock("@/lib/server/cooked-batch-weight-evidence", () => ({ cookedWeightEvidenceEnabled: () => process.env.HOMECOOK_COOKED_WEIGHT_EVIDENCE === "1", readSnapshotWeightPrediction: spies.prediction, summarizeWeightPrediction: () => ({ source: "conditional_estimate", predicted_g: 300, model_version: "bounded-weight-v2", reason_codes: [], assumption_codes: ["all_declared_inputs_retained"] }) }));
vi.mock("@/lib/server/cooked-batch-weight-estimate", () => ({ readCookedWeightEstimate: async () => 225 }));
vi.mock("@/lib/server/cooked-batches", async importActual => ({ ...await importActual<typeof import("@/lib/server/cooked-batches")>(), projectCookedBatchGamification: spies.gamification }));
vi.mock("@/lib/server/account-generation/session-authority", () => ({ readVerifiedAccountGenerationSession: async () => ({ ok: true, sessionAuthority: { ownerUuid: "550e8400-e29b-41d4-a716-446655440802" } }) }));
vi.mock("@/lib/server/recipe-content-snapshot-future-propagation", async importActual => ({ ...await importActual<typeof import("@/lib/server/recipe-content-snapshot-future-propagation")>(), buildSessionAuthorityRpcArgs: () => ({ fixture_authority: "unchanged" }) }));
import { GET as cookMode } from "@/app/api/v1/cooking/session-attempts/[id]/cook-mode/route";
import { POST as complete } from "@/app/api/v1/cooking/session-attempts/[id]/complete/route";
import { PATCH as weight } from "@/app/api/v1/cooked-batches/[id]/weight/route";
import { GET as batches } from "@/app/api/v1/cooked-batches/route";
const batch: CookedBatchProjection = { id: "550e8400-e29b-41d4-a716-446655440801", recipe_id: "550e8400-e29b-41d4-a716-446655440802", recipe_title: "요리", recipe_thumbnail_url: null,
  status: "leftover", cooked_at: "2026-10-13T00:00:00Z", cooking_servings: 2, finished_weight_g: 300, remaining_weight_g: 300,
  weight_status: "known", weight_source: "estimated", batch_status: "available", depleted_reason: null, revision: 1, nutrition_calculation_status: "complete", current_unweighed_closure_event_id: null };
const evidence = { source: "conditional_estimate", predicted_g: 300, model_version: "bounded-weight-v2", reason_codes: [], assumption_codes: ["all_declared_inputs_retained"] };
const context = { params: Promise.resolve({ id: batch.id }) };
function request(method: string, path: string, capability: string | null, body?: unknown) {
  const headers = new Headers({ "Idempotency-Key": "550e8400-e29b-41d4-a716-446655440899" });
  if (capability) headers.set("X-Homecook-Cooked-Weight-Contract", capability);
  return new Request(`http://fixture.invalid/api/v1/${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => { spies.rpc.mockReset(); spies.prediction.mockReset(); spies.prediction.mockResolvedValue({ prediction: { totalGrams: 300 } }); vi.stubEnv("HOMECOOK_COOKED_WEIGHT_EVIDENCE", "1"); });
afterEach(() => vi.unstubAllEnvs());
describe("old tabs and explicit cooked-weight response capability", () => {
  it.each([null, "evidence-v9", "evidence-v1"])("negotiates completion, weight and GET without changing ledger arguments: %s", async capability => {
    const publicBatch = { ...batch, weight_evidence: evidence, weight_evidence_enabled: true };
    spies.rpc.mockResolvedValueOnce({ error: null, data: { session_id: batch.id, contract_version: "snapshot_v2", mode: "standalone", status: "completed", cooked_batch: publicBatch, meals_updated: 0, pantry_removed: 0, cook_count: 1 } });
    const completed = await (await complete(request("POST", "cooking/session-attempts/fixture/complete", capability, { consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null }), context)).json();
    expect(completed.success).toBe(true);
    expect(completed.data.cooked_batch.weight_evidence).toEqual(capability === "evidence-v1" ? evidence : undefined);
    expect(spies.rpc.mock.calls[0][1]).toMatchObject({ fixture_authority: "unchanged", p_session_id: batch.id, p_weight_action: "weigh_later", p_finished_weight_g: null, p_weight_input_source: null });
    expect(spies.rpc.mock.calls[0][1]).not.toHaveProperty("response_capability");
    spies.rpc.mockResolvedValueOnce({ error: null, data: { action: "set_finished_weight", batch: publicBatch, event_id: null } });
    const weighed = await (await weight(request("PATCH", "cooked-batches/fixture/weight", capability, { action: "set_finished_weight", finished_weight_g: 300, expected_revision: 1 }), context)).json();
    expect(weighed.success).toBe(true);
    expect(weighed.data.batch.weight_evidence).toEqual(capability === "evidence-v1" ? evidence : undefined);
    spies.rpc.mockResolvedValueOnce({ error: null, data: { items: [publicBatch], next_cursor: null, has_next: false } });
    const list = await (await batches(request("GET", "cooked-batches", capability))).json();
    expect(list.success).toBe(true);
    expect(list.data.items[0].weight_evidence).toEqual(capability === "evidence-v1" ? evidence : undefined);
    spies.rpc.mockResolvedValueOnce({ error: null, data: { session_id: batch.id, contract_version: "snapshot_v2", mode: "standalone", status: "in_progress",
      recipe: { id: batch.recipe_id, title: "요리", base_servings: 2, cooking_servings: 2, ingredients: [], steps: [] }, pantry_candidates: [], weight_evidence_enabled: true } });
    const mode = await (await cookMode(request("GET", "cooking/session-attempts/fixture/cook-mode", capability), context)).json();
    expect(mode.success).toBe(true);
    expect(mode.data.weight_prediction).toEqual(capability === "evidence-v1" ? evidence : undefined);
    expect(mode.data.weight_evidence_enabled).toBe(capability === "evidence-v1" ? true : undefined);

  });
});
