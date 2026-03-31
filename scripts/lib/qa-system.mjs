import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SECTION_HEADER_PATTERN = /^##\s+(.+)$/;
const SUBSECTION_HEADER_PATTERN = /^###\s+(.+)$/;
const CHECKBOX_PATTERN = /^- \[[ xX]\]\s+(.+)$/;
const BULLET_PATTERN = /^-\s+(.+)$/;
const NUMBERED_PATTERN = /^\d+\.\s+(.+)$/;

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

  return {
    schemaVersion: "1.0",
    slice,
    generatedAt: new Date().toISOString(),
    baseUrl,
    sourceFiles: {
      readme: `docs/workpacks/${slice}/README.md`,
      acceptance: `docs/workpacks/${slice}/acceptance.md`,
    },
    devices: ["desktop-chrome", "mobile-chrome"],
    primaryUserPath,
    checklistItems,
    edgeCases: buildEdgeCaseMatrix(checklistItems),
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
    "",
    "## 실행 규칙",
    "1. checklistItems를 순서대로 훑고 coverage 상태를 채운다.",
    "2. desktop과 mobile 둘 다 확인한다.",
    "3. edgeCases 항목을 실제로 시도한다.",
    "4. finding마다 severity, repro_steps, expected, actual, evidence_paths, remaining_risk를 남긴다.",
    "5. 마지막에 남은 리스크와 미커버 항목을 summary에 요약한다.",
    "",
    "## 권장 실행 예시",
    "- `pnpm dev`로 앱을 띄운다.",
    `- \`${checklist.baseUrl}\`에서 브라우저 탐색을 시작한다.`,
    `- 완료 후 \`${reportPath}\`를 채우고 \`pnpm qa:eval -- --checklist ${checklistPath} --report ${reportPath}\`로 점수화한다.`,
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

      if (!["functional", "ux", "accessibility", "visual", "performance", "security", "content"].includes(finding.category)) {
        errors.push(`${prefix}.category is invalid.`);
      }

      if (!["blocker", "major", "minor", "suggestion"].includes(finding.severity)) {
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
      ["blocker", "major", "minor", "suggestion"].includes(finding.severity)
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
