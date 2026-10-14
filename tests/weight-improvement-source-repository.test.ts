import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWeightImprovementSourceRepository, decodeWeightImprovementSource } from "@/lib/server/weight-improvement-source-repository";
import { readWeightImprovementSourceDraft } from "@/lib/server/weight-improvement-source-reader";
import { sampleParticipation, sampleSourceBinding, sampleSourceLineage, SAMPLE_FIXTURE_POLICY } from "./fixtures/weight-improvement-sample";
import { weightImprovementSourceRecords } from "./fixtures/weight-improvement-source";
const mocks = vi.hoisted(() => ({ factory: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createWeightImprovementParticipationInternalClient: mocks.factory }));
const frame = () => ({ schema_version: "weight-improvement-source-v1", status: "source", source: weightImprovementSourceRecords() });
const authority = { ownerUuid: sampleParticipation().subject.owner_uuid, authIdentityCreatedAt: "2026-01-01T00:00:00Z",
  sessionKeyHash: "a".repeat(64), hmacKeyVersion: 1, sessionIssuedAt: "2026-01-01T01:00:00Z" };
function input() {
  return { authority, participation: sampleParticipation(), policy: SAMPLE_FIXTURE_POLICY, enabled: true,
    client: { readSource: vi.fn().mockResolvedValue({ data: frame(), error: null }) } };
}
beforeEach(() => mocks.factory.mockReset());
describe("bounded private C01 source repository", () => {
  it("decodes only the exact minimal projection, retaining raw/version/planned/unknown values", () => {
    const data = frame(); const decoded = decodeWeightImprovementSource(data);
    expect(decoded).toEqual(data.source); expect(decoded).not.toBe(data.source);
    expect(decoded?.prediction.prediction_json.prediction.input?.rows[0]).toMatchObject({ quantityOrigin: "planned", unit: "g", amount: 200, sourceVersion: null });
  });
  it("rejects unknown envelopes, extra private fields, invalid numeric/enum/fact/version and oversized rows", () => {
    const data = frame(); const row = data.source.prediction.prediction_json.prediction.input!.rows[0];
    const invalid: unknown[] = [null, { ...data, schema_version: "future" }, { ...data, owner: "caller" },
      { ...data, source: { ...data.source, raw_recipe: "private text" } },
      { ...data, source: { ...data.source, batch: { ...data.source.batch, revision: 0 } } },
      { ...data, source: { ...data.source, observation: { ...data.source.observation, measured_g: NaN } } }];
    for (const patch of [{ amount: -1 }, { grams: Infinity }, { quantityOrigin: "actual" }, { sourceVersion: "latest" }, { title: "private" }]) {
      const changed = structuredClone(data); Object.assign(changed.source.prediction.prediction_json.prediction.input!.rows[0], patch); invalid.push(changed);
    }
    const oversized = structuredClone(data); Object.assign(oversized.source.prediction.prediction_json.prediction.input!, { rows: Array(201).fill(row) }); invalid.push(oversized);
    for (const value of invalid) expect(decodeWeightImprovementSource(value)).toBeNull();
    for (const status of ["disabled", "unknown", "unavailable"]) expect(decodeWeightImprovementSource({ ...data, status, source: null })).toBeNull();
  });
  it("never constructs or invokes a client when OFF, policy pending or consent mismatches", async () => {
    for (const options of [{ enabled: false }, { policy: undefined }, { participation: { ...sampleParticipation(), decision: "withdrawn" as const } },
      { participation: { ...sampleParticipation(), consent_document_hash: "b".repeat(64) } }]) {
      const args = { ...input(), ...options }; const repository = createWeightImprovementSourceRepository(args);
      expect(await repository.readSource(sampleSourceLineage())).toBeNull(); expect(args.client.readSource).not.toHaveBeenCalled();
    }
    const args = input();
    await createWeightImprovementSourceRepository({ authority, participation: args.participation, policy: args.policy, enabled: false }).readSource(sampleSourceLineage());
    expect(mocks.factory).not.toHaveBeenCalled();
  });
  it("sends one exact read RPC from the authority, no sample ID/raw quantity/policy claims", async () => {
    const args = input(); const repository = createWeightImprovementSourceRepository(args);
    expect(await repository.readSource(sampleSourceLineage())).toEqual(weightImprovementSourceRecords());
    expect(args.client.readSource).toHaveBeenCalledExactlyOnceWith({ p_owner_uuid: authority.ownerUuid,
      p_auth_identity_created_at_snapshot: authority.authIdentityCreatedAt, p_session_key_hash: authority.sessionKeyHash,
      p_hmac_key_version: 1, p_session_issued_at: authority.sessionIssuedAt,
      p_expected_account_generation: args.participation.subject.account_generation, p_consent_revision: args.participation.revision,
      p_document_version: args.participation.consent_document_version, p_document_hash: args.participation.consent_document_hash,
      p_batch_id: sampleSourceLineage().source_batch_id, p_evidence_id: sampleSourceLineage().source_evidence_id,
      p_original_revision: sampleSourceLineage().original_revision });
  });
  it("rejects foreign addresses and wrong owner/generation results instead of attaching a response", async () => {
    const args = input(); const repository = createWeightImprovementSourceRepository(args);
    for (const address of [sampleSourceLineage({ subject: { owner_uuid: "foreign", account_generation: 3 } }),
      sampleSourceLineage({ original_revision: 0 }), sampleSourceLineage({ source_batch_id: "bad" })]) {
      expect(await repository.readSource(address)).toBeNull(); expect(args.client.readSource).not.toHaveBeenCalled();
    }
    const wrong = frame(); Object.assign(wrong.source.observation, { account_generation: wrong.source.observation.account_generation + 1 });
    args.client.readSource.mockResolvedValue({ data: wrong, error: null });
    expect(await repository.readSource(sampleSourceLineage())).toBeNull();
  });
  it("pins the read subject and keeps current real-source facts ineligible after the repository read", async () => {
    const args = input(); const original = structuredClone(args.participation);
    const repository = createWeightImprovementSourceRepository(args); args.participation.subject.account_generation += 1;
    const binding = sampleSourceBinding();
    const assessed = await readWeightImprovementSourceDraft({ enabled: true, participation: original, binding, repository,
      policy: SAMPLE_FIXTURE_POLICY, now: "2026-10-14T02:00:00Z" });
    expect(assessed).toMatchObject({ status: "assessed", draft: null, collection_allowed: false, storage_write_allowed: false });
    expect(assessed.reasons).toEqual(expect.arrayContaining(["planned_or_unknown_input", "qa_or_unknown", "measurement_boundary_unconfirmed", "retention_pending_or_expired"]));
  });
  it("returns no source for an RPC failure or a server-side disabled response", async () => {
    const args = input();
    for (const response of [{ data: null, error: { message: "PARTICIPATION_SUBJECT_CHANGED" } },
      { data: { schema_version: "weight-improvement-source-v1", status: "disabled", source: null }, error: null }]) {
      args.client.readSource.mockResolvedValue(response);
      expect(await createWeightImprovementSourceRepository(args).readSource(sampleSourceLineage())).toBeNull();
    }
  });
});
