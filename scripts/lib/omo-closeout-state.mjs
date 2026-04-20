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
  const lastRecoveryAt = normalizeOptionalString(closeout.recovery_summary?.last_recovery_at);

  if (phase) {
    noteFragments.push(`closeout_phase=${phase}`);
  }

  if (recoveryFragments.length > 0) {
    noteFragments.push(`closeout_recovery=${recoveryFragments.join("|")}`);
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
