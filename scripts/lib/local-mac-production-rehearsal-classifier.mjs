import { parseCanonicalJcs, sha256Jcs } from "./rfc8785-jcs.mjs";
import {
  CANONICAL_FULL_LOCAL_LAUNCHD_LABEL,
  LEGACY_FULL_LOCAL_LAUNCHD_LABEL,
  validateProductionInventory,
} from "./local-mac-production-rehearsal-inventory.mjs";

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

function assertClassifiedAt(value) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error("Production inventory classification rejected: classified_at must be an exact UTC millisecond instant.");
  }
}

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
  assertClassifiedAt(classifiedAt);
  const {
    release_artifacts: artifacts,
    active_promotion_lock: activePromotionLock,
    workloads,
    launchd,
    docker,
    port_listeners: portListeners,
    opaque_configs: opaqueConfigs,
    migration,
    prepared_identity: preparedIdentity,
  } = inventory.surfaces;
  const states = [];
  const expectedComponents = ["app", "full_local", "worker"];
  const componentMap = new Map(workloads.map((workload) => [workload.component, workload]));
  const completeComponents = workloads.length === expectedComponents.length
    && componentMap.size === expectedComponents.length
    && expectedComponents.every((component) => componentMap.has(component));
  const identitiesComplete = completeComponents && expectedComponents.every((component) => {
    const workload = componentMap.get(component);
    return workload.release_sha && workload.release_tree && workload.build_id && workload.sealed_bundle_digest;
  });
  const releaseIdentities = new Set(
    workloads.filter((workload) => workload.health !== "missing" && workload.release_sha)
      .map((workload) => `${workload.release_sha}:${workload.release_tree}:${workload.build_id}:${workload.sealed_bundle_digest}`),
  );
  const currentDescriptor = artifacts.some((artifact) => artifact.kind === "current_descriptor" && artifact.exists);
  const currentDescriptorEvidence = artifacts.find((artifact) => artifact.kind === "current_descriptor" && artifact.exists);
  const recoveredOrStale = artifacts.some((artifact) => artifact.exists && (
    artifact.kind === "orphaned_descriptor"
    || artifact.kind === "recovered_lock"
    || artifact.kind === "stale_lock"
    || artifact.kind.startsWith("recovered_lock:")
    || artifact.kind.startsWith("stale_lock:")
  ));
  const partial = workloads.some((workload) => workload.health !== "running")
    || launchd.some((job) => job.loaded && job.state !== "running");
  const migrationIncomplete = Boolean(migration.marker_digest || migration.catalog_head || migration.migration_head)
    && (!migration.approved || !migration.global_ledger_digest || migration.migration_head !== migration.catalog_head);
  const requiredProbeNames = ["release_artifacts", "active_promotion_lock", "workloads", "launchd", "docker", "port_listeners", "opaque_configs", "migration", "tool_identities"];
  const probesComplete = requiredProbeNames.every((name) => inventory.probe_statuses[name].status === "success");
  const toolNames = inventory.tool_identities.map((tool) => tool.name).sort();
  const toolsComplete = JSON.stringify(toolNames) === JSON.stringify(["docker", "git", "launchctl", "lsof"]);
  const launchdLabels = new Set(launchd.map((job) => job.label));
  const fullLocalLaunchdCount = [CANONICAL_FULL_LOCAL_LAUNCHD_LABEL, LEGACY_FULL_LOCAL_LAUNCHD_LABEL]
    .filter((label) => launchdLabels.has(label)).length;
  const launchdObservedComplete = launchd.length === 3 && [
    "com.homecook.production",
    "com.homecook.youtube-extraction-worker",
  ].every((label) => launchdLabels.has(label))
    && fullLocalLaunchdCount === 1
    && launchd.every((job) => job.loaded && job.state === "running" && Number.isSafeInteger(job.pid));
  const canonicalLaunchdComplete = launchdObservedComplete
    && launchdLabels.has(CANONICAL_FULL_LOCAL_LAUNCHD_LABEL);
  const dockerComplete = docker.containers.length > 0 && docker.networks.length > 0 && docker.volumes.length > 0
    && docker.containers.every((container) => container.state === "running");
  const portsComplete = portListeners.some((listener) => listener.port === 3100 && Number.isSafeInteger(listener.pid));
  const configIdentities = new Set(opaqueConfigs.map((config) => config.identity));
  const configsComplete = opaqueConfigs.length === 2
    && configIdentities.has("production-env") && configIdentities.has("full-local-config")
    && opaqueConfigs.every((config) => config.exists);
  const plistKinds = new Set(artifacts.filter((artifact) => artifact.exists).map((artifact) => artifact.kind));
  const canonicalPlistComplete = [
    "launch_agent_plist:com.homecook.production",
    `launch_agent_plist:${CANONICAL_FULL_LOCAL_LAUNCHD_LABEL}`,
    "launch_agent_plist:com.homecook.youtube-extraction-worker",
  ].every((kind) => plistKinds.has(kind));
  const descriptorsAligned = Boolean(currentDescriptorEvidence)
    && workloads.every((workload) => workload.descriptor_digest === currentDescriptorEvidence.sha256);
  const requiredSurfacesComplete = probesComplete && toolsComplete && canonicalLaunchdComplete && dockerComplete && portsComplete
    && configsComplete && canonicalPlistComplete && descriptorsAligned;
  const preparedDescriptor = artifacts.find((artifact) => artifact.kind === "prepared_descriptor" && artifact.exists);
  const preparedEvidenceComplete = preparedIdentity === null
    ? preparedDescriptor === undefined
    : preparedDescriptor !== undefined && preparedDescriptor.sha256 === preparedIdentity.descriptor_digest;
  const unsubstantiatedPrepared = !preparedEvidenceComplete;
  const runningIdentity = completeComponents ? componentMap.get("app") : null;
  const prepared = preparedIdentity !== null && preparedIdentity.attested === true
    && preparedIdentity.status === "prepared"
    && preparedEvidenceComplete
    && runningIdentity
    && preparedIdentity.release_sha !== runningIdentity.release_sha;
  const invalidPreparedIdentity = preparedIdentity !== null && !prepared;

  if (!completeComponents || !identitiesComplete || !requiredSurfacesComplete || unsubstantiatedPrepared
    || invalidPreparedIdentity || migrationIncomplete || activePromotionLock.exists) states.push("unknown");
  if (releaseIdentities.size > 1) states.push("mixed_running");
  if (partial) states.push("partial_failed_install");
  if (recoveredOrStale && !currentDescriptor) states.push("orphaned_lock_or_descriptor");
  if (migrationIncomplete) states.push("migration_authority_incomplete");

  const allRunning = completeComponents && expectedComponents.every((component) => componentMap.get(component).health === "running");
  if (states.length === 0 && allRunning && releaseIdentities.size === 1 && currentDescriptor
    && migration.approved && migration.global_ledger_digest && migration.migration_head === migration.catalog_head) {
    states.push("coherent_running");
  }
  if (states.length === 1 && states[0] === "coherent_running" && prepared) states.push("coherent_prepared");
  if (states.length === 0) states.push("unknown");
  states.sort((left, right) => MIXED_STATE_VOCABULARY.indexOf(left) - MIXED_STATE_VOCABULARY.indexOf(right));

  const findings = states.filter((state) => UNSAFE_STATES.has(state)).map((state) => {
    const missing = state === "unknown"
      ? [
          ...expectedComponents.filter((component) => !componentMap.has(component)),
          ...requiredProbeNames.filter((name) => inventory.probe_statuses[name].status !== "success").map((name) => `probe:${name}`),
          ...(!launchdObservedComplete ? ["surface:launchd"] : []),
          ...(!canonicalLaunchdComplete || !canonicalPlistComplete ? ["surface:canonical_full_local_launchd"] : []),
          ...(!dockerComplete ? ["surface:docker"] : []),
          ...(!portsComplete ? ["surface:port_listeners"] : []),
          ...(!configsComplete ? ["surface:opaque_configs"] : []),
          ...(!descriptorsAligned ? ["surface:descriptor_alignment"] : []),
          ...(!toolsComplete ? ["surface:tool_identities"] : []),
          ...(activePromotionLock.exists ? ["surface:active_promotion_lock"] : []),
        ]
      : [];
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
