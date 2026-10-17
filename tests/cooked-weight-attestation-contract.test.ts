import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isWeightAttestationContext, isWeightAttestationInput, isWeightAttestationRecord, isWeightAttestationRetraction } from "@/lib/cooking/cooked-weight-attestation";
import { parseBatchWeightRequest, parseSnapshotV2CompleteRequest } from "@/lib/server/cooked-batches";
import { WEIGHT_ATTESTATION_SCHEMA, WEIGHT_ATTESTATION_STATEMENT, type WeightAttestationContext, type WeightAttestationInput, type WeightAttestationRecord } from "@/types/cooked-weight-attestation";
import { fetchWeightAttestationContext, retractWeightAttestation, updateCookedBatchWeight, completeSnapshotV2CookingSession } from "@/lib/api/cooking";
import type { CookedBatchProjection } from "@/types/cooking";

const spies = vi.hoisted(() => ({ rpc: vi.fn(), prediction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRecipeMealWeightReadInternalClient: () => null }));
vi.mock("@/lib/server/cooked-batch-route", async importActual => ({ ...await importActual<typeof import("@/lib/server/cooked-batch-route")>(), authorizeCookedBatchRequest: async () => ({ ok: true, user: { id: "b1000000-0000-4000-8000-000000000001" }, authorityArgs: { fixture_authority: "unchanged" }, client: { rpc: spies.rpc }, routeClient: {} }) }));
vi.mock("@/lib/server/cooked-batch-weight-evidence", () => ({ cookedWeightEvidenceEnabled: () => true, readSnapshotWeightPrediction: spies.prediction }));
vi.mock("@/lib/server/cooked-batches", async importActual => ({ ...await importActual<typeof import("@/lib/server/cooked-batches")>(), projectCookedBatchGamification: async () => {} }));
import { POST as complete } from "@/app/api/v1/cooking/session-attempts/[id]/complete/route";
import { PATCH as weight } from "@/app/api/v1/cooked-batches/[id]/weight/route";
import { GET as read, PATCH as retract } from "@/app/api/v1/cooked-weight-attestations/[id]/route";

const id = "b4000000-0000-4000-8000-000000000001";
const key = "b4000000-0000-4000-8000-000000000002";
const subject = { owner_uuid: "b1000000-0000-4000-8000-000000000001", account_generation: 1 };
const assertion: WeightAttestationInput = { statement_version: WEIGHT_ATTESTATION_STATEMENT, checked: true as const, expected_subject: subject, expected_context_fingerprint: "e".repeat(64) };
const record: WeightAttestationRecord = { id: "b7000000-0000-4000-8000-000000000001", revision: 1, status: "attested", statement_version: WEIGHT_ATTESTATION_STATEMENT,
  measurement_evidence_id: "b8000000-0000-4000-8000-000000000001", measurement_original_revision: 2, measured_g: 180, recipe_content_snapshot_id: "b3000000-0000-4000-8000-000000000001",
  context_fingerprint: assertion.expected_context_fingerprint, observed_at: "2026-10-15T00:00:00Z", row_count: 1, provenance: "user_attested", physical_verification: "not_verified", record_usage: "qa_personal_record" };
const ctx: WeightAttestationContext = { schema_version: WEIGHT_ATTESTATION_SCHEMA, statement_version: WEIGHT_ATTESTATION_STATEMENT, subject, target_kind: "batch", target_id: id,
  context_fingerprint: "f".repeat(64), recipe_content_snapshot_id: record.recipe_content_snapshot_id, cooking_servings: 2, can_attest: false, record };
const batch: CookedBatchProjection = { id, recipe_id: "b2000000-0000-4000-8000-000000000001", recipe_title: "합성 음식", recipe_thumbnail_url: null, status: "leftover", cooked_at: "2026-10-15T00:00:00Z", cooking_servings: 2,
  finished_weight_g: 180, remaining_weight_g: 180, weight_status: "known", weight_source: "measured", weight_evidence: { source: "reported_measured", predicted_g: null, model_version: null, reason_codes: [] },
  batch_status: "available", depleted_reason: null, revision: 2, nutrition_calculation_status: "complete", current_unweighed_closure_event_id: null };
const completed = { session_id: id, contract_version: "snapshot_v2", mode: "standalone", status: "completed", cooked_batch: batch, meals_updated: 0, pantry_removed: 0, cook_count: 1, weight_attestation: record };
const measured = { action: "set_finished_weight", batch, event_id: null, weight_attestation: record };
const completedBody = { consumed_pantry_item_ids: [], weight_action: "set_finished_weight" as const, finished_weight_g: 180, weight_input_source: "reported_measured" as const, weight_attestation: assertion };
const weightBody = { action: "set_finished_weight" as const, finished_weight_g: 180, expected_revision: 1, weight_input_source: "reported_measured" as const, weight_attestation: assertion };
const retraction = { expected_subject: subject, expected_record_id: record.id, expected_revision: record.revision, expected_context_fingerprint: record.context_fingerprint };
function request(method: string, body?: unknown) { return new Request(`http://fixture.invalid/api/v1/cooked-weight-attestations/${id}?target=batch`, { method, headers: { "Idempotency-Key": key, "X-Homecook-Cooked-Weight-Contract": "evidence-v1" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
const params = { params: Promise.resolve({ id }) };
beforeEach(() => { spies.rpc.mockReset(); spies.prediction.mockResolvedValue({ fixture_prediction: true }); vi.stubEnv("HOMECOOK_COOKED_WEIGHT_EVIDENCE", "1"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("optional personal assertion contracts", () => {
  it("accepts the frozen subject/context but never accepts a client actual row vector or verification claim", () => {
    expect(isWeightAttestationInput(assertion)).toBe(true);
    for (const bad of [{ ...assertion, checked: false }, { ...assertion, actual_rows: [] }, { ...assertion, physical_verified: true }, { ...assertion, expected_subject: { ...subject, account_generation: 0 } }]) expect(isWeightAttestationInput(bad)).toBe(false);
    expect(isWeightAttestationContext(ctx)).toBe(true);
    expect(isWeightAttestationRetraction(retraction)).toBe(true);
    expect(isWeightAttestationRecord({ ...record, status: "physical_verified" })).toBe(false);
    expect(isWeightAttestationContext({ ...ctx, record: { ...record, revision: 99 } })).toBe(false);
  });
  it("keeps unselected/skip clients compatible and rejects checks without a new reported measurement", () => {
    expect(parseSnapshotV2CompleteRequest({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null }).ok).toBe(true);
    expect(parseBatchWeightRequest({ action: "set_finished_weight", finished_weight_g: 180, expected_revision: 1 }).ok).toBe(true);
    expect(parseSnapshotV2CompleteRequest(completedBody).ok).toBe(true);
    expect(parseBatchWeightRequest(weightBody).ok).toBe(true);
    expect(parseSnapshotV2CompleteRequest({ ...completedBody, weight_action: "weigh_later", finished_weight_g: null }).ok).toBe(false);
    expect(parseBatchWeightRequest({ ...weightBody, weight_input_source: undefined }).ok).toBe(false);
    expect(parseBatchWeightRequest({ ...weightBody, weight_attestation: null }).ok).toBe(false);
  });
  it("uses only the atomic wrapper on explicit check with original authority and prediction arguments", async () => {
    spies.rpc.mockResolvedValueOnce({ data: completed, error: null });
    expect((await complete(request("POST", completedBody), params)).status).toBe(200);
    expect(spies.rpc).toHaveBeenCalledWith("complete_snapshot_v2_cooking_session_with_attestation", expect.objectContaining({ fixture_authority: "unchanged", p_checked: true, p_expected_generation: 1, p_expected_context: assertion.expected_context_fingerprint, p_prediction: { fixture_prediction: true } }));
    spies.rpc.mockResolvedValueOnce({ data: measured, error: null });
    expect((await weight(request("PATCH", weightBody), params)).status).toBe(200);
    expect(spies.rpc.mock.calls[1][0]).toBe("mutate_cooked_batch_weight_with_attestation");
    expect(spies.rpc.mock.calls[1][1]).not.toHaveProperty("headers");
  });
  it("keeps unchanged execution revision zero on the existing attestation path",async()=>{
    spies.rpc.mockResolvedValueOnce({data:completed,error:null});
    expect((await complete(request("POST",{...completedBody,execution_revision:0}),params)).status).toBe(200);
    expect(spies.rpc.mock.calls[0][0]).toBe("complete_snapshot_v2_cooking_session_with_attestation");
  });
  it("rejects a stale original-quantity attestation after execution edits",async()=>{
    expect((await complete(request("POST",{...completedBody,execution_revision:1}),params)).status).toBe(409);expect(spies.rpc).not.toHaveBeenCalled();
  });
  it("does not fallback or silently drop an explicit choice when OFF/context/old-receipt fails", async () => {
    for (const code of ["WEIGHT_ATTESTATION_DISABLED", "WEIGHT_ATTESTATION_CONTEXT_CHANGED", "WEIGHT_ATTESTATION_OLD_RECEIPT"]) {
      spies.rpc.mockResolvedValueOnce({ data: null, error: { code: "55000", message: code } });
      const response = await weight(request("PATCH", weightBody), params);
      expect(response.status).toBe(409); expect((await response.json()).error.code).toBe(code);
    }
    expect(spies.rpc).toHaveBeenCalledTimes(3);
  });
  it("reads while OFF and retracts with the original record fingerprint, not current batch fingerprint", async () => {
    spies.rpc.mockResolvedValueOnce({ data: ctx, error: null });
    expect((await (await read(request("GET"), params)).json()).data).toEqual(ctx);
    spies.rpc.mockResolvedValueOnce({ data: { ...ctx, record: { ...record, revision: 2, status: "retracted" } }, error: null });
    expect((await retract(request("PATCH", retraction), params)).status).toBe(200);
    expect(spies.rpc.mock.calls[1][1]).toMatchObject({ fixture_authority: "unchanged", p_expected_context: record.context_fingerprint, p_expected_generation: 1 });
  });
  it("rejects foreign subjects before mutation, and malformed/foreign read responses", async () => {
    const wrong = { ...assertion, expected_subject: { ...subject, owner_uuid: "b1000000-0000-4000-8000-000000000002" } };
    expect((await complete(request("POST", { ...completedBody, weight_attestation: wrong }), params)).status).toBe(409);
    expect(spies.rpc).not.toHaveBeenCalled();
    spies.rpc.mockResolvedValueOnce({ data: { ...ctx, subject: wrong.expected_subject }, error: null });
    expect((await read(request("GET"), params)).status).toBe(500);
  });
  it("requires a validated matching ACK at API and client boundaries", async () => {
    spies.rpc.mockResolvedValueOnce({ data: { ...measured, weight_attestation: undefined }, error: null });
    expect((await weight(request("PATCH", weightBody), params)).status).toBe(500);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: measured, error: null }) }); vi.stubGlobal("fetch", fetcher);
    expect((await updateCookedBatchWeight(id, weightBody, key)).weight_attestation).toEqual(record);
    fetcher.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { ...measured, weight_attestation: { ...record, context_fingerprint: "a".repeat(64) } }, error: null }) });
    await expect(updateCookedBatchWeight(id, weightBody, key)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    fetcher.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: completed, error: null }) });
    expect((await completeSnapshotV2CookingSession(id, completedBody, key, "standalone")).weight_attestation).toEqual(record);
  });
  it("uses the real read/retract client paths and validates target identity", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: ctx, error: null }) }).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { ...ctx, record: { ...record, revision: 2, status: "retracted" } }, error: null }) }); vi.stubGlobal("fetch", fetcher);
    expect(await fetchWeightAttestationContext("batch", id)).toEqual(ctx);
    expect((await retractWeightAttestation(id, retraction, key)).record?.status).toBe("retracted");
    expect(fetcher.mock.calls[1][0]).toBe(`/api/v1/cooked-weight-attestations/${id}`);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(retraction);
  });
});
