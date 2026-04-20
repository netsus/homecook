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
