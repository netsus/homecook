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
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
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

const disabled = { data: null, error: { code: "55000", message: "COOKED_WEIGHT_EVIDENCE_DISABLED" } };
const skipped = { consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null };
const legacyBatch = { ...batch, finished_weight_g: 225, remaining_weight_g: 225 };
const completedLegacy = { session_id: batch.id, contract_version: "snapshot_v2", mode: "standalone", status: "completed", cooked_batch: legacyBatch, meals_updated: 0, pantry_removed: 0, cook_count: 1 };
describe("DB-disabled evidence and compatible personal writes", () => {
  it.each([null, "evidence-v1", "evidence-v9"])("completes a source-null request through the original RPC after exact server-disabled failure: %s", async capability => {
    spies.rpc.mockResolvedValueOnce(disabled).mockResolvedValueOnce({ error: null, data: completedLegacy });
    const response = await complete(request("POST", "cooking/session-attempts/fixture/complete", capability, skipped), context);
    const result = await response.json();
    expect(response.status).toBe(200); expect(result.success).toBe(true);
    expect(spies.rpc.mock.calls.map(call => call[0])).toEqual(["complete_snapshot_v2_cooking_session_with_weight_evidence", "complete_snapshot_v2_cooking_session"]);
    expect(spies.rpc.mock.calls[1][1]).toMatchObject({ fixture_authority: "unchanged", p_weight_action: "estimate_from_ingredients", p_finished_weight_g: 225 });
    for (const key of ["p_prediction", "p_weight_input_source", "p_write_enabled"]) expect(spies.rpc.mock.calls[1][1]).not.toHaveProperty(key);
    expect(result.data.cooked_batch.weight_evidence?.source).not.toBe("reported_measured");
  });
  it("preserves a source-null manual completion weight without converting it to reported measured", async () => {
    spies.rpc.mockResolvedValueOnce(disabled).mockResolvedValueOnce({ error: null, data: { ...completedLegacy, cooked_batch: { ...batch, weight_source: "measured" } } });
    const response = await complete(request("POST", "cooking/session-attempts/fixture/complete", "evidence-v1", { consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 300 }), context);
    expect(response.status).toBe(200); expect((await response.json()).data.cooked_batch.weight_source).toBe("measured");
    expect(spies.rpc.mock.calls[1][0]).toBe("complete_snapshot_v2_cooking_session");
    expect(spies.rpc.mock.calls[1][1]).toMatchObject({ p_weight_action: "set_finished_weight", p_finished_weight_g: 300 });
    expect(spies.rpc.mock.calls[1][1]).not.toHaveProperty("p_weight_input_source");
  });
  it("keeps the old source-null weight request compatible without inventing a measurement observation", async () => {
    spies.rpc.mockResolvedValueOnce(disabled).mockResolvedValueOnce({ error: null, data: { action: "set_finished_weight", batch: { ...batch, weight_evidence: { source: "legacy_unknown", predicted_g: null, model_version: null, reason_codes: [] } }, event_id: null } });
    const response = await weight(request("PATCH", "cooked-batches/fixture/weight", "evidence-v1", { action: "set_finished_weight", finished_weight_g: 300, expected_revision: 1 }), context);
    expect(response.status).toBe(200); expect((await response.json()).data.batch.weight_evidence.source).toBe("legacy_unknown");
    expect(spies.rpc.mock.calls.map(call => call[0])).toEqual(["mutate_cooked_batch_weight_with_evidence", "mutate_cooked_batch_weight"]);
    expect(spies.rpc.mock.calls[1][1]).not.toHaveProperty("p_weight_input_source");
    expect(spies.rpc.mock.calls[1][1]).not.toHaveProperty("p_write_enabled");
  });
  it.each([[null,"reported_measured"],["evidence-v1","reported_measured"],["evidence-v1","manual_estimate"]])("rejects a stale explicit measurement and its unchanged retry instead of downgrading it: %s", async (capability, source) => {
    spies.rpc.mockResolvedValue(disabled);
    const explicit = { consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 300, weight_input_source: source };
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await complete(request("POST", "cooking/session-attempts/fixture/complete", capability, explicit), context);
      expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("COOKED_WEIGHT_EVIDENCE_DISABLED");
    }
    expect(spies.rpc.mock.calls.every(call => call[0] === "complete_snapshot_v2_cooking_session_with_weight_evidence")).toBe(true);
    expect(spies.rpc.mock.calls[1][1]).toEqual(spies.rpc.mock.calls[0][1]);
  });
  it("does not downgrade an explicit weight PATCH", async () => {
    spies.rpc.mockResolvedValue(disabled);
    const response = await weight(request("PATCH", "cooked-batches/fixture/weight", null, { action: "set_finished_weight", finished_weight_g: 300, expected_revision: 1, weight_input_source: "reported_measured" }), context);
    expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("COOKED_WEIGHT_EVIDENCE_DISABLED");
    expect(spies.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    { error: { code: "55000", message: "CONFLICT" }, status: 409 },
    { error: { code: "55000", message: "ACCOUNT_SESSION_STALE" }, status: 409 },
    { error: { code: "23505", message: "IDEMPOTENCY_KEY_REUSED" }, status: 409 },
    { error: { code: "55000", message: "prefix COOKED_WEIGHT_EVIDENCE_DISABLED suffix" }, status: 500 },
    { error: { code: "42501", message: "COOKED_WEIGHT_EVIDENCE_DISABLED" }, status: 500 },
  ])("never falls back from an ordinary, unauthorized or inexact failure %j", async ({ error, status }) => {
    spies.rpc.mockResolvedValue({ data: null, error });
    const response = await complete(request("POST", "cooking/session-attempts/fixture/complete", "evidence-v1", skipped), context);
    expect(response.status).toBe(status); expect(spies.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([0,1])("keeps the execution revision wrapper on exact evidence-disabled fallback: %s",async execution_revision=>{
    spies.rpc.mockResolvedValueOnce(disabled).mockResolvedValueOnce({error:null,data:completedLegacy});
    const response=await complete(request("POST","cooking/session-attempts/fixture/complete","evidence-v1",{...skipped,execution_revision}),context);
    expect(response.status).toBe(200);expect(spies.rpc.mock.calls.map(call=>call[0])).toEqual(["complete_cooking_execution","complete_cooking_execution"]);
    expect(spies.rpc.mock.calls[1][1]).toMatchObject({p_expected_execution_revision:execution_revision,p_write_enabled:false,p_weight_input_source:null});
    expect(spies.rpc.mock.calls[1][1]).toEqual({...spies.rpc.mock.calls[0][1],p_write_enabled:false});
  });
  it("does not mistake a generic result envelope for the exact disabled SQL exception", async () => {
    spies.rpc.mockResolvedValue({ error: null, data: { success: false, error: disabled.error } });
    const response = await complete(request("POST", "cooking/session-attempts/fixture/complete", "evidence-v1", skipped), context);
    expect(response.status).toBe(500); expect(spies.rpc).toHaveBeenCalledTimes(1);
  });
  it("returns an existing successful evidence receipt without a legacy fallback", async () => {
    spies.rpc.mockResolvedValueOnce({ error: null, data: { ...completedLegacy, cooked_batch: { ...batch, weight_evidence: evidence, weight_evidence_enabled: true } } });
    const response = await complete(request("POST", "cooking/session-attempts/fixture/complete", "evidence-v1", skipped), context);
    expect(response.status).toBe(200); expect((await response.json()).data.cooked_batch.weight_evidence).toEqual(evidence);
    expect(spies.rpc).toHaveBeenCalledTimes(1);
  });
  it("lets a refreshed client submit a new source-null completion after an explicit OFF rejection", async () => {
    spies.rpc.mockResolvedValueOnce(disabled);
    const explicit = { consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 300, weight_input_source: "reported_measured" };
    expect((await complete(request("POST", "cooking/session-attempts/fixture/complete", "evidence-v1", explicit), context)).status).toBe(409);
    spies.rpc.mockResolvedValueOnce(disabled).mockResolvedValueOnce({ error: null, data: completedLegacy });
    const fresh = request("POST", "cooking/session-attempts/fixture/complete", "evidence-v1", skipped);
    fresh.headers.set("Idempotency-Key", "550e8400-e29b-41d4-a716-446655440898");
    expect((await complete(fresh, context)).status).toBe(200);
    expect(spies.rpc.mock.calls[2][1].p_idempotency_key).not.toBe(spies.rpc.mock.calls[0][1].p_idempotency_key);
  });
});

describe("execution quantities through actual cook-mode and completion routes",()=>{
 it("reads adjusted rows once on refresh without exposing private calculation inputs",async()=>{
  const ingredient="550e8400-e29b-41d4-a716-446655440803",pin="550e8400-e29b-41d4-a716-446655440804";
  const original={ingredient_id:ingredient,standard_name:"food",amount:100,unit:"g",ingredient_type:"QUANT",scalable:true,display_text:null};
  const edited={...original,amount:190,scalable:false};
  const mode={session_id:batch.id,contract_version:"snapshot_v2",mode:"standalone",status:"in_progress",recipe:{id:batch.recipe_id,title:"food",base_servings:2,cooking_servings:4,ingredients:[original],steps:[]},pantry_candidates:[],weight_evidence_enabled:true};
  const state={revision:1,snapshot_id:pin,base_servings:2,cooking_servings:4,original_rows:[original],rows:[edited],steps:[],nutrition_snapshot:{private_calculation:true},prediction:{prediction:{totalGrams:142.5,modelVersion:"ingredient-mass-75-v1",reasons:[],assumptions:["ingredient_mass_seventy_five_percent"],input:{private_rows:true}}}};
  for(let refresh=0;refresh<2;refresh++){
   spies.rpc.mockResolvedValueOnce({data:mode,error:null}).mockResolvedValueOnce({data:state,error:null});
   const req=request("GET","cooking/session-attempts/fixture/cook-mode","evidence-v1");req.headers.set("X-Homecook-Execution-Quantities","execution-v1");
   const result=await(await cookMode(req,context)).json();expect(result.success).toBe(true);expect(result.data.execution_revision).toBe(1);expect(result.data.recipe.ingredients[0]).toMatchObject({amount:190,unit:"g",scalable:false});expect(result.data.weight_prediction.predicted_g).toBe(142.5);
   expect(JSON.stringify(result)).not.toMatch(/private_calculation|private_rows|original_rows|nutrition_snapshot/);
  }
  expect(spies.prediction).not.toHaveBeenCalled();
 });
 it("delegates a changed completion to the atomic execution wrapper and preserves its expected revision",async()=>{
  spies.rpc.mockResolvedValueOnce({error:null,data:completedLegacy});
  const response=await complete(request("POST","cooking/session-attempts/fixture/complete","evidence-v1",{...skipped,execution_revision:1}),context);
  expect(response.status).toBe(200);expect(spies.rpc.mock.calls[0][0]).toBe("complete_cooking_execution");expect(spies.rpc.mock.calls[0][1]).toMatchObject({p_expected_execution_revision:1,p_prediction:null,p_weight_action:"weigh_later"});expect(spies.prediction).not.toHaveBeenCalled();
 });
 it("rejects invalid execution revision before reading or mutating a session",async()=>{const response=await complete(request("POST","cooking/session-attempts/fixture/complete","evidence-v1",{...skipped,execution_revision:.5}),context);expect(response.status).toBe(422);expect(spies.rpc).not.toHaveBeenCalled();});
});
