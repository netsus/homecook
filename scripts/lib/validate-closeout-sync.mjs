import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveSliceBookkeepingPaths } from "./bookkeeping-authority.mjs";
import {
  resolveBaseRef,
  resolveWorkpackSlice,
} from "./check-workpack-docs.mjs";
import { projectCanonicalCloseoutToDocSurfaceSyncContract } from "./omo-closeout-state.mjs";
import {
  readSliceRoadmapStatus,
  readWorkpackDesignAuthority,
  readWorkpackDesignStatus,
} from "./omo-bookkeeping.mjs";
import { readAutomationSpec } from "./omo-automation-spec.mjs";
import {
  buildWorkpackChecklistContractFromSources,
  isChecklistContractActive,
  readWorkpackChecklistContract,
  resolveOwnedChecklistItems,
  resolveUncheckedChecklistItems,
} from "./omo-checklist-contract.mjs";
import {
  parseDraftState,
  resolveBranchName,
  resolveSliceBranchContext,
} from "./validator-shared.mjs";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
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

function resolveRemoteBaseRef(baseRef) {
  const normalized = typeof baseRef === "string" ? baseRef.trim() : "";
  if (normalized.startsWith("origin/") || normalized.startsWith("refs/")) {
    return normalized;
  }

  return `origin/${normalized || "master"}`;
}

function readGitFileAtRef({ rootDir, gitRef, relativePath }) {
  const result = spawnSync("git", ["show", `${gitRef}:${relativePath}`], {
    cwd: rootDir,
    encoding: "utf8",
  });

  return result.status === 0 ? result.stdout ?? "" : null;
}

function readBaseChecklistContractFromGit({
  rootDir,
  slice,
  baseRef,
}) {
  const gitRef = resolveRemoteBaseRef(baseRef);
  const readmePath = `docs/workpacks/${slice}/README.md`;
  const acceptancePath = `docs/workpacks/${slice}/acceptance.md`;
  const automationSpecPath = `docs/workpacks/${slice}/automation-spec.json`;
  const readmeContents = readGitFileAtRef({
    rootDir,
    gitRef,
    relativePath: readmePath,
  });
  const acceptanceContents = readGitFileAtRef({
    rootDir,
    gitRef,
    relativePath: acceptancePath,
  });

  if (readmeContents === null || acceptanceContents === null) {
    return null;
  }

  return buildWorkpackChecklistContractFromSources({
    readmePath,
    acceptancePath,
    automationSpecPath,
    automationSpecExists:
      readGitFileAtRef({
        rootDir,
        gitRef,
        relativePath: automationSpecPath,
      }) !== null,
    readmeContents,
    acceptanceContents,
  });
}

function extractSliceFromWorkpackDocPath(filePath) {
  const match = /^docs\/workpacks\/([^/]+)\/(?:README|acceptance)\.md$/.exec(filePath);
  if (!match) {
    return null;
  }

  return match[1] === "_template" ? null : match[1];
}

function extractSliceFromWorkItemPath(filePath) {
  const match = /^\.workflow-v2\/work-items\/([^/]+)\.json$/.exec(filePath);
  return match?.[1] ?? null;
}

function extractSlicesFromRoadmapDiff(diffText) {
  if (typeof diffText !== "string" || diffText.trim().length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      diffText
        .split(/\r?\n/)
        .map((line) => {
          const match = /^[+-]\|\s*`([^`]+)`\s*\|/.exec(line.trim());
          return match?.[1] ?? null;
        })
        .filter((slice) => typeof slice === "string" && slice !== "_template"),
    ),
  );
}

function listRoadmapChangedSlicesFromDiff({ rootDir, baseRef }) {
  if (typeof baseRef !== "string" || baseRef.trim().length === 0) {
    return [];
  }

  const result = spawnSync(
    "git",
    ["diff", "--unified=0", `origin/${baseRef}...HEAD`, "--", "docs/workpacks/README.md"],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    return [];
  }

  return extractSlicesFromRoadmapDiff(result.stdout ?? "");
}

function listTrackedCloseoutSlices({ rootDir }) {
  const workItemsDir = resolve(rootDir, ".workflow-v2", "work-items");
  if (!existsSync(workItemsDir)) {
    return [];
  }

  return Array.from(
    new Set(
      readdirSync(workItemsDir)
        .filter((fileName) => fileName.endsWith(".json"))
        .map((fileName) => {
          const filePath = resolve(workItemsDir, fileName);
          const workItem = readJson(filePath);
          if (!workItem?.closeout || typeof workItem.closeout !== "object" || Array.isArray(workItem.closeout)) {
            return null;
          }

          if (typeof workItem.id === "string" && workItem.id.trim().length > 0) {
            return workItem.id.trim();
          }

          return fileName.replace(/\.json$/, "");
        })
        .filter(Boolean),
    ),
  );
}

function resolveChangedSlices({
  rootDir,
  baseRef,
  changedFiles,
}) {
  const slices = new Set(
    changedFiles
      .map((filePath) => extractSliceFromWorkpackDocPath(filePath) ?? extractSliceFromWorkItemPath(filePath))
      .filter(Boolean),
  );

  if (changedFiles.includes("docs/workpacks/README.md")) {
    const roadmapSlices = listRoadmapChangedSlicesFromDiff({ rootDir, baseRef });
    const fallbackSlices = roadmapSlices.length > 0 ? roadmapSlices : listTrackedCloseoutSlices({ rootDir });

    for (const slice of fallbackSlices) {
      slices.add(slice);
    }
  }

  return Array.from(slices);
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

function readTrackedWorkItemCloseout({
  rootDir,
  slice,
}) {
  const filePath = resolve(rootDir, ".workflow-v2", "work-items", `${slice}.json`);
  if (!existsSync(filePath)) {
    return {
      closeout: null,
      filePath,
      missing: true,
      workItemId: slice,
    };
  }

  const workItem = readJson(filePath);
  return {
    closeout: workItem?.closeout ?? null,
    filePath,
    missing: false,
    workItemId: typeof workItem?.id === "string" && workItem.id.trim().length > 0 ? workItem.id.trim() : slice,
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

function indexNonManualChecklistItems(contract) {
  const items = Array.isArray(contract?.items) ? contract.items : [];
  return new Map(
    items
      .filter(
        (item) =>
          !item?.manualOnly &&
          typeof item?.metadata?.id === "string" &&
          item.metadata.id.trim().length > 0,
      )
      .map((item) => [item.metadata.id.trim(), item]),
  );
}

function checklistContractMetadata(item) {
  return {
    source: item?.source ?? null,
    text: item?.text ?? null,
    stage: item?.metadata?.stage ?? null,
    scope: item?.metadata?.scope ?? null,
    review: Array.isArray(item?.metadata?.review)
      ? [...item.metadata.review].sort((left, right) => left - right)
      : [],
  };
}

function checklistWaiverMetadata(item) {
  return {
    waived: item?.metadata?.waived === true,
    waived_by: item?.metadata?.waived_by ?? null,
    waived_stage: item?.metadata?.waived_stage ?? null,
    waived_reason: item?.metadata?.waived_reason ?? null,
  };
}

function isChecklistItemClosed(item) {
  return item?.checked === true || item?.metadata?.waived === true;
}

function checklistItemPath(item) {
  return `${item?.filePath}:${item?.lineNumber}`;
}

const REPAIRABLE_CHECKLIST_METADATA_FIELDS = ["id", "stage", "scope", "review"];

function checklistMetadataFieldValue(item, field) {
  const value = item?.metadata?.[field] ?? null;
  return field === "review" && Array.isArray(value)
    ? [...value].sort((left, right) => left - right)
    : value;
}

function diagnosedChecklistMetadataFields(error, item) {
  const message = error?.message ?? "";

  if (message === "Checklist metadata is required for non-Manual checklist items when automation-spec.json is present.") {
    if (
      item?.source === "acceptance" &&
      item?.section === "Manual Only" &&
      item?.subsection === null &&
      item?.manualOnly === false &&
      typeof item?.manualOnlyParentSection === "string" &&
      item.manualOnlyParentSection.length > 0
    ) {
      return { manualOnlyHeading: true, fields: [] };
    }

    return { manualOnlyHeading: false, fields: REPAIRABLE_CHECKLIST_METADATA_FIELDS };
  }

  if (
    message === "Checklist metadata must include a non-empty id." ||
    message.startsWith("Duplicate checklist metadata id '")
  ) {
    return { manualOnlyHeading: false, fields: ["id"] };
  }

  if (message === "Checklist metadata stage must be 2 or 4.") {
    return { manualOnlyHeading: false, fields: ["stage"] };
  }

  if (
    message === "Checklist metadata scope must be backend, frontend, or shared." ||
    message === "Stage 2 checklist items can only use backend or shared scope." ||
    message === "Stage 4 checklist items can only use frontend or shared scope."
  ) {
    return { manualOnlyHeading: false, fields: ["scope"] };
  }

  if (
    message === "Checklist metadata review must include at least one review stage." ||
    message === "Checklist metadata review can only include 3, 5, or 6."
  ) {
    return { manualOnlyHeading: false, fields: ["review"] };
  }

  if (message === "Review stage 3 can only be assigned to Stage 2-owned checklist items.") {
    return { manualOnlyHeading: false, fields: ["stage", "review"] };
  }

  if (message === "Review stage 5 can only be assigned to Stage 4-owned frontend checklist items.") {
    const fields = ["review"];
    if (item?.metadata?.stage !== 4) {
      fields.push("stage");
    }
    if (item?.metadata?.scope !== "frontend") {
      fields.push("scope");
    }
    return { manualOnlyHeading: false, fields };
  }

  return null;
}

function isCanonicalManualOnlyHeadingRepair(baseItem, currentItem) {
  return (
    baseItem?.source === "acceptance" &&
    baseItem?.section === "Manual Only" &&
    baseItem?.subsection === null &&
    baseItem?.manualOnly === false &&
    typeof baseItem?.manualOnlyParentSection === "string" &&
    baseItem.manualOnlyParentSection.length > 0 &&
    currentItem?.source === "acceptance" &&
    currentItem?.section === baseItem.manualOnlyParentSection &&
    currentItem?.subsection === "Manual Only" &&
    currentItem?.manualOnly === true &&
    currentItem?.manualOnlyParentSection === baseItem.manualOnlyParentSection &&
    baseItem?.lineNumber === currentItem?.lineNumber &&
    baseItem?.checked === currentItem?.checked &&
    JSON.stringify(baseItem?.metadata ?? null) ===
      JSON.stringify(currentItem?.metadata ?? null) &&
    JSON.stringify(checklistWaiverMetadata(baseItem)) ===
      JSON.stringify(checklistWaiverMetadata(currentItem))
  );
}

function normalizeRepairableBaseChecklistContract({ baseContract, currentContract }) {
  if (
    !Array.isArray(baseContract?.errors) ||
    baseContract.errors.length === 0 ||
    !Array.isArray(currentContract?.errors) ||
    currentContract.errors.length > 0
  ) {
    return null;
  }

  const baseItems = Array.isArray(baseContract.items) ? baseContract.items : [];
  const currentItems = Array.isArray(currentContract.items) ? currentContract.items : [];
  if (baseItems.length !== currentItems.length) {
    return null;
  }

  const baseItemPaths = new Set(baseItems.map((item) => checklistItemPath(item)));
  if (!baseContract.errors.every((error) => baseItemPaths.has(error?.path))) {
    return null;
  }

  const diagnosticsByPath = new Map();
  for (const error of baseContract.errors) {
    const diagnostics = diagnosticsByPath.get(error.path) ?? [];
    diagnostics.push(error);
    diagnosticsByPath.set(error.path, diagnostics);
  }
  const normalizedItems = [];

  for (let index = 0; index < baseItems.length; index += 1) {
    const baseItem = baseItems[index];
    const currentItem = currentItems[index];
    if (
      baseItem?.source !== currentItem?.source ||
      baseItem?.text !== currentItem?.text
    ) {
      return null;
    }

    const itemDiagnostics = diagnosticsByPath.get(checklistItemPath(baseItem)) ?? [];
    if (itemDiagnostics.length === 0) {
      if (
        baseItem.manualOnly !== currentItem.manualOnly ||
        baseItem.section !== currentItem.section ||
        baseItem.subsection !== currentItem.subsection ||
        JSON.stringify(checklistContractMetadata(baseItem)) !==
          JSON.stringify(checklistContractMetadata(currentItem)) ||
        JSON.stringify(checklistWaiverMetadata(baseItem)) !==
          JSON.stringify(checklistWaiverMetadata(currentItem))
      ) {
        return null;
      }
    } else {
      const diagnosedFields = new Set();
      let manualOnlyHeadingDiagnosed = false;
      for (const error of itemDiagnostics) {
        const diagnosis = diagnosedChecklistMetadataFields(error, baseItem);
        if (!diagnosis) {
          return null;
        }
        manualOnlyHeadingDiagnosed ||= diagnosis.manualOnlyHeading;
        for (const field of diagnosis.fields) {
          diagnosedFields.add(field);
        }
      }

      if (manualOnlyHeadingDiagnosed) {
        if (
          diagnosedFields.size > 0 ||
          !isCanonicalManualOnlyHeadingRepair(baseItem, currentItem)
        ) {
          return null;
        }
      } else if (currentItem.manualOnly) {
        return null;
      } else {
        if (
          baseItem.manualOnly !== currentItem.manualOnly ||
          baseItem.section !== currentItem.section ||
          baseItem.subsection !== currentItem.subsection ||
          !currentItem.metadata
        ) {
          return null;
        }

        for (const field of REPAIRABLE_CHECKLIST_METADATA_FIELDS) {
          if (
            !diagnosedFields.has(field) &&
            JSON.stringify(checklistMetadataFieldValue(baseItem, field)) !==
              JSON.stringify(checklistMetadataFieldValue(currentItem, field))
          ) {
            return null;
          }
        }

        if (
          JSON.stringify(checklistWaiverMetadata(baseItem)) !==
          JSON.stringify(checklistWaiverMetadata(currentItem))
        ) {
          return null;
        }
      }
    }

    normalizedItems.push({
      ...currentItem,
      checked: baseItem.checked,
    });
  }

  return {
    ...baseContract,
    items: normalizedItems,
    errors: [],
  };
}

function validateIncrementalBackendChecklist({
  slice,
  currentContract,
  baseContract,
}) {
  if (!baseContract) {
    return [
      {
        path: `docs/workpacks/${slice}`,
        message:
          `Ready-for-review backend slice '${slice}' requires the base checklist contract to verify incremental Stage 2 progress.`,
      },
    ];
  }

  if (!isChecklistContractActive(baseContract)) {
    return [
      {
        path: baseContract.automationSpecPath,
        message:
          `Ready-for-review backend slice '${slice}' requires automation-spec.json on the base branch before implementation.`,
      },
    ];
  }

  const comparableBaseContract =
    baseContract.errors.length > 0
      ? normalizeRepairableBaseChecklistContract({
          baseContract,
          currentContract,
        })
      : baseContract;

  if (!comparableBaseContract) {
    return [
      {
        path: baseContract.automationSpecPath,
        message:
          `Ready-for-review backend slice '${slice}' cannot compare against an invalid base checklist contract.`,
      },
    ];
  }

  const errors = [];
  const currentItems = indexNonManualChecklistItems(currentContract);
  const baseItems = indexNonManualChecklistItems(comparableBaseContract);
  const currentIds = [...currentItems.keys()].sort();
  const baseIds = [...baseItems.keys()].sort();

  if (JSON.stringify(currentIds) !== JSON.stringify(baseIds)) {
    errors.push({
      path: currentContract.automationSpecPath,
      message:
        "Incremental backend PRs must not add or remove checklist contract ids; update the Stage 1 contract in a preceding docs PR.",
    });
  }

  const newlyClosedStage2Ids = [];
  for (const [id, baseItem] of baseItems) {
    const currentItem = currentItems.get(id);
    if (!currentItem) {
      continue;
    }

    if (
      JSON.stringify(checklistContractMetadata(currentItem)) !==
      JSON.stringify(checklistContractMetadata(baseItem))
    ) {
      errors.push({
        path: `${currentItem.filePath}:${currentItem.lineNumber}`,
        message:
          `Incremental backend PRs must not change checklist contract metadata or text: ${id}`,
      });
      continue;
    }

    const baseClosed = isChecklistItemClosed(baseItem);
    const currentClosed = isChecklistItemClosed(currentItem);
    if (
      baseItem.metadata.waived === true &&
      JSON.stringify(checklistWaiverMetadata(currentItem)) !==
        JSON.stringify(checklistWaiverMetadata(baseItem))
    ) {
      errors.push({
        path: `${currentItem.filePath}:${currentItem.lineNumber}`,
        message:
          currentClosed
            ? `Incremental backend PRs must not change or remove existing waiver metadata: ${id}`
            : `Incremental backend PRs must not reopen a checklist item already completed on the base branch: ${id}`,
      });
      continue;
    }

    if (baseItem.checked === true && currentItem.checked === false) {
      errors.push({
        path: `${currentItem.filePath}:${currentItem.lineNumber}`,
        message:
          `Incremental backend PRs must not reopen a checklist item already completed on the base branch: ${id}`,
      });
      continue;
    }

    if (baseClosed === true && currentClosed === false) {
      errors.push({
        path: `${currentItem.filePath}:${currentItem.lineNumber}`,
        message:
          `Incremental backend PRs must not reopen a checklist item already completed on the base branch: ${id}`,
      });
      continue;
    }

    if (baseClosed === false && currentClosed === true) {
      if (currentItem.metadata.stage !== 2) {
        errors.push({
          path: `${currentItem.filePath}:${currentItem.lineNumber}`,
          message:
            `Backend PRs can only newly check Stage 2-owned checklist items: ${id}`,
        });
        continue;
      }

      newlyClosedStage2Ids.push(id);
    }
  }

  if (newlyClosedStage2Ids.length === 0) {
    errors.push({
      path: currentContract.automationSpecPath,
      message:
        "Ready-for-review backend PRs must newly close at least one Stage 2-owned checklist item relative to the base branch.",
    });
  }

  return errors;
}

function resolveChecklistSurfaceStatus(items) {
  return resolveUncheckedChecklistItems(items).length > 0 ? "pending" : "complete";
}

function validateCanonicalCloseoutDocSurfaceSync({
  rootDir,
  slice,
  strictMode,
  changedFiles,
}) {
  const trackedCloseout = readTrackedWorkItemCloseout({
    rootDir,
    slice,
  });
  if (trackedCloseout.missing) {
    return [];
  }

  if (!trackedCloseout.closeout) {
    const workItemRelativePath = `.workflow-v2/work-items/${slice}.json`;
    const workItemChanged = Array.isArray(changedFiles) && changedFiles.includes(workItemRelativePath);
    return strictMode === "merged" && workItemChanged
      ? [
          {
            path: trackedCloseout.filePath,
            message:
              `Merged slice '${slice}' requires canonical closeout snapshot at \`${trackedCloseout.filePath}#closeout\`.`,
          },
        ]
      : [];
  }

  const projection = projectCanonicalCloseoutToDocSurfaceSyncContract(trackedCloseout.closeout, {
    workItemId: trackedCloseout.workItemId,
  });
  if (!projection) {
    return [];
  }

  const canonicalSource = projection.canonical_source ?? `${trackedCloseout.filePath}#closeout`;
  const roadmapStatus = readSliceRoadmapStatus({
    rootDir,
    slice,
  });
  const designStatus = readWorkpackDesignStatus({
    rootDir,
    slice,
  });
  const designAuthority = readWorkpackDesignAuthority({
    rootDir,
    slice,
  });
  const checklistContract = readWorkpackChecklistContract({
    rootDir,
    slice,
  });
  const errors = [];

  if (
    !roadmapStatus.missing
    && projection.readme.roadmap_status
    && roadmapStatus.status !== projection.readme.roadmap_status
  ) {
    errors.push({
      path: roadmapStatus.filePath,
      message:
        `Roadmap status must match canonical closeout projection '${projection.readme.roadmap_status}' from \`${canonicalSource}\`.`,
    });
  }

  if (
    !designStatus.missing
    && projection.readme.design_status
    && designStatus.status !== projection.readme.design_status
  ) {
    errors.push({
      path: designStatus.filePath,
      message:
        `Design Status must match canonical closeout projection '${projection.readme.design_status}' from \`${canonicalSource}\`.`,
    });
  }

  if (
    !designAuthority.missing
    && projection.readme.design_authority_status
    && designAuthority.authorityStatus !== projection.readme.design_authority_status
  ) {
    errors.push({
      path: designAuthority.filePath,
      message:
        `Design Authority status must match canonical closeout projection '${projection.readme.design_authority_status}' from \`${canonicalSource}\`.`,
    });
  }

  if (checklistContract.errors.length === 0 && projection.readme.delivery_checklist_status) {
    const deliveryChecklistStatus = resolveChecklistSurfaceStatus(checklistContract.deliveryItems);
    if (deliveryChecklistStatus !== projection.readme.delivery_checklist_status) {
      errors.push({
        path: checklistContract.readmePath,
        message:
          `Delivery Checklist closeout must match canonical closeout projection '${projection.readme.delivery_checklist_status}' from \`${canonicalSource}\`.`,
      });
    }
  }

  if (checklistContract.errors.length === 0 && projection.acceptance.status) {
    const acceptanceStatus = resolveChecklistSurfaceStatus(
      checklistContract.acceptanceItems.filter((item) => !item.manualOnly),
    );
    if (acceptanceStatus !== projection.acceptance.status) {
      errors.push({
        path: checklistContract.acceptancePath,
        message:
          `Acceptance closeout must match canonical closeout projection '${projection.acceptance.status}' from \`${canonicalSource}\`.`,
      });
    }
  }

  return errors;
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

  if (["ready-for-review", "merged"].includes(strictMode)) {
    const missingReports = reportPaths.filter((reportPath) => !existsSync(resolve(rootDir, reportPath)));
    if (missingReports.length > 0) {
      errors.push({
        path: authority.filePath,
        message: `Authority-required slice '${slice}' is missing authority reports: ${missingReports.join(", ")}.`,
      });
    }
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
  baseChecklistContract,
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

    errors.push(
      ...validateIncrementalBackendChecklist({
        slice,
        currentContract: checklistContract,
        baseContract: baseChecklistContract,
      }),
    );
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
  baseChecklistContract,
}) {
  const checklistContract = readWorkpackChecklistContract({
    rootDir,
    slice,
  });

  if (
    strictMode === "backend-ready-for-review" &&
    isChecklistContractActive(baseChecklistContract) &&
    !isChecklistContractActive(checklistContract)
  ) {
    return [
      {
        path: checklistContract.automationSpecPath,
        message:
          `Ready-for-review backend slice '${slice}' must keep automation-spec.json; removing it cannot downgrade the incremental checklist gate.`,
      },
    ];
  }

  if (isChecklistContractActive(checklistContract)) {
    return validateChecklistContractSlice({
      rootDir,
      slice,
      roadmapStatus,
      strictMode,
      baseChecklistContract,
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
 *   readBaseChecklistContract?: (input: {
 *     rootDir: string;
 *     slice: string;
 *     baseRef: string;
 *   }) => ReturnType<typeof readWorkpackChecklistContract> | null;
 * }} [options]
 */
export function validateCloseoutSync({
  rootDir = process.cwd(),
  env = process.env,
  changedFiles = null,
  readBaseChecklistContract = readBaseChecklistContractFromGit,
} = {}) {
  const branchName = resolveBranchName({ rootDir, env });
  const baseRef = resolveBaseRef(env, spawnSync) ?? "master";
  const branchContext = resolveSliceBranchContext(branchName, {
    includeBackend: true,
  });
  if (branchContext.kind === "feature-be" || branchContext.kind === "feature-fe") {
    branchContext.slice = resolveWorkpackSlice({
      slice: branchContext.slice,
      baseRef,
      spawnSyncFn: (command, args, options) =>
        spawnSync(command, args, {
          ...options,
          cwd: rootDir,
        }),
    });
  }
  const resolvedChangedFiles =
    Array.isArray(changedFiles) && changedFiles.length >= 0
      ? changedFiles
      : listChangedFilesAgainstBase({ rootDir, baseRef });
  const changedSlices = resolveChangedSlices({
    rootDir,
    baseRef,
    changedFiles: resolvedChangedFiles,
  });
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
      baseChecklistContract:
        strictMode === "backend-ready-for-review"
          ? readBaseChecklistContract({
              rootDir,
              slice,
              baseRef,
            })
          : null,
    });
    errors.push(
      ...validateCanonicalCloseoutDocSurfaceSync({
        rootDir,
        slice,
        strictMode,
        changedFiles: resolvedChangedFiles,
      }),
    );

    if (errors.length > 0) {
      results.push({
        name: `closeout-sync:${slice}`,
        errors,
      });
    }
  }

  return results;
}
