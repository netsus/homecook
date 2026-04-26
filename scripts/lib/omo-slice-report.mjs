import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const STAGE_LABELS = {
  1: "1 docs",
  2: "2 backend",
  3: "3 backend review",
  4: "4 frontend",
  5: "5 design review",
  6: "6 closeout",
};

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function parseDispatchTimestamp(slug) {
  const match = slug.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!match) {
    return null;
  }

  const [, date, hour, minute, second, millis] = match;
  const parsed = new Date(`${date}T${hour}:${minute}:${second}.${millis}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseIsoTimestamp(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatKst(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute}`;
}

function formatMinutes(minutes) {
  return `${(Number.isFinite(minutes) ? minutes : 0).toFixed(1)}분`;
}

function escapeTableCell(value) {
  return String(value ?? "-")
    .replaceAll("|", "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveReportPath(rootDir, workItemId) {
  return resolve(rootDir, "docs", "workpacks", workItemId, "omo-report.md");
}

function extractPullRequestNumber(pr) {
  if (Number.isInteger(pr?.number)) {
    return `#${pr.number}`;
  }

  const match = typeof pr?.url === "string" ? pr.url.match(/\/pull\/(\d+)/) : null;
  return match ? `#${match[1]}` : "-";
}

function resolveFinalPullRequest(runtime) {
  const prs = runtime?.prs ?? {};
  return [prs.closeout, prs.frontend, prs.backend, prs.docs].find((pr) => pr?.url || pr?.number) ?? null;
}

function readTrackedStatus(rootDir, workItemId) {
  const status = readJsonIfExists(resolve(rootDir, ".workflow-v2", "status.json"));
  const item = Array.isArray(status?.items)
    ? status.items.find((candidate) => candidate?.id === workItemId)
    : null;

  return item ?? null;
}

function describeFinalStatus({ rootDir, workItemId, runtime }) {
  const statusItem = readTrackedStatus(rootDir, workItemId);
  const lifecycle = statusItem?.lifecycle ?? (runtime?.phase === "done" ? "done" : runtime?.phase ?? "-");
  const approval = statusItem?.approval_state ?? "-";
  const verification = statusItem?.verification_status ?? "-";
  return `${lifecycle} / ${approval} / ${verification}`;
}

function parseDispatchDirectoryName(name, workItemId) {
  const marker = `-${workItemId}-stage-`;
  const markerIndex = name.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const startedAt = parseDispatchTimestamp(name.slice(0, markerIndex));
  const stage = Number.parseInt(name.slice(markerIndex + marker.length), 10);
  if (!startedAt || !Number.isInteger(stage) || stage < 1 || stage > 6) {
    return null;
  }

  return {
    stage,
    startedAt,
  };
}

function summarizeStageResult(stageResult) {
  if (typeof stageResult?.decision === "string") {
    return stageResult.decision;
  }
  if (typeof stageResult?.result === "string") {
    return stageResult.result;
  }
  if (typeof stageResult?.summary === "string") {
    return stageResult.summary;
  }
  if (typeof stageResult?.summary_markdown === "string") {
    return stageResult.summary_markdown.split(/\r?\n/)[0]?.replace(/^#+\s*/, "") || "completed";
  }
  return "completed";
}

function collectDispatchRuns(rootDir, workItemId) {
  const dispatchRoot = resolve(rootDir, ".artifacts", "omo-lite-dispatch");
  if (!existsSync(dispatchRoot)) {
    return [];
  }

  return readdirSync(dispatchRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const parsed = parseDispatchDirectoryName(entry.name, workItemId);
      if (!parsed) {
        return null;
      }

      const artifactDir = join(dispatchRoot, entry.name);
      const runMetadataPath = join(artifactDir, "run-metadata.json");
      const stageResultPath = join(artifactDir, "stage-result.json");
      const durationSourcePath = existsSync(runMetadataPath)
        ? runMetadataPath
        : existsSync(stageResultPath)
          ? stageResultPath
          : null;
      if (!durationSourcePath) {
        return null;
      }

      const endedAt = statSync(durationSourcePath).mtime;
      const durationMinutes = Math.max(0, (endedAt.getTime() - parsed.startedAt.getTime()) / 60000);

      return {
        artifactDir,
        stage: parsed.stage,
        startedAt: parsed.startedAt,
        endedAt,
        durationMinutes,
        runMetadata: readJsonIfExists(runMetadataPath),
        stageResult: readJsonIfExists(stageResultPath),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
}

function collectSupervisorEscalations(rootDir, workItemId) {
  const supervisorRoot = resolve(rootDir, ".artifacts", "omo-supervisor");
  if (!existsSync(supervisorRoot)) {
    return [];
  }

  const byKey = new Map();
  const maybeAdd = (wait) => {
    if (wait?.kind !== "human_escalation") {
      return;
    }

    const updatedAt = parseIsoTimestamp(wait.updated_at);
    const stage = Number.isInteger(wait.stage) ? wait.stage : Number.parseInt(wait.stage, 10);
    const reason = typeof wait.reason === "string" && wait.reason.trim().length > 0
      ? wait.reason.trim()
      : "human escalation";
    const key = `${updatedAt?.toISOString() ?? "unknown"}|${stage || "-"}|${reason}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        stage: Number.isInteger(stage) ? stage : null,
        updatedAt,
        reason,
      });
    }
  };

  for (const entry of readdirSync(supervisorRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith(`-${workItemId}`)) {
      continue;
    }

    const summary = readJsonIfExists(join(supervisorRoot, entry.name, "summary.json"));
    if (!summary) {
      continue;
    }

    for (const transition of Array.isArray(summary.transitions) ? summary.transitions : []) {
      maybeAdd(transition?.wait);
    }
    maybeAdd(summary.wait);
  }

  return [...byKey.values()].sort((left, right) => {
    const leftTime = left.updatedAt?.getTime() ?? 0;
    const rightTime = right.updatedAt?.getTime() ?? 0;
    return leftTime - rightTime;
  });
}

function groupEscalations(escalations, dispatchRuns, runtime) {
  const grouped = new Map();
  for (const escalation of escalations) {
    const key = `${escalation.stage ?? "-"}|${escalation.reason}`;
    const existing = grouped.get(key) ?? {
      stage: escalation.stage,
      reason: escalation.reason,
      count: 0,
      firstAt: escalation.updatedAt,
    };
    existing.count += 1;
    if (
      escalation.updatedAt &&
      (!existing.firstAt || escalation.updatedAt.getTime() < existing.firstAt.getTime())
    ) {
      existing.firstAt = escalation.updatedAt;
    }
    grouped.set(key, existing);
  }

  return [...grouped.values()].map((group) => ({
    ...group,
    pureBeforeMinutes: dispatchRuns
      .filter((run) => group.firstAt && run.endedAt.getTime() <= group.firstAt.getTime())
      .reduce((sum, run) => sum + run.durationMinutes, 0),
    resolution: runtime?.phase === "done" ? "재개 후 완료" : "후속 확인 필요",
  }));
}

function getRunProvider(run) {
  return (
    run.runMetadata?.execution?.provider ??
    run.runMetadata?.effectiveProviderSelection?.provider ??
    null
  );
}

function isResolvedStageResult(stageResult) {
  return stageResult?.result === "done" || stageResult?.decision === "approve";
}

function getExecutionPrompt(run) {
  const args = run.runMetadata?.execution?.commandArgs;
  if (!Array.isArray(args)) {
    return "";
  }

  return args.find((arg) => typeof arg === "string" && arg.includes("## Required fixes")) ?? "";
}

function extractRequiredFixReasons(prompt) {
  if (typeof prompt !== "string" || !prompt.includes("## Required fixes")) {
    return [];
  }

  const section = prompt.match(/## Required fixes\s*\n([\s\S]*?)(?:\n## |\n# |$)/)?.[1] ?? "";
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ["))
    .map((line) =>
      line
        .replace(/^- \[[^\]]+\]\s*/, "")
        .replace(/\s*->\s*/g, " -> ")
        .trim(),
    )
    .filter(Boolean);
}

function groupCodexResolvedErrors(dispatchRuns, runtime) {
  const grouped = new Map();
  const add = ({ run, reason }) => {
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return;
    }

    const normalizedReason = reason.trim();
    const key = `${run.stage}|${normalizedReason}`;
    const existing = grouped.get(key) ?? {
      stage: run.stage,
      reason: normalizedReason,
      count: 0,
      firstAt: run.startedAt,
    };
    existing.count += 1;
    if (run.startedAt && (!existing.firstAt || run.startedAt.getTime() < existing.firstAt.getTime())) {
      existing.firstAt = run.startedAt;
    }
    grouped.set(key, existing);
  };

  for (const run of dispatchRuns) {
    if (getRunProvider(run) !== "opencode" || !isResolvedStageResult(run.stageResult)) {
      continue;
    }

    for (const reason of extractRequiredFixReasons(getExecutionPrompt(run))) {
      add({ run, reason });
    }

    const executionMode = run.runMetadata?.execution?.mode;
    if (typeof executionMode === "string" && executionMode !== "execute") {
      add({
        run,
        reason:
          typeof run.runMetadata?.execution?.reason === "string" &&
          run.runMetadata.execution.reason.trim().length > 0
            ? run.runMetadata.execution.reason
            : executionMode,
      });
    }
  }

  return [...grouped.values()]
    .sort((left, right) => {
      const leftTime = left.firstAt?.getTime() ?? 0;
      const rightTime = right.firstAt?.getTime() ?? 0;
      return leftTime - rightTime;
    })
    .map((group) => ({
      ...group,
      resolution: runtime?.phase === "done" ? "Codex 재실행 후 완료" : "후속 확인 필요",
    }));
}

function summarizeStageRuns(dispatchRuns) {
  return Object.entries(STAGE_LABELS).map(([stageValue, label]) => {
    const stage = Number.parseInt(stageValue, 10);
    const runs = dispatchRuns.filter((run) => run.stage === stage);
    const durationMinutes = runs.reduce((sum, run) => sum + run.durationMinutes, 0);
    const lastRun = runs.at(-1);

    return {
      stage,
      label,
      durationMinutes,
      count: runs.length,
      result: lastRun ? summarizeStageResult(lastRun.stageResult) : "-",
    };
  });
}

function resolveMeasurementRange({ dispatchRuns, escalations, now }) {
  const startedCandidates = [
    ...dispatchRuns.map((run) => run.startedAt),
    ...escalations.map((escalation) => escalation.updatedAt).filter(Boolean),
  ];
  const endedCandidates = [
    ...dispatchRuns.map((run) => run.endedAt),
    parseIsoTimestamp(now),
  ].filter(Boolean);

  const startedAt = startedCandidates.sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
  const endedAt = endedCandidates.sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

  return {
    startedAt,
    endedAt,
    wallClockMinutes:
      startedAt && endedAt ? Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 60000) : 0,
  };
}

function renderReport({
  rootDir,
  workItemId,
  runtime,
  now,
  dispatchRuns,
  escalations,
}) {
  const stageRuns = summarizeStageRuns(dispatchRuns);
  const totalPureMinutes = dispatchRuns.reduce((sum, run) => sum + run.durationMinutes, 0);
  const range = resolveMeasurementRange({ dispatchRuns, escalations, now });
  const escalationGroups = groupEscalations(escalations, dispatchRuns, runtime);
  const codexResolvedErrors = groupCodexResolvedErrors(dispatchRuns, runtime);
  const codexResolvedErrorCount = codexResolvedErrors.reduce((sum, group) => sum + group.count, 0);
  const finalPr = resolveFinalPullRequest(runtime);
  const completionTime = parseIsoTimestamp(now);
  const postCloseoutEscalations = completionTime
    ? escalations.filter((escalation) => escalation.updatedAt && escalation.updatedAt > completionTime).length
    : 0;
  const lines = [];

  lines.push(`# OMO Efficiency Report: ${workItemId}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| 항목 | 값 |");
  lines.push("| --- | ---: |");
  lines.push(`| 최종 상태 | ${describeFinalStatus({ rootDir, workItemId, runtime })} |`);
  lines.push(`| 최종 PR | ${extractPullRequestNumber(finalPr)} |`);
  lines.push(`| 측정 구간 | ${formatKst(range.startedAt)} ~ ${formatKst(range.endedAt)} KST |`);
  lines.push(`| 벽시계 총 시간 | ${formatMinutes(range.wallClockMinutes)} |`);
  lines.push(`| 순수 진행 누적시간 | ${formatMinutes(totalPureMinutes)} |`);
  lines.push(`| human_escalation | ${escalations.length}회 |`);
  lines.push(`| Codex 자동 수정 오류 | ${codexResolvedErrorCount}회 |`);
  lines.push(`| 최종 merge 이후 stale escalation | ${postCloseoutEscalations}회 |`);
  lines.push("");
  lines.push(
    "> 자동 생성된 보고서다. 순수 진행 누적시간은 OMO dispatch 산출물 기준으로 계산했고 human_escalation/CI/대기 시간은 제외했다.",
  );
  lines.push("");
  lines.push("## Stage Time");
  lines.push("");
  lines.push("| Stage | 순수 진행시간 | 실행 횟수 | 결과 |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const stageRun of stageRuns) {
    lines.push(
      `| ${stageRun.label} | ${formatMinutes(stageRun.durationMinutes)} | ${stageRun.count} | ${escapeTableCell(stageRun.result)} |`,
    );
  }
  lines.push(`| **Total** | **${formatMinutes(totalPureMinutes)}** | **${dispatchRuns.length}** | ${runtime?.phase === "done" ? "merged" : "-"} |`);
  lines.push("");
  lines.push("## Human Escalations");
  lines.push("");
  lines.push("| Stage | 발생 | 첫 발생 시점 | 직전 순수 진행 | 원인 | 해결 |");
  lines.push("| --- | ---: | --- | ---: | --- | --- |");
  if (escalationGroups.length === 0) {
    lines.push("| - | 0회 | - | 0.0분 | 없음 | - |");
  } else {
    for (const group of escalationGroups) {
      lines.push(
        `| ${group.stage ?? "-"} | ${group.count}회 | ${formatKst(group.firstAt)} | ${formatMinutes(group.pureBeforeMinutes)} | ${escapeTableCell(group.reason)} | ${escapeTableCell(group.resolution)} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Codex-Resolved Non-Human Errors");
  lines.push("");
  lines.push("| Stage | 발생 | 첫 발생 시점 | 원인 | 해결 |");
  lines.push("| --- | ---: | --- | --- | --- |");
  if (codexResolvedErrors.length === 0) {
    lines.push("| - | 0회 | - | 없음 | - |");
  } else {
    for (const group of codexResolvedErrors) {
      lines.push(
        `| ${group.stage ?? "-"} | ${group.count}회 | ${formatKst(group.firstAt)} | ${escapeTableCell(group.reason)} | ${escapeTableCell(group.resolution)} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Efficiency Notes");
  lines.push("");
  lines.push(`- 순수 진행시간은 ${formatMinutes(totalPureMinutes)}이다.`);
  lines.push(`- 가장 오래 걸린 stage는 ${stageRuns.slice().sort((left, right) => right.durationMinutes - left.durationMinutes)[0]?.label ?? "-"}이다.`);
  lines.push(`- human_escalation은 ${escalations.length}회 기록됐다.`);
  lines.push(`- human_escalation 외 Codex가 자동 수정한 오류는 ${codexResolvedErrorCount}회 기록됐다.`);
  lines.push("");

  return `${lines.join("\n")}`;
}

/**
 * @param {{
 *   rootDir?: string,
 *   workItemId: string,
 *   runtime?: Record<string, any> | null,
 *   now?: string,
 * }} options
 */
export function generateOmoSliceReport({
  rootDir = process.cwd(),
  workItemId,
  runtime = null,
  now = new Date().toISOString(),
} = {}) {
  if (typeof workItemId !== "string" || workItemId.trim().length === 0) {
    throw new Error("workItemId is required.");
  }

  const normalizedWorkItemId = workItemId.trim();
  const dispatchRuns = collectDispatchRuns(rootDir, normalizedWorkItemId);
  const escalations = collectSupervisorEscalations(rootDir, normalizedWorkItemId);
  const reportMarkdown = renderReport({
    rootDir,
    workItemId: normalizedWorkItemId,
    runtime,
    now,
    dispatchRuns,
    escalations,
  });
  const reportPath = resolveReportPath(rootDir, normalizedWorkItemId);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${reportMarkdown}\n`, "utf8");

  return {
    reportPath,
    reportMarkdown,
    dispatchRuns,
    escalations,
  };
}

export function generateOmoSliceReportIfPossible(options = {}) {
  try {
    return generateOmoSliceReport(options);
  } catch (error) {
    return {
      reportPath: null,
      reportMarkdown: null,
      dispatchRuns: [],
      escalations: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
