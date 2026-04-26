import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { syncPromotionGateWithReplayAcceptance } from "./omo-promotion-evidence.mjs";

const REPLAY_LANE_STATUSES = new Set(["pending", "in_progress", "pass", "blocked"]);
const REPLAY_SUMMARY_STATUSES = new Set(["not-started", "in_progress", "pass", "blocked"]);
const REPLAY_CRITERIA_KEYS = [
  "manual_runtime_json_edit_free",
  "stale_lock_manual_clear_free",
  "stale_ci_snapshot_manual_fix_free",
  "canonical_closeout_validated",
  "auditor_result_recorded",
];

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function uniqueStrings(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : []).filter(
        (value) => typeof value === "string" && value.trim().length > 0,
      ),
    ),
  ];
}

export function resolveReplayAcceptancePath(rootDir = process.cwd()) {
  return resolve(rootDir, ".workflow-v2", "replay-acceptance.json");
}

export function readReplayAcceptance(rootDir = process.cwd()) {
  const filePath = resolveReplayAcceptancePath(rootDir);
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }

  return {
    filePath,
    data: JSON.parse(readFileSync(filePath, "utf8")),
  };
}

function writeReplayAcceptance(filePath, data) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function assertReplayLaneStatus(status) {
  const normalizedStatus = ensureNonEmptyString(status, "status");
  if (!REPLAY_LANE_STATUSES.has(normalizedStatus)) {
    throw new Error(`lane status must be one of: ${[...REPLAY_LANE_STATUSES].join(", ")}`);
  }

  return normalizedStatus;
}

function assertReplaySummaryStatus(status) {
  const normalizedStatus = ensureNonEmptyString(status, "status");
  if (!REPLAY_SUMMARY_STATUSES.has(normalizedStatus)) {
    throw new Error(`summary status must be one of: ${[...REPLAY_SUMMARY_STATUSES].join(", ")}`);
  }

  return normalizedStatus;
}

function normalizeCriteria(criteria = {}) {
  const normalized = {};
  for (const key of REPLAY_CRITERIA_KEYS) {
    if (key in criteria) {
      normalized[key] = criteria[key] === true;
    }
  }
  return normalized;
}

/**
 * @param {{
 *   rootDir?: string,
 *   section: "lane" | "summary",
 *   id?: string,
 *   status: string,
 *   note?: string,
 *   evidenceRefs?: string[],
 *   workItemRefs?: string[],
 *   incidentIds?: string[],
 *   blockingLaneIds?: string[],
 *   criteria?: Record<string, boolean>,
 *   syncPromotionGate?: boolean,
 *   now?: string,
 * }} options
 */
export function updateReplayAcceptance({
  rootDir = process.cwd(),
  section,
  id,
  status,
  note,
  evidenceRefs = [],
  workItemRefs = [],
  incidentIds = [],
  blockingLaneIds = [],
  criteria = {},
  syncPromotionGate = false,
  now,
} = {}) {
  const normalizedSection = ensureNonEmptyString(section, "section");
  const { filePath, data } = readReplayAcceptance(rootDir);
  const timestamp = typeof now === "string" && now.trim().length > 0 ? now.trim() : new Date().toISOString();

  if (normalizedSection === "summary") {
    data.summary.status = assertReplaySummaryStatus(status);
    if (typeof note === "string" && note.trim().length > 0) {
      data.summary.notes = note.trim();
    }
    if (blockingLaneIds.length > 0) {
      data.summary.blocking_lane_ids = uniqueStrings(blockingLaneIds);
    }

    data.updated_at = timestamp;
    writeReplayAcceptance(filePath, data);
    const promotionSync = syncPromotionGate
      ? syncPromotionGateWithReplayAcceptance({ rootDir, now: timestamp })
      : null;

    return {
      filePath,
      section: normalizedSection,
      updatedEntry: data.summary,
      promotionSync,
    };
  }

  if (normalizedSection !== "lane") {
    throw new Error(`Unknown section '${normalizedSection}'.`);
  }

  const normalizedId = ensureNonEmptyString(id, "id");
  const lanes = Array.isArray(data.lanes) ? data.lanes : [];
  const entry = lanes.find((lane) => lane?.id === normalizedId);
  if (!entry) {
    throw new Error(`Unknown replay lane id '${normalizedId}'.`);
  }

  entry.status = assertReplayLaneStatus(status);
  if (typeof note === "string" && note.trim().length > 0) {
    entry.notes = note.trim();
  }
  if (evidenceRefs.length > 0) {
    entry.evidence_refs = uniqueStrings([...(entry.evidence_refs ?? []), ...evidenceRefs]);
  }
  if (workItemRefs.length > 0) {
    entry.work_item_refs = uniqueStrings([...(entry.work_item_refs ?? []), ...workItemRefs]);
  }
  if (incidentIds.length > 0) {
    entry.incident_ids = uniqueStrings([...(entry.incident_ids ?? []), ...incidentIds]);
  }

  Object.assign(entry.criteria, normalizeCriteria(criteria));

  data.updated_at = timestamp;
  writeReplayAcceptance(filePath, data);
  const promotionSync = syncPromotionGate
    ? syncPromotionGateWithReplayAcceptance({ rootDir, now: timestamp })
    : null;

  return {
    filePath,
    section: normalizedSection,
    id: normalizedId,
    updatedEntry: entry,
    promotionSync,
  };
}
