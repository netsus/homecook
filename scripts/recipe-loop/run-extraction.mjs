#!/usr/bin/env node
/* eslint-disable no-console */
// 추출 러너: source.json → recipe-extraction-lab 모듈 → result.json
// golden.json은 절대 읽지 않는다(루프 격리 보장). 채점은 grade-extraction.mjs가 별도로 수행.
//
// 사용법:
//   node scripts/recipe-loop/run-extraction.mjs --split train [--ids id1,id2] [--no-visual] [--out-tag baseline]
// 기본 provider는 codex-vision-keyframes(GPT 5.4)다.

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createCodexVisionKeyframesClient } from "./lib/codex-vision-keyframes-client.mjs";
import { createCodexVisionClient } from "./lib/codex-vision-client.mjs";
import { createPublicSourceGptClient } from "./lib/public-source-gpt-client.mjs";
import { collectPublicSource } from "./lib/public-source-collector.mjs";
import { collectPublicSourceVisualAssist } from "./lib/public-source-visual-assist.mjs";
import { buildEvidencePacketBundle } from "../../lib/server/recipe-extraction-lab/candidate-packets.mjs";
import { extractRecipeFromSources } from "../../lib/server/recipe-extraction-lab/extract.mjs";
import { buildPublicSourcePacketBundle } from "../../lib/server/recipe-extraction-lab/public-source-packets.mjs";

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = "notebooks/recipe_loop_data";
const DEFAULT_PROVIDER = "codex-vision-keyframes";
const PUBLIC_SOURCE_PROVIDER = "public-source-gpt";
const SUPPORTED_PROVIDERS = new Set(["codex-vision", DEFAULT_PROVIDER, PUBLIC_SOURCE_PROVIDER]);
const DEFAULT_KEYFRAMES_CODEX_EFFORT = process.env.RECIPE_LOOP_CODEX_VISION_CODEX_EFFORT || "low";
const DEFAULT_KEYFRAMES_SELECTOR_EFFORT = process.env.RECIPE_LOOP_CODEX_VISION_SELECTOR_EFFORT || DEFAULT_KEYFRAMES_CODEX_EFFORT;
const DEFAULT_KEYFRAMES_SEGMENT_EFFORT = process.env.RECIPE_LOOP_CODEX_VISION_SEGMENT_EFFORT || DEFAULT_KEYFRAMES_SELECTOR_EFFORT;

export function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) { args[key] = true; continue; }
    args[key] = next; i += 1;
  }
  return args;
}

function optionalNumber(value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function sourceToInput(source) {
  const caps = source.captions ?? {};
  const transcript = caps.available && Array.isArray(caps.segments) && caps.segments.length > 0
    ? { segments: caps.segments, language: caps.selectedTrack?.languageCode ?? caps.language ?? null }
    : null;
  const authorComments = (source.authorComments?.comments ?? []).map((c) => c.text).filter(Boolean);
  return {
    video: {
      videoId: source.video.videoId,
      title: source.video.title,
      description: source.video.description,
      tags: source.video.tags ?? [],
    },
    transcript,
    authorComments,
    youtubeUrl: source.video.url ?? `https://www.youtube.com/watch?v=${source.video.videoId}`,
  };
}

export function resolveProvider(args) {
  const provider = typeof args.provider === "string" ? args.provider : DEFAULT_PROVIDER;
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`지원하지 않는 provider입니다: ${provider}. 사용 가능: ${[...SUPPORTED_PROVIDERS].join(", ")}`);
  }
  return provider;
}

export function createLlmForProvider(provider, args = {}, factories = {}) {
  if (provider === "codex-vision") {
    const createCodexVision = factories.createCodexVision ?? createCodexVisionClient;
    return createCodexVision({
      model: typeof args.model === "string" ? args.model : undefined,
      codexEffort: typeof args["codex-effort"] === "string" ? args["codex-effort"] : undefined,
      maxFrames: optionalNumber(args["max-frames"]),
      storyboardMaxFrames: optionalNumber(args["storyboard-max-frames"]),
      batchSize: optionalNumber(args["batch-size"]),
      sceneDetail: typeof args["scene-detail"] === "string" ? args["scene-detail"] : undefined,
      sceneSelection: typeof args["scene-selection"] === "string" ? args["scene-selection"] : undefined,
      timeoutMs: optionalNumber(args["timeout-ms"]),
      refreshFinal: args["refresh-final"] === true,
      noCache: args["no-cache"] === true,
    });
  }

  if (provider === "codex-vision-keyframes") {
    const createCodexVisionKeyframes = factories.createCodexVisionKeyframes ?? createCodexVisionKeyframesClient;
    return createCodexVisionKeyframes({
      model: typeof args.model === "string" ? args.model : undefined,
      selectorModel: typeof args["selector-model"] === "string" ? args["selector-model"] : undefined,
      codexEffort: typeof args["codex-effort"] === "string" ? args["codex-effort"] : DEFAULT_KEYFRAMES_CODEX_EFFORT,
      selectorEffort: typeof args["selector-effort"] === "string" ? args["selector-effort"] : DEFAULT_KEYFRAMES_SELECTOR_EFFORT,
      segmentEffort: typeof args["segment-effort"] === "string" ? args["segment-effort"] : DEFAULT_KEYFRAMES_SEGMENT_EFFORT,
      keyframeMode: typeof args["keyframe-mode"] === "string" ? args["keyframe-mode"] : undefined,
      segmentedFinalMode: typeof args["segmented-final-mode"] === "string" ? args["segmented-final-mode"] : undefined,
      segmentedRepairMode: typeof args["segmented-repair-mode"] === "string" ? args["segmented-repair-mode"] : undefined,
      segmentModel: typeof args["segment-model"] === "string" ? args["segment-model"] : undefined,
      maxFrames: optionalNumber(args["max-frames"]),
      storyboardMaxFrames: optionalNumber(args["storyboard-max-frames"]),
      selectorCandidateLimit: optionalNumber(args["selector-candidate-limit"]),
      keyframeTotalLimit: optionalNumber(args["keyframe-total-limit"]),
      keyframesPerRecipe: optionalNumber(args["keyframes-per-recipe"]),
      segmentPaddingSec: optionalNumber(args["segment-padding-sec"]),
      segmentMinFrames: optionalNumber(args["segment-min-frames"]),
      segmentMaxFrames: optionalNumber(args["segment-max-frames"]),
      segmentSelectorCandidateLimit: optionalNumber(args["segment-selector-candidate-limit"]),
      segmentMaxCount: optionalNumber(args["segment-max-count"]),
      segmentFrameTotalLimit: optionalNumber(args["segment-frame-total-limit"]),
      sceneDetail: typeof args["scene-detail"] === "string" ? args["scene-detail"] : undefined,
      sceneSelection: typeof args["scene-selection"] === "string" ? args["scene-selection"] : undefined,
      timeoutMs: optionalNumber(args["timeout-ms"]),
      refreshFinal: args["refresh-final"] === true,
      noCache: args["no-cache"] === true,
      sourceCuePackets: args["source-cue-packets"] === true,
      recipeEvidenceLedger: args["recipe-evidence-ledger"] === true,
      recipeEvidenceLedgerPrompt: args["recipe-evidence-ledger-prompt"] === true,
      visualFrameLedgerPrompt: args["visual-frame-ledger-prompt"] === true,
      visualFrameLedgerBatchSize: optionalNumber(args["visual-frame-ledger-batch-size"]),
      segmentBridgeFrames: args["segment-bridge-frames"] === true,
      segmentPhaseAnchorFrames: args["segment-phase-anchor-frames"] === true,
      segmentSelectorAutoSelect: args["segment-selector-auto-select"] === true,
    });
  }

  if (provider === PUBLIC_SOURCE_PROVIDER) {
    const createPublicSourceGpt = factories.createPublicSourceGpt ?? createPublicSourceGptClient;
    return createPublicSourceGpt({
      model: typeof args.model === "string" ? args.model : undefined,
      codexEffort: typeof args["codex-effort"] === "string" ? args["codex-effort"] : undefined,
      timeoutMs: optionalNumber(args["timeout-ms"]),
      refreshFinal: args["refresh-final"] === true,
      noCache: args["no-cache"] === true,
    });
  }

  throw new Error(`지원하지 않는 provider입니다: ${provider}`);
}

async function writeRunFailure(outDir, { id, split, outTag, provider, error }) {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "failure.json"),
    JSON.stringify({
      videoId: id,
      split,
      outTag,
      provider,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      failedAt: new Date().toISOString(),
    }, null, 2) + "\n",
    "utf8",
  );
}

async function writeRunProgress(outDir, update) {
  await mkdir(outDir, { recursive: true });
  const progressPath = path.join(outDir, "run-progress.json");
  const existing = existsSync(progressPath)
    ? await readFile(progressPath, "utf8").then((raw) => JSON.parse(raw)).catch(() => ({}))
    : {};
  const now = new Date().toISOString();
  const phase = update.phase ?? existing.phase ?? "unknown";
  const events = Array.isArray(existing.events) ? existing.events : [];
  await writeFile(
    progressPath,
    JSON.stringify({
      ...existing,
      ...update,
      phase,
      updatedAt: now,
      events: [
        ...events,
        {
          phase,
          at: now,
        },
      ],
    }, null, 2) + "\n",
    "utf8",
  );
}

export async function runExtraction(rawArgs = {}, options = {}) {
  const args = typeof rawArgs.length === "number" ? parseCliArgs(rawArgs) : rawArgs;
  const split = typeof args.split === "string" ? args.split : "train";
  const outTag = typeof args["out-tag"] === "string" ? args["out-tag"] : "latest";
  const useVisual = args["no-visual"] !== true;
  const provider = resolveProvider(args);
  const projectRoot = options.projectRoot ?? PROJECT_ROOT;
  const dataRoot = options.dataRoot ?? DATA_ROOT;
  const splitDir = path.join(projectRoot, dataRoot, split);

  let ids = typeof args.ids === "string"
    ? args.ids.split(",").map((s) => s.trim()).filter(Boolean)
    : (await readdir(splitDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  ids = ids.sort();

  const llm = options.llm ?? createLlmForProvider(provider, args, options.factories);
  let failures = 0;

  for (const id of ids) {
    const sourcePath = path.join(splitDir, id, "source.json");
    const outDir = path.join(splitDir, id, "runs", outTag);
    await writeRunProgress(outDir, {
      videoId: id,
      split,
      outTag,
      provider,
      sourcePath,
      phase: "started",
    });
    if (!existsSync(sourcePath)) {
      const error = new Error(`source 없음: ${sourcePath}`);
      await writeRunFailure(outDir, { id, split, outTag, provider, error });
      await writeRunProgress(outDir, { phase: "failed", message: error.message });
      console.error(`[SKIP] source 없음: ${id}`);
      failures += 1;
      continue;
    }
    try {
      const source = JSON.parse(await readFile(sourcePath, "utf8"));
      await writeRunProgress(outDir, { phase: "source-loaded" });
      const input = sourceToInput(source);
      const sourceMode = provider === PUBLIC_SOURCE_PROVIDER ? "public-source" : "source-text";
      await writeRunProgress(outDir, { phase: "input-built", sourceMode });
      const evidencePacketBundle = sourceMode === "public-source" ? null : buildEvidencePacketBundle(input);
      if (evidencePacketBundle) {
        await writeRunProgress(outDir, {
          phase: "evidence-packets-built",
          evidencePacketCount: evidencePacketBundle.packets.length,
        });
      }
      const publicSource = sourceMode === "public-source"
        ? await (options.publicSourceCollector ?? collectPublicSource)({
          input,
          source,
          videoUrl: input.youtubeUrl,
          cacheDir: options.publicSourceCacheDir,
          noCache: args["no-cache"] === true,
          refresh: args["refresh-final"] === true,
          timeoutMs: optionalNumber(args["timeout-ms"]),
        })
        : null;
      if (publicSource) {
        await writeRunProgress(outDir, { phase: "public-source-collected" });
      }
      const publicSourceVisualAssist = sourceMode === "public-source"
        ? await (options.publicSourceVisualAssistCollector ?? collectPublicSourceVisualAssist)({
          videoId: id,
          cacheRoot: options.publicSourceVisualAssistCacheRoot ?? path.join(projectRoot, dataRoot, "cache/codex-vision-keyframes"),
        })
        : null;
      if (publicSourceVisualAssist) {
        await writeRunProgress(outDir, { phase: "public-source-visual-assist-collected" });
      }
      const publicSourceBundle = publicSource
        ? buildPublicSourcePacketBundle(input, publicSource, { visualAssist: publicSourceVisualAssist })
        : null;
      await writeRunProgress(outDir, { phase: "extracting" });
      const result = await extractRecipeFromSources(input, {
        llm,
        useVisual: sourceMode === "public-source" ? false : useVisual,
        sourceMode,
        useEvidencePackets: sourceMode !== "public-source",
        packetPromptTextOnly: false,
        publicSourceBundle,
      });
      await mkdir(outDir, { recursive: true });
      if (publicSource) {
        await writeFile(path.join(outDir, "public-source.json"), JSON.stringify(publicSource, null, 2) + "\n", "utf8");
      }
      if (publicSourceVisualAssist) {
        await writeFile(path.join(outDir, "public-source-visual-assist.json"), JSON.stringify(publicSourceVisualAssist, null, 2) + "\n", "utf8");
      }
      if (publicSourceBundle) {
        await writeFile(path.join(outDir, "public-source-packets.json"), JSON.stringify(publicSourceBundle, null, 2) + "\n", "utf8");
      }
      if (evidencePacketBundle) {
        await writeFile(
          path.join(outDir, "evidence-packets.json"),
          JSON.stringify({
            videoId: id,
            version: evidencePacketBundle.version,
            source: evidencePacketBundle.source,
            packets: evidencePacketBundle.packets,
          }, null, 2) + "\n",
          "utf8",
        );
        await writeFile(
          path.join(outDir, "cue-extraction-report.json"),
          JSON.stringify({
            videoId: id,
            ...evidencePacketBundle.report,
          }, null, 2) + "\n",
          "utf8",
        );
      }
      await writeFile(path.join(outDir, "result.json"), JSON.stringify({ videoId: id, ...result }, null, 2) + "\n", "utf8");
      await writeRunProgress(outDir, {
        phase: "completed",
        recipeCount: result.recipes.length,
        ingredientCount: result.recipes.reduce((a, r) => a + r.ingredients.length, 0),
        stepCount: result.recipes.reduce((a, r) => a + r.steps.length, 0),
      });
      const recipeCount = result.recipes.length;
      const ingCount = result.recipes.reduce((a, r) => a + r.ingredients.length, 0);
      const stepCount = result.recipes.reduce((a, r) => a + r.steps.length, 0);
      console.log(`[OK] ${provider} ${split}/${id}: 레시피 ${recipeCount}, 재료 ${ingCount}, 단계 ${stepCount}${result.meta.cached ? " (cache)" : ""}${result.meta.droppedUnusedVisualIngredients ? `, 미사용제거 ${result.meta.droppedUnusedVisualIngredients}` : ""}`);
    } catch (error) {
      failures += 1;
      await writeRunFailure(outDir, { id, split, outTag, provider, error });
      await writeRunProgress(outDir, {
        phase: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
      console.error(`[FAIL] ${split}/${id}: ${error.message}`);
    }
  }

  return { failures };
}

async function main() {
  const result = await runExtraction(process.argv.slice(2));
  process.exit(result.failures > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
