import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, link, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

export type YoutubeRecipeExtractorMode = "legacy" | "i031_codex_vision";
type RuntimeEnv = Readonly<Record<string, string | undefined>>;

export const I031_CODEX_CLI_VERSION = "0.144.0-alpha.4";
export const I031_TOTAL_TIMEOUT_MS = 20 * 60 * 1000;

export const I031_EXACT_IDENTITY = Object.freeze({
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
} as const);

type YoutubeI031RuntimeStage =
  | "config"
  | "queue"
  | "preflight"
  | "bundle"
  | "runtime"
  | "output"
  | "cleanup";

export class YoutubeI031RuntimeError extends Error {
  readonly code: string;
  readonly stage: YoutubeI031RuntimeStage;

  constructor(code: string, stage: YoutubeI031RuntimeStage, message: string) {
    super(message);
    this.name = "YoutubeI031RuntimeError";
    this.code = code;
    this.stage = stage;
  }
}

export interface YoutubeI031Ingredient {
  name: string;
  amount: string | null;
  unit: string | null;
  optional: boolean;
  groupLabel: string | null;
}

export interface YoutubeI031Recipe {
  title: string;
  ingredients: YoutubeI031Ingredient[];
  steps: string[];
}

export interface YoutubeI031SafeMeta {
  modelCallCount: number;
  frameCount: number;
  selectedFrameCount: number;
  selectorBypassed: boolean;
  screenOcrStatus: string;
  sourceAvailability: {
    description: boolean;
    authorComment: boolean;
    transcript: boolean;
    onscreen: boolean;
  };
  timings: {
    frameExtractMs: number | null;
    selectorMs: number | null;
    finalMs: number | null;
    totalFreshMs: number | null;
    ocrTotalMs: number | null;
  };
}

export interface YoutubeI031WorkerOutput {
  schemaVersion: 1;
  identity: typeof I031_EXACT_IDENTITY & {
    codexCliVersion: typeof I031_CODEX_CLI_VERSION;
  };
  recipe: YoutubeI031Recipe;
  meta: YoutubeI031SafeMeta;
}

export interface YoutubeI031ExtractionResult {
  identity: YoutubeI031WorkerOutput["identity"];
  recipe: YoutubeI031Recipe;
  meta: YoutubeI031SafeMeta;
}

export interface YoutubeI031Extractor {
  extract(input: {
    videoId: string;
    signal?: AbortSignal;
  }): Promise<YoutubeI031ExtractionResult>;
}

interface PreflightResult {
  codexBin: string;
  codexCliVersion: string;
}

interface CommandResult {
  stdout: string;
  stderr?: string;
}

type RunCommand = (
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv },
) => Promise<CommandResult>;

interface VerifyPreflightOptions {
  env?: RuntimeEnv;
  codexBin?: string;
  accessPath?: (target: string) => Promise<void>;
  runCommand?: RunCommand;
  platform?: NodeJS.Platform;
}

interface WorkerRunInput {
  workspace: string;
  videoId: string;
  signal: AbortSignal;
  workerEnv: NodeJS.ProcessEnv;
  codexBin: string;
}

interface YoutubeI031ExtractorDependencies {
  timeoutMs?: number;
  verifyPreflight?: () => Promise<PreflightResult>;
  createWorkspace?: () => Promise<string>;
  copyRuntimeBundle?: (workspace: string) => Promise<void>;
  runWorker?: (input: WorkerRunInput) => Promise<unknown>;
  cleanupWorkspace?: (workspace: string) => Promise<void>;
}

interface RuntimeBundleManifest {
  schemaVersion: 1;
  files: Record<string, string>;
}

const RUNTIME_BUNDLE_ROOT = path.join(
  process.cwd(),
  "lib/server/youtube-i031-runtime/bundle",
);
const DEFAULT_CODEX_BIN = path.join(
  process.cwd(),
  ".youtube-i031-tools/node_modules/.pnpm",
  `@openai+codex@${I031_CODEX_CLI_VERSION}-darwin-arm64`,
  "node_modules/@openai/codex/vendor/aarch64-apple-darwin/bin/codex",
);
const MAX_WORKER_OUTPUT_BYTES = 1024 * 1024;
const SAFE_SCREEN_OCR_STATUS_RE = /^[a-z0-9_-]{1,40}$/u;

let defaultExtractor: YoutubeI031Extractor | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      `i031 output field is invalid: ${field}`,
    );
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      `i031 output field is invalid: ${field}`,
    );
  }

  return normalized;
}

function nullableString(value: unknown, field: string, maxLength: number) {
  if (value === null) {
    return null;
  }

  return requiredString(value, field, maxLength);
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number) {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      `i031 output field is invalid: ${field}`,
    );
  }

  return Number(value);
}

function nullableDuration(value: unknown, field: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      `i031 output field is invalid: ${field}`,
    );
  }

  return value;
}

function assertExactIdentity(identity: unknown): YoutubeI031WorkerOutput["identity"] {
  if (!isRecord(identity)) {
    throw new YoutubeI031RuntimeError(
      "I031_IDENTITY_MISMATCH",
      "output",
      "I031_IDENTITY_MISMATCH: identity is missing",
    );
  }

  for (const [field, expected] of Object.entries(I031_EXACT_IDENTITY)) {
    if (identity[field] !== expected) {
      throw new YoutubeI031RuntimeError(
        "I031_IDENTITY_MISMATCH",
        "output",
        `I031_IDENTITY_MISMATCH: ${field}`,
      );
    }
  }

  if (identity.codexCliVersion !== I031_CODEX_CLI_VERSION) {
    throw new YoutubeI031RuntimeError(
      "I031_IDENTITY_MISMATCH",
      "output",
      "I031_IDENTITY_MISMATCH: codexCliVersion",
    );
  }

  return {
    ...I031_EXACT_IDENTITY,
    codexCliVersion: I031_CODEX_CLI_VERSION,
  };
}

function parseRecipe(value: unknown): YoutubeI031Recipe {
  if (!isRecord(value) || !Array.isArray(value.ingredients) || !Array.isArray(value.steps)) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      "i031 recipe output is invalid",
    );
  }

  if (value.ingredients.length === 0 || value.ingredients.length > 300) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      "i031 ingredient count is invalid",
    );
  }

  if (value.steps.length === 0 || value.steps.length > 500) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      "i031 step count is invalid",
    );
  }

  const ingredients = value.ingredients.map((ingredient, index): YoutubeI031Ingredient => {
    if (!isRecord(ingredient) || typeof ingredient.optional !== "boolean") {
      throw new YoutubeI031RuntimeError(
        "I031_INVALID_OUTPUT",
        "output",
        `i031 ingredient is invalid: ${index}`,
      );
    }

    return {
      name: requiredString(ingredient.name, `ingredients[${index}].name`, 100),
      amount: nullableString(ingredient.amount, `ingredients[${index}].amount`, 40),
      unit: nullableString(ingredient.unit, `ingredients[${index}].unit`, 40),
      optional: ingredient.optional,
      groupLabel: nullableString(ingredient.groupLabel, `ingredients[${index}].groupLabel`, 80),
    };
  });

  return {
    title: requiredString(value.title, "recipe.title", 200),
    ingredients,
    steps: value.steps.map((step, index) =>
      requiredString(step, `steps[${index}]`, 2_000)),
  };
}

function parseSourceAvailability(value: unknown): YoutubeI031SafeMeta["sourceAvailability"] {
  if (!isRecord(value)) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      "i031 source availability is invalid",
    );
  }

  const result = {
    description: value.description,
    authorComment: value.authorComment,
    transcript: value.transcript,
    onscreen: value.onscreen,
  };

  if (Object.values(result).some((item) => typeof item !== "boolean")) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      "i031 source availability is invalid",
    );
  }

  return result as YoutubeI031SafeMeta["sourceAvailability"];
}

function parseSafeMeta(value: unknown): YoutubeI031SafeMeta {
  if (!isRecord(value) || !isRecord(value.timings)) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      "i031 metadata is invalid",
    );
  }

  if (typeof value.selectorBypassed !== "boolean") {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      "i031 selector metadata is invalid",
    );
  }

  const screenOcrStatus = requiredString(value.screenOcrStatus, "meta.screenOcrStatus", 40);
  if (!SAFE_SCREEN_OCR_STATUS_RE.test(screenOcrStatus)) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      "i031 screen OCR status is invalid",
    );
  }

  return {
    modelCallCount: boundedInteger(value.modelCallCount, "meta.modelCallCount", 1, 2),
    frameCount: boundedInteger(value.frameCount, "meta.frameCount", 1, 10_000),
    selectedFrameCount: boundedInteger(value.selectedFrameCount, "meta.selectedFrameCount", 1, 8),
    selectorBypassed: value.selectorBypassed,
    screenOcrStatus,
    sourceAvailability: parseSourceAvailability(value.sourceAvailability),
    timings: {
      frameExtractMs: nullableDuration(value.timings.frameExtractMs, "meta.timings.frameExtractMs"),
      selectorMs: nullableDuration(value.timings.selectorMs, "meta.timings.selectorMs"),
      finalMs: nullableDuration(value.timings.finalMs, "meta.timings.finalMs"),
      totalFreshMs: nullableDuration(value.timings.totalFreshMs, "meta.timings.totalFreshMs"),
      ocrTotalMs: nullableDuration(value.timings.ocrTotalMs, "meta.timings.ocrTotalMs"),
    },
  };
}

export function parseYoutubeI031WorkerOutput(value: unknown): YoutubeI031ExtractionResult {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_OUTPUT",
      "output",
      "i031 worker output is invalid",
    );
  }

  return {
    identity: assertExactIdentity(value.identity),
    recipe: parseRecipe(value.recipe),
    meta: parseSafeMeta(value.meta),
  };
}

export function resolveYoutubeRecipeExtractorMode(
  env: RuntimeEnv = process.env,
): YoutubeRecipeExtractorMode {
  const rawMode = env.YOUTUBE_RECIPE_EXTRACTOR_MODE?.trim();
  if (!rawMode || rawMode === "legacy") {
    return "legacy";
  }

  if (rawMode === "i031_codex_vision") {
    return rawMode;
  }

  throw new YoutubeI031RuntimeError(
    "I031_INVALID_MODE",
    "config",
    "YOUTUBE_RECIPE_EXTRACTOR_MODE must be legacy or i031_codex_vision",
  );
}

function copyOptionalEnv(
  target: NodeJS.ProcessEnv,
  source: RuntimeEnv,
  key: string,
) {
  const value = source[key];
  if (typeof value === "string" && value.length > 0) {
    target[key] = value;
  }
}

export function buildYoutubeI031WorkerEnv(
  source: RuntimeEnv,
  codexBin: string,
): NodeJS.ProcessEnv {
  const runtimePath = [
    path.dirname(codexBin),
    path.dirname(process.execPath),
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ].join(path.delimiter);
  const workerEnv: NodeJS.ProcessEnv = {
    HOME: source.HOME || homedir(),
    PATH: runtimePath,
    TMPDIR: source.TMPDIR || tmpdir(),
    YOUTUBE_API_KEY: source.YOUTUBE_API_KEY,
    HOMECOOK_I031_CODEX_CLI_VERSION: I031_CODEX_CLI_VERSION,
    NODE_ENV: "production",
  };

  for (const key of [
    "APIFY_TOKEN",
    "YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID",
    "YOUTUBE_TRANSCRIPT_PAID_TIMEOUT_MS",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
    "NODE_EXTRA_CA_CERTS",
  ]) {
    copyOptionalEnv(workerEnv, source, key);
  }

  for (const [key, value] of Object.entries(workerEnv)) {
    if (value === undefined) {
      delete workerEnv[key];
    }
  }

  return workerEnv;
}

async function defaultRunCommand(
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `command exited with ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function dependencyError(code: string, message: string) {
  return new YoutubeI031RuntimeError(code, "preflight", message);
}

export async function verifyYoutubeI031Preflight(
  options: VerifyPreflightOptions = {},
): Promise<PreflightResult> {
  const env = options.env ?? process.env;
  const codexBin = options.codexBin
    ?? env.YOUTUBE_I031_CODEX_BIN
    ?? DEFAULT_CODEX_BIN;
  const accessPath = options.accessPath ?? access;
  const runCommand = options.runCommand ?? defaultRunCommand;
  const platform = options.platform ?? process.platform;

  if (!env.YOUTUBE_API_KEY) {
    throw dependencyError(
      "I031_MISSING_YOUTUBE_KEY",
      "YOUTUBE_API_KEY is required for the exact i031 source snapshot",
    );
  }

  if (platform !== "darwin") {
    throw dependencyError(
      "I031_UNSUPPORTED_PLATFORM",
      "The exact i031 runtime requires macOS",
    );
  }

  const home = env.HOME || homedir();
  const requiredPaths = [
    codexBin,
    path.join(home, ".codex/auth.json"),
    "/usr/bin/sandbox-exec",
    "/usr/bin/swiftc",
  ];

  try {
    await Promise.all(requiredPaths.map((target) => accessPath(target)));
  } catch {
    throw dependencyError(
      "I031_DEPENDENCY_MISSING",
      "The exact i031 runtime is not installed or Codex login is unavailable",
    );
  }

  let versionResult: CommandResult;
  try {
    versionResult = await runCommand(codexBin, ["--version"], {
      env: buildYoutubeI031WorkerEnv(env, codexBin),
    });
  } catch {
    throw dependencyError(
      "I031_DEPENDENCY_MISSING",
      "The exact Codex CLI is not executable",
    );
  }

  const versionMatch = versionResult.stdout.match(/\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/u);
  if (versionMatch?.[1] !== I031_CODEX_CLI_VERSION) {
    throw dependencyError(
      "I031_CODEX_VERSION_MISMATCH",
      `The exact Codex CLI ${I031_CODEX_CLI_VERSION} is required`,
    );
  }

  try {
    const loginResult = await runCommand(codexBin, ["login", "status"], {
      env: buildYoutubeI031WorkerEnv(env, codexBin),
    });
    if (!/^Logged in using ChatGPT\b/mu.test(
      `${loginResult.stdout}\n${loginResult.stderr ?? ""}`,
    )) {
      throw new Error("unexpected login status");
    }
  } catch {
    throw dependencyError(
      "I031_CODEX_LOGIN_REQUIRED",
      "The exact i031 runtime requires an active Codex ChatGPT login",
    );
  }

  try {
    const workerEnv = buildYoutubeI031WorkerEnv(env, codexBin);
    await runCommand("python3", ["-c", "import cv2, yt_dlp"], { env: workerEnv });
    await runCommand("ffmpeg", ["-version"], { env: workerEnv });
    await runCommand("ffprobe", ["-version"], { env: workerEnv });
  } catch {
    throw dependencyError(
      "I031_DEPENDENCY_MISSING",
      "Python OpenCV, yt-dlp, ffmpeg, and ffprobe are required",
    );
  }

  return {
    codexBin,
    codexCliVersion: I031_CODEX_CLI_VERSION,
  };
}

async function sha256(filePath: string) {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

async function listRuntimeBundleFiles(
  directory: string,
  relativeDirectory = "",
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new YoutubeI031RuntimeError(
        "I031_BUNDLE_INVALID",
        "bundle",
        "The i031 runtime bundle must not contain symbolic links",
      );
    }
    if (entry.isDirectory()) {
      files.push(...await listRuntimeBundleFiles(
        path.join(directory, entry.name),
        relativePath,
      ));
      continue;
    }
    if (!entry.isFile()) {
      throw new YoutubeI031RuntimeError(
        "I031_BUNDLE_INVALID",
        "bundle",
        "The i031 runtime bundle contains an unsupported entry",
      );
    }
    files.push(relativePath);
  }

  return files;
}

async function verifyAndCopyRuntimeBundle(workspace: string) {
  const manifestPath = path.join(RUNTIME_BUNDLE_ROOT, "manifest.json");
  let manifest: RuntimeBundleManifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RuntimeBundleManifest;
  } catch {
    throw new YoutubeI031RuntimeError(
      "I031_BUNDLE_INVALID",
      "bundle",
      "The i031 runtime manifest is unavailable",
    );
  }

  if (manifest.schemaVersion !== 1 || !isRecord(manifest.files)) {
    throw new YoutubeI031RuntimeError(
      "I031_BUNDLE_INVALID",
      "bundle",
      "The i031 runtime manifest is invalid",
    );
  }

  const approvedFiles = [...Object.keys(manifest.files), "manifest.json"].sort();
  const actualFiles = (await listRuntimeBundleFiles(RUNTIME_BUNDLE_ROOT)).sort();
  if (
    actualFiles.length !== approvedFiles.length
    || actualFiles.some((file, index) => file !== approvedFiles[index])
  ) {
    throw new YoutubeI031RuntimeError(
      "I031_BUNDLE_DRIFT",
      "bundle",
      "The i031 runtime bundle contains files outside the approved manifest",
    );
  }

  for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
    if (
      relativePath.startsWith("/")
      || relativePath.split("/").includes("..")
      || !/^[a-f0-9]{64}$/u.test(expectedHash)
    ) {
      throw new YoutubeI031RuntimeError(
        "I031_BUNDLE_INVALID",
        "bundle",
        "The i031 runtime manifest contains an invalid entry",
      );
    }

    let actualHash: string;
    try {
      actualHash = await sha256(path.join(RUNTIME_BUNDLE_ROOT, relativePath));
    } catch {
      throw new YoutubeI031RuntimeError(
        "I031_BUNDLE_INVALID",
        "bundle",
        "The i031 runtime bundle is incomplete",
      );
    }

    if (actualHash !== expectedHash) {
      throw new YoutubeI031RuntimeError(
        "I031_BUNDLE_DRIFT",
        "bundle",
        "The i031 runtime bundle does not match the approved bytes",
      );
    }
  }

  await cp(RUNTIME_BUNDLE_ROOT, workspace, {
    recursive: true,
    force: true,
  });
}

function terminateProcessGroup(childPid: number | undefined) {
  if (!childPid) {
    return;
  }

  try {
    process.kill(-childPid, "SIGTERM");
  } catch {
    try {
      process.kill(childPid, "SIGTERM");
    } catch {
      // The child already exited.
    }
  }
}

async function runRuntimeWorker({
  workspace,
  videoId,
  signal,
  workerEnv,
  codexBin,
}: WorkerRunInput): Promise<unknown> {
  const workerPath = path.join(workspace, "worker.mjs");
  const resultPath = path.join(workspace, "result.json");
  const stagedBinDirectory = path.join(workspace, ".i031-bin");
  const stagedCodexBin = path.join(stagedBinDirectory, "codex");
  await mkdir(stagedBinDirectory, { recursive: true });
  try {
    await link(codexBin, stagedCodexBin);
  } catch {
    await cp(codexBin, stagedCodexBin);
  }
  const stagedWorkerEnv = {
    ...workerEnv,
    PATH: [stagedBinDirectory, workerEnv.PATH].filter(Boolean).join(path.delimiter),
  };

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      workerPath,
      "--video-id",
      videoId,
      "--result",
      resultPath,
    ], {
      cwd: workspace,
      env: stagedWorkerEnv,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let outputBytes = 0;
    let settled = false;

    const finishReject = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_WORKER_OUTPUT_BYTES) {
        terminateProcessGroup(child.pid);
        finishReject(new YoutubeI031RuntimeError(
          "I031_WORKER_OUTPUT_LIMIT",
          "runtime",
          "The i031 worker exceeded its output limit",
        ));
      }
    };
    const onAbort = () => {
      terminateProcessGroup(child.pid);
      const reason = signal.reason;
      finishReject(reason instanceof Error
        ? reason
        : new YoutubeI031RuntimeError("I031_ABORTED", "runtime", "The i031 request was aborted"));
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (error) => {
      finishReject(new YoutubeI031RuntimeError(
        "I031_WORKER_FAILED",
        "runtime",
        `The i031 worker could not start: ${error.name}`,
      ));
    });
    child.on("close", async (code) => {
      if (settled) {
        return;
      }
      signal.removeEventListener("abort", onAbort);
      if (code !== 0) {
        finishReject(new YoutubeI031RuntimeError(
          "I031_WORKER_FAILED",
          "runtime",
          "The i031 worker failed",
        ));
        return;
      }

      try {
        const fileStats = await stat(resultPath);
        if (fileStats.size > MAX_WORKER_OUTPUT_BYTES) {
          throw new YoutubeI031RuntimeError(
            "I031_WORKER_OUTPUT_LIMIT",
            "output",
            "The i031 result exceeded its output limit",
          );
        }
        const rawOutput = JSON.parse(await readFile(resultPath, "utf8")) as unknown;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(rawOutput);
      } catch (error) {
        finishReject(error instanceof YoutubeI031RuntimeError
          ? error
          : new YoutubeI031RuntimeError(
            "I031_INVALID_OUTPUT",
            "output",
            "The i031 worker returned invalid JSON",
          ));
      }
    });

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function normalizeRuntimeError(error: unknown) {
  if (error instanceof YoutubeI031RuntimeError) {
    return error;
  }

  return new YoutubeI031RuntimeError(
    "I031_RUNTIME_FAILED",
    "runtime",
    error instanceof Error
      ? `The i031 runtime failed: ${error.name}`
      : "The i031 runtime failed",
  );
}

function validateVideoId(videoId: string) {
  if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId)) {
    throw new YoutubeI031RuntimeError(
      "I031_INVALID_VIDEO_ID",
      "runtime",
      "The YouTube video id is invalid",
    );
  }
}

export function createYoutubeI031Extractor(
  dependencies: YoutubeI031ExtractorDependencies = {},
): YoutubeI031Extractor {
  const timeoutMs = dependencies.timeoutMs ?? I031_TOTAL_TIMEOUT_MS;
  const preflight = dependencies.verifyPreflight ?? (() => verifyYoutubeI031Preflight());
  const createWorkspace = dependencies.createWorkspace
    ?? (() => mkdtemp(path.join(tmpdir(), "homecook-youtube-i031-")));
  const copyRuntimeBundle = dependencies.copyRuntimeBundle ?? verifyAndCopyRuntimeBundle;
  const runWorker = dependencies.runWorker ?? runRuntimeWorker;
  const cleanupWorkspace = dependencies.cleanupWorkspace
    ?? ((workspace) => rm(workspace, { recursive: true, force: true }));
  let active = false;

  return {
    async extract({ videoId, signal }) {
      validateVideoId(videoId);
      if (active) {
        throw new YoutubeI031RuntimeError(
          "I031_BUSY",
          "queue",
          "Another i031 extraction is already running",
        );
      }
      active = true;

      let workspace: string | null = null;
      let result: YoutubeI031ExtractionResult | null = null;
      let failure: YoutubeI031RuntimeError | null = null;
      const runtimeController = new AbortController();
      const timeoutError = new YoutubeI031RuntimeError(
        "I031_TIMEOUT",
        "runtime",
        "The i031 extraction exceeded the total timeout",
      );
      const abortError = new YoutubeI031RuntimeError(
        "I031_ABORTED",
        "runtime",
        "The i031 request was aborted",
      );
      const onRequestAbort = () => runtimeController.abort(abortError);
      const timeout = setTimeout(() => runtimeController.abort(timeoutError), timeoutMs);
      let rejectForAbort: (() => void) | null = null;

      if (signal?.aborted) {
        runtimeController.abort(abortError);
      } else {
        signal?.addEventListener("abort", onRequestAbort, { once: true });
      }

      try {
        if (runtimeController.signal.aborted) {
          throw runtimeController.signal.reason;
        }
        const preflightResult = await preflight();
        workspace = await createWorkspace();
        await copyRuntimeBundle(workspace);
        const workerPromise = runWorker({
          workspace,
          videoId,
          signal: runtimeController.signal,
          workerEnv: buildYoutubeI031WorkerEnv(process.env, preflightResult.codexBin),
          codexBin: preflightResult.codexBin,
        });
        const abortPromise = new Promise<never>((_, reject) => {
          rejectForAbort = () => reject(runtimeController.signal.reason);
          if (runtimeController.signal.aborted) {
            rejectForAbort();
            return;
          }
          runtimeController.signal.addEventListener("abort", rejectForAbort, { once: true });
        });
        result = parseYoutubeI031WorkerOutput(await Promise.race([
          workerPromise,
          abortPromise,
        ]));
      } catch (error) {
        failure = normalizeRuntimeError(error);
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onRequestAbort);
        if (rejectForAbort) {
          runtimeController.signal.removeEventListener("abort", rejectForAbort);
        }
        if (workspace) {
          try {
            await cleanupWorkspace(workspace);
          } catch {
            failure ??= new YoutubeI031RuntimeError(
              "I031_CLEANUP_FAILED",
              "cleanup",
              "The i031 temporary workspace could not be removed",
            );
          }
        }
        active = false;
      }

      if (failure) {
        throw failure;
      }
      if (!result) {
        throw new YoutubeI031RuntimeError(
          "I031_RUNTIME_FAILED",
          "runtime",
          "The i031 runtime produced no result",
        );
      }
      return result;
    },
  };
}

export function getYoutubeI031Extractor() {
  defaultExtractor ??= createYoutubeI031Extractor();
  return defaultExtractor;
}
