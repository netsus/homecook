import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { readAutomationSpec } from "./omo-automation-spec.mjs";
import { readRuntimeState, resolveRuntimePath } from "./omo-session-runtime.mjs";
import {
  parseDraftState,
  readText,
  resolveBranchName,
  resolveSliceBranchContext,
} from "./validator-shared.mjs";

const IMAGE_REF_PATTERN = /\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#].*)?$/i;
const FIGMA_URL_PATTERN = /^https?:\/\/(?:www\.)?figma\.com\//i;

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
    isSafeLocalRepoPath(trimmed)
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

function isSafeLocalRepoPath(ref) {
  if (
    typeof ref !== "string" ||
    ref.length === 0 ||
    !isLocalRepoRef(ref) ||
    ref.startsWith("/") ||
    ref.includes("\\")
  ) {
    return false;
  }

  const segments = ref.split("/");
  const fileName = segments.at(-1) ?? "";
  return (
    segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..") &&
    /^[A-Za-z0-9_.-]+\.[A-Za-z0-9]+$/.test(fileName)
  );
}

function isSafeLocalJsonArtifactRef(ref) {
  return isSafeLocalRepoPath(ref) && ref.endsWith(".json");
}

function isNonVisualArtifactRequirement(requirement) {
  return isSafeLocalJsonArtifactRef(requirement) && !isVisualRef(requirement);
}

function isUnsupportedArtifactRequirement(requirement) {
  if (typeof requirement !== "string" || isVisualRef(requirement)) {
    return false;
  }

  return (
    /^https?:\/\//i.test(requirement) ||
    requirement.startsWith("/") ||
    requirement.includes("/") ||
    requirement.includes("\\") ||
    /\.[A-Za-z0-9]+(?:[?#].*)?$/.test(requirement)
  );
}

function isRegularRepoLocalJsonFile({ rootDir, ref }) {
  const candidatePath = resolve(rootDir, ref);

  try {
    const candidateLstat = lstatSync(candidatePath);
    if (candidateLstat.isSymbolicLink() || !candidateLstat.isFile()) {
      return false;
    }

    const candidateStat = statSync(candidatePath);
    if (!candidateStat.isFile()) {
      return false;
    }

    const rootRealPath = realpathSync(rootDir);
    const candidateRealPath = realpathSync(candidatePath);
    const pathFromRoot = relative(rootRealPath, candidateRealPath);
    return (
      pathFromRoot.length > 0 &&
      pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRoot)
    );
  } catch {
    return false;
  }
}

function resolveEvidenceRequirementMatcher(requirement) {
  const normalized = requirement.trim().toLowerCase();
  const normalizedAlias = normalized
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((token) => !["screenshot", "screenshots", "image", "images", "visual", "evidence"].includes(token))
    .join("-");
  if (normalizedAlias === "mobile-default") {
    return (ref) => {
      const lowered = ref.toLowerCase();
      return lowered.includes("mobile") && !lowered.includes("narrow");
    };
  }

  if (normalizedAlias === "mobile-narrow") {
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

function normalizeStringArray(values) {
  return Array.isArray(values)
    ? values
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    : [];
}

function areSameStringSets(left, right) {
  const leftValues = [...new Set(normalizeStringArray(left))].sort();
  const rightValues = [...new Set(normalizeStringArray(right))].sort();
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
}

function inspectAuthorityReport({
  rootDir,
  reportPath,
}) {
  const absoluteReportPath = resolve(rootDir, reportPath);
  const errors = [];

  if (!existsSync(absoluteReportPath)) {
    errors.push({
      path: reportPath,
      message: `authority report file is missing: ${reportPath}`,
    });
    return {
      errors,
      artifactRefs: [],
      visualRefs: [],
    };
  }

  const reportText = readText(absoluteReportPath);
  const evidenceLines = extractEvidenceLines(reportText);
  const evidenceRefs = evidenceLines.flatMap((line) => extractRefs(line));
  const artifactRefs = evidenceRefs.filter((ref) => isSafeLocalJsonArtifactRef(ref));
  const visualRefs = evidenceRefs.filter((ref) => isVisualRef(ref));

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

  return {
    errors,
    artifactRefs,
    visualRefs,
  };
}

function validateRuntimeAuthoritySync({
  rootDir,
  slice,
  authorityReportPaths,
  reportArtifactRefs,
  reportVisualRefs,
  stage4EvidenceRequirements,
}) {
  const runtimePath = resolveRuntimePath({
    rootDir,
    workItemId: slice,
  });

  if (!existsSync(runtimePath)) {
    return [];
  }

  const { state } = readRuntimeState({
    rootDir,
    workItemId: slice,
    slice,
  });
  const runtimeDesignAuthority = state.design_authority ?? null;
  if (!runtimeDesignAuthority?.authority_required) {
    return [];
  }

  const errors = [];
  const runtimeReportPaths = normalizeStringArray(runtimeDesignAuthority.authority_report_paths);
  if (runtimeReportPaths.length > 0 && !areSameStringSets(runtimeReportPaths, authorityReportPaths)) {
    errors.push({
      path: runtimePath,
      message:
        "runtime design_authority.authority_report_paths must stay in sync with automation-spec authority_report_paths.",
    });
  }

  const runtimeEvidenceArtifactRefs = normalizeStringArray(runtimeDesignAuthority.evidence_artifact_refs);
  const runtimeArtifactRefs = runtimeEvidenceArtifactRefs.filter((ref) => isSafeLocalJsonArtifactRef(ref));
  const missingReportRefs = runtimeEvidenceArtifactRefs.filter((ref) => {
    if (isVisualRef(ref)) {
      return !reportVisualRefs.includes(ref);
    }

    return !isSafeLocalJsonArtifactRef(ref) || !reportArtifactRefs.includes(ref);
  });
  if (missingReportRefs.length > 0) {
    errors.push({
      path: runtimePath,
      message:
        `runtime design_authority.evidence_artifact_refs must be represented in the authority report > evidence block: ${missingReportRefs.join(", ")}`,
    });
  }

  for (const requirement of stage4EvidenceRequirements) {
    if (!isNonVisualArtifactRequirement(requirement)) {
      continue;
    }

    if (!runtimeArtifactRefs.includes(requirement)) {
      errors.push({
        path: runtimePath,
        message:
          `runtime design_authority.evidence_artifact_refs is missing required artifact evidence: ${requirement}`,
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
  const branchName = resolveBranchName({ rootDir, env });
  const branchContext = resolveSliceBranchContext(branchName);
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

  const reportArtifactRefs = [];
  const reportVisualRefs = [];
  for (const reportPath of authorityReportPaths) {
    const reportInspection = inspectAuthorityReport({
      rootDir,
      reportPath,
    });
    errors.push(...reportInspection.errors);
    reportArtifactRefs.push(...reportInspection.artifactRefs);
    reportVisualRefs.push(...reportInspection.visualRefs);
  }

  const uniqueReportArtifactRefs = [...new Set(reportArtifactRefs)];
  const uniqueReportVisualRefs = [...new Set(reportVisualRefs)];
  for (const requirement of stage4EvidenceRequirements) {
    if (isNonVisualArtifactRequirement(requirement)) {
      if (!uniqueReportArtifactRefs.includes(requirement)) {
        errors.push({
          path: "authority_report_paths:evidence",
          message: `Authority reports are missing required artifact evidence: ${requirement}`,
        });
      } else if (!existsSync(resolve(rootDir, requirement))) {
        errors.push({
          path: "authority_report_paths:evidence",
          message: `Required authority evidence artifact file is missing: ${requirement}`,
        });
      } else if (!isRegularRepoLocalJsonFile({ rootDir, ref: requirement })) {
        errors.push({
          path: "authority_report_paths:evidence",
          message: `Required authority evidence artifact must be a regular repo-local JSON file: ${requirement}`,
        });
      }
      continue;
    }

    if (isUnsupportedArtifactRequirement(requirement)) {
      errors.push({
        path: "authority_report_paths:evidence",
        message:
          `Unsupported authority evidence artifact requirement; expected a repo-relative .json path: ${requirement}`,
      });
      continue;
    }

    const matchesRequirement = resolveEvidenceRequirementMatcher(requirement);
    if (!uniqueReportVisualRefs.some((ref) => matchesRequirement(ref))) {
      errors.push({
        path: `authority_report_paths:evidence`,
        message: `Authority reports are missing required ${requirement} visual evidence.`,
      });
    }
  }

  errors.push(
    ...validateRuntimeAuthoritySync({
      rootDir,
      slice: branchContext.slice,
      authorityReportPaths,
      reportArtifactRefs: uniqueReportArtifactRefs,
      reportVisualRefs: uniqueReportVisualRefs,
      stage4EvidenceRequirements,
    }),
  );

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
