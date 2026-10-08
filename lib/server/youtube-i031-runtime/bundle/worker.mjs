import { createHash } from "node:crypto";
import { realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readOwnerResultCache, writeOwnerResultCache } from "./lib/server/owner-result-cache.mjs";
import { prepareSourceAndMedia, prepareYoutubeMedia } from "./lib/server/parallel-media-preparation.mjs";
import { sanitizeIngredientEvidence } from "./lib/server/recipe-extraction-lab/quantity-evidence.mjs";

import { extractRecipeFromSources } from "./lib/server/recipe-extraction-lab/extract.mjs";
import { createCodexVisionKeyframesClient } from "./scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs";
import { snapshotVideo, fetchVideoMeta } from "./scripts/recipe-loop/snapshot-video.mjs";

export const EXACT = Object.freeze({
  pipelineVersion: "i031-sol-v1",
  provider: "codex-vision-keyframes",
  model: "gpt-5.6-sol",
  selectorModel: "gpt-5.6-sol",
  sourcePromptVersion: "single-recipe-four-source-v2",
  selectorPromptVersion: "keyframe-selector-v6-single-compact-json",
  finalPromptVersion: "keyframe-final-v44-explicit-action-clause",
  clientVersion: "codex-vision-keyframes-client-v20-structured-final",
  executionConfigSignature: "143d3570f6a3c1cbf7680851",
  frameExtractorVersion: "extract-video-frames-v7-adaptive-screen-ocr",
  frameMode: "hybrid",
  interval: 4,
  hybridAnchorBudget: 36,
  selectorCandidateLimit: 12,
  keyframeTotalLimit: 8,
  screenOcrMode: "auto",
  codexCliVersion: "0.154.0-alpha.6.2",
});

// Candidate activation is pinned in the release, never accepted from a user request.
export const ACTIVE_ANALYSIS_MODE = "source-anchored";

const TOTAL_TIMEOUT_MS = 20 * 60 * 1000;
const WORKER_RPC_TIMEOUT_MS = 30 * 1000;
const PROGRESS_STAGES = new Set([
  "source_fetch",
  "video_download",
  "frame_extraction",
  "model_analysis",
]);

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

function createWorkerRpcClient() {
  if (typeof process.send !== "function") {
    throw new Error("RUNTIME_UNAVAILABLE");
  }
  let sequence = 0;
  let progressSequence = 0;
  const pending = new Map();
  process.on("message", (message) => {
    if (message?.type !== "homecook-worker-rpc-response") return;
    const entry = pending.get(message.requestId);
    if (!entry) return;
    pending.delete(message.requestId);
    clearTimeout(entry.timeout);
    if (message.ok === true) entry.resolve(message.data);
    else entry.reject(new Error(message.errorCode ?? "RUNTIME_UNAVAILABLE"));
  });

  function request(operation, payload) {
    const requestId = `rpc-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("PROVIDER_TIMEOUT"));
      }, WORKER_RPC_TIMEOUT_MS);
      timeout.unref?.();
      pending.set(requestId, { resolve, reject, timeout });
      process.send({
        type: "homecook-worker-rpc-request",
        requestId,
        operation,
        payload,
      });
    });
  }

  function reportProgress(stage, videoDurationSeconds = null) {
    if (
      !PROGRESS_STAGES.has(stage)
      || (
        videoDurationSeconds !== null
        && (!Number.isInteger(videoDurationSeconds)
          || videoDurationSeconds < 1
          || videoDurationSeconds > 86_400)
      )
    ) {
      return false;
    }
    const message = {
      type: "homecook-worker-progress",
      sequence: ++progressSequence,
      stage,
      videoDurationSeconds,
    };
    try {
      if (!process.connected) return false;
      process.send(message, () => {});
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({
    accessCache(operation, payload) {
      return request("cache", { operation, payload });
    },
    reserveQuota(provider, units = 1) {
      return request("quota", { provider, units });
    },
    recordEvent(kind, payload) {
      return request("event", { kind, payload });
    },
    resolveMethods(methodLabels) {
      return request("methods", { methodLabels });
    },
    updateTitle(title) {
      return request("title", { title });
    },
    reportProgress,
  });
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cacheExpiry() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

async function inspectCache(workerRpcClient, operation, payload) {
  const result = await workerRpcClient.accessCache(operation, payload);
  const cache = result?.cache;
  if (cache && typeof cache.id === "string") {
    await workerRpcClient.accessCache(operation.replace("_read", "_touch"), {
      id: cache.id,
    });
    return { cacheHit: true, cache };
  }
  return { cacheHit: false, cache: null };
}

export async function readRuntimeResultCaches({ enabled, workerRpcClient, sourceHash, visualRequestHash, runtimeIdentity }) {
  if (!enabled) return { llmCache: { cacheHit: false }, visualCache: { cacheHit: false } };
  const llmCache = await inspectCache(workerRpcClient, "llm_read", {
    source_hash: sourceHash,
    schema_version: runtimeIdentity.sourcePromptVersion,
    model: runtimeIdentity.model,
  });
  const visualCache = await inspectCache(workerRpcClient, "visual_read", {
    provider: runtimeIdentity.provider,
    schema_version: runtimeIdentity.finalPromptVersion,
    visual_request_hash: visualRequestHash,
  });
  return { llmCache, visualCache };
}

export async function writeRuntimeResultCaches({ llmEnabled, visualEnabled, workerRpcClient, sourceHash, visualRequestHash, runtimeIdentity, output }) {
  if (llmEnabled) await workerRpcClient.accessCache("llm_upsert", {
    source_hash: sourceHash,
    schema_version: runtimeIdentity.sourcePromptVersion,
    model: runtimeIdentity.model,
    source_kinds: ["description", "comment", "caption", "onscreen"],
    result_json: output,
    expires_at: cacheExpiry(),
  });
  if (visualEnabled) await workerRpcClient.accessCache("visual_upsert", {
    provider: runtimeIdentity.provider,
    schema_version: runtimeIdentity.finalPromptVersion,
    visual_request_hash: visualRequestHash,
    result_json: output,
    expires_at: cacheExpiry(),
  });
}

function methodLabels(steps) {
  return steps.map((step) => {
    const text = typeof step === "string" ? step.toLowerCase() : "";
    if (/(에어\s*프라이어|air\s*fryer)/iu.test(text)) return "air_fryer";
    if (/(전자\s*레인지|전자렌지|전자레인지|microwave)/iu.test(text)) return "microwave";
    if (/(오븐|oven)/iu.test(text)) return "oven_bake";
    if (/(튀김|튀겨|튀기|deep\s*fry)/iu.test(text)) return "deep_fry";
    if (/(부쳐|부치|pan\s*fry)/iu.test(text)) return "pan_fry";
    if (/(볶|stir\s*fry)/iu.test(text)) return "stir_fry";
    if (/(찜기|찐|쪄|찌기|steam)/iu.test(text)) return "steam";
    if (/(데쳐|데치|블랜칭)/iu.test(text)) return "blanch";
    if (/(졸|줄여|reduce)/iu.test(text)) return "reduce";
    if (/(조려|조림|brais)/iu.test(text)) return "braise";
    if (/(삶|boil\s+in)/iu.test(text)) return "parboil";
    if (/(끓|boil)/iu.test(text)) return "boil";
    if (/(굽|구워|토스트|grill|toast)/iu.test(text)) return "grill";
    if (/(절여|절이|pickle)/iu.test(text)) return "pickle";
    if (/(재워|재우|밑간|숙성|marinat)/iu.test(text)) return "pre_season";
    if (/(해동|thaw)/iu.test(text)) return "thaw";
    if (/(버무|무쳐|무치|toss)/iu.test(text)) return "toss";
    if (/(섞|비벼|비비|풀어|mix)/iu.test(text)) return "mix";
    if (/(다져|다지|mince)/iu.test(text)) return "mince";
    return "slice";
  });
}

export function sourceToInput(source) {
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

export function createExtractionIdentity(clientOptions) {
  if (!clientOptions.analysisMode) return EXACT;
  const client = createCodexVisionKeyframesClient(clientOptions);
  return Object.freeze({
    ...EXACT,
    model: clientOptions.model ?? EXACT.model,
    selectorModel: clientOptions.selectorModel ?? EXACT.selectorModel,
    pipelineVersion: `vision-evidence-v2-${clientOptions.analysisMode}`,
    sourcePromptVersion: client.sourcePromptVersion ?? EXACT.sourcePromptVersion,
    selectorPromptVersion: client.selectorPromptVersion,
    finalPromptVersion: client.finalPromptVersion,
    clientVersion: client.clientVersion,
    executionConfigSignature: client.executionConfigSignature,
  });
}

export async function recordRuntimeSuccessTelemetry(workerRpcClient, {
  runtimeIdentity, ownerCacheHit = false, llmCacheHit = false, visualCacheHit = false,
}) {
  const eventIdentity = { provider: runtimeIdentity.provider, model: runtimeIdentity.model };
  if (ownerCacheHit) {
    await workerRpcClient.recordEvent("llm", {
      ...eventIdentity, cache_hit: true, status: "success", reason: "owner_result_cache_hit",
      input_tokens: 0, output_tokens: 0, estimated_cost_microusd: 0,
    });
    return;
  }
  await workerRpcClient.recordEvent("llm", {
    ...eventIdentity, cache_hit: false, status: "success",
    reason: llmCacheHit ? "i031_exact_cold_cache_probe_hit" : "i031_exact_cold_execution",
    input_tokens: 0, output_tokens: 0, estimated_cost_microusd: 0,
  });
  await workerRpcClient.recordEvent("visual", {
    ...eventIdentity, cache_hit: false, event_type: "success", status: "success",
    reason: visualCacheHit ? "i031_exact_cold_cache_probe_hit" : "i031_exact_cold_execution",
    input_tokens: 0, output_tokens: 0, estimated_cost_microusd: 0,
  });
}

function assertExactMeta(meta, expectedIdentity = EXACT) {
  assertEqual(meta.provider, expectedIdentity.provider, "provider");
  assertEqual(meta.model, expectedIdentity.model, "model");
  assertEqual(meta.selectorModel, expectedIdentity.selectorModel, "selectorModel");
  assertEqual(meta.promptVersion, expectedIdentity.sourcePromptVersion, "sourcePromptVersion");
  assertEqual(meta.selectorPromptVersion, expectedIdentity.selectorPromptVersion, "selectorPromptVersion");
  assertEqual(meta.finalPromptVersion, expectedIdentity.finalPromptVersion, "finalPromptVersion");
  assertEqual(meta.clientVersion, expectedIdentity.clientVersion, "clientVersion");
  assertEqual(
    meta.executionConfigSignature,
    expectedIdentity.executionConfigSignature,
    "executionConfigSignature",
  );
  assertEqual(
    meta.extractionStats?.extractor_version,
    expectedIdentity.frameExtractorVersion,
    "frameExtractorVersion",
  );
  assertEqual(meta.frameMode, expectedIdentity.frameMode, "frameMode");
  assertEqual(meta.interval, expectedIdentity.interval, "interval");
  assertEqual(meta.hybridAnchorBudget, expectedIdentity.hybridAnchorBudget, "hybridAnchorBudget");
  assertEqual(
    meta.selectorCandidateLimit,
    expectedIdentity.selectorCandidateLimit,
    "selectorCandidateLimit",
  );
  assertEqual(meta.singleRecipeOnly, true, "singleRecipeOnly");
  assertEqual(meta.cached, false, "cached");
  assertEqual(meta.declaredRunType, "cold", "declaredRunType");
  assertEqual(meta.modelReadBoundaryStatus, "clean", "modelReadBoundaryStatus");
  assertEqual(
    process.env.HOMECOOK_I031_CODEX_CLI_VERSION,
    expectedIdentity.codexCliVersion,
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

export function safeOutput(result, videoTitle, workerDataPersisted = false, expectedIdentity = EXACT) {
  assertExactMeta(result.meta, expectedIdentity);
  if (!Array.isArray(result.recipes) || result.recipes.length !== 1) {
    throw new Error("single recipe contract failed");
  }

  const recipe = result.recipes[0];
  return {
    schemaVersion: 1,
    identity: expectedIdentity,
    videoTitle,
    recipe: {
      title: recipe.title,
      ingredients: recipe.ingredients.map((ingredient) => ({
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        optional: ingredient.optional === true,
        groupLabel: ingredient.groupLabel ?? null,
        ...sanitizeIngredientEvidence(ingredient),
      })),
      steps: [...recipe.steps],
    },
    meta: {
      modelCallCount: result.meta.modelCallCount,
      ...(result.meta.repairCallCount !== undefined ? { repairCallCount: result.meta.repairCallCount } : {}),
      ...(result.meta.validationIssueCount !== undefined ? { validationIssueCount: result.meta.validationIssueCount } : {}),
      cacheHit: false,
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
    workerDataPersisted,
  };
}

export function createExtractionClientOptions(onProgress, analysisMode = null, configuration = {}) {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration) || Object.keys(configuration).some((key) => key !== "ocrStrategy")) throw new Error("invalid extraction configuration");
  if (configuration.ocrStrategy !== undefined && (!analysisMode || !["full", "selected", "auto"].includes(configuration.ocrStrategy))) throw new Error("invalid OCR strategy");
  if (analysisMode !== null && !["single-pass", "targeted-repair", "source-anchored"].includes(analysisMode)) throw new Error("invalid analysis mode");
  return {
    model: analysisMode === "source-anchored" ? "gpt-5.6-luna" : EXACT.model,
    selectorModel: EXACT.selectorModel,
    segmentModel: EXACT.selectorModel,
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
    timeoutMs: analysisMode ? 180_000 : TOTAL_TIMEOUT_MS,
    ...(analysisMode ? { analysisMode, ...(configuration.ocrStrategy ? { ocrStrategy: configuration.ocrStrategy } : {}) } : {}),
    onProgress,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const videoId = args["video-id"];
  if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId ?? "")) {
    throw new Error("invalid video id");
  }

  const resultPath = path.resolve(args.result ?? "");
  const metadataPath = path.resolve(args.metadata ?? "");
  const errorPath = path.resolve(args.error ?? "");
  const [resultDirectory, metadataDirectory, errorDirectory, runtimeDirectory] = await Promise.all([
    realpath(path.dirname(resultPath)),
    realpath(path.dirname(metadataPath)),
    realpath(path.dirname(errorPath)),
    realpath(process.cwd()),
  ]);
  if (
    resultDirectory !== runtimeDirectory
    || metadataDirectory !== runtimeDirectory
    || errorDirectory !== runtimeDirectory
  ) {
    throw new Error("output paths must stay in the runtime workspace");
  }

  const workerRpcClient = createWorkerRpcClient();
  workerRpcClient.reportProgress("source_fetch");
  const publishVideoMetadata = async (video) => {
    await workerRpcClient.updateTitle(video.title);
    const metadataTemporaryPath = `${metadataPath}.tmp`;
    await writeFile(metadataTemporaryPath, `${JSON.stringify({
      videoTitle: video.title,
    })}\n`, "utf8");
    await rename(metadataTemporaryPath, metadataPath);
  };
  const controller = new AbortController();
  const abortRequest = () => controller.abort(new Error("PROVIDER_CANCELLED"));
  process.once("SIGTERM", abortRequest);
  process.once("SIGINT", abortRequest);
  const requestStarted = Date.now();
  let prepared;
  const clientOptions = createExtractionClientOptions((stage, videoDurationSeconds) => {
    workerRpcClient.reportProgress(stage, videoDurationSeconds);
  }, ACTIVE_ANALYSIS_MODE, { ocrStrategy: "auto" });
  const runtimeIdentity = createExtractionIdentity(clientOptions);
  // The current DB cache rows are video-scoped rather than owner-scoped. A
  // source-anchored result must not cross user boundaries until the RPC
  // supplies and enforces a genuine owner identity.
  const ownerCacheEnabled = false;
  const legacyResultCacheEnabled = ACTIVE_ANALYSIS_MODE === null;
  try {
    if (ownerCacheEnabled) {
      const cached = await readOwnerResultCache({
        rpc: workerRpcClient, videoId, identity: runtimeIdentity, signal: controller.signal,
        fetchMetadata: (signal) => fetchVideoMeta(process.env.YOUTUBE_API_KEY, videoId, signal),
      });
      if (cached.status === "hit") {
        await publishVideoMetadata(cached.video);
        await workerRpcClient.resolveMethods(methodLabels(cached.output.recipe.steps));
        await recordRuntimeSuccessTelemetry(workerRpcClient, { runtimeIdentity, ownerCacheHit: true });
        const temporaryPath = `${resultPath}.tmp`;
        cached.output.meta.timings.workerElapsedMs = Date.now() - requestStarted;
        await writeFile(temporaryPath, `${JSON.stringify({ ...cached.output, workerDataPersisted: true })}\n`, "utf8");
        await rename(temporaryPath, resultPath);
        return;
      }
    }
    prepared = await prepareSourceAndMedia({
      signal: controller.signal,
      timeoutMs: 120_000,
      collectSource: ({ signal }) => snapshotVideo(
        process.env, videoId, "notebooks/recipe_loop_data/candidates",
        { useApifyFallback: true, workerRpcClient, onVideoMetadata: publishVideoMetadata, signal },
      ),
      prepareMedia: ({ signal }) => {
        workerRpcClient.reportProgress("video_download");
        return prepareYoutubeMedia({ videoId, runtimeDirectory, signal, timeoutMs: 120_000 });
      },
    });
    const { source } = prepared.source;
  const input = sourceToInput(source);
  const sourceHash = sha256({
    schema: runtimeIdentity.sourcePromptVersion,
    videoId,
    input,
  });
  const visualRequestHash = sha256({
    schema: runtimeIdentity.finalPromptVersion,
    videoId,
    frameMode: runtimeIdentity.frameMode,
    interval: runtimeIdentity.interval,
    hybridAnchorBudget: runtimeIdentity.hybridAnchorBudget,
  });
  const { llmCache, visualCache } = await readRuntimeResultCaches({
    enabled: legacyResultCacheEnabled, workerRpcClient, sourceHash, visualRequestHash, runtimeIdentity,
  });
  const llm = createCodexVisionKeyframesClient({
    ...clientOptions,
    preparedMedia: prepared.media.preparedMedia,
    signal: controller.signal,
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
  const output = safeOutput(result, source.video.title, false, runtimeIdentity);
  output.meta.timings.sourceFetchMs = prepared.timings.sourcePrepareMs;
  output.meta.timings.downloadMs = prepared.media.timings.downloadMs;
  output.meta.timings.parallelPrepareMs = prepared.timings.parallelPrepareMs;
  output.meta.timings.workerElapsedMs = Date.now() - requestStarted;
  if (ownerCacheEnabled) await writeOwnerResultCache({ rpc: workerRpcClient, output, sourceFingerprint: sourceHash, video: source.video });
  await writeRuntimeResultCaches({ llmEnabled: legacyResultCacheEnabled && !llmCache.cacheHit,
    visualEnabled: legacyResultCacheEnabled && !visualCache.cacheHit,
    workerRpcClient, sourceHash, visualRequestHash, runtimeIdentity, output });
  await recordRuntimeSuccessTelemetry(workerRpcClient, {
    runtimeIdentity, llmCacheHit: llmCache.cacheHit, visualCacheHit: visualCache.cacheHit,
  });
  await workerRpcClient.resolveMethods(methodLabels(output.recipe.steps));
  const temporaryPath = `${resultPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify({
    ...output,
    workerDataPersisted: true,
  })}\n`, "utf8");
  await rename(temporaryPath, resultPath);
  } finally {
    await prepared?.media?.cleanup?.();
    process.off("SIGTERM", abortRequest);
    process.off("SIGINT", abortRequest);
  }
}

function stableFailureCode(error) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  for (const code of [
    "NOT_RECIPE_VIDEO",
    "QUOTA_EXCEEDED",
    "RUNTIME_UNAVAILABLE",
    "NETWORK_ERROR",
    "RATE_LIMITED",
    "PROVIDER_TIMEOUT",
    "TRANSIENT_INTERNAL_ERROR",
  ]) {
    if (text.includes(code)) return code;
  }
  return "EXTRACTION_FAILED";
}

async function writeFailureEnvelope(error) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const errorPath = path.resolve(args.error ?? "");
    if (await realpath(path.dirname(errorPath)) !== await realpath(process.cwd())) return;
    const code = stableFailureCode(error);
    const temporaryPath = `${errorPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify({
      code,
      retryable: [
        "NETWORK_ERROR",
        "RATE_LIMITED",
        "PROVIDER_TIMEOUT",
        "TRANSIENT_INTERNAL_ERROR",
      ].includes(code),
      stage: "provider",
    })}\n`, "utf8");
    await rename(temporaryPath, errorPath);
  } catch {
    // The parent process maps a missing sidecar to EXTRACTION_FAILED.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
  .catch(async (error) => {
    await writeFailureEnvelope(error);
    console.error("[youtube-i031-worker] extraction failed");
    process.exitCode = 1;
  })
  .finally(() => {
    process.disconnect?.();
  });
