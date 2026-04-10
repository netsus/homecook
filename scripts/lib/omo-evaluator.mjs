import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";

import { readAutomationSpec, resolveAutonomousSlicePolicy, resolveStageAutomationConfig } from "./omo-automation-spec.mjs";
import {
  isChecklistContractActive,
  readWorkpackChecklistContract,
  resolveChecklistIds,
  resolveOwnedChecklistItems,
  resolveUncheckedChecklistItems,
} from "./omo-checklist-contract.mjs";
import { readRuntimeState } from "./omo-session-runtime.mjs";
import { readStageResult, resolveStageResultPath, validateStageResult } from "./omo-stage-result.mjs";

const EVALUATOR_OUTCOMES = new Set(["pass", "fixable", "blocked"]);

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function ensureStageLabel(stage) {
  if (stage === "backend" || Number(stage) === 2) {
    return {
      stage: "backend",
      stageNumber: 2,
    };
  }

  if (stage === "frontend" || Number(stage) === 4) {
    return {
      stage: "frontend",
      stageNumber: 4,
    };
  }

  throw new Error("stage must be backend|frontend or 2|4.");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function createTimestampSlug(value = new Date().toISOString()) {
  return value.replace(/[:.]/g, "-");
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function addFinding(findings, finding) {
  const normalized = {
    id: ensureNonEmptyString(finding.id, "finding.id"),
    fingerprint: ensureNonEmptyString(
      finding.fingerprint ?? finding.id,
      "finding.fingerprint",
    ),
    category: ensureNonEmptyString(finding.category, "finding.category"),
    severity: ensureNonEmptyString(finding.severity, "finding.severity"),
    message: ensureNonEmptyString(finding.message, "finding.message"),
    evidence_paths: normalizeStringArray(finding.evidence_paths),
    remediation_hint: ensureNonEmptyString(
      finding.remediation_hint ?? "No remediation hint provided.",
      "finding.remediation_hint",
    ),
    owner: ensureNonEmptyString(finding.owner ?? "codex", "finding.owner"),
    fixable: typeof finding.fixable === "boolean" ? finding.fixable : true,
  };

  findings.push(normalized);
}

function resultArtifactDir({ rootDir, workItemId, stage, now }) {
  return resolve(
    rootDir,
    ".artifacts",
    "omo-evaluator",
    `${createTimestampSlug(now)}-${workItemId}-${stage}`,
  );
}

function resolveWorkItem(rootDir, workItemId) {
  const workItemPath = resolve(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`);
  if (!existsSync(workItemPath)) {
    throw new Error(`Tracked workflow-v2 work item not found: ${workItemPath}`);
  }

  return {
    workItemPath,
    workItem: readJson(workItemPath),
  };
}

function resolveSlice({ workItemId, slice }) {
  if (typeof slice === "string" && slice.trim().length > 0) {
    return slice.trim();
  }

  return workItemId;
}

function resolveArtifactDir({ runtimeState, artifactDir }) {
  if (typeof artifactDir === "string" && artifactDir.trim().length > 0) {
    return artifactDir.trim();
  }

  if (
    typeof runtimeState.execution?.artifact_dir === "string" &&
    runtimeState.execution.artifact_dir.trim().length > 0
  ) {
    return runtimeState.execution.artifact_dir.trim();
  }

  if (
    typeof runtimeState.last_artifact_dir === "string" &&
    runtimeState.last_artifact_dir.trim().length > 0
  ) {
    return runtimeState.last_artifact_dir.trim();
  }

  throw new Error("artifactDir could not be resolved for evaluation.");
}

function resolveWorktreePath(runtimeState) {
  if (
    typeof runtimeState.workspace?.path === "string" &&
    runtimeState.workspace.path.trim().length > 0
  ) {
    return runtimeState.workspace.path.trim();
  }

  throw new Error("workspace.path is missing for evaluator execution.");
}

function runCommand(command, cwd, artifactPrefix) {
  const shell = process.env.SHELL ?? "/bin/sh";
  const result = spawnSync(shell, ["-c", command], {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  writeFileSync(`${artifactPrefix}.stdout.log`, result.stdout ?? "");
  writeFileSync(`${artifactPrefix}.stderr.log`, result.stderr ?? "");

  return {
    command,
    exitCode: result.status ?? null,
    ok: result.status === 0 && !result.error,
    stdoutPath: `${artifactPrefix}.stdout.log`,
    stderrPath: `${artifactPrefix}.stderr.log`,
  };
}

function normalizeGitStatusPath(rawPath) {
  const trimmed = rawPath.trim();
  const renameMatch = trimmed.match(/->\s+(.+)$/);
  const candidate = renameMatch ? renameMatch[1].trim() : trimmed;

  if (candidate.startsWith("\"") && candidate.endsWith("\"")) {
    return candidate
      .slice(1, -1)
      .replace(/\\\\/g, "\\")
      .replace(/\\"/g, "\"");
  }

  return candidate;
}

function getChangedFiles(worktreePath) {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: worktreePath,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "git status failed.");
  }

  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => normalizeGitStatusPath(line.slice(3)))
    .filter(Boolean);
}

function resolveClaimedScope(stageResult) {
  const scope = stageResult?.claimed_scope;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    return {
      files: [],
      endpoints: [],
      routes: [],
      states: [],
      invariants: [],
    };
  }

  return {
    files: normalizeStringArray(scope.files),
    endpoints: normalizeStringArray(scope.endpoints),
    routes: normalizeStringArray(scope.routes),
    states: normalizeStringArray(scope.states),
    invariants: normalizeStringArray(scope.invariants),
  };
}

function fileExistsFromWorktree(worktreePath, candidate) {
  const resolved = resolve(worktreePath, candidate);
  return existsSync(resolved);
}

function ensureStageResultMetadata({
  findings,
  stage,
  stageResult,
  stageConfig,
  checklistContract,
  changedFiles,
  worktreePath,
  stageResultPath,
}) {
  const claimedScope = resolveClaimedScope(stageResult);
  const resultChangedFiles = normalizeStringArray(stageResult.changed_files);
  const testsTouched = normalizeStringArray(stageResult.tests_touched);
  const artifactsWritten = normalizeStringArray(stageResult.artifacts_written);
  const checklistUpdates = Array.isArray(stageResult.checklist_updates) ? stageResult.checklist_updates : [];

  if (resultChangedFiles.length === 0) {
    addFinding(findings, {
      id: `${stage}-changed-files-missing`,
      category: "contract",
      severity: "major",
      message: "stage-result is missing changed_files metadata.",
      evidence_paths: [stageResultPath],
      remediation_hint: "Write changed_files in stage-result.json using the actual modified files.",
      owner: "codex",
      fixable: true,
    });
  }

  const missingChangedFiles = changedFiles.filter((filePath) => !resultChangedFiles.includes(filePath));
  if (missingChangedFiles.length > 0) {
    addFinding(findings, {
      id: `${stage}-changed-files-drift`,
      category: "contract",
      severity: "major",
      message: "stage-result.changed_files does not match the current worktree diff.",
      evidence_paths: [stageResultPath],
      remediation_hint: `Include these files in changed_files: ${missingChangedFiles.join(", ")}`,
      owner: "codex",
      fixable: true,
    });
  }

  const unclaimedFiles = changedFiles.filter((filePath) => !claimedScope.files.includes(filePath));
  if (unclaimedFiles.length > 0) {
    addFinding(findings, {
      id: `${stage}-claimed-scope-drift`,
      category: "scope",
      severity: "major",
      message: "Actual changed files are not fully declared in claimed_scope.files.",
      evidence_paths: [stageResultPath],
      remediation_hint: `Add these files to claimed_scope.files: ${unclaimedFiles.join(", ")}`,
      owner: "codex",
      fixable: true,
    });
  }

  if (stage === "backend") {
    for (const endpoint of stageConfig.required_endpoints ?? []) {
      if (!claimedScope.endpoints.includes(endpoint)) {
        addFinding(findings, {
          id: `backend-endpoint-${endpoint}`,
          category: "contract",
          severity: "major",
          message: `Required endpoint is missing from claimed_scope.endpoints: ${endpoint}`,
          evidence_paths: [stageResultPath],
          remediation_hint: `Declare ${endpoint} in claimed_scope.endpoints and ensure the code implements it.`,
          owner: "codex",
          fixable: true,
        });
      }
    }

    for (const invariant of stageConfig.invariants ?? []) {
      if (!claimedScope.invariants.includes(invariant)) {
        addFinding(findings, {
          id: `backend-invariant-${invariant}`,
          category: "policy",
          severity: "major",
          message: `Required backend invariant is missing from claimed_scope.invariants: ${invariant}`,
          evidence_paths: [stageResultPath],
          remediation_hint: `Declare and implement invariant ${invariant}.`,
          owner: "codex",
          fixable: true,
        });
      }
    }

    for (const testTarget of stageConfig.required_test_targets ?? []) {
      if (!testsTouched.includes(testTarget) || !fileExistsFromWorktree(worktreePath, testTarget)) {
        addFinding(findings, {
          id: `backend-test-target-${basename(testTarget)}`,
          category: "tests",
          severity: "major",
          message: `Required backend test target is missing or not declared: ${testTarget}`,
          evidence_paths: [stageResultPath],
          remediation_hint: `Create/update ${testTarget} and list it in tests_touched.`,
          owner: "codex",
          fixable: true,
        });
      }
    }
  }

  if (stage === "frontend") {
    for (const route of stageConfig.required_routes ?? []) {
      if (!claimedScope.routes.includes(route)) {
        addFinding(findings, {
          id: `frontend-route-${route}`,
          category: "ui-contract",
          severity: "major",
          message: `Required frontend route is missing from claimed_scope.routes: ${route}`,
          evidence_paths: [stageResultPath],
          remediation_hint: `Declare ${route} in claimed_scope.routes and ensure the UI flow covers it.`,
          owner: "codex",
          fixable: true,
        });
      }
    }

    for (const state of stageConfig.required_states ?? []) {
      if (!claimedScope.states.includes(state)) {
        addFinding(findings, {
          id: `frontend-state-${state}`,
          category: "ui-state",
          severity: "major",
          message: `Required frontend state is missing from claimed_scope.states: ${state}`,
          evidence_paths: [stageResultPath],
          remediation_hint: `Support ${state} state and declare it in claimed_scope.states.`,
          owner: "codex",
          fixable: true,
        });
      }
    }

    for (const assertion of stageConfig.artifact_assertions ?? []) {
      const matchedArtifact = artifactsWritten.find((artifactPath) => artifactPath.includes(assertion));
      const artifactExists = matchedArtifact
        ? existsSync(resolve(worktreePath, matchedArtifact)) || existsSync(matchedArtifact)
        : false;
      if (!matchedArtifact || !artifactExists) {
        addFinding(findings, {
          id: `frontend-artifact-${assertion}`,
          category: "artifacts",
          severity: "major",
          message: `Required frontend artifact assertion was not satisfied: ${assertion}`,
          evidence_paths: [stageResultPath],
          remediation_hint: `Write artifact evidence for ${assertion} and list it in artifacts_written.`,
          owner: "codex",
          fixable: true,
        });
      }
    }

    const designAuthority = stageConfig.design_authority ?? null;
    if (designAuthority?.authority_required) {
      const reviewedScreenIds = normalizeStringArray(stageResult.reviewed_screen_ids);
      const authorityReportPaths = normalizeStringArray(stageResult.authority_report_paths);
      const evidenceArtifactRefs = normalizeStringArray(stageResult.evidence_artifact_refs);

      const missingScreens = (designAuthority.required_screens ?? []).filter(
        (screenId) => !reviewedScreenIds.includes(screenId),
      );
      if (missingScreens.length > 0) {
        addFinding(findings, {
          id: `frontend-authority-screens-${missingScreens.join("-")}`,
          category: "design-authority",
          severity: "major",
          message: `Authority-required screens are missing from reviewed_screen_ids: ${missingScreens.join(", ")}`,
          evidence_paths: [stageResultPath],
          remediation_hint: "Record every authority-required screen in reviewed_screen_ids.",
          owner: "codex",
          fixable: true,
        });
      }

      if (authorityReportPaths.length === 0) {
        addFinding(findings, {
          id: "frontend-authority-report-missing",
          category: "design-authority",
          severity: "major",
          message: "Authority-required frontend stage is missing authority_report_paths.",
          evidence_paths: [stageResultPath],
          remediation_hint: "Write authority report paths to stage-result.json.",
          owner: "codex",
          fixable: true,
        });
      }

      const missingReports = authorityReportPaths.filter((reportPath) => !fileExistsFromWorktree(worktreePath, reportPath));
      if (missingReports.length > 0) {
        addFinding(findings, {
          id: "frontend-authority-report-files-missing",
          category: "design-authority",
          severity: "major",
          message: `Authority report files are missing: ${missingReports.join(", ")}`,
          evidence_paths: [stageResultPath],
          remediation_hint: "Generate the authority report files and list them in authority_report_paths.",
          owner: "codex",
          fixable: true,
        });
      }

      if (evidenceArtifactRefs.length === 0) {
        addFinding(findings, {
          id: "frontend-authority-evidence-missing",
          category: "design-authority",
          severity: "major",
          message: "Authority-required frontend stage is missing evidence_artifact_refs.",
          evidence_paths: [stageResultPath],
          remediation_hint: "List mobile UX evidence paths in evidence_artifact_refs.",
          owner: "codex",
          fixable: true,
        });
      }
    }
  }

  if (isChecklistContractActive(checklistContract)) {
    const ownedItems = resolveOwnedChecklistItems(checklistContract, stage === "backend" ? 2 : 4);
    const ownedIds = resolveChecklistIds(ownedItems);
    const uncheckedOwnedIds = resolveChecklistIds(resolveUncheckedChecklistItems(ownedItems));
    const updatedIds = normalizeStringArray(checklistUpdates.map((entry) => entry.id));
    const foreignIds = updatedIds.filter((id) => !ownedIds.includes(id));
    const missingIds = ownedIds.filter((id) => !updatedIds.includes(id));

    if (uncheckedOwnedIds.length > 0) {
      addFinding(findings, {
        id: `${stage}-checklist-unchecked`,
        category: "closeout",
        severity: "major",
        message: `Stage-owned checklist items remain unchecked: ${uncheckedOwnedIds.join(", ")}`,
        evidence_paths: [checklistContract.readmePath, checklistContract.acceptancePath],
        remediation_hint: "Check every current-stage checklist item before ready-for-review handoff.",
        owner: "codex",
        fixable: true,
      });
    }

    if (foreignIds.length > 0) {
      addFinding(findings, {
        id: `${stage}-checklist-foreign-ids`,
        category: "closeout",
        severity: "major",
        message: `stage-result.checklist_updates references checklist ids outside the current stage: ${foreignIds.join(", ")}`,
        evidence_paths: [stageResultPath],
        remediation_hint: "Only include checklist ids owned by the current stage in checklist_updates.",
        owner: "codex",
        fixable: true,
      });
    }

    if (missingIds.length > 0) {
      addFinding(findings, {
        id: `${stage}-checklist-missing-ids`,
        category: "closeout",
        severity: "major",
        message: `stage-result.checklist_updates is missing stage-owned checklist ids: ${missingIds.join(", ")}`,
        evidence_paths: [stageResultPath],
        remediation_hint: "List every current-stage checklist id in checklist_updates once it is satisfied.",
        owner: "codex",
        fixable: true,
      });
    }
  }
}

function buildOutcome(findings) {
  if (findings.some((finding) => finding.severity === "blocker" || !finding.fixable || finding.owner === "human")) {
    return "blocked";
  }

  if (findings.length > 0) {
    return "fixable";
  }

  return "pass";
}

function createSummary({ stage, outcome, findings }) {
  if (outcome === "pass") {
    return `${stage} evaluator passed with no findings.`;
  }

  return `${stage} evaluator returned ${outcome} with ${findings.length} finding(s).`;
}

function createRemediationBundle({ artifactDir, result }) {
  if (result.outcome !== "fixable") {
    return {
      inputPath: null,
      promptPath: null,
    };
  }

  const remediationInput = {
    schemaVersion: "1.0",
    workItemId: result.workItemId,
    stage: result.stage,
    findings: result.findings,
    requiredCommands: result.requiredCommands,
    evaluatorResultPath: resolve(artifactDir, "result.json"),
  };
  const remediationPrompt = [
    `# ${result.stage} evaluator remediation`,
    "",
    `- work item: \`${result.workItemId}\``,
    `- outcome: \`${result.outcome}\``,
    `- evaluator result: \`${resolve(artifactDir, "result.json")}\``,
    "",
    "## Required fixes",
    ...result.findings.map((finding) => `- [${finding.severity}] ${finding.message} -> ${finding.remediation_hint}`),
  ].join("\n");

  const inputPath = resolve(artifactDir, "remediation-input.json");
  const promptPath = resolve(artifactDir, "remediation-prompt.md");
  writeFileSync(inputPath, `${JSON.stringify(remediationInput, null, 2)}\n`);
  writeFileSync(promptPath, `${remediationPrompt}\n`);

  return {
    inputPath,
    promptPath,
  };
}

/**
 * @param {{ rootDir?: string; workItemId: string; slice?: string; stage: string | number; artifactDir?: string; now?: string }} [options]
 */
export function evaluateWorkItemStage({
  rootDir = process.cwd(),
  workItemId,
  slice,
  stage,
  artifactDir,
  now = new Date().toISOString(),
} = {}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const { stage: stageLabel, stageNumber } = ensureStageLabel(stage);
  const resolvedSlice = resolveSlice({
    workItemId: normalizedWorkItemId,
    slice,
  });
  const { workItem } = resolveWorkItem(rootDir, normalizedWorkItemId);
  const { automationSpecPath, automationSpec } = readAutomationSpec({
    rootDir,
    slice: resolvedSlice,
    required: true,
  });
  const policy = resolveAutonomousSlicePolicy({
    workItem,
    automationSpec,
  });
  const stageConfig = resolveStageAutomationConfig({
    automationSpec,
    stage: stageNumber,
  });

  if (!stageConfig) {
    throw new Error(`No stage automation config available for stage ${stageNumber}.`);
  }

  const runtimeSnapshot = readRuntimeState({
    rootDir,
    workItemId: normalizedWorkItemId,
    slice: resolvedSlice,
  });
  const worktreePath = resolveWorktreePath(runtimeSnapshot.state);
  const checklistContract = readWorkpackChecklistContract({
    rootDir,
    worktreePath,
    slice: resolvedSlice,
  });
  const executionArtifactDir = resolveArtifactDir({
    runtimeState: runtimeSnapshot.state,
    artifactDir,
  });
  const stageResultPath = resolveStageResultPath(executionArtifactDir);
  const changedFiles = getChangedFiles(worktreePath);
  const stageResult = readStageResult(executionArtifactDir);
  const evaluatorArtifactDir = resultArtifactDir({
    rootDir,
    workItemId: normalizedWorkItemId,
    stage: stageLabel,
    now,
  });
  mkdirSync(evaluatorArtifactDir, { recursive: true });

  const findings = [];
  const subevaluators = [];
  const requiredCommands = [
    ...(stageConfig.verify_commands ?? []),
    ...(stageConfig.external_smokes ?? []),
  ];

  if (!policy.autonomous) {
    addFinding(findings, {
      id: `${stageLabel}-manual-policy`,
      category: "policy",
      severity: "blocker",
      message: `Slice is not eligible for autonomous ${stageLabel} execution.`,
      evidence_paths: [automationSpecPath],
      remediation_hint: "Use the manual review path or lower the slice risk before enabling autonomous execution.",
      owner: "human",
      fixable: false,
    });
  }

  if (policy.mergeEligible && (stageConfig.external_smokes ?? []).length === 0) {
    addFinding(findings, {
      id: `${stageLabel}-external-smokes-missing`,
      category: "policy",
      severity: "blocker",
      message: `Autonomous ${stageLabel} execution requires at least one external smoke command.`,
      evidence_paths: [automationSpecPath],
      remediation_hint: "Declare at least one external smoke command in automation-spec.json before enabling autonomous merge.",
      owner: "human",
      fixable: false,
    });
  }

  if (isChecklistContractActive(checklistContract) && checklistContract.errors.length > 0) {
    for (const error of checklistContract.errors) {
      addFinding(findings, {
        id: `${stageLabel}-checklist-contract-${findings.length + 1}`,
        category: "contract",
        severity: "blocker",
        message: error.message,
        evidence_paths: [error.path],
        remediation_hint: "Fix the workpack checklist metadata contract before rerunning automation.",
        owner: "human",
        fixable: false,
      });
    }
  }

  if (!stageResult) {
    addFinding(findings, {
      id: `${stageLabel}-stage-result-missing`,
      category: "contract",
      severity: "blocker",
      message: "stage-result.json is missing for evaluator execution.",
      evidence_paths: [stageResultPath],
      remediation_hint: "Write a valid stage-result.json before the stage exits.",
      owner: "human",
      fixable: false,
    });
  } else {
    try {
      validateStageResult(stageNumber, stageResult, {
        strictExtendedContract: isChecklistContractActive(checklistContract),
      });
    } catch (error) {
      addFinding(findings, {
        id: `${stageLabel}-stage-result-invalid`,
        category: "contract",
        severity: "blocker",
        message: error.message,
        evidence_paths: [stageResultPath],
        remediation_hint: "Write stage-result.json in the expected contract shape.",
        owner: "human",
        fixable: false,
      });
    }
  }

  if (stageResult && findings.length === 0) {
    ensureStageResultMetadata({
      findings,
      stage: stageLabel,
      stageResult,
      stageConfig,
      checklistContract,
      changedFiles,
      worktreePath,
      stageResultPath,
    });
  }

  const commandResults = [];
  for (const [index, command] of requiredCommands.entries()) {
    const prefix = resolve(evaluatorArtifactDir, `command-${index + 1}`);
    const commandResult = runCommand(command, worktreePath, prefix);
    commandResults.push(commandResult);
  }

  for (const [index, commandResult] of commandResults.entries()) {
    const isExternalSmoke = index >= (stageConfig.verify_commands ?? []).length;
    if (!commandResult.ok) {
      addFinding(findings, {
        id: `${stageLabel}-${isExternalSmoke ? "external-smoke" : "verify"}-${index + 1}`,
        category: isExternalSmoke ? "external-smoke" : "verification",
        severity: isExternalSmoke ? "blocker" : "major",
        message: `${isExternalSmoke ? "External smoke" : "Verify command"} failed: ${commandResult.command}`,
        evidence_paths: [commandResult.stdoutPath, commandResult.stderrPath],
        remediation_hint: isExternalSmoke
          ? "Fix the environment or external dependency before retrying automation."
          : "Fix the failing deterministic check and rerun the stage.",
        owner: isExternalSmoke ? "human" : "codex",
        fixable: !isExternalSmoke,
      });
    }
  }

  subevaluators.push({
    id: "stage-result-contract",
    ok: !findings.some((finding) => finding.category === "contract"),
    details: stageResultPath,
  });
  subevaluators.push({
    id: "worktree-hygiene",
    ok: changedFiles.length > 0,
    details: changedFiles,
  });
  subevaluators.push({
    id: "deterministic-commands",
    ok: commandResults.every((entry) => entry.ok),
    details: commandResults,
  });

  const outcome = buildOutcome(findings);
  if (!EVALUATOR_OUTCOMES.has(outcome)) {
    throw new Error(`Unsupported evaluator outcome: ${outcome}`);
  }

  const severity_counts = {
    critical: findings.filter((f) => f.severity === "blocker").length,
    major: findings.filter((f) => f.severity === "major").length,
    minor: findings.filter((f) => f.severity === "minor").length,
    total: findings.length,
  };

  const result = {
    schemaVersion: "1.0",
    workItemId: normalizedWorkItemId,
    slice: resolvedSlice,
    stage: stageLabel,
    outcome,
    mergeEligible: outcome === "pass" && policy.mergeEligible,
    summary: createSummary({
      stage: stageLabel,
      outcome,
      findings,
    }),
    severity_counts,
    subevaluators,
    findings,
    requiredCommands,
    artifacts: {
      automationSpecPath,
      worktreePath,
      executionArtifactDir,
      stageResultPath,
      commandResults,
    },
    generatedAt: new Date(now).toISOString(),
  };

  writeFileSync(resolve(evaluatorArtifactDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  const remediation = createRemediationBundle({
    artifactDir: evaluatorArtifactDir,
    result,
  });

  return {
    ...result,
    artifactDir: evaluatorArtifactDir,
    remediation,
  };
}
