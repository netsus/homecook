function normalizeString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolvePrimaryReason(runtime) {
  const waitReason = normalizeString(runtime?.wait?.reason);
  if (waitReason) {
    return {
      source: "wait",
      reason: waitReason,
    };
  }

  const recoveryReason = normalizeString(runtime?.recovery?.reason);
  if (recoveryReason) {
    return {
      source: "recovery",
      reason: recoveryReason,
    };
  }

  const retryReason = normalizeString(runtime?.retry?.reason);
  if (retryReason) {
    return {
      source: "retry",
      reason: retryReason,
    };
  }

  return {
    source: null,
    reason: null,
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function resolveReasonCode(reason) {
  const normalized = normalizeString(reason);
  if (!normalized) {
    return null;
  }

  if (/^internal 6\.5 closeout_reconcile requires a separate docs-governance path:/i.test(normalized)) {
    return "closeout_reconcile_docs_governance_required";
  }

  if (/^internal 6\.5 closeout_reconcile recheck failed:/i.test(normalized)) {
    return "closeout_reconcile_recheck_failed";
  }

  if (/^internal 6\.5 closeout_reconcile blocked:/i.test(normalized)) {
    return "closeout_reconcile_blocked";
  }

  if (/pr checks failed\./i.test(normalized)) {
    return "pr_checks_failed";
  }

  if (/verify commands failed\./i.test(normalized)) {
    return "verify_commands_failed";
  }

  if (/human intervention required/i.test(normalized)) {
    return "human_intervention_required";
  }

  if (/^unsupported_wait_kind=/i.test(normalized)) {
    return normalized;
  }

  if (/^locked_by=/i.test(normalized)) {
    return "locked_by_other_session";
  }

  return slugify(normalized);
}

function stripStructuredReasonPrefix(reason) {
  return reason
    .replace(/^internal 6\.5 closeout_reconcile requires a separate docs-governance path:\s*/i, "")
    .replace(/^internal 6\.5 closeout_reconcile recheck failed:\s*/i, "")
    .replace(/^internal 6\.5 closeout_reconcile blocked:\s*/i, "")
    .trim();
}

function parseFirstFailureEntry(reason) {
  const normalized = normalizeString(reason);
  if (!normalized) {
    return {
      validatorName: null,
      failurePath: null,
      failureMessage: null,
    };
  }

  const segment = stripStructuredReasonPrefix(normalized).split(/\s*;\s*/)[0]?.trim() ?? "";
  if (segment.length === 0) {
    return {
      validatorName: null,
      failurePath: null,
      failureMessage: null,
    };
  }

  const firstSpace = segment.indexOf(" ");
  const firstColonSpace = segment.indexOf(": ");
  if (firstSpace > 0 && firstColonSpace > firstSpace) {
    const validatorName = segment.slice(0, firstSpace).trim();
    if (/^[a-z0-9-]+(?::[a-z0-9-]+)*$/i.test(validatorName)) {
      return {
        validatorName,
        failurePath: segment.slice(firstSpace + 1, firstColonSpace).trim() || null,
        failureMessage: segment.slice(firstColonSpace + 2).trim() || null,
      };
    }
  }

  if (firstColonSpace > 0) {
    return {
      validatorName: null,
      failurePath: segment.slice(0, firstColonSpace).trim() || null,
      failureMessage: segment.slice(firstColonSpace + 2).trim() || null,
    };
  }

  return {
    validatorName: null,
    failurePath: null,
    failureMessage: segment,
  };
}

function resolveArtifactPath(runtime) {
  return (
    normalizeString(runtime?.execution?.stage_result_path) ??
    normalizeString(runtime?.recovery?.artifact_dir) ??
    normalizeString(runtime?.last_artifact_dir)
  );
}

function resolveRemediationState({ runtime, reason, reasonCode }) {
  if (!reason) {
    return null;
  }

  if (
    reasonCode === "closeout_reconcile_docs_governance_required" ||
    reasonCode === "human_intervention_required" ||
    reasonCode === "locked_by_other_session" ||
    reasonCode === "missing_runtime" ||
    /^unsupported_wait_kind=/i.test(reasonCode ?? "") ||
    /human intervention required/i.test(reason)
  ) {
    return "blocked";
  }

  if (
    normalizeString(runtime?.next_action) === "noop" &&
    (Number.isInteger(runtime?.blocked_stage) || normalizeString(runtime?.recovery?.kind))
  ) {
    return "blocked";
  }

  return "fixable";
}

function resolveNextRecommendation({
  runtime,
  reasonCode,
  validatorName,
}) {
  if (reasonCode === "closeout_reconcile_docs_governance_required") {
    return "별도 docs-governance PR로 분리하세요.";
  }

  if (validatorName?.startsWith("real-smoke-presence:")) {
    return "source PR `Actual Verification`에 declared external_smokes 근거를 추가한 뒤 closeout을 다시 시도하세요.";
  }

  if (validatorName?.startsWith("authority-evidence-presence:")) {
    return "authority report evidence와 runtime design_authority snapshot을 다시 맞춘 뒤 재검증하세요.";
  }

  if (validatorName?.startsWith("exploratory-qa-evidence:")) {
    return "exploratory QA artifact 또는 low-risk skip rationale을 보강한 뒤 재검증하세요.";
  }

  if (validatorName?.startsWith("source-of-truth-sync:")) {
    return "CURRENT_SOURCE_OF_TRUTH 기준으로 governing docs와 스크립트 참조를 정렬하세요.";
  }

  if (validatorName?.startsWith("closeout-sync:")) {
    return "README, acceptance, Design Status, PR closeout metadata를 최신 evidence와 다시 맞추세요.";
  }

  const nextAction = normalizeString(runtime?.next_action);
  if (nextAction === "poll_ci") {
    return "현재 head 기준 PR checks가 끝날 때까지 기다리고 실패 check를 확인하세요.";
  }

  if (nextAction === "run_stage") {
    return "blocked stage를 다시 실행할 수 있는지 확인하고 `pnpm omo:tick`으로 재개하세요.";
  }

  if (nextAction === "run_review") {
    return "리뷰 지적 사항을 반영한 뒤 다음 review round를 진행하세요.";
  }

  if (nextAction === "finalize_stage") {
    return "현재 artifact와 wait 상태를 확인한 뒤 stage finalize를 다시 시도하세요.";
  }

  return null;
}

export function buildOperatorGuidance(runtime) {
  const { source, reason } = resolvePrimaryReason(runtime);
  const reasonCode = resolveReasonCode(reason);
  const failure = parseFirstFailureEntry(reason);
  const artifactPath = resolveArtifactPath(runtime);

  return {
    source,
    reason,
    reasonCode,
    remediationState: resolveRemediationState({
      runtime,
      reason,
      reasonCode,
    }),
    validatorName: failure.validatorName,
    failurePath: failure.failurePath,
    failureMessage: failure.failureMessage,
    artifactPath,
    nextRecommendation: resolveNextRecommendation({
      runtime,
      reasonCode,
      validatorName: failure.validatorName,
    }),
  };
}

function resolveTrackedLifecycle(status) {
  return status.trackedStatus?.lifecycle ?? status.trackedWorkItem?.status?.lifecycle ?? "-";
}

function resolveTrackedApproval(status) {
  return status.trackedStatus?.approval_state ?? status.trackedWorkItem?.status?.approval_state ?? "-";
}

export function formatFullStatus(status) {
  const runtime = status.runtime ?? {};
  const operatorGuidance = status.operatorGuidance ?? buildOperatorGuidance(runtime);

  return [
    `Work item: ${status.workItemId}`,
    `Slice: ${status.slice}`,
    `Active stage: ${runtime.active_stage ?? runtime.current_stage ?? "N/A"}`,
    `Current stage: ${runtime.current_stage ?? "N/A"}`,
    `Last completed stage: ${runtime.last_completed_stage ?? 0}`,
    `Blocked stage: ${runtime.blocked_stage ?? "none"}`,
    `Phase: ${runtime.phase ?? "none"}`,
    `Next action: ${runtime.next_action ?? "noop"}`,
    `Wait kind: ${runtime.wait?.kind ?? "none"}`,
    `Reason code: ${operatorGuidance.reasonCode ?? "-"}`,
    `Remediation: ${operatorGuidance.remediationState ?? "-"}`,
    `Last failed validator: ${operatorGuidance.validatorName ?? "-"}`,
    `Failure path: ${operatorGuidance.failurePath ?? "-"}`,
    `Artifact path: ${operatorGuidance.artifactPath ?? "-"}`,
    `Next recommendation: ${operatorGuidance.nextRecommendation ?? "-"}`,
    `Claude session: ${runtime.sessions?.claude_primary?.session_id ?? "missing"} (${runtime.sessions?.claude_primary?.provider ?? "pending"})`,
    `Codex session: ${runtime.sessions?.codex_primary?.session_id ?? "missing"} (${runtime.sessions?.codex_primary?.provider ?? "pending"})`,
    `Tracked lifecycle: ${resolveTrackedLifecycle(status)}`,
    `Tracked approval: ${resolveTrackedApproval(status)}`,
    runtime.recovery?.kind
      ? `Recovery: ${runtime.recovery.kind} stage=${runtime.recovery.stage ?? "n/a"} branch=${runtime.recovery.branch ?? "n/a"} salvage=${runtime.recovery.salvage_candidate ? "yes" : "no"}`
      : "Recovery: none",
  ].join("\n");
}

function resolveActiveStage(runtime) {
  const waitStage = Number.isInteger(runtime?.wait?.stage) ? runtime.wait.stage : null;
  if (waitStage) {
    return waitStage;
  }

  const activeStage =
    Number.isInteger(runtime?.active_stage) && runtime.active_stage >= 1
      ? runtime.active_stage
      : null;
  if (activeStage) {
    return activeStage;
  }

  const lastCompleted =
    Number.isInteger(runtime?.last_completed_stage) && runtime.last_completed_stage >= 0
      ? runtime.last_completed_stage
      : null;
  const currentStage =
    Number.isInteger(runtime?.current_stage) && runtime.current_stage >= 1
      ? runtime.current_stage
      : null;
  const isRunning = typeof runtime?.lock?.owner === "string" && runtime.lock.owner.trim().length > 0;

  if (isRunning && lastCompleted !== null && lastCompleted >= 0 && lastCompleted < 6) {
    return lastCompleted + 1;
  }

  return currentStage ?? lastCompleted ?? "-";
}

export function formatBriefStatus(status) {
  const runtime = status.runtime ?? {};
  const wait = runtime.wait ?? null;
  const phase =
    typeof runtime.phase === "string" && runtime.phase.trim().length > 0
      ? runtime.phase.trim()
      : "-";
  const nextAction =
    typeof runtime.next_action === "string" && runtime.next_action.trim().length > 0
      ? runtime.next_action.trim()
      : "-";
  const mode = wait?.kind ?? (phase === "done" ? "done" : runtime.lock?.owner ? "running" : "idle");
  const operatorGuidance = status.operatorGuidance ?? buildOperatorGuidance(runtime);

  return [
    `workItem        : ${status.workItemId}`,
    `activeStage     : ${resolveActiveStage(runtime)}`,
    `lastCompleted   : ${runtime.last_completed_stage ?? "-"}`,
    `phase           : ${phase}`,
    `nextAction      : ${nextAction}`,
    `mode            : ${mode}`,
    `reasonCode      : ${operatorGuidance.reasonCode ?? "-"}`,
    `remediation     : ${operatorGuidance.remediationState ?? "-"}`,
    `blockedBy       : ${operatorGuidance.validatorName ?? "-"}`,
    `failurePath     : ${operatorGuidance.failurePath ?? "-"}`,
    `artifactPath    : ${operatorGuidance.artifactPath ?? "-"}`,
    `recommendation  : ${operatorGuidance.nextRecommendation ?? "-"}`,
    `branchRole      : ${runtime.workspace?.branch_role ?? "-"}`,
    `backendPr       : ${runtime.prs?.backend?.url ?? "-"}`,
    `frontendPr      : ${runtime.prs?.frontend?.url ?? "-"}`,
    `closeoutPr      : ${runtime.prs?.closeout?.url ?? "-"}`,
    `recovery        : ${runtime.recovery?.kind ?? "-"}`,
    `lockOwner       : ${runtime.lock?.owner ?? "-"}`,
  ].join("\n");
}
