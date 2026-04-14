import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const GATE_STATUSES = new Set(["pending", "in_progress", "partial", "pass", "blocked"]);
const PROMOTION_GATE_STATUSES = new Set(["not-ready", "candidate", "ready"]);

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value.trim().length > 0))];
}

export function resolvePromotionEvidencePath(rootDir = process.cwd()) {
  return resolve(rootDir, ".workflow-v2", "promotion-evidence.json");
}

export function readPromotionEvidence(rootDir = process.cwd()) {
  const filePath = resolvePromotionEvidencePath(rootDir);
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }

  return {
    filePath,
    data: JSON.parse(readFileSync(filePath, "utf8")),
  };
}

function writePromotionEvidence(filePath, data) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function resolveSectionCollection(data, section) {
  if (section === "documentation-gate") {
    return data.documentation_gates;
  }
  if (section === "operational-gate") {
    return data.operational_gates;
  }
  if (section === "pilot-lane") {
    return data.pilot_lanes;
  }

  return null;
}

function assertGateStatus(status, section) {
  const normalizedStatus = ensureNonEmptyString(status, "status");
  if (!GATE_STATUSES.has(normalizedStatus)) {
    throw new Error(`${section} status must be one of: ${[...GATE_STATUSES].join(", ")}`);
  }

  return normalizedStatus;
}

function assertPromotionGateStatus(status) {
  const normalizedStatus = ensureNonEmptyString(status, "status");
  if (!PROMOTION_GATE_STATUSES.has(normalizedStatus)) {
    throw new Error(`promotion-gate status must be one of: ${[...PROMOTION_GATE_STATUSES].join(", ")}`);
  }

  return normalizedStatus;
}

/**
 * @param {{
 *   rootDir?: string,
 *   section: "documentation-gate" | "operational-gate" | "pilot-lane" | "promotion-gate",
 *   id?: string,
 *   status: string,
 *   note?: string,
 *   evidenceRefs?: string[],
 *   workpackRefs?: string[],
 *   checkpointRefs?: string[],
 *   blockers?: string[],
 *   clearBlockers?: boolean,
 *   nextReviewTrigger?: string,
 *   now?: string,
 * }} options
 */
export function updatePromotionEvidence({
  rootDir = process.cwd(),
  section,
  id,
  status,
  note,
  evidenceRefs = [],
  workpackRefs = [],
  checkpointRefs = [],
  blockers = [],
  clearBlockers = false,
  nextReviewTrigger,
  now,
} = {}) {
  const normalizedSection = ensureNonEmptyString(section, "section");
  const { filePath, data } = readPromotionEvidence(rootDir);
  const timestamp = typeof now === "string" && now.trim().length > 0 ? now.trim() : new Date().toISOString();

  if (normalizedSection === "promotion-gate") {
    data.promotion_gate.status = assertPromotionGateStatus(status);
    if (typeof note === "string" && note.trim().length > 0) {
      data.promotion_gate.notes = note.trim();
    }
    if (typeof nextReviewTrigger === "string" && nextReviewTrigger.trim().length > 0) {
      data.promotion_gate.next_review_trigger = nextReviewTrigger.trim();
    }
    if (clearBlockers) {
      data.promotion_gate.blockers = [];
    }
    if (blockers.length > 0) {
      data.promotion_gate.blockers = uniqueStrings(blockers);
    }

    data.updated_at = timestamp;
    writePromotionEvidence(filePath, data);

    return {
      filePath,
      section: normalizedSection,
      updatedEntry: data.promotion_gate,
    };
  }

  const normalizedId = ensureNonEmptyString(id, "id");
  const collection = resolveSectionCollection(data, normalizedSection);
  if (!Array.isArray(collection)) {
    throw new Error(`Unknown section '${normalizedSection}'.`);
  }

  const entry = collection.find((item) => item?.id === normalizedId);
  if (!entry) {
    throw new Error(`Unknown ${normalizedSection} id '${normalizedId}'.`);
  }

  entry.status = assertGateStatus(status, normalizedSection);
  if (typeof note === "string" && note.trim().length > 0) {
    entry.notes = note.trim();
  }

  if (normalizedSection === "pilot-lane") {
    if (workpackRefs.length > 0) {
      entry.workpack_refs = uniqueStrings([...(entry.workpack_refs ?? []), ...workpackRefs]);
    }
    if (checkpointRefs.length > 0) {
      entry.checkpoint_refs = uniqueStrings([...(entry.checkpoint_refs ?? []), ...checkpointRefs]);
    }
  } else if (evidenceRefs.length > 0) {
    entry.evidence_refs = uniqueStrings([...(entry.evidence_refs ?? []), ...evidenceRefs]);
  }

  data.updated_at = timestamp;
  writePromotionEvidence(filePath, data);

  return {
    filePath,
    section: normalizedSection,
    id: normalizedId,
    updatedEntry: entry,
  };
}
