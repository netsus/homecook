import { describe, expect, it } from "vitest";
import { inspectYoutubeEnqueueRuntimeSecrets, assertYoutubeEnqueueRuntimeSecrets, YoutubeEnqueueRuntimePreflightError } from "../scripts/lib/youtube-enqueue-runtime-preflight.mjs";
import { prepareStartProductionRuntimeEnv } from "../scripts/lib/start-production-runtime.mjs";

const key = (version: string) => `HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V${version}`;
const cursorKey = "HOMECOOK_YOUTUBE_EXTRACTION_CURSOR_HMAC_KEY_V1";
const readiness = { currentFingerprintKeyVersion: "2", previousFingerprintKeyVersion: null, previousFingerprintValidUntil: null };
const active = { ...readiness, previousFingerprintKeyVersion: "1", previousFingerprintValidUntil: "2099-01-01T00:00:00Z" };
const valid = "synthetic-no-production-secret-".repeat(2);
const enabled = { HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION: "1" };

describe("YouTube final runtime environment preflight", () => {
  it("blocks missing V2 even when readiness metadata passed and unrelated keys exist", () => {
    const result = inspectYoutubeEnqueueRuntimeSecrets({ env: { ...enabled, [key("1")]: valid, [cursorKey]: valid }, readiness });
    expect(result).toMatchObject({ ready: false, code: "YOUTUBE_ENQUEUE_CURRENT_FINGERPRINT_SECRET_UNAVAILABLE", currentVersion: "2" });
    expect(() => assertYoutubeEnqueueRuntimeSecrets({ env: enabled, readiness })).toThrow(YoutubeEnqueueRuntimePreflightError);
  });
  it.each([undefined, "", " ".repeat(40), "x".repeat(31), `  ${"x".repeat(31)}  `])("rejects missing or short trimmed current key %j", secret => {
    expect(inspectYoutubeEnqueueRuntimeSecrets({ env: { ...enabled, [key("2")]: secret }, readiness }).ready).toBe(false);
  });
  it.each(["x".repeat(32), ` \n${"x".repeat(32)}\t `, "한".repeat(11)])("accepts >=32 UTF8 bytes after trim without returning the key", secret => {
    const result = assertYoutubeEnqueueRuntimeSecrets({ env: { ...enabled, [key("2")]: secret }, readiness });
    expect(result).toMatchObject({ ready: true, status: "ready", currentVersion: "2", previousVersion: null });
    expect(JSON.stringify(result)).not.toContain(secret.trim());
    expect(Object.keys(result)).toEqual(["ready", "status", "code", "currentVersion", "previousVersion", "cursor"]);
  });
  it("requires every active previous key and never uses current/cursor as its fallback", () => {
    const env = { ...enabled, [key("2")]: valid, [cursorKey]: valid };
    expect(inspectYoutubeEnqueueRuntimeSecrets({ env, readiness: active }).code).toBe("YOUTUBE_ENQUEUE_PREVIOUS_FINGERPRINT_SECRET_UNAVAILABLE");
    expect(inspectYoutubeEnqueueRuntimeSecrets({ env: { ...env, [key("1")]: "x".repeat(31) }, readiness: active }).ready).toBe(false);
    expect(assertYoutubeEnqueueRuntimeSecrets({ env: { ...env, [key("1")]: valid }, readiness: active })).toMatchObject({ ready: true, previousVersion: "1" });
  });
  it("does not require expired/disabled previous keys omitted by the verified readiness loader", () => {
    expect(assertYoutubeEnqueueRuntimeSecrets({ env: { ...enabled, [key("2")]: valid, [key("1")]: "short" }, readiness }).ready).toBe(true);
  });
  it.each([null, { code: "QUEUE_UNAVAILABLE" }, { currentFingerprintKeyVersion: "", previousFingerprintKeyVersion: null, previousFingerprintValidUntil: null },
    { ...readiness, previousFingerprintKeyVersion: "1" }, { ...readiness, previousFingerprintValidUntil: "2099-01-01" }])("does not turn invalid readiness into key-only success: %j", value => {
    expect(inspectYoutubeEnqueueRuntimeSecrets({ env: { ...enabled, [key("2")]: valid }, readiness: value }).code).toBe("YOUTUBE_ENQUEUE_READINESS_UNAVAILABLE");
  });
  it("preserves policy changed as a distinct blocked state", () => {
    expect(inspectYoutubeEnqueueRuntimeSecrets({ env: { ...enabled, [key("2")]: valid }, readiness: { code: "POLICY_CHANGED" } }).code).toBe("YOUTUBE_ENQUEUE_POLICY_CHANGED");
  });
  it.each([undefined, "0", "true", " 1"])("does not enable async for non-exact flag %j", flag => {
    expect(inspectYoutubeEnqueueRuntimeSecrets({ env: { HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION: flag }, readiness: null })).toMatchObject({ ready: true, status: "disabled" });
  });
  it("reports cursor independently without blocking enqueue or accepting cursor as fingerprint", () => {
    expect(assertYoutubeEnqueueRuntimeSecrets({ env: { ...enabled, [key("2")]: valid }, readiness }).cursor).toEqual({ requiredForEnqueue: false, configured: false });
    expect(assertYoutubeEnqueueRuntimeSecrets({ env: { ...enabled, [key("2")]: valid, [cursorKey]: valid }, readiness }).cursor.configured).toBe(true);
    expect(inspectYoutubeEnqueueRuntimeSecrets({ env: { ...enabled, [cursorKey]: valid }, readiness }).ready).toBe(false);
  });
  it("checks the final production env after env files and secret injection, without changing the loader", () => {
    const processEnv: Record<string, string | undefined> = { ...enabled, [key("2")]: "stale-short-value" };
    const calls: string[] = [];
    const env = prepareStartProductionRuntimeEnv({ repositoryRoot: "/tmp/synthetic-repo", processEnv,
      loadEnvFiles() { calls.push("production-env-files"); processEnv.HOMECOOK_FULL_LOCAL_SECRET_DIR = "/tmp/synthetic-secrets"; },
      loadSecretEnv({ secretDirectory }) { calls.push(`secrets:${secretDirectory}`); return { [key("2")]: valid }; },
    });
    expect(calls).toEqual(["production-env-files", "secrets:/tmp/synthetic-secrets"]);
    expect(assertYoutubeEnqueueRuntimeSecrets({ env, readiness }).ready).toBe(true);
    expect(processEnv[key("2")]).toBe("stale-short-value");
  });
  it("returns only safe metadata and fixed errors, never secrets, digests, lengths or caller errors", () => {
    const before = JSON.stringify(readiness);
    const env: Record<string, string | undefined> = { ...enabled, [key("2")]: "synthetic-short-key" };
    let error: unknown;
    try { assertYoutubeEnqueueRuntimeSecrets({ env, readiness }); } catch (value) { error = value; }
    expect(error).toBeInstanceOf(YoutubeEnqueueRuntimePreflightError);
    expect(String(error)).toBe("YoutubeEnqueueRuntimePreflightError: YouTube enqueue runtime preflight failed.");
    expect(JSON.stringify(error)).toBe('{"name":"YoutubeEnqueueRuntimePreflightError","code":"YOUTUBE_ENQUEUE_CURRENT_FINGERPRINT_SECRET_UNAVAILABLE"}');
    const result = inspectYoutubeEnqueueRuntimeSecrets({ env: { ...enabled, [key("2")]: valid }, readiness });
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.cursor)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/synthetic|secret|sha256|length|bytes/i);
    expect(JSON.stringify(readiness)).toBe(before); expect(env[key("2")]).toBe("synthetic-short-key");
  });
});
