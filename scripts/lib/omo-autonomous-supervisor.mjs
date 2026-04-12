import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { runStageWithArtifacts } from "./omo-lite-runner.mjs";
import { resolveStageSessionRole, syncWorkflowV2Status } from "./omo-lite-supervisor.mjs";
import { createGithubAutomationClient } from "./omo-github.mjs";
import { resolveClaudeProviderConfig, resolveCodexProviderConfig } from "./omo-provider-config.mjs";
import {
  applyBookkeepingRepairPlan,
  evaluateBookkeepingInvariant,
  readSliceRoadmapStatus,
  updateWorkpackDesignAuthorityStatus,
  updateSliceRoadmapStatus,
  updateWorkpackDesignStatus,
} from "./omo-bookkeeping.mjs";
import {
  applyChecklistWaiverMetadata,
  isChecklistContractActive,
  readWorkpackChecklistContract,
  resolveChecklistIds,
  resolveOwnedChecklistItems,
  resolveReviewChecklistItems,
  resolveUncheckedChecklistItems,
} from "./omo-checklist-contract.mjs";
import {
  acquireRuntimeLock,
  resolveRuntimePath,
  listRuntimeStates,
  markStageCompleted,
  readRuntimeState,
  releaseRuntimeLock,
  setDocGateRebuttal,
  setDocGateReview,
  setDocGateState,
  setDesignAuthorityState,
  setRecoveryState,
  setExecutionState,
  setLastRebuttal,
  setLastReview,
  setPullRequestRef,
  setWaitState,
  setWorkspaceBinding,
  writeRuntimeState,
  isRetryDue,
} from "./omo-session-runtime.mjs";
import { validateStageResult } from "./omo-stage-result.mjs";
import { readAutomationSpec, resolveAutonomousSlicePolicy, resolveStageAutomationConfig } from "./omo-automation-spec.mjs";
import { evaluateDocGate, writeDocGateResult } from "./omo-doc-gate.mjs";
import { evaluateWorkItemStage } from "./omo-evaluator.mjs";
import {
  assertWorktreeClean,
  ensureSupervisorWorktree,
  ensureWorktreeBranch,
  getWorktreeBinaryDiff,
  getWorktreeHeadSha,
  getWorktreeCurrentBranch,
  listWorktreeChangedFiles,
  commitWorktreeChanges,
  pushWorktreeBranch,
  syncWorktreeWithBaseBranch,
} from "./omo-worktree.mjs";

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function formatTimestampSlug(value) {
  const source =
    typeof value === "string" && value.trim().length > 0 ? value.trim() : new Date().toISOString();
  return source.replace(/[:.]/g, "-");
}

function resolveSupervisorArtifactDir({
  rootDir,
  workItemId,
  now,
}) {
  return resolve(
    rootDir,
    ".artifacts",
    "omo-supervisor",
    `${formatTimestampSlug(now)}-${workItemId}`,
  );
}

function writeSupervisorArtifact({
  rootDir,
  workItemId,
  now,
  summary,
  runtimeState = null,
  worktree = null,
}) {
  const artifactDir = resolveSupervisorArtifactDir({
    rootDir,
    workItemId,
    now,
  });
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  const recovery = summary?.recovery ?? runtimeState?.recovery ?? null;
  if (recovery) {
    writeFileSync(resolve(artifactDir, "recovery.json"), `${JSON.stringify(recovery, null, 2)}\n`);

    if (Array.isArray(recovery.changed_files) && recovery.changed_files.length > 0) {
      writeFileSync(resolve(artifactDir, "recovery.changed-files.txt"), `${recovery.changed_files.join("\n")}\n`);
    }

    const worktreePath = runtimeState?.workspace?.path ?? null;
    if (
      recovery.salvage_candidate &&
      typeof worktreePath === "string" &&
      worktreePath.trim().length > 0 &&
      typeof worktree?.getBinaryDiff === "function"
    ) {
      try {
        const patch = worktree.getBinaryDiff({
          worktreePath,
        });
        if (typeof patch === "string" && patch.length > 0) {
          writeFileSync(resolve(artifactDir, "recovery.patch"), patch);
        }
      } catch {
        // Best-effort evidence only; summary/recovery JSON remains the source of truth.
      }
    }
  }

  return artifactDir;
}

function resolveSlice({ workItemId, slice }) {
  return typeof slice === "string" && slice.trim().length > 0 ? slice.trim() : workItemId;
}

function resolveBranchRole(stage) {
  if (stage === 1) return "docs";
  if (stage === 2 || stage === 3) return "backend";
  return "frontend";
}

function resolveBranchName({ slice, stage }) {
  if (stage === 1) {
    return `docs/${slice}`;
  }

  if (stage === 2 || stage === 3) {
    return `feature/be-${slice}`;
  }

  return `feature/fe-${slice}`;
}

function resolvePrRole(stage) {
  if (stage === 1) return "docs";
  if (stage === 2 || stage === 3) return "backend";
  return "frontend";
}

function resolveDocGateRepairBranch(slice) {
  return `docs/${slice}-repair`;
}

function resolveDocGateAllowedFiles(slice) {
  return [
    `docs/workpacks/${slice}/README.md`,
    `docs/workpacks/${slice}/acceptance.md`,
    `docs/workpacks/${slice}/automation-spec.json`,
  ];
}

function readTrackedWorkItem({ rootDir, workItemId }) {
  const workItemPath = resolve(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`);
  if (!existsSync(workItemPath)) {
    throw new Error(`Tracked workflow-v2 work item not found: ${workItemPath}`);
  }

  return {
    workItemPath,
    workItem: JSON.parse(readFileSync(workItemPath, "utf8")),
  };
}

function normalizeStringArray(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim()),
  )];
}

function summarizeChecklistIssues(issues) {
  return normalizeStringArray(issues).join("; ");
}

function summarizeFixIds(values) {
  return normalizeStringArray(values).join(", ");
}

function resolveExpectedReviewScope(stage) {
  if (stage === 3) return "backend";
  if (stage === 5) return "frontend";
  return "closeout";
}

function resolveChecklistContractValidation({
  rootDir,
  worktreePath,
  slice,
}) {
  const checklistContract = readWorkpackChecklistContract({
    rootDir,
    worktreePath,
    slice,
  });

  return {
    checklistContract,
    issues: normalizeStringArray(
      (checklistContract.errors ?? []).map((error) => `${error.path} ${error.message}`),
    ),
  };
}

function validateProductCodeStageEntry({
  rootDir,
  worktreePath,
  workItem,
  slice,
  stage,
}) {
  const { checklistContract, issues } = resolveChecklistContractValidation({
    rootDir,
    worktreePath,
    slice,
  });
  if (workItem?.change_type !== "product") {
    return {
      checklistContract,
      issues: [],
    };
  }

  if (stage === 1) {
    const roadmap = readSliceRoadmapStatus({
      worktreePath,
      slice,
    });
    const normalizedIssues = [];
    if (roadmap.status !== "planned") {
      normalizedIssues.push(
        `Stage 1 entry requires roadmap status planned but found ${roadmap.status ?? "missing"}.`,
      );
    }

    const dependencies = normalizeStringArray(workItem?.dependencies);
    for (const dependency of dependencies) {
      const dependencyStatus = readSliceRoadmapStatus({
        worktreePath,
        slice: dependency,
      }).status;
      if (!["merged", "bootstrap"].includes(dependencyStatus ?? "")) {
        normalizedIssues.push(
          `Dependency slice '${dependency}' must be merged/bootstrap before Stage 1, found ${dependencyStatus ?? "missing"}.`,
        );
      }
    }

    return {
      checklistContract,
      issues: normalizeStringArray(normalizedIssues),
    };
  }

  const normalizedIssues = isChecklistContractActive(checklistContract) ? [...issues] : [];
  const roadmap = readSliceRoadmapStatus({
    worktreePath,
    slice,
  });
  const currentStatus = roadmap.status ?? null;
  const allowedStatuses = stage === 2 ? ["docs", "in-progress", "merged"] : ["in-progress", "merged"];

  if (!allowedStatuses.includes(currentStatus)) {
    normalizedIssues.push(
      `Stage ${stage} entry requires roadmap status ${allowedStatuses.join("|")} but found ${currentStatus ?? "missing"}.`,
    );
  }

  if (isChecklistContractActive(checklistContract) && !checklistContract.automationSpecExists) {
    normalizedIssues.push(`Stage ${stage} entry requires automation-spec.json for ${slice}.`);
  }

  const dependencies = normalizeStringArray(workItem?.dependencies);
  for (const dependency of dependencies) {
    const dependencyStatus = readSliceRoadmapStatus({
      worktreePath,
      slice: dependency,
    }).status;
    if (!["merged", "bootstrap"].includes(dependencyStatus ?? "")) {
      normalizedIssues.push(
        `Dependency slice '${dependency}' must be merged/bootstrap before Stage ${stage}, found ${dependencyStatus ?? "missing"}.`,
      );
    }
  }

  return {
    checklistContract,
    issues: normalizeStringArray(normalizedIssues),
  };
}

function validateStage1Outputs({
  worktreePath,
  slice,
}) {
  const issues = [];
  const requiredPaths = [
    resolve(worktreePath, "docs", "workpacks", slice, "README.md"),
    resolve(worktreePath, "docs", "workpacks", slice, "acceptance.md"),
    resolve(worktreePath, "docs", "workpacks", slice, "automation-spec.json"),
  ];

  for (const filePath of requiredPaths) {
    if (!existsSync(filePath)) {
      issues.push(`Stage 1 output is missing: ${filePath}.`);
    }
  }

  const roadmap = readSliceRoadmapStatus({
    worktreePath,
    slice,
  });
  if (roadmap.status !== "docs") {
    issues.push(`Stage 1 outputs require roadmap status docs but found ${roadmap.status ?? "missing"}.`);
  }

  return normalizeStringArray(issues);
}

function validateCodeStageChecklistContract({
  checklistContract,
  stage,
  stageResult,
  reviewEntry = null,
}) {
  if (!isChecklistContractActive(checklistContract)) {
    return [];
  }

  if (stage === 1) {
    return [];
  }

  const ownedItems = resolveOwnedChecklistItems(checklistContract, stage);
  const ownedIds = resolveChecklistIds(ownedItems);
  const uncheckedOwnedIds = resolveChecklistIds(resolveUncheckedChecklistItems(ownedItems));
  const checklistUpdates = Array.isArray(stageResult?.checklist_updates)
    ? stageResult.checklist_updates
    : [];
  const contestedFixIds = normalizeStringArray(stageResult?.contested_fix_ids);
  const updatedIds = normalizeStringArray(checklistUpdates.map((entry) => entry.id));
  const currentRequiredFixIds = normalizeStringArray(reviewEntry?.required_fix_ids);
  const issues = [];

  if (ownedIds.length === 0) {
    issues.push(`Checklist contract does not define any Stage ${stage} owned checklist items.`);
  }

  const unresolvedUncheckedIds =
    currentRequiredFixIds.length > 0
      ? uncheckedOwnedIds.filter((id) => !contestedFixIds.includes(id) && !updatedIds.includes(id))
      : uncheckedOwnedIds.filter((id) => !updatedIds.includes(id));
  if (unresolvedUncheckedIds.length > 0) {
    issues.push(
      `Stage ${stage} owned checklist items remain unchecked: ${unresolvedUncheckedIds.join(", ")}.`,
    );
  }

  const invalidStatuses = checklistUpdates
    .filter((entry) => entry?.status !== "checked")
    .map((entry) => entry?.id)
    .filter(Boolean);
  if (invalidStatuses.length > 0) {
    issues.push(`Stage ${stage} checklist_updates must mark items as checked: ${invalidStatuses.join(", ")}.`);
  }

  const foreignIds = updatedIds.filter((id) => !ownedIds.includes(id));
  if (foreignIds.length > 0) {
    issues.push(`Stage ${stage} cannot update checklist ids it does not own: ${foreignIds.join(", ")}.`);
  }

  const missingIds = ownedIds.filter(
    (id) => !updatedIds.includes(id) && !contestedFixIds.includes(id),
  );
  if (missingIds.length > 0) {
    issues.push(`Stage ${stage} stage-result is missing checklist updates for: ${missingIds.join(", ")}.`);
  }

  const invalidContestedIds = contestedFixIds.filter((id) => !currentRequiredFixIds.includes(id));
  if (invalidContestedIds.length > 0) {
    issues.push(
      `Stage ${stage} contested_fix_ids must be a subset of current review required_fix_ids: ${invalidContestedIds.join(", ")}.`,
    );
  }

  const unresolvedReviewFixIds = currentRequiredFixIds.filter(
    (id) => !updatedIds.includes(id) && !contestedFixIds.includes(id),
  );
  if (unresolvedReviewFixIds.length > 0) {
    issues.push(
      `Stage ${stage} must either fix or contest all required review fix ids: ${unresolvedReviewFixIds.join(", ")}.`,
    );
  }

  return normalizeStringArray(issues);
}

function validateReviewStageChecklistContract({
  checklistContract,
  stage,
  stageResult,
  rebuttalEntry = null,
}) {
  if (!isChecklistContractActive(checklistContract)) {
    return [];
  }

  const expectedItems = resolveReviewChecklistItems(checklistContract, stage);
  const expectedIds = resolveChecklistIds(expectedItems);
  const reviewScope = stageResult?.review_scope ?? {
    scope: null,
    checklist_ids: [],
  };
  const scopeIds = normalizeStringArray(reviewScope.checklist_ids);
  const reviewedIds = normalizeStringArray(stageResult?.reviewed_checklist_ids);
  const requiredFixIds = normalizeStringArray(stageResult?.required_fix_ids);
  const waivedFixIds = normalizeStringArray(stageResult?.waived_fix_ids);
  const contestedFixIds = normalizeStringArray(rebuttalEntry?.contested_fix_ids);
  const issues = [];
  const expectedScope = resolveExpectedReviewScope(stage);

  if (expectedIds.length === 0) {
    issues.push(`Checklist contract does not define any review checklist items for Stage ${stage}.`);
  }

  if (reviewScope.scope !== expectedScope) {
    issues.push(`Stage ${stage} review_scope.scope must be '${expectedScope}'.`);
  }

  const missingScopeIds = expectedIds.filter((id) => !scopeIds.includes(id));
  const foreignScopeIds = scopeIds.filter((id) => !expectedIds.includes(id));
  if (missingScopeIds.length > 0) {
    issues.push(`Stage ${stage} review_scope is missing checklist ids: ${missingScopeIds.join(", ")}.`);
  }
  if (foreignScopeIds.length > 0) {
    issues.push(`Stage ${stage} review_scope includes out-of-scope checklist ids: ${foreignScopeIds.join(", ")}.`);
  }

  const missingReviewedIds = expectedIds.filter((id) => !reviewedIds.includes(id));
  const foreignReviewedIds = reviewedIds.filter((id) => !expectedIds.includes(id));
  if (missingReviewedIds.length > 0) {
    issues.push(`Stage ${stage} reviewed_checklist_ids is missing: ${missingReviewedIds.join(", ")}.`);
  }
  if (foreignReviewedIds.length > 0) {
    issues.push(`Stage ${stage} reviewed_checklist_ids includes out-of-scope ids: ${foreignReviewedIds.join(", ")}.`);
  }

  const unknownFixIds = requiredFixIds.filter((id) => !expectedIds.includes(id));
  if (unknownFixIds.length > 0) {
    issues.push(`Stage ${stage} required_fix_ids includes out-of-scope ids: ${unknownFixIds.join(", ")}.`);
  }

  const unreviewedFixIds = requiredFixIds.filter((id) => !reviewedIds.includes(id));
  if (unreviewedFixIds.length > 0) {
    issues.push(`Stage ${stage} required_fix_ids must be included in reviewed_checklist_ids: ${unreviewedFixIds.join(", ")}.`);
  }

  if (stageResult?.decision === "request_changes" && requiredFixIds.length === 0) {
    issues.push(`Stage ${stage} request_changes reviews must include required_fix_ids.`);
  }

  if (stageResult?.decision === "approve" && requiredFixIds.length > 0) {
    issues.push(`Stage ${stage} approved reviews must not include required_fix_ids.`);
  }

  const unknownWaivedIds = waivedFixIds.filter((id) => !contestedFixIds.includes(id));
  if (unknownWaivedIds.length > 0) {
    issues.push(
      `Stage ${stage} waived_fix_ids must be a subset of the latest contested_fix_ids: ${unknownWaivedIds.join(", ")}.`,
    );
  }

  return normalizeStringArray(issues);
}

function applyReviewWaivers({
  checklistContract,
  waivedFixIds,
  waivedStage,
}) {
  if (!isChecklistContractActive(checklistContract) || !Array.isArray(waivedFixIds) || waivedFixIds.length === 0) {
    return [];
  }

  return applyChecklistWaiverMetadata({
    contract: checklistContract,
    waivedFixIds,
    waivedStage,
    waivedReason: "rebuttal_accepted",
  });
}

function resolveNextReviewStageForCodeStage(stage, state) {
  if (stage === 2) {
    return 3;
  }

  const lastFrontendReview = state.last_review?.frontend;
  return lastFrontendReview?.decision === "request_changes" &&
    lastFrontendReview?.source_review_stage === 6
    ? 6
    : 5;
}

function shouldReturnToReviewWithRebuttal({
  stage,
  reviewEntry,
  stageResult,
}) {
  const currentRequiredFixIds = normalizeStringArray(reviewEntry?.required_fix_ids);
  const contestedFixIds = normalizeStringArray(stageResult?.contested_fix_ids);

  if (![2, 4].includes(stage) || currentRequiredFixIds.length === 0) {
    return false;
  }

  return currentRequiredFixIds.every((id) => contestedFixIds.includes(id));
}

function resolveStage2Subphase(state) {
  const activeSubphase = state.execution?.subphase ?? null;
  if (
    state.active_stage === 2 &&
    isPendingFinalizePhase(resolveStatePhase(state)) &&
    ["doc_gate_repair", "implementation"].includes(activeSubphase)
  ) {
    return activeSubphase;
  }

  if (
    state.active_stage === 2 &&
    isPendingReviewPhase(resolveStatePhase(state)) &&
    activeSubphase === "doc_gate_review"
  ) {
    return activeSubphase;
  }

  if (state.prs?.backend?.url || state.last_completed_stage >= 2) {
    return "implementation";
  }

  const status = state.doc_gate?.status ?? null;
  if (!status || status === "pending_check" || status === "pending_recheck") {
    return "doc_gate_check";
  }

  if (status === "fixable") {
    return "doc_gate_repair";
  }

  if (status === "awaiting_review") {
    return "doc_gate_review";
  }

  if (status === "passed") {
    return "implementation";
  }

  return "doc_gate_check";
}

function resolveDesignAuthorityConfig({
  rootDir,
  slice,
}) {
  const { automationSpec } = readAutomationSpec({
    rootDir,
    slice,
    required: false,
  });

  return automationSpec?.frontend?.design_authority ?? null;
}

function resolveStage4Subphase({
  rootDir,
  slice,
  state,
}) {
  const activeSubphase = state.execution?.subphase ?? null;
  if (
    state.active_stage === 4 &&
    isPendingFinalizePhase(resolveStatePhase(state)) &&
    ["authority_precheck", "implementation"].includes(activeSubphase)
  ) {
    return activeSubphase;
  }

  const lastFrontendReview = state.last_review?.frontend;
  if (
    lastFrontendReview?.decision === "request_changes" &&
    lastFrontendReview?.route_back_stage === 4
  ) {
    return "implementation";
  }

  const designAuthorityConfig = resolveDesignAuthorityConfig({
    rootDir,
    slice,
  });
  if (!designAuthorityConfig?.authority_required) {
    return "implementation";
  }

  return state.design_authority?.status === "pending_precheck" ||
    state.design_authority?.status === "prechecked"
    ? "authority_precheck"
    : "implementation";
}

function resolveStage5Subphase({
  rootDir,
  slice,
  state,
}) {
  const activeSubphase = state.execution?.subphase ?? null;
  if (
    state.active_stage === 5 &&
    (isPendingReviewPhase(resolveStatePhase(state)) || resolveStatePhase(state) === "merge_pending") &&
    ["final_authority_gate", "implementation"].includes(activeSubphase)
  ) {
    return activeSubphase;
  }

  const designAuthorityConfig = resolveDesignAuthorityConfig({
    rootDir,
    slice,
  });
  if (!designAuthorityConfig?.authority_required) {
    return "implementation";
  }

  return state.design_authority?.status === "final_authority_pending"
    ? "final_authority_gate"
    : "implementation";
}

function resolvePublicStageApprovalState(stage) {
  return resolveStageSessionRole(stage, "implementation") === "claude_primary"
    ? "claude_approved"
    : "codex_approved";
}

function validateFinalAuthorityGateReadiness({
  designAuthorityConfig,
  designAuthorityState,
}) {
  if (!designAuthorityConfig?.authority_required) {
    return [];
  }

  const issues = [];
  if (designAuthorityState?.status !== "reviewed") {
    issues.push("Authority-required Stage 6 requires Claude final_authority_gate to finish with design_authority.status=reviewed.");
  }

  if (designAuthorityState?.authority_verdict !== "pass") {
    issues.push("Authority-required Stage 6 requires final authority verdict pass before review or merge can continue.");
  }

  return normalizeStringArray(issues);
}

function validateAuthorityPrecheckStageResult({
  stageResult,
  authorityConfig,
}) {
  const issues = [];
  const requiredScreens = normalizeStringArray(authorityConfig?.required_screens);
  const reviewedScreenIds = normalizeStringArray(stageResult?.reviewed_screen_ids);
  const authorityReportPaths = normalizeStringArray(stageResult?.authority_report_paths);
  const evidenceArtifactRefs = normalizeStringArray(stageResult?.evidence_artifact_refs);
  const blockerCount = typeof stageResult?.blocker_count === "number" ? stageResult.blocker_count : null;
  const majorCount = typeof stageResult?.major_count === "number" ? stageResult.major_count : null;
  const minorCount = typeof stageResult?.minor_count === "number" ? stageResult.minor_count : null;
  const verdict = stageResult?.authority_verdict ?? null;

  const missingScreens = requiredScreens.filter((screenId) => !reviewedScreenIds.includes(screenId));
  if (missingScreens.length > 0) {
    issues.push(`Authority precheck must review required screens: ${missingScreens.join(", ")}.`);
  }

  if (authorityReportPaths.length === 0) {
    issues.push("Authority precheck must record authority_report_paths.");
  }

  if (evidenceArtifactRefs.length === 0) {
    issues.push("Authority precheck must record evidence_artifact_refs.");
  }

  if (blockerCount === null || majorCount === null || minorCount === null) {
    issues.push("Authority precheck must record blocker_count, major_count, and minor_count.");
  }

  if (verdict === "pass" && (blockerCount ?? 0) > 0) {
    issues.push("Authority precheck cannot return pass when blocker_count is greater than zero.");
  }

  if (verdict === "conditional-pass" && (blockerCount ?? 0) > 0) {
    issues.push("Authority precheck conditional-pass requires blocker_count to be zero.");
  }

  if (verdict === "hold" && (blockerCount ?? 0) <= 0) {
    issues.push("Authority precheck hold requires blocker_count to be greater than zero.");
  }

  return normalizeStringArray(issues);
}

function validateAuthorityReviewStageResult({
  stageResult,
  authorityConfig,
  worktreePath,
}) {
  const issues = [];
  const requiredScreens = normalizeStringArray(authorityConfig?.required_screens);
  const reviewedScreenIds = normalizeStringArray(stageResult?.reviewed_screen_ids);
  const authorityReportPaths = normalizeStringArray(stageResult?.authority_report_paths);
  const blockerCount = typeof stageResult?.blocker_count === "number" ? stageResult.blocker_count : null;
  const majorCount = typeof stageResult?.major_count === "number" ? stageResult.major_count : null;
  const minorCount = typeof stageResult?.minor_count === "number" ? stageResult.minor_count : null;
  const verdict = stageResult?.authority_verdict ?? null;

  if (!verdict) {
    issues.push("Stage 5 authority review must include authority_verdict.");
  }

  const missingScreens = requiredScreens.filter((screenId) => !reviewedScreenIds.includes(screenId));
  if (missingScreens.length > 0) {
    issues.push(`Stage 5 authority review must cover required screens: ${missingScreens.join(", ")}.`);
  }

  if (authorityReportPaths.length === 0) {
    issues.push("Stage 5 authority review must include authority_report_paths.");
  }

  const missingReports = authorityReportPaths.filter((reportPath) => !existsSync(resolve(worktreePath, reportPath)));
  if (missingReports.length > 0) {
    issues.push(`Stage 5 authority review is missing authority reports: ${missingReports.join(", ")}.`);
  }

  if (blockerCount === null || majorCount === null || minorCount === null) {
    issues.push("Stage 5 authority review must record blocker_count, major_count, and minor_count.");
  }

  if (stageResult?.decision === "approve" && verdict !== "pass") {
    issues.push("Stage 5 approve reviews must use authority_verdict=pass.");
  }

  if (stageResult?.decision !== "approve" && Number(stageResult?.route_back_stage) !== 4) {
    issues.push("Stage 5 authority review request_changes must route back to Stage 4.");
  }

  if (verdict === "pass" && (blockerCount ?? 0) > 0) {
    issues.push("Stage 5 pass verdict requires blocker_count to be zero.");
  }

  if (verdict === "conditional-pass") {
    if ((blockerCount ?? 0) > 0) {
      issues.push("Stage 5 conditional-pass requires blocker_count to be zero.");
    }
    if ((majorCount ?? 0) <= 0) {
      issues.push("Stage 5 conditional-pass requires at least one major finding.");
    }
  }

  if (verdict === "hold" && (blockerCount ?? 0) <= 0) {
    issues.push("Stage 5 hold requires blocker_count to be greater than zero.");
  }

  return normalizeStringArray(issues);
}

function validateDocGateRepairStageResult({
  slice,
  stageResult,
  reviewEntry,
  docGateState,
}) {
  const allowedFiles = resolveDocGateAllowedFiles(slice);
  const actualFiles = normalizeStringArray(stageResult?.changed_files);
  const claimedFiles = normalizeStringArray(stageResult?.claimed_scope?.files);
  const resolvedDocFindingIds = normalizeStringArray(stageResult?.resolved_doc_finding_ids);
  const contestedDocFixIds = normalizeStringArray(stageResult?.contested_doc_fix_ids);
  const currentRequiredDocFixIds = normalizeStringArray(reviewEntry?.required_doc_fix_ids);
  const currentDocFindingIds = normalizeStringArray((docGateState?.findings ?? []).map((entry) => entry?.id));
  const targetDocIds = currentRequiredDocFixIds.length > 0 ? currentRequiredDocFixIds : currentDocFindingIds;
  const issues = [];

  const unexpectedChangedFiles = actualFiles.filter((filePath) => !allowedFiles.includes(filePath));
  if (unexpectedChangedFiles.length > 0) {
    issues.push(`Doc gate repair may only change workpack docs: ${unexpectedChangedFiles.join(", ")}.`);
  }

  const unexpectedClaimedFiles = claimedFiles.filter((filePath) => !allowedFiles.includes(filePath));
  if (unexpectedClaimedFiles.length > 0) {
    issues.push(`Doc gate repair claimed_scope.files contains out-of-scope paths: ${unexpectedClaimedFiles.join(", ")}.`);
  }

  const overlap = resolvedDocFindingIds.filter((id) => contestedDocFixIds.includes(id));
  if (overlap.length > 0) {
    issues.push(`Doc gate repair cannot both resolve and contest the same finding ids: ${overlap.join(", ")}.`);
  }

  const unresolvedIds = targetDocIds.filter((id) => !resolvedDocFindingIds.includes(id) && !contestedDocFixIds.includes(id));
  if (unresolvedIds.length > 0) {
    issues.push(`Doc gate repair must resolve or contest all target doc findings: ${unresolvedIds.join(", ")}.`);
  }

  const invalidContestedIds =
    currentRequiredDocFixIds.length > 0
      ? contestedDocFixIds.filter((id) => !currentRequiredDocFixIds.includes(id))
      : [];
  if (invalidContestedIds.length > 0) {
    issues.push(`Doc gate contested ids must be a subset of current required doc fix ids: ${invalidContestedIds.join(", ")}.`);
  }

  return normalizeStringArray(issues);
}

function validateDocGateReviewStageResult({
  docGateState,
  stageResult,
}) {
  const currentDocFindingIds = normalizeStringArray((docGateState?.findings ?? []).map((entry) => entry?.id));
  const rebuttalEntry = docGateState?.last_rebuttal ?? null;
  const reviewedIds = normalizeStringArray(stageResult?.reviewed_doc_finding_ids);
  const requiredIds = normalizeStringArray(stageResult?.required_doc_fix_ids);
  const waivedIds = normalizeStringArray(stageResult?.waived_doc_fix_ids);
  const contestedIds = normalizeStringArray(rebuttalEntry?.contested_doc_fix_ids);
  const issues = [];

  if (reviewedIds.length === 0) {
    issues.push("Doc gate review must include reviewed_doc_finding_ids.");
  }

  const missingReviewedIds = currentDocFindingIds.filter((id) => !reviewedIds.includes(id));
  if (missingReviewedIds.length > 0) {
    issues.push(`Doc gate review is missing reviewed finding ids: ${missingReviewedIds.join(", ")}.`);
  }

  const invalidRequiredIds = requiredIds.filter((id) => !reviewedIds.includes(id));
  if (invalidRequiredIds.length > 0) {
    issues.push(`Doc gate required_doc_fix_ids must be included in reviewed_doc_finding_ids: ${invalidRequiredIds.join(", ")}.`);
  }

  const invalidWaivedIds = waivedIds.filter((id) => !contestedIds.includes(id));
  if (invalidWaivedIds.length > 0) {
    issues.push(`Doc gate waived_doc_fix_ids must be a subset of contested_doc_fix_ids: ${invalidWaivedIds.join(", ")}.`);
  }

  if (stageResult?.decision === "request_changes" && requiredIds.length === 0) {
    issues.push("Doc gate request_changes reviews must include required_doc_fix_ids.");
  }

  if (stageResult?.decision === "approve" && requiredIds.length > 0) {
    issues.push("Doc gate approve reviews must not include required_doc_fix_ids.");
  }

  return normalizeStringArray(issues);
}

function resolveAutonomousStageContext({
  rootDir,
  workItemId,
  slice,
  stage,
}) {
  const { workItemPath, workItem } = readTrackedWorkItem({
    rootDir,
    workItemId,
  });
  const { automationSpecPath, automationSpec } = readAutomationSpec({
    rootDir,
    slice,
    required: false,
  });
  const policy = resolveAutonomousSlicePolicy({
    workItem,
    automationSpec,
  });
  const stageConfig = resolveStageAutomationConfig({
    automationSpec,
    stage,
  });

  return {
    workItem,
    workItemPath,
    automationSpec,
    automationSpecPath,
    policy,
    stageConfig,
  };
}

function isApprovalRequirementMergeError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /(approving review|required reviews|review required|at least .* approving review)/i.test(
    error.message,
  );
}

function applyCodeStageBookkeeping({
  worktreePath,
  slice,
  stage,
}) {
  if (stage === 2) {
    return updateSliceRoadmapStatus({
      worktreePath,
      slice,
      status: "in-progress",
    });
  }

  if (stage === 4) {
    return updateWorkpackDesignStatus({
      worktreePath,
      slice,
      targetStatus: "pending-review",
    });
  }

  return {
    changed: false,
    filePath: null,
  };
}

function applyDesignReviewBookkeeping({
  worktreePath,
  slice,
  updateAuthorityStatus = false,
}) {
  const designStatusResult = updateWorkpackDesignStatus({
    worktreePath,
    slice,
    targetStatus: "confirmed",
  });
  const authorityResult = updateAuthorityStatus
    ? updateWorkpackDesignAuthorityStatus({
        worktreePath,
        slice,
        targetStatus: "reviewed",
      })
    : {
        changed: false,
        filePath: null,
      };

  return {
    changed: designStatusResult.changed || authorityResult.changed,
    filePath: designStatusResult.changed ? designStatusResult.filePath : authorityResult.filePath,
  };
}

function applyFrontendMergeBookkeeping({
  worktreePath,
  slice,
}) {
  return updateSliceRoadmapStatus({
    worktreePath,
    slice,
    status: "merged",
  });
}

function summarizeBookkeepingIssues(issues) {
  const normalizedIssues = Array.isArray(issues) ? issues : [];
  return normalizedIssues
    .map((issue) => {
      const kind = issue?.kind ?? "unknown";
      const actual = issue?.actual ?? "missing";
      const expected = issue?.expected ?? "unknown";
      return `${kind}:${actual}->${expected}`;
    })
    .join(",");
}

function buildBookkeepingRepairCommit({
  slice,
  issues,
}) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const kinds = new Set((Array.isArray(issues) ? issues : []).map((issue) => issue?.kind));
  if (kinds.size === 1 && kinds.has("design_status")) {
    return {
      subject: `docs(workpack): reconcile ${normalizedSlice} design status`,
      body: "OMO bookkeeping drift를 복구하기 위해 Design Status를 공식 상태와 정렬합니다.",
    };
  }

  if (kinds.size === 1 && kinds.has("roadmap_status")) {
    return {
      subject: `docs(workpacks): reconcile ${normalizedSlice} status`,
      body: "OMO bookkeeping drift를 복구하기 위해 공식 Slice Status를 runtime 상태와 정렬합니다.",
    };
  }

  return {
    subject: `docs(workpacks): reconcile ${normalizedSlice} bookkeeping`,
    body: "OMO bookkeeping drift를 복구하기 위해 공식 roadmap/workpack 상태를 runtime 상태와 정렬합니다.",
  };
}

function resolveBookkeepingRepairLifecycle({
  stage,
  prRole,
}) {
  if (prRole === "docs") {
    return "in_progress";
  }

  if (prRole === "closeout") {
    return "ready_for_review";
  }

  if (stage >= 3) {
    return "ready_for_review";
  }

  return "in_progress";
}

function repairActiveBookkeepingDrift({
  rootDir,
  workItemId,
  slice,
  state,
  invariant,
  stage,
  prRole,
  branchName,
  activePr,
  worktree,
  now,
}) {
  if (!state.workspace?.path) {
    throw new Error("Worktree path is missing for bookkeeping repair.");
  }

  const repair = applyBookkeepingRepairPlan({
    worktreePath: state.workspace.path,
    slice,
    repairActions: invariant.repairActions,
  });
  if (!repair.changed) {
    return state;
  }

  const commitMessage = buildBookkeepingRepairCommit({
    slice,
    issues: invariant.issues,
  });
  commitWorktreeChanges({
    worktreePath: state.workspace.path,
    subject: commitMessage.subject,
    body: commitMessage.body,
  });
  worktree.pushBranch({
    branch: branchName,
  });

  const headSha = worktree.getHeadSha();
  const updatedPr = activePr?.url
    ? upsertPullRequest({
        rootDir,
        workItemId,
        state,
        role: prRole,
        pr: activePr,
        branch: branchName,
        headSha,
        now,
      })
    : state;
  const repairStage = Number.isInteger(stage) ? stage : state.wait?.stage ?? state.active_stage ?? null;
  const repairedState = saveRuntime({
    rootDir,
    workItemId,
    state: setWaitState({
      state: setExecutionState({
        state: updatedPr,
        activeStage: repairStage,
        phase: repairStage === 6 ? "merge_pending" : "wait",
        nextAction: "poll_ci",
        artifactDir: updatedPr.execution?.artifact_dir ?? updatedPr.last_artifact_dir,
        execution: updatedPr.execution,
      }),
      kind: "ci",
      prRole,
      stage: repairStage,
      headSha,
      phase: repairStage === 6 ? "merge_pending" : "wait",
      nextAction: "poll_ci",
      updatedAt: now,
    }),
  });
  updateRuntimeStatusForWait({
    rootDir,
    workItemId,
    wait: repairedState.wait,
    prPath: activePr?.url ?? null,
    now,
    approvalState:
      resolveStageSessionRole(repairStage, repairedState.execution?.subphase ?? "implementation") === "claude_primary"
        ? "claude_approved"
        : "codex_approved",
    lifecycle: resolveBookkeepingRepairLifecycle({
      stage: repairStage,
      prRole,
    }),
    verificationStatus: "pending",
    extraNotes: [
      `bookkeeping_repair=${summarizeBookkeepingIssues(invariant.issues)}`,
    ],
  });

  return repairedState;
}

function finalizeCloseoutReconciliation({
  rootDir,
  workItemId,
  state,
  activePr,
  now,
}) {
  const nextState = saveRuntime({
    rootDir,
    workItemId,
    state: {
      ...state,
      wait: null,
      phase: "done",
      next_action: "noop",
      recovery: null,
    },
  });
  syncStatus({
    rootDir,
    workItemId,
    patch: {
      pr_path: activePr.url,
      lifecycle: "merged",
      approval_state: "dual_approved",
      verification_status: "passed",
      notes: `wait_kind=none closeout_pr=${activePr.url} closeout_status=merged`,
    },
    now,
  });

  return {
    state: nextState,
    wait: null,
    transitioned: false,
    merged: true,
  };
}

function defaultBackRoute(stage) {
  if (stage === 3) return 2;
  return 4;
}

function bucketToVerification(bucket) {
  if (bucket === "fail") {
    return "failed";
  }

  if (bucket === "pass") {
    return "passed";
  }

  return "pending";
}

function resolveStatePhase(state) {
  return typeof state?.phase === "string" && state.phase.trim().length > 0
    ? state.phase.trim()
    : null;
}

function isPendingFinalizePhase(phase) {
  return ["stage_result_ready", "verify_pending", "commit_pending", "push_pending", "pr_pending"].includes(
    phase,
  );
}

function isPendingReviewPhase(phase) {
  return ["review_pending", "merge_pending"].includes(phase);
}

function shouldAllowDirtyWorktree(state) {
  const phase = resolveStatePhase(state);
  return ["stage_result_ready", "verify_pending", "commit_pending"].includes(phase);
}

function createTickResult({
  workItemId,
  slice = null,
  action,
  reason = null,
  wait = null,
  runtime = null,
}) {
  return {
    workItemId,
    slice,
    action,
    reason,
    wait,
    runtime,
  };
}

function resolveStageProvider({
  rootDir,
  stage,
  subphase = null,
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  opencodeBin,
  environment,
}) {
  if (
    (stage === 2 && subphase === "doc_gate_review") ||
    (stage === 5 && subphase === "final_authority_gate")
  ) {
    const claudeProviderConfig = resolveClaudeProviderConfig({
      rootDir,
      provider: claudeProvider,
      bin: claudeBin,
      model: claudeModel,
      effort: claudeEffort,
    });

    return {
      provider: claudeProviderConfig.provider,
      bin: claudeProviderConfig.bin,
      label: claudeProviderConfig.provider === "opencode" ? "Claude OpenCode" : "Claude CLI",
    };
  }

  if (stage === 2 || stage === 5 || stage === 6 || (stage === 4 && subphase === "authority_precheck")) {
    const codexProviderConfig = resolveCodexProviderConfig({
      rootDir,
      bin: opencodeBin,
      environment,
    });

    return {
      provider: "opencode",
      bin: codexProviderConfig.bin,
      label: "Codex OpenCode",
    };
  }

  const claudeProviderConfig = resolveClaudeProviderConfig({
    rootDir,
    provider: claudeProvider,
    bin: claudeBin,
    model: claudeModel,
    effort: claudeEffort,
  });

  return {
    provider: claudeProviderConfig.provider,
    bin: claudeProviderConfig.bin,
    label: claudeProviderConfig.provider === "opencode" ? "Claude OpenCode" : "Claude CLI",
  };
}

function runProviderPreflight({
  bin,
  args,
  rootDir,
  environment,
  errorPrefix,
}) {
  const result = spawnSync(bin, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...(environment ?? {}),
    },
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(`${errorPrefix}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
    const details = stderr || stdout || `exit code ${result.status}`;
    throw new Error(`${errorPrefix}: ${details}`);
  }

  return {
    stdout: typeof result.stdout === "string" ? result.stdout.trim() : "",
    stderr: typeof result.stderr === "string" ? result.stderr.trim() : "",
  };
}

function buildRecoverySnapshot({
  state,
  stage,
  kind,
  reason,
  prRole,
  artifactDir,
  worktreePath,
  worktree,
  now,
}) {
  if (typeof worktreePath !== "string" || worktreePath.trim().length === 0) {
    return null;
  }

  let branch = null;
  let changedFiles = [];

  try {
    branch = worktree.getCurrentBranch({
      worktreePath,
    });
  } catch {
    branch = state.prs?.[prRole ?? ""]?.branch ?? null;
  }

  try {
    changedFiles = worktree.listChangedFiles({
      worktreePath,
    });
  } catch {
    changedFiles = [];
  }

  const sessionRole =
    state.execution?.session_role ??
    (Number.isInteger(stage) && stage >= 1 && stage <= 6
      ? resolveStageSessionRole(stage, state.execution?.subphase ?? "implementation")
      : null);
  const session = sessionRole ? state.sessions?.[sessionRole] ?? null : null;
  const existingPr = prRole ? state.prs?.[prRole] ?? null : null;

  return {
    kind,
    stage,
    branch,
    reason,
    artifact_dir: artifactDir ?? state.last_artifact_dir,
    changed_files: changedFiles,
    existing_pr:
      existingPr?.url
        ? {
            role: prRole,
            number: existingPr.number ?? null,
            url: existingPr.url,
            draft: existingPr.draft ?? null,
            branch: existingPr.branch ?? null,
            head_sha: existingPr.head_sha ?? null,
          }
        : null,
    salvage_candidate: changedFiles.length > 0,
    session_role: sessionRole,
    session_provider: session?.provider ?? state.execution?.provider ?? null,
    session_id: session?.session_id ?? state.execution?.session_id ?? null,
    updated_at: now,
  };
}

function createDefaultStageRunner({
  rootDir,
  claudeBudgetState,
  mode,
  opencodeBin,
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  environment,
  homeDir,
  now,
}) {
  return ({
    workItemId,
    slice,
    stage,
    subphase = null,
    executionDir,
    priorStageResultPath = null,
    extraPromptSections = [],
  }) =>
    runStageWithArtifacts({
      rootDir,
      executionDir,
      workItemId,
      slice,
      stage,
      subphase,
      claudeBudgetState,
      mode,
      opencodeBin,
      claudeProvider,
      claudeBin,
      claudeModel,
      claudeEffort,
      environment,
      homeDir,
      now,
      syncStatus: false,
      lifecycleMode: "supervisor",
      extraPromptSections,
      priorStageResultPath,
    });
}

function loadRuntime({ rootDir, workItemId, slice }) {
  return readRuntimeState({
    rootDir,
    workItemId,
    slice,
  }).state;
}

function saveRuntime({ rootDir, workItemId, state }) {
  return writeRuntimeState({
    rootDir,
    workItemId,
    state,
  }).state;
}

function syncStatus({
  rootDir,
  workItemId,
  patch,
  now,
}) {
  return syncWorkflowV2Status({
    rootDir,
    workItemId,
    patch,
    updatedAt: now,
  });
}

function applyBlocker({
  rootDir,
  workItemId,
  slice,
  state,
  reason,
  recovery = null,
  prPath = null,
  now,
}) {
  const nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setRecoveryState({
      state: setWaitState({
        state,
        kind: "human_escalation",
        reason,
        updatedAt: now,
      }),
      recovery,
    }),
  });
  const notes = [`wait_kind=human_escalation`, `reason=${reason}`];
  if (recovery?.kind) {
    notes.push(`recovery_kind=${recovery.kind}`);
  }
  if (recovery?.artifact_dir) {
    notes.push(`artifact_dir=${recovery.artifact_dir}`);
  }
  syncStatus({
    rootDir,
    workItemId,
    patch: {
      pr_path: prPath ?? undefined,
      lifecycle: "blocked",
      approval_state: "human_escalation",
      verification_status: "pending",
      notes: notes.join(" "),
    },
    now,
  });

  return {
    slice,
    workItemId,
    wait: nextState.wait,
    runtime: nextState,
  };
}

function updateRuntimeStatusForWait({
  rootDir,
  workItemId,
  wait,
  prPath,
  now,
  approvalState = null,
  lifecycle = "in_progress",
  verificationStatus = "pending",
  extraNotes = [],
}) {
  const notes = [`wait_kind=${wait.kind}`];
  if (wait.pr_role) {
    notes.push(`pr_role=${wait.pr_role}`);
  }
  if (wait.stage) {
    notes.push(`stage=${wait.stage}`);
  }
  if (wait.reason) {
    notes.push(`reason=${wait.reason}`);
  }
  if (wait.head_sha) {
    notes.push(`head_sha=${wait.head_sha}`);
  }
  notes.push(...extraNotes);

  const statusPatch = {
    pr_path: prPath ?? undefined,
    lifecycle,
    verification_status: verificationStatus,
    notes: notes.join(" "),
  };
  if (typeof approvalState === "string" && approvalState.trim().length > 0) {
    statusPatch.approval_state = approvalState;
  }

  syncStatus({
    rootDir,
    workItemId,
    patch: statusPatch,
    now,
  });
}

function resolveApprovedHeadSha({
  approvedHeadSha,
  activeHeadSha,
}) {
  const normalizedApproved =
    typeof approvedHeadSha === "string" && approvedHeadSha.trim().length > 0
      ? approvedHeadSha.trim()
      : null;
  const normalizedActive =
    typeof activeHeadSha === "string" && activeHeadSha.trim().length > 0 ? activeHeadSha.trim() : null;

  if (!normalizedApproved) {
    return normalizedActive;
  }

  if (!normalizedActive) {
    return normalizedApproved;
  }

  if (
    normalizedApproved === normalizedActive ||
    (normalizedApproved.length < normalizedActive.length &&
      normalizedActive.startsWith(normalizedApproved))
  ) {
    return normalizedActive;
  }

  return normalizedApproved;
}
function finalizeMergedReviewStage({
  rootDir,
  workItemId,
  state,
  stage,
  activePr,
  artifactDir,
  worktree,
  now,
}) {
  if (stage === 3) {
    worktree.syncBaseBranch();
    const nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state: markStageCompleted({
          state,
          stage,
          artifactDir,
        }),
        kind: "ready_for_next_stage",
        stage: 4,
        updatedAt: now,
      }),
    });
    updateRuntimeStatusForWait({
      rootDir,
      workItemId,
      wait: nextState.wait,
      prPath: activePr.url,
      now,
      approvalState: "dual_approved",
      lifecycle: "in_progress",
      verificationStatus: "passed",
      extraNotes: ["merge_source=autonomous_review_artifact"],
    });
    return {
      state: nextState,
      wait: nextState.wait,
      transitioned: true,
    };
  }

  const nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWaitState({
      state: markStageCompleted({
        state,
        stage,
        artifactDir,
      }),
      kind: null,
      updatedAt: now,
    }),
  });
  syncStatus({
    rootDir,
    workItemId,
    patch: {
      pr_path: activePr.url,
      lifecycle: "merged",
      approval_state: "dual_approved",
      verification_status: "passed",
      notes: "wait_kind=none merged_after_autonomous_review",
    },
    now,
  });
  return {
    state: nextState,
    wait: null,
    transitioned: true,
    merged: true,
  };
}

function resolveRunResultRuntimeState({
  rootDir,
  workItemId,
  slice,
  runResult,
}) {
  return (
    runResult.runtimeSync?.state ??
    loadRuntime({
      rootDir,
      workItemId,
      slice,
    })
  );
}

function loadExecutionStageResult(state, options = {}) {
  const stage = state.active_stage ?? state.current_stage ?? null;
  const stageResultPath = state.execution?.stage_result_path ?? null;
  if (!Number.isInteger(stage)) {
    throw new Error("Active stage is missing for execution finalization.");
  }

  if (typeof stageResultPath !== "string" || stageResultPath.trim().length === 0 || !existsSync(stageResultPath)) {
    throw new Error("stage-result.json is missing for execution finalization.");
  }

  return validateStageResult(stage, JSON.parse(readFileSync(stageResultPath, "utf8")), {
    ...options,
    subphase: options?.subphase ?? state.execution?.subphase ?? "implementation",
  });
}

function syncEvaluationStatus({
  rootDir,
  workItemId,
  evaluationStatus,
  evaluationRound,
  evaluatorResultPath,
  autoMergeEligible,
  blockedReasonCode = null,
  now,
}) {
  syncStatus({
    rootDir,
    workItemId,
    patch: {
      evaluation_status: evaluationStatus,
      evaluation_round: evaluationRound,
      last_evaluator_result: evaluatorResultPath,
      auto_merge_eligible: autoMergeEligible,
      blocked_reason_code: blockedReasonCode,
    },
    now,
  });
}

function runAutonomousEvaluationLoop({
  rootDir,
  workItemId,
  slice,
  stage,
  subphase = "implementation",
  state,
  stageRunner,
  worktree,
  now,
}) {
  let nextState = state;
  const context = resolveAutonomousStageContext({
    rootDir,
    workItemId,
    slice,
    stage,
  });

  if (!context.policy.autonomous || !context.stageConfig) {
    return {
      state: nextState,
      transitioned: false,
      wait: nextState.wait,
      autonomous: false,
    };
  }

  const maxRounds = context.stageConfig.max_fix_rounds ?? 1;
  if (maxRounds <= 0) {
    return {
      state: nextState,
      transitioned: false,
      wait: nextState.wait,
      autonomous: true,
    };
  }

  for (let evaluationRound = 1; evaluationRound <= maxRounds; evaluationRound += 1) {
    const artifactDir = nextState.execution?.artifact_dir ?? nextState.last_artifact_dir;
    const evaluation = evaluateWorkItemStage({
      rootDir,
      workItemId,
      slice,
      stage,
      artifactDir,
      now,
    });
    const evaluatorResultPath = resolve(evaluation.artifactDir, "result.json");
    syncEvaluationStatus({
      rootDir,
      workItemId,
      evaluationStatus:
        evaluation.outcome === "pass"
          ? "passed"
          : evaluation.outcome === "fixable"
            ? "fixable"
            : "blocked",
      evaluationRound,
      evaluatorResultPath,
      autoMergeEligible: evaluation.mergeEligible,
      blockedReasonCode:
        evaluation.outcome === "blocked" ? evaluation.findings[0]?.id ?? "evaluation_blocked" : null,
      now,
    });

    if (evaluation.outcome === "pass") {
      return {
        state: nextState,
        transitioned: false,
        wait: nextState.wait,
        autonomous: true,
      };
    }

    if (evaluation.outcome === "blocked") {
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice,
        state: nextState,
        stage,
        prRole: resolvePrRole(stage),
        reason: evaluation.summary,
        now,
        worktree,
      });
    }

    if (evaluationRound >= maxRounds) {
      syncEvaluationStatus({
        rootDir,
        workItemId,
        evaluationStatus: "stalled",
        evaluationRound,
        evaluatorResultPath,
        autoMergeEligible: false,
        blockedReasonCode: "max_fix_rounds_exhausted",
        now,
      });
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice,
        state: nextState,
        stage,
        prRole: resolvePrRole(stage),
        reason: `Autonomous ${stage === 2 ? "backend" : "frontend"} remediation exhausted max_fix_rounds.`,
        now,
        worktree,
      });
    }

    const remediationPrompt =
      evaluation.remediation.promptPath && existsSync(evaluation.remediation.promptPath)
        ? readFileSync(evaluation.remediation.promptPath, "utf8").trim()
        : null;
    const rerun = stageRunner({
      rootDir,
      workItemId,
      slice,
      stage,
      subphase,
      executionDir: nextState.workspace?.path,
      priorStageResultPath: nextState.execution?.stage_result_path ?? null,
      extraPromptSections: remediationPrompt ? [remediationPrompt] : [],
    });
    const deferredOutcome = handleDeferredStageExecution({
      rootDir,
      workItemId,
      slice,
      stage,
      prRole: resolvePrRole(stage),
      prPath: getActivePullRequest(nextState, resolvePrRole(stage))?.url ?? null,
      headSha: getActivePullRequest(nextState, resolvePrRole(stage))?.head_sha ?? null,
      runResult: rerun,
      worktree,
      now,
    });
    if (deferredOutcome) {
      return deferredOutcome;
    }

    nextState = resolveRunResultRuntimeState({
      rootDir,
      workItemId,
      slice,
      runResult: rerun,
    });

    if (!isPendingFinalizePhase(resolveStatePhase(nextState)) && rerun.stageResult) {
      const stageResultPath = resolve(rerun.artifactDir, "stage-result.json");
      mkdirSync(rerun.artifactDir, { recursive: true });
      if (!existsSync(stageResultPath)) {
        writeFileSync(stageResultPath, `${JSON.stringify(rerun.stageResult, null, 2)}\n`);
      }
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "stage_result_ready",
          nextAction: "finalize_stage",
          artifactDir: rerun.artifactDir,
          execution: {
            provider: rerun.execution?.provider ?? null,
            session_role: resolveStageSessionRole(stage, subphase),
            session_id: rerun.execution?.sessionId ?? null,
            artifact_dir: rerun.artifactDir,
            stage_result_path: stageResultPath,
            started_at: now,
            finished_at: now,
            verify_commands: [],
            verify_bucket: null,
            commit_sha: null,
            pr_role: resolvePrRole(stage),
            subphase,
          },
          clearRecovery: true,
        }),
      });
    }
  }

  return {
    state: nextState,
    transitioned: false,
    wait: nextState.wait,
    autonomous: true,
  };
}

function runVerifyCommands({
  worktreePath,
  commands,
  artifactDir,
}) {
  const normalizedCommands = Array.isArray(commands)
    ? commands.filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    : [];

  if (normalizedCommands.length === 0) {
    return {
      bucket: "pass",
      commands: [],
    };
  }

  const results = normalizedCommands.map((command, index) => {
    const result = spawnSync("zsh", ["-lc", command], {
      cwd: worktreePath,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    const prefix = resolve(artifactDir, `verify-${index + 1}`);
    writeFileSync(`${prefix}.stdout.log`, result.stdout ?? "");
    writeFileSync(`${prefix}.stderr.log`, result.stderr ?? "");

    return {
      command,
      exitCode: result.status ?? null,
      ok: result.status === 0 && !result.error,
    };
  });

  return {
    bucket: results.every((entry) => entry.ok) ? "pass" : "fail",
    commands: results,
  };
}

function handleDeferredStageExecution({
  rootDir,
  workItemId,
  slice,
  stage,
  prRole,
  prPath,
  headSha,
  runResult,
  worktree,
  now,
}) {
  if (runResult.execution?.mode === "execute") {
    return null;
  }

  const runtimeState = resolveRunResultRuntimeState({
    rootDir,
    workItemId,
    slice,
    runResult,
  });
  const runtimePhase = resolveStatePhase(runtimeState);

  if (isPendingFinalizePhase(runtimePhase) || isPendingReviewPhase(runtimePhase)) {
    return null;
  }

  if (runResult.execution?.mode === "scheduled-retry") {
    const nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setRecoveryState({
        state: setWaitState({
          state: runtimeState,
          kind: "blocked_retry",
          prRole,
          stage,
          headSha,
          reason: runResult.execution.reason,
          until: runtimeState.retry?.at ?? null,
          updatedAt: now,
        }),
        recovery: null,
      }),
    });
    updateRuntimeStatusForWait({
      rootDir,
      workItemId,
      wait: nextState.wait,
      prPath,
      now,
      lifecycle: "blocked",
      verificationStatus: "pending",
      extraNotes: [
        `artifact_dir=${runResult.artifactDir}`,
        ...(runtimeState.retry?.at ? [`retry_at=${runtimeState.retry.at}`] : []),
      ],
    });
    return {
      state: nextState,
      wait: nextState.wait,
      transitioned: false,
    };
  }

  const recovery =
    worktree && runtimeState.workspace?.path
      ? buildRecoverySnapshot({
          state: runtimeState,
          stage,
          kind: "partial_stage_failure",
          reason: runResult.execution?.reason ?? "stage execution could not continue",
          prRole,
          artifactDir: runResult.artifactDir,
          worktreePath: runtimeState.workspace.path,
          worktree,
          now,
        })
      : null;

  const nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setRecoveryState({
      state: setWaitState({
        state: runtimeState,
        kind: "human_escalation",
        prRole,
        stage,
        headSha,
        reason: runResult.execution?.reason ?? "stage execution could not continue",
        updatedAt: now,
      }),
      recovery,
    }),
  });
  updateRuntimeStatusForWait({
    rootDir,
    workItemId,
    wait: nextState.wait,
    prPath,
    now,
    approvalState: "human_escalation",
    lifecycle: "blocked",
    verificationStatus: "pending",
    extraNotes: [
      `artifact_dir=${runResult.artifactDir}`,
      ...(recovery?.kind ? [`recovery_kind=${recovery.kind}`] : []),
    ],
  });
  return {
    state: nextState,
    wait: nextState.wait,
    transitioned: false,
  };
}

function determineInitialStage(state) {
  const phase = resolveStatePhase(state);
  if ((isPendingFinalizePhase(phase) || isPendingReviewPhase(phase)) && Number.isInteger(state.active_stage)) {
    return state.active_stage;
  }

  if (state.wait?.kind === "ready_for_next_stage" && Number.isInteger(state.wait.stage)) {
    return state.wait.stage;
  }

  if (state.wait?.kind === "blocked_retry" && Number.isInteger(state.wait.stage)) {
    return state.wait.stage;
  }

  if (!state.last_completed_stage || state.last_completed_stage < 1) {
    return 1;
  }

  if (state.last_completed_stage >= 6) {
    return null;
  }

  return state.last_completed_stage + 1;
}

function processWaitState({
  rootDir,
  workItemId,
  state,
  github,
  worktree,
  now,
}) {
  const phase = resolveStatePhase(state);

  if (!state.wait?.kind) {
    return {
      state,
      action: "run-stage",
      nextStage:
        (isPendingFinalizePhase(phase) || isPendingReviewPhase(phase)) && Number.isInteger(state.active_stage)
          ? state.active_stage
          : determineInitialStage(state),
    };
  }

  if (state.wait.kind === "human_escalation") {
    return {
      state,
      action: "stop",
      nextStage: null,
    };
  }

  if (state.wait.kind === "human_review" || state.wait.kind === "human_verification") {
    throw new Error(
      `Legacy wait state '${state.wait.kind}' is no longer supported. Clear the runtime or migrate it to the autonomous merge flow.`,
    );
  }

  if (state.wait.kind === "blocked_retry") {
    if (!isRetryDue(state.retry, now)) {
      return {
        state,
        action: "wait",
        nextStage: null,
      };
    }

    const nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state,
        kind: null,
        updatedAt: now,
      }),
    });

    return {
      state: nextState,
      action: "run-stage",
      nextStage: state.wait.stage ?? state.blocked_stage,
    };
  }

  if (state.wait.kind === "ready_for_next_stage") {
    const nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state,
        kind: null,
        updatedAt: now,
      }),
    });

    return {
      state: nextState,
      action: "run-stage",
      nextStage: state.wait.stage,
    };
  }

  if (state.wait.kind === "ci") {
    const prRole = state.wait.pr_role;
    const activePr = prRole ? state.prs?.[prRole] : null;
    if (!activePr?.url) {
      throw new Error("Active pull request is missing for CI wait.");
    }

    if (prRole === "closeout") {
      const summary = github.getPullRequestSummary({
        prRef: activePr.url,
      });

      if (summary.mergedAt) {
        return finalizeCloseoutReconciliation({
          rootDir,
          workItemId,
          state,
          activePr,
          now,
        });
      }
    }

    const checks = github.getRequiredChecks({
      prRef: activePr.url,
    });

    if (checks.bucket === "fail") {
      throw new Error("PR checks failed.");
    }

    if (checks.bucket === "pending") {
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: state.wait,
        prPath: activePr.url,
        now,
        verificationStatus: bucketToVerification(checks.bucket),
        extraNotes: prRole === "closeout" ? [`closeout_pr=${activePr.url}`] : [],
      });
      return {
        state,
        action: "wait",
        nextStage: null,
      };
    }

    if (prRole === "closeout") {
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: state.wait,
        prPath: activePr.url,
        now,
        approvalState: "dual_approved",
        lifecycle: "ready_for_review",
        verificationStatus: "passed",
        extraNotes: [`closeout_pr=${activePr.url}`, "manual_action=merge_closeout_pr"],
      });
      return {
        state,
        action: "wait",
        nextStage: null,
      };
    }

    if (prRole === "docs") {
      if (state.wait.stage === 2 && state.doc_gate?.status === "awaiting_review") {
        const nextState = saveRuntime({
          rootDir,
          workItemId,
          state: setWaitState({
            state,
            kind: "ready_for_next_stage",
            prRole: "docs",
            stage: 2,
            headSha: activePr.head_sha ?? state.wait.head_sha ?? null,
            updatedAt: now,
          }),
        });
        updateRuntimeStatusForWait({
          rootDir,
          workItemId,
          wait: nextState.wait,
          prPath: activePr.url,
          now,
          verificationStatus: "passed",
        });
        return {
          state: nextState,
          action: "run-stage",
          nextStage: 2,
        };
      }

      if (phase === "merge_pending") {
        const nextState = saveRuntime({
          rootDir,
          workItemId,
          state: setWaitState({
            state,
            kind: null,
            updatedAt: now,
          }),
        });
        return {
          state: nextState,
          action: "run-stage",
          nextStage: state.active_stage ?? state.wait.stage,
        };
      }

      github.mergePullRequest({
        prRef: activePr.url,
        headSha: activePr.head_sha ?? state.wait.head_sha ?? "HEAD",
      });
      worktree.syncBaseBranch();
      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state,
          kind: "ready_for_next_stage",
          stage: 2,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        verificationStatus: "passed",
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: 2,
      };
    }

    if (prRole === "backend" && state.wait.stage === 2) {
      if (activePr.draft) {
        github.markReady({
          prRef: activePr.url,
        });
      }
      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: setPullRequestRef({
            state,
            role: "backend",
            number: activePr.number,
            url: activePr.url,
            draft: false,
            branch: activePr.branch,
            headSha: activePr.head_sha,
            updatedAt: now,
          }),
          kind: "ready_for_next_stage",
          prRole: "backend",
          stage: 3,
          headSha: activePr.head_sha,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        approvalState: resolvePublicStageApprovalState(2),
        lifecycle: "ready_for_review",
        verificationStatus: "passed",
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: 3,
      };
    }

    if (prRole === "frontend" && state.wait.stage === 4) {
      const designAuthorityConfig = resolveDesignAuthorityConfig({
        rootDir,
        slice: state.slice ?? workItemId,
      });
      if (designAuthorityConfig?.authority_required && state.design_authority?.status !== "prechecked") {
        const nextState = saveRuntime({
          rootDir,
          workItemId,
          state: setWaitState({
            state: setDesignAuthorityState({
              state,
              status: "pending_precheck",
              uiRisk: designAuthorityConfig.ui_risk,
              anchorScreens: designAuthorityConfig.anchor_screens,
              requiredScreens: designAuthorityConfig.required_screens,
              authorityRequired: true,
              updatedAt: now,
            }),
            kind: null,
            updatedAt: now,
          }),
        });
        return {
          state: nextState,
          action: "run-stage",
          nextStage: 4,
        };
      }

      if (activePr.draft) {
        github.markReady({
          prRef: activePr.url,
        });
      }
      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: setPullRequestRef({
            state,
            role: "frontend",
            number: activePr.number,
            url: activePr.url,
            draft: false,
            branch: activePr.branch,
            headSha: activePr.head_sha,
            updatedAt: now,
          }),
          kind: "ready_for_next_stage",
          prRole: "frontend",
          stage: 5,
          headSha: activePr.head_sha,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        approvalState: resolvePublicStageApprovalState(4),
        lifecycle: "ready_for_review",
        verificationStatus: "passed",
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: 5,
      };
    }

    if (prRole === "frontend" && state.wait.stage === 5) {
      const designAuthorityConfig = resolveDesignAuthorityConfig({
        rootDir,
        slice: state.slice ?? workItemId,
      });
      const authorityStatus = state.design_authority?.status ?? null;

      if (designAuthorityConfig?.authority_required) {
        if (authorityStatus === "final_authority_pending") {
          const nextState = saveRuntime({
            rootDir,
            workItemId,
            state: setWaitState({
              state: setPullRequestRef({
                state,
                role: "frontend",
                number: activePr.number,
                url: activePr.url,
                draft: false,
                branch: activePr.branch,
                headSha: activePr.head_sha,
                updatedAt: now,
              }),
              kind: "ready_for_next_stage",
              prRole: "frontend",
              stage: 5,
              headSha: activePr.head_sha,
              updatedAt: now,
            }),
          });
          updateRuntimeStatusForWait({
            rootDir,
            workItemId,
            wait: nextState.wait,
            prPath: activePr.url,
            now,
            approvalState: "codex_approved",
            lifecycle: "ready_for_review",
            verificationStatus: "passed",
            extraNotes: ["authority_final_gate=pending"],
          });
          return {
            state: nextState,
            action: "run-stage",
            nextStage: 5,
          };
        }

        if (authorityStatus !== "reviewed") {
          throw new Error(
            `Authority-required Stage 5 cannot advance with design_authority.status=${authorityStatus ?? "missing"}.`,
          );
        }
      }

      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: setPullRequestRef({
            state,
            role: "frontend",
            number: activePr.number,
            url: activePr.url,
            draft: false,
            branch: activePr.branch,
            headSha: activePr.head_sha,
            updatedAt: now,
          }),
          kind: "ready_for_next_stage",
          prRole: "frontend",
          stage: 6,
          headSha: activePr.head_sha,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        approvalState:
          designAuthorityConfig?.authority_required && state.design_authority?.status === "reviewed"
            ? "claude_approved"
            : "codex_approved",
        lifecycle: "ready_for_review",
        verificationStatus: "passed",
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: 6,
      };
    }

    if (prRole === "frontend" && state.wait.stage === 6) {
      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state,
          kind: null,
          updatedAt: now,
        }),
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: 6,
      };
    }

    if (phase === "merge_pending") {
      const nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state,
          kind: null,
          updatedAt: now,
        }),
      });
      return {
        state: nextState,
        action: "run-stage",
        nextStage: state.active_stage ?? state.wait.stage,
      };
    }

    const nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state,
        kind: "ready_for_next_stage",
        prRole,
        stage: state.wait.stage,
        headSha: activePr.head_sha,
        updatedAt: now,
      }),
    });
    return {
      state: nextState,
      action: "run-stage",
      nextStage: nextState.wait.stage,
    };
  }

  return {
    state,
    action: "wait",
    nextStage: null,
  };
}

function assertStageProviderReady({
  auth,
  rootDir,
  stage,
  subphase = null,
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  opencodeBin,
  environment,
}) {
  const provider =
    typeof auth?.resolveStageProvider === "function"
      ? auth.resolveStageProvider(stage, subphase)
      : resolveStageProvider({
          rootDir,
          stage,
          subphase,
          claudeProvider,
          claudeBin,
          claudeModel,
          claudeEffort,
          opencodeBin,
          environment,
        }).provider;

  if (typeof auth?.assertStageProviderReady === "function") {
    auth.assertStageProviderReady({
      stage,
      provider,
    });
    return;
  }

  if (provider === "opencode") {
    auth?.assertOpencodeAuth?.();
    return;
  }

  auth?.assertClaudeAuth?.();
}

function upsertPullRequest({
  rootDir,
  workItemId,
  state,
  role,
  pr,
  branch,
  headSha,
  now,
}) {
  return saveRuntime({
    rootDir,
    workItemId,
    state: setPullRequestRef({
      state,
      role,
      number: pr.number,
      url: pr.url,
      draft: pr.draft,
      branch,
      headSha,
      updatedAt: now,
    }),
  });
}

function getActivePullRequest(state, role) {
  return state.prs?.[role] ?? null;
}

function buildStageRecovery({
  state,
  stage,
  prRole,
  reason,
  now,
  worktree,
}) {
  return buildRecoverySnapshot({
    state,
    stage,
    kind: "partial_stage_failure",
    reason,
    prRole,
    artifactDir: state.execution?.artifact_dir ?? state.last_artifact_dir,
    worktreePath: state.workspace?.path,
    worktree,
    now,
  });
}

function blockWithRecovery({
  rootDir,
  workItemId,
  slice,
  state,
  stage,
  prRole,
  reason,
  now,
  worktree,
}) {
  const recovery = buildStageRecovery({
    state,
    stage,
    prRole,
    reason,
    now,
    worktree,
  });

  const blocked = applyBlocker({
    rootDir,
    workItemId,
    slice,
    state: setExecutionState({
      state,
      activeStage: stage,
      phase: "escalated",
      nextAction: "noop",
      artifactDir: state.execution?.artifact_dir ?? state.last_artifact_dir,
      execution: state.execution,
    }),
    reason,
    recovery,
    prPath: state.prs?.[prRole]?.url ?? null,
    now,
  });

  return {
    state: blocked.runtime,
    wait: blocked.wait,
    transitioned: false,
  };
}

function clearExecutionForSubphase({
  state,
  stage,
  artifactDir,
}) {
  return {
    ...state,
    active_stage: stage,
    current_stage: stage,
    blocked_stage: null,
    retry: null,
    last_artifact_dir: artifactDir ?? state.last_artifact_dir,
    phase: null,
    next_action: "noop",
    execution: null,
    recovery: null,
  };
}

function finalizeCodeStage({
  rootDir,
  workItemId,
  slice,
  state,
  stage,
  stageRunner,
  prRole,
  branchName,
  worktree,
  github,
  checklistContract = null,
  reviewEntry = null,
  now,
}) {
  let nextState = state;
  const stageResult = loadExecutionStageResult(nextState, {
    strictExtendedContract: stage !== 1 && isChecklistContractActive(checklistContract),
  });
  const artifactDir = nextState.execution?.artifact_dir ?? nextState.last_artifact_dir;
  const verifyCommands = nextState.execution?.verify_commands ?? [];
  const stage1OutputIssues =
    stage === 1
      ? validateStage1Outputs({
          worktreePath: nextState.workspace.path,
          slice,
        })
      : [];
  const checklistIssues = validateCodeStageChecklistContract({
    checklistContract,
    stage,
    stageResult,
    reviewEntry,
  });

  if (stage1OutputIssues.length > 0 || checklistIssues.length > 0) {
    return blockWithRecovery({
      rootDir,
      workItemId,
      slice,
      state: nextState,
      stage,
      prRole,
      reason: summarizeChecklistIssues([...stage1OutputIssues, ...checklistIssues]),
      now,
      worktree,
    });
  }

  if ([2, 4].includes(stage)) {
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setLastRebuttal({
        state: nextState,
        role: stage === 2 ? "backend" : "frontend",
        sourceReviewStage: reviewEntry?.source_review_stage ?? null,
        contestedFixIds: stageResult.contested_fix_ids ?? [],
        rebuttals: stageResult.rebuttals ?? [],
        updatedAt: now,
      }),
    });
  }

  if (
    shouldReturnToReviewWithRebuttal({
      stage,
      reviewEntry,
      stageResult,
    })
  ) {
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state: markStageCompleted({
          state: nextState,
          stage,
          artifactDir,
        }),
        kind: "ready_for_next_stage",
        prRole,
        stage: resolveNextReviewStageForCodeStage(stage, nextState),
        headSha: nextState.prs?.[prRole]?.head_sha ?? null,
        updatedAt: now,
      }),
    });
    updateRuntimeStatusForWait({
      rootDir,
      workItemId,
      wait: nextState.wait,
      prPath: nextState.prs?.[prRole]?.url ?? null,
      now,
      approvalState: resolvePublicStageApprovalState(stage),
      lifecycle: "ready_for_review",
      verificationStatus: "pending",
      extraNotes: ["rebuttal_handoff=true"],
    });
    return {
      state: nextState,
      wait: nextState.wait,
      transitioned: true,
    };
  }

  if (["stage_result_ready", "verify_pending"].includes(resolveStatePhase(nextState))) {
    if ([2, 4].includes(stage)) {
      const shouldRunEvaluation =
        stage !== 4 ||
        !resolveDesignAuthorityConfig({
          rootDir,
          slice,
        })?.authority_required ||
        nextState.execution?.subphase === "authority_precheck";
      if (shouldRunEvaluation) {
        const evaluation = runAutonomousEvaluationLoop({
          rootDir,
          workItemId,
          slice,
          stage,
          subphase: nextState.execution?.subphase ?? "implementation",
          state: nextState,
          stageRunner,
          worktree,
          now,
        });
        if (evaluation.wait?.kind === "human_escalation" || evaluation.merged || evaluation.transitioned) {
          return evaluation;
        }
        nextState = evaluation.state;
      }
    }

    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "verify_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: nextState.execution,
      }),
    });

    const verify = runVerifyCommands({
      worktreePath: nextState.workspace.path,
      commands: verifyCommands,
      artifactDir,
    });
    if (verify.bucket === "fail") {
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice,
        state: saveRuntime({
          rootDir,
          workItemId,
          state: setExecutionState({
            state: nextState,
            activeStage: stage,
            phase: "verify_pending",
            nextAction: "noop",
            artifactDir,
            execution: {
              ...nextState.execution,
              verify_bucket: "fail",
            },
          }),
        }),
        stage,
        prRole,
        reason: "Supervisor verify commands failed.",
        now,
        worktree,
      });
    }

    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "commit_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: {
          ...nextState.execution,
          verify_bucket: "pass",
        },
      }),
    });
  }

  if (resolveStatePhase(nextState) === "commit_pending") {
    applyCodeStageBookkeeping({
      worktreePath: nextState.workspace.path,
      slice,
      stage,
    });
    const currentHeadSha = worktree.getHeadSha();

    try {
      worktree.assertClean();
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "push_pending",
          nextAction: "finalize_stage",
          artifactDir,
          execution: {
            ...nextState.execution,
            commit_sha: nextState.execution?.commit_sha ?? currentHeadSha,
          },
        }),
      });
    } catch {
      commitWorktreeChanges({
        worktreePath: nextState.workspace.path,
        subject: stageResult.commit.subject,
        body: stageResult.commit.body_markdown,
      });
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "push_pending",
          nextAction: "finalize_stage",
          artifactDir,
          execution: {
            ...nextState.execution,
            commit_sha: worktree.getHeadSha(),
          },
        }),
      });
    }
  }

  if (resolveStatePhase(nextState) === "push_pending") {
    worktree.pushBranch({
      branch: branchName,
    });
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "pr_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: nextState.execution,
      }),
    });
  }

  if (resolveStatePhase(nextState) === "pr_pending") {
    const existingPr = getActivePullRequest(nextState, prRole);
    const headSha = nextState.execution?.commit_sha ?? worktree.getHeadSha();
    let pr;
    if (existingPr?.url) {
      github.editPullRequest?.({
        prRef: existingPr.url,
        title: stageResult.pr.title,
        body: stageResult.pr.body_markdown,
        workItemId,
      });
      pr = {
        number: existingPr.number,
        url: existingPr.url,
        draft: existingPr.draft ?? (prRole !== "docs"),
      };
    } else {
      pr = github.createPullRequest({
        base: "master",
        head: branchName,
        title: stageResult.pr.title,
        body: stageResult.pr.body_markdown,
        draft: prRole !== "docs",
        workItemId,
      });
    }

    nextState = upsertPullRequest({
      rootDir,
      workItemId,
      state: nextState,
      role: prRole,
      pr,
      branch: branchName,
      headSha,
      now,
    });

    const checks = github.getRequiredChecks({
      prRef: pr.url,
    });

    if (checks.bucket === "fail") {
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice,
        state: nextState,
        stage,
        prRole,
        reason: "PR checks failed.",
        now,
        worktree,
      });
    }

    if (prRole === "docs") {
      if (checks.bucket === "pending") {
        nextState = saveRuntime({
          rootDir,
          workItemId,
          state: setWaitState({
            state: setExecutionState({
              state: nextState,
              activeStage: stage,
              phase: "wait",
              nextAction: "poll_ci",
              artifactDir,
              execution: nextState.execution,
            }),
            kind: "ci",
            prRole: "docs",
            stage,
            headSha,
            updatedAt: now,
          }),
        });
        updateRuntimeStatusForWait({
          rootDir,
          workItemId,
          wait: nextState.wait,
          prPath: pr.url,
          now,
          verificationStatus: "pending",
        });
        return {
          state: nextState,
          wait: nextState.wait,
          transitioned: false,
        };
      }

      github.mergePullRequest({
        prRef: pr.url,
        headSha,
      });
      worktree.syncBaseBranch();
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: markStageCompleted({
            state: nextState,
            stage,
            artifactDir,
          }),
          kind: "ready_for_next_stage",
          stage: 2,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: pr.url,
        now,
        verificationStatus: "passed",
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: true,
      };
    }

    if (checks.bucket === "pending") {
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: markStageCompleted({
            state: nextState,
            stage,
            artifactDir,
          }),
          kind: "ci",
          prRole,
          stage,
          headSha,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: pr.url,
        now,
        verificationStatus: "pending",
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: false,
      };
    }

    github.markReady({
      prRef: pr.url,
    });
    nextState = upsertPullRequest({
      rootDir,
      workItemId,
      state: nextState,
      role: prRole,
      pr: {
        ...pr,
        draft: false,
      },
      branch: branchName,
      headSha,
      now,
    });
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state: markStageCompleted({
          state: nextState,
          stage,
          artifactDir,
        }),
        kind: "ready_for_next_stage",
        prRole,
        stage: resolveNextReviewStageForCodeStage(stage, nextState),
        headSha,
        updatedAt: now,
      }),
    });
    updateRuntimeStatusForWait({
      rootDir,
      workItemId,
      wait: nextState.wait,
      prPath: pr.url,
      now,
      approvalState: resolvePublicStageApprovalState(stage),
      lifecycle: "ready_for_review",
      verificationStatus: "passed",
    });
    return {
      state: nextState,
      wait: nextState.wait,
      transitioned: true,
    };
  }

  return {
    state: nextState,
    wait: nextState.wait,
    transitioned: false,
  };
}

function handleImplementationCodeStage({
  rootDir,
  workItemId,
  slice,
  state,
  stage,
  stageRunner,
  worktree,
  github,
  subphase = "implementation",
  now,
}) {
  const branchRole = resolveBranchRole(stage);
  const branchName = resolveBranchName({ slice, stage });
  const prRole = resolvePrRole(stage);
  worktree.checkoutBranch({
    branch: branchName,
    startPoint: "origin/master",
  });

  let nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWorkspaceBinding({
      state,
      path: state.workspace?.path,
      branchRole,
      updatedAt: now,
    }),
  });
  const { workItem } = readTrackedWorkItem({
    rootDir,
    workItemId,
  });
  const entryValidation = validateProductCodeStageEntry({
    rootDir,
    worktreePath: nextState.workspace?.path,
    workItem,
    slice,
    stage,
  });
  if (entryValidation.issues.length > 0) {
    return blockWithRecovery({
      rootDir,
      workItemId,
      slice,
      state: nextState,
      stage,
      prRole,
      reason: summarizeChecklistIssues(entryValidation.issues),
      now,
      worktree,
    });
  }
  const reviewEntry =
    prRole === "backend"
      ? nextState.last_review?.backend ?? null
      : nextState.last_review?.frontend ?? null;
  const existingPr = getActivePullRequest(nextState, prRole);
  const phase = resolveStatePhase(nextState);

  if (!isPendingFinalizePhase(phase) || nextState.active_stage !== stage) {
    const runResult = stageRunner({
      rootDir,
      workItemId,
      slice,
      stage,
      subphase,
      executionDir: state.workspace?.path,
    });
    const deferredOutcome = handleDeferredStageExecution({
      rootDir,
      workItemId,
      slice,
      stage,
      prRole,
      prPath: existingPr?.url ?? null,
      headSha: existingPr?.head_sha ?? null,
      runResult,
      worktree,
      now,
    });
    if (deferredOutcome) {
      return deferredOutcome;
    }

    nextState = resolveRunResultRuntimeState({
      rootDir,
      workItemId,
      slice,
      runResult,
    });

    if (!isPendingFinalizePhase(resolveStatePhase(nextState)) && runResult.stageResult) {
      const stageResultPath = resolve(runResult.artifactDir, "stage-result.json");
      mkdirSync(runResult.artifactDir, { recursive: true });
      if (!existsSync(stageResultPath)) {
        writeFileSync(stageResultPath, `${JSON.stringify(runResult.stageResult, null, 2)}\n`);
      }
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "stage_result_ready",
          nextAction: "finalize_stage",
          artifactDir: runResult.artifactDir,
          execution: {
            provider: runResult.execution?.provider ?? null,
            session_role:
              runResult.dispatch?.sessionBinding?.role ?? resolveStageSessionRole(stage, subphase),
            session_id: runResult.execution?.sessionId ?? null,
            artifact_dir: runResult.artifactDir,
            stage_result_path: stageResultPath,
            started_at: now,
            finished_at: now,
            verify_commands: [],
            verify_bucket: null,
            commit_sha: null,
            pr_role: prRole,
            subphase: runResult.dispatch?.subphase ?? subphase,
          },
          clearRecovery: true,
        }),
      });
    }
  }

  const refreshedChecklistContract = resolveChecklistContractValidation({
    rootDir,
    worktreePath: nextState.workspace?.path,
    slice,
  }).checklistContract;

  return finalizeCodeStage({
    rootDir,
    workItemId,
    slice,
    state: nextState,
    stage,
    stageRunner,
    prRole,
    branchName,
    worktree,
    github,
    checklistContract: refreshedChecklistContract,
    reviewEntry,
    now,
  });
}

function handleAuthorityPrecheckStage({
  rootDir,
  workItemId,
  slice,
  state,
  stageRunner,
  worktree,
  github,
  now,
}) {
  const stage = 4;
  const branchRole = "frontend";
  const branchName = resolveBranchName({ slice, stage });
  const prRole = "frontend";
  worktree.checkoutBranch({
    branch: branchName,
    startPoint: "origin/master",
  });

  let nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWorkspaceBinding({
      state,
      path: state.workspace?.path,
      branchRole,
      updatedAt: now,
    }),
  });
  const activePr = getActivePullRequest(nextState, prRole);
  if (!activePr?.url) {
    return blockWithRecovery({
      rootDir,
      workItemId,
      slice,
      state: nextState,
      stage,
      prRole,
      reason: "Authority precheck requires an existing frontend PR.",
      now,
      worktree,
    });
  }

  const authorityConfig = resolveDesignAuthorityConfig({
    rootDir,
    slice,
  });
  const {
    checklistContract,
    issues: checklistContractIssues,
  } = resolveChecklistContractValidation({
    rootDir,
    worktreePath: nextState.workspace?.path,
    slice,
  });
  if (checklistContractIssues.length > 0 && isChecklistContractActive(checklistContract)) {
    return blockWithRecovery({
      rootDir,
      workItemId,
      slice,
      state: nextState,
      stage,
      prRole,
      reason: summarizeChecklistIssues(checklistContractIssues),
      now,
      worktree,
    });
  }

  const reviewEntry = nextState.last_review?.frontend ?? null;
  const phase = resolveStatePhase(nextState);
  if (
    !isPendingFinalizePhase(phase) ||
    nextState.active_stage !== stage ||
    nextState.execution?.subphase !== "authority_precheck"
  ) {
    const runResult = stageRunner({
      rootDir,
      workItemId,
      slice,
      stage,
      subphase: "authority_precheck",
      executionDir: state.workspace?.path,
    });
    const deferredOutcome = handleDeferredStageExecution({
      rootDir,
      workItemId,
      slice,
      stage,
      prRole,
      prPath: activePr.url,
      headSha: activePr.head_sha ?? null,
      runResult,
      worktree,
      now,
    });
    if (deferredOutcome) {
      return deferredOutcome;
    }

    nextState = resolveRunResultRuntimeState({
      rootDir,
      workItemId,
      slice,
      runResult,
    });

    if (!isPendingFinalizePhase(resolveStatePhase(nextState)) && runResult.stageResult) {
      const stageResultPath = resolve(runResult.artifactDir, "stage-result.json");
      mkdirSync(runResult.artifactDir, { recursive: true });
      if (!existsSync(stageResultPath)) {
        writeFileSync(stageResultPath, `${JSON.stringify(runResult.stageResult, null, 2)}\n`);
      }
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "stage_result_ready",
          nextAction: "finalize_stage",
          artifactDir: runResult.artifactDir,
          execution: {
            provider: runResult.execution?.provider ?? null,
            session_role: runResult.dispatch?.sessionBinding?.role ?? "codex_primary",
            session_id: runResult.execution?.sessionId ?? null,
            artifact_dir: runResult.artifactDir,
            stage_result_path: stageResultPath,
            started_at: now,
            finished_at: now,
            verify_commands: [],
            verify_bucket: null,
            commit_sha: null,
            pr_role: prRole,
            subphase: "authority_precheck",
          },
          clearRecovery: true,
        }),
      });
    }
  }

  const stageResult = loadExecutionStageResult(nextState, {
    strictExtendedContract: isChecklistContractActive(checklistContract),
    subphase: "authority_precheck",
  });
  const artifactDir = nextState.execution?.artifact_dir ?? nextState.last_artifact_dir;
  const checklistIssues = validateCodeStageChecklistContract({
    checklistContract,
    stage,
    stageResult,
    reviewEntry,
  });
  const authorityIssues = validateAuthorityPrecheckStageResult({
    stageResult,
    authorityConfig,
  });
  if (checklistIssues.length > 0 || authorityIssues.length > 0) {
    return blockWithRecovery({
      rootDir,
      workItemId,
      slice,
      state: nextState,
      stage,
      prRole,
      reason: summarizeChecklistIssues([...checklistIssues, ...authorityIssues]),
      now,
      worktree,
    });
  }

  nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setLastRebuttal({
      state: nextState,
      role: "frontend",
      sourceReviewStage: reviewEntry?.source_review_stage ?? null,
      contestedFixIds: stageResult.contested_fix_ids ?? [],
      rebuttals: stageResult.rebuttals ?? [],
      updatedAt: now,
    }),
  });

  const evaluation = runAutonomousEvaluationLoop({
    rootDir,
    workItemId,
    slice,
    stage,
    subphase: "authority_precheck",
    state: nextState,
    stageRunner,
    worktree,
    now,
  });
  if (evaluation.wait?.kind === "human_escalation" || evaluation.merged || evaluation.transitioned) {
    return evaluation;
  }
  nextState = evaluation.state;

  if (["stage_result_ready", "verify_pending"].includes(resolveStatePhase(nextState))) {
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "verify_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: {
          ...nextState.execution,
          subphase: "authority_precheck",
        },
      }),
    });

    const verify = runVerifyCommands({
      worktreePath: nextState.workspace.path,
      commands: [],
      artifactDir,
    });
    if (verify.bucket === "fail") {
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice,
        state: nextState,
        stage,
        prRole,
        reason: "Authority precheck verify commands failed.",
        now,
        worktree,
      });
    }

    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "commit_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: {
          ...nextState.execution,
          verify_bucket: "pass",
          subphase: "authority_precheck",
        },
      }),
    });
  }

  if (resolveStatePhase(nextState) === "commit_pending") {
    const currentHeadSha = worktree.getHeadSha();

    try {
      worktree.assertClean();
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "push_pending",
          nextAction: "finalize_stage",
          artifactDir,
          execution: {
            ...nextState.execution,
            commit_sha: nextState.execution?.commit_sha ?? currentHeadSha,
            subphase: "authority_precheck",
          },
        }),
      });
    } catch {
      commitWorktreeChanges({
        worktreePath: nextState.workspace.path,
        subject: stageResult.commit.subject,
        body: stageResult.commit.body_markdown,
      });
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "push_pending",
          nextAction: "finalize_stage",
          artifactDir,
          execution: {
            ...nextState.execution,
            commit_sha: worktree.getHeadSha(),
            subphase: "authority_precheck",
          },
        }),
      });
    }
  }

  if (resolveStatePhase(nextState) === "push_pending") {
    worktree.pushBranch({
      branch: branchName,
    });
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "pr_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: {
          ...nextState.execution,
          subphase: "authority_precheck",
        },
      }),
    });
  }

  if (resolveStatePhase(nextState) === "pr_pending") {
    github.editPullRequest?.({
      prRef: activePr.url,
      title: stageResult.pr.title,
      body: stageResult.pr.body_markdown,
      workItemId,
    });
    const headSha = nextState.execution?.commit_sha ?? worktree.getHeadSha();
    nextState = upsertPullRequest({
      rootDir,
      workItemId,
      state: nextState,
      role: prRole,
      pr: activePr,
      branch: branchName,
      headSha,
      now,
    });
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setDesignAuthorityState({
        state: nextState,
        status:
          stageResult.authority_verdict === "hold" || (stageResult.blocker_count ?? 0) > 0
            ? "needs_revision"
            : "prechecked",
        uiRisk: authorityConfig?.ui_risk ?? null,
        anchorScreens: authorityConfig?.anchor_screens ?? [],
        requiredScreens: authorityConfig?.required_screens ?? [],
        authorityRequired: authorityConfig?.authority_required ?? false,
        authorityReportPaths: stageResult.authority_report_paths ?? [],
        evidenceArtifactRefs: stageResult.evidence_artifact_refs ?? [],
        authorityVerdict: stageResult.authority_verdict ?? null,
        blockerCount: stageResult.blocker_count ?? 0,
        majorCount: stageResult.major_count ?? 0,
        minorCount: stageResult.minor_count ?? 0,
        reviewedScreenIds: stageResult.reviewed_screen_ids ?? [],
        sourceStage: 4,
        updatedAt: now,
      }),
    });

    if (stageResult.authority_verdict === "hold" || (stageResult.blocker_count ?? 0) > 0) {
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: markStageCompleted({
            state: nextState,
            stage,
            artifactDir,
          }),
          kind: "ready_for_next_stage",
          prRole,
          stage: 4,
          headSha,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        approvalState: "needs_revision",
        lifecycle: "in_progress",
        verificationStatus: "pending",
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: true,
      };
    }

    const checks = github.getRequiredChecks({
      prRef: activePr.url,
    });
    if (checks.bucket === "fail") {
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice,
        state: nextState,
        stage,
        prRole,
        reason: "Authority precheck PR checks failed.",
        now,
        worktree,
      });
    }

    if (checks.bucket === "pending") {
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: markStageCompleted({
            state: nextState,
            stage,
            artifactDir,
          }),
          kind: "ci",
          prRole,
          stage: 4,
          headSha,
          updatedAt: now,
        }),
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: false,
      };
    }

    if (activePr.draft) {
      github.markReady({
        prRef: activePr.url,
      });
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setPullRequestRef({
          state: nextState,
          role: "frontend",
          number: activePr.number,
          url: activePr.url,
          draft: false,
          branch: branchName,
          headSha,
          updatedAt: now,
        }),
      });
    }

    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state: markStageCompleted({
          state: nextState,
          stage,
          artifactDir,
        }),
        kind: "ready_for_next_stage",
        prRole,
        stage: 5,
        headSha,
        updatedAt: now,
      }),
    });
    updateRuntimeStatusForWait({
      rootDir,
      workItemId,
      wait: nextState.wait,
      prPath: activePr.url,
      now,
      approvalState: resolvePublicStageApprovalState(4),
      lifecycle: "ready_for_review",
      verificationStatus: "passed",
      extraNotes: ["design_authority=prechecked"],
    });
    return {
      state: nextState,
      wait: nextState.wait,
      transitioned: true,
    };
  }

  return {
    state: nextState,
    wait: nextState.wait,
    transitioned: false,
  };
}

function handleDocGateRepairStage({
  rootDir,
  workItemId,
  slice,
  state,
  stageRunner,
  worktree,
  github,
  now,
}) {
  const stage = 2;
  const branchRole = "docs";
  const branchName = resolveDocGateRepairBranch(slice);
  const prRole = "docs";
  worktree.checkoutBranch({
    branch: branchName,
    startPoint: "origin/master",
  });

  let nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWorkspaceBinding({
      state,
      path: state.workspace?.path,
      branchRole,
      updatedAt: now,
    }),
  });
  const reviewEntry = nextState.doc_gate?.last_review ?? null;
  const existingPr = getActivePullRequest(nextState, prRole);
  const phase = resolveStatePhase(nextState);

  if (
    !isPendingFinalizePhase(phase) ||
    nextState.active_stage !== stage ||
    nextState.execution?.subphase !== "doc_gate_repair"
  ) {
    const runResult = stageRunner({
      rootDir,
      workItemId,
      slice,
      stage,
      subphase: "doc_gate_repair",
      executionDir: state.workspace?.path,
    });
    const deferredOutcome = handleDeferredStageExecution({
      rootDir,
      workItemId,
      slice,
      stage,
      prRole,
      prPath: existingPr?.url ?? null,
      headSha: existingPr?.head_sha ?? null,
      runResult,
      worktree,
      now,
    });
    if (deferredOutcome) {
      return deferredOutcome;
    }

    nextState = resolveRunResultRuntimeState({
      rootDir,
      workItemId,
      slice,
      runResult,
    });

    if (!isPendingFinalizePhase(resolveStatePhase(nextState)) && runResult.stageResult) {
      const stageResultPath = resolve(runResult.artifactDir, "stage-result.json");
      mkdirSync(runResult.artifactDir, { recursive: true });
      if (!existsSync(stageResultPath)) {
        writeFileSync(stageResultPath, `${JSON.stringify(runResult.stageResult, null, 2)}\n`);
      }
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "stage_result_ready",
          nextAction: "finalize_stage",
          artifactDir: runResult.artifactDir,
          execution: {
            provider: runResult.execution?.provider ?? null,
            session_role: runResult.dispatch?.sessionBinding?.role ?? "codex_primary",
            session_id: runResult.execution?.sessionId ?? null,
            artifact_dir: runResult.artifactDir,
            stage_result_path: stageResultPath,
            started_at: now,
            finished_at: now,
            verify_commands: [],
            verify_bucket: null,
            commit_sha: null,
            pr_role: prRole,
            subphase: "doc_gate_repair",
          },
          clearRecovery: true,
        }),
      });
    }
  }

  const stageResult = loadExecutionStageResult(nextState, {
    strictExtendedContract: false,
    subphase: "doc_gate_repair",
  });
  const artifactDir = nextState.execution?.artifact_dir ?? nextState.last_artifact_dir;
  const repairIssues = validateDocGateRepairStageResult({
    slice,
    stageResult,
    reviewEntry,
    docGateState: nextState.doc_gate,
  });
  if (repairIssues.length > 0) {
    return blockWithRecovery({
      rootDir,
      workItemId,
      slice,
      state: nextState,
      stage,
      prRole,
      reason: summarizeChecklistIssues(repairIssues),
      now,
      worktree,
    });
  }

  nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setDocGateRebuttal({
      state: nextState,
      sourceReviewStage: reviewEntry?.source_review_stage ?? 2,
      contestedDocFixIds: stageResult.contested_doc_fix_ids ?? [],
      rebuttals: stageResult.rebuttals ?? [],
      updatedAt: now,
    }),
  });

  const currentRequiredDocFixIds = normalizeStringArray(reviewEntry?.required_doc_fix_ids);
  const contestedDocFixIds = normalizeStringArray(stageResult.contested_doc_fix_ids);
  const allRequiredContested =
    currentRequiredDocFixIds.length > 0 &&
    currentRequiredDocFixIds.every((id) => contestedDocFixIds.includes(id));

  if (allRequiredContested && existingPr?.url) {
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setDocGateState({
        state: clearExecutionForSubphase({
          state: nextState,
          stage,
          artifactDir,
        }),
        status: "awaiting_review",
        repairBranch: branchName,
        repairPr: existingPr,
        updatedAt: now,
      }),
    });
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state: nextState,
        kind: "ready_for_next_stage",
        prRole,
        stage,
        headSha: existingPr.head_sha ?? null,
        updatedAt: now,
      }),
    });
    return {
      state: nextState,
      wait: nextState.wait,
      transitioned: true,
    };
  }

  if (["stage_result_ready", "verify_pending"].includes(resolveStatePhase(nextState))) {
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "verify_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: {
          ...nextState.execution,
          subphase: "doc_gate_repair",
        },
      }),
    });

    const verify = runVerifyCommands({
      worktreePath: nextState.workspace.path,
      commands: [],
      artifactDir,
    });
    if (verify.bucket === "fail") {
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice,
        state: nextState,
        stage,
        prRole,
        reason: "Doc gate repair verify commands failed.",
        now,
        worktree,
      });
    }

    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "commit_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: {
          ...nextState.execution,
          verify_bucket: "pass",
          subphase: "doc_gate_repair",
        },
      }),
    });
  }

  if (resolveStatePhase(nextState) === "commit_pending") {
    const currentHeadSha = worktree.getHeadSha();

    try {
      worktree.assertClean();
      if (!existingPr?.url) {
        return blockWithRecovery({
          rootDir,
          workItemId,
          slice,
          state: nextState,
          stage,
          prRole,
          reason: "Doc gate repair produced no docs changes and no existing docs PR is available for rebuttal review.",
          now,
          worktree,
        });
      }
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "push_pending",
          nextAction: "finalize_stage",
          artifactDir,
          execution: {
            ...nextState.execution,
            commit_sha: nextState.execution?.commit_sha ?? currentHeadSha,
            subphase: "doc_gate_repair",
          },
        }),
      });
    } catch {
      const actualChangedFiles = worktree.listChangedFiles({
        worktreePath: nextState.workspace.path,
      });
      const unexpectedActualFiles = actualChangedFiles.filter(
        (filePath) => !resolveDocGateAllowedFiles(slice).includes(filePath),
      );
      if (unexpectedActualFiles.length > 0) {
        return blockWithRecovery({
          rootDir,
          workItemId,
          slice,
          state: nextState,
          stage,
          prRole,
          reason: `Doc gate repair may only modify workpack docs: ${unexpectedActualFiles.join(", ")}.`,
          now,
          worktree,
        });
      }

      commitWorktreeChanges({
        worktreePath: nextState.workspace.path,
        subject: stageResult.commit.subject,
        body: stageResult.commit.body_markdown,
      });
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "push_pending",
          nextAction: "finalize_stage",
          artifactDir,
          execution: {
            ...nextState.execution,
            commit_sha: worktree.getHeadSha(),
            subphase: "doc_gate_repair",
          },
        }),
      });
    }
  }

  if (resolveStatePhase(nextState) === "push_pending") {
    worktree.pushBranch({
      branch: branchName,
    });
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setExecutionState({
        state: nextState,
        activeStage: stage,
        phase: "pr_pending",
        nextAction: "finalize_stage",
        artifactDir,
        execution: {
          ...nextState.execution,
          subphase: "doc_gate_repair",
        },
      }),
    });
  }

  if (resolveStatePhase(nextState) === "pr_pending") {
    const refreshedExistingPr = getActivePullRequest(nextState, prRole);
    const headSha = nextState.execution?.commit_sha ?? worktree.getHeadSha();
    let pr;
    if (refreshedExistingPr?.url) {
      github.editPullRequest?.({
        prRef: refreshedExistingPr.url,
        title: stageResult.pr.title,
        body: stageResult.pr.body_markdown,
        workItemId,
      });
      pr = {
        number: refreshedExistingPr.number,
        url: refreshedExistingPr.url,
        draft: false,
      };
    } else {
      pr = github.createPullRequest({
        base: "master",
        head: branchName,
        title: stageResult.pr.title,
        body: stageResult.pr.body_markdown,
        draft: false,
        workItemId,
      });
    }

    nextState = upsertPullRequest({
      rootDir,
      workItemId,
      state: nextState,
      role: prRole,
      pr,
      branch: branchName,
      headSha,
      now,
    });
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setDocGateState({
        state: nextState,
        status: "awaiting_review",
        repairBranch: branchName,
        repairPr: {
          number: pr.number,
          url: pr.url,
          draft: false,
          branch: branchName,
          head_sha: headSha,
        },
        updatedAt: now,
      }),
    });

    const checks = github.getRequiredChecks({
      prRef: pr.url,
    });

    if (checks.bucket === "fail") {
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice,
        state: nextState,
        stage,
        prRole,
        reason: "Doc gate repair PR checks failed.",
        now,
        worktree,
      });
    }

    if (checks.bucket === "pending") {
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: clearExecutionForSubphase({
            state: nextState,
            stage,
            artifactDir,
          }),
          kind: "ci",
          prRole,
          stage,
          headSha,
          updatedAt: now,
        }),
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: false,
      };
    }

    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state: clearExecutionForSubphase({
          state: nextState,
          stage,
          artifactDir,
        }),
        kind: "ready_for_next_stage",
        prRole,
        stage,
        headSha,
        updatedAt: now,
      }),
    });
    return {
      state: nextState,
      wait: nextState.wait,
      transitioned: true,
    };
  }

  return {
    state: nextState,
    wait: nextState.wait,
    transitioned: false,
  };
}

function handleDocGateReviewStage({
  rootDir,
  workItemId,
  slice,
  state,
  stageRunner,
  worktree,
  github,
  now,
}) {
  const stage = 2;
  const branchRole = "docs";
  const prRole = "docs";
  let nextState = state;
  let activePr = getActivePullRequest(nextState, prRole);
  if (!activePr?.url) {
    throw new Error("No active docs repair pull request found.");
  }

  worktree.checkoutBranch({
    branch: activePr.branch ?? resolveDocGateRepairBranch(slice),
    startPoint: "origin/master",
  });

  nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWorkspaceBinding({
      state: nextState,
      path: state.workspace?.path,
      branchRole,
      updatedAt: now,
    }),
  });

  const phase = resolveStatePhase(nextState);
  if (
    !isPendingReviewPhase(phase) ||
    nextState.active_stage !== stage ||
    nextState.execution?.subphase !== "doc_gate_review"
  ) {
    const runResult = stageRunner({
      rootDir,
      workItemId,
      slice,
      stage,
      subphase: "doc_gate_review",
      executionDir: state.workspace?.path,
    });
    const deferredOutcome = handleDeferredStageExecution({
      rootDir,
      workItemId,
      slice,
      stage,
      prRole,
      prPath: activePr.url,
      headSha: activePr.head_sha ?? null,
      runResult,
      worktree,
      now,
    });
    if (deferredOutcome) {
      return deferredOutcome;
    }
    nextState = resolveRunResultRuntimeState({
      rootDir,
      workItemId,
      slice,
      runResult,
    });

    if (!isPendingReviewPhase(resolveStatePhase(nextState)) && runResult.stageResult) {
      const stageResultPath = resolve(runResult.artifactDir, "stage-result.json");
      mkdirSync(runResult.artifactDir, { recursive: true });
      if (!existsSync(stageResultPath)) {
        writeFileSync(stageResultPath, `${JSON.stringify(runResult.stageResult, null, 2)}\n`);
      }
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "review_pending",
          nextAction: "run_review",
          artifactDir: runResult.artifactDir,
          execution: {
            provider: runResult.execution?.provider ?? null,
            session_role: runResult.dispatch?.sessionBinding?.role ?? "claude_primary",
            session_id: runResult.execution?.sessionId ?? null,
            artifact_dir: runResult.artifactDir,
            stage_result_path: stageResultPath,
            started_at: now,
            finished_at: now,
            verify_commands: [],
            verify_bucket: null,
            commit_sha: null,
            pr_role: prRole,
            subphase: "doc_gate_review",
          },
          clearRecovery: true,
        }),
      });
    }
  }

  activePr = getActivePullRequest(nextState, prRole);
  const stageResult = loadExecutionStageResult(nextState, {
    strictExtendedContract: false,
    subphase: "doc_gate_review",
  });
  const artifactDir = nextState.execution?.artifact_dir ?? nextState.last_artifact_dir;
  const reviewIssues = validateDocGateReviewStageResult({
    docGateState: nextState.doc_gate,
    stageResult,
  });
  if (reviewIssues.length > 0) {
    return blockWithRecovery({
      rootDir,
      workItemId,
      slice,
      state: nextState,
      stage,
      prRole,
      reason: summarizeChecklistIssues(reviewIssues),
      now,
      worktree,
    });
  }

  nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setDocGateReview({
      state: nextState,
      decision: stageResult.decision,
      routeBackStage: stageResult.route_back_stage,
      approvedHeadSha: stageResult.approved_head_sha,
      bodyMarkdown: stageResult.body_markdown,
      findings: stageResult.findings ?? [],
      reviewedDocFindingIds: stageResult.reviewed_doc_finding_ids ?? [],
      requiredDocFixIds: stageResult.required_doc_fix_ids ?? [],
      waivedDocFixIds: stageResult.waived_doc_fix_ids ?? [],
      sourceReviewStage: stage,
      pingPongRounds: nextState.doc_gate?.round ?? 0,
      updatedAt: now,
    }),
  });

  github.commentPullRequest({
    prRef: activePr.url,
    body: stageResult.body_markdown,
  });

  if (stageResult.decision === "approve") {
    github.mergePullRequest({
      prRef: activePr.url,
      headSha: activePr.head_sha ?? state.wait?.head_sha ?? "HEAD",
    });
    worktree.syncBaseBranch();
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setDocGateState({
        state: clearExecutionForSubphase({
          state: nextState,
          stage,
          artifactDir,
        }),
        status: "pending_recheck",
        updatedAt: now,
      }),
    });
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setWaitState({
        state: nextState,
        kind: "ready_for_next_stage",
        prRole,
        stage,
        headSha: activePr.head_sha ?? null,
        updatedAt: now,
      }),
    });
    return {
      state: nextState,
      wait: nextState.wait,
      transitioned: true,
    };
  }

  const nextRound = (nextState.doc_gate?.round ?? 0) + 1;
  if (nextRound > 3) {
    return blockWithRecovery({
      rootDir,
      workItemId,
      slice,
      state: nextState,
      stage,
      prRole,
      reason: "Doc gate review ping-pong stalled after 3 rounds. Human intervention required.",
      now,
      worktree,
    });
  }

  nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setDocGateState({
      state: clearExecutionForSubphase({
        state: nextState,
        stage,
        artifactDir,
      }),
      status: "fixable",
      round: nextRound,
      updatedAt: now,
    }),
  });
  nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWaitState({
      state: nextState,
      kind: "ready_for_next_stage",
      prRole,
      stage,
      headSha: activePr.head_sha ?? null,
      updatedAt: now,
    }),
  });
  return {
    state: nextState,
    wait: nextState.wait,
    transitioned: true,
  };
}

function handleCodeStage({
  rootDir,
  workItemId,
  slice,
  state,
  stage,
  stageRunner,
  worktree,
  github,
  now,
}) {
  if (stage === 2) {
    const initialSubphase = resolveStage2Subphase(state);
    if (initialSubphase === "doc_gate_check") {
      const docGateResult = evaluateDocGate({
        rootDir,
        worktreePath: state.workspace?.path,
        slice,
      });
      const docGateArtifact = writeDocGateResult({
        rootDir,
        workItemId,
        result: docGateResult,
        now,
      });
      const sourceMasterSha = worktree.getHeadSha();
      let nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setDocGateState({
          state,
          status:
            docGateResult.outcome === "pass"
              ? "passed"
              : docGateResult.outcome === "fixable"
                ? "fixable"
                : "blocked",
          sourceMasterSha,
          artifactDir: docGateArtifact.artifactDir,
          resultPath: docGateArtifact.resultPath,
          repairBranch: resolveDocGateRepairBranch(slice),
          findings: docGateResult.findings,
          updatedAt: now,
        }),
      });

      if (docGateResult.outcome === "blocked") {
        return blockWithRecovery({
          rootDir,
          workItemId,
          slice,
          state: nextState,
          stage,
          prRole: "docs",
          reason: docGateResult.summary,
          now,
          worktree,
        });
      }

      if (docGateResult.outcome === "fixable") {
        return handleDocGateRepairStage({
          rootDir,
          workItemId,
          slice,
          state: nextState,
          stageRunner,
          worktree,
          github,
          now,
        });
      }

      return handleImplementationCodeStage({
        rootDir,
        workItemId,
        slice,
        state: nextState,
        stage,
        stageRunner,
        worktree,
        github,
        subphase: "implementation",
        now,
      });
    }

    if (initialSubphase === "doc_gate_repair") {
      return handleDocGateRepairStage({
        rootDir,
        workItemId,
        slice,
        state,
        stageRunner,
        worktree,
        github,
        now,
      });
    }

    if (initialSubphase === "doc_gate_review") {
      return handleDocGateReviewStage({
        rootDir,
        workItemId,
        slice,
        state,
        stageRunner,
        worktree,
        github,
        now,
      });
    }
  }

  if (stage === 4) {
    const stage4Subphase = resolveStage4Subphase({
      rootDir,
      slice,
      state,
    });
    if (stage4Subphase === "authority_precheck") {
      return handleAuthorityPrecheckStage({
        rootDir,
        workItemId,
        slice,
        state,
        stageRunner,
        worktree,
        github,
        now,
      });
    }
  }

  return handleImplementationCodeStage({
    rootDir,
    workItemId,
    slice,
    state,
    stage,
    stageRunner,
    worktree,
    github,
    subphase: "implementation",
    now,
  });
}

function handleReviewStage({
  rootDir,
  workItemId,
  state,
  stage,
  subphase = "implementation",
  stageRunner,
  worktree,
  github,
  now,
}) {
  const branchRole = resolveBranchRole(stage);
  const prRole = resolvePrRole(stage);
  const reviewPolicyStage = stage === 3 ? 2 : stage === 6 ? 4 : stage;
  let nextState = state;
  let activePr = getActivePullRequest(nextState, prRole);
  if (!activePr?.url) {
    throw new Error(`No active ${prRole} pull request found.`);
  }
  const autonomousContext = [3, 6].includes(stage)
    ? resolveAutonomousStageContext({
        rootDir,
        workItemId,
        slice: state.slice ?? workItemId,
        stage: reviewPolicyStage,
      })
    : null;

  worktree.checkoutBranch({
    branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
    startPoint: "origin/master",
  });

  nextState = saveRuntime({
    rootDir,
    workItemId,
    state: setWorkspaceBinding({
      state: nextState,
      path: state.workspace?.path,
      branchRole,
      updatedAt: now,
    }),
  });
  const {
    checklistContract,
    issues: checklistContractIssues,
  } = resolveChecklistContractValidation({
    rootDir,
    worktreePath: nextState.workspace?.path,
    slice: state.slice ?? workItemId,
  });
  if (checklistContractIssues.length > 0 && isChecklistContractActive(checklistContract)) {
    return blockWithRecovery({
      rootDir,
      workItemId,
      slice: state.slice ?? workItemId,
      state: nextState,
      stage,
      prRole,
      reason: summarizeChecklistIssues(checklistContractIssues),
      now,
      worktree,
    });
  }
  const designAuthorityConfig = [5, 6].includes(stage)
    ? resolveDesignAuthorityConfig({
        rootDir,
        slice: state.slice ?? workItemId,
      })
    : null;
  const finalAuthorityGateIssues =
    stage === 6
      ? validateFinalAuthorityGateReadiness({
          designAuthorityConfig,
          designAuthorityState: nextState.design_authority,
        })
      : [];
  if (finalAuthorityGateIssues.length > 0) {
    return blockWithRecovery({
      rootDir,
      workItemId,
      slice: state.slice ?? workItemId,
      state: nextState,
      stage,
      prRole,
      reason: summarizeChecklistIssues(finalAuthorityGateIssues),
      now,
      worktree,
    });
  }
  const phase = resolveStatePhase(nextState);

  if ((!isPendingReviewPhase(phase) && phase !== "merge_pending") || nextState.active_stage !== stage) {
    const priorStageResultPath = [3, 5].includes(stage)
      ? (() => {
          const dir = nextState.last_artifact_dir;
          if (typeof dir !== "string" || dir.trim().length === 0) return null;
          const candidate = resolve(dir.trim(), "stage-result.json");
          return existsSync(candidate) ? candidate : null;
        })()
      : null;
    const runResult = stageRunner({
      rootDir,
      workItemId,
      slice: state.slice ?? workItemId,
      stage,
      subphase,
      executionDir: state.workspace?.path,
      priorStageResultPath,
    });
    const deferredOutcome = handleDeferredStageExecution({
      rootDir,
      workItemId,
      slice: state.slice ?? workItemId,
      stage,
      prRole,
      prPath: activePr.url,
      headSha: activePr.head_sha ?? null,
      runResult,
      worktree,
      now,
    });
    if (deferredOutcome) {
      return deferredOutcome;
    }
    nextState = resolveRunResultRuntimeState({
      rootDir,
      workItemId,
      slice: state.slice ?? workItemId,
      runResult,
    });

    if (!isPendingReviewPhase(resolveStatePhase(nextState)) && runResult.stageResult) {
      const stageResultPath = resolve(runResult.artifactDir, "stage-result.json");
      mkdirSync(runResult.artifactDir, { recursive: true });
      if (!existsSync(stageResultPath)) {
        writeFileSync(stageResultPath, `${JSON.stringify(runResult.stageResult, null, 2)}\n`);
      }
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setExecutionState({
          state: nextState,
          activeStage: stage,
          phase: "review_pending",
          nextAction: "run_review",
          artifactDir: runResult.artifactDir,
          execution: {
            provider: runResult.execution?.provider ?? null,
            session_role:
              runResult.dispatch?.sessionBinding?.role ??
              resolveStageSessionRole(stage, subphase),
            session_id: runResult.execution?.sessionId ?? null,
            artifact_dir: runResult.artifactDir,
            stage_result_path: stageResultPath,
            started_at: now,
            finished_at: now,
            verify_commands: [],
            verify_bucket: null,
            commit_sha: null,
            pr_role: prRole,
            subphase,
          },
          clearRecovery: true,
        }),
      });
    }
  }

  activePr = getActivePullRequest(nextState, prRole);
  const stageResult = loadExecutionStageResult(nextState, {
    strictExtendedContract: isChecklistContractActive(checklistContract),
  });
  const artifactDir = nextState.execution?.artifact_dir ?? nextState.last_artifact_dir;
  const reviewRole = prRole === "backend" ? "backend" : "frontend";
  const rebuttalEntry = nextState.last_rebuttal?.[reviewRole] ?? null;
  const isFinalAuthorityGate = stage === 5 && subphase === "final_authority_gate";
  const reviewChecklistIssues = validateReviewStageChecklistContract({
    checklistContract,
    stage,
    stageResult,
    rebuttalEntry,
  });
  const authorityReviewIssues =
    stage === 5 && designAuthorityConfig?.authority_required
      ? validateAuthorityReviewStageResult({
          stageResult,
          authorityConfig: designAuthorityConfig,
          worktreePath: nextState.workspace.path,
        })
      : [];

  if (reviewChecklistIssues.length > 0 || authorityReviewIssues.length > 0) {
    return blockWithRecovery({
      rootDir,
      workItemId,
      slice: state.slice ?? workItemId,
      state: nextState,
      stage,
      prRole,
      reason: summarizeChecklistIssues([...reviewChecklistIssues, ...authorityReviewIssues]),
      now,
      worktree,
    });
  }

  if (resolveStatePhase(nextState) === "review_pending") {
    nextState = saveRuntime({
      rootDir,
      workItemId,
      state: setLastReview({
        state: nextState,
        role: reviewRole,
        decision: stageResult.decision,
        routeBackStage: stageResult.route_back_stage,
        approvedHeadSha: stageResult.approved_head_sha,
        bodyMarkdown: stageResult.body_markdown,
        findings: stageResult.findings ?? [],
        reviewScope: stageResult.review_scope ?? null,
        reviewedChecklistIds: stageResult.reviewed_checklist_ids ?? [],
        requiredFixIds: stageResult.required_fix_ids ?? [],
        waivedFixIds: stageResult.waived_fix_ids ?? [],
        authorityVerdict: stageResult.authority_verdict ?? null,
        reviewedScreenIds: stageResult.reviewed_screen_ids ?? [],
        authorityReportPaths: stageResult.authority_report_paths ?? [],
        blockerCount: stageResult.blocker_count ?? null,
        majorCount: stageResult.major_count ?? null,
        minorCount: stageResult.minor_count ?? null,
        updatedAt: now,
      }),
    });

    if (stage === 5 && designAuthorityConfig?.authority_required) {
      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setDesignAuthorityState({
          state: nextState,
          status:
            stageResult.decision === "approve" && isFinalAuthorityGate && stageResult.authority_verdict === "pass"
              ? "reviewed"
              : stageResult.decision === "approve"
                ? "final_authority_pending"
              : "needs_revision",
          uiRisk: designAuthorityConfig.ui_risk,
          anchorScreens: designAuthorityConfig.anchor_screens,
          requiredScreens: designAuthorityConfig.required_screens,
          authorityRequired: true,
          authorityReportPaths: stageResult.authority_report_paths ?? [],
          authorityVerdict: stageResult.authority_verdict ?? null,
          blockerCount: stageResult.blocker_count ?? null,
          majorCount: stageResult.major_count ?? null,
          minorCount: stageResult.minor_count ?? null,
          reviewedScreenIds: stageResult.reviewed_screen_ids ?? [],
          sourceStage: 5,
          updatedAt: now,
        }),
      });
    }

    github.commentPullRequest({
      prRef: activePr.url,
      body: stageResult.body_markdown,
    });

    const waivedFiles = applyReviewWaivers({
      checklistContract,
      waivedFixIds: stageResult.waived_fix_ids ?? [],
      waivedStage: stage,
    });
    if (waivedFiles.length > 0) {
      commitWorktreeChanges({
        worktreePath: nextState.workspace.path,
        subject: `docs(workpack): record ${state.slice ?? workItemId} waived checklist fixes`,
        body: `Claude accepted rebuttals for: ${summarizeFixIds(stageResult.waived_fix_ids ?? [])}.`,
      });
      worktree.pushBranch({
        branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
      });
      nextState = upsertPullRequest({
        rootDir,
        workItemId,
        state: nextState,
        role: prRole,
        pr: activePr,
        branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
        headSha: worktree.getHeadSha(),
        now,
      });
      activePr = getActivePullRequest(nextState, prRole);
    }

    if (stageResult.decision === "approve") {
      if (stage === 5) {
        if (designAuthorityConfig?.authority_required && !isFinalAuthorityGate) {
          nextState = saveRuntime({
            rootDir,
            workItemId,
            state: setWaitState({
              state: markStageCompleted({
                state: nextState,
                stage,
                artifactDir,
              }),
              kind: "ready_for_next_stage",
              prRole: "frontend",
              stage: 5,
              headSha: activePr.head_sha,
              updatedAt: now,
            }),
          });
          updateRuntimeStatusForWait({
            rootDir,
            workItemId,
            wait: nextState.wait,
            prPath: activePr.url,
            now,
            approvalState: "codex_approved",
            lifecycle: "ready_for_review",
            verificationStatus: "passed",
            extraNotes: ["authority_final_gate=pending"],
          });
          return {
            state: nextState,
            wait: nextState.wait,
            transitioned: true,
          };
        }

        const bookkeeping = applyDesignReviewBookkeeping({
          worktreePath: nextState.workspace.path,
          slice: state.slice ?? workItemId,
          updateAuthorityStatus: Boolean(designAuthorityConfig?.authority_required),
        });

        if (bookkeeping.changed) {
          commitWorktreeChanges({
            worktreePath: nextState.workspace.path,
            subject: `docs(workpack): confirm ${state.slice ?? workItemId} design status`,
            body: "Stage 5 디자인 리뷰 승인에 따라 Design Status를 confirmed로 정렬합니다.",
          });
          worktree.pushBranch({
            branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
          });
          const headSha = worktree.getHeadSha();
          nextState = upsertPullRequest({
            rootDir,
            workItemId,
            state: nextState,
            role: "frontend",
            pr: activePr,
            branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
            headSha,
            now,
          });
          nextState = saveRuntime({
            rootDir,
            workItemId,
            state: setWaitState({
              state: markStageCompleted({
                state: nextState,
                stage,
                artifactDir,
              }),
              kind: "ci",
              prRole: "frontend",
              stage: 5,
              headSha,
              updatedAt: now,
            }),
          });
          updateRuntimeStatusForWait({
            rootDir,
            workItemId,
            wait: nextState.wait,
            prPath: activePr.url,
            now,
            approvalState: isFinalAuthorityGate ? "claude_approved" : "codex_approved",
            lifecycle: "ready_for_review",
            verificationStatus: "pending",
            extraNotes: ["bookkeeping=design_status_confirmed"],
          });
          return {
            state: nextState,
            wait: nextState.wait,
            transitioned: false,
          };
        }

        nextState = saveRuntime({
          rootDir,
          workItemId,
          state: setWaitState({
            state: markStageCompleted({
              state: nextState,
              stage,
              artifactDir,
            }),
            kind: "ready_for_next_stage",
            prRole: "frontend",
            stage: 6,
            headSha: activePr.head_sha,
            updatedAt: now,
          }),
        });
        updateRuntimeStatusForWait({
          rootDir,
          workItemId,
          wait: nextState.wait,
          prPath: activePr.url,
          now,
          approvalState: isFinalAuthorityGate ? "claude_approved" : "codex_approved",
          lifecycle: "ready_for_review",
          verificationStatus: "passed",
        });
        return {
          state: nextState,
          wait: nextState.wait,
          transitioned: true,
        };
      }

      if ([3, 6].includes(stage)) {
        if (!autonomousContext?.policy.autonomous || !autonomousContext?.policy.mergeEligible) {
          return blockWithRecovery({
            rootDir,
            workItemId,
            slice: state.slice ?? workItemId,
            state: nextState,
            stage,
            prRole,
            reason:
              autonomousContext?.policy.autonomous
                ? `Slice requires manual merge handoff for Stage ${stage}.`
                : `Slice is not eligible for autonomous Stage ${stage} merge.`,
            now,
            worktree,
          });
        }

        const approvalRequirement =
          typeof github.getApprovalRequirement === "function"
            ? github.getApprovalRequirement({
                prRef: activePr.url,
              })
            : {
                required: false,
                requiredApprovingReviewCount: 0,
                source: "unavailable",
              };
        if (approvalRequirement.required) {
          return blockWithRecovery({
            rootDir,
            workItemId,
            slice: state.slice ?? workItemId,
            state: nextState,
            stage,
            prRole,
            reason:
              `Repository ruleset still requires ${approvalRequirement.requiredApprovingReviewCount} approving review(s); autonomous merge cannot continue.`,
            now,
            worktree,
          });
        }
      }

      if (stage === 6) {
        const bookkeeping = applyFrontendMergeBookkeeping({
          worktreePath: nextState.workspace.path,
          slice: state.slice ?? workItemId,
        });

        if (bookkeeping.changed) {
          commitWorktreeChanges({
            worktreePath: nextState.workspace.path,
            subject: `docs(workpacks): mark ${state.slice ?? workItemId} merged`,
            body: "Stage 6 최종 승인 뒤 frontend PR에 merged bookkeeping을 반영합니다.",
          });
          worktree.pushBranch({
            branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
          });
          const headSha = worktree.getHeadSha();
          nextState = upsertPullRequest({
            rootDir,
            workItemId,
            state: nextState,
            role: prRole,
            pr: activePr,
            branch: activePr.branch ?? resolveBranchName({ slice: state.slice ?? workItemId, stage }),
            headSha,
            now,
          });
          nextState = saveRuntime({
            rootDir,
            workItemId,
            state: setWaitState({
              state: setExecutionState({
                state: nextState,
                activeStage: stage,
                nextAction: "poll_ci",
                artifactDir,
                execution: nextState.execution,
              }),
              kind: "ci",
              prRole: "frontend",
              stage: 6,
              headSha,
              phase: "merge_pending",
              nextAction: "poll_ci",
              updatedAt: now,
            }),
          });
          updateRuntimeStatusForWait({
            rootDir,
            workItemId,
            wait: nextState.wait,
            prPath: activePr.url,
            now,
            approvalState: "dual_approved",
            lifecycle: "ready_for_review",
            verificationStatus: "pending",
            extraNotes: ["bookkeeping=slice_status_merged", "merge_gate=external_smoke"],
          });
          return {
            state: nextState,
            wait: nextState.wait,
            transitioned: false,
          };
        }
      }

      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: setExecutionState({
            state: nextState,
            activeStage: stage,
            phase: "merge_pending",
            nextAction: "poll_ci",
            artifactDir,
            execution: nextState.execution,
          }),
          kind: "ci",
          prRole,
          stage,
          headSha: resolveApprovedHeadSha({
            approvedHeadSha: stageResult.approved_head_sha,
            activeHeadSha: activePr.head_sha,
          }),
          phase: "merge_pending",
          nextAction: "poll_ci",
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        approvalState: "dual_approved",
        lifecycle: "ready_for_review",
        verificationStatus: "pending",
        extraNotes: ["merge_gate=external_smoke"],
      });
    } else {
      if (stage === 5 && designAuthorityConfig?.authority_required) {
        nextState = saveRuntime({
          rootDir,
          workItemId,
          state: setDesignAuthorityState({
            state: nextState,
            status: "needs_revision",
            uiRisk: designAuthorityConfig.ui_risk,
            anchorScreens: designAuthorityConfig.anchor_screens,
            requiredScreens: designAuthorityConfig.required_screens,
            authorityRequired: true,
            authorityReportPaths: stageResult.authority_report_paths ?? [],
            authorityVerdict: stageResult.authority_verdict ?? null,
            blockerCount: stageResult.blocker_count ?? null,
            majorCount: stageResult.major_count ?? null,
            minorCount: stageResult.minor_count ?? null,
            reviewedScreenIds: stageResult.reviewed_screen_ids ?? [],
            sourceStage: 5,
            updatedAt: now,
          }),
        });
      }

      const routeBackStage = stageResult.route_back_stage ?? defaultBackRoute(stage);
      const MAX_PING_PONG_ROUNDS = 3;
      // Read from the original state, not nextState: the first setLastReview in review_pending
      // already overwrote nextState.last_review with ping_pong_rounds defaulting to 0.
      const currentRounds = state.last_review?.[reviewRole]?.ping_pong_rounds ?? 0;
      const nextPingPongRounds = currentRounds + 1;

      if (nextPingPongRounds > MAX_PING_PONG_ROUNDS) {
        return blockWithRecovery({
          rootDir,
          workItemId,
          slice: state.slice ?? workItemId,
          state: nextState,
          stage,
          prRole,
          reason: `Review ping-pong stalled after ${MAX_PING_PONG_ROUNDS} rounds. Human intervention required.`,
          now,
          worktree,
        });
      }

      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setLastReview({
          state: nextState,
          role: reviewRole,
          decision: stageResult.decision,
          routeBackStage: stageResult.route_back_stage,
          approvedHeadSha: stageResult.approved_head_sha,
          bodyMarkdown: stageResult.body_markdown,
          findings: stageResult.findings ?? [],
          reviewScope: stageResult.review_scope ?? null,
          reviewedChecklistIds: stageResult.reviewed_checklist_ids ?? [],
          requiredFixIds: stageResult.required_fix_ids ?? [],
          waivedFixIds: stageResult.waived_fix_ids ?? [],
          sourceReviewStage: stage,
          pingPongRounds: nextPingPongRounds,
          updatedAt: now,
        }),
      });

      nextState = saveRuntime({
        rootDir,
        workItemId,
        state: setWaitState({
          state: markStageCompleted({
            state: nextState,
            stage,
            artifactDir,
          }),
          kind: "ready_for_next_stage",
          prRole,
          stage: routeBackStage,
          headSha: activePr.head_sha,
          updatedAt: now,
        }),
      });
      updateRuntimeStatusForWait({
        rootDir,
        workItemId,
        wait: nextState.wait,
        prPath: activePr.url,
        now,
        approvalState: "needs_revision",
        lifecycle: "in_progress",
        verificationStatus: "pending",
      });
      return {
        state: nextState,
        wait: nextState.wait,
        transitioned: true,
      };
    }
  }

  if (resolveStatePhase(nextState) === "merge_pending") {
    const mergeAuthorityGateIssues =
      stage === 6
        ? validateFinalAuthorityGateReadiness({
            designAuthorityConfig,
            designAuthorityState: nextState.design_authority,
          })
        : [];
    if (mergeAuthorityGateIssues.length > 0) {
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice: state.slice ?? workItemId,
        state: nextState,
        stage,
        prRole,
        reason: summarizeChecklistIssues(mergeAuthorityGateIssues),
        now,
        worktree,
      });
    }

    if (!stageResult || stageResult.decision !== "approve") {
      return blockWithRecovery({
        rootDir,
        workItemId,
        slice: state.slice ?? workItemId,
        state: nextState,
        stage,
        prRole,
        reason: "auto_merge_guard: stageResult.decision is not 'approve'. Cannot auto-merge.",
        now,
        worktree,
      });
    }

    const approvedHeadSha = resolveApprovedHeadSha({
      approvedHeadSha: stageResult.approved_head_sha,
      activeHeadSha: activePr.head_sha,
    });
    try {
      github.mergePullRequest({
        prRef: activePr.url,
        headSha: approvedHeadSha,
      });
    } catch (error) {
      if (/up to date|update branch|behind/i.test(error.message)) {
        github.updateBranch({
          prRef: activePr.url,
        });
        nextState = saveRuntime({
          rootDir,
          workItemId,
          state: setWaitState({
            state: setExecutionState({
              state: nextState,
              activeStage: stage,
              phase: "merge_pending",
              nextAction: "poll_ci",
              artifactDir,
              execution: nextState.execution,
            }),
            kind: "ci",
            prRole,
            stage,
            headSha: approvedHeadSha,
            updatedAt: now,
          }),
        });
        updateRuntimeStatusForWait({
          rootDir,
          workItemId,
          wait: nextState.wait,
          prPath: activePr.url,
          now,
          approvalState: "dual_approved",
          lifecycle: "ready_for_review",
          verificationStatus: "pending",
        });
        return {
          state: nextState,
          wait: nextState.wait,
          transitioned: false,
        };
      }

      if (isApprovalRequirementMergeError(error)) {
        return blockWithRecovery({
          rootDir,
          workItemId,
          slice: state.slice ?? workItemId,
          state: nextState,
          stage,
          prRole,
          reason: error.message,
          now,
          worktree,
        });
      }

      throw error;
    }

    return finalizeMergedReviewStage({
      rootDir,
      workItemId,
      state: nextState,
      stage,
      activePr,
      artifactDir,
      worktree,
      now,
    });
  }

  return {
    state: nextState,
    wait: nextState.wait,
    transitioned: false,
  };
}

function createDefaultDependencies({
  rootDir,
  ghBin,
  opencodeBin,
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  claudeBudgetState,
  mode,
  environment,
  homeDir,
  now,
}) {
  const github = createGithubAutomationClient({
    rootDir,
    ghBin,
    environment,
  });
  const claudeProviderConfig = resolveClaudeProviderConfig({
    rootDir,
    provider: claudeProvider,
    bin: claudeBin,
    model: claudeModel,
    effort: claudeEffort,
  });
  const codexProviderConfig = resolveCodexProviderConfig({
    rootDir,
    bin: opencodeBin,
    environment,
  });

  return {
    auth: {
      assertGhAuth() {
        github.assertAuth();
      },
      assertOpencodeAuth() {
        const result = runProviderPreflight({
          bin: codexProviderConfig.bin,
          args: ["auth", "list"],
          rootDir,
          environment,
          errorPrefix: "OpenCode auth is unavailable",
        });
        const output = `${result.stdout}\n${result.stderr}`;
        if (/0 credentials|no credentials/i.test(output)) {
          throw new Error("OpenCode auth is not configured for this machine.");
        }
      },
      assertClaudeAuth() {
        runProviderPreflight({
          bin: claudeProviderConfig.bin,
          args: ["--version"],
          rootDir,
          environment,
          errorPrefix: "Claude CLI is unavailable",
        });
      },
      resolveStageProvider(stage, subphase = null) {
        return resolveStageProvider({
          rootDir,
          stage,
          subphase,
          claudeProvider: claudeProviderConfig.provider,
          claudeBin: claudeProviderConfig.bin,
          claudeModel: claudeProviderConfig.model,
          claudeEffort: claudeProviderConfig.effort,
          opencodeBin: codexProviderConfig.bin,
          environment,
        }).provider;
      },
    },
    worktree: {
      ensureWorktree({ workItemId }) {
        return ensureSupervisorWorktree({
          rootDir,
          workItemId,
        });
      },
      assertClean({ worktreePath }) {
        return assertWorktreeClean({
          worktreePath,
        });
      },
      checkoutBranch({ branch, startPoint, worktreePath }) {
        return ensureWorktreeBranch({
          rootDir,
          worktreePath,
          branch,
          startPoint,
        });
      },
      pushBranch({ branch, worktreePath }) {
        return pushWorktreeBranch({
          worktreePath,
          branch,
        });
      },
      syncBaseBranch({ worktreePath }) {
        return syncWorktreeWithBaseBranch({
          rootDir,
          worktreePath,
        });
      },
      getHeadSha({ worktreePath }) {
        return getWorktreeHeadSha({
          worktreePath,
        });
      },
      getCurrentBranch({ worktreePath }) {
        return getWorktreeCurrentBranch({
          worktreePath,
        });
      },
      listChangedFiles({ worktreePath }) {
        return listWorktreeChangedFiles({
          worktreePath,
        });
      },
      getBinaryDiff({ worktreePath }) {
        return getWorktreeBinaryDiff({
          worktreePath,
        });
      },
    },
    github,
    stageRunner: createDefaultStageRunner({
      rootDir,
      claudeBudgetState,
      mode,
      opencodeBin,
      claudeProvider,
      claudeBin,
      claudeModel,
      claudeEffort,
      environment,
      homeDir,
      now,
    }),
  };
}

/**
 * @param {{
 *   rootDir?: string,
 *   workItemId: string,
 *   slice?: string,
 *   now?: string,
 *   maxTransitions?: number,
 *   ghBin?: string,
 *   opencodeBin?: string,
 *   claudeProvider?: "opencode"|"claude-cli",
 *   claudeBin?: string,
 *   claudeModel?: string,
 *   claudeEffort?: "low"|"medium"|"high",
 *   claudeBudgetState?: "available"|"constrained"|"unavailable",
 *   mode?: "artifact-only"|"execute",
 *   environment?: Record<string, string>,
 *   homeDir?: string,
 * }} options
 * @param {Record<string, unknown>} [injectedDependencies]
 */
export function superviseWorkItem(
  {
    rootDir = process.cwd(),
    workItemId,
    slice = undefined,
    now,
    maxTransitions = 8,
    ghBin,
    opencodeBin,
    claudeProvider,
    claudeBin,
    claudeModel,
    claudeEffort,
    claudeBudgetState,
    mode = "execute",
    environment,
    homeDir,
  },
  injectedDependencies = {},
) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const resolvedSlice = resolveSlice({
    workItemId: normalizedWorkItemId,
    slice,
  });
  const owner = `omo-supervisor-${process.pid}`;

  acquireRuntimeLock({
    rootDir,
    workItemId: normalizedWorkItemId,
    owner,
    now,
    slice: resolvedSlice,
  });

  try {
    let state = loadRuntime({
      rootDir,
      workItemId: normalizedWorkItemId,
      slice: resolvedSlice,
    });
    const dependencies = {
      ...createDefaultDependencies({
        rootDir,
        ghBin,
        opencodeBin,
        claudeProvider,
        claudeBin,
        claudeModel,
        claudeEffort,
        claudeBudgetState,
        mode,
        environment,
        homeDir,
        now,
      }),
      ...injectedDependencies,
    };

    try {
      dependencies.auth?.assertGhAuth?.();
    } catch (error) {
      const blocked = applyBlocker({
        rootDir,
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        state,
        reason: error.message,
        now,
      });
      const artifactDir = writeSupervisorArtifact({
        rootDir,
        workItemId: normalizedWorkItemId,
        now,
        summary: {
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          transitions: [],
          wait: blocked.wait,
          recovery: blocked.runtime.recovery,
        },
        runtimeState: blocked.runtime,
        worktree: dependencies.worktree,
      });

      return {
        ...blocked,
        artifactDir,
        transitions: [],
      };
    }

    const ensuredWorktree = dependencies.worktree.ensureWorktree({
      rootDir,
      workItemId: normalizedWorkItemId,
      slice: resolvedSlice,
    });
    state = saveRuntime({
      rootDir,
      workItemId: normalizedWorkItemId,
      state: setWorkspaceBinding({
        state,
        path: ensuredWorktree.path,
        branchRole: state.workspace?.branch_role,
        updatedAt: now,
      }),
    });

    const invariant = evaluateBookkeepingInvariant({
      rootDir,
      workItemId: normalizedWorkItemId,
      slice: resolvedSlice,
      runtimeState: state,
      worktreePath: state.workspace?.path,
    });

    if (invariant.outcome === "ambiguous_drift") {
      const blocked = applyBlocker({
        rootDir,
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        state,
        reason: `Bookkeeping drift is ambiguous: ${invariant.reason ?? "unknown"}`,
        now,
      });
      const artifactDir = writeSupervisorArtifact({
        rootDir,
        workItemId: normalizedWorkItemId,
        now,
        summary: {
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          transitions: [],
          wait: blocked.wait,
          recovery: blocked.runtime.recovery,
          bookkeeping_invariant: invariant,
        },
        runtimeState: blocked.runtime,
        worktree: dependencies.worktree,
      });

      return {
        ...blocked,
        artifactDir,
        transitions: [],
      };
    }

    if (invariant.outcome === "repairable_pre_merge" && invariant.repairActions.length > 0) {
      const repairStage =
        state.wait?.stage ??
        state.active_stage ??
        state.current_stage ??
        state.last_completed_stage ??
        null;
      const repairPrRole =
        state.wait?.pr_role ??
        (Number.isInteger(repairStage) ? resolvePrRole(repairStage) : null);
      const activeRepairPr = repairPrRole ? state.prs?.[repairPrRole] ?? null : null;
      const repairBranch =
        activeRepairPr?.branch ??
        (Number.isInteger(repairStage)
          ? resolveBranchName({
              slice: resolvedSlice,
              stage: repairStage,
            })
          : null);

      if (!Number.isInteger(repairStage) || !repairPrRole || !activeRepairPr?.url || !repairBranch) {
        const blocked = applyBlocker({
          rootDir,
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          state,
          reason: `Bookkeeping drift requires manual recovery: ${summarizeBookkeepingIssues(invariant.issues)}`,
          now,
        });
        const artifactDir = writeSupervisorArtifact({
          rootDir,
          workItemId: normalizedWorkItemId,
          now,
          summary: {
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            transitions: [],
            wait: blocked.wait,
            recovery: blocked.runtime.recovery,
            bookkeeping_invariant: invariant,
          },
          runtimeState: blocked.runtime,
          worktree: dependencies.worktree,
        });

        return {
          ...blocked,
          artifactDir,
          transitions: [],
        };
      }

      dependencies.worktree.checkoutBranch({
        rootDir,
        worktreePath: state.workspace.path,
        branch: repairBranch,
        startPoint: "origin/master",
      });
      state = repairActiveBookkeepingDrift({
        rootDir,
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        state,
        invariant,
        stage: repairStage,
        prRole: repairPrRole,
        branchName: repairBranch,
        activePr: activeRepairPr,
        worktree: {
          pushBranch: ({ branch }) =>
            dependencies.worktree.pushBranch({
              worktreePath: state.workspace.path,
              branch,
            }),
          getHeadSha: () =>
            dependencies.worktree.getHeadSha({
              worktreePath: state.workspace.path,
            }),
        },
        now,
      });
    }

    const transitions = [];

    for (let transitionIndex = 0; transitionIndex < maxTransitions; transitionIndex += 1) {
      if (!shouldAllowDirtyWorktree(state)) {
        try {
          dependencies.worktree.assertClean({
            worktreePath: state.workspace.path,
          });
        } catch (error) {
          const recovery = buildRecoverySnapshot({
            state,
            stage: state.wait?.stage ?? state.current_stage ?? state.blocked_stage ?? state.last_completed_stage ?? 1,
            kind: "dirty_worktree",
            reason: error.message,
            prRole: state.wait?.pr_role ?? state.workspace?.branch_role ?? null,
            artifactDir: state.last_artifact_dir,
            worktreePath: state.workspace.path,
            worktree: {
              getCurrentBranch: ({ worktreePath }) =>
                dependencies.worktree.getCurrentBranch({
                  worktreePath,
                }),
              listChangedFiles: ({ worktreePath }) =>
                dependencies.worktree.listChangedFiles({
                  worktreePath,
                }),
            },
            now,
          });
          const blocked = applyBlocker({
            rootDir,
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            state,
            reason: error.message,
            recovery,
            prPath: state.prs?.[state.wait?.pr_role ?? ""]?.url ?? null,
            now,
          });
          const artifactDir = writeSupervisorArtifact({
            rootDir,
            workItemId: normalizedWorkItemId,
            now,
            summary: {
              workItemId: normalizedWorkItemId,
              slice: resolvedSlice,
              transitions,
              wait: blocked.wait,
              recovery: blocked.runtime.recovery,
            },
            runtimeState: blocked.runtime,
            worktree: dependencies.worktree,
          });

          return {
            ...blocked,
            artifactDir,
            transitions,
          };
        }
      }

      let waitProcessing;
      try {
        waitProcessing = processWaitState({
          rootDir,
          workItemId: normalizedWorkItemId,
          state,
          github: dependencies.github,
          worktree: {
            syncBaseBranch() {
              return dependencies.worktree.syncBaseBranch({
                rootDir,
                worktreePath: state.workspace.path,
              });
            },
          },
          now,
        });
      } catch (error) {
        const blocked = applyBlocker({
          rootDir,
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          state,
          reason: error.message,
          now,
        });
        const artifactDir = writeSupervisorArtifact({
          rootDir,
          workItemId: normalizedWorkItemId,
          now,
          summary: {
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            transitions,
            wait: blocked.wait,
            recovery: blocked.runtime.recovery,
          },
          runtimeState: blocked.runtime,
          worktree: dependencies.worktree,
        });

        return {
          ...blocked,
          artifactDir,
          transitions,
        };
      }

      state = waitProcessing.state;
      if (waitProcessing.action === "stop" || waitProcessing.action === "wait") {
        const artifactDir = writeSupervisorArtifact({
          rootDir,
          workItemId: normalizedWorkItemId,
          now,
          summary: {
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            transitions,
            wait: state.wait,
            recovery: state.recovery,
          },
          runtimeState: state,
          worktree: dependencies.worktree,
        });

        return {
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          wait: state.wait,
          runtime: state,
          artifactDir,
          transitions,
        };
      }

      const stage = waitProcessing.nextStage;
      if (!Number.isInteger(stage)) {
        const artifactDir = writeSupervisorArtifact({
          rootDir,
          workItemId: normalizedWorkItemId,
          now,
          summary: {
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            transitions,
            wait: state.wait,
            recovery: state.recovery,
          },
          runtimeState: state,
          worktree: dependencies.worktree,
        });

        return {
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          wait: state.wait,
          runtime: state,
          artifactDir,
          transitions,
        };
      }

      const stageSubphase =
        stage === 2
          ? resolveStage2Subphase(state)
          : stage === 4
            ? resolveStage4Subphase({
                rootDir,
                slice: resolvedSlice,
                state,
              })
            : stage === 5
              ? resolveStage5Subphase({
                  rootDir,
                  slice: resolvedSlice,
                  state,
                })
            : null;

      try {
        assertStageProviderReady({
          auth: dependencies.auth,
          rootDir,
          stage,
          subphase: stageSubphase,
          claudeProvider,
          claudeBin,
          claudeModel,
          claudeEffort,
          opencodeBin,
          environment,
        });
      } catch (error) {
        const blocked = applyBlocker({
          rootDir,
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          state,
          reason: error.message,
          prPath: state.prs?.[resolvePrRole(stage)]?.url ?? null,
          now,
        });
        const artifactDir = writeSupervisorArtifact({
          rootDir,
          workItemId: normalizedWorkItemId,
          now,
          summary: {
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            transitions,
            wait: blocked.wait,
            recovery: blocked.runtime.recovery,
          },
          runtimeState: blocked.runtime,
          worktree: dependencies.worktree,
        });

        return {
          ...blocked,
          artifactDir,
          transitions,
        };
      }

      const stageWorktree = {
        checkoutBranch: ({ branch, startPoint }) =>
          dependencies.worktree.checkoutBranch({
            rootDir,
            worktreePath: state.workspace.path,
            branch,
            startPoint,
          }),
        pushBranch: ({ branch }) =>
          dependencies.worktree.pushBranch({
            worktreePath: state.workspace.path,
            branch,
          }),
        syncBaseBranch: () =>
          dependencies.worktree.syncBaseBranch({
            rootDir,
            worktreePath: state.workspace.path,
          }),
        getHeadSha: () =>
          dependencies.worktree.getHeadSha({
            worktreePath: state.workspace.path,
          }),
        assertClean: () =>
          dependencies.worktree.assertClean({
            worktreePath: state.workspace.path,
          }),
        getCurrentBranch: ({ worktreePath }) =>
          dependencies.worktree.getCurrentBranch({
            worktreePath,
          }),
        listChangedFiles: ({ worktreePath }) =>
          dependencies.worktree.listChangedFiles({
            worktreePath,
          }),
        getBinaryDiff: ({ worktreePath }) =>
          dependencies.worktree.getBinaryDiff({
            worktreePath,
          }),
      };

      const handler =
        [1, 2, 4].includes(stage)
          ? handleCodeStage
          : handleReviewStage;
      const stageOutcome = handler({
        rootDir,
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        state,
        stage,
        subphase: stageSubphase ?? "implementation",
        stageRunner: dependencies.stageRunner,
        worktree: stageWorktree,
        github: dependencies.github,
        now,
      });

      state = stageOutcome.state;
      transitions.push({
        stage,
        wait: state.wait,
      });

      if (stageOutcome.merged || !stageOutcome.transitioned) {
        const artifactDir = writeSupervisorArtifact({
          rootDir,
          workItemId: normalizedWorkItemId,
          now,
          summary: {
            workItemId: normalizedWorkItemId,
            slice: resolvedSlice,
            transitions,
            wait: state.wait,
            recovery: state.recovery,
          },
          runtimeState: state,
          worktree: stageWorktree,
        });

        return {
          workItemId: normalizedWorkItemId,
          slice: resolvedSlice,
          wait: state.wait,
          runtime: state,
          artifactDir,
          transitions,
        };
      }
    }

    const cappedState = state;
    const artifactDir = writeSupervisorArtifact({
      rootDir,
      workItemId: normalizedWorkItemId,
      now,
      summary: {
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        transitions,
        wait: cappedState.wait,
        recovery: cappedState.recovery,
      },
      runtimeState: cappedState,
      worktree: dependencies.worktree,
    });
    const cappedStatusPatch = {
      lifecycle:
        cappedState.wait?.kind === "human_escalation" ? "blocked" : "in_progress",
      verification_status: "pending",
      notes: `wait_kind=${cappedState.wait?.kind ?? "none"} reason=max transitions exceeded`,
    };
    if (cappedState.wait?.kind === "human_escalation") {
      cappedStatusPatch.approval_state = "human_escalation";
    }
    syncStatus({
      rootDir,
      workItemId: normalizedWorkItemId,
      patch: cappedStatusPatch,
      now,
    });

    return {
      workItemId: normalizedWorkItemId,
      slice: resolvedSlice,
      wait: cappedState.wait,
      runtime: cappedState,
      artifactDir,
      transitions,
    };
  } finally {
    releaseRuntimeLock({
      rootDir,
      workItemId: normalizedWorkItemId,
      owner,
      slice: resolvedSlice,
    });
  }
}

/**
 * @param {{
 *   rootDir?: string,
 *   workItemId?: string,
 *   all?: boolean,
 *   now?: string,
 *   ghBin?: string,
 *   opencodeBin?: string,
 *   claudeProvider?: "opencode"|"claude-cli",
 *   claudeBin?: string,
 *   claudeModel?: string,
 *   claudeEffort?: "low"|"medium"|"high",
 *   claudeBudgetState?: "available"|"constrained"|"unavailable",
 *   mode?: "artifact-only"|"execute",
 *   environment?: Record<string, string>,
 *   homeDir?: string,
 * }} [options]
 * @param {Record<string, unknown>} [dependencies]
 */
export function tickSupervisorWorkItems(
  {
    rootDir = process.cwd(),
    workItemId = undefined,
    all = false,
    now,
    ...options
  } = {},
  dependencies = {},
) {
  const isResumableState = (state) => {
    const phase = resolveStatePhase(state);
    if (isPendingFinalizePhase(phase) || isPendingReviewPhase(phase)) {
      return {
        resumable: true,
        reason: null,
      };
    }

    if (!state.wait?.kind) {
      return {
        resumable: false,
        reason: "no_wait_state",
      };
    }

    if (!["ci", "blocked_retry", "ready_for_next_stage"].includes(state.wait.kind)) {
      return {
        resumable: false,
        reason: `unsupported_wait_kind=${state.wait.kind}`,
      };
    }

    if (state.wait.kind === "blocked_retry" && !isRetryDue(state.retry, now)) {
      return {
        resumable: false,
        reason: "retry_not_due",
      };
    }

    return {
      resumable: true,
      reason: null,
    };
  };

  if (typeof workItemId === "string" && workItemId.trim().length > 0) {
    const normalizedWorkItemId = workItemId.trim();
    const runtimePath = resolveRuntimePath({
      rootDir,
      workItemId: normalizedWorkItemId,
    });
    if (!existsSync(runtimePath)) {
      return [
        createTickResult({
          workItemId: normalizedWorkItemId,
          action: "noop",
          reason: "missing_runtime",
        }),
      ];
    }

    const { state } = readRuntimeState({
      rootDir,
      workItemId: normalizedWorkItemId,
    });

    if (state.lock?.owner) {
      return [
        createTickResult({
          workItemId: normalizedWorkItemId,
          slice: state.slice,
          action: "skip_locked",
          reason: `locked_by=${state.lock.owner}`,
          wait: state.wait,
          runtime: state,
        }),
      ];
    }

    const resumable = isResumableState(state);
    if (!resumable.resumable) {
      return [
        createTickResult({
          workItemId: normalizedWorkItemId,
          slice: state.slice,
          action: "noop",
          reason: resumable.reason,
          wait: state.wait ?? null,
          runtime: state,
        }),
      ];
    }

    const supervise = dependencies.supervise ?? superviseWorkItem;
    return [
      supervise({
        rootDir,
        workItemId: normalizedWorkItemId,
        now,
        ...options,
      }),
    ];
  }

  if (!all) {
    throw new Error("tick requires --all or --work-item.");
  }

  const supervise = dependencies.supervise ?? superviseWorkItem;

  return listRuntimeStates(rootDir)
    .flatMap(({ state }) => {
      if (state.lock?.owner) {
        return [
          createTickResult({
            workItemId: state.work_item_id,
            slice: state.slice,
            action: "skip_locked",
            reason: `locked_by=${state.lock.owner}`,
            wait: state.wait,
            runtime: state,
          }),
        ];
      }

      const resumable = isResumableState(state);
      if (!resumable.resumable) {
        if (resumable.reason === "no_wait_state" || resumable.reason?.startsWith("unsupported_wait_kind=")) {
          return [];
        }
        return [
          createTickResult({
            workItemId: state.work_item_id,
            slice: state.slice,
            action: "noop",
            reason: resumable.reason,
            wait: state.wait ?? null,
            runtime: state,
          }),
        ];
      }

      return [
        supervise({
          rootDir,
          workItemId: state.work_item_id,
          now,
          ...options,
        }),
      ];
    })
    .filter(Boolean);
}
