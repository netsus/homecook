import { resolve } from "node:path";

export const BOOKKEEPING_AUTHORITY_DOC_PATH = "docs/engineering/bookkeeping-authority-matrix.md";

/**
 * @typedef {{
 *   slice?: string | null;
 *   workItemId?: string | null;
 * }} BookkeepingMatrixOptions
 */

/**
 * @typedef {{
 *   rootDir?: string;
 *   worktreePath?: string | null;
 *   slice?: string | null;
 *   workItemId?: string | null;
 * }} CloseoutPathOptions
 */

const BOOKKEEPING_SURFACES = Object.freeze([
  {
    id: "roadmap_status",
    label: "roadmap status",
    relativePathTemplate: "docs/workpacks/README.md",
    authorityClass: "authoritative-doc",
    primaryWriter: "slice stage owner / closeout writer",
    repairScope: "declared-closeout-sync",
    closeoutBranchWritable: true,
    projectionTargets: ["validate:closeout-sync", "PR body Closeout Sync", "validate:omo-bookkeeping"],
  },
  {
    id: "design_status",
    label: "workpack Design Status",
    relativePathTemplate: "docs/workpacks/{slice}/README.md",
    authorityClass: "authoritative-doc",
    primaryWriter: "frontend stage owner / closeout writer",
    repairScope: "declared-closeout-sync",
    closeoutBranchWritable: true,
    projectionTargets: ["validate:closeout-sync", "validate:omo-bookkeeping"],
  },
  {
    id: "delivery_checklist",
    label: "README Delivery Checklist",
    relativePathTemplate: "docs/workpacks/{slice}/README.md",
    authorityClass: "authoritative-doc",
    primaryWriter: "stage owner / closeout writer",
    repairScope: "declared-closeout-sync",
    closeoutBranchWritable: true,
    projectionTargets: ["validate:closeout-sync", "PR body Closeout Sync"],
  },
  {
    id: "design_authority_status",
    label: "README Design Authority status",
    relativePathTemplate: "docs/workpacks/{slice}/README.md",
    authorityClass: "authoritative-doc",
    primaryWriter: "Claude final authority gate / closeout writer",
    repairScope: "declared-closeout-sync",
    closeoutBranchWritable: true,
    projectionTargets: ["validate:closeout-sync", "validate:authority-evidence-presence"],
  },
  {
    id: "acceptance_closeout",
    label: "acceptance checklist closeout",
    relativePathTemplate: "docs/workpacks/{slice}/acceptance.md",
    authorityClass: "authoritative-doc",
    primaryWriter: "stage owner / closeout writer",
    repairScope: "declared-closeout-sync",
    closeoutBranchWritable: true,
    projectionTargets: ["validate:closeout-sync", "PR body Closeout Sync"],
  },
  {
    id: "automation_spec_closeout_metadata",
    label: "automation-spec closeout metadata",
    relativePathTemplate: "docs/workpacks/{slice}/automation-spec.json",
    authorityClass: "slice-local execution contract",
    primaryWriter: "Stage 1 workpack author with closeout metadata sync by OMO",
    repairScope: "closeout-evidence-only",
    closeoutBranchWritable: true,
    projectionTargets: ["validate:closeout-sync", "validate:authority-evidence-presence"],
  },
  {
    id: "tracked_status",
    label: "workflow-v2 tracked status",
    relativePathTemplate: ".workflow-v2/status.json",
    authorityClass: "tracked-state",
    primaryWriter: "OMO supervisor / workflow-v2 maintainer",
    repairScope: "runtime-only",
    closeoutBranchWritable: false,
    projectionTargets: ["validate:omo-bookkeeping", "omo:status"],
  },
  {
    id: "tracked_work_item",
    label: "workflow-v2 work item contract",
    relativePathTemplate: ".workflow-v2/work-items/{workItemId}.json",
    authorityClass: "tracked-state",
    primaryWriter: "workflow-v2 maintainer",
    repairScope: "runtime-only",
    closeoutBranchWritable: false,
    projectionTargets: ["validate:workflow-v2", "OMO dispatch"],
  },
  {
    id: "runtime_state",
    label: "OMO runtime state",
    relativePathTemplate: ".opencode/omo-runtime/{workItemId}.json",
    authorityClass: "runtime-state",
    primaryWriter: "OMO runtime",
    repairScope: "runtime-only",
    closeoutBranchWritable: false,
    projectionTargets: ["omo:status", "omo:reconcile"],
  },
  {
    id: "pr_body_evidence",
    label: "PR body closeout evidence",
    relativePathTemplate: null,
    authorityClass: "projection",
    primaryWriter: "PR author / closeout author",
    repairScope: "generated-evidence",
    closeoutBranchWritable: false,
    projectionTargets: ["GitHub PR UI", "reviewers"],
  },
]);

function replaceTemplateVariables(template, variables) {
  if (typeof template !== "string") {
    return null;
  }

  return template.replace(/\{(slice|workItemId)\}/g, (_, key) => variables[key] ?? `{${key}}`);
}

/**
 * @param {BookkeepingMatrixOptions} [options]
 */
export function resolveBookkeepingAuthorityMatrix({
  slice = null,
  workItemId = null,
} = {}) {
  const normalizedSlice = typeof slice === "string" && slice.trim().length > 0 ? slice.trim() : null;
  const normalizedWorkItemId =
    typeof workItemId === "string" && workItemId.trim().length > 0
      ? workItemId.trim()
      : normalizedSlice;

  return BOOKKEEPING_SURFACES.map((surface) => ({
    ...surface,
    relativePath: replaceTemplateVariables(surface.relativePathTemplate, {
      slice: normalizedSlice,
      workItemId: normalizedWorkItemId,
    }),
  }));
}

/**
 * @param {BookkeepingMatrixOptions} [options]
 */
export function resolveCloseoutWritableRelativePaths({ slice, workItemId = null } = {}) {
  return Array.from(
    new Set(
      resolveBookkeepingAuthorityMatrix({ slice, workItemId })
        .filter((surface) => surface.closeoutBranchWritable && typeof surface.relativePath === "string")
        .map((surface) => surface.relativePath),
    ),
  );
}

/**
 * @param {CloseoutPathOptions} [options]
 */
export function resolveCloseoutWritableAbsolutePaths({
  rootDir = process.cwd(),
  worktreePath = null,
  slice,
  workItemId = null,
} = {}) {
  const resolvedRoot =
    typeof worktreePath === "string" && worktreePath.trim().length > 0 ? worktreePath.trim() : rootDir;

  return new Set(
    resolveCloseoutWritableRelativePaths({ slice, workItemId }).map((relativePath) =>
      resolve(resolvedRoot, relativePath),
    ),
  );
}

/**
 * @param {{
 *   rootDir?: string;
 *   slice: string;
 * }} [options]
 */
export function resolveSliceBookkeepingPaths({
  rootDir = process.cwd(),
  slice,
} = {}) {
  const normalizedSlice = typeof slice === "string" && slice.trim().length > 0 ? slice.trim() : null;
  if (!normalizedSlice) {
    throw new Error("slice must be a non-empty string.");
  }

  return {
    roadmapPath: resolve(rootDir, "docs", "workpacks", "README.md"),
    readmePath: resolve(rootDir, "docs", "workpacks", normalizedSlice, "README.md"),
    acceptancePath: resolve(rootDir, "docs", "workpacks", normalizedSlice, "acceptance.md"),
    automationSpecPath: resolve(rootDir, "docs", "workpacks", normalizedSlice, "automation-spec.json"),
  };
}

/**
 * @param {BookkeepingMatrixOptions} [options]
 */
export function describeCloseoutWritableSurfaces({ slice } = {}) {
  const scopedPaths = resolveCloseoutWritableRelativePaths({ slice });
  const describedPaths = scopedPaths.map((filePath) => `\`${filePath}\``).join(", ");

  return `Closeout PR must only modify declared bookkeeping surfaces: ${describedPaths}. See ${BOOKKEEPING_AUTHORITY_DOC_PATH}.`;
}

/**
 * @param {BookkeepingMatrixOptions} [options]
 */
export function describeCloseoutWritableScopeForPr({ slice } = {}) {
  const scopedPaths = resolveCloseoutWritableRelativePaths({ slice });
  return scopedPaths.map((filePath) => `\`${filePath}\``).join(", ");
}
