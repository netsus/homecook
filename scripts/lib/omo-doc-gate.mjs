import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import {
  readWorkpackChecklistContract,
  isChecklistContractActive,
  resolveChecklistIds,
  resolveOwnedChecklistItems,
  resolveReviewChecklistItems,
} from "./omo-checklist-contract.mjs";
import { readAutomationSpec } from "./omo-automation-spec.mjs";
import { readWorkpackDesignAuthority } from "./omo-bookkeeping.mjs";

const REQUIRED_README_SECTIONS = [
  "## Goal",
  "## Branches",
  "## In Scope",
  "## Out of Scope",
  "## Dependencies",
  "## Backend First Contract",
  "## Frontend Delivery Mode",
  "## Design Authority",
  "## Design Status",
  "## Source Links",
  "## QA / Test Data Plan",
  "## Key Rules",
  "## Primary User Path",
  "## Delivery Checklist",
];

const REQUIRED_ACCEPTANCE_SECTIONS = [
  "## Happy Path",
  "## State / Policy",
  "## Error / Permission",
  "## Data Integrity",
  "## Data Setup / Preconditions",
  "## Manual QA",
  "## Automation Split",
];

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function readFileIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

function createFinding({
  id,
  category,
  severity = "major",
  message,
  evidencePaths = [],
  remediationHint,
  fixable = true,
}) {
  return {
    id,
    fingerprint: id,
    category,
    severity,
    message,
    evidence_paths: evidencePaths,
    remediation_hint: remediationHint,
    owner: "codex",
    fixable,
  };
}

function checkRequiredSections(contents, sections, filePath, findings, category) {
  if (typeof contents !== "string") {
    findings.push(createFinding({
      id: `${category}-missing-file-${basename(filePath)}`,
      category,
      severity: "critical",
      message: `Required workpack file is missing: ${filePath}`,
      evidencePaths: [filePath],
      remediationHint: "Restore the missing workpack file before continuing.",
      fixable: false,
    }));
    return;
  }

  for (const section of sections) {
    if (!contents.includes(section)) {
      findings.push(createFinding({
        id: `${category}-missing-section-${section.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
        category,
        message: `Required section is missing: ${section}`,
        evidencePaths: [filePath],
        remediationHint: `${basename(filePath)}에 ${section} 섹션을 추가하고 내용을 잠그세요.`,
      }));
    }
  }
}

function checkChecklistCoverage(contract, findings) {
  if (!isChecklistContractActive(contract)) {
    findings.push(createFinding({
      id: "doc-gate-checklist-contract-inactive",
      category: "checklist_contract",
      message: "Checklist metadata contract is inactive. automation-spec.json and metadata_v1 contract are required.",
      evidencePaths: [contract.readmePath, contract.acceptancePath, contract.automationSpecPath],
      remediationHint: "automation-spec.json을 유지하고 non-manual checklist metadata를 모두 채우세요.",
    }));
    return;
  }

  for (const error of contract.errors ?? []) {
    findings.push(createFinding({
      id: `doc-gate-contract-${findings.length + 1}`,
      category: "checklist_contract",
      message: error.message,
      evidencePaths: [error.path],
      remediationHint: "README Delivery Checklist / acceptance metadata contract를 고치세요.",
    }));
  }

  const stage2Owned = resolveChecklistIds(resolveOwnedChecklistItems(contract, 2));
  const stage4Owned = resolveChecklistIds(resolveOwnedChecklistItems(contract, 4));
  const review3Ids = resolveChecklistIds(resolveReviewChecklistItems(contract, 3));
  const review5Ids = resolveChecklistIds(resolveReviewChecklistItems(contract, 5));
  const review6Ids = resolveChecklistIds(resolveReviewChecklistItems(contract, 6));

  if (stage2Owned.length === 0) {
    findings.push(createFinding({
      id: "doc-gate-missing-stage2-owned-checklist",
      category: "ownership",
      message: "Stage 2 owned checklist ids are missing.",
      evidencePaths: [contract.readmePath, contract.acceptancePath],
      remediationHint: "backend/shared 범위를 Stage 2 checklist metadata로 잠그세요.",
    }));
  }

  if (stage4Owned.length === 0) {
    findings.push(createFinding({
      id: "doc-gate-missing-stage4-owned-checklist",
      category: "ownership",
      message: "Stage 4 owned checklist ids are missing.",
      evidencePaths: [contract.readmePath, contract.acceptancePath],
      remediationHint: "frontend/shared 범위를 Stage 4 checklist metadata로 잠그세요.",
    }));
  }

  if (review3Ids.length === 0) {
    findings.push(createFinding({
      id: "doc-gate-missing-review3-scope",
      category: "review_scope",
      message: "Stage 3 review scope is empty.",
      evidencePaths: [contract.readmePath, contract.acceptancePath],
      remediationHint: "review=3 대상 checklist ids를 문서에 잠그세요.",
    }));
  }

  if (review5Ids.length === 0 && stage4Owned.length > 0) {
    findings.push(createFinding({
      id: "doc-gate-missing-review5-scope",
      category: "review_scope",
      message: "Stage 5 review scope is empty for frontend-owned checklist items.",
      evidencePaths: [contract.readmePath, contract.acceptancePath],
      remediationHint: "frontend checklist 중 design review 대상에 review=5를 부여하세요.",
    }));
  }

  if (review6Ids.length === 0) {
    findings.push(createFinding({
      id: "doc-gate-missing-review6-scope",
      category: "review_scope",
      message: "Stage 6 closeout review scope is empty.",
      evidencePaths: [contract.readmePath, contract.acceptancePath],
      remediationHint: "non-manual checklist가 Stage 6 closeout review에 포함되도록 metadata를 고치세요.",
    }));
  }
}

function checkAutomationSpec({ slice, automationSpecPath, automationSpec, contract, findings }) {
  if (!existsSync(automationSpecPath)) {
    findings.push(createFinding({
      id: "doc-gate-missing-automation-spec",
      category: "automation_spec",
      message: "automation-spec.json is missing.",
      evidencePaths: [automationSpecPath],
      remediationHint: "Stage 1 산출물에 automation-spec.json을 추가하세요.",
    }));
    return;
  }

  if (!automationSpec) {
    findings.push(createFinding({
      id: "doc-gate-invalid-automation-spec",
      category: "automation_spec",
      message: "automation-spec.json could not be normalized.",
      evidencePaths: [automationSpecPath],
      remediationHint: "automation-spec.json의 필수 필드와 JSON 구조를 고치세요.",
    }));
    return;
  }

  if (automationSpec.slice_id !== slice) {
    findings.push(createFinding({
      id: "doc-gate-automation-spec-slice-mismatch",
      category: "automation_spec",
      message: `automation-spec.json slice_id (${automationSpec.slice_id}) does not match slice (${slice}).`,
      evidencePaths: [automationSpecPath],
      remediationHint: "automation-spec.json의 slice_id를 현재 slice에 맞추세요.",
    }));
  }

  if (automationSpec.backend.required_endpoints.length === 0) {
    findings.push(createFinding({
      id: "doc-gate-missing-backend-required-endpoints",
      category: "automation_spec",
      message: "automation-spec backend.required_endpoints is empty.",
      evidencePaths: [automationSpecPath],
      remediationHint: "Stage 2가 구현해야 하는 endpoint를 automation-spec에 잠그세요.",
    }));
  }

  if (automationSpec.backend.required_test_targets.length === 0) {
    findings.push(createFinding({
      id: "doc-gate-missing-backend-test-targets",
      category: "automation_spec",
      message: "automation-spec backend.required_test_targets is empty.",
      evidencePaths: [automationSpecPath],
      remediationHint: "Stage 2 deterministic gate를 위한 backend test target을 잠그세요.",
    }));
  }

  const hasFrontendOwnedChecklist = resolveOwnedChecklistItems(contract, 4).length > 0;
  if (hasFrontendOwnedChecklist) {
    if (automationSpec.frontend.required_routes.length === 0) {
      findings.push(createFinding({
        id: "doc-gate-missing-frontend-routes",
        category: "automation_spec",
        message: "automation-spec frontend.required_routes is empty.",
        evidencePaths: [automationSpecPath],
        remediationHint: "Stage 4가 닫아야 하는 route를 automation-spec에 잠그세요.",
      }));
    }

    if (automationSpec.frontend.required_states.length === 0) {
      findings.push(createFinding({
        id: "doc-gate-missing-frontend-states",
        category: "automation_spec",
        message: "automation-spec frontend.required_states is empty.",
        evidencePaths: [automationSpecPath],
        remediationHint: "Stage 4가 보장해야 하는 UI state를 automation-spec에 잠그세요.",
      }));
    }

    if (automationSpec.frontend.artifact_assertions.length === 0) {
      findings.push(createFinding({
        id: "doc-gate-missing-frontend-artifacts",
        category: "automation_spec",
        message: "automation-spec frontend.artifact_assertions is empty.",
        evidencePaths: [automationSpecPath],
        remediationHint: "frontend artifact assertion을 automation-spec에 잠그세요.",
      }));
    }
  }
}

function fileContains(filePath, patterns) {
  if (!existsSync(filePath)) {
    return false;
  }

  const contents = readFileSync(filePath, "utf8").toLowerCase();
  return patterns.some((pattern) => contents.includes(pattern.toLowerCase()));
}

function checkDesignAuthority({
  rootDir,
  slice,
  automationSpec,
  findings,
}) {
  const designAuthorityConfig = automationSpec?.frontend?.design_authority ?? null;
  if (!designAuthorityConfig?.authority_required) {
    return;
  }

  const authority = readWorkpackDesignAuthority({
    rootDir,
    worktreePath: rootDir,
    slice,
  });

  if (authority.missing) {
    findings.push(createFinding({
      id: "doc-gate-design-authority-missing",
      category: "design_authority",
      message: "README Design Authority section is missing.",
      evidencePaths: [authority.filePath],
      remediationHint: "README에 Design Authority 섹션을 추가하고 authority 계획을 잠그세요.",
    }));
    return;
  }

  if (!authority.uiRisk) {
    findings.push(createFinding({
      id: "doc-gate-design-authority-ui-risk-missing",
      category: "design_authority",
      message: "README Design Authority UI risk is missing.",
      evidencePaths: [authority.filePath],
      remediationHint: "Design Authority 섹션에 UI risk를 기입하세요.",
    }));
  }

  if (!authority.visualArtifact) {
    findings.push(createFinding({
      id: "doc-gate-design-authority-artifact-missing",
      category: "design_authority",
      message: "README Design Authority visual artifact plan is missing.",
      evidencePaths: [authority.filePath],
      remediationHint: "Figma URL 또는 screenshot evidence 경로를 Design Authority 섹션에 남기세요.",
    }));
  }

  for (const screenId of designAuthorityConfig.required_screens ?? []) {
    const designDocPath = resolve(rootDir, "ui", "designs", `${screenId}.md`);
    const critiquePath = resolve(rootDir, "ui", "designs", "critiques", `${screenId}-critique.md`);

    if (!existsSync(designDocPath)) {
      findings.push(createFinding({
        id: `doc-gate-design-doc-missing-${screenId.toLowerCase()}`,
        category: "design_authority",
        message: `Required design-generator artifact is missing for ${screenId}.`,
        evidencePaths: [designDocPath],
        remediationHint: `${screenId} design doc를 생성하세요.`,
      }));
    }

    if (!existsSync(critiquePath)) {
      findings.push(createFinding({
        id: `doc-gate-design-critique-missing-${screenId.toLowerCase()}`,
        category: "design_authority",
        message: `Required design-critic artifact is missing for ${screenId}.`,
        evidencePaths: [critiquePath],
        remediationHint: `${screenId} critique 문서를 생성하세요.`,
      }));
    }

    const keywordChecks = [
      {
        id: "mobile-baseline",
        patterns: ["375", "mobile baseline"],
        message: "mobile baseline keyword is missing from design artifacts.",
      },
      {
        id: "mobile-narrow",
        patterns: ["320", "narrow"],
        message: "narrow mobile keyword is missing from design artifacts.",
      },
      {
        id: "primary-cta",
        patterns: ["primary cta"],
        message: "primary CTA keyword is missing from design artifacts.",
      },
      {
        id: "scroll-containment",
        patterns: ["scroll containment"],
        message: "scroll containment keyword is missing from design artifacts.",
      },
      {
        id: "anchor",
        patterns: ["anchor", ...designAuthorityConfig.anchor_screens.map((screen) => screen.toLowerCase())],
        message: "anchor screen keyword is missing from design artifacts.",
      },
    ];

    for (const keywordCheck of keywordChecks) {
      const hasKeyword =
        fileContains(designDocPath, keywordCheck.patterns) ||
        fileContains(critiquePath, keywordCheck.patterns);
      if (!hasKeyword) {
        findings.push(createFinding({
          id: `doc-gate-design-keyword-${keywordCheck.id}-${screenId.toLowerCase()}`,
          category: "design_authority",
          message: `${screenId}: ${keywordCheck.message}`,
          evidencePaths: [designDocPath, critiquePath],
          remediationHint: `${screenId} design doc/critique에 ${keywordCheck.id} 기준을 명시하세요.`,
        }));
      }
    }
  }
}

function createSummary(outcome, findings) {
  if (outcome === "pass") {
    return "Doc gate passed.";
  }

  if (outcome === "blocked") {
    return findings[0]?.message ?? "Doc gate blocked.";
  }

  return findings.map((finding) => finding.message).join(" ");
}

export function evaluateDocGate({
  rootDir = process.cwd(),
  worktreePath = null,
  slice,
}) {
  const normalizedSlice = ensureNonEmptyString(slice, "slice");
  const docsRoot = typeof worktreePath === "string" && worktreePath.trim().length > 0
    ? resolve(worktreePath)
    : resolve(rootDir);
  const readmePath = resolve(docsRoot, "docs", "workpacks", normalizedSlice, "README.md");
  const acceptancePath = resolve(docsRoot, "docs", "workpacks", normalizedSlice, "acceptance.md");
  const { automationSpecPath, automationSpec } = readAutomationSpec({
    rootDir: docsRoot,
    slice: normalizedSlice,
    required: false,
  });
  const checklistContract = readWorkpackChecklistContract({
    rootDir,
    worktreePath: docsRoot,
    slice: normalizedSlice,
  });
  const findings = [];

  checkRequiredSections(readFileIfExists(readmePath), REQUIRED_README_SECTIONS, readmePath, findings, "readme");
  checkRequiredSections(
    readFileIfExists(acceptancePath),
    REQUIRED_ACCEPTANCE_SECTIONS,
    acceptancePath,
    findings,
    "acceptance",
  );
  checkChecklistCoverage(checklistContract, findings);
  checkAutomationSpec({
    slice: normalizedSlice,
    automationSpecPath,
    automationSpec,
    contract: checklistContract,
    findings,
  });
  checkDesignAuthority({
    rootDir: docsRoot,
    slice: normalizedSlice,
    automationSpec,
    findings,
  });

  const blocked = findings.some((entry) => entry.fixable === false);
  const outcome = blocked ? "blocked" : findings.length > 0 ? "fixable" : "pass";

  return {
    outcome,
    summary: createSummary(outcome, findings),
    findings,
    readmePath,
    acceptancePath,
    automationSpecPath,
  };
}

export function writeDocGateResult({
  rootDir = process.cwd(),
  workItemId,
  result,
  now = new Date().toISOString(),
}) {
  const artifactDir = resolve(
    rootDir,
    ".artifacts",
    "omo-doc-gate",
    `${String(now).replace(/[:.]/g, "-")}-${ensureNonEmptyString(workItemId, "workItemId")}`,
  );
  mkdirSync(artifactDir, { recursive: true });
  const resultPath = resolve(artifactDir, "result.json");
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);

  return {
    artifactDir,
    resultPath,
  };
}
