import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const DEFAULT_KEYFRAME_CACHE_ROOT = path.join(PROJECT_ROOT, "notebooks/recipe_loop_data/cache/codex-vision-keyframes");
const VISUAL_ASSIST_VERSION = "public-source-visual-assist-v1";

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function keyOf(value) {
  return compact(value).replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function cacheDirs(rootDir) {
  if (!existsSync(rootDir)) return [];
  const entries = await readdir(rootDir, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const dir = path.join(rootDir, entry.name);
    const info = await stat(dir);
    dirs.push({ dir, mtimeMs: info.mtimeMs });
  }
  return dirs.sort((left, right) => right.mtimeMs - left.mtimeMs);
}

function normalizeAssistFrame(frame = {}, segment = {}) {
  const text = compact(frame.selectionReason ?? frame.reason);
  if (!text) return null;
  return {
    source: "keyframe_selector",
    titleHint: compact(segment.titleHint),
    segmentId: segment.segmentId ?? null,
    candidateId: segment.candidateId ?? null,
    text,
    frameFile: frame.file ?? (frame.path ? path.basename(frame.path) : null),
    framePath: frame.path ?? null,
    timestampSec: Number.isFinite(Number(frame.timestamp_sec)) ? Number(frame.timestamp_sec) : null,
  };
}

function dedupeAssist(items) {
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    const key = `${keyOf(item.titleHint)}:${keyOf(item.text)}:${item.frameFile ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

export async function collectPublicSourceVisualAssist({
  videoId,
  cacheRoot = DEFAULT_KEYFRAME_CACHE_ROOT,
  maxRuns = 4,
  maxItems = 80,
} = {}) {
  if (!videoId) {
    return {
      version: VISUAL_ASSIST_VERSION,
      source: "codex-vision-keyframes-segment-keyframes",
      videoId: null,
      cues: [],
      warnings: ["missing_video_id"],
    };
  }

  const cues = [];
  const warnings = [];
  const dirs = await cacheDirs(cacheRoot);
  let inspectedRuns = 0;

  for (const { dir } of dirs) {
    if (inspectedRuns >= maxRuns || cues.length >= maxItems) break;
    const runMeta = await readJsonIfExists(path.join(dir, "run_meta.json"));
    if (!runMeta || runMeta.videoId !== videoId) continue;
    const segmentKeyframes = await readJsonIfExists(path.join(dir, "segment-keyframes.json"));
    if (!segmentKeyframes || !Array.isArray(segmentKeyframes.segments)) {
      warnings.push(`missing_segment_keyframes:${path.basename(dir)}`);
      continue;
    }
    inspectedRuns += 1;
    for (const segment of segmentKeyframes.segments) {
      for (const frame of segment.selectedFrames ?? []) {
        const item = normalizeAssistFrame(frame, segment);
        if (item) cues.push({ ...item, cacheDir: dir });
        if (cues.length >= maxItems) break;
      }
      if (cues.length >= maxItems) break;
    }
  }

  return {
    version: VISUAL_ASSIST_VERSION,
    source: "codex-vision-keyframes-segment-keyframes",
    videoId,
    cacheRoot,
    inspectedRuns,
    cues: dedupeAssist(cues).slice(0, maxItems),
    warnings,
  };
}
