import { parseCanonicalJcs, sha256Jcs } from "./rfc8785-jcs.mjs";
import { validateProductionInventory } from "./local-mac-production-rehearsal-inventory.mjs";

export const CLASSIFICATION_SCHEMA = "homecook.local-mac-production-rehearsal-classification.v1";
export const MIXED_STATE_VOCABULARY = Object.freeze([
  "coherent_running",
  "coherent_prepared",
  "mixed_running",
  "partial_failed_install",
  "orphaned_lock_or_descriptor",
  "migration_authority_incomplete",
  "unknown",
]);

const UNSAFE_STATES = new Set([
  "mixed_running",
  "partial_failed_install",
  "orphaned_lock_or_descriptor",
  "migration_authority_incomplete",
  "unknown",
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function finding(state, path, missingEvidence = []) {
  return {
    finding_id: `release-state-${state}`,
    state,
    evidence_path_digest: sha256Jcs({ path }),
    confidence: state === "unknown" ? "low" : "high",
    missing_evidence: [...missingEvidence].sort(),
  };
}

function recoveryPlanFor(entry, sequence) {
  return {
    finding_id: entry.finding_id,
    sequence,
    required_authority: "separate-approved-release-recovery-task",
    preconditions: ["immutable backup evidence", "operator approval", "exact production identity re-read"],
    expected_mutations: [`manual recovery may mutate surfaces implicated by ${entry.state}`],
    rollback_or_forward_fix_boundary: "decide before any recovery mutation; this artifact performs no action",
  };
}

export function classifyProductionInventory(inventory, {
  classifiedAt = new Date().toISOString(),
} = {}) {
  validateProductionInventory(inventory);
  const { release_artifacts: artifacts, workloads, launchd, migration } = inventory.surfaces;
  const states = [];
  const expectedComponents = ["app", "full_local", "worker"];
  const componentMap = new Map(workloads.map((workload) => [workload.component, workload]));
  const completeComponents = expectedComponents.every((component) => componentMap.has(component));
  const identitiesComplete = completeComponents && expectedComponents.every((component) => {
    const workload = componentMap.get(component);
    return workload.release_sha && workload.release_tree && workload.build_id && workload.sealed_bundle_digest;
  });
  const releaseIdentities = new Set(
    workloads.filter((workload) => workload.health !== "missing" && workload.release_sha)
      .map((workload) => `${workload.release_sha}:${workload.release_tree}:${workload.build_id}:${workload.sealed_bundle_digest}`),
  );
  const currentDescriptor = artifacts.some((artifact) => artifact.kind === "current_descriptor" && artifact.exists);
  const recoveredOrStale = artifacts.some((artifact) => artifact.exists && (
    artifact.kind === "orphaned_descriptor"
    || artifact.kind === "recovered_lock"
    || artifact.kind === "stale_lock"
    || artifact.kind.startsWith("recovered_lock:")
    || artifact.kind.startsWith("stale_lock:")
  ));
  const partial = workloads.some((workload) => workload.health !== "running")
    || launchd.some((job) => job.loaded && job.state !== "running");
  const migrationIncomplete = Boolean(migration.marker_digest || migration.catalog_head)
    && !migration.global_ledger_digest;

  if (!completeComponents || !identitiesComplete) states.push("unknown");
  if (releaseIdentities.size > 1) states.push("mixed_running");
  if (partial) states.push("partial_failed_install");
  if (recoveredOrStale && !currentDescriptor) states.push("orphaned_lock_or_descriptor");
  if (migrationIncomplete) states.push("migration_authority_incomplete");

  const allRunning = completeComponents && expectedComponents.every((component) => componentMap.get(component).health === "running");
  if (states.length === 0 && allRunning && releaseIdentities.size === 1 && currentDescriptor && migration.global_ledger_digest) {
    states.push("coherent_running");
  }
  const prepared = artifacts.some((artifact) => artifact.kind === "prepared_descriptor" && artifact.exists);
  if (states.length === 0 && prepared) states.push("coherent_prepared");
  if (states.length === 0) states.push("unknown");
  states.sort((left, right) => MIXED_STATE_VOCABULARY.indexOf(left) - MIXED_STATE_VOCABULARY.indexOf(right));

  const findings = states.filter((state) => UNSAFE_STATES.has(state)).map((state) => {
    const missing = state === "unknown" ? expectedComponents.filter((component) => !componentMap.has(component)) : [];
    return finding(state, `surfaces/${state}`, missing);
  });
  const recoveryPlan = findings.map(recoveryPlanFor);
  const unsigned = {
    schema: CLASSIFICATION_SCHEMA,
    inventory_digest: inventory.inventory_digest,
    classified_at: classifiedAt,
    states,
    promotion_safe: findings.length === 0,
    mutation_attempt_count: 0,
    findings,
    recovery_plan: recoveryPlan,
  };
  return deepFreeze({ ...unsigned, classification_digest: sha256Jcs(unsigned) });
}

export function parseAndClassifyProductionInventory(source, options) {
  let inventory;
  try {
    inventory = parseCanonicalJcs(source);
  } catch {
    throw new Error("Production inventory classification rejected: input is not canonical RFC8785 JCS.");
  }
  return classifyProductionInventory(inventory, options);
}
