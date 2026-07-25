import { realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { extractRecipeFromSources } from "./lib/server/recipe-extraction-lab/extract.mjs";
import { createCodexVisionKeyframesClient } from "./scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs";
import { snapshotVideo } from "./scripts/recipe-loop/snapshot-video.mjs";

const EXACT = Object.freeze({
  provider: "codex-vision-keyframes",
  model: "gpt-5.4",
  selectorModel: "gpt-5.4-mini",
  sourcePromptVersion: "single-recipe-four-source-v2",
  selectorPromptVersion: "keyframe-selector-v6-single-compact-json",
  finalPromptVersion: "keyframe-final-v44-explicit-action-clause",
  clientVersion: "codex-vision-keyframes-client-v19-onscreen-amount-recovery",
  executionConfigSignature: "704359dfb34df5ac1d070078",
  frameExtractorVersion: "extract-video-frames-v7-adaptive-screen-ocr",
  frameMode: "hybrid",
  interval: 4,
  hybridAnchorBudget: 36,
  selectorCandidateLimit: 12,
  keyframeTotalLimit: 8,
  screenOcrMode: "auto",
  codexCliVersion: "0.144.0-alpha.4",
});

const TOTAL_TIMEOUT_MS = 20 * 60 * 1000;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error("invalid arguments");
    }
    args[key.slice(2)] = value;
  }
  return args;
}

function sourceToInput(source) {
  const captions = source.captions ?? {};
  const transcript = captions.available
    && Array.isArray(captions.segments)
    && captions.segments.length > 0
    ? {
      segments: captions.segments,
      language: captions.selectedTrack?.languageCode ?? captions.language ?? null,
    }
    : null;
  const authorComments = (source.authorComments?.comments ?? [])
    .map((comment) => comment.text)
    .filter(Boolean);

  return {
    video: {
      videoId: source.video.videoId,
      title: source.video.title,
      description: source.video.description,
      tags: source.video.tags ?? [],
    },
    transcript,
    authorComments,
    youtubeUrl: source.video.url
      ?? `https://www.youtube.com/watch?v=${source.video.videoId}`,
  };
}

function assertEqual(actual, expected, field) {
  if (actual !== expected) {
    throw new Error(`identity mismatch: ${field}`);
  }
}

function assertExactMeta(meta) {
  assertEqual(meta.provider, EXACT.provider, "provider");
  assertEqual(meta.model, EXACT.model, "model");
  assertEqual(meta.selectorModel, EXACT.selectorModel, "selectorModel");
  assertEqual(meta.promptVersion, EXACT.sourcePromptVersion, "sourcePromptVersion");
  assertEqual(meta.selectorPromptVersion, EXACT.selectorPromptVersion, "selectorPromptVersion");
  assertEqual(meta.finalPromptVersion, EXACT.finalPromptVersion, "finalPromptVersion");
  assertEqual(meta.clientVersion, EXACT.clientVersion, "clientVersion");
  assertEqual(
    meta.executionConfigSignature,
    EXACT.executionConfigSignature,
    "executionConfigSignature",
  );
  assertEqual(
    meta.extractionStats?.extractor_version,
    EXACT.frameExtractorVersion,
    "frameExtractorVersion",
  );
  assertEqual(meta.frameMode, EXACT.frameMode, "frameMode");
  assertEqual(meta.interval, EXACT.interval, "interval");
  assertEqual(meta.hybridAnchorBudget, EXACT.hybridAnchorBudget, "hybridAnchorBudget");
  assertEqual(
    meta.selectorCandidateLimit,
    EXACT.selectorCandidateLimit,
    "selectorCandidateLimit",
  );
  assertEqual(meta.singleRecipeOnly, true, "singleRecipeOnly");
  assertEqual(meta.cached, false, "cached");
  assertEqual(meta.declaredRunType, "cold", "declaredRunType");
  assertEqual(meta.modelReadBoundaryStatus, "clean", "modelReadBoundaryStatus");
  assertEqual(
    process.env.HOMECOOK_I031_CODEX_CLI_VERSION,
    EXACT.codexCliVersion,
    "codexCliVersion",
  );
}

function booleanValue(value) {
  return value === true;
}

function duration(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function safeOutput(result) {
  assertExactMeta(result.meta);
  if (!Array.isArray(result.recipes) || result.recipes.length !== 1) {
    throw new Error("single recipe contract failed");
  }

  const recipe = result.recipes[0];
  return {
    schemaVersion: 1,
    identity: EXACT,
    recipe: {
      title: recipe.title,
      ingredients: recipe.ingredients.map((ingredient) => ({
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        optional: ingredient.optional === true,
        groupLabel: ingredient.groupLabel ?? null,
      })),
      steps: [...recipe.steps],
    },
    meta: {
      modelCallCount: result.meta.modelCallCount,
      frameCount: result.meta.frameCount,
      selectedFrameCount: result.meta.selectedFrameCount,
      selectorBypassed: booleanValue(result.meta.selectorBypassed),
      screenOcrStatus: result.meta.screenOcrStatus ?? "skipped",
      sourceAvailability: {
        description: booleanValue(result.meta.sourceAvailability?.description),
        authorComment: booleanValue(result.meta.sourceAvailability?.authorComment),
        transcript: booleanValue(result.meta.sourceAvailability?.transcript),
        onscreen: booleanValue(result.meta.sourceAvailability?.onscreen),
      },
      timings: {
        frameExtractMs: duration(result.meta.frame_extract_ms),
        selectorMs: duration(result.meta.selector_ms),
        finalMs: duration(result.meta.final_ms),
        totalFreshMs: duration(result.meta.total_fresh_ms),
        ocrTotalMs: duration(result.meta.ocr_total_ms),
      },
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const videoId = args["video-id"];
  if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId ?? "")) {
    throw new Error("invalid video id");
  }

  const resultPath = path.resolve(args.result ?? "");
  const [resultDirectory, runtimeDirectory] = await Promise.all([
    realpath(path.dirname(resultPath)),
    realpath(process.cwd()),
  ]);
  if (resultDirectory !== runtimeDirectory) {
    throw new Error("result path must stay in the runtime workspace");
  }

  const { source } = await snapshotVideo(
    process.env,
    videoId,
    "notebooks/recipe_loop_data/candidates",
    { useApifyFallback: true },
  );
  const input = sourceToInput(source);
  const llm = createCodexVisionKeyframesClient({
    model: EXACT.model,
    selectorModel: EXACT.selectorModel,
    codexEffort: "low",
    selectorEffort: "low",
    singleRecipeOnly: true,
    frameMode: EXACT.frameMode,
    interval: EXACT.interval,
    hybridAnchorBudget: EXACT.hybridAnchorBudget,
    selectorCandidateLimit: EXACT.selectorCandidateLimit,
    keyframeTotalLimit: EXACT.keyframeTotalLimit,
    keyframesPerRecipe: EXACT.keyframeTotalLimit,
    screenOcrMode: EXACT.screenOcrMode,
    noCache: true,
    runType: "cold",
    timeoutMs: TOTAL_TIMEOUT_MS,
  });
  const result = await extractRecipeFromSources(input, {
    llm,
    useVisual: true,
    sourceMode: "source-text",
    recipeMode: "single",
    useEvidencePackets: false,
    packetPromptTextOnly: false,
    publicSourceBundle: null,
  });
  const temporaryPath = `${resultPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(safeOutput(result))}\n`, "utf8");
  await rename(temporaryPath, resultPath);
}

main().catch(() => {
  console.error("[youtube-i031-worker] extraction failed");
  process.exitCode = 1;
});
