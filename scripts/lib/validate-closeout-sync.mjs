import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveSliceBookkeepingPaths } from "./bookkeeping-authority.mjs";
import { resolveBaseRef } from "./check-workpack-docs.mjs";
import {
  readSliceRoadmapStatus,
  readWorkpackDesignAuthority,
  readWorkpackDesignStatus,
} from "./omo-bookkeeping.mjs";
import { readAutomationSpec } from "./omo-automation-spec.mjs";
import {
  isChecklistContractActive,
  readWorkpackChecklistContract,
  resolveOwnedChecklistItems,
  resolveUncheckedChecklistItems,
} from "./omo-checklist-contract.mjs";

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

function listChangedFilesAgainstBase({ rootDir, baseRef }) {
  if (typeof baseRef !== "string" || baseRef.trim().length === 0) {
    return [];
  }

  const result = spawnSync("git", ["diff", "--name-only", `origin/${baseRef}...HEAD`], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return [];
  }

  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveBranchContext(branchName) {
  const featureMatch = /^feature\/(be|fe)-(.+)$/.exec(branchName);
  if (featureMatch) {
    return {
      kind: `feature-${featureMatch[1]}`,
      slice: featureMatch[2],
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

function resolveChangedSlices(changedFiles) {
  return Array.from(
    new Set(
      changedFiles
        .map((filePath) => {
          const match = /^docs\/workpacks\/([^/]+)\/(?:README|acceptance)\.md$/.exec(filePath);
          if (!match) {
            return null;
          }

          return match[1] === "_template" ? null : match[1];
        })
        .filter(Boolean),
    ),
  );
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

function readLines(filePath) {
  return readFileSync(filePath, "utf8").split(/\r?\n/);
}

function parseChecklistSection({ filePath, sectionHeading }) {
  if (!existsSync(filePath)) {
    return {
      filePath,
      missing: true,
      reason: "file_missing",
      unchecked: [],
    };
  }

  const lines = readLines(filePath);
  const startIndex = lines.findIndex((line) => line.trim() === sectionHeading);
  if (startIndex === -1) {
    return {
      filePath,
      missing: true,
      reason: "section_missing",
      unchecked: [],
    };
  }

  const nextSectionIndex = lines.findIndex(
    (line, index) => index > startIndex && /^##\s+/.test(line.trim()),
  );
  const endIndex = nextSectionIndex === -1 ? lines.length : nextSectionIndex;
  const unchecked = [];

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const line = lines[index];
    const match = /^- \[ \]\s+(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    unchecked.push({
      lineNumber: index + 1,
      text: match[1].trim(),
    });
  }

  return {
    filePath,
    missing: false,
    reason: null,
    unchecked,
  };
}

function parseAcceptanceChecklist(filePath) {
  if (!existsSync(filePath)) {
    return {
      filePath,
      missing: true,
      reason: "file_missing",
      unchecked: [],
    };
  }

  const lines = readLines(filePath);
  let currentSubsection = null;
  const unchecked = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (/^##\s+/.test(trimmed)) {
      currentSubsection = null;
    } else if (/^###\s+/.test(trimmed)) {
      currentSubsection = trimmed.replace(/^###\s+/, "");
    }

    const match = /^- \[ \]\s+(.*)$/.exec(trimmed);
    if (!match) {
      continue;
    }

    if (currentSubsection === "Manual Only") {
      continue;
    }

    unchecked.push({
      lineNumber: index + 1,
      text: match[1].trim(),
    });
  }

  return {
    filePath,
    missing: false,
    reason: null,
    unchecked,
  };
}

function resolveWorkpackPaths({ rootDir, slice }) {
  const { readmePath, acceptancePath } = resolveSliceBookkeepingPaths({
    rootDir,
    slice,
  });

  return {
    readmePath,
    acceptancePath,
  };
}

function pushMissingSectionError(errors, parsedSection, label) {
  if (!parsedSection.missing) {
    return;
  }

  errors.push({
    path: parsedSection.filePath,
    message:
      parsedSection.reason === "section_missing"
        ? `${label} section is missing.`
        : `${label} file is missing.`,
  });
}

function buildChecklistErrors({ entries, filePath, reason }) {
  return entries.map((entry) => ({
    path: `${filePath}:${entry.lineNumber}`,
    message: `${reason}: ${entry.text}`,
  }));
}

function buildContractErrors(contract) {
  return (contract?.errors ?? []).map((error) => ({
    path: error.path,
    message: error.message,
  }));
}

function buildScopedChecklistErrors({ items, reason }) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    path: `${item.filePath}:${item.lineNumber}`,
    message: `${reason}: ${item.text}`,
  }));
}

function validateDesignAuthority({
  rootDir,
  slice,
  strictMode,
}) {
  const { automationSpec } = readAutomationSpec({
    rootDir,
    slice,
    required: false,
  });
  const designAuthorityConfig = automationSpec?.frontend?.design_authority ?? null;
  if (!designAuthorityConfig?.authority_required) {
    return [];
  }

  const authority = readWorkpackDesignAuthority({
    rootDir,
    slice,
  });
  const errors = [];

  if (authority.missing) {
    errors.push({
      path: authority.filePath,
      message: `Authority-required slice '${slice}' must define README Design Authority section.`,
    });
    return errors;
  }

  const reportPaths = Array.isArray(designAuthorityConfig.authority_report_paths)
    ? designAuthorityConfig.authority_report_paths
    : [];
  if (reportPaths.length === 0) {
    errors.push({
      path: authority.filePath,
      message: `Authority-required slice '${slice}' must declare authority_report_paths in automation-spec.json.`,
    });
  }

  const missingReports = reportPaths.filter((reportPath) => !existsSync(resolve(rootDir, reportPath)));
  if (missingReports.length > 0) {
    errors.push({
      path: authority.filePath,
      message: `Authority-required slice '${slice}' is missing authority reports: ${missingReports.join(", ")}.`,
    });
  }

  if (strictMode === "merged") {
    if (authority.authorityStatus !== "reviewed") {
      errors.push({
        path: authority.filePath,
        message: `Merged authority-required slice '${slice}' requires Design Authority status 'reviewed'.`,
      });
    }

    const nonPassingReports = reportPaths.filter((reportPath) => {
      const fullPath = resolve(rootDir, reportPath);
      if (!existsSync(fullPath)) {
        return true;
      }

      return !/verdict:\s*`?pass`?/i.test(readFileSync(fullPath, "utf8"));
    });
    if (nonPassingReports.length > 0) {
      errors.push({
        path: authority.filePath,
        message: `Merged authority-required slice '${slice}' requires final authority verdict 'pass' in: ${nonPassingReports.join(", ")}.`,
      });
    }
  }

  return errors;
}

function validateChecklistContractSlice({
  rootDir,
  slice,
  roadmapStatus,
  strictMode,
}) {
  const errors = [];
  const designStatus = readWorkpackDesignStatus({
    rootDir,
    slice,
  });
  const checklistContract = readWorkpackChecklistContract({
    rootDir,
    slice,
  });

  errors.push(...buildContractErrors(checklistContract));

  if (strictMode === "backend-ready-for-review") {
    if (!["in-progress", "merged"].includes(roadmapStatus.status ?? "")) {
      errors.push({
        path: roadmapStatus.filePath,
        message: `Ready-for-review backend slice '${slice}' must be 'in-progress' or 'merged' in docs/workpacks/README.md.`,
      });
    }

    const uncheckedStage2Items = resolveUncheckedChecklistItems(
      resolveOwnedChecklistItems(checklistContract, 2),
    );
    if (uncheckedStage2Items.length > 0) {
      errors.push(
        ...buildScopedChecklistErrors({
          items: uncheckedStage2Items,
          reason: "Stage 2-owned checklist item must be checked before backend ready-for-review",
        }),
      );
    }
  }

  if (strictMode === "ready-for-review") {
    if (!["in-progress", "merged"].includes(roadmapStatus.status ?? "")) {
      errors.push({
        path: roadmapStatus.filePath,
        message: `Ready-for-review frontend slice '${slice}' must be 'in-progress' or 'merged' in docs/workpacks/README.md.`,
      });
    }

    if (!["pending-review", "confirmed", "N/A"].includes(designStatus.status ?? "")) {
      errors.push({
        path: designStatus.filePath,
        message: `Ready-for-review frontend slice '${slice}' requires Design Status 'pending-review', 'confirmed', or 'N/A'.`,
      });
    }

    const uncheckedStage4Items = resolveUncheckedChecklistItems(
      resolveOwnedChecklistItems(checklistContract, 4),
    );
    if (uncheckedStage4Items.length > 0) {
      errors.push(
        ...buildScopedChecklistErrors({
          items: uncheckedStage4Items,
          reason: "Stage 4-owned checklist item must be checked before frontend ready-for-review",
        }),
      );
    }
  }

  if (strictMode === "merged") {
    if (roadmapStatus.status !== "merged") {
      errors.push({
        path: roadmapStatus.filePath,
        message: `Merged slice '${slice}' must be marked 'merged' in docs/workpacks/README.md.`,
      });
    }

    if (!["confirmed", "N/A"].includes(designStatus.status ?? "")) {
      errors.push({
        path: designStatus.filePath,
        message: `Merged slice '${slice}' requires Design Status 'confirmed' or 'N/A'.`,
      });
    }

    const uncheckedNonManualItems = resolveUncheckedChecklistItems(
      checklistContract.items.filter((item) => !item.manualOnly),
    );
    if (uncheckedNonManualItems.length > 0) {
      errors.push(
        ...buildScopedChecklistErrors({
          items: uncheckedNonManualItems,
          reason: "Checklist item outside Manual Only must be checked before merge closeout",
        }),
      );
    }
  }

  errors.push(
    ...validateDesignAuthority({
      rootDir,
      slice,
      strictMode,
    }),
  );

  return errors;
}

function validateStrictSlice({
  rootDir,
  slice,
  roadmapStatus,
  strictMode,
}) {
  const checklistContract = readWorkpackChecklistContract({
    rootDir,
    slice,
  });

  if (isChecklistContractActive(checklistContract)) {
    return validateChecklistContractSlice({
      rootDir,
      slice,
      roadmapStatus,
      strictMode,
    });
  }

  const errors = [];
  const { readmePath, acceptancePath } = resolveWorkpackPaths({ rootDir, slice });
  const designStatus = readWorkpackDesignStatus({
    rootDir,
    slice,
  });
  const deliveryChecklist = parseChecklistSection({
    filePath: readmePath,
    sectionHeading: "## Delivery Checklist",
  });
  const acceptanceChecklist = parseAcceptanceChecklist(acceptancePath);

  if (strictMode === "ready-for-review") {
    if (!["in-progress", "merged"].includes(roadmapStatus.status ?? "")) {
      errors.push({
        path: roadmapStatus.filePath,
        message: `Ready-for-review frontend slice '${slice}' must be 'in-progress' or 'merged' in docs/workpacks/README.md.`,
      });
    }

    if (!["pending-review", "confirmed", "N/A"].includes(designStatus.status ?? "")) {
      errors.push({
        path: designStatus.filePath,
        message: `Ready-for-review frontend slice '${slice}' requires Design Status 'pending-review', 'confirmed', or 'N/A'.`,
      });
    }
  }

  if (strictMode === "merged") {
    if (roadmapStatus.status !== "merged") {
      errors.push({
        path: roadmapStatus.filePath,
        message: `Merged slice '${slice}' must be marked 'merged' in docs/workpacks/README.md.`,
      });
    }

    if (!["confirmed", "N/A"].includes(designStatus.status ?? "")) {
      errors.push({
        path: designStatus.filePath,
        message: `Merged slice '${slice}' requires Design Status 'confirmed' or 'N/A'.`,
      });
    }
  }

  pushMissingSectionError(errors, deliveryChecklist, "Delivery Checklist");
  pushMissingSectionError(errors, acceptanceChecklist, "Acceptance");

  if (deliveryChecklist.unchecked.length > 0) {
    errors.push(
      ...buildChecklistErrors({
        entries: deliveryChecklist.unchecked,
        filePath: deliveryChecklist.filePath,
        reason: "Delivery Checklist item must be checked before closeout-ready review or merge",
      }),
    );
  }

  if (acceptanceChecklist.unchecked.length > 0) {
    errors.push(
      ...buildChecklistErrors({
        entries: acceptanceChecklist.unchecked,
        filePath: acceptanceChecklist.filePath,
        reason: "Acceptance item outside Manual Only must be checked before closeout-ready review or merge",
      }),
    );
  }

  return errors;
}

/**
 * @param {{
 *   rootDir?: string;
 *   env?: NodeJS.ProcessEnv & { PR_IS_DRAFT?: string | boolean };
 *   changedFiles?: string[] | null;
 * }} [options]
 */
export function validateCloseoutSync({
  rootDir = process.cwd(),
  env = process.env,
  changedFiles = null,
} = {}) {
  const branchName = resolveBranchName(rootDir, env);
  const branchContext = resolveBranchContext(branchName);
  const baseRef = resolveBaseRef(env, spawnSync) ?? "master";
  const resolvedChangedFiles =
    Array.isArray(changedFiles) && changedFiles.length >= 0
      ? changedFiles
      : listChangedFilesAgainstBase({ rootDir, baseRef });
  const changedSlices = resolveChangedSlices(resolvedChangedFiles);
  const slices = new Set(changedSlices);
  const prIsDraft = parseDraftState(env.PR_IS_DRAFT);

  if (branchContext.slice) {
    slices.add(branchContext.slice);
  }

  const results = [];

  for (const slice of slices) {
    const roadmapStatus = readSliceRoadmapStatus({
      rootDir,
      slice,
    });

    let strictMode = null;
    if (roadmapStatus.status === "merged") {
      strictMode = "merged";
    } else if (
      branchContext.kind === "feature-be" &&
      branchContext.slice === slice &&
      prIsDraft === false
    ) {
      strictMode = "backend-ready-for-review";
    } else if (
      branchContext.kind === "feature-fe" &&
      branchContext.slice === slice &&
      prIsDraft === false
    ) {
      strictMode = "ready-for-review";
    } else if (branchContext.kind === "omo-closeout" && branchContext.slice === slice) {
      strictMode = "merged";
    }

    if (!strictMode) {
      continue;
    }

    const errors = validateStrictSlice({
      rootDir,
      slice,
      roadmapStatus,
      strictMode,
    });

    if (errors.length > 0) {
      results.push({
        name: `closeout-sync:${slice}`,
        errors,
      });
    }
  }

  return results;
}
