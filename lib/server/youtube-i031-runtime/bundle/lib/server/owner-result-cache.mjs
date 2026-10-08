import { createHash } from 'node:crypto';
import { validateRuntimeQuantityEvidence } from './recipe-extraction-lab/quantity-evidence.mjs';

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const HASH = /^[a-f0-9]{64}$/u;
export const OWNER_RESULT_CACHE_VERSION = 1;

function isCacheUnavailable(error) {
  // The standalone IPC client reconstructs the exact internal code as a message.
  return error?.code === 'CACHE_UNAVAILABLE'
    || (error instanceof Error && error.message === 'CACHE_UNAVAILABLE');
}

export function metadataFingerprint(video) {
  return digest({
    videoId: video.videoId, title: video.title, description: video.description,
    channelId: video.channelId ?? null, publishedAt: video.publishedAt ?? null,
    tags: video.tags ?? [], defaultLanguage: video.defaultLanguage ?? null,
    durationSeconds: video.durationSeconds ?? null,
  });
}

export async function readOwnerResultCache({ rpc, videoId, identity, fetchMetadata, signal = /** @type {AbortSignal | undefined} */ (undefined), now = Date.now }) {
  const started = now();
  let lookupMs = null;
  let metadataMs = null;
  try {
    signal?.throwIfAborted();
    const response = await rpc.accessCache('sanitized_read', {});
    lookupMs = now() - started;
    const cache = response?.cache;
    const envelope = cache?.result_json;
    const result = envelope?.result;
    const verifiedAt = Date.parse(envelope?.verifiedAt);
    if (!cache || envelope?.cacheSchemaVersion !== OWNER_RESULT_CACHE_VERSION
      || !HASH.test(envelope?.sourceFingerprint ?? '') || !HASH.test(envelope?.metadataFingerprint ?? '')
      || !Number.isFinite(verifiedAt) || verifiedAt > now() || now() - verifiedAt >= 86_400_000
      || !(Date.parse(cache.expires_at) > now())
      || result?.schemaVersion !== 1 || result.meta?.cacheHit === true
      || !Number.isInteger(result.meta?.modelCallCount) || result.meta.modelCallCount < 1 || result.meta.modelCallCount > 2
      || !Array.isArray(result.recipe?.ingredients) || !result.recipe.ingredients.length
      || !Array.isArray(result.recipe?.steps)
      || Object.entries(identity).some(([key, value]) => result.identity?.[key] !== value)) {
      return { status: 'miss', reason: cache ? 'stale_or_incompatible' : 'empty', timings: { cacheLookupMs: lookupMs, metadataCheckMs: null } };
    }
    validateRuntimeQuantityEvidence(result);
    if (result.recipe.ingredients.some((ingredient) => !ingredient.quantityState)) {
      return { status: 'miss', reason: 'legacy_evidence', timings: { cacheLookupMs: lookupMs, metadataCheckMs: null } };
    }
    const metadataStart = now();
    const metadataSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000);
    let video;
    try {
      video = await fetchMetadata(metadataSignal);
    } catch {
      signal?.throwIfAborted();
      return { status: 'miss', reason: 'revalidation_unavailable', timings: { cacheLookupMs: lookupMs, metadataCheckMs: now() - metadataStart } };
    }
    metadataMs = now() - metadataStart;
    signal?.throwIfAborted();
    if (video.videoId !== videoId || metadataFingerprint(video) !== envelope.metadataFingerprint) {
      return { status: 'miss', reason: 'source_changed', video, timings: { cacheLookupMs: lookupMs, metadataCheckMs: metadataMs } };
    }
    // Reuse extraction facts, never a previously consumed user's draft/session.
    const output = structuredClone(result);
    delete output.workerDataPersisted;
    output.meta = {
      ...output.meta, cacheHit: true, sourceRunModelCallCount: result.meta.modelCallCount,
      modelCallCount: 0, frameCount: 0, selectedFrameCount: 0, selectorBypassed: true,
      screenOcrStatus: 'cache', repairCallCount: 0,
      timings: {
        frameExtractMs: 0, selectorMs: 0, finalMs: 0, totalFreshMs: null, ocrTotalMs: 0,
        sourceFetchMs: metadataMs, downloadMs: 0, parallelPrepareMs: 0,
        workerElapsedMs: now() - started, cacheLookupMs: lookupMs, metadataCheckMs: metadataMs,
      },
    };
    return { status: 'hit', output, video, timings: { cacheLookupMs: lookupMs, metadataCheckMs: metadataMs } };
  } catch (error) {
    signal?.throwIfAborted();
    if (!isCacheUnavailable(error)) throw error;
    return { status: 'miss', reason: 'cache_unavailable', timings: { cacheLookupMs: lookupMs, metadataCheckMs: metadataMs } };
  }
}

export async function writeOwnerResultCache({ rpc, output, sourceFingerprint, video }) {
  if (!HASH.test(sourceFingerprint ?? '') || output?.meta?.cacheHit === true
    || !Number.isInteger(output?.meta?.modelCallCount) || output.meta.modelCallCount < 1 || output.meta.modelCallCount > 2
    || output.recipe?.ingredients?.some((ingredient) => !ingredient.quantityState)) return false;
  validateRuntimeQuantityEvidence(output);
  const result = structuredClone(output);
  delete result.workerDataPersisted;
  try {
    await rpc.accessCache('sanitized_upsert', { result_json: {
      cacheSchemaVersion: OWNER_RESULT_CACHE_VERSION, sourceFingerprint,
      metadataFingerprint: metadataFingerprint(video), result,
    } });
    return true;
  } catch (error) {
    if (!isCacheUnavailable(error)) throw error;
    // Only known availability failures may leave a verified cold recipe uncached.
    return false;
  }
}
