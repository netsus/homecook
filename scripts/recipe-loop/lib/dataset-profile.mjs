import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`${label} must be a non-empty string array`);
  }
  const ids = value.map((entry) => entry.trim());
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} contains duplicate ids`);
  }
  return ids;
}

export function isProtectedSplit(split) {
  return split === "validation" || split === "holdout";
}

export function assertProtectedDatasetProfile({
  split,
  datasetProfile,
  requestedIds = null,
  expectedCount = null,
}) {
  if (!isProtectedSplit(split)) return;
  if (!datasetProfile) throw new Error(`dataset manifest is required for protected split: ${split}`);
  if (requestedIds !== null) throw new Error(`protected split does not allow --ids: ${split}`);
  if (datasetProfile.expectedCount !== datasetProfile.profileExpectedCount) {
    throw new Error(`protected split requires the complete dataset profile: ${split}`);
  }
  if (expectedCount !== null && expectedCount !== datasetProfile.profileExpectedCount) {
    throw new Error(`protected split expected count is fixed by the dataset profile: ${split}`);
  }
}

export async function loadDatasetProfile({
  projectRoot = process.cwd(),
  manifestPath,
  split,
  requestedIds = null,
}) {
  if (!manifestPath) throw new Error("dataset manifest path is required");
  const resolvedPath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.resolve(projectRoot, manifestPath);
  const manifestText = await readFile(resolvedPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const splitProfile = manifest?.splits?.[split];
  if (!splitProfile) throw new Error(`dataset profile missing split: ${split}`);
  const profileIds = assertStringArray(splitProfile.ids, `dataset profile ${split}.ids`);
  if (!Number.isInteger(splitProfile.expectedCount) || splitProfile.expectedCount !== profileIds.length) {
    throw new Error(`dataset profile expectedCount mismatch for ${split}`);
  }
  const requested = requestedIds === null ? profileIds : assertStringArray(requestedIds, "requested ids");
  const allowed = new Set(profileIds);
  const outsideId = requested.find((id) => !allowed.has(id));
  if (outsideId) throw new Error(`dataset profile outside id: ${outsideId}`);
  if (isProtectedSplit(split)
    && (requested.length !== profileIds.length || requested.some((id, index) => id !== profileIds[index]))) {
    throw new Error(`protected split requires the complete dataset profile: ${split}`);
  }

  return {
    profileId: manifest.profileId,
    manifestPath: resolvedPath,
    manifestPathRelative: path.relative(projectRoot, resolvedPath),
    manifestSha256: createHash("sha256").update(manifestText).digest("hex"),
    expectedRecipeCountPerVideo: manifest.expectedRecipeCountPerVideo ?? null,
    ids: requested,
    expectedCount: requested.length,
    profileExpectedCount: splitProfile.expectedCount,
    gates: splitProfile.gates ?? null,
    canary: splitProfile.canary ?? null,
  };
}
