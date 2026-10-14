import { describe, expect, it, vi } from "vitest";
import { projectCurrentC01SampleSource, readWeightImprovementSourceDraft,
  type WeightImprovementSourceRecords } from "@/lib/server/weight-improvement-source-reader";
import { CURRENT_C01_MEASUREMENT_CONFIRMATIONS, WEIGHT_IMPROVEMENT_SAMPLE_POLICY } from "@/lib/server/weight-improvement-sample-gate";
import { sampleParticipation, sampleSourceBinding, sampleSourceLineage, SAMPLE_FIXTURE_POLICY } from "./fixtures/weight-improvement-sample";
import { PARTICIPATION_OTHER_OWNER } from "./fixtures/weight-improvement-participation";

const SNAPSHOT = "550e8400-e29b-41d4-a716-446655440071";
const PREDICTION = "550e8400-e29b-41d4-a716-446655440072";
const ROW = "550e8400-e29b-41d4-a716-446655440073";
const INGREDIENT = "550e8400-e29b-41d4-a716-446655440074";
const NOW = "2026-10-14T02:00:00Z";
function records(): WeightImprovementSourceRecords {
  const binding = sampleSourceBinding();
  const identity = { owner_uuid: binding.subject.owner_uuid, account_generation: binding.subject.account_generation,
    batch_id: binding.source_batch_id, recipe_content_snapshot_id: SNAPSHOT, original_revision: binding.original_revision };
  const unknown = { value: null, status: "unknown", evidenceRef: null } as const;
  return {
    batch: { id: binding.source_batch_id, user_id: binding.subject.owner_uuid, cooked_at: "2026-10-14T01:00:00Z",
      recipe_content_snapshot_id: SNAPSHOT, cooking_servings: 2, revision: 9 },
    observation: { ...identity, id: binding.source_evidence_id, event_kind: "reported_measurement", input_source: "reported_measured",
      refers_to_prediction_id: PREDICTION, measured_g: 160, measurement_path: "before_consumption", observed_at: "2026-10-14T01:01:00Z" },
    prediction: { ...identity, id: PREDICTION, event_kind: "prediction", original_revision: 1, prediction_json: {
      schemaVersion: "cooked-weight-evidence-v1", inputVersion: "snapshot-weight-v2", catalogVersion: "usda-release2-2014",
      recipeSnapshotId: SNAPSHOT, cookingServings: 2, prediction: { modelVersion: "bounded-weight-v2", scope: "candidate", learningEligible: false,
        input: { recipeSnapshotId: SNAPSHOT, cookingServings: 2, rows: [{ rowKey: ROW, sourceKind: "ingredient", sourceId: INGREDIENT,
          sourceVersion: null, amount: 200, unit: "g", grams: 200, quantityOrigin: "planned",
          gramsEvidence: { kind: "direct_mass", status: "confirmed", version: null, quality: "exact" } }],
        segments: [{ method: unknown, boundary: unknown, drainage: unknown, addedMedia: unknown, protocol: unknown }] } } } },
    current_relation: { ...sampleSourceLineage(), state: "current", recipe_content_snapshot_id: SNAPSHOT },
  };
}
function input(source = records()) {
  return { enabled: true, participation: sampleParticipation(), binding: sampleSourceBinding(),
    repository: { readSource: vi.fn(async () => source) }, policy: SAMPLE_FIXTURE_POLICY, now: NOW };
}

describe("D3b inactive C01 source reader preparation", () => {
  it("does not query the source by default or when explicitly OFF", async () => {
    for (const enabled of [undefined, false]) {
      const args = { ...input(), enabled };
      expect(await readWeightImprovementSourceDraft(args)).toMatchObject({ status: "disabled", source_lookup_performed: false,
        draft: null, collection_allowed: false, storage_write_allowed: false });
      expect(args.repository.readSource).not.toHaveBeenCalled();
    }
  });
  it("keeps real pending policy and missing policy components query-free", async () => {
    for (const policy of [WEIGHT_IMPROVEMENT_SAMPLE_POLICY, { ...SAMPLE_FIXTURE_POLICY, deletion_restore_validation: null }]) {
      const args = { ...input(), policy };
      const result = await readWeightImprovementSourceDraft(args);
      expect(result.reasons).toContain("policy_pending");
      expect(args.repository.readSource).not.toHaveBeenCalled();
    }
  });
  it.each(["withdrawn", "declined", "unanswered"] as const)("does not query for %s or infer participation", async decision => {
    const args = { ...input(), participation: { ...sampleParticipation(), decision } };
    expect((await readWeightImprovementSourceDraft(args)).reasons).toContain("consent_not_current");
    expect(args.repository.readSource).not.toHaveBeenCalled();
  });
  it("rejects a foreign/stale consent binding before source lookup", async () => {
    for (const binding of [sampleSourceBinding({ subject: { owner_uuid: PARTICIPATION_OTHER_OWNER, account_generation: 3 } }),
      sampleSourceBinding({ subject: { ...sampleSourceBinding().subject, account_generation: 4 } }), sampleSourceBinding({ consent_revision: 3 }),
      sampleSourceBinding({ consent_document_hash: "b".repeat(64) })]) {
      const args = { ...input(), binding };
      expect((await readWeightImprovementSourceDraft(args)).draft).toBeNull();
      expect(args.repository.readSource).not.toHaveBeenCalled();
    }
  });
  it("does not query malformed or noncanonical private source bindings", async () => {
    for (const binding of [sampleSourceBinding({ sample_id: "bad" }),
      sampleSourceBinding({ sample_id: sampleSourceBinding().sample_id.toUpperCase() }),
      sampleSourceBinding({ original_revision: 0 }), sampleSourceBinding({ source_batch_id: "bad" })]) {
      const args = { ...input(), binding };
      expect((await readWeightImprovementSourceDraft(args)).reasons).toContain("source_binding_invalid");
      expect(args.repository.readSource).not.toHaveBeenCalled();
    }
    const args = { ...input(), participation: Object.assign(sampleParticipation(), { purpose: "advertising" }) };
    expect((await readWeightImprovementSourceDraft(args)).reasons).toContain("source_binding_mismatch");
    expect(args.repository.readSource).not.toHaveBeenCalled();
  });
  it("passes only a detached private lineage address and leaves current C01 facts ineligible", async () => {
    const args = input();
    const result = await readWeightImprovementSourceDraft(args);
    expect(args.repository.readSource).toHaveBeenCalledExactlyOnceWith(sampleSourceLineage());
    expect(result).toMatchObject({ status: "assessed", source_lookup_performed: true, draft: null,
      collection_allowed: false, storage_write_allowed: false });
    expect(result.reasons).toEqual(expect.arrayContaining(["planned_or_unknown_input", "qa_or_unknown", "measurement_boundary_unconfirmed", "retention_pending_or_expired"]));
    const projected = projectCurrentC01SampleSource(records(), args.participation, args.binding);
    expect(projected?.candidate).toMatchObject({ ...CURRENT_C01_MEASUREMENT_CONFIRMATIONS, expires_at: null,
      original_revision: 2, current_evidence_original_revision: 2, cooking_servings: 2 });
    expect(projected?.candidate.rows[0]).toMatchObject({ amount: 200, grams: 200, unit: "g", quantity_origin: "planned" });
  });
  it("requires an explicit current relationship instead of latest-record or batch-revision guesses", () => {
    const source = records();
    expect(projectCurrentC01SampleSource(source, sampleParticipation(), sampleSourceBinding())).not.toBeNull();
    expect(projectCurrentC01SampleSource({ ...source, current_relation: null }, sampleParticipation(), sampleSourceBinding())).toBeNull();
    for (const state of ["unknown", "superseded", "invalidated"] as const) {
      expect(projectCurrentC01SampleSource({ ...source, current_relation: { ...sampleSourceLineage(), state,
        recipe_content_snapshot_id: SNAPSHOT } }, sampleParticipation(), sampleSourceBinding())).toBeNull();
    }
  });
  it("rejects mismatched owner, generation, batch, evidence, snapshot and original revision", () => {
    const source = records();
    const changes: WeightImprovementSourceRecords[] = [
      { ...source, batch: { ...source.batch, user_id: PARTICIPATION_OTHER_OWNER } },
      { ...source, observation: { ...source.observation, owner_uuid: PARTICIPATION_OTHER_OWNER } },
      { ...source, observation: { ...source.observation, account_generation: 4 } },
      { ...source, observation: { ...source.observation, batch_id: SNAPSHOT } },
      { ...source, observation: { ...source.observation, id: SNAPSHOT } },
      { ...source, observation: { ...source.observation, original_revision: 3 } },
      { ...source, observation: { ...source.observation, recipe_content_snapshot_id: PREDICTION } },
      { ...source, observation: { ...source.observation, refers_to_prediction_id: SNAPSHOT } },
      { ...source, prediction: { ...source.prediction, account_generation: 4 } },
      { ...source, prediction: { ...source.prediction, recipe_content_snapshot_id: PREDICTION } },
      { ...source, batch: { ...source.batch, recipe_content_snapshot_id: "not-a-snapshot" } },
      { ...source, current_relation: { ...sampleSourceLineage(), subject: { ...sampleSourceBinding().subject, account_generation: 4 },
        state: "current", recipe_content_snapshot_id: SNAPSHOT } },
    ];
    for (const changed of changes) expect(projectCurrentC01SampleSource(changed, sampleParticipation(), sampleSourceBinding())).toBeNull();
    const json = source.prediction.prediction_json;
    if (!json.prediction.input) throw new Error("Fixture input absent");
    const malformed = "not-a-snapshot";
    const consistentButInvalid = { ...source, batch: { ...source.batch, recipe_content_snapshot_id: malformed },
      observation: { ...source.observation, recipe_content_snapshot_id: malformed },
      prediction: { ...source.prediction, recipe_content_snapshot_id: malformed, prediction_json: { ...json, recipeSnapshotId: malformed,
        prediction: { ...json.prediction, input: { ...json.prediction.input, recipeSnapshotId: malformed } } } },
      current_relation: { ...sampleSourceLineage(), state: "current" as const, recipe_content_snapshot_id: malformed } };
    expect(projectCurrentC01SampleSource(consistentButInvalid, sampleParticipation(), sampleSourceBinding())).toBeNull();
  });
  it("does not convert absent sources or repository failures into eligible or stored drafts", async () => {
    for (const readSource of [vi.fn(async () => null), vi.fn(async () => { throw new Error("fake read failure"); })]) {
      expect(await readWeightImprovementSourceDraft({ ...input(), repository: { readSource } })).toMatchObject({
        status: "source_unavailable", source_lookup_performed: true, draft: null, collection_allowed: false, storage_write_allowed: false });
    }
  });
  it("preserves pinned product/version and amount without today's catalog or a second servings scale", () => {
    const source = records(), json = source.prediction.prediction_json;
    if (!json.prediction.input) throw new Error("Fixture input absent");
    const version = "550e8400-e29b-41d4-a716-446655440081";
    const rows = [{ ...json.prediction.input.rows[0], sourceKind: "food_product" as const, sourceVersion: version,
      amount: 0.125, unit: "package", grams: 25, gramsEvidence: { kind: "product_relation" as const,
        status: "confirmed" as const, version, quality: "exact" as const } }];
    const product = { ...source, prediction: { ...source.prediction, prediction_json: { ...json, prediction: { ...json.prediction,
      input: { ...json.prediction.input, rows } } } } };
    expect(projectCurrentC01SampleSource(product, sampleParticipation(), sampleSourceBinding())?.candidate.rows[0]).toMatchObject({
      source_version: version, amount: 0.125, unit: "package", grams: 25, conversion_version: version });
  });
  it("keeps inferred MIX conditions and missing/legacy prediction inputs unconfirmed", () => {
    const source = records(), json = source.prediction.prediction_json;
    if (!json.prediction.input) throw new Error("Fixture input absent");
    const inferred = { value: "fixture-protocol-v1", status: "inferred", evidenceRef: "snapshot:fixture:MIX" } as const;
    const mix = { ...source, prediction: { ...source.prediction, prediction_json: { ...json, prediction: { ...json.prediction,
      input: { ...json.prediction.input, segments: [{ method: { ...inferred, value: "no_heat" as const },
        boundary: { ...inferred, value: "entire_edible" as const }, drainage: { ...inferred, value: "none" as const },
        addedMedia: { ...inferred, value: "none" as const }, protocol: inferred }] } } } } };
    expect(projectCurrentC01SampleSource(mix, sampleParticipation(), sampleSourceBinding())?.candidate.condition).toBeNull();
    const projected = projectCurrentC01SampleSource(source, sampleParticipation(), sampleSourceBinding());
    expect(projected?.candidate.condition).toBeNull();
    const missing = { ...source, prediction: { ...source.prediction, prediction_json: { ...json,
      prediction: { ...json.prediction, input: null } } } };
    expect(projectCurrentC01SampleSource(missing, sampleParticipation(), sampleSourceBinding())).toBeNull();
    const qa = { ...source, prediction: { ...source.prediction, prediction_json: { ...json,
      prediction: { ...json.prediction, scope: "test_fixture" as const } } } };
    expect(projectCurrentC01SampleSource(qa, sampleParticipation(), sampleSourceBinding())).toBeNull();
  });
  it("uses original cooking time and keeps old cooking ineligible after a new observation", async () => {
    const source = records();
    const result = await readWeightImprovementSourceDraft(input({ ...source, batch: { ...source.batch, cooked_at: "2026-10-13T01:00:00Z" } }));
    expect(result.reasons).toContain("cook_before_consent");
    expect(result.draft).toBeNull();
    expect(projectCurrentC01SampleSource(source, sampleParticipation(), sampleSourceBinding())?.candidate.cooked_at).toBe(source.batch.cooked_at);
  });
  it("does not mutate inputs or echo extra personal fields into the projected candidate", async () => {
    const source = Object.assign(records(), { health_note: "private health", recipe_title: "private title" });
    const args = input(source), original = structuredClone({ source, participation: args.participation, binding: args.binding });
    const projected = projectCurrentC01SampleSource(source, args.participation, args.binding);
    expect(JSON.stringify(projected)).not.toContain("private health");
    expect(JSON.stringify(projected)).not.toContain("private title");
    await readWeightImprovementSourceDraft(args);
    expect({ source, participation: args.participation, binding: args.binding }).toEqual(original);
  });
});
