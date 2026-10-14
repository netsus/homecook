import type { WeightImprovementSourceRecords } from "@/lib/server/weight-improvement-source-reader";
import { sampleSourceBinding, sampleSourceLineage } from "./weight-improvement-sample";
const SNAPSHOT = "550e8400-e29b-41d4-a716-446655440071";
const PREDICTION = "550e8400-e29b-41d4-a716-446655440072";
const ROW = "550e8400-e29b-41d4-a716-446655440073";
const INGREDIENT = "550e8400-e29b-41d4-a716-446655440074";
export function weightImprovementSourceRecords(): WeightImprovementSourceRecords {
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
