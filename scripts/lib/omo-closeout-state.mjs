const STATUS_LIFECYCLE_VALUES = new Set([
  "planned",
  "in_progress",
  "ready_for_review",
  "blocked",
  "merged",
  "archived",
]);

const STATUS_APPROVAL_VALUES = new Set([
  "not_started",
  "needs_revision",
  "claude_approved",
  "codex_approved",
  "dual_approved",
  "human_escalation",
]);

const STATUS_VERIFICATION_VALUES = new Set(["pending", "passed", "failed", "skipped"]);
const CLOSEOUT_PHASE_VALUES = new Set(["collecting", "projecting", "completed", "exception"]);
const DOCS_DESIGN_STATUS_VALUES = new Set(["temporary", "pending-review", "confirmed", "N/A"]);
const DOCS_DELIVERY_CHECKLIST_VALUES = new Set(["pending", "complete", "waived"]);
const DOCS_DESIGN_AUTHORITY_VALUES = new Set(["not_required", "pending", "passed", "failed", "waived"]);
const DOCS_ACCEPTANCE_VALUES = new Set(["pending", "complete", "waived"]);
const DOCS_AUTOMATION_SPEC_METADATA_VALUES = new Set(["pending", "synced", "not_required"]);

/**
 * @typedef {{
 *   phase?: string | null;
 *   docs_projection?: {
 *     roadmap_lifecycle?: string | null;
 *   } | null;
 *   verification_projection?: {
 *     required_checks?: string | null;
 *   } | null;
 *   merge_gate_projection?: {
 *     approval_state?: string | null;
 *   } | null;
 *   recovery_summary?: {
 *     manual_patch_count?: number | null;
 *     manual_handoff?: boolean | null;
 *     stale_lock_count?: number | null;
 *     ci_resync_count?: number | null;
 *     artifact_missing?: boolean | null;
 *     last_recovery_at?: string | null;
 *   } | null;
 *   repair_summary?: {
 *     codex_repairable_count?: number | null;
 *     claude_repairable_count?: number | null;
 *     manual_decision_required_count?: number | null;
 *     human_escalation_count?: number | null;
 *     post_merge_stale_count?: number | null;
 *     latest_reason_code?: string | null;
 *     evidence_sources?: string[];
 *   } | null;
 * }} CanonicalCloseoutSnapshot
 */

/**
 * @typedef {{
 *   id?: string | null;
 *   lifecycle?: string | null;
 *   approval_state?: string | null;
 *   verification_status?: string | null;
 *   notes?: string | null;
 * }} CanonicalCloseoutStatusItem
 */

/**
 * @typedef {{
 *   statusItem?: CanonicalCloseoutStatusItem | null;
 *   closeout?: CanonicalCloseoutSnapshot | null;
 *   pathPrefix?: string;
 * }} ValidateStatusItemAgainstCanonicalCloseoutOptions
 */

function normalizeEnum(value, allowedValues) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || !allowedValues.has(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => normalizeOptionalString(value))
    .filter((value) => value !== null);
}

function buildCanonicalCloseoutSource(workItemId) {
  const normalizedWorkItemId = normalizeOptionalString(workItemId);
  return normalizedWorkItemId ? `.workflow-v2/work-items/${normalizedWorkItemId}.json#closeout` : null;
}

function buildCanonicalCloseoutPathPrefix(canonicalSource) {
  const normalizedCanonicalSource = normalizeOptionalString(canonicalSource);
  if (!normalizedCanonicalSource) {
    return ".workflow-v2/work-items.<unknown>.json.closeout";
  }

  return normalizedCanonicalSource.replace(/#closeout$/, ".closeout");
}

function formatProjectionValue(value) {
  const normalized = normalizeOptionalString(value);
  return normalized ? `\`${normalized}\`` : "`unknown`";
}

function formatProjectionBoolean(value) {
  return value === true ? "예" : "아니오";
}

function projectRoadmapStatusForReadme(lifecycle) {
  switch (lifecycle) {
    case "planned":
      return "planned";
    case "in_progress":
    case "ready_for_review":
    case "blocked":
      return "in-progress";
    case "merged":
      return "merged";
    default:
      return null;
  }
}

function projectChecklistStatusForDocs(status) {
  switch (status) {
    case "pending":
      return "pending";
    case "complete":
    case "waived":
      return "complete";
    default:
      return null;
  }
}

function projectDesignAuthorityStatusForReadme(status) {
  switch (status) {
    case "not_required":
      return "not-required";
    case "pending":
      return "required";
    case "passed":
      return "reviewed";
    default:
      return null;
  }
}

function buildRecoveryFragments(recoverySummary = {}) {
  const fragments = [];
  const manualPatchCount = normalizeNonNegativeInteger(recoverySummary.manual_patch_count);
  const staleLockCount = normalizeNonNegativeInteger(recoverySummary.stale_lock_count);
  const ciResyncCount = normalizeNonNegativeInteger(recoverySummary.ci_resync_count);

  if (manualPatchCount > 0) {
    fragments.push(`manual_patch:${manualPatchCount}`);
  }

  if (staleLockCount > 0) {
    fragments.push(`stale_lock:${staleLockCount}`);
  }

  if (ciResyncCount > 0) {
    fragments.push(`ci_resync:${ciResyncCount}`);
  }

  if (recoverySummary.manual_handoff === true) {
    fragments.push("manual_handoff");
  }

  if (recoverySummary.artifact_missing === true) {
    fragments.push("artifact_missing");
  }

  return fragments;
}

function normalizeRepairSummary(repairSummary = {}) {
  return {
    codex_repairable_count: normalizeNonNegativeInteger(repairSummary.codex_repairable_count),
    claude_repairable_count: normalizeNonNegativeInteger(repairSummary.claude_repairable_count),
    manual_decision_required_count: normalizeNonNegativeInteger(
      repairSummary.manual_decision_required_count,
    ),
    human_escalation_count: normalizeNonNegativeInteger(repairSummary.human_escalation_count),
    post_merge_stale_count: normalizeNonNegativeInteger(repairSummary.post_merge_stale_count),
    latest_reason_code: normalizeOptionalString(repairSummary.latest_reason_code),
    evidence_sources: normalizeStringArray(repairSummary.evidence_sources),
  };
}

function countRepairSummaryActivity(repairSummary) {
  const summary = normalizeRepairSummary(repairSummary);
  return (
    summary.codex_repairable_count +
    summary.claude_repairable_count +
    summary.manual_decision_required_count +
    summary.human_escalation_count +
    summary.post_merge_stale_count
  );
}

function buildRepairFragments(repairSummary = {}) {
  const summary = normalizeRepairSummary(repairSummary);
  const activityCount = countRepairSummaryActivity(summary);

  if (activityCount === 0 && summary.evidence_sources.length === 0) {
    return [];
  }

  const fragments = [
    `codex:${summary.codex_repairable_count}`,
    `claude:${summary.claude_repairable_count}`,
    `manual_decision:${summary.manual_decision_required_count}`,
    `human_escalation:${summary.human_escalation_count}`,
    `post_merge_stale:${summary.post_merge_stale_count}`,
  ];

  if (summary.evidence_sources.length > 0) {
    fragments.push(`sources:${summary.evidence_sources.join(",")}`);
  }

  return fragments;
}

function formatRepairEvidenceSources(evidenceSources) {
  const sources = normalizeStringArray(evidenceSources);
  return sources.length > 0 ? sources.map((source) => `\`${source}\``).join(", ") : "`none`";
}

export function projectCanonicalCloseoutToHumanSurfacePayload(closeout, { workItemId } = {}) {
  if (!closeout || typeof closeout !== "object" || Array.isArray(closeout)) {
    return null;
  }

  return {
    phase: normalizeEnum(closeout.phase, CLOSEOUT_PHASE_VALUES),
    canonical_source: buildCanonicalCloseoutSource(workItemId),
    readme: {
      roadmap_lifecycle: normalizeEnum(closeout.docs_projection?.roadmap_lifecycle, STATUS_LIFECYCLE_VALUES),
      design_status: normalizeEnum(closeout.docs_projection?.design_status, DOCS_DESIGN_STATUS_VALUES),
      delivery_checklist: normalizeEnum(
        closeout.docs_projection?.delivery_checklist,
        DOCS_DELIVERY_CHECKLIST_VALUES,
      ),
      design_authority: normalizeEnum(
        closeout.docs_projection?.design_authority,
        DOCS_DESIGN_AUTHORITY_VALUES,
      ),
    },
    acceptance: {
      status: normalizeEnum(closeout.docs_projection?.acceptance, DOCS_ACCEPTANCE_VALUES),
      docs_synced_at: normalizeOptionalString(closeout.projection_state?.docs_synced_at),
    },
    pr_body: {
      actual_verification: {
        required_checks: normalizeEnum(
          closeout.verification_projection?.required_checks,
          STATUS_VERIFICATION_VALUES,
        ),
        external_smokes: normalizeEnum(
          closeout.verification_projection?.external_smokes,
          STATUS_VERIFICATION_VALUES,
        ),
        authority_reports: normalizeStringArray(closeout.verification_projection?.authority_reports),
        actual_verification_refs: normalizeStringArray(
          closeout.verification_projection?.actual_verification_refs,
        ),
      },
      closeout_sync: {
        roadmap_lifecycle: normalizeEnum(closeout.docs_projection?.roadmap_lifecycle, STATUS_LIFECYCLE_VALUES),
        design_status: normalizeEnum(closeout.docs_projection?.design_status, DOCS_DESIGN_STATUS_VALUES),
        delivery_checklist: normalizeEnum(
          closeout.docs_projection?.delivery_checklist,
          DOCS_DELIVERY_CHECKLIST_VALUES,
        ),
        design_authority: normalizeEnum(
          closeout.docs_projection?.design_authority,
          DOCS_DESIGN_AUTHORITY_VALUES,
        ),
        acceptance: normalizeEnum(closeout.docs_projection?.acceptance, DOCS_ACCEPTANCE_VALUES),
        automation_spec_metadata: normalizeEnum(
          closeout.docs_projection?.automation_spec_metadata,
          DOCS_AUTOMATION_SPEC_METADATA_VALUES,
        ),
      },
      merge_gate: {
        current_head_sha: normalizeOptionalString(closeout.merge_gate_projection?.current_head_sha),
        approval_state: normalizeEnum(
          closeout.merge_gate_projection?.approval_state,
          STATUS_APPROVAL_VALUES,
        ),
        all_checks_green: normalizeBoolean(closeout.merge_gate_projection?.all_checks_green),
      },
    },
    sync_state: {
      docs_synced_at: normalizeOptionalString(closeout.projection_state?.docs_synced_at),
      status_synced_at: normalizeOptionalString(closeout.projection_state?.status_synced_at),
      pr_body_synced_at: normalizeOptionalString(closeout.projection_state?.pr_body_synced_at),
    },
    recovery_summary: {
      manual_patch_count: normalizeNonNegativeInteger(closeout.recovery_summary?.manual_patch_count),
      manual_handoff: normalizeBoolean(closeout.recovery_summary?.manual_handoff),
      stale_lock_count: normalizeNonNegativeInteger(closeout.recovery_summary?.stale_lock_count),
      ci_resync_count: normalizeNonNegativeInteger(closeout.recovery_summary?.ci_resync_count),
      artifact_missing: normalizeBoolean(closeout.recovery_summary?.artifact_missing),
      last_recovery_at: normalizeOptionalString(closeout.recovery_summary?.last_recovery_at),
    },
    repair_summary: normalizeRepairSummary(closeout.repair_summary),
  };
}

export function projectCanonicalCloseoutToPrBodySections(closeout, { workItemId } = {}) {
  const projection = projectCanonicalCloseoutToHumanSurfacePayload(closeout, { workItemId });
  if (!projection) {
    return null;
  }

  const canonicalSource = projection.canonical_source ?? ".workflow-v2/work-items/<unknown>.json#closeout";
  const docsSyncState = projection.sync_state.docs_synced_at ?? "unknown";
  const prBodySyncState = projection.sync_state.pr_body_synced_at ?? "unknown";

  return {
    closeout_sync: [
      `- canonical closeout source: \`${canonicalSource}\``,
      `- roadmap status: ${formatProjectionValue(projection.pr_body.closeout_sync.roadmap_lifecycle)}`,
      `- README Delivery Checklist: ${formatProjectionValue(
        projection.pr_body.closeout_sync.delivery_checklist,
      )}`,
      `- acceptance: ${formatProjectionValue(projection.pr_body.closeout_sync.acceptance)}`,
      `- Design Status: ${formatProjectionValue(projection.pr_body.closeout_sync.design_status)}`,
      `- Design Authority: ${formatProjectionValue(projection.pr_body.closeout_sync.design_authority)}`,
      `- automation-spec closeout metadata: ${formatProjectionValue(
        projection.pr_body.closeout_sync.automation_spec_metadata,
      )}`,
      `- repair summary: codex=\`${projection.repair_summary.codex_repairable_count}\`, claude=\`${projection.repair_summary.claude_repairable_count}\`, manual_decision=\`${projection.repair_summary.manual_decision_required_count}\`, human_escalation=\`${projection.repair_summary.human_escalation_count}\`, post_merge_stale=\`${projection.repair_summary.post_merge_stale_count}\``,
      `- repair evidence sources: ${formatRepairEvidenceSources(
        projection.repair_summary.evidence_sources,
      )}`,
      `- projection sync state: docs=\`${docsSyncState}\`, PR body=\`${prBodySyncState}\``,
    ].join("\n"),
    merge_gate: [
      `- canonical closeout source: \`${canonicalSource}\``,
      `- current head SHA: ${formatProjectionValue(projection.pr_body.merge_gate.current_head_sha)}`,
      `- approval state: ${formatProjectionValue(projection.pr_body.merge_gate.approval_state)}`,
      `- required checks projection: ${formatProjectionValue(
        projection.pr_body.actual_verification.required_checks,
      )}`,
      `- all checks completed green: ${formatProjectionBoolean(
        projection.pr_body.merge_gate.all_checks_green,
      )}`,
      "- started PR checks: canonical closeout snapshot does not own the check list; current head GitHub checks로 재확인 필요",
    ].join("\n"),
  };
}

export function projectCanonicalCloseoutToDocSurfaceSyncContract(closeout, { workItemId } = {}) {
  const projection = projectCanonicalCloseoutToHumanSurfacePayload(closeout, { workItemId });
  if (!projection) {
    return null;
  }

  return {
    canonical_source: projection.canonical_source,
    readme: {
      roadmap_status: projectRoadmapStatusForReadme(projection.readme.roadmap_lifecycle),
      design_status: projection.readme.design_status,
      delivery_checklist_status: projectChecklistStatusForDocs(projection.readme.delivery_checklist),
      design_authority_status: projectDesignAuthorityStatusForReadme(projection.readme.design_authority),
    },
    acceptance: {
      status: projectChecklistStatusForDocs(projection.acceptance.status),
    },
    sync_state: {
      docs_synced_at: projection.sync_state.docs_synced_at,
    },
  };
}

export function planCanonicalCloseoutDocSurfaceRepair({
  closeout,
  workItemId,
  currentSurface,
} = {}) {
  const projection = projectCanonicalCloseoutToDocSurfaceSyncContract(closeout, { workItemId });
  if (!projection) {
    return null;
  }

  const currentReadme = currentSurface?.readme ?? {};
  const currentAcceptance = currentSurface?.acceptance ?? {};
  const repairActions = [];

  if (
    projection.readme.roadmap_status
    && normalizeOptionalString(currentReadme.roadmap_status) !== projection.readme.roadmap_status
  ) {
    repairActions.push({
      kind: "roadmap_status",
      targetStatus: projection.readme.roadmap_status,
    });
  }

  if (
    projection.readme.design_status
    && normalizeOptionalString(currentReadme.design_status) !== projection.readme.design_status
  ) {
    repairActions.push({
      kind: "design_status",
      targetStatus: projection.readme.design_status,
    });
  }

  if (
    projection.readme.delivery_checklist_status === "complete"
    && normalizeOptionalString(currentReadme.delivery_checklist_status) !== "complete"
  ) {
    repairActions.push({
      kind: "delivery_checklist_closeout",
      targetStatus: "complete",
    });
  }

  if (
    projection.readme.design_authority_status
    && normalizeOptionalString(currentReadme.design_authority_status) !== projection.readme.design_authority_status
  ) {
    repairActions.push({
      kind: "design_authority_status",
      targetStatus: projection.readme.design_authority_status,
    });
  }

  if (
    projection.acceptance.status === "complete"
    && normalizeOptionalString(currentAcceptance.status) !== "complete"
  ) {
    repairActions.push({
      kind: "acceptance_closeout",
      targetStatus: "complete",
    });
  }

  return {
    canonical_source: projection.canonical_source,
    repair_actions: repairActions,
  };
}

export function projectCanonicalCloseoutToStatusFields(closeout) {
  if (!closeout || typeof closeout !== "object" || Array.isArray(closeout)) {
    return null;
  }

  const lifecycle = normalizeEnum(closeout.docs_projection?.roadmap_lifecycle, STATUS_LIFECYCLE_VALUES);
  const approvalState = normalizeEnum(
    closeout.merge_gate_projection?.approval_state,
    STATUS_APPROVAL_VALUES,
  );
  const verificationStatus = normalizeEnum(
    closeout.verification_projection?.required_checks,
    STATUS_VERIFICATION_VALUES,
  );
  const noteFragments = [];
  const phase = normalizeOptionalString(closeout.phase);
  const recoveryFragments = buildRecoveryFragments(closeout.recovery_summary);
  const repairFragments = buildRepairFragments(closeout.repair_summary);
  const lastRecoveryAt = normalizeOptionalString(closeout.recovery_summary?.last_recovery_at);

  if (phase) {
    noteFragments.push(`closeout_phase=${phase}`);
  }

  if (recoveryFragments.length > 0) {
    noteFragments.push(`closeout_recovery=${recoveryFragments.join("|")}`);
  }

  if (repairFragments.length > 0) {
    noteFragments.push(`closeout_repair=${repairFragments.join("|")}`);
  }

  if (lastRecoveryAt) {
    noteFragments.push(`last_recovery_at=${lastRecoveryAt}`);
  }

  return {
    lifecycle,
    approval_state: approvalState,
    verification_status: verificationStatus,
    note_fragments: noteFragments,
  };
}

export function validateHumanSurfaceProjectionContract({
  closeout,
  workItemId,
  pathPrefix,
} = {}) {
  const projection = projectCanonicalCloseoutToHumanSurfacePayload(closeout, { workItemId });
  if (!projection) {
    return [];
  }

  const errors = [];
  const resolvedPathPrefix =
    normalizeOptionalString(pathPrefix)
    ?? buildCanonicalCloseoutPathPrefix(projection.canonical_source);
  const actualVerificationPath = `${resolvedPathPrefix}.verification_projection.actual_verification_refs`;
  const authorityReportsPath = `${resolvedPathPrefix}.verification_projection.authority_reports`;
  const allChecksGreenPath = `${resolvedPathPrefix}.merge_gate_projection.all_checks_green`;
  const deliveryChecklistPath = `${resolvedPathPrefix}.docs_projection.delivery_checklist`;
  const acceptancePath = `${resolvedPathPrefix}.docs_projection.acceptance`;
  const repairEvidenceSourcesPath = `${resolvedPathPrefix}.repair_summary.evidence_sources`;
  const requiresProjectedEvidence =
    projection.phase === "projecting" || projection.phase === "completed";

  if (
    requiresProjectedEvidence
    && projection.pr_body.actual_verification.actual_verification_refs.length === 0
  ) {
    errors.push({
      path: actualVerificationPath,
      message:
        "Canonical closeout human-surface projection requires actual_verification_refs once closeout phase reaches projecting/completed.",
    });
  }

  if (
    projection.readme.design_authority === "passed"
    && projection.pr_body.actual_verification.authority_reports.length === 0
  ) {
    errors.push({
      path: authorityReportsPath,
      message:
        "Canonical closeout human-surface projection requires authority_reports when design_authority is passed.",
    });
  }

  if (
    projection.pr_body.merge_gate.all_checks_green === true
    && projection.pr_body.actual_verification.required_checks !== "passed"
  ) {
    errors.push({
      path: allChecksGreenPath,
      message:
        "Canonical closeout merge gate projection cannot mark all_checks_green=true unless required_checks=passed.",
    });
  }

  if (projection.phase === "completed" && projection.readme.delivery_checklist === "pending") {
    errors.push({
      path: deliveryChecklistPath,
      message:
        "Canonical closeout completed phase cannot keep README Delivery Checklist pending.",
    });
  }

  if (projection.phase === "completed" && projection.acceptance.status === "pending") {
    errors.push({
      path: acceptancePath,
      message: "Canonical closeout completed phase cannot keep acceptance pending.",
    });
  }

  if (
    requiresProjectedEvidence
    && countRepairSummaryActivity(projection.repair_summary) > 0
    && projection.repair_summary.evidence_sources.length === 0
  ) {
    errors.push({
      path: repairEvidenceSourcesPath,
      message:
        "Canonical closeout repair summary requires evidence_sources when repair/manual/stale counts are non-zero.",
    });
  }

  return errors;
}

/**
 * @param {ValidateStatusItemAgainstCanonicalCloseoutOptions} [options]
 */
export function validateStatusItemAgainstCanonicalCloseout({
  statusItem,
  closeout,
  pathPrefix = ".workflow-v2/status.json.items",
} = {}) {
  const projection = projectCanonicalCloseoutToStatusFields(closeout);
  if (!projection) {
    return [];
  }

  const errors = [];
  const notes = typeof statusItem?.notes === "string" ? statusItem.notes : "";

  if (projection.lifecycle && statusItem?.lifecycle !== projection.lifecycle) {
    errors.push({
      path: `${pathPrefix}.lifecycle`,
      message: "Canonical closeout lifecycle projection mismatch.",
    });
  }

  if (projection.approval_state && statusItem?.approval_state !== projection.approval_state) {
    errors.push({
      path: `${pathPrefix}.approval_state`,
      message: "Canonical closeout approval projection mismatch.",
    });
  }

  if (projection.verification_status && statusItem?.verification_status !== projection.verification_status) {
    errors.push({
      path: `${pathPrefix}.verification_status`,
      message: "Canonical closeout verification projection mismatch.",
    });
  }

  for (const fragment of projection.note_fragments) {
    if (!notes.includes(fragment)) {
      errors.push({
        path: `${pathPrefix}.notes`,
        message: `Canonical closeout note projection missing fragment: ${fragment}`,
      });
    }
  }

  return errors;
}
