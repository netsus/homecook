import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  findEmptyPrSections,
  findInvalidWorkflowV2Refs,
  findMissingPrSections,
} from "./git-policy.mjs";
import {
  readAutomationSpec,
  updateAutomationSpecAuthorityReportPaths,
} from "./omo-automation-spec.mjs";
import {
  applyBookkeepingRepairPlan,
  evaluateBookkeepingInvariant,
  readWorkpackDesignAuthority,
  updateWorkpackDesignAuthorityStatus,
} from "./omo-bookkeeping.mjs";
import { createGithubAutomationClient } from "./omo-github.mjs";
import {
  applyChecklistCheckedState,
  readWorkpackChecklistContract,
  resolveUncheckedChecklistItems,
} from "./omo-checklist-contract.mjs";
import { syncWorkflowV2Status } from "./omo-lite-supervisor.mjs";
import { resolveAllowedCloseoutAbsolutePaths } from "./omo-closeout-policy.mjs";
import { readRuntimeState, setPullRequestRef, setWaitState, writeRuntimeState } from "./omo-session-runtime.mjs";
import { validateAuthorityEvidencePresence } from "./validate-authority-evidence-presence.mjs";
import { validateCloseoutSync } from "./validate-closeout-sync.mjs";
import { validateExploratoryQaEvidence } from "./validate-exploratory-qa-evidence.mjs";
import { validateRealSmokePresence } from "./validate-real-smoke-presence.mjs";
import { validateSourceOfTruthSync } from "./validate-source-of-truth-sync.mjs";
import { commitWorktreeChanges, getWorktreeHeadSha, pushWorktreeBranch } from "./omo-worktree.mjs";

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

function runGit({ cwd, args }) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(stderr.length > 0 ? stderr : `git ${args.join(" ")} failed.`);
  }

  return (result.stdout ?? "").trim();
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

export function summarizeValidationErrors(results) {
  const normalizedResults = Array.isArray(results) ? results : [];
  return normalizedResults
    .flatMap((result) =>
      (Array.isArray(result?.errors) ? result.errors : []).map((error) => ({
        name: result?.name ?? "validation",
        path: error.path,
        message: error.message,
      })),
    );
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  );
}

function isPostMergeCloseoutCandidate({ runtime, invariant }) {
  if (invariant?.outcome === "repairable_post_merge") {
    return true;
  }

  if (invariant?.outcome !== "ok") {
    return false;
  }

  return (
    runtime?.phase === "done" ||
    runtime?.phase === "merge_pending" ||
    runtime?.status?.lifecycle === "merged" ||
    Number(runtime?.last_completed_stage) >= 6 ||
    Number(runtime?.active_stage) >= 6 ||
    Boolean(runtime?.prs?.closeout?.url)
  );
}

function collectAuthorityReportPaths({ runtime, automationSpec }) {
  return uniqueStrings([
    ...(automationSpec?.frontend?.design_authority?.authority_report_paths ?? []),
    ...(runtime?.design_authority?.authority_report_paths ?? []),
    ...(runtime?.last_review?.frontend?.authority_report_paths ?? []),
  ]);
}

function validateAuthorityReportFiles({ worktreePath, reportPaths }) {
  const normalizedPaths = uniqueStrings(reportPaths);
  const missingPaths = [];
  const nonPassingPaths = [];

  for (const reportPath of normalizedPaths) {
    const fullPath = resolve(worktreePath, reportPath);
    if (!existsSync(fullPath)) {
      missingPaths.push(reportPath);
      continue;
    }

    if (!/verdict:\s*`?pass`?/i.test(readFileSync(fullPath, "utf8"))) {
      nonPassingPaths.push(reportPath);
    }
  }

  return {
    missingPaths,
    nonPassingPaths,
  };
}

function buildCloseoutRepairIssue(kind, filePath, actual, expected) {
  return {
    kind,
    file_path: filePath,
    actual,
    expected,
  };
}

export function evaluateCloseoutRepairPlan({
  worktreePath,
  slice,
  runtime,
}) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const contract = readWorkpackChecklistContract({
    worktreePath,
    slice: normalizedSlice,
  });
  const { automationSpec, automationSpecPath } = readAutomationSpec({
    rootDir: worktreePath,
    slice: normalizedSlice,
    required: false,
  });
  const authority = readWorkpackDesignAuthority({
    worktreePath,
    slice: normalizedSlice,
  });
  const repairActions = [];
  const issues = [];
  const blockedErrors = [];

  if (contract.errors.length > 0) {
    blockedErrors.push(
      ...contract.errors.map((error) => ({
        path: error.path,
        message: error.message,
      })),
    );
  } else {
    const closeoutItems = resolveUncheckedChecklistItems(
      (contract.items ?? []).filter((item) => item && item.manualOnly !== true),
    );

    if (closeoutItems.length > 0) {
      repairActions.push({
        kind: "checklist_closeout",
        items: closeoutItems,
      });
      issues.push(
        buildCloseoutRepairIssue(
          "closeout_checklist",
          `${normalizedSlice}/checklists`,
          `${closeoutItems.length} open`,
          "all non-manual items checked",
        ),
      );
    }
  }

  const designAuthorityConfig = automationSpec?.frontend?.design_authority ?? null;
  if (designAuthorityConfig?.authority_required) {
    if (authority.missing) {
      blockedErrors.push({
        path: authority.filePath,
        message: `Authority-required slice '${normalizedSlice}' must define README Design Authority section.`,
      });
    } else {
      const reportPaths = collectAuthorityReportPaths({
        runtime,
        automationSpec,
      });
      if (reportPaths.length === 0) {
        blockedErrors.push({
          path: automationSpecPath,
          message: `Authority-required slice '${normalizedSlice}' is missing authority report paths and cannot be auto-repaired safely.`,
        });
      } else {
        const reportValidation = validateAuthorityReportFiles({
          worktreePath,
          reportPaths,
        });
        if (reportValidation.missingPaths.length > 0) {
          blockedErrors.push({
            path: authority.filePath,
            message: `Authority-required slice '${normalizedSlice}' is missing authority reports: ${reportValidation.missingPaths.join(", ")}.`,
          });
        }
        if (reportValidation.nonPassingPaths.length > 0) {
          blockedErrors.push({
            path: authority.filePath,
            message: `Authority-required slice '${normalizedSlice}' requires final authority verdict 'pass' in: ${reportValidation.nonPassingPaths.join(", ")}.`,
          });
        }

        if (blockedErrors.length === 0) {
          const currentReportPaths = uniqueStrings(
            automationSpec?.frontend?.design_authority?.authority_report_paths ?? [],
          );
          if (currentReportPaths.length === 0) {
            repairActions.push({
              kind: "automation_spec_authority_paths",
              authorityReportPaths: reportPaths,
            });
            issues.push(
              buildCloseoutRepairIssue(
                "automation_spec_authority_paths",
                automationSpecPath,
                "missing",
                reportPaths.join(", "),
              ),
            );
          }

          if (authority.authorityStatus !== "reviewed") {
            repairActions.push({
              kind: "design_authority_status",
              targetStatus: "reviewed",
            });
            issues.push(
              buildCloseoutRepairIssue(
                "design_authority_status",
                authority.filePath,
                authority.authorityStatus ?? "missing",
                "reviewed",
              ),
            );
          }
        }
      }
    }
  }

  return {
    blockedErrors,
    issues,
    repairActions,
  };
}

export function applyCloseoutRepairPlan({
  worktreePath,
  slice,
  repairActions,
}) {
  const normalizedActions = Array.isArray(repairActions) ? repairActions : [];
  const changedFiles = new Set();

  for (const action of normalizedActions) {
    if (action?.kind === "checklist_closeout") {
      for (const filePath of applyChecklistCheckedState({
        items: action.items,
        checked: true,
      })) {
        changedFiles.add(filePath);
      }
      continue;
    }

    if (action?.kind === "design_authority_status") {
      const result = updateWorkpackDesignAuthorityStatus({
        worktreePath,
        slice,
        targetStatus: action.targetStatus,
      });
      if (result.changed && result.filePath) {
        changedFiles.add(result.filePath);
      }
      continue;
    }

    if (action?.kind === "automation_spec_authority_paths") {
      const result = updateAutomationSpecAuthorityReportPaths({
        rootDir: worktreePath,
        slice,
        authorityReportPaths: action.authorityReportPaths,
      });
      if (result.changed && result.filePath) {
        changedFiles.add(result.filePath);
      }
    }
  }

  return {
    changed: changedFiles.size > 0,
    changedFiles: [...changedFiles],
  };
}

function formatCloseoutIssueSummary(issue) {
  const kind = issue?.kind ?? "closeout";
  const actual = issue?.actual ?? "missing";
  const expected = issue?.expected ?? "aligned";

  if (kind === "closeout_checklist") {
    return `- checklist closeout: \`${actual}\` -> \`${expected}\``;
  }

  if (kind === "automation_spec_authority_paths") {
    return `- authority report paths: \`${actual}\` -> \`${expected}\``;
  }

  return `- ${kind}: \`${actual}\` -> \`${expected}\``;
}

function buildExploratoryQaEvidence({
  runtime,
  uiRisk,
}) {
  const frontendPrUrl = runtime?.prs?.frontend?.url ?? null;

  if (["new-screen", "high-risk", "anchor-extension"].includes(uiRisk)) {
    if (typeof frontendPrUrl !== "string" || frontendPrUrl.trim().length === 0) {
      throw new Error(
        `Closeout reconcile requires a merged frontend PR reference for exploratory QA evidence on ui_risk '${uiRisk}'.`,
      );
    }

    return {
      exploratoryQa: `merged frontend PR ${frontendPrUrl}에서 이미 실행됨`,
      qaEval: `merged frontend PR ${frontendPrUrl}에서 이미 기록됨`,
      artifactPaths: `${frontendPrUrl} 의 QA Evidence 섹션에 기록된 exploratory-report.json, eval-result.json 참고`,
    };
  }

  if (uiRisk === "low-risk") {
    return {
      exploratoryQa: "N/A (low-risk UI drift repair only; exploratory QA skip rationale inherited)",
      qaEval: "N/A (exploratory QA skipped with same rationale)",
      artifactPaths: "N/A (no new exploratory-report.json or eval-result.json is created for docs-only closeout repair)",
    };
  }

  return {
    exploratoryQa: "N/A (exploratory QA not required for this closeout repair)",
    qaEval: "N/A (qa eval not required for this closeout repair)",
    artifactPaths: "N/A (closeout repair does not create exploratory-report.json or eval-result.json)",
  };
}

function resolveCloseoutBranch(slice) {
  return `docs/omo-closeout-${ensureNonEmptyString(slice, "slice")}`;
}

function resolveCloseoutWorktreePath({ rootDir, slice, now }) {
  return resolve(
    rootDir,
    ".artifacts",
    "tmp",
    `omo-closeout-${ensureNonEmptyString(slice, "slice")}-${formatTimestampSlug(now)}`,
  );
}

function remoteBranchExists({ rootDir, branch }) {
  const result = spawnSync("git", ["ls-remote", "--heads", "origin", branch], {
    cwd: rootDir,
    encoding: "utf8",
  });

  return result.status === 0 && typeof result.stdout === "string" && result.stdout.trim().length > 0;
}

function prepareCloseoutWorktree({
  rootDir,
  slice,
  now,
}) {
  const branch = resolveCloseoutBranch(slice);
  const worktreePath = resolveCloseoutWorktreePath({
    rootDir,
    slice,
    now,
  });
  const hasRemoteBranch = remoteBranchExists({
    rootDir,
    branch,
  });

  rmSync(worktreePath, { recursive: true, force: true });
  mkdirSync(resolve(rootDir, ".artifacts", "tmp"), { recursive: true });
  runGit({
    cwd: rootDir,
    args: ["fetch", "origin", "master"],
  });

  if (hasRemoteBranch) {
    runGit({
      cwd: rootDir,
      args: ["fetch", "origin", branch],
    });
    runGit({
      cwd: rootDir,
      args: ["worktree", "add", worktreePath, `origin/${branch}`],
    });
    runGit({
      cwd: worktreePath,
      args: ["checkout", branch],
    });
  } else {
    runGit({
      cwd: rootDir,
      args: ["worktree", "add", "--detach", worktreePath, "origin/master"],
    });
    runGit({
      cwd: worktreePath,
      args: ["checkout", "-b", branch, "origin/master"],
    });
  }

  return {
    branch,
    worktreePath,
  };
}

function cleanupCloseoutWorktree({ rootDir, worktreePath }) {
  if (typeof worktreePath !== "string" || worktreePath.trim().length === 0) {
    return;
  }

  try {
    runGit({
      cwd: rootDir,
      args: ["worktree", "remove", "--force", worktreePath],
    });
  } catch {
    rmSync(worktreePath, { recursive: true, force: true });
  }
}

function buildCloseoutPullRequestBody({
  workItemId,
  slice,
  invariant,
  closeoutIssues = [],
  runtime,
  uiRisk,
  requiresAuthorityEvidence = false,
  requiresRealSmoke = false,
}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const summaryLines = [
    "- OMO bookkeeping drift를 복구하기 위한 closeout PR입니다.",
    ...[...(invariant?.issues ?? []), ...closeoutIssues].map((issue) => formatCloseoutIssueSummary(issue)),
  ];
  const qaEvidence = buildExploratoryQaEvidence({
    runtime,
    uiRisk,
  });
  const deterministicChecks = [
    "`pnpm validate:omo-bookkeeping`",
    "`pnpm validate:closeout-sync`",
    "`pnpm validate:source-of-truth-sync`",
    "`pnpm validate:exploratory-qa-evidence`",
    ...(requiresAuthorityEvidence ? ["`pnpm validate:authority-evidence-presence`"] : []),
    ...(requiresRealSmoke ? ["`pnpm validate:real-smoke-presence`"] : []),
  ].join(", ");
  const additionalValidationNotes = [
    ...(requiresAuthorityEvidence ? ["authority evidence"] : []),
    ...(requiresRealSmoke ? ["source PR `Actual Verification` smoke evidence"] : []),
    "PR body template",
    "closeout sync",
    "source-of-truth",
    "exploratory evidence",
  ].join(", ");

  return [
    "## Summary",
    summaryLines.join("\n"),
    "",
    "## Change Type",
    "- [ ] `product-backend`",
    "- [ ] `product-frontend`",
    "- [ ] `docs-governance`",
    "- [x] `low-risk docs/config`",
    "- 선택 이유: merged slice closeout bookkeeping/evidence metadata만 정렬하는 docs-only repair입니다.",
    "",
    "## Workpack / Slice",
    `- 관련 workpack: docs/workpacks/${normalizedSlice}/`,
    `- workflow v2 work item: \`.workflow-v2/work-items/${normalizedWorkItemId}.json\``,
    "- 변경 범위: `docs/workpacks/README.md`, target workpack README/acceptance/automation-spec closeout metadata",
    `- 변경 유형 기준 required checks: ${deterministicChecks}`,
    "",
    "## Test Plan",
    `- 실행한 검증: ${deterministicChecks}`,
    "- 생략 또는 `N/A` 처리한 검증: `pnpm verify:backend`, `pnpm verify:frontend`, E2E, Lighthouse",
    "- 생략 또는 `N/A` 근거: merged slice의 docs-only closeout repair라 targeted validator bundle만 재실행합니다.",
    `- 추가 검증: closeout PR 생성 전 internal 6.5 preflight로 ${additionalValidationNotes}를 함께 재검증했습니다.`,
    "",
    "## QA Evidence",
    `- deterministic gates: ${deterministicChecks}`,
    `- exploratory QA: ${qaEvidence.exploratoryQa}`,
    `- qa eval: ${qaEvidence.qaEval}`,
    `- 아티팩트 / 보고서 경로: ${qaEvidence.artifactPaths}`,
    "",
    "## Actual Verification",
    "- verifier: OMO supervisor",
    `- environment: closeout worktree for \`docs/omo-closeout-${normalizedSlice}\``,
    "- scope: merged slice bookkeeping/evidence metadata reconcile",
    "- result: closeout PR 생성 전 validator bundle을 통과한 docs-only repair만 제출합니다.",
    "- 남은 manual/live 확인: 없음",
    "",
    "## Closeout Sync",
    "- roadmap status: merged 기준으로 재정렬",
    "- README Delivery Checklist: existing merged closeout state 유지 또는 공식 상태와 재정렬",
    "- acceptance: existing merged closeout state 유지",
    "- Design Status: merged closeout 기준으로 유지 또는 재정렬",
    "- 남은 Manual Only / follow-up: 없음",
    "",
    "## Merge Gate",
    "- current head SHA: closeout PR 생성 후 GitHub current head 기준으로 추적",
    "- started PR checks: closeout PR에서 시작된 전체 checks를 기준으로 추적",
    "- all checks completed green: 아니오 (PR 생성 직후 pending expected)",
    "- pending / failed / rerun checks: supervisor가 `wait.kind=ci`에서 추적",
    "",
    "## Docs Impact",
    "- [x] 공식 문서 영향 없음",
    "- [ ] 공식 문서 업데이트 필요",
    "- 영향 내용: merged slice bookkeeping/evidence metadata만 정렬합니다.",
    "",
    "## Security Review",
    "- 인증/인가 영향: 없음",
    "- 입력 검증 영향: 없음",
    "- 비밀정보/권한 경계 영향: 없음",
    "- `N/A` 또는 영향 없음 근거: docs-only closeout repair입니다.",
    "",
    "## Performance",
    "- UI 또는 fetch 변경 여부: 없음",
    "- Lighthouse 또는 수동 점검 근거: `N/A`",
    "- `N/A` 또는 영향 없음 근거: runtime UI/fetch 변경이 없습니다.",
    "",
    "## Design / Accessibility",
    "- 디자인 시스템 영향: 없음",
    "- loading / empty / error / read-only 확인: `N/A`",
    "- `N/A` 또는 영향 없음 근거: docs-only closeout repair이며, exploratory evidence는 merged frontend PR evidence를 참조합니다.",
    "",
    "## Breaking Changes",
    "- [x] 없음",
    "- [ ] 있음",
    "- 설명: 없음",
  ].join("\n");
}

function assertCloseoutPullRequestBodyValid(prBody) {
  const missing = findMissingPrSections(prBody);
  const empty = findEmptyPrSections(prBody);
  const invalidRefs = findInvalidWorkflowV2Refs(prBody);
  const errors = [];

  for (const section of missing) {
    errors.push({
      path: `PR_BODY:${section}`,
      message: "Missing required PR section.",
    });
  }

  for (const section of empty) {
    errors.push({
      path: `PR_BODY:${section}`,
      message: "Required PR section is empty.",
    });
  }

  for (const ref of invalidRefs) {
    errors.push({
      path: "PR_BODY:## Workpack / Slice",
      message: `Invalid workflow v2 work item reference: ${ref}`,
    });
  }

  return errors;
}

export function collectInternalCloseoutValidationErrors({
  worktreePath,
  slice = undefined,
  branch = undefined,
  prBody = undefined,
  sourcePrBody = undefined,
  includePrBodyValidation = false,
}) {
  const resolvedBranch =
    typeof branch === "string" && branch.trim().length > 0
      ? branch.trim()
      : typeof slice === "string" && slice.trim().length > 0
        ? `docs/omo-closeout-${slice.trim()}`
        : "";
  const env = {
    ...process.env,
    PR_IS_DRAFT: "false",
  };
  if (resolvedBranch.length > 0) {
    env.BRANCH_NAME = resolvedBranch;
  }
  if (typeof prBody === "string" && prBody.trim().length > 0) {
    env.PR_BODY = prBody;
  }
  if (typeof sourcePrBody === "string" && sourcePrBody.trim().length > 0) {
    env.SOURCE_PR_BODY = sourcePrBody;
  }

  return [
    ...(includePrBodyValidation && typeof prBody === "string"
      ? assertCloseoutPullRequestBodyValid(prBody)
      : []),
    ...summarizeValidationErrors(
      validateCloseoutSync({
        rootDir: worktreePath,
        env,
      }),
    ),
    ...summarizeValidationErrors(
      validateSourceOfTruthSync({
        rootDir: worktreePath,
      }),
    ),
    ...summarizeValidationErrors(
      validateExploratoryQaEvidence({
        rootDir: worktreePath,
        env,
      }),
    ),
    ...summarizeValidationErrors(
      validateAuthorityEvidencePresence({
        rootDir: worktreePath,
        env,
      }),
    ),
    ...summarizeValidationErrors(
      validateRealSmokePresence({
        rootDir: worktreePath,
        env,
      }),
    ),
  ];
}

function assertInternalCloseoutPreflight({
  worktreePath,
  branch,
  prBody,
  sourcePrBody,
}) {
  const errors = collectInternalCloseoutValidationErrors({
    worktreePath,
    branch,
    prBody,
    sourcePrBody,
    includePrBodyValidation: true,
  });

  if (errors.length === 0) {
    return;
  }

  throw new Error(
    [
      "internal 6.5 closeout_reconcile preflight failed:",
      ...errors.map((error) => `- ${error.name ?? "validation"} ${error.path}: ${error.message}`),
    ].join("\n"),
  );
}

export function assertDocsOnlyCloseoutChanges({ slice, changedFiles, worktreePath }) {
  const allowed = resolveAllowedCloseoutAbsolutePaths({
    worktreePath,
    slice,
  });

  const invalid = changedFiles.filter((filePath) => !allowed.has(filePath));
  if (invalid.length > 0) {
    throw new Error(`Closeout repair must be docs-only. Invalid files: ${invalid.join(", ")}`);
  }
}

/**
 * @param {{
 *   rootDir?: string,
 *   workItemId: string,
 *   slice?: string,
 *   ghBin?: string,
 *   now?: string,
 *   environment?: Record<string, string>,
 * }} [options]
 */
export function reconcileWorkItemBookkeeping({
  rootDir = process.cwd(),
  workItemId,
  slice = undefined,
  ghBin = "gh",
  now = new Date().toISOString(),
  environment = undefined,
} = {}) {
  const normalizedWorkItemId = ensureNonEmptyString(workItemId, "workItemId");
  const runtime = readRuntimeState({
    rootDir,
    workItemId: normalizedWorkItemId,
    slice,
  }).state;
  const resolvedSlice =
    typeof slice === "string" && slice.trim().length > 0
      ? slice.trim()
      : runtime.slice ?? normalizedWorkItemId;
  const { automationSpec } = readAutomationSpec({
    rootDir,
    slice: resolvedSlice,
    required: false,
  });
  const uiRisk = automationSpec?.frontend?.design_authority?.ui_risk ?? "not-required";
  const requiresAuthorityEvidence = automationSpec?.frontend?.design_authority?.authority_required === true;
  const requiresRealSmoke = Array.isArray(automationSpec?.external_smokes) && automationSpec.external_smokes.length > 0;
  const invariant = evaluateBookkeepingInvariant({
    rootDir,
    workItemId: normalizedWorkItemId,
    slice: resolvedSlice,
    runtimeState: runtime,
  });

  if (!isPostMergeCloseoutCandidate({ runtime, invariant })) {
    if (invariant.outcome === "ok") {
      return {
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        action: "noop",
        reason: "bookkeeping_aligned",
        invariant,
        runtime,
      };
    }

    throw new Error(`Bookkeeping drift is not safely repairable: ${invariant.reason ?? invariant.outcome}`);
  }

  if (invariant.outcome === "ok") {
    const closeoutPlan = evaluateCloseoutRepairPlan({
      worktreePath: rootDir,
      slice: resolvedSlice,
      runtime,
    });
    if (closeoutPlan.blockedErrors.length > 0) {
      throw new Error(
        [
          "Closeout drift is not safely repairable and requires a separate docs-governance path:",
          ...closeoutPlan.blockedErrors.map((error) => `- ${error.path}: ${error.message}`),
        ].join("\n"),
      );
    }

    if (closeoutPlan.repairActions.length === 0) {
      return {
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        action: "noop",
        reason: "bookkeeping_aligned",
        invariant,
        runtime,
      };
    }
  }

  const github = createGithubAutomationClient({
    rootDir,
    ghBin,
    environment,
  });
  github.assertAuth();
  const smokeEvidencePrUrl =
    runtime?.prs?.frontend?.url ??
    runtime?.prs?.backend?.url ??
    null;
  const sourcePrBody =
    typeof github.getPullRequestBody === "function" &&
    typeof smokeEvidencePrUrl === "string" &&
    smokeEvidencePrUrl.trim().length > 0
      ? github.getPullRequestBody({
          prRef: smokeEvidencePrUrl,
        })
      : null;

  const closeoutWorktree = prepareCloseoutWorktree({
    rootDir,
    slice: resolvedSlice,
    now,
  });

  try {
    const worktreeInvariant = evaluateBookkeepingInvariant({
      rootDir,
      workItemId: normalizedWorkItemId,
      slice: resolvedSlice,
      runtimeState: runtime,
      worktreePath: closeoutWorktree.worktreePath,
    });
    if (worktreeInvariant.outcome !== "repairable_post_merge" && worktreeInvariant.outcome !== "ok") {
      throw new Error(`Closeout worktree is not in a safe repair state: ${worktreeInvariant.reason ?? worktreeInvariant.outcome}`);
    }
    const closeoutPlan = evaluateCloseoutRepairPlan({
      worktreePath: closeoutWorktree.worktreePath,
      slice: resolvedSlice,
      runtime,
    });
    if (closeoutPlan.blockedErrors.length > 0) {
      throw new Error(
        [
          "Closeout drift is not safely repairable and requires a separate docs-governance path:",
          ...closeoutPlan.blockedErrors.map((error) => `- ${error.path}: ${error.message}`),
        ].join("\n"),
      );
    }

    const bookkeepingRepair = applyBookkeepingRepairPlan({
      worktreePath: closeoutWorktree.worktreePath,
      slice: resolvedSlice,
      repairActions: worktreeInvariant.repairActions,
    });
    const closeoutRepair = applyCloseoutRepairPlan({
      worktreePath: closeoutWorktree.worktreePath,
      slice: resolvedSlice,
      repairActions: closeoutPlan.repairActions,
    });
    const repair = {
      changed: bookkeepingRepair.changed || closeoutRepair.changed,
      changedFiles: uniqueStrings([
        ...bookkeepingRepair.changedFiles,
        ...closeoutRepair.changedFiles,
      ]),
    };
    assertDocsOnlyCloseoutChanges({
      slice: resolvedSlice,
      changedFiles: repair.changedFiles,
      worktreePath: closeoutWorktree.worktreePath,
    });

    if (repair.changed) {
      const prBody = buildCloseoutPullRequestBody({
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        invariant: worktreeInvariant,
        closeoutIssues: closeoutPlan.issues,
        runtime,
        uiRisk,
        requiresAuthorityEvidence,
        requiresRealSmoke,
      });
      assertInternalCloseoutPreflight({
        worktreePath: closeoutWorktree.worktreePath,
        branch: closeoutWorktree.branch,
        prBody,
        sourcePrBody,
      });

      commitWorktreeChanges({
        worktreePath: closeoutWorktree.worktreePath,
        subject: `docs(workpacks): reconcile ${resolvedSlice} bookkeeping drift`,
        body: "OMO closeout PR이 공식 roadmap/workpack 상태를 merged 결과와 정렬합니다.",
      });
      const headSha = getWorktreeHeadSha({
        worktreePath: closeoutWorktree.worktreePath,
      });
      pushWorktreeBranch({
        worktreePath: closeoutWorktree.worktreePath,
        branch: closeoutWorktree.branch,
      });

      const pr = github.createPullRequest({
        base: "master",
        head: closeoutWorktree.branch,
        title: `docs(workpacks): reconcile ${resolvedSlice} bookkeeping drift`,
        body: prBody,
        draft: false,
        workItemId: normalizedWorkItemId,
      });
      const checks = github.getRequiredChecks({
        prRef: pr.url,
      });

      const nextRuntime = writeRuntimeState({
        rootDir,
        workItemId: normalizedWorkItemId,
        state: setWaitState({
          state: setPullRequestRef({
            state: runtime,
            role: "closeout",
            number: pr.number,
            url: pr.url,
            draft: pr.draft,
            branch: closeoutWorktree.branch,
            headSha,
            updatedAt: now,
          }),
          kind: "ci",
          prRole: "closeout",
          stage: 6,
          headSha,
          updatedAt: now,
        }),
      }).state;

      syncWorkflowV2Status({
        rootDir,
        workItemId: normalizedWorkItemId,
        patch: {
          pr_path: pr.url,
          lifecycle: "ready_for_review",
          approval_state: "dual_approved",
          verification_status: bucketToVerification(checks.bucket),
          notes: `wait_kind=ci pr_role=closeout stage=6 closeout_pr=${pr.url} closeout_reconcile=pass`,
        },
        updatedAt: now,
      });

      return {
        workItemId: normalizedWorkItemId,
        slice: resolvedSlice,
        action: "open_closeout_pr",
        pr,
        checks,
        invariant: worktreeInvariant,
        runtime: nextRuntime,
        branch: closeoutWorktree.branch,
        worktreePath: closeoutWorktree.worktreePath,
      };
    }

    throw new Error("Closeout reconcile produced no repairable docs changes.");
  } finally {
    cleanupCloseoutWorktree({
      rootDir,
      worktreePath: closeoutWorktree.worktreePath,
    });
  }
}
