import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { readAutomationSpec } from "./omo-automation-spec.mjs";

const IMAGE_REF_PATTERN = /\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#].*)?$/i;
const FIGMA_URL_PATTERN = /^https?:\/\/(?:www\.)?figma\.com\//i;

function resolveBranchName(rootDir, env) {
  const branchName = env.BRANCH_NAME ?? env.GITHUB_HEAD_REF;
  if (typeof branchName === "string" && branchName.trim().length > 0) {
    return branchName.trim();
  }

  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

function parseDraftState(value) {
  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  return null;
}

function resolveBranchContext(branchName) {
  const frontendMatch = /^feature\/fe-(.+)$/.exec(branchName);
  if (frontendMatch) {
    return {
      kind: "feature-fe",
      slice: frontendMatch[1],
    };
  }

  const closeoutMatch = /^docs\/omo-closeout-(.+)$/.exec(branchName);
  if (closeoutMatch) {
    return {
      kind: "omo-closeout",
      slice: closeoutMatch[1],
    };
  }

  return {
    kind: null,
    slice: null,
  };
}

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function extractEvidenceLines(reportText) {
  if (typeof reportText !== "string" || reportText.trim().length === 0) {
    return [];
  }

  const lines = reportText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => /^>\s*evidence:?\s*$/i.test(line.trim()));
  if (startIndex === -1) {
    return [];
  }

  const evidenceLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed.startsWith(">")) {
      break;
    }

    const bulletMatch = /^>\s*-\s+(.*)$/.exec(trimmed);
    if (!bulletMatch) {
      break;
    }

    evidenceLines.push(bulletMatch[1].trim());
  }

  return evidenceLines;
}

function extractRefs(line) {
  const refs = [];

  for (const match of line.matchAll(/`([^`]+)`/g)) {
    refs.push(match[1].trim());
  }

  for (const match of line.matchAll(/https?:\/\/\S+/g)) {
    refs.push(match[0].replace(/[),.;]+$/, "").trim());
  }

  if (refs.length > 0) {
    return refs;
  }

  const trimmed = line.trim();
  if (
    FIGMA_URL_PATTERN.test(trimmed) ||
    /^[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|gif|avif|svg)$/i.test(trimmed)
  ) {
    return [trimmed];
  }

  return [];
}

function isVisualRef(ref) {
  return FIGMA_URL_PATTERN.test(ref) || IMAGE_REF_PATTERN.test(ref);
}

function isLocalRepoRef(ref) {
  return !/^https?:\/\//i.test(ref);
}

function resolveEvidenceRequirementMatcher(requirement) {
  const normalized = requirement.trim().toLowerCase();
  if (normalized === "mobile-default") {
    return (ref) => {
      const lowered = ref.toLowerCase();
      return lowered.includes("mobile") && !lowered.includes("narrow");
    };
  }

  if (normalized === "mobile-narrow") {
    return (ref) => {
      const lowered = ref.toLowerCase();
      return lowered.includes("narrow") || lowered.includes("320");
    };
  }

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return (ref) => {
    const lowered = ref.toLowerCase();
    return tokens.every((token) => lowered.includes(token));
  };
}

function validateAuthorityReport({
  rootDir,
  reportPath,
  stage4EvidenceRequirements,
}) {
  const absoluteReportPath = resolve(rootDir, reportPath);
  const errors = [];

  if (!existsSync(absoluteReportPath)) {
    errors.push({
      path: reportPath,
      message: `authority report file is missing: ${reportPath}`,
    });
    return errors;
  }

  const reportText = readText(absoluteReportPath);
  const evidenceLines = extractEvidenceLines(reportText);
  const visualRefs = evidenceLines
    .flatMap((line) => extractRefs(line))
    .filter((ref) => isVisualRef(ref));

  if (visualRefs.length === 0) {
    errors.push({
      path: `${reportPath}:evidence`,
      message: "Authority report must record visual evidence refs in the `> evidence:` block.",
    });
  }

  for (const ref of visualRefs) {
    if (!isLocalRepoRef(ref)) {
      continue;
    }

    if (!existsSync(resolve(rootDir, ref))) {
      errors.push({
        path: `${reportPath}:evidence`,
        message: `Authority report references a missing visual evidence file: ${ref}`,
      });
    }
  }

  for (const requirement of stage4EvidenceRequirements) {
    const matchesRequirement = resolveEvidenceRequirementMatcher(requirement);
    if (!visualRefs.some((ref) => matchesRequirement(ref))) {
      errors.push({
        path: `${reportPath}:evidence`,
        message: `Authority report is missing required ${requirement} visual evidence.`,
      });
    }
  }

  return errors;
}

/**
 * @param {{
 *   rootDir?: string;
 *   env?: NodeJS.ProcessEnv & { PR_IS_DRAFT?: string | boolean };
 * }} [options]
 */
export function validateAuthorityEvidencePresence({
  rootDir = process.cwd(),
  env = process.env,
} = {}) {
  const branchName = resolveBranchName(rootDir, env);
  const branchContext = resolveBranchContext(branchName);
  const prIsDraft = parseDraftState(env.PR_IS_DRAFT);

  if (
    !branchContext.slice ||
    (branchContext.kind !== "omo-closeout" && prIsDraft !== false)
  ) {
    return [];
  }

  const { automationSpec } = readAutomationSpec({
    rootDir,
    slice: branchContext.slice,
    required: false,
  });
  const designAuthority = automationSpec?.frontend?.design_authority ?? null;

  if (!designAuthority?.authority_required) {
    return [];
  }

  const authorityReportPaths = Array.isArray(designAuthority.authority_report_paths)
    ? designAuthority.authority_report_paths
    : [];
  const stage4EvidenceRequirements = Array.isArray(designAuthority.stage4_evidence_requirements)
    ? designAuthority.stage4_evidence_requirements
    : [];

  const errors = [];
  if (authorityReportPaths.length === 0) {
    errors.push({
      path: `docs/workpacks/${branchContext.slice}/automation-spec.json`,
      message: "Authority-required slice must declare authority_report_paths.",
    });
  }

  for (const reportPath of authorityReportPaths) {
    errors.push(
      ...validateAuthorityReport({
        rootDir,
        reportPath,
        stage4EvidenceRequirements,
      }),
    );
  }

  if (errors.length === 0) {
    return [];
  }

  return [
    {
      name: `authority-evidence-presence:${branchContext.slice}`,
      errors,
    },
  ];
}
