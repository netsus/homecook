import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function assertFrozenResults({
  projectRoot = process.cwd(),
  dataRoot = "notebooks/recipe_loop_data",
  split = "train",
  outTag,
  ids,
  datasetProfile = null,
}) {
  if (!outTag) throw new Error("outTag is required for freeze verification");
  const splitDir = path.join(projectRoot, dataRoot, split);
  const freezePath = path.join(splitDir, `_pi_freeze.${outTag}.json`);
  if (!existsSync(freezePath)) {
    throw new Error(`freeze is required before golden evaluation: ${path.relative(projectRoot, freezePath)}`);
  }
  const freeze = JSON.parse(await readFile(freezePath, "utf8"));
  if (freeze.split !== split || freeze.outTag !== outTag) {
    throw new Error(`freeze scope mismatch: ${path.relative(projectRoot, freezePath)}`);
  }
  if (datasetProfile && freeze.datasetManifestSha256 !== datasetProfile.manifestSha256) {
    throw new Error(`dataset manifest hash mismatch: ${path.relative(projectRoot, freezePath)}`);
  }

  const requestedIds = ids ?? freeze.cases?.map((entry) => entry.videoId) ?? [];
  for (const id of requestedIds) {
    const frozenCase = freeze.cases?.find((entry) => entry.videoId === id);
    if (!frozenCase?.completed) throw new Error(`freeze missing completed case: ${split}/${id}/${outTag}`);
    const runDir = path.join(splitDir, id, "runs", outTag);
    const resultPath = path.join(runDir, "result.json");
    const manifestPath = path.join(runDir, "file-access-manifest.json");
    if (!existsSync(resultPath) || !existsSync(manifestPath)) {
      throw new Error(`frozen evaluator input is missing: ${split}/${id}/${outTag}`);
    }
    const expectedResultHash = frozenCase.files?.["result.json"]?.sha256;
    if (!expectedResultHash || await sha256(resultPath) !== expectedResultHash) {
      throw new Error(`frozen result hash mismatch: ${split}/${id}/${outTag}`);
    }
    const expectedManifestHash = frozenCase.files?.["file-access-manifest.json"]?.sha256;
    if (!expectedManifestHash || await sha256(manifestPath) !== expectedManifestHash) {
      throw new Error(`frozen access manifest hash mismatch: ${split}/${id}/${outTag}`);
    }
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.status !== "clean" || manifest.unknownReadBoundary !== false) {
      throw new Error(`frozen access boundary is not clean: ${split}/${id}/${outTag}`);
    }
    if (!Array.isArray(manifest.forbiddenReadEvents) || manifest.forbiddenReadEvents.length > 0) {
      throw new Error(`frozen access manifest contains forbidden reads: ${split}/${id}/${outTag}`);
    }
  }
  return freeze;
}
