import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const bundleRoot = path.join(root, "lib/server/youtube-i031-runtime/bundle");

function read(relativePath: string) {
  return readFileSync(path.join(bundleRoot, relativePath), "utf8");
}

describe("YouTube truthful worker progress bundle contract", () => {
  it("pins the non-blocking progress IPC and bounded parent flush", () => {
    const parent = readFileSync(
      path.join(root, "scripts/lib/youtube-extraction-worker-runtime.mjs"),
      "utf8",
    );
    const child = read("worker.mjs");

    expect(parent).toContain("homecook-worker-progress");
    expect(parent).toContain("DEFAULT_PROGRESS_FLUSH_TIMEOUT_MS = 2_000");
    expect(parent).toContain("report_youtube_extraction_progress");
    expect(parent).toContain("flushProgress");
    expect(child).toContain("homecook-worker-progress");
    expect(child).not.toMatch(/await\s+workerRpcClient\.reportProgress/iu);
  });

  it("reports video download before preparation and frame extraction only after source readiness", () => {
    const python = read("scripts/recipe-loop/extract-video-frames.py");
    const managed = python.slice(
      python.indexOf("def run_managed"),
      python.indexOf("def load_cv2"),
    );
    const downloadIndex = managed.indexOf('emit_progress("video_download"');
    const prepareIndex = managed.indexOf("source_result = prepare_managed_source");
    const frameIndex = managed.indexOf('emit_progress("frame_extraction"');
    const extractionIndex = managed.indexOf("extract_for_args");

    expect(downloadIndex).toBeGreaterThanOrEqual(0);
    expect(downloadIndex).toBeLessThan(prepareIndex);
    expect(frameIndex).toBeGreaterThan(prepareIndex);
    expect(frameIndex).toBeLessThan(extractionIndex);
    expect(python).toContain("videoDurationSeconds");
  });

  it("forwards Python progress and starts model analysis only after frames return", () => {
    const client = read("scripts/recipe-loop/lib/codex-vision-client.mjs");
    const keyframes = read("scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs");
    const worker = read("worker.mjs");

    expect(client).toContain("onOutputLine");
    expect(client).toContain("HOMECOOK_PROGRESS");
    expect(keyframes).toContain("options.onProgress?.(");
    expect(keyframes).toContain('"model_analysis"');
    expect(worker).toContain('reportProgress("source_fetch"');
    expect(worker).toContain("onProgress(stage, videoDurationSeconds)");
  });

  it("parses ordered frame extractor progress without exposing command output", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "yta-frame-progress-"));
    try {
      const moduleUrl = pathToFileURL(path.join(
        bundleRoot,
        "scripts/recipe-loop/lib/codex-vision-client.mjs",
      )).href;
      const { defaultExtractFrames } = await import(moduleUrl);
      const progress: Array<[string, number | null]> = [];
      await defaultExtractFrames({
        videoUrl: "https://www.youtube.com/watch?v=abc123DEF45",
        videoId: "abc123DEF45",
        cacheDir,
        frameOptions: {
          mode: "hybrid",
          maxFrames: 8,
          storyboardMaxFrames: 8,
          sceneDetail: "dense",
          sceneSelection: "balanced",
          interval: 4,
          hybridAnchorBudget: 36,
          screenOcrScan: false,
        },
        timeoutMs: 1_000,
        onProgress(stage: string, duration: number | null) {
          progress.push([stage, duration]);
        },
        async runCommandImpl(_command: string, args: string[], options: {
          onOutputLine?: (line: string) => void;
        }) {
          const resultPath = args[args.indexOf("--result-json") + 1];
          const frameDir = path.join(cacheDir, "fixture-frames");
          mkdirSync(path.join(frameDir, "frames"), { recursive: true });
          writeFileSync(path.join(frameDir, "frames", "frame.jpg"), "frame");
          writeFileSync(path.join(frameDir, "frames.json"), JSON.stringify([{
            index: 1,
            timestamp_sec: 0,
            path: path.join(frameDir, "frames", "frame.jpg"),
            reason: "scene:first",
          }]));
          writeFileSync(path.join(frameDir, "extraction_stats.json"), JSON.stringify({
            duration_sec: 90,
          }));
          options.onOutputLine?.('__HOMECOOK_PROGRESS__{"stage":"video_download","videoDurationSeconds":null}');
          options.onOutputLine?.('__HOMECOOK_PROGRESS__{"stage":"frame_extraction","videoDurationSeconds":90}');
          writeFileSync(resultPath, JSON.stringify({
            frameDir,
            sourceFingerprint: "a".repeat(64),
            sourceVideoCacheHit: false,
            frameCacheHit: false,
          }));
          return "provider output that must not cross the progress boundary";
        },
      });

      expect(progress).toEqual([
        ["video_download", null],
        ["frame_extraction", 90],
      ]);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("keeps the immutable bundle manifest hashes current", () => {
    const manifest = JSON.parse(read("manifest.json")) as {
      files: Record<string, string>;
    };
    for (const relativePath of [
      "worker.mjs",
      "scripts/recipe-loop/extract-video-frames.py",
      "scripts/recipe-loop/lib/codex-vision-client.mjs",
      "scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs",
    ]) {
      const digest = createHash("sha256").update(read(relativePath)).digest("hex");
      expect(manifest.files[relativePath]).toBe(digest);
    }
  });
});
