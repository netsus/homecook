import { describe, expect, it } from "vitest";
import {
  assessWeightImprovementCleanup, assessWeightImprovementSample, CURRENT_C01_MEASUREMENT_CONFIRMATIONS,
  WEIGHT_IMPROVEMENT_SAMPLE_POLICY,
} from "@/lib/server/weight-improvement-sample-gate";
import type { WeightImprovementCleanupProof, WeightImprovementSampleCandidate } from "@/types/weight-improvement-sample";
import { PARTICIPATION_OTHER_OWNER, participationStatus } from "./fixtures/weight-improvement-participation";
import { cleanupProof, sampleCandidate, sampleParticipation, SAMPLE_FIXTURE_POLICY } from "./fixtures/weight-improvement-sample";

const NOW = "2026-10-14T02:00:00Z";
function assess(candidate = sampleCandidate(), participation = sampleParticipation()) {
  return assessWeightImprovementSample({ candidate, participation, policy: SAMPLE_FIXTURE_POLICY, now: NOW });
}

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
