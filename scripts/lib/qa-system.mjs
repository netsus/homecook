import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SECTION_HEADER_PATTERN = /^##\s+(.+)$/;
const SUBSECTION_HEADER_PATTERN = /^###\s+(.+)$/;
const CHECKBOX_PATTERN = /^- \[[ xX]\]\s+(.+)$/;
const BULLET_PATTERN = /^-\s+(.+)$/;
const NUMBERED_PATTERN = /^\d+\.\s+(.+)$/;
const EXPLORATORY_DEVICES = [
  "desktop-chrome",
  "mobile-chrome",
  "mobile-ios-small",
];
const EXPLORATORY_FINDING_CATEGORIES = [
  "functional",
  "ux",
  "accessibility",
  "visual",
  "performance",
  "security",
  "content",
];
const EXPLORATORY_FINDING_SEVERITIES = [
  "blocker",
  "major",
  "minor",
  "suggestion",
];
const DEFAULT_EVAL_THRESHOLDS = {
  minTotal: 85,
  minDetectionRecall: 0.8,
  maxFalsePositiveRate: 0.2,
  minEvidenceCompleteness: 0.8,
  minSeverityCalibration: 0.8,
  requireDeviceCoverage: true,
};
const EXPLORATORY_HEURISTICS = [
  {
    id: "heuristic-mobile-readability",
    text: "모바일에서 정렬, 필터, CTA처럼 자주 쓰는 control의 텍스트가 읽기 어려울 정도로 작지 않은지 확인한다.",
  },
  {
    id: "heuristic-small-viewport-cta",
    text: "작은 높이 viewport(iPhone SE 급)에서 primary CTA가 가려지지 않고 짧은 스크롤 안에서 도달 가능한지 확인한다.",
  },
  {
    id: "heuristic-duplicate-cta",
    text: "같은 기능을 수행하는 CTA가 한 화면에 중복으로 노출되지 않는지 확인한다.",
  },
  {
    id: "heuristic-information-hierarchy",
    text: "핵심 정보와 그 정보에 대한 액션이 물리적으로 멀리 떨어지지 않고 같은 맥락 안에 배치되는지 확인한다.",
  },
  {
    id: "heuristic-copy-sanity",
    text: "h1/h2, 버튼, 상태 메시지 카피가 과하게 길거나 어색하지 않은지 확인한다.",
  },
  {
    id: "heuristic-empty-noop",
    text: "empty, loading, error 상태에서 사용자가 의미 없는 no-op CTA를 누를 수 없는지 확인한다.",
  },
  {
    id: "heuristic-placeholder-polish",
    text: "아이콘, 버튼, 피드백 표현이 placeholder나 MVP 임시 UI처럼 보이지 않는지 확인한다.",
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[`"'()[\]{}]/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function normalizeSection(title) {
  return title.trim().toLowerCase();
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueStrings(items) {
  return [...new Set(
    (Array.isArray(items) ? items : [])
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function resolveRepoPath(filePath, cwd = process.cwd()) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    throw new Error("file path must be a non-empty string");
  }

  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(cwd, filePath);
}

function createTimestampSlug(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function mergeEvalThresholds(overrides = {}) {
  return {
    ...DEFAULT_EVAL_THRESHOLDS,
    ...(overrides && typeof overrides === "object" ? overrides : {}),
  };
}

function severityRank(severity) {
  return {
    blocker: 4,
    major: 3,
    minor: 2,
    suggestion: 1,
  }[severity] ?? 0;
}

function titleMatchesRule(title, rule) {
  const normalizedTitle = normalizeText(title);

  if (typeof rule.titleEquals === "string") {
    return normalizedTitle === normalizeText(rule.titleEquals);
  }

  const fragments = uniqueStrings(rule.titleIncludes);

  if (fragments.length === 0) {
    return true;
  }

  return fragments.every((fragment) => normalizedTitle.includes(normalizeText(fragment)));
}

function findingMatchesRule(finding, rule) {
  if (typeof finding !== "object" || !finding) {
    return false;
  }

  if (
    typeof rule.category === "string" &&
    normalizeText(finding.category) !== normalizeText(rule.category)
  ) {
    return false;
  }

  if (!titleMatchesRule(finding.title, rule)) {
    return false;
  }

  const requiredTags = uniqueStrings(rule.requiredTags).map(normalizeText);

  if (requiredTags.length > 0) {
    const candidateTags = uniqueStrings(finding.tags).map(normalizeText);

    if (!requiredTags.every((tag) => candidateTags.includes(tag))) {
      return false;
    }
  }

  return true;
}

function evidenceIsComplete(evidencePaths, rule) {
  const normalizedEvidencePaths = uniqueStrings(evidencePaths).map(normalizeText);
  const requiredCount = Number(rule.requiredEvidenceCount ?? 1);
  const requiredHints = uniqueStrings(rule.requiredEvidenceHints).map(normalizeText);

  if (normalizedEvidencePaths.length < requiredCount) {
    return false;
  }

  if (requiredHints.length === 0) {
    return true;
  }

  return requiredHints.every((hint) =>
    normalizedEvidencePaths.some((evidencePath) => evidencePath.includes(hint))
  );
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function parseChecklistSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let currentSection = null;
  let currentSubsection = null;

  for (const line of lines) {
    const sectionMatch = line.match(SECTION_HEADER_PATTERN);

    if (sectionMatch) {
      currentSection = {
        title: sectionMatch[1].trim(),
        items: [],
      };
      currentSubsection = null;
      sections.push(currentSection);
      continue;
    }

    const subsectionMatch = line.match(SUBSECTION_HEADER_PATTERN);

    if (subsectionMatch) {
      currentSubsection = subsectionMatch[1].trim();
      continue;
    }

    if (!currentSection) {
      continue;
    }

    const matchedItem =
      line.match(CHECKBOX_PATTERN) ??
      line.match(NUMBERED_PATTERN) ??
      line.match(BULLET_PATTERN);

    if (!matchedItem) {
      continue;
    }

    currentSection.items.push({
      subsection: currentSubsection,
      text: matchedItem[1].trim(),
    });
  }

  return sections.filter((section) => section.items.length > 0);
}

function extractPrimaryUserPath(readmeMarkdown) {
  const sections = parseChecklistSections(readmeMarkdown);
  const primaryUserPathSection = sections.find(
    (section) => normalizeSection(section.title) === "primary user path",
  );

  return primaryUserPathSection?.items.map((item) => item.text) ?? [];
}

function buildEdgeCaseMatrix(checklistItems) {
  const baseline = [
    {
      id: "desktop-happy-path",
      text: "Desktop viewport에서 대표 사용자 흐름을 처음부터 끝까지 다시 검증한다.",
    },
    {
      id: "mobile-happy-path",
      text: "Mobile viewport에서 동일 흐름을 다시 검증한다.",
    },
    {
      id: "small-viewport-fold",
      text: "작은 iOS viewport(iPhone SE 급)에서 above-the-fold 영역과 하단 CTA 가시성을 확인한다.",
    },
    {
      id: "hard-refresh",
      text: "중간 상태에서 hard refresh 후 상태 복원과 URL 정합성을 확인한다.",
    },
    {
      id: "back-forward",
      text: "뒤로가기/앞으로가기 후 UI와 상태가 어긋나지 않는지 확인한다.",
    },
    {
      id: "slow-network",
      text: "느린 네트워크에서 pending, skeleton, retry UX를 확인한다.",
    },
    {
      id: "offline-recovery",
      text: "오프라인 또는 서버 오류에서 에러 메시지와 복구 동선을 확인한다.",
    },
    {
      id: "keyboard-only",
      text: "키보드만으로 주요 동선과 모달 닫기/탐색이 가능한지 확인한다.",
    },
    {
      id: "double-submit",
      text: "중복 탭/연속 클릭 시 중복 호출 방지와 최종 상태 일관성을 확인한다.",
    },
  ];
  const joined = checklistItems.map((item) => item.text).join(" ").toLowerCase();

  if (joined.includes("로그인") || joined.includes("unauthorized") || joined.includes("return-to-action")) {
    baseline.push({
      id: "auth-return-to-action",
      text: "비로그인 보호 액션 후 로그인 복귀와 return-to-action 재실행을 확인한다.",
    });
  }

  if (joined.includes("read-only") || joined.includes("409")) {
    baseline.push({
      id: "read-only-bypass",
      text: "read-only 상태에서 우회 수정 시도와 409/차단 UX를 확인한다.",
    });
  }

  return baseline;
}

function buildHeuristicChecklistItems() {
  return EXPLORATORY_HEURISTICS.map((heuristic) => ({
    id: heuristic.id,
    section: "Exploratory Heuristics",
    subsection: null,
    text: heuristic.text,
    priority: "high",
  }));
}

export function buildExploratoryChecklist({
  slice,
  baseUrl,
  readmeMarkdown,
  acceptanceMarkdown,
}) {
  const acceptanceSections = parseChecklistSections(acceptanceMarkdown);
  const primaryUserPath = extractPrimaryUserPath(readmeMarkdown);
  const checklistItems = acceptanceSections.flatMap((section) =>
    section.items.map((item, index) => ({
      id: `${slugify(section.title)}-${index + 1}`,
      section: section.title,
      subsection: item.subsection,
      text: item.text,
      priority:
        section.title === "Error / Permission" || section.title === "Manual QA"
          ? "high"
          : "normal",
    })),
  );
  const heuristicItems = buildHeuristicChecklistItems();

  return {
    schemaVersion: "1.0",
    slice,
    generatedAt: new Date().toISOString(),
    baseUrl,
    sourceFiles: {
      readme: `docs/workpacks/${slice}/README.md`,
      acceptance: `docs/workpacks/${slice}/acceptance.md`,
    },
    devices: EXPLORATORY_DEVICES,
    primaryUserPath,
    checklistItems: [...checklistItems, ...heuristicItems],
    edgeCases: buildEdgeCaseMatrix([...checklistItems, ...heuristicItems]),
  };
}

export function createExploratoryReportTemplate(checklist) {
  return {
    schemaVersion: "1.0",
    slice: checklist.slice,
    generatedAt: "",
    baseUrl: checklist.baseUrl,
    devices: [...checklist.devices],
    summary: "",
    findings: [],
    remainingRisks: [],
    checklistCoverage: checklist.checklistItems.map((item) => ({
      item_id: item.id,
      status: "not-covered",
      notes: "",
      linked_findings: [],
    })),
  };
}

export function renderExploratoryInstructions(checklist, outputDir) {
  const reportPath = path.join(outputDir, "exploratory-report.json");
  const checklistPath = path.join(outputDir, "exploratory-checklist.json");
  const evalResultPath = path.join(outputDir, "eval-result.json");

  return [
    `# Exploratory QA: ${checklist.slice}`,
    "",
    "## 목적",
    "- acceptance checklist를 기반으로 desktop/mobile 사용자 흐름과 edge case를 탐색한다.",
    "- 기능 버그뿐 아니라 디자인, 접근성, copy, affordance, 복구 UX 문제도 함께 기록한다.",
    "",
    "## 입력 자료",
    `- 체크리스트: \`${checklistPath}\``,
    `- 보고서 템플릿: \`${reportPath}\``,
    `- 기본 URL: \`${checklist.baseUrl}\``,
    `- 필수 device coverage: \`${checklist.devices.join(", ")}\``,
    "",
    "## 실행 규칙",
    "1. checklistItems를 순서대로 훑고 coverage 상태를 채운다.",
    "2. desktop, 일반 mobile, 작은 iOS viewport를 모두 확인한다.",
    "3. edgeCases 항목을 실제로 시도한다.",
    "4. finding마다 severity, repro_steps, expected, actual, evidence_paths, remaining_risk를 남긴다.",
    "5. 작은 높이 viewport에서는 above-the-fold 상태와 CTA 가시성을 캡처한다.",
    "6. 마지막에 남은 리스크와 미커버 항목을 summary에 요약한다.",
    "",
    "## 권장 실행 예시",
    "- `pnpm dev`로 앱을 띄운다.",
    `- \`${checklist.baseUrl}\`에서 브라우저 탐색을 시작한다.`,
    `- 완료 후 \`${reportPath}\`를 채우고 \`pnpm qa:eval -- --checklist ${checklistPath} --report ${reportPath}\`로 점수화한다.`,
    `- eval 결과는 기본값으로 \`${evalResultPath}\`에 저장된다.`,
    "",
    "## 필수 휴리스틱",
    ...EXPLORATORY_HEURISTICS.map((item) => `- ${item.text}`),
    "",
    "## 필수 증거 가이드",
    "- 각 required device별로 최소 1개 이상 스크린샷 또는 녹화 경로를 남긴다.",
    "- 작은 viewport에서는 above-the-fold 캡처를 남긴다.",
    "- 중복 CTA, 정보 계층, 카피 이상 여부를 찾지 못했더라도 확인 결과를 notes에 남긴다.",
    "",
    "## Edge Cases",
    ...checklist.edgeCases.map((item) => `- ${item.text}`),
    "",
  ].join("\n");
}

export function validateExploratoryReport(report, checklist) {
  const errors = [];
  const requiredDevices = new Set(checklist.devices);

  if (report?.schemaVersion !== "1.0") {
    errors.push("schemaVersion must be '1.0'.");
  }

  if (report?.slice !== checklist.slice) {
    errors.push("report slice must match checklist slice.");
  }

  if (typeof report?.baseUrl !== "string" || report.baseUrl.trim().length === 0) {
    errors.push("baseUrl is required.");
  }

  if (typeof report?.summary !== "string" || report.summary.trim().length === 0) {
    errors.push("summary is required.");
  }

  if (!Array.isArray(report?.devices)) {
    errors.push("devices must be an array.");
  } else {
    for (const device of requiredDevices) {
      if (!report.devices.includes(device)) {
        errors.push(`missing required device coverage: ${device}`);
      }
    }
  }

  if (!Array.isArray(report?.checklistCoverage)) {
    errors.push("checklistCoverage must be an array.");
  } else {
    const coverageIds = new Set(report.checklistCoverage.map((item) => item.item_id));

    for (const item of checklist.checklistItems) {
      if (!coverageIds.has(item.id)) {
        errors.push(`missing checklist coverage item: ${item.id}`);
      }
    }
  }

  if (!Array.isArray(report?.findings)) {
    errors.push("findings must be an array.");
  } else {
    report.findings.forEach((finding, index) => {
      const prefix = `finding[${index}]`;

      if (typeof finding.title !== "string" || finding.title.trim().length === 0) {
        errors.push(`${prefix}.title is required.`);
      }

      if (!EXPLORATORY_FINDING_CATEGORIES.includes(finding.category)) {
        errors.push(`${prefix}.category is invalid.`);
      }

      if (!EXPLORATORY_FINDING_SEVERITIES.includes(finding.severity)) {
        errors.push(`${prefix}.severity is invalid.`);
      }

      if (!Array.isArray(finding.repro_steps) || finding.repro_steps.length < 2) {
        errors.push(`${prefix}.repro_steps must have at least 2 steps.`);
      }

      if (!Array.isArray(finding.evidence_paths) || finding.evidence_paths.length === 0) {
        errors.push(`${prefix}.evidence_paths must not be empty.`);
      }

      if (!Array.isArray(finding.tags) || finding.tags.length === 0) {
        errors.push(`${prefix}.tags must not be empty.`);
      }
    });
  }

  return errors;
}

export function scoreExploratoryReport(report, checklist) {
  const totalChecklistItems = checklist.checklistItems.length || 1;
  const coveredChecklistItems = (report.checklistCoverage ?? []).filter(
    (item) => item.status === "covered" || item.status === "blocked",
  ).length;
  const coverageRate = coveredChecklistItems / totalChecklistItems;

  const deviceCoverage = checklist.devices.every((device) => report.devices.includes(device))
    ? 1
    : 0;

  const findings = report.findings ?? [];
  const findingQualityRate = findings.length === 0
    ? 1
    : findings.filter(
        (finding) =>
          finding.repro_steps.length >= 2 &&
          finding.evidence_paths.length > 0 &&
          typeof finding.expected === "string" &&
          finding.expected.trim().length > 0 &&
          typeof finding.actual === "string" &&
          finding.actual.trim().length > 0,
      ).length / findings.length;

  const severityRate = findings.length === 0
    ? 1
    : findings.filter((finding) =>
      EXPLORATORY_FINDING_SEVERITIES.includes(finding.severity)
    ).length / findings.length;

  const summaryRate =
    typeof report.summary === "string" &&
    report.summary.trim().length > 0 &&
    Array.isArray(report.remainingRisks)
      ? 1
      : 0;

  const score =
    coverageRate * 40 +
    deviceCoverage * 15 +
    findingQualityRate * 25 +
    severityRate * 10 +
    summaryRate * 10;

  return {
    total: Math.round(score),
    breakdown: {
      coverageRate,
      deviceCoverage,
      findingQualityRate,
      severityRate,
      summaryRate,
    },
  };
}

export function readJsonFile(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), "utf8"));
}

export function buildEvalArtifactPaths({
  baseDir = path.join(".artifacts", "qa", "evals"),
  timestamp = new Date(),
}) {
  const timestampSlug = createTimestampSlug(timestamp);
  const outputDir = resolveRepoPath(path.join(baseDir, timestampSlug));

  return {
    outputDir,
    summaryPath: path.join(outputDir, "summary.json"),
    latestPath: resolveRepoPath(path.join(baseDir, "latest.json")),
  };
}

export function validateEvalManifest(manifest) {
  const errors = [];

  if (manifest?.schemaVersion !== "1.0") {
    errors.push("manifest.schemaVersion must be '1.0'.");
  }

  if (typeof manifest?.suiteId !== "string" || manifest.suiteId.trim().length === 0) {
    errors.push("manifest.suiteId is required.");
  }

  if (!Array.isArray(manifest?.cases) || manifest.cases.length === 0) {
    errors.push("manifest.cases must be a non-empty array.");
  } else if (manifest.cases.some((casePath) => typeof casePath !== "string" || casePath.trim().length === 0)) {
    errors.push("manifest.cases entries must be non-empty strings.");
  }

  return errors;
}

export function validateEvalGroundTruth(groundTruth) {
  const errors = [];

  if (groundTruth?.schemaVersion !== "1.0") {
    errors.push("groundTruth.schemaVersion must be '1.0'.");
  }

  if (typeof groundTruth?.caseId !== "string" || groundTruth.caseId.trim().length === 0) {
    errors.push("groundTruth.caseId is required.");
  }

  if (!Array.isArray(groundTruth?.expectedFindings)) {
    errors.push("groundTruth.expectedFindings must be an array.");
  } else {
    groundTruth.expectedFindings.forEach((finding, index) => {
      const prefix = `groundTruth.expectedFindings[${index}]`;

      if (typeof finding?.id !== "string" || finding.id.trim().length === 0) {
        errors.push(`${prefix}.id is required.`);
      }

      if (!EXPLORATORY_FINDING_CATEGORIES.includes(finding?.category)) {
        errors.push(`${prefix}.category is invalid.`);
      }

      if (!EXPLORATORY_FINDING_SEVERITIES.includes(finding?.severity)) {
        errors.push(`${prefix}.severity is invalid.`);
      }

      const hasTitleEquals = typeof finding?.titleEquals === "string" && finding.titleEquals.trim().length > 0;
      const hasTitleIncludes = Array.isArray(finding?.titleIncludes) && finding.titleIncludes.length > 0;

      if (!hasTitleEquals && !hasTitleIncludes) {
        errors.push(`${prefix} requires titleEquals or titleIncludes.`);
      }
    });
  }

  return errors;
}

export function validateEvalCaseDefinition(caseDefinition) {
  const errors = [];

  if (caseDefinition?.schemaVersion !== "1.0") {
    errors.push("case.schemaVersion must be '1.0'.");
  }

  if (typeof caseDefinition?.id !== "string" || caseDefinition.id.trim().length === 0) {
    errors.push("case.id is required.");
  }

  if (!["real", "synthetic"].includes(caseDefinition?.kind)) {
    errors.push("case.kind must be 'real' or 'synthetic'.");
  }

  if (typeof caseDefinition?.slice !== "string" || caseDefinition.slice.trim().length === 0) {
    errors.push("case.slice is required.");
  }

  if (typeof caseDefinition?.description !== "string" || caseDefinition.description.trim().length === 0) {
    errors.push("case.description is required.");
  }

  if (typeof caseDefinition?.candidate !== "object" || !caseDefinition.candidate) {
    errors.push("case.candidate is required.");
  } else {
    if (typeof caseDefinition.candidate.checklist !== "string" || caseDefinition.candidate.checklist.trim().length === 0) {
      errors.push("case.candidate.checklist is required.");
    }

    if (typeof caseDefinition.candidate.report !== "string" || caseDefinition.candidate.report.trim().length === 0) {
      errors.push("case.candidate.report is required.");
    }
  }

  if (typeof caseDefinition?.groundTruth !== "string" || caseDefinition.groundTruth.trim().length === 0) {
    errors.push("case.groundTruth is required.");
  }

  if (typeof caseDefinition?.expected !== "object" || caseDefinition.expected === null) {
    errors.push("case.expected is required.");
  } else if (typeof caseDefinition.expected.pass !== "boolean") {
    errors.push("case.expected.pass must be a boolean.");
  }

  return errors;
}

export function loadEvalManifest(manifestPath = "qa/evals/manifest.json") {
  const resolvedManifestPath = resolveRepoPath(manifestPath);
  const manifest = JSON.parse(readFileSync(resolvedManifestPath, "utf8"));
  const errors = validateEvalManifest(manifest);

  if (errors.length > 0) {
    throw new Error(`Invalid eval manifest:\n- ${errors.join("\n- ")}`);
  }

  return {
    manifestPath: resolvedManifestPath,
    manifest,
  };
}

export function loadEvalCaseDefinition(casePath) {
  const resolvedCasePath = resolveRepoPath(casePath);
  const caseDefinition = JSON.parse(readFileSync(resolvedCasePath, "utf8"));
  const errors = validateEvalCaseDefinition(caseDefinition);

  if (errors.length > 0) {
    throw new Error(`Invalid eval case ${resolvedCasePath}:\n- ${errors.join("\n- ")}`);
  }

  return {
    casePath: resolvedCasePath,
    caseDefinition,
  };
}

export function loadEvalGroundTruth(groundTruthPath) {
  const resolvedGroundTruthPath = resolveRepoPath(groundTruthPath);
  const groundTruth = JSON.parse(readFileSync(resolvedGroundTruthPath, "utf8"));
  const errors = validateEvalGroundTruth(groundTruth);

  if (errors.length > 0) {
    throw new Error(`Invalid eval ground truth ${resolvedGroundTruthPath}:\n- ${errors.join("\n- ")}`);
  }

  return {
    groundTruthPath: resolvedGroundTruthPath,
    groundTruth,
  };
}

export function evaluateExploratoryReportCase({
  caseId,
  slice,
  checklist,
  report,
  groundTruth,
  candidatePaths = {},
  groundTruthPath = "",
  casePath = "",
  thresholds = {},
}) {
  const validationErrors = validateExploratoryReport(report, checklist);
  const completenessScore = scoreExploratoryReport(report, checklist);
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const expectedFindings = Array.isArray(groundTruth?.expectedFindings)
    ? groundTruth.expectedFindings
    : [];
  const matchedCandidateIndexes = new Set();
  const matchedFindings = [];
  const missedFindings = [];

  for (const expectedFinding of expectedFindings) {
    const matchedIndex = findings.findIndex((finding, index) =>
      !matchedCandidateIndexes.has(index) && findingMatchesRule(finding, expectedFinding)
    );

    if (matchedIndex === -1) {
      missedFindings.push({
        id: expectedFinding.id,
        titleEquals: expectedFinding.titleEquals ?? null,
        titleIncludes: expectedFinding.titleIncludes ?? [],
        category: expectedFinding.category,
        severity: expectedFinding.severity,
        requiredTags: uniqueStrings(expectedFinding.requiredTags),
      });
      continue;
    }

    matchedCandidateIndexes.add(matchedIndex);
    const candidateFinding = findings[matchedIndex];
    const evidenceComplete = evidenceIsComplete(
      candidateFinding.evidence_paths,
      expectedFinding,
    );

    matchedFindings.push({
      expectedFindingId: expectedFinding.id,
      expectedTitle: expectedFinding.titleEquals ?? expectedFinding.titleIncludes ?? [],
      matchedTitle: candidateFinding.title,
      category: candidateFinding.category,
      expectedSeverity: expectedFinding.severity,
      actualSeverity: candidateFinding.severity,
      severityMatches: candidateFinding.severity === expectedFinding.severity,
      severityDelta: Math.abs(
        severityRank(candidateFinding.severity) - severityRank(expectedFinding.severity),
      ),
      evidenceComplete,
      requiredTags: uniqueStrings(expectedFinding.requiredTags),
      matchedTags: uniqueStrings(candidateFinding.tags),
      requiredEvidenceHints: uniqueStrings(expectedFinding.requiredEvidenceHints),
      evidencePaths: uniqueStrings(candidateFinding.evidence_paths),
    });
  }

  const falsePositives = findings
    .map((finding, index) => ({ finding, index }))
    .filter(({ index }) => !matchedCandidateIndexes.has(index))
    .map(({ finding }) => ({
      title: finding.title,
      category: finding.category,
      severity: finding.severity,
      tags: uniqueStrings(finding.tags),
    }));

  const matchedCount = matchedFindings.length;
  const expectedCount = expectedFindings.length;
  const detectionRecall = expectedCount === 0
    ? (findings.length === 0 ? 1 : 0)
    : matchedCount / expectedCount;
  const falsePositiveRate = findings.length === 0
    ? 0
    : falsePositives.length / findings.length;
  const severityCalibration = matchedCount === 0
    ? (expectedCount === 0 ? 1 : 0)
    : matchedFindings.filter((finding) => finding.severityMatches).length / matchedCount;
  const evidenceCompleteness = matchedCount === 0
    ? (expectedCount === 0 ? 1 : 0)
    : matchedFindings.filter((finding) => finding.evidenceComplete).length / matchedCount;

  const total = Math.round(
    completenessScore.breakdown.coverageRate * 15 +
      completenessScore.breakdown.deviceCoverage * 10 +
      completenessScore.breakdown.findingQualityRate * 10 +
      completenessScore.breakdown.summaryRate * 5 +
      detectionRecall * 25 +
      (1 - falsePositiveRate) * 15 +
      severityCalibration * 10 +
      evidenceCompleteness * 10,
  );

  const resolvedThresholds = mergeEvalThresholds(thresholds);
  const pass =
    validationErrors.length === 0 &&
    total >= resolvedThresholds.minTotal &&
    detectionRecall >= resolvedThresholds.minDetectionRecall &&
    falsePositiveRate <= resolvedThresholds.maxFalsePositiveRate &&
    evidenceCompleteness >= resolvedThresholds.minEvidenceCompleteness &&
    severityCalibration >= resolvedThresholds.minSeverityCalibration &&
    (!resolvedThresholds.requireDeviceCoverage ||
      completenessScore.breakdown.deviceCoverage === 1);

  return {
    schemaVersion: "1.0",
    caseId,
    slice,
    generatedAt: new Date().toISOString(),
    casePath,
    candidatePaths,
    groundTruthPath,
    validationErrors,
    score: {
      total,
      pass,
      thresholds: resolvedThresholds,
      breakdown: {
        coverageRate: completenessScore.breakdown.coverageRate,
        deviceCoverage: completenessScore.breakdown.deviceCoverage,
        findingQualityRate: completenessScore.breakdown.findingQualityRate,
        severityFieldRate: completenessScore.breakdown.severityRate,
        summaryRate: completenessScore.breakdown.summaryRate,
        detectionRecall,
        falsePositiveRate,
        severityCalibration,
        evidenceCompleteness,
      },
    },
    matchedFindings,
    missedFindings,
    falsePositives,
  };
}

export function evaluateExploratoryEvalCaseFile(casePath) {
  const { caseDefinition, casePath: resolvedCasePath } = loadEvalCaseDefinition(casePath);
  const checklistPath = resolveRepoPath(caseDefinition.candidate.checklist);
  const reportPath = resolveRepoPath(caseDefinition.candidate.report);
  const { groundTruth, groundTruthPath } = loadEvalGroundTruth(caseDefinition.groundTruth);
  const checklist = JSON.parse(readFileSync(checklistPath, "utf8"));
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const evaluation = evaluateExploratoryReportCase({
    caseId: caseDefinition.id,
    slice: caseDefinition.slice,
    checklist,
    report,
    groundTruth,
    candidatePaths: {
      checklist: checklistPath,
      report: reportPath,
    },
    groundTruthPath,
    casePath: resolvedCasePath,
    thresholds: caseDefinition.thresholds,
  });
  const expectedPass = caseDefinition.expected.pass;

  return {
    ...evaluation,
    kind: caseDefinition.kind,
    description: caseDefinition.description,
    expectedPass,
    verdictMatched: evaluation.score.pass === expectedPass,
  };
}

export function runEvalSuite(manifestPath = "qa/evals/manifest.json") {
  const { manifest, manifestPath: resolvedManifestPath } = loadEvalManifest(manifestPath);
  const caseResults = manifest.cases.map((caseFile) =>
    evaluateExploratoryEvalCaseFile(caseFile)
  );
  const failedCases = caseResults
    .filter((result) => !result.verdictMatched)
    .map((result) => result.caseId);
  const classificationAccuracy = caseResults.length === 0
    ? 0
    : caseResults.filter((result) => result.verdictMatched).length / caseResults.length;
  const positiveCaseResults = caseResults.filter((result) => result.expectedPass);
  const overallScore = Math.round(classificationAccuracy * 100);

  return {
    schemaVersion: "1.0",
    suiteId: manifest.suiteId,
    generatedAt: new Date().toISOString(),
    manifestPath: resolvedManifestPath,
    thresholds: {
      minCaseClassificationAccuracy: 1,
    },
    overallScore,
    pass: failedCases.length === 0,
    breakdown: {
      classificationAccuracy,
      caseCount: caseResults.length,
      expectedPassCases: positiveCaseResults.length,
      expectedFailCases: caseResults.length - positiveCaseResults.length,
      positiveCaseAverages: {
        total: average(positiveCaseResults.map((result) => result.score.total)),
        detectionRecall: average(
          positiveCaseResults.map((result) => result.score.breakdown.detectionRecall),
        ),
        falsePositiveRate: average(
          positiveCaseResults.map((result) => result.score.breakdown.falsePositiveRate),
        ),
        evidenceCompleteness: average(
          positiveCaseResults.map((result) => result.score.breakdown.evidenceCompleteness),
        ),
      },
    },
    failedCases,
    cases: caseResults,
  };
}

export function parseCliArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

export function writeJsonFile(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeTextFile(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value, "utf8");
}

export function readMarkdown(filePath) {
  return readFileSync(filePath, "utf8");
}
