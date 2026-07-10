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
  const manifest = JSON.parse(await readFile(resolvedPath, "utf8"));
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

  return {
    profileId: manifest.profileId,
    manifestPath: resolvedPath,
    manifestPathRelative: path.relative(projectRoot, resolvedPath),
    expectedRecipeCountPerVideo: manifest.expectedRecipeCountPerVideo ?? null,
    ids: requested,
    expectedCount: requested.length,
    profileExpectedCount: splitProfile.expectedCount,
  };
}
