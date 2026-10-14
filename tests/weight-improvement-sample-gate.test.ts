import { describe, expect, it } from "vitest";
import {
  assessWeightImprovementCleanup, assessWeightImprovementSample, CURRENT_C01_MEASUREMENT_CONFIRMATIONS,
  WEIGHT_IMPROVEMENT_SAMPLE_POLICY,
  buildWeightImprovementSampleStorageDraft, buildWeightImprovementSampleInvalidationAddress, weightImprovementSampleSourceAddress,
} from "@/lib/server/weight-improvement-sample-gate";
import type { WeightImprovementCleanupProof, WeightImprovementSampleCandidate } from "@/types/weight-improvement-sample";
import { PARTICIPATION_OTHER_OWNER, participationStatus } from "./fixtures/weight-improvement-participation";
import { cleanupProof, sampleCandidate, sampleParticipation, SAMPLE_FIXTURE_POLICY, sampleSourceBinding, sampleSourceLineage } from "./fixtures/weight-improvement-sample";
import type { WeightImprovementSampleSourceBinding, WeightImprovementSampleSourceLineage } from "@/types/weight-improvement-sample";

const NOW = "2026-10-14T02:00:00Z";
function assess(candidate = sampleCandidate(), participation = sampleParticipation()) {
  return assessWeightImprovementSample({ candidate, participation, policy: SAMPLE_FIXTURE_POLICY, now: NOW });
}

function storage(binding = sampleSourceBinding(), source_lineage = sampleSourceLineage(), candidate = sampleCandidate(),
  selected_bindings: readonly WeightImprovementSampleSourceBinding[] = [], participation = sampleParticipation()) {
  return buildWeightImprovementSampleStorageDraft({ binding, source_lineage, candidate, selected_bindings, participation, policy: SAMPLE_FIXTURE_POLICY, now: NOW });
}

describe("D3a inactive source binding draft", () => {
  it("keeps actual policy and current C01 facts ineligible and never authorizes storage", () => {
    const result = buildWeightImprovementSampleStorageDraft({ binding: sampleSourceBinding(), source_lineage: sampleSourceLineage(),
      candidate: sampleCandidate(), participation: sampleParticipation(), now: NOW });
    expect(result).toMatchObject({ draft: null, collection_allowed: false, storage_write_allowed: false });
    expect(result.reasons).toContain("policy_pending");
    const current = sampleCandidate({ ...CURRENT_C01_MEASUREMENT_CONFIRMATIONS });
    current.rows = current.rows.map(row => ({ ...row, quantity_origin: "planned" }));
    expect(storage(sampleSourceBinding(), sampleSourceLineage(), current).draft).toBeNull();
    expect(Object.values(WEIGHT_IMPROVEMENT_SAMPLE_POLICY).every(value => value === null)).toBe(true);
  });
  it("projects exact separate feature/link shapes without copying private content or changing inputs", () => {
    const binding = Object.assign(sampleSourceBinding(), { exact_cooked_at: sampleCandidate().cooked_at, recipe_text: "private text" });
    const candidate = Object.assign(sampleCandidate(), { recipe_name: "private title", health_note: "private health", body_weight: 65 });
    const original = structuredClone({ binding, candidate });
    const result = storage(binding, sampleSourceLineage(), candidate);
    expect(result.reasons).toEqual([]);
    expect(result.collection_allowed).toBe(false);
    expect(result.storage_write_allowed).toBe(false);
    expect(result.draft?.private_binding).toEqual(sampleSourceBinding());
    expect(Object.keys(result.draft ?? {})).toEqual(["features", "private_binding"]);
    expect(result.draft?.features).toEqual(assess(candidate).features);
    const features = JSON.stringify(result.draft?.features);
    for (const value of [binding.sample_id, binding.subject.owner_uuid, binding.source_batch_id, binding.source_evidence_id,
      candidate.rows[0].row_key, candidate.cooked_at, candidate.observed_at, "consent_revision", "consent_document", "private", "body_weight"]) expect(features).not.toContain(value);
    expect({ binding, candidate }).toEqual(original);
  });
  it.each([
    { subject: { owner_uuid: PARTICIPATION_OTHER_OWNER, account_generation: 3 } },
    { subject: { owner_uuid: sampleSourceBinding().subject.owner_uuid, account_generation: 4 } },
    { consent_revision: 3 }, { consent_document_version: "other-document" }, { consent_document_hash: "b".repeat(64) },
    { source_batch_id: "550e8400-e29b-41d4-a716-446655440051" },
    { source_evidence_id: "550e8400-e29b-41d4-a716-446655440052" }, { original_revision: 3 },
  ] satisfies Partial<WeightImprovementSampleSourceBinding>[])("rejects source/subject/consent/document mismatch %j", changes => {
    const result = storage(sampleSourceBinding(changes));
    expect(result.draft).toBeNull();
    expect(result.reasons).toContain("source_binding_mismatch");
  });
  it.each([
    { sample_id: "not-a-uuid" }, { source_batch_id: "" }, { source_evidence_id: "bad" },
    { original_revision: -1 }, { consent_revision: 1.5 }, { consent_document_hash: "not-a-hash" },
  ] satisfies Partial<WeightImprovementSampleSourceBinding>[])("rejects invalid private binding shape %j", changes => {
    expect(storage(sampleSourceBinding(changes)).reasons).toContain("source_binding_invalid");
  });
  it("rejects another purpose and a lineage from another owner/generation", () => {
    expect(storage(Object.assign(sampleSourceBinding(), { purpose: "advertising" })).draft).toBeNull();
    for (const subject of [{ owner_uuid: PARTICIPATION_OTHER_OWNER, account_generation: 3 },
      { owner_uuid: sampleSourceBinding().subject.owner_uuid, account_generation: 4 }]) {
      expect(storage(sampleSourceBinding(), sampleSourceLineage({ subject })).reasons).toContain("source_binding_mismatch");
    }
  });
  it("rejects noncanonical UUID aliases and malformed selected-source snapshots", () => {
    const binding = sampleSourceBinding({ source_batch_id: sampleSourceBinding().source_batch_id.toUpperCase() });
    expect(storage(binding, sampleSourceLineage({ source_batch_id: binding.source_batch_id })).reasons).toContain("source_binding_invalid");
    expect(weightImprovementSampleSourceAddress(binding)).toBeNull();
    // Simulate a malformed future JSON reader without making an external API decoder here.
    const notAnArray = Object.assign({}, [sampleSourceBinding()]);
    expect(storage(sampleSourceBinding(), sampleSourceLineage(), sampleCandidate(), notAnArray).reasons).toContain("source_binding_invalid");
  });
  it("does not turn new sample/evidence IDs or consent revisions into another independent batch", () => {
    const previous = sampleSourceBinding();
    const corrected = sampleSourceBinding({ sample_id: "550e8400-e29b-41d4-a716-446655440053", source_evidence_id: "550e8400-e29b-41d4-a716-446655440054", original_revision: 3, consent_revision: 5 });
    const participation = { ...sampleParticipation(), revision: 5 };
    const candidate = sampleCandidate({ original_revision: 3, current_evidence_original_revision: 3, consent_revision: 5 });
    const lineage = sampleSourceLineage({ source_evidence_id: corrected.source_evidence_id, original_revision: 3 });
    expect(weightImprovementSampleSourceAddress(corrected)).toEqual(weightImprovementSampleSourceAddress(previous));
    expect(storage(corrected, lineage, candidate, [previous], participation)).toMatchObject({ draft: null, reasons: ["duplicate_source"] });
    const other = sampleSourceBinding({ source_batch_id: "550e8400-e29b-41d4-a716-446655440055",
      source_evidence_id: "550e8400-e29b-41d4-a716-446655440056", sample_id: "550e8400-e29b-41d4-a716-446655440057" });
    expect(storage(previous, sampleSourceLineage(), sampleCandidate(), [other]).draft).not.toBeNull();
  });
  it("rejects a known sample/evidence/batch identity rebound to another source or account generation", () => {
    const current = sampleSourceBinding();
    const other = sampleSourceBinding({ source_batch_id: "550e8400-e29b-41d4-a716-446655440055",
      source_evidence_id: "550e8400-e29b-41d4-a716-446655440056", sample_id: "550e8400-e29b-41d4-a716-446655440057" });
    for (const previous of [{ ...other, sample_id: current.sample_id }, { ...other, source_evidence_id: current.source_evidence_id },
      sampleSourceBinding({ subject: { ...current.subject, account_generation: 2 } })]) {
      expect(storage(current, sampleSourceLineage(), sampleCandidate(), [previous]).draft).toBeNull();
      expect(storage(current, sampleSourceLineage(), sampleCandidate(), [previous]).reasons).toContain("source_binding_mismatch");
    }
  });
  it("keeps withdrawal, old generation, stale/deleted evidence and old cooking ineligible", () => {
    expect(storage(sampleSourceBinding(), sampleSourceLineage(), sampleCandidate(), [], { ...sampleParticipation(), decision: "withdrawn", revision: 5 }).draft).toBeNull();
    expect(storage(sampleSourceBinding(), sampleSourceLineage(), sampleCandidate(), [], { ...sampleParticipation(), subject: { ...sampleParticipation().subject, account_generation: 4 } }).draft).toBeNull();
    expect(storage(sampleSourceBinding(), sampleSourceLineage(), sampleCandidate({ source_current: false })).draft).toBeNull();
    expect(storage(sampleSourceBinding(), sampleSourceLineage(), sampleCandidate(), [], { ...sampleParticipation(), opted_in_at: "2026-10-14T01:30:00Z" }).draft).toBeNull();
  });
  it.each(["sample_id", "source_batch_id", "source_evidence_id"] as const)("rejects private %s relabelled as a catalog feature", key => {
    const binding = sampleSourceBinding();
    const candidate = sampleCandidate();
    candidate.rows = [{ ...candidate.rows[0], source_id: binding[key] }];
    expect(storage(binding, sampleSourceLineage(), candidate).reasons).toContain("private_feature_value");
    expect(storage(binding, sampleSourceLineage(), candidate).draft).toBeNull();
  });
  it("rejects owner, row ID and exact timestamp relabelled into allowed model fields", () => {
    for (const value of [sampleSourceBinding().subject.owner_uuid, sampleCandidate().rows[0].row_key, sampleCandidate().cooked_at]) {
      expect(storage(sampleSourceBinding(), sampleSourceLineage(), sampleCandidate({ model_version: value })).reasons).toContain("private_feature_value");
    }
    expect(storage(sampleSourceBinding(), sampleSourceLineage(), sampleCandidate({ model_version: sampleSourceBinding().subject.owner_uuid.toUpperCase() })).reasons).toContain("private_feature_value");
  });
  it.each(["withdrawal", "source_invalidated", "source_deleted", "account_deleted"] as const)("addresses %s without deletion/model authority or source changes", reason => {
    const binding = sampleSourceBinding(), lineage = sampleSourceLineage();
    const original = structuredClone({ binding, lineage });
    expect(buildWeightImprovementSampleInvalidationAddress({ binding, source_lineage: lineage, reason })).toEqual({ reason,
      source_address: weightImprovementSampleSourceAddress(binding), private_binding: sampleSourceBinding(), completion_write_allowed: false, model_release_allowed: false });
    expect({ binding, lineage }).toEqual(original);
    expect(assessWeightImprovementCleanup(cleanupProof())).toMatchObject({ completion_write_allowed: false, model_release_allowed: false });
  });
  it.each([
    { subject: { owner_uuid: PARTICIPATION_OTHER_OWNER, account_generation: 3 } },
    { subject: { owner_uuid: sampleSourceBinding().subject.owner_uuid, account_generation: 4 } },
    { source_batch_id: "550e8400-e29b-41d4-a716-446655440061" },
    { source_evidence_id: "550e8400-e29b-41d4-a716-446655440062" }, { original_revision: 3 },
  ] satisfies Partial<WeightImprovementSampleSourceLineage>[])("never points a correction/deletion at another source %j", changes => {
    expect(buildWeightImprovementSampleInvalidationAddress({ binding: sampleSourceBinding(), source_lineage: sampleSourceLineage(changes), reason: "source_invalidated" })).toBeNull();
  });
});

describe("C05 inactive sample boundary", () => {
  it("keeps actual policy/retention null and collection locked even for a complete candidate", () => {
    expect(Object.values(WEIGHT_IMPROVEMENT_SAMPLE_POLICY).every(value => value === null)).toBe(true);
    const result = assessWeightImprovementSample({ candidate: sampleCandidate(), participation: sampleParticipation(), now: NOW });
    expect(result.reasons).toContain("policy_pending");
    expect(result.features).toBeNull();
    expect(result.collection_allowed).toBe(false);
    expect(assess().collection_allowed).toBe(false);
  });
  it("projects only allowed model features from a fictitious fully confirmed source", () => {
    const candidate = { ...sampleCandidate(), email: "private@example.test", recipe_text: "private recipe",
      body_weight: 65, health_note: "private health", recipe_snapshot_id: "private-snapshot", image_url: "private-image" };
    const original = structuredClone(candidate);
    const result = assess(candidate);
    expect(result.reasons).toEqual([]);
    expect(result.features?.measured_g).toBe(160);
    expect(result.features?.rows).toEqual([{ source_kind: "ingredient", source_id: candidate.rows[0].source_id,
      source_version: null, amount: 200, unit: "g", grams: 200, conversion_version: null, conversion_quality: "exact" }]);
    const serialized = JSON.stringify(result.features);
    for (const privateValue of [candidate.subject.owner_uuid, candidate.rows[0].row_key, "private", "observed_at", "consent_revision"]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(candidate).toEqual(original); // Personal service source remains untouched.
  });
  it("keeps the actual current C01 confirmations and planned inputs ineligible", () => {
    const current = sampleCandidate({ ...CURRENT_C01_MEASUREMENT_CONFIRMATIONS });
    current.rows = current.rows.map(row => ({ ...row, quantity_origin: "planned" }));
    const result = assess(current);
    expect(result.reasons).toEqual(expect.arrayContaining(["qa_or_unknown", "measurement_boundary_unconfirmed", "planned_or_unknown_input"]));
    expect(result.features).toBeNull();
  });
  it.each(["unanswered", "declined", "withdrawn"] as const)("does not select for %s", decision => {
    const result = assess(sampleCandidate(), sampleParticipationWithDecision(decision));
    expect(result.reasons).toContain("consent_not_current");
    expect(result.features).toBeNull();
  });
  it("rejects stale consent/document and a different owner or generation", () => {
    expect(assess(sampleCandidate({ consent_revision: 3 })).reasons).toContain("stale_consent_revision");
    expect(assess(sampleCandidate({ subject: { owner_uuid: PARTICIPATION_OTHER_OWNER, account_generation: 3 } })).reasons).toContain("subject_mismatch");
    expect(assess(sampleCandidate({ subject: { ...sampleCandidate().subject, account_generation: 4 } })).reasons).toContain("subject_mismatch");
    expect(assess(sampleCandidate(), { ...sampleParticipation(), consent_document_hash: "b".repeat(64) }).reasons).toContain("consent_not_current");
  });
  it("does not backfill old cooking on measurement save or re-participation", () => {
    expect(assess(sampleCandidate({ cooked_at: "2026-10-13T00:00:00Z" })).reasons).toContain("cook_before_consent");
    expect(assess(sampleCandidate({ cooked_at: "2026-10-14T00:00:00Z" })).reasons).toContain("cook_before_consent");
    expect(assess(sampleCandidate(), { ...sampleParticipation(), opted_in_at: "2026-10-14T01:00:30Z" }).reasons).toContain("cook_before_consent");
  });
  it.each(["prediction", "manual_entry"] as const)("does not use %s as a measured target", event_kind => {
    expect(assess(sampleCandidate({ event_kind })).reasons).toContain("not_reported_measurement");
  });
  it.each(["conditional_estimate", "manual_estimate", "legacy_unknown", "unavailable"] as const)("rejects %s sources", input_source => {
    expect(assess(sampleCandidate({ input_source })).reasons).toContain("not_reported_measurement");
  });
  it.each([
    { qa_record: true }, { qa_record: null }, { whole_batch: false }, { before_consumption: null },
    { container_excluded: false }, { measured_g: 0 }, { measured_g: Infinity }, { input_version: null },
    { source_current: false }, { current_evidence_original_revision: 3 }, { already_selected: true },
    { observed_at: "bad date" }, { observed_at: "2026-10-14T03:00:00Z" }, { observed_at: "2026-10-14T00:30:00Z" },
    { condition: null }, { expires_at: null }, { expires_at: "bad date" }, { expires_at: NOW },
    { expires_at: "2026-10-14T01:59:59Z" },
  ] satisfies Partial<WeightImprovementSampleCandidate>[])("does not project incomplete or invalid facts %j", changes => {
    expect(assess(sampleCandidate(changes)).features).toBeNull();
  });
  it("rejects unknown quantity and invalid unit evidence without reinterpreting amount", () => {
    const candidate = sampleCandidate();
    for (const row of [
      { ...candidate.rows[0], quantity_origin: "unknown" as const },
      { ...candidate.rows[0], conversion_confirmed: false },
      { ...candidate.rows[0], conversion_quality: null },
      { ...candidate.rows[0], unit: "package" },
      { ...candidate.rows[0], grams: 400 },
    ]) expect(assess(sampleCandidate({ rows: [row] })).features).toBeNull();
    expect(assess(sampleCandidate({ rows: [candidate.rows[0], candidate.rows[0]] })).reasons).toContain("quantity_unconfirmed");
  });
  it("binds product conversion to the fixed version and keeps distinct products separate", () => {
    const candidate = sampleCandidate();
    const product = { ...candidate.rows[0], source_kind: "food_product" as const, source_version: "fixed-product-v1",
      amount: 2, unit: "package", grams: 240, conversion_kind: "product_relation" as const, conversion_version: "fixed-product-v1" };
    const other = { ...product, row_key: "other-row", source_id: "other-product", source_version: "other-version", conversion_version: "other-version" };
    const result = assess(sampleCandidate({ rows: [product, other] }));
    expect(result.features?.rows).toHaveLength(2);
    expect(result.features?.rows[0].source_version).toBe("fixed-product-v1");
    expect(assess(sampleCandidate({ rows: [{ ...product, conversion_version: "latest-product-v2" }] })).features).toBeNull();
    expect(assess(sampleCandidate({ rows: [{ ...product, source_version: null }] })).features).toBeNull();
  });
  it("does not project an unapproved protocol or free-text condition into model features", () => {
    const condition: NonNullable<WeightImprovementSampleCandidate["condition"]> = { method: "pan_browning",
      boundary: "drained_edible", drainage: "colander", added_media: "none", protocol: "private health note" };
    expect(assess(sampleCandidate({ condition })).reasons).toContain("conditions_unconfirmed");
    expect(assess(sampleCandidate({ condition })).features).toBeNull();
  });
  it("preserves the uncertainty of an approved ingredient conversion instead of making it exact", () => {
    const row = { ...sampleCandidate().rows[0], unit: "piece", amount: 2, grams: 200,
      conversion_kind: "ingredient_conversion" as const, conversion_version: "fixture-approved-piece-v1", conversion_quality: "estimated" as const };
    expect(assess(sampleCandidate({ rows: [row] })).features?.rows[0].conversion_quality).toBe("estimated");
  });
  it("rejects the same fixture after its definite expiry instead of preserving it indefinitely", () => {
    const result = assessWeightImprovementSample({ candidate: sampleCandidate(), participation: sampleParticipation(),
      policy: SAMPLE_FIXTURE_POLICY, now: "2026-10-14T02:01:00Z" });
    expect(result.reasons).toContain("retention_pending_or_expired");
    expect(result.features).toBeNull();
    expect(result.collection_allowed).toBe(false);
  });
});

function sampleParticipationWithDecision(decision: "unanswered" | "declined" | "withdrawn") {
  return participationStatus({ ...sampleParticipation(), decision });
}

describe("C05 cleanup proof draft", () => {
  it("checks complete fixture evidence but never authorizes a completion write or model release", () => {
    expect(assessWeightImprovementCleanup(cleanupProof())).toEqual({ checks_complete: true, completion_write_allowed: false, model_release_allowed: false });
  });
  it.each([
    { verification_receipt: null }, { sample_rows_remaining: 1 }, { sample_rows_remaining: null },
    { model_memberships_remaining: 1 }, { affected_models_blocked_or_recomputed: false },
    { affected_caches_invalidated: null }, { queued_jobs_cancelled: false }, { account_generation_links_resolved: false },
    { backup_strategy: null }, { backup_restore_verified: false }, { evidence_retention_rule: null },
    { current_revision: 6 }, { requested_revision: -1, current_revision: -1 }, { retry_error: true },
  ] satisfies Partial<WeightImprovementCleanupProof>[])("does not infer deletion complete from missing or stale evidence %j", changes => {
    expect(assessWeightImprovementCleanup(cleanupProof(changes)).checks_complete).toBe(false);
  });
  it("requires a restore exercise even when samples are excluded from backup", () => {
    expect(assessWeightImprovementCleanup(cleanupProof({ backup_strategy: "excluded", backup_restore_verified: null })).checks_complete).toBe(false);
    expect(assessWeightImprovementCleanup(cleanupProof({ backup_strategy: "tombstones_on_restore", backup_restore_verified: null })).checks_complete).toBe(false);
  });
});
