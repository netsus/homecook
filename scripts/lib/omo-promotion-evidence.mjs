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

function resolveReplayAcceptancePath(rootDir = process.cwd()) {
  return resolve(rootDir, ".workflow-v2", "replay-acceptance.json");
}

function resolveIncidentRegistryPath(rootDir = process.cwd()) {
  return resolve(rootDir, "docs", "engineering", "workflow-v2", "omo-incident-registry.md");
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

function readBulletField(body, field) {
  const match = body.match(new RegExp(`^- ${field}:\\s+(.+)$`, "m"));
  const rawValue = match?.[1]?.trim();
  if (!rawValue) {
    return null;
  }

  return rawValue.startsWith("`") && rawValue.endsWith("`") ? rawValue.slice(1, -1) : rawValue;
}

export function readActiveIncidentBlockerIds(rootDir = process.cwd()) {
  const registryPath = resolveIncidentRegistryPath(rootDir);
  if (!existsSync(registryPath)) {
    return ["incident-registry-missing"];
  }

  const registryText = readFileSync(registryPath, "utf8");
  const incidents = [];
  const sectionHeaders = [...registryText.matchAll(/^### ([A-Z0-9-]+)\s*$/gm)];

  for (let index = 0; index < sectionHeaders.length; index += 1) {
    const match = sectionHeaders[index];
    const id = match[1];
    const sectionStart = (match.index ?? 0) + match[0].length;
    const sectionEnd = sectionHeaders[index + 1]?.index ?? registryText.length;
    const body = registryText.slice(sectionStart, sectionEnd);
    const status = readBulletField(body, "status");
    const boundary = readBulletField(body, "boundary");
    const hasAcceptedMissingArtifactDisposition = /artifact-missing accepted/i.test(body);

    if (status === "open" && boundary === "omo-system") {
      incidents.push(id);
      continue;
    }

    if (status === "backfill-required" && boundary !== "product-local" && !hasAcceptedMissingArtifactDisposition) {
      incidents.push(id);
    }
  }

  return uniqueStrings(incidents);
}

/**
 * @param {{ rootDir?: string, now?: string }} [options]
 */
export function syncPromotionGateWithReplayAcceptance({
  rootDir = process.cwd(),
  now,
} = {}) {
  const { filePath, data } = readPromotionEvidence(rootDir);
  const replayPath = resolveReplayAcceptancePath(rootDir);
  if (!existsSync(replayPath)) {
    throw new Error(`Missing ${replayPath}`);
  }

  const replayAcceptance = JSON.parse(readFileSync(replayPath, "utf8"));
  const timestamp = typeof now === "string" && now.trim().length > 0 ? now.trim() : new Date().toISOString();
  const summaryStatus =
    typeof replayAcceptance?.summary?.status === "string"
      ? replayAcceptance.summary.status
      : "missing";
  const lanes = Array.isArray(replayAcceptance?.lanes) ? replayAcceptance.lanes : [];
  const incompleteRequiredLaneIds = lanes
    .filter((lane) => lane?.required === true && lane.status !== "pass")
    .map((lane) => lane?.id)
    .filter((laneId) => typeof laneId === "string" && laneId.trim().length > 0);
  const summaryBlockingLaneIds = uniqueStrings(replayAcceptance?.summary?.blocking_lane_ids ?? []);
  const isReplayAccepted = summaryStatus === "pass" && incompleteRequiredLaneIds.length === 0;
  const activeIncidentBlockerIds = isReplayAccepted ? readActiveIncidentBlockerIds(rootDir) : [];

  if (isReplayAccepted && activeIncidentBlockerIds.length === 0) {
    return {
      filePath,
      replayPath,
      updated: false,
      replaySummaryStatus: summaryStatus,
      incompleteRequiredLaneIds,
      activeIncidentBlockerIds,
      updatedEntry: data.promotion_gate,
    };
  }

  const blockerRefs = uniqueStrings([
    ...(!isReplayAccepted
      ? summaryBlockingLaneIds.length > 0
        ? summaryBlockingLaneIds
        : incompleteRequiredLaneIds
      : []),
    ...activeIncidentBlockerIds,
    ...(summaryBlockingLaneIds.length === 0 && incompleteRequiredLaneIds.length === 0 && activeIncidentBlockerIds.length === 0
      ? [`summary:${summaryStatus}`]
      : []),
  ]);
  data.promotion_gate.status = "not-ready";
  data.promotion_gate.blockers = [
    isReplayAccepted
      ? `active incident blockers: ${blockerRefs.join(", ")}`
      : `replay acceptance incomplete: ${blockerRefs.join(", ")}`,
  ];
  data.promotion_gate.notes = isReplayAccepted
    ? "Promotion gate recalculated from replay acceptance plus incident registry; stale ready/candidate signals cannot be reused while active OMO-system incidents remain open."
    : "Promotion gate recalculated from .workflow-v2/replay-acceptance.json; stale ready/candidate signals cannot be reused while replay acceptance is incomplete.";
  data.promotion_gate.next_review_trigger = isReplayAccepted
    ? "After active OMO-system incident blockers are closed or dispositioned"
    : "After replay acceptance passes";
  data.updated_at = timestamp;
  writePromotionEvidence(filePath, data);

  return {
    filePath,
    replayPath,
    updated: true,
    replaySummaryStatus: summaryStatus,
    incompleteRequiredLaneIds,
    activeIncidentBlockerIds,
    updatedEntry: data.promotion_gate,
  };
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
