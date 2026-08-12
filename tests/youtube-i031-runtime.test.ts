import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  I031_EXACT_IDENTITY,
  I031_CODEX_CLI_VERSION,
  YoutubeI031RuntimeError,
  buildYoutubeI031WorkerEnv,
  createYoutubeI031Extractor,
  parseYoutubeI031WorkerOutput,
  resolveYoutubeRecipeExtractorMode,
  verifyYoutubeI031Preflight,
  type YoutubeI031WorkerOutput,
} from "@/lib/server/youtube-i031-runtime";

const exactWorkerOutput: YoutubeI031WorkerOutput = {
  schemaVersion: 1,
  identity: {
    ...I031_EXACT_IDENTITY,
    codexCliVersion: I031_CODEX_CLI_VERSION,
  },
  recipe: {
    title: "테스트 김치찌개",
    ingredients: [
      {
        name: "김치",
        amount: "200",
        unit: "g",
        optional: false,
        groupLabel: "찌개",
      },
      {
        name: "소금",
        amount: null,
        unit: null,
        optional: true,
        groupLabel: null,
      },
    ],
    steps: [
      "김치를 한입 크기로 썬다.",
      "냄비에 김치를 넣고 끓인다.",
    ],
  },
  meta: {
    modelCallCount: 2,
    frameCount: 36,
    selectedFrameCount: 8,
    selectorBypassed: false,
    screenOcrStatus: "skipped",
    sourceAvailability: {
      description: true,
      authorComment: true,
      transcript: true,
      onscreen: false,
    },
    timings: {
      frameExtractMs: 12_000,
      selectorMs: 8_000,
      finalMs: 20_000,
      totalFreshMs: 40_000,
      ocrTotalMs: null,
    },
  },
};

describe("YouTube i031 exact runtime", () => {
  it("defaults to legacy and accepts only the two documented modes", () => {
    expect(resolveYoutubeRecipeExtractorMode({})).toBe("legacy");
    expect(resolveYoutubeRecipeExtractorMode({
      YOUTUBE_RECIPE_EXTRACTOR_MODE: "legacy",
    })).toBe("legacy");
    expect(resolveYoutubeRecipeExtractorMode({
      YOUTUBE_RECIPE_EXTRACTOR_MODE: "i031_codex_vision",
    })).toBe("i031_codex_vision");

    expect(() => resolveYoutubeRecipeExtractorMode({
      YOUTUBE_RECIPE_EXTRACTOR_MODE: "gemini",
    })).toThrowError(YoutubeI031RuntimeError);
  });

  it("passes only required runtime variables and never forwards Gemini secrets", () => {
    const env = buildYoutubeI031WorkerEnv({
      HOME: "/Users/tester",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp",
      YOUTUBE_API_KEY: "youtube-secret",
      APIFY_TOKEN: "apify-secret",
      YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID: "actor-id",
      YOUTUBE_TRANSCRIPT_PAID_TIMEOUT_MS: "60000",
      GEMINI_API_KEY: "must-not-leak",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
      NEXT_PUBLIC_ANYTHING: "must-not-leak",
    }, "/repo/.youtube-i031-tools/node_modules/.bin/codex");

    expect(env).toEqual({
      HOME: "/Users/tester",
      PATH: [
        "/repo/.youtube-i031-tools/node_modules/.bin",
        path.dirname(process.execPath),
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
        "/opt/homebrew/bin",
        "/usr/local/bin",
      ].join(":"),
      TMPDIR: "/tmp",
      YOUTUBE_API_KEY: "youtube-secret",
      APIFY_TOKEN: "apify-secret",
      YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID: "actor-id",
      YOUTUBE_TRANSCRIPT_PAID_TIMEOUT_MS: "60000",
      HOMECOOK_I031_CODEX_CLI_VERSION: "0.144.0-alpha.4",
      NODE_ENV: "production",
    });
    expect(env).not.toHaveProperty("GEMINI_API_KEY");
    expect(env).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("accepts only the exact identity and returns a safe metadata allowlist", () => {
    const parsed = parseYoutubeI031WorkerOutput({
      ...exactWorkerOutput,
      meta: {
        ...exactWorkerOutput.meta,
        rawPrompt: "must not survive",
        frameCacheDir: "/private/tmp/raw-frames",
        providerPayload: { secret: true },
      },
    });

    expect(parsed.recipe.title).toBe("테스트 김치찌개");
    expect(parsed.meta).toEqual(exactWorkerOutput.meta);
    expect(parsed.meta).not.toHaveProperty("rawPrompt");
    expect(parsed.meta).not.toHaveProperty("frameCacheDir");

    expect(() => parseYoutubeI031WorkerOutput({
      ...exactWorkerOutput,
      identity: {
        ...exactWorkerOutput.identity,
        finalPromptVersion: "drifted-prompt",
      },
    })).toThrowError(/I031_IDENTITY_MISMATCH/u);
  });

  it("fails preflight when the YouTube key or exact Codex CLI is unavailable", async () => {
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args[0] === "--version"
        ? "codex-cli 0.144.0-alpha.4\n"
        : args[0] === "login"
          ? "Logged in using ChatGPT\n"
          : "",
    }));

    await expect(verifyYoutubeI031Preflight({
      env: { HOME: "/Users/tester", PATH: "/usr/bin:/bin" },
      codexBin: "/repo/codex",
      accessPath: vi.fn(async () => undefined),
      runCommand,
      platform: "darwin",
    })).rejects.toMatchObject({
      code: "I031_MISSING_YOUTUBE_KEY",
      stage: "preflight",
    });
    expect(runCommand).not.toHaveBeenCalled();

    await expect(verifyYoutubeI031Preflight({
      env: {
        HOME: "/Users/tester",
        PATH: "/usr/bin:/bin",
        YOUTUBE_API_KEY: "youtube-secret",
      },
      codexBin: "/repo/codex",
      accessPath: vi.fn(async () => undefined),
      platform: "darwin",
      runCommand: vi.fn(async (command) => ({
        stdout: command === "/repo/codex" ? "codex-cli 0.142.5\n" : "",
      })),
    })).rejects.toMatchObject({
      code: "I031_CODEX_VERSION_MISMATCH",
      stage: "preflight",
    });

    await expect(verifyYoutubeI031Preflight({
      env: {
        HOME: "/Users/tester",
        PATH: "/usr/bin:/bin",
        YOUTUBE_API_KEY: "youtube-secret",
      },
      codexBin: "/repo/codex",
      accessPath: vi.fn(async () => undefined),
      platform: "darwin",
      runCommand: vi.fn(async (_command, args) => ({
        stdout: args[0] === "--version"
          ? "codex-cli 0.144.0-alpha.4\n"
          : "Not logged in\n",
      })),
    })).rejects.toMatchObject({
      code: "I031_CODEX_LOGIN_REQUIRED",
      stage: "preflight",
    });
  });

  it("cleans the workspace after success and exposes no worker-only fields", async () => {
    const cleanupWorkspace = vi.fn(async () => undefined);
    const runWorker = vi.fn(async () => ({
      ...exactWorkerOutput,
      debug: { prompt: "raw prompt" },
    }));
    const extractor = createYoutubeI031Extractor({
      verifyPreflight: vi.fn(async () => ({
        codexBin: "/repo/codex",
        codexCliVersion: I031_CODEX_CLI_VERSION,
      })),
      createWorkspace: vi.fn(async () => "/tmp/i031-success"),
      copyRuntimeBundle: vi.fn(async () => undefined),
      cleanupWorkspace,
      runWorker,
    });

    const result = await extractor.extract({
      videoId: "abcdefghijk",
      signal: new AbortController().signal,
    });

    expect(result.recipe.title).toBe("테스트 김치찌개");
    expect(result).not.toHaveProperty("debug");
    expect(cleanupWorkspace).toHaveBeenCalledWith("/tmp/i031-success");
  });

  it("normalizes worker failures and still cleans the workspace", async () => {
    const cleanupWorkspace = vi.fn(async () => undefined);
    const extractor = createYoutubeI031Extractor({
      verifyPreflight: vi.fn(async () => ({
        codexBin: "/repo/codex",
        codexCliVersion: I031_CODEX_CLI_VERSION,
      })),
      createWorkspace: vi.fn(async () => "/tmp/i031-worker-failure"),
      copyRuntimeBundle: vi.fn(async () => undefined),
      cleanupWorkspace,
      runWorker: vi.fn(async () => {
        throw new Error("worker exited with code 1");
      }),
    });

    await expect(extractor.extract({ videoId: "abcdefghijk" })).rejects.toMatchObject({
      code: "I031_RUNTIME_FAILED",
      stage: "runtime",
    });
    expect(cleanupWorkspace).toHaveBeenCalledWith("/tmp/i031-worker-failure");
  });

  it("rejects malformed worker output and still cleans the workspace", async () => {
    const cleanupWorkspace = vi.fn(async () => undefined);
    const extractor = createYoutubeI031Extractor({
      verifyPreflight: vi.fn(async () => ({
        codexBin: "/repo/codex",
        codexCliVersion: I031_CODEX_CLI_VERSION,
      })),
      createWorkspace: vi.fn(async () => "/tmp/i031-invalid-output"),
      copyRuntimeBundle: vi.fn(async () => undefined),
      cleanupWorkspace,
      runWorker: vi.fn(async () => ({
        schemaVersion: 1,
        identity: exactWorkerOutput.identity,
        recipe: { title: "", ingredients: [], steps: [] },
        meta: exactWorkerOutput.meta,
      })),
    });

    await expect(extractor.extract({ videoId: "abcdefghijk" })).rejects.toMatchObject({
      code: "I031_INVALID_OUTPUT",
      stage: "output",
    });
    expect(cleanupWorkspace).toHaveBeenCalledWith("/tmp/i031-invalid-output");
  });

  it("verifies and copies only the approved runtime bundle", async () => {
    const extractor = createYoutubeI031Extractor({
      verifyPreflight: vi.fn(async () => ({
        codexBin: "/repo/codex",
        codexCliVersion: I031_CODEX_CLI_VERSION,
      })),
      runWorker: vi.fn(async ({ workspace }) => {
        const worker = await readFile(path.join(workspace, "worker.mjs"), "utf8");
        const manifest = JSON.parse(
          await readFile(path.join(workspace, "manifest.json"), "utf8"),
        ) as { files: Record<string, string> };
        const evalLiterals = JSON.parse(
          await readFile(
            path.join(process.cwd(), "tests/fixtures/youtube-i031-eval-literals.json"),
            "utf8",
          ),
        ) as { videoIds: string[]; recipeTitles: string[] };

        expect(worker).toContain("single-recipe-four-source-v2");
        expect(worker).toMatch(/singleRecipeOnly:\s*true/u);
        expect(worker).toMatch(/sourceMode:\s*"source-text"/u);
        expect(worker).toMatch(/recipeMode:\s*"single"/u);
        expect(worker).toMatch(/publicSourceBundle:\s*null/u);
        expect(Object.keys(manifest.files)).toHaveLength(12);
        const copiedFiles = (await readdir(workspace, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) => path.relative(workspace, path.join(entry.parentPath, entry.name)))
          .sort();
        expect(copiedFiles).toEqual([
          ...Object.keys(manifest.files),
          "manifest.json",
        ].sort());
        expect(Object.keys(manifest.files).some((file) =>
          /(?:golden|grader|holdout|manifest\.single-recipe)/u.test(file),
        )).toBe(false);
        const productionSource = (
          await Promise.all(
            copiedFiles
              .filter((file) => file.endsWith(".mjs"))
              .map((file) => readFile(path.join(workspace, file), "utf8")),
          )
        ).join("\n");
        for (const literal of [...evalLiterals.videoIds, ...evalLiterals.recipeTitles]) {
          expect(productionSource).not.toContain(literal);
        }
        return exactWorkerOutput;
      }),
    });

    await expect(extractor.extract({ videoId: "abcdefghijk" })).resolves.toMatchObject({
      recipe: { title: "테스트 김치찌개" },
    });
  });

  it("keeps provider metadata and paid fallback behind the worker RPC fence", async () => {
    const bundleRoot = path.join(
      process.cwd(),
      "lib/server/youtube-i031-runtime/bundle",
    );
    const [workerSource, snapshotSource] = await Promise.all([
      readFile(path.join(bundleRoot, "worker.mjs"), "utf8"),
      readFile(path.join(bundleRoot, "scripts/recipe-loop/snapshot-video.mjs"), "utf8"),
    ]);

    const snapshotStart = snapshotSource.indexOf("export async function snapshotVideo(");
    const runtimeSource = snapshotSource.slice(snapshotStart);
    expect(runtimeSource.indexOf("await onVideoMetadata(video)"))
      .toBeLessThan(runtimeSource.indexOf("fetchAuthorComments(apiKey"));
    const fallbackStart = runtimeSource.indexOf(
      "if (!captions.available && useApifyFallback",
    );
    const fallbackEnd = runtimeSource.indexOf("const source = {", fallbackStart);
    const fallbackSource = runtimeSource.slice(fallbackStart, fallbackEnd);
    expect(fallbackSource.indexOf("reserveQuota(\"external_transcript_api\", 1)"))
      .toBeLessThan(fallbackSource.indexOf("fetchApifyCaptions(env, videoId)"));
    expect(workerSource).toContain("workerRpcClient.resolveMethods(methodLabels(");
    expect(workerSource).toContain('event_type: "success"');
    expect(workerSource).not.toMatch(/updateTitle\([^)]*recipe\.title/u);
  });

  it("enforces one concurrent run and releases the slot after cleanup", async () => {
    let finishFirst!: (value: YoutubeI031WorkerOutput) => void;
    const firstWorker = new Promise<YoutubeI031WorkerOutput>((resolve) => {
      finishFirst = resolve;
    });
    const cleanupWorkspace = vi.fn(async () => undefined);
    const runWorker = vi.fn()
      .mockImplementationOnce(async () => firstWorker)
      .mockImplementationOnce(async () => exactWorkerOutput);
    const extractor = createYoutubeI031Extractor({
      verifyPreflight: vi.fn(async () => ({
        codexBin: "/repo/codex",
        codexCliVersion: I031_CODEX_CLI_VERSION,
      })),
      createWorkspace: vi.fn()
        .mockResolvedValueOnce("/tmp/i031-first")
        .mockResolvedValueOnce("/tmp/i031-second"),
      copyRuntimeBundle: vi.fn(async () => undefined),
      cleanupWorkspace,
      runWorker,
    });

    const first = extractor.extract({ videoId: "abcdefghijk" });
    await vi.waitFor(() => expect(runWorker).toHaveBeenCalledTimes(1));

    await expect(extractor.extract({ videoId: "lmnopqrstuv" })).rejects.toMatchObject({
      code: "I031_BUSY",
      stage: "queue",
    });

    finishFirst(exactWorkerOutput);
    await expect(first).resolves.toMatchObject({ recipe: { title: "테스트 김치찌개" } });
    await expect(extractor.extract({ videoId: "lmnopqrstuv" })).resolves.toMatchObject({
      recipe: { title: "테스트 김치찌개" },
    });
    expect(cleanupWorkspace).toHaveBeenCalledTimes(2);
  });

  it("aborts a hanging worker at the total deadline and still cleans up", async () => {
    vi.useFakeTimers();
    const cleanupWorkspace = vi.fn(async () => undefined);
    const extractor = createYoutubeI031Extractor({
      timeoutMs: 100,
      verifyPreflight: vi.fn(async () => ({
        codexBin: "/repo/codex",
        codexCliVersion: I031_CODEX_CLI_VERSION,
      })),
      createWorkspace: vi.fn(async () => "/tmp/i031-timeout"),
      copyRuntimeBundle: vi.fn(async () => undefined),
      cleanupWorkspace,
      runWorker: vi.fn(async ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      })),
    });

    const result = extractor.extract({ videoId: "abcdefghijk" });
    const assertion = expect(result).rejects.toMatchObject({
      code: "I031_TIMEOUT",
      stage: "runtime",
    });
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    expect(cleanupWorkspace).toHaveBeenCalledWith("/tmp/i031-timeout");
    vi.useRealTimers();
  });

  it("propagates request abort and still cleans up", async () => {
    const controller = new AbortController();
    const cleanupWorkspace = vi.fn(async () => undefined);
    const extractor = createYoutubeI031Extractor({
      verifyPreflight: vi.fn(async () => ({
        codexBin: "/repo/codex",
        codexCliVersion: I031_CODEX_CLI_VERSION,
      })),
      createWorkspace: vi.fn(async () => "/tmp/i031-abort"),
      copyRuntimeBundle: vi.fn(async () => undefined),
      cleanupWorkspace,
      runWorker: vi.fn(async ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      })),
    });

    const result = extractor.extract({
      videoId: "abcdefghijk",
      signal: controller.signal,
    });
    controller.abort();

    await expect(result).rejects.toMatchObject({
      code: "I031_ABORTED",
      stage: "runtime",
    });
    expect(cleanupWorkspace).toHaveBeenCalledWith("/tmp/i031-abort");
  });
});
