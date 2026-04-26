import { resolveSessionTelemetry } from "./omo-session-telemetry.mjs";

function normalizeString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const RUNNING_LONG_MS = 10 * 60 * 1000;
const RUNNING_STALE_CANDIDATE_MS = 60 * 60 * 1000;
const CI_STALE_CANDIDATE_MS = 30 * 60 * 1000;
const SESSION_STALE_CANDIDATE_MS = 60 * 60 * 1000;

function parseTimestamp(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }

  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) {
    return "<1m";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 1) {
    return `${minutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function formatUsd(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return `$${value.toFixed(2)}`;
}

function resolveLockOwnerPid(lockOwner) {
  const normalized = normalizeString(lockOwner);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/(?:^|[^0-9])([1-9][0-9]*)$/);
  if (!match) {
    return null;
  }

  const pid = Number.parseInt(match[1], 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isLocalProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function resolveLockOwnerProcess({ lockOwner, processes }) {
  if (!lockOwner) {
    return {
      liveProcessPid: null,
      liveProcessStatus: "none",
      liveProcessSource: null,
    };
  }

  const pid = resolveLockOwnerPid(lockOwner);
  if (!pid) {
    return {
      liveProcessPid: null,
      liveProcessStatus: "unknown",
      liveProcessSource: "lock.owner",
    };
  }

  const liveProcessStatus =
    typeof processes?.isAlive === "function" ? processes.isAlive(pid) : isLocalProcessAlive(pid);

  return {
    liveProcessPid: pid,
    liveProcessStatus: liveProcessStatus ? "alive" : "dead",
    liveProcessSource: "lock.owner",
  };
}

function formatLiveProcess(runtimeObservability) {
  const status = normalizeString(runtimeObservability?.liveProcessStatus);
  if (!status) {
    return "-";
  }

  const pid = runtimeObservability?.liveProcessPid;
  return Number.isInteger(pid) && pid > 0 ? `${status} pid=${pid}` : status;
}

function resolveReferenceTime(now) {
  return parseTimestamp(now) ?? new Date();
}

function describePhasePhase(runtime) {
  return normalizeString(runtime?.phase) ?? "none";
}

function pushTimestampCandidate(candidates, source, value) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) {
    return;
  }

  candidates.push({
    source,
    timestamp,
  });
}

function collectActivityCandidates(runtime) {
  const candidates = [];

  pushTimestampCandidate(candidates, "wait.updated_at", runtime?.wait?.updated_at);
  pushTimestampCandidate(candidates, "workspace.updated_at", runtime?.workspace?.updated_at);
  pushTimestampCandidate(candidates, "execution.started_at", runtime?.execution?.started_at);
  pushTimestampCandidate(candidates, "execution.finished_at", runtime?.execution?.finished_at);
  pushTimestampCandidate(
    candidates,
    "sessions.claude_primary.updated_at",
    runtime?.sessions?.claude_primary?.updated_at,
  );
  pushTimestampCandidate(
    candidates,
    "sessions.codex_primary.updated_at",
    runtime?.sessions?.codex_primary?.updated_at,
  );
  pushTimestampCandidate(candidates, "doc_gate.updated_at", runtime?.doc_gate?.updated_at);
  pushTimestampCandidate(
    candidates,
    "design_authority.updated_at",
    runtime?.design_authority?.updated_at,
  );
  pushTimestampCandidate(candidates, "recovery.updated_at", runtime?.recovery?.updated_at);

  for (const role of ["backend", "frontend"]) {
    pushTimestampCandidate(
      candidates,
      `last_review.${role}.updated_at`,
      runtime?.last_review?.[role]?.updated_at,
    );
    pushTimestampCandidate(
      candidates,
      `last_rebuttal.${role}.updated_at`,
      runtime?.last_rebuttal?.[role]?.updated_at,
    );
  }

  return candidates.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
}

function resolveObservedSession(runtime) {
  const executionRole = normalizeString(runtime?.execution?.session_role);
  if (executionRole) {
    return {
      role: executionRole,
      source: "execution.session_role",
    };
  }

  const sessionCandidates = ["claude_primary", "codex_primary"]
    .map((role) => ({
      role,
      sessionId: normalizeString(runtime?.sessions?.[role]?.session_id),
      updatedAt: parseTimestamp(runtime?.sessions?.[role]?.updated_at),
    }))
    .filter((entry) => entry.sessionId);

  if (sessionCandidates.length === 0) {
    return {
      role: null,
      source: null,
    };
  }

  sessionCandidates.sort((left, right) => {
    const leftTime = left.updatedAt?.getTime() ?? 0;
    const rightTime = right.updatedAt?.getTime() ?? 0;
    return rightTime - leftTime;
  });

  return {
    role: sessionCandidates[0].role,
    source: "latest_session_update",
  };
}

function resolveSessionFreshness({
  sessionId,
  sessionUpdatedAt,
  sessionAgeMs,
  rolloverRecommended,
}) {
  if (!sessionId) {
    return "missing";
  }

  if (rolloverRecommended) {
    return "rollover_recommended";
  }

  if (!sessionUpdatedAt) {
    return "unknown";
  }

  return Number.isFinite(sessionAgeMs) && sessionAgeMs >= SESSION_STALE_CANDIDATE_MS
    ? "stale_candidate"
    : "fresh";
}

function buildRuntimeFreshness(runtime, reference) {
  const activityCandidates = collectActivityCandidates(runtime);
  const latestActivity = activityCandidates[0] ?? null;
  const latestActivityAgeMs = latestActivity
    ? reference.getTime() - latestActivity.timestamp.getTime()
    : null;
  const observedSession = resolveObservedSession(runtime);
  const sessionEntry = observedSession.role ? runtime?.sessions?.[observedSession.role] ?? null : null;
  const sessionTelemetry = resolveSessionTelemetry(sessionEntry);
  const sessionUpdatedAt = parseTimestamp(sessionEntry?.updated_at);
  const sessionAgeMs = sessionUpdatedAt ? reference.getTime() - sessionUpdatedAt.getTime() : null;
  const executionStartedAt = parseTimestamp(runtime?.execution?.started_at);
  const executionFinishedAt = parseTimestamp(runtime?.execution?.finished_at);
  const executionReference = executionFinishedAt ?? executionStartedAt;
  const executionAgeMs = executionReference ? reference.getTime() - executionReference.getTime() : null;
  let executionFreshness = "idle";
  if (executionStartedAt && !executionFinishedAt) {
    executionFreshness =
      Number.isFinite(executionAgeMs) && executionAgeMs >= RUNNING_STALE_CANDIDATE_MS
        ? "stale_candidate"
        : Number.isFinite(executionAgeMs) && executionAgeMs >= RUNNING_LONG_MS
          ? "long_running"
          : "running";
  } else if (executionFinishedAt) {
    executionFreshness = "finished";
  }

  return {
    subphase: normalizeString(runtime?.execution?.subphase),
    lastActivityAt: latestActivity?.timestamp.toISOString() ?? null,
    lastActivityAge: formatDuration(latestActivityAgeMs),
    lastActivitySource: latestActivity?.source ?? null,
    heartbeatAt: latestActivity?.timestamp.toISOString() ?? null,
    heartbeatAge: formatDuration(latestActivityAgeMs),
    heartbeatSource: latestActivity?.source ?? null,
    heartbeatFreshness:
      !latestActivity
        ? "missing"
        : Number.isFinite(latestActivityAgeMs) && latestActivityAgeMs >= RUNNING_STALE_CANDIDATE_MS
          ? "stale_candidate"
          : "fresh",
    sessionRole: observedSession.role,
    sessionRoleSource: observedSession.source,
    sessionUpdatedAt: sessionUpdatedAt?.toISOString() ?? null,
    sessionAge: formatDuration(sessionAgeMs),
    sessionFreshness: resolveSessionFreshness({
      sessionId: normalizeString(sessionEntry?.session_id),
      sessionUpdatedAt,
      sessionAgeMs,
      rolloverRecommended: sessionTelemetry.rolloverRecommended,
    }),
    sessionGeneration: sessionTelemetry.generation,
    sessionRunCount: sessionTelemetry.runCount,
    sessionLastUsage: sessionTelemetry.lastUsage,
    sessionCumulativeUsage: sessionTelemetry.cumulativeUsage,
    sessionLastCostUsd: sessionTelemetry.lastCostUsd,
    sessionCumulativeCostUsd: sessionTelemetry.cumulativeCostUsd,
    sessionLastCost: formatUsd(sessionTelemetry.lastCostUsd),
    sessionCumulativeCost: formatUsd(sessionTelemetry.cumulativeCostUsd),
    sessionRolloverRecommended: sessionTelemetry.rolloverRecommended,
    sessionRolloverReason: sessionTelemetry.rolloverReason,
    transcriptUpdatedAt: sessionUpdatedAt?.toISOString() ?? null,
    transcriptAge: formatDuration(sessionAgeMs),
    transcriptFreshness:
      !sessionEntry?.session_id
        ? "missing"
        : !sessionUpdatedAt
          ? "unknown"
          : Number.isFinite(sessionAgeMs) && sessionAgeMs >= SESSION_STALE_CANDIDATE_MS
            ? "stale_candidate"
            : "fresh",
    executionFreshness,
    executionStartedAt: executionStartedAt?.toISOString() ?? null,
    executionFinishedAt: executionFinishedAt?.toISOString() ?? null,
    executionAge: formatDuration(executionAgeMs),
  };
}

export function buildRuntimeObservability(runtime, { now, processes } = {}) {
  const phase = describePhasePhase(runtime);
  const waitKind = normalizeString(runtime?.wait?.kind);
  const lockOwner = normalizeString(runtime?.lock?.owner);
  const reference = resolveReferenceTime(now);
  const lockTimestamp =
    parseTimestamp(runtime?.lock?.acquired_at) ?? parseTimestamp(runtime?.execution?.started_at);
  const waitTimestamp =
    parseTimestamp(runtime?.wait?.updated_at) ??
    parseTimestamp(runtime?.workspace?.updated_at) ??
    parseTimestamp(runtime?.execution?.finished_at);
  const retryAt = parseTimestamp(runtime?.retry?.at);
  const lockAgeMs = lockTimestamp ? reference.getTime() - lockTimestamp.getTime() : null;
  const waitAgeMs = waitTimestamp ? reference.getTime() - waitTimestamp.getTime() : null;
  const freshness = buildRuntimeFreshness(runtime, reference);
  const liveProcess = resolveLockOwnerProcess({ lockOwner, processes });

  if (waitKind === "blocked_retry") {
    const due = retryAt ? retryAt.getTime() <= reference.getTime() : false;
    return {
      status: due ? "retry_due" : "waiting_retry",
      headline: due ? "retry due" : "waiting for retry",
      detail: due
        ? `blocked_retry is due${retryAt ? ` since ${retryAt.toISOString()}` : ""}`
        : `blocked_retry scheduled${retryAt ? ` at ${retryAt.toISOString()}` : ""}`,
      recommendation: due
        ? "retry 시각이 지났습니다. `pnpm omo:tick -- --work-item <id>` 또는 `pnpm omo:resume-pending`으로 재개하세요."
        : "retry 시각 전까지 기다리거나 `omo:status`로 due 여부를 다시 확인하세요.",
      lockOwner,
      lockAcquiredAt: lockTimestamp?.toISOString() ?? null,
      lockAge: formatDuration(lockAgeMs),
      waitUpdatedAt: waitTimestamp?.toISOString() ?? null,
      waitAge: formatDuration(waitAgeMs),
      retryAt: retryAt?.toISOString() ?? null,
      staleCandidate: false,
      ...liveProcess,
      ...freshness,
    };
  }

  if (waitKind === "ci") {
    const staleCandidate = Number.isFinite(waitAgeMs) && waitAgeMs >= CI_STALE_CANDIDATE_MS;
    return {
      status: staleCandidate ? "waiting_ci_stale_candidate" : "waiting_ci",
      headline: staleCandidate ? "waiting for ci (stale candidate)" : "waiting for ci",
      detail: staleCandidate
        ? `CI wait has been open for ${formatDuration(waitAgeMs)}`
        : `CI wait is active${waitAgeMs !== null ? ` for ${formatDuration(waitAgeMs)}` : ""}`,
      recommendation: staleCandidate
        ? "PR head SHA와 현재 GitHub checks 상태를 다시 확인해 stale CI snapshot인지 점검하세요."
        : "현재 head 기준 GitHub checks가 끝날 때까지 기다리세요.",
      lockOwner,
      lockAcquiredAt: lockTimestamp?.toISOString() ?? null,
      lockAge: formatDuration(lockAgeMs),
      waitUpdatedAt: waitTimestamp?.toISOString() ?? null,
      waitAge: formatDuration(waitAgeMs),
      retryAt: retryAt?.toISOString() ?? null,
      staleCandidate,
      ...liveProcess,
      ...freshness,
    };
  }

  if (waitKind === "human") {
    return {
      status: "blocked_human",
      headline: "blocked by human intervention",
      detail: `human wait${waitAgeMs !== null ? ` for ${formatDuration(waitAgeMs)}` : ""}`,
      recommendation: "human-only blocker를 해소한 뒤 같은 work item을 다시 재개하세요.",
      lockOwner,
      lockAcquiredAt: lockTimestamp?.toISOString() ?? null,
      lockAge: formatDuration(lockAgeMs),
      waitUpdatedAt: waitTimestamp?.toISOString() ?? null,
      waitAge: formatDuration(waitAgeMs),
      retryAt: retryAt?.toISOString() ?? null,
      staleCandidate: false,
      ...liveProcess,
      ...freshness,
    };
  }

  if (waitKind === "ready_for_next_stage") {
    return {
      status: "ready_to_resume",
      headline: "ready for next stage",
      detail: `next stage can resume${waitAgeMs !== null ? ` after ${formatDuration(waitAgeMs)}` : ""}`,
      recommendation: "`pnpm omo:tick -- --work-item <id>` 또는 supervisor resume 경로로 다음 stage를 진행하세요.",
      lockOwner,
      lockAcquiredAt: lockTimestamp?.toISOString() ?? null,
      lockAge: formatDuration(lockAgeMs),
      waitUpdatedAt: waitTimestamp?.toISOString() ?? null,
      waitAge: formatDuration(waitAgeMs),
      retryAt: retryAt?.toISOString() ?? null,
      staleCandidate: false,
      ...liveProcess,
      ...freshness,
    };
  }

  if (phase === "stage_running" && lockOwner) {
    const staleCandidate = Number.isFinite(lockAgeMs) && lockAgeMs >= RUNNING_STALE_CANDIDATE_MS;
    const longRunning =
      !staleCandidate && Number.isFinite(lockAgeMs) && lockAgeMs >= RUNNING_LONG_MS;
    return {
      status: staleCandidate ? "running_stale_candidate" : longRunning ? "running_long" : "running_live",
      headline: staleCandidate
        ? "stage running (stale candidate)"
        : longRunning
          ? "stage running (long)"
          : "stage running",
      detail:
        lockAgeMs !== null
          ? `lock held by ${lockOwner} for ${formatDuration(lockAgeMs)}`
          : `lock held by ${lockOwner}`,
      recommendation: staleCandidate
        ? "stage_running lock가 오래 유지되고 있습니다. artifact/log를 확인해 stale residue인지 점검하고 `pnpm omo:tick -- --work-item <id>`로 recovery를 시도하세요."
        : "현재 stage 실행이 진행 중입니다. 새로운 patch보다 artifact/log 업데이트를 먼저 확인하세요.",
      lockOwner,
      lockAcquiredAt: lockTimestamp?.toISOString() ?? null,
      lockAge: formatDuration(lockAgeMs),
      waitUpdatedAt: waitTimestamp?.toISOString() ?? null,
      waitAge: formatDuration(waitAgeMs),
      retryAt: retryAt?.toISOString() ?? null,
      staleCandidate,
      ...liveProcess,
      ...freshness,
    };
  }

  if (phase === "stage_running" && !lockOwner) {
    return {
      status: "running_without_lock",
      headline: "stage running (lock missing)",
      detail: "phase=stage_running but no active lock owner is recorded",
      recommendation:
        "stage_running 상태인데 lock owner가 없습니다. stale residue인지 확인하고 artifact/log와 최근 activity를 먼저 점검하세요.",
      lockOwner,
      lockAcquiredAt: lockTimestamp?.toISOString() ?? null,
      lockAge: formatDuration(lockAgeMs),
      waitUpdatedAt: waitTimestamp?.toISOString() ?? null,
      waitAge: formatDuration(waitAgeMs),
      retryAt: retryAt?.toISOString() ?? null,
      staleCandidate: true,
      ...liveProcess,
      ...freshness,
    };
  }

  if (lockOwner) {
    return {
      status: "lock_residue",
      headline: "lock residue detected",
      detail: `phase=${phase} but lock is still held by ${lockOwner}${lockAgeMs !== null ? ` for ${formatDuration(lockAgeMs)}` : ""}`,
      recommendation: "phase와 lock이 어긋났습니다. stale residue인지 확인하고 runtime recovery 경로를 점검하세요.",
      lockOwner,
      lockAcquiredAt: lockTimestamp?.toISOString() ?? null,
      lockAge: formatDuration(lockAgeMs),
      waitUpdatedAt: waitTimestamp?.toISOString() ?? null,
      waitAge: formatDuration(waitAgeMs),
      retryAt: retryAt?.toISOString() ?? null,
      staleCandidate: true,
      ...liveProcess,
      ...freshness,
    };
  }

  if (phase === "escalated") {
    return {
      status: "escalated",
      headline: "escalated",
      detail: "runtime is escalated without an active lock",
      recommendation: "reason code와 recovery artifact를 확인해 human escalation인지 자동 복구 가능한 상태인지 먼저 판단하세요.",
      lockOwner,
      lockAcquiredAt: lockTimestamp?.toISOString() ?? null,
      lockAge: formatDuration(lockAgeMs),
      waitUpdatedAt: waitTimestamp?.toISOString() ?? null,
      waitAge: formatDuration(waitAgeMs),
      retryAt: retryAt?.toISOString() ?? null,
      staleCandidate: false,
      ...liveProcess,
      ...freshness,
    };
  }

  if (phase === "done") {
    return {
      status: "done",
      headline: "done",
      detail: "runtime reached done state",
      recommendation: null,
      lockOwner,
      lockAcquiredAt: lockTimestamp?.toISOString() ?? null,
      lockAge: formatDuration(lockAgeMs),
      waitUpdatedAt: waitTimestamp?.toISOString() ?? null,
      waitAge: formatDuration(waitAgeMs),
      retryAt: retryAt?.toISOString() ?? null,
      staleCandidate: false,
      ...liveProcess,
      ...freshness,
    };
  }

  return {
    status: waitKind ? `waiting_${waitKind}` : "idle",
    headline: waitKind ? `waiting (${waitKind})` : "idle",
    detail: waitKind ? `wait.kind=${waitKind}` : `phase=${phase}`,
    recommendation: null,
    lockOwner,
    lockAcquiredAt: lockTimestamp?.toISOString() ?? null,
    lockAge: formatDuration(lockAgeMs),
    waitUpdatedAt: waitTimestamp?.toISOString() ?? null,
    waitAge: formatDuration(waitAgeMs),
    retryAt: retryAt?.toISOString() ?? null,
    staleCandidate: false,
    ...liveProcess,
    ...freshness,
  };
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
  const runtimeObservability = buildRuntimeObservability(runtime);

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
    }) ?? runtimeObservability.recommendation,
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
  const runtimeObservability =
    status.runtimeObservability ?? buildRuntimeObservability(runtime);

  return [
    `Work item: ${status.workItemId}`,
    `Slice: ${status.slice}`,
    `Active stage: ${runtime.active_stage ?? runtime.current_stage ?? "N/A"}`,
    `Current stage: ${runtime.current_stage ?? "N/A"}`,
    `Last completed stage: ${runtime.last_completed_stage ?? 0}`,
    `Blocked stage: ${runtime.blocked_stage ?? "none"}`,
    `Phase: ${runtime.phase ?? "none"}`,
    `Subphase: ${runtimeObservability.subphase ?? "-"}`,
    `Next action: ${runtime.next_action ?? "noop"}`,
    `Wait kind: ${runtime.wait?.kind ?? "none"}`,
    `Reason code: ${operatorGuidance.reasonCode ?? "-"}`,
    `Remediation: ${operatorGuidance.remediationState ?? "-"}`,
    `Runtime signal: ${runtimeObservability.status ?? "-"}`,
    `Runtime detail: ${runtimeObservability.detail ?? "-"}`,
    `Live process: ${formatLiveProcess(runtimeObservability)}`,
    `Heartbeat: ${runtimeObservability.heartbeatAt ?? "-"}`,
    `Heartbeat age: ${runtimeObservability.heartbeatAge ?? "-"}`,
    `Heartbeat source: ${runtimeObservability.heartbeatSource ?? "-"}`,
    `Heartbeat freshness: ${runtimeObservability.heartbeatFreshness ?? "-"}`,
    `Last activity: ${runtimeObservability.lastActivityAt ?? "-"}`,
    `Activity age: ${runtimeObservability.lastActivityAge ?? "-"}`,
    `Activity source: ${runtimeObservability.lastActivitySource ?? "-"}`,
    `Session role: ${runtimeObservability.sessionRole ?? "-"}`,
    `Session freshness: ${runtimeObservability.sessionFreshness ?? "-"}`,
    `Transcript freshness: ${runtimeObservability.transcriptFreshness ?? "-"}`,
    `Transcript updated: ${runtimeObservability.transcriptUpdatedAt ?? "-"}`,
    `Transcript age: ${runtimeObservability.transcriptAge ?? "-"}`,
    `Session updated: ${runtimeObservability.sessionUpdatedAt ?? "-"}`,
    `Session age: ${runtimeObservability.sessionAge ?? "-"}`,
    `Session generation: ${runtimeObservability.sessionGeneration ?? "-"}`,
    `Session run count: ${runtimeObservability.sessionRunCount ?? "-"}`,
    `Session cumulative tokens: ${runtimeObservability.sessionCumulativeUsage?.total_tokens ?? "-"}`,
    `Session cumulative cost: ${runtimeObservability.sessionCumulativeCost ?? "-"}`,
    `Session rollover: ${runtimeObservability.sessionRolloverRecommended ? "recommended" : "not-needed"}`,
    `Session rollover reason: ${runtimeObservability.sessionRolloverReason ?? "-"}`,
    `Execution freshness: ${runtimeObservability.executionFreshness ?? "-"}`,
    `Execution age: ${runtimeObservability.executionAge ?? "-"}`,
    `Retry at: ${runtimeObservability.retryAt ?? "-"}`,
    `Lock owner: ${runtimeObservability.lockOwner ?? "-"}`,
    `Lock acquired: ${runtimeObservability.lockAcquiredAt ?? "-"}`,
    `Lock age: ${runtimeObservability.lockAge ?? "-"}`,
    `Wait updated: ${runtimeObservability.waitUpdatedAt ?? "-"}`,
    `Wait age: ${runtimeObservability.waitAge ?? "-"}`,
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
  const runtimeObservability =
    status.runtimeObservability ?? buildRuntimeObservability(runtime);

  return [
    `workItem        : ${status.workItemId}`,
    `activeStage     : ${resolveActiveStage(runtime)}`,
    `lastCompleted   : ${runtime.last_completed_stage ?? "-"}`,
    `phase           : ${phase}`,
    `subphase        : ${runtimeObservability.subphase ?? "-"}`,
    `nextAction      : ${nextAction}`,
    `mode            : ${mode}`,
    `runtimeSignal   : ${runtimeObservability.status ?? "-"}`,
    `runtimeDetail   : ${runtimeObservability.detail ?? "-"}`,
    `liveProcess    : ${formatLiveProcess(runtimeObservability)}`,
    `heartbeatAge    : ${runtimeObservability.heartbeatAge ?? "-"}`,
    `heartbeatSource : ${runtimeObservability.heartbeatSource ?? "-"}`,
    `heartbeatFresh  : ${runtimeObservability.heartbeatFreshness ?? "-"}`,
    `lastActivity    : ${runtimeObservability.lastActivityAge ?? "-"}`,
    `activitySource  : ${runtimeObservability.lastActivitySource ?? "-"}`,
    `sessionFresh    : ${runtimeObservability.sessionFreshness ?? "-"}`,
    `transcriptFresh : ${runtimeObservability.transcriptFreshness ?? "-"}`,
    `transcriptAge   : ${runtimeObservability.transcriptAge ?? "-"}`,
    `sessionAge      : ${runtimeObservability.sessionAge ?? "-"}`,
    `sessionRuns     : ${runtimeObservability.sessionRunCount ?? "-"}`,
    `sessionTokens   : ${runtimeObservability.sessionCumulativeUsage?.total_tokens ?? "-"}`,
    `sessionCost     : ${runtimeObservability.sessionCumulativeCost ?? "-"}`,
    `sessionRollover : ${runtimeObservability.sessionRolloverRecommended ? "recommended" : "not-needed"}`,
    `executionFresh  : ${runtimeObservability.executionFreshness ?? "-"}`,
    `executionAge    : ${runtimeObservability.executionAge ?? "-"}`,
    `retryAt         : ${runtimeObservability.retryAt ?? "-"}`,
    `lockAt          : ${runtimeObservability.lockAcquiredAt ?? "-"}`,
    `lockAge         : ${runtimeObservability.lockAge ?? "-"}`,
    `waitUpdated     : ${runtimeObservability.waitUpdatedAt ?? "-"}`,
    `waitAge         : ${runtimeObservability.waitAge ?? "-"}`,
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
