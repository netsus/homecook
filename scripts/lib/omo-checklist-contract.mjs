import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SECTION_PATTERN = /^##\s+(.+)$/;
const SUBSECTION_PATTERN = /^###\s+(.+)$/;
const CHECKBOX_PATTERN = /^- \[([ xX])\]\s+(.+)$/;
const OMO_METADATA_PATTERN = /\s*<!--\s*omo:([^>]+?)\s*-->\s*$/;
const VALID_STAGES = new Set([2, 4]);
const VALID_SCOPES = new Set(["backend", "frontend", "shared"]);
const VALID_REVIEW_STAGES = new Set([3, 5, 6]);

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function resolveDocsRoot({ rootDir = process.cwd(), worktreePath = null } = {}) {
  if (typeof worktreePath === "string" && worktreePath.trim().length > 0) {
    return resolve(worktreePath.trim());
  }

  return resolve(rootDir);
}

function resolveWorkpackPaths({ rootDir = process.cwd(), worktreePath = null, slice }) {
  const docsRoot = resolveDocsRoot({ rootDir, worktreePath });
  const normalizedSlice = ensureNonEmptyString(slice, "slice");

  return {
    readmePath: resolve(docsRoot, "docs", "workpacks", normalizedSlice, "README.md"),
    acceptancePath: resolve(docsRoot, "docs", "workpacks", normalizedSlice, "acceptance.md"),
    automationSpecPath: resolve(docsRoot, "docs", "workpacks", normalizedSlice, "automation-spec.json"),
  };
}

function parseMetadataSegment(segment) {
  const [rawKey, ...rawValueParts] = String(segment ?? "").split("=");
  const key = rawKey?.trim() ?? "";
  const value = rawValueParts.join("=").trim();

  return {
    key,
    value,
  };
}

function parseMetadataComment({
  metadataSource,
  filePath,
  lineNumber,
}) {
  const segments = String(metadataSource ?? "")
    .split(";")
    .map((segment) => parseMetadataSegment(segment))
    .filter((entry) => entry.key.length > 0);
  const metadata = {
    id: null,
    stage: null,
    scope: null,
    review: [],
  };
  const errors = [];

  for (const segment of segments) {
    if (segment.key === "id") {
      metadata.id = segment.value || null;
      continue;
    }

    if (segment.key === "stage") {
      const stage = Number(segment.value);
      metadata.stage = Number.isInteger(stage) ? stage : null;
      continue;
    }

    if (segment.key === "scope") {
      metadata.scope = segment.value || null;
      continue;
    }

    if (segment.key === "review") {
      metadata.review = segment.value
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value));
      continue;
    }

    errors.push({
      path: `${filePath}:${lineNumber}`,
      message: `Unknown checklist metadata key '${segment.key}'.`,
    });
  }

  return {
    metadata,
    errors,
  };
}

function buildChecklistItem({
  filePath,
  lineNumber,
  source,
  section,
  subsection,
  checked,
  rawText,
  manualOnly,
}) {
  const metadataMatch = rawText.match(OMO_METADATA_PATTERN);
  const text = metadataMatch
    ? rawText.replace(OMO_METADATA_PATTERN, "").trim()
    : rawText.trim();
  const metadataResult =
    metadataMatch && metadataMatch[1]
      ? parseMetadataComment({
          metadataSource: metadataMatch[1],
          filePath,
          lineNumber,
        })
      : {
          metadata: null,
          errors: [],
        };

  return {
    item: {
      filePath,
      lineNumber,
      source,
      section,
      subsection,
      checked,
      text,
      manualOnly,
      metadata: metadataResult.metadata,
    },
    errors: metadataResult.errors,
  };
}

function parseDeliveryChecklist({ filePath }) {
  if (!existsSync(filePath)) {
    return {
      items: [],
      errors: [
        {
          path: filePath,
          message: "Delivery Checklist file is missing.",
        },
      ],
      missing: true,
    };
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const sectionIndex = lines.findIndex((line) => line.trim() === "## Delivery Checklist");
  if (sectionIndex === -1) {
    return {
      items: [],
      errors: [
        {
          path: filePath,
          message: "Delivery Checklist section is missing.",
        },
      ],
      missing: true,
    };
  }

  const nextSectionIndex = lines.findIndex(
    (line, index) => index > sectionIndex && /^##\s+/.test(line.trim()),
  );
  const endIndex = nextSectionIndex === -1 ? lines.length : nextSectionIndex;
  const items = [];
  const errors = [];

  for (let index = sectionIndex + 1; index < endIndex; index += 1) {
    const line = lines[index];
    const match = line.match(CHECKBOX_PATTERN);
    if (!match) {
      continue;
    }

    const { item, errors: itemErrors } = buildChecklistItem({
      filePath,
      lineNumber: index + 1,
      source: "readme",
      section: "Delivery Checklist",
      subsection: null,
      checked: match[1].toLowerCase() === "x",
      rawText: match[2],
      manualOnly: false,
    });
    items.push(item);
    errors.push(...itemErrors);
  }

  return {
    items,
    errors,
    missing: false,
  };
}

function parseAcceptanceChecklist({ filePath }) {
  if (!existsSync(filePath)) {
    return {
      items: [],
      errors: [
        {
          path: filePath,
          message: "Acceptance file is missing.",
        },
      ],
      missing: true,
    };
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const items = [];
  const errors = [];
  let currentSection = null;
  let currentSubsection = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    const sectionMatch = trimmed.match(SECTION_PATTERN);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      currentSubsection = null;
      continue;
    }

    const subsectionMatch = trimmed.match(SUBSECTION_PATTERN);
    if (subsectionMatch) {
      currentSubsection = subsectionMatch[1].trim();
      continue;
    }

    const checkboxMatch = trimmed.match(CHECKBOX_PATTERN);
    if (!checkboxMatch || !currentSection) {
      continue;
    }

    const manualOnly = currentSubsection === "Manual Only";
    const { item, errors: itemErrors } = buildChecklistItem({
      filePath,
      lineNumber: index + 1,
      source: "acceptance",
      section: currentSection,
      subsection: currentSubsection,
      checked: checkboxMatch[1].toLowerCase() === "x",
      rawText: checkboxMatch[2],
      manualOnly,
    });
    items.push(item);
    errors.push(...itemErrors);
  }

  return {
    items,
    errors,
    missing: false,
  };
}

export function validateChecklistContract(contract) {
  const errors = [...(Array.isArray(contract?.errors) ? contract.errors : [])];
  if (!contract || contract.mode !== "metadata_v1") {
    return errors;
  }

  const items = Array.isArray(contract.items) ? contract.items : [];
  const nonManualItems = items.filter((item) => !item.manualOnly);
  const ids = new Map();

  for (const item of nonManualItems) {
    if (!item.metadata) {
      errors.push({
        path: `${item.filePath}:${item.lineNumber}`,
        message: "Checklist metadata is required for non-Manual checklist items when automation-spec.json is present.",
      });
      continue;
    }

    if (typeof item.metadata.id !== "string" || item.metadata.id.trim().length === 0) {
      errors.push({
        path: `${item.filePath}:${item.lineNumber}`,
        message: "Checklist metadata must include a non-empty id.",
      });
    } else {
      const normalizedId = item.metadata.id.trim();
      if (ids.has(normalizedId)) {
        errors.push({
          path: `${item.filePath}:${item.lineNumber}`,
          message: `Duplicate checklist metadata id '${normalizedId}'.`,
        });
      } else {
        ids.set(normalizedId, true);
      }
    }

    if (!VALID_STAGES.has(item.metadata.stage)) {
      errors.push({
        path: `${item.filePath}:${item.lineNumber}`,
        message: "Checklist metadata stage must be 2 or 4.",
      });
    }

    if (!VALID_SCOPES.has(item.metadata.scope)) {
      errors.push({
        path: `${item.filePath}:${item.lineNumber}`,
        message: "Checklist metadata scope must be backend, frontend, or shared.",
      });
    }

    if (
      item.metadata.stage === 2 &&
      item.metadata.scope &&
      !["backend", "shared"].includes(item.metadata.scope)
    ) {
      errors.push({
        path: `${item.filePath}:${item.lineNumber}`,
        message: "Stage 2 checklist items can only use backend or shared scope.",
      });
    }

    if (
      item.metadata.stage === 4 &&
      item.metadata.scope &&
      !["frontend", "shared"].includes(item.metadata.scope)
    ) {
      errors.push({
        path: `${item.filePath}:${item.lineNumber}`,
        message: "Stage 4 checklist items can only use frontend or shared scope.",
      });
    }

    if (!Array.isArray(item.metadata.review) || item.metadata.review.length === 0) {
      errors.push({
        path: `${item.filePath}:${item.lineNumber}`,
        message: "Checklist metadata review must include at least one review stage.",
      });
    } else {
      for (const reviewStage of item.metadata.review) {
        if (!VALID_REVIEW_STAGES.has(reviewStage)) {
          errors.push({
            path: `${item.filePath}:${item.lineNumber}`,
            message: "Checklist metadata review can only include 3, 5, or 6.",
          });
        }
      }
    }

    if (
      Array.isArray(item.metadata.review) &&
      item.metadata.review.includes(3) &&
      item.metadata.stage !== 2
    ) {
      errors.push({
        path: `${item.filePath}:${item.lineNumber}`,
        message: "Review stage 3 can only be assigned to Stage 2-owned checklist items.",
      });
    }

    if (
      Array.isArray(item.metadata.review) &&
      item.metadata.review.includes(5) &&
      !(
        item.metadata.stage === 4 &&
        item.metadata.scope === "frontend"
      )
    ) {
      errors.push({
        path: `${item.filePath}:${item.lineNumber}`,
        message: "Review stage 5 can only be assigned to Stage 4-owned frontend checklist items.",
      });
    }
  }

  return errors;
}

export function readWorkpackChecklistContract({
  rootDir = process.cwd(),
  worktreePath = null,
  slice,
}) {
  const { readmePath, acceptancePath, automationSpecPath } = resolveWorkpackPaths({
    rootDir,
    worktreePath,
    slice,
  });
  const delivery = parseDeliveryChecklist({
    filePath: readmePath,
  });
  const acceptance = parseAcceptanceChecklist({
    filePath: acceptancePath,
  });
  const automationSpecExists = existsSync(automationSpecPath);
  const items = [...delivery.items, ...acceptance.items];
  const contract = {
    mode: automationSpecExists ? "metadata_v1" : "legacy",
    readmePath,
    acceptancePath,
    automationSpecPath,
    automationSpecExists,
    deliveryItems: delivery.items,
    acceptanceItems: acceptance.items,
    items,
    errors: [...delivery.errors, ...acceptance.errors],
  };

  return {
    ...contract,
    errors: validateChecklistContract(contract),
  };
}

export function isChecklistContractActive(contract) {
  return Boolean(contract?.mode === "metadata_v1");
}

export function resolveOwnedChecklistItems(contract, stage) {
  if (!isChecklistContractActive(contract)) {
    return [];
  }

  return contract.items.filter(
    (item) =>
      !item.manualOnly &&
      item.metadata &&
      item.metadata.stage === Number(stage),
  );
}

export function resolveReviewChecklistItems(contract, stage) {
  if (!isChecklistContractActive(contract)) {
    return [];
  }

  const normalizedStage = Number(stage);
  if (normalizedStage === 6) {
    return contract.items.filter((item) => !item.manualOnly);
  }

  if (normalizedStage === 5) {
    return contract.items.filter(
      (item) =>
        !item.manualOnly &&
        item.metadata &&
        item.metadata.scope === "frontend" &&
        item.metadata.review.includes(5),
    );
  }

  if (normalizedStage === 3) {
    return contract.items.filter(
      (item) =>
        !item.manualOnly &&
        item.metadata &&
        item.metadata.review.includes(3),
    );
  }

  return [];
}

export function resolveChecklistIds(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => item?.metadata?.id ?? null)
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

export function resolveUncheckedChecklistItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item && item.checked === false);
}
