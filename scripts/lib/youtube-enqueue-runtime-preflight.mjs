const FINGERPRINT_KEY_PREFIX = "HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V";
const CURSOR_KEY = "HOMECOOK_YOUTUBE_EXTRACTION_CURSOR_HMAC_KEY_V1";

function configuredSecret(value) {
  // Match youtube-async-extraction-routes.ts requireSecret exactly.
  return typeof value === "string" && Buffer.byteLength(value.trim(), "utf8") >= 32;
}

function version(value) {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

/**
 * Pure secret check AFTER production env-file loading and runtime secret injection.
 * `readiness` is the existing verified loader's normalized projection (active previous
 * only), or an equivalent reviewed deployment projection. This does not verify metadata,
 * policy authority, TTL, credentials, or DB privileges; callers must retain those guards.
 * No IO, clock, secret return values, secret digests, lengths, or mutations.
 *
 * @param {{
 *   env: Readonly<Record<string, string | undefined>>,
 *   readiness: { currentFingerprintKeyVersion: string, previousFingerprintKeyVersion: string | null,
 *     previousFingerprintValidUntil: string | null } | { code: string } | null,
 * }} options
 */
export function inspectYoutubeEnqueueRuntimeSecrets({ env, readiness }) {
  const cursor = Object.freeze({ requiredForEnqueue: false, configured: configuredSecret(env[CURSOR_KEY]) });
  const finish = (status, code, currentVersion = null, previousVersion = null) => Object.freeze({
    ready: status !== "blocked", status, code, currentVersion, previousVersion, cursor,
  });
  if (env.HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION !== "1") return finish("disabled", null);
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) {
    return finish("blocked", "YOUTUBE_ENQUEUE_READINESS_UNAVAILABLE");
  }
  if ("code" in readiness) {
    return finish("blocked", readiness.code === "POLICY_CHANGED"
      ? "YOUTUBE_ENQUEUE_POLICY_CHANGED" : "YOUTUBE_ENQUEUE_READINESS_UNAVAILABLE");
  }
  const current = readiness.currentFingerprintKeyVersion;
  const previous = readiness.previousFingerprintKeyVersion;
  const until = readiness.previousFingerprintValidUntil;
  if (!version(current) || !(previous === null && until === null
    || version(previous) && typeof until === "string" && Number.isFinite(Date.parse(until)))) {
    return finish("blocked", "YOUTUBE_ENQUEUE_READINESS_UNAVAILABLE");
  }
  if (!configuredSecret(env[`${FINGERPRINT_KEY_PREFIX}${current}`])) {
    return finish("blocked", "YOUTUBE_ENQUEUE_CURRENT_FINGERPRINT_SECRET_UNAVAILABLE", current, previous);
  }
  if (previous !== null && !configuredSecret(env[`${FINGERPRINT_KEY_PREFIX}${previous}`])) {
    return finish("blocked", "YOUTUBE_ENQUEUE_PREVIOUS_FINGERPRINT_SECRET_UNAVAILABLE", current, previous);
  }
  return finish("ready", null, current, previous);
}

export class YoutubeEnqueueRuntimePreflightError extends Error {
  constructor(code) {
    super("YouTube enqueue runtime preflight failed.");
    this.name = "YoutubeEnqueueRuntimePreflightError";
    this.code = code;
  }
}

/** Callers may log only this sanitized result/error code, never their runtime env. */
export function assertYoutubeEnqueueRuntimeSecrets(options) {
  const result = inspectYoutubeEnqueueRuntimeSecrets(options);
  if (!result.ready) throw new YoutubeEnqueueRuntimePreflightError(result.code);
  return result;
}
