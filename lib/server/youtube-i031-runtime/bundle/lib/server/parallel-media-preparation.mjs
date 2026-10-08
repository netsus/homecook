import { spawn } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXTRACTOR_PATH = fileURLToPath(new URL("../../scripts/recipe-loop/extract-video-frames.py", import.meta.url));

function abortError(signal) {
  return signal?.reason instanceof Error ? signal.reason : Object.assign(new Error("media preparation aborted"), { name: "AbortError" });
}

function contained(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

// Each child owns a process group so yt-dlp / ffmpeg descendants cannot survive a
// timeout or an aborted request. Wait for close before the caller removes files.
export async function runPreparationProcess(command, args, {
  cwd = process.cwd(), signal, timeoutMs = 120_000, spawnImpl = spawn,
  killProcessGroup = (pid) => process.kill(-pid, "SIGKILL"),
  onOutputLine = null,
  input = null,
  env = process.env,
} = {}) {
  if (signal?.aborted) throw abortError(signal);
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { cwd, env, detached: process.platform !== "win32", stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let output = "";
    const lineBuffers = { stdout: "", stderr: "" };
    const publish = (line) => {
      try { onOutputLine?.(line); } catch { /* Progress must not change execution. */ }
    };
    const capture = (stream) => (chunk) => {
      output = (output + chunk).slice(-1_000_000);
      if (stream === "stdout") stdout = (stdout + chunk).slice(-1_000_000);
      else stderr = (stderr + chunk).slice(-64_000);
      lineBuffers[stream] += chunk;
      const lines = lineBuffers[stream].split(/\r?\n/u);
      lineBuffers[stream] = lines.pop() ?? "";
      for (const line of lines) publish(line);
    };
    let stopped = null;
    const stop = (error) => {
      if (stopped) return;
      stopped = error;
      try { killProcessGroup(child.pid); } catch { child.kill("SIGKILL"); }
    };
    const onAbort = () => stop(abortError(signal));
    const onTermination = () => stop(Object.assign(new Error("media preparation interrupted"), { name: "AbortError" }));
    const onParentExit = () => { try { killProcessGroup(child.pid); } catch { child.kill("SIGKILL"); } };
    const timer = setTimeout(() => stop(Object.assign(new Error("PROVIDER_TIMEOUT: subprocess timed out"), { code: "PROVIDER_TIMEOUT" })), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      process.removeListener("SIGTERM", onTermination);
      process.removeListener("SIGINT", onTermination);
      process.removeListener("exit", onParentExit);
    };
    process.once("SIGTERM", onTermination);
    process.once("SIGINT", onTermination);
    process.once("exit", onParentExit);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    child.stdout.on("data", capture("stdout"));
    child.stderr.on("data", capture("stderr"));
    child.once("error", (error) => { cleanup(); reject(stopped ?? error); });
    child.once("close", (code) => {
      cleanup();
      for (const line of Object.values(lineBuffers)) if (line) publish(line);
      if (stopped) reject(stopped);
      else resolve({ code: code ?? 1, stdout, stderr, output });
    });
    if (input !== null) {
      child.stdin.on("error", () => { /* A process error/close reports a failed reader. */ });
      child.stdin.end(input);
    }
  });
}

export async function prepareYoutubeMedia({
  videoId, runtimeDirectory = process.cwd(), signal, timeoutMs = 120_000,
  runProcessImpl = runPreparationProcess, extractorPath = EXTRACTOR_PATH,
} = {}) {
  if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId ?? "")) throw new Error("invalid video id");
  signal?.throwIfAborted();
  const runtimeRoot = await realpath(runtimeDirectory);
  const rootDir = await mkdtemp(path.join(runtimeRoot, ".prepared-media-"));
  const startedAt = performance.now();
  const cleanup = () => rm(rootDir, { recursive: true, force: true });
  try {
    const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const result = await runProcessImpl("python3", [
      extractorPath, sourceUrl, "--video-id", videoId, "--out-dir", rootDir,
      "--download-only", "--no-cache",
    ], { cwd: runtimeRoot, timeoutMs, signal });
    if (result.code !== 0) throw Object.assign(new Error("video preparation process failed"), { code: "MEDIA_PREPARATION_FAILED" });
    signal?.throwIfAborted();
    const manifestPath = path.join(rootDir, "source-preparation.json");
    if (!contained(rootDir, await realpath(manifestPath))) throw new Error("prepared manifest escaped its request directory");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.schemaVersion !== 1 || manifest.videoId !== videoId || manifest.source !== sourceUrl) {
      throw new Error("prepared media identity mismatch");
    }
    if (manifest.sourcePath !== null) {
      const sourcePath = await realpath(manifest.sourcePath);
      if (!contained(rootDir, sourcePath) || !(await stat(sourcePath)).isFile()) throw new Error("prepared video escaped its request directory");
    }
    return {
      preparedMedia: { manifestPath, rootDir }, cleanup,
      timings: { mediaPrepareMs: Math.round(performance.now() - startedAt), downloadMs: manifest.sourcePrepareMs },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

// Both callbacks must pass signal to their I/O. On failure, drain both branches
// before cleanup, so no cancelled source/download operation can recreate files.
export async function prepareSourceAndMedia({ collectSource, prepareMedia, signal, timeoutMs = 120_000 } = {}) {
  if (typeof collectSource !== "function" || typeof prepareMedia !== "function") throw new Error("source and media preparation callbacks are required");
  signal?.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort(abortError(signal));
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const timer = setTimeout(() => controller.abort(Object.assign(new Error("PROVIDER_TIMEOUT: source and media preparation timed out"), { code: "PROVIDER_TIMEOUT" })), timeoutMs);
  const startedAt = performance.now();
  const timings = {};
  const branch = (callback, timingKey) => Promise.resolve().then(() => callback({ signal: controller.signal })).then((value) => {
    timings[timingKey] = Math.round(performance.now() - startedAt);
    return value;
  });
  const sourcePromise = branch(collectSource, "sourcePrepareMs");
  const mediaPromise = branch(prepareMedia, "mediaPrepareMs");
  try {
    const [source, media] = await Promise.all([sourcePromise, mediaPromise]);
    controller.signal.throwIfAborted();
    return { source, media, timings: { ...timings, parallelPrepareMs: Math.round(performance.now() - startedAt) } };
  } catch (error) {
    controller.abort(error);
    const results = await Promise.allSettled([sourcePromise, mediaPromise]);
    if (results[1].status === "fulfilled") await results[1].value?.cleanup?.();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
