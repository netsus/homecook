import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const promptModuleUrl = pathToFileURL(path.join(repoRoot, "lib/server/recipe-extraction-lab/prompt.mjs")).href;
const extractionModuleUrl = pathToFileURL(path.join(repoRoot, "lib/server/recipe-extraction-lab/extract.mjs")).href;
const runnerModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/recipe-loop/run-extraction.mjs")).href;
const keyframesModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs")).href;

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function makeInput() {
  return {
    video: {
      videoId: "single-case",
      title: "김치찌개와 이벤트 안내",
      description: "재료: 김치 300g\n냄비에 김치를 넣는다.",
      tags: ["김치찌개"],
    },
    authorComments: ["고정 댓글: 물 500ml를 넣으세요."],
    transcript: {
      language: "ko",
      segments: [{ lineIndex: 0, startMs: 1000, text: "김치를 넣고 끓입니다." }],
    },
    youtubeUrl: "https://www.youtube.com/watch?v=single-case",
  };
}

describe("single-recipe four-source extraction", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(path.join(tmpdir(), "single-recipe-four-source-"));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("removes candidate hints and multi-recipe instructions in single mode", async () => {
    const { buildExtractionPrompt, buildSourceText } = await import(promptModuleUrl);
    const input = makeInput();
    const sourceText = buildSourceText(input, { recipeMode: "single" });
    const prompt = buildExtractionPrompt({
      video: input.video,
      sourceText,
      useVisual: true,
      evidencePackets: [{ id: "must-not-appear" }],
      recipeMode: "single",
    });

    expect(sourceText).toContain("[SOURCE: description]");
    expect(sourceText).toContain("[SOURCE: author_comment]");
    expect(sourceText).toContain("[SOURCE: transcript(ko)]");
    expect(sourceText).not.toContain("recipe_candidate_hints");
    expect(prompt).toContain("recipes[]에는 정확히 하나의 레시피만");
    expect(prompt).toContain("실제 공정·상태 전환 1개당 한 단계");
    expect(prompt).toContain("손질/양념 만들기/기구 세팅/가열");
    expect(prompt).toContain("서로 다른 목적·대상·열 상태는 분리");
    expect(prompt).not.toContain("Evidence packets:");
    expect(prompt).not.toContain("다중 레시피");
    expect(prompt).not.toContain("candidate별");
  });

  it("rejects zero or multiple recipes at the lab single-mode boundary", async () => {
    const { extractRecipeFromSources } = await import(extractionModuleUrl);
    const input = makeInput();

    await expect(extractRecipeFromSources(input, {
      llm: {
        generate: async () => ({ json: { recipes: [] }, cached: false, model: "fake" }),
      },
      recipeMode: "single",
      useVisual: false,
      useEvidencePackets: false,
    })).rejects.toThrow("SINGLE_RECIPE_CONTRACT");

    await expect(extractRecipeFromSources(input, {
      llm: {
        generate: async () => ({
          json: {
            recipes: [
              { title: "김치찌개", ingredients: [{ name: "김치" }], steps: ["김치를 끓인다."] },
              { title: "된장찌개", ingredients: [{ name: "된장" }], steps: ["된장을 끓인다."] },
            ],
          },
          cached: false,
          model: "fake",
        }),
      },
      recipeMode: "single",
      useVisual: false,
      useEvidencePackets: false,
    })).rejects.toThrow("SINGLE_RECIPE_CONTRACT");
  });

  it("does not apply stew-specific ingredient recovery in single mode", async () => {
    const { extractRecipeFromSources } = await import(extractionModuleUrl);
    const result = await extractRecipeFromSources({
      video: {
        videoId: "neutral-soup",
        title: "채소국",
        description: "채소를 끓이고 소금이나 새우젓으로 간을 맞춘다.",
      },
      authorComments: [],
      transcript: null,
      youtubeUrl: null,
    }, {
      llm: {
        generate: async () => ({
          cached: false,
          model: "fake",
          json: {
            recipes: [{
              title: "채소국",
              ingredients: [{ name: "채소" }],
              steps: ["채소를 냄비에 넣고 끓인다."],
            }],
          },
        }),
      },
      recipeMode: "single",
      useVisual: false,
      useEvidencePackets: false,
    });

    expect(result.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["채소"]);
    expect(result.recipes[0].steps).toEqual(["채소를 냄비에 넣고 끓인다."]);
    expect(result.meta.sourceMentionedStewSeasoningRecoveries).toBe(0);
  });

  it("does not synthesize ingredient-list-specific steps in single mode", async () => {
    const { extractRecipeFromSources } = await import(extractionModuleUrl);
    const result = await extractRecipeFromSources({
      video: {
        videoId: "neutral-dressing",
        title: "채소 버무림",
        description: "재료: 된장, 간장, 마늘, 부추\n채소를 가볍게 버무린다.",
      },
      authorComments: [],
      transcript: null,
      youtubeUrl: null,
    }, {
      llm: {
        generate: async () => ({
          cached: false,
          model: "fake",
          json: {
            recipes: [{
              title: "채소 버무림",
              ingredients: [
                { name: "된장" },
                { name: "간장" },
                { name: "마늘" },
                { name: "부추" },
              ],
              steps: ["채소를 가볍게 버무린다."],
            }],
          },
        }),
      },
      recipeMode: "single",
      useVisual: false,
      useEvidencePackets: false,
    });

    expect(result.recipes[0].steps).toEqual(["채소를 가볍게 버무린다."]);
    expect(result.meta.packetIngredientStepRecoveries).toBe(0);
  });

  it("does not treat two different muk dishes as the same title", async () => {
    const { recipeTitlesLikelySame } = await import(extractionModuleUrl);

    expect(recipeTitlesLikelySame("도토리 묵사발", "열무묵국")).toBe(false);
  });

  it("wires single and hybrid options from the runner factory", async () => {
    const { createLlmForProvider } = await import(runnerModuleUrl);
    let received: Record<string, unknown> | null = null;
    const fakeClient = { generate: async () => ({ json: { recipes: [] } }) };

    const result = createLlmForProvider("codex-vision-keyframes", {
      "single-recipe-only": true,
      "frame-mode": "hybrid",
      interval: "4",
      "hybrid-anchor-budget": "48",
      "selector-candidate-limit": "48",
      "keyframe-total-limit": "8",
      "run-type": "cold",
    }, {
      createCodexVisionKeyframes: (options: Record<string, unknown>) => {
        received = options;
        return fakeClient;
      },
    });

    expect(result).toBe(fakeClient);
    expect(received).toMatchObject({
      singleRecipeOnly: true,
      frameMode: "hybrid",
      interval: 4,
      hybridAnchorBudget: 48,
      selectorCandidateLimit: 48,
      keyframeTotalLimit: 8,
      runType: "cold",
    });
  });

  it("invalidates the source cache when the resolved download selector policy changes", () => {
    const extractorPath = path.join(repoRoot, "scripts/recipe-loop/extract-video-frames.py");
    const python = String.raw`
import argparse, importlib.util, json, sys
spec = importlib.util.spec_from_file_location("recipe_frames", ${JSON.stringify(extractorPath)})
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
args = argparse.Namespace(source="https://www.youtube.com/watch?v=policy", video_id="policy", video_format="mp4")
original = module.shutil.which
module.shutil.which = lambda name: "/usr/bin/ffmpeg" if name == "ffmpeg" else original(name)
with_ffmpeg = module.source_identity(args)
module.shutil.which = lambda name: None if name == "ffmpeg" else original(name)
without_ffmpeg = module.source_identity(args)
print(json.dumps({
  "with": with_ffmpeg,
  "without": without_ffmpeg,
  "with_key": module.source_identity_key(with_ffmpeg),
  "without_key": module.source_identity_key(without_ffmpeg),
}))
`;
    const result = spawnSync("python3", ["-c", python], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.with.resolvedFormatSelector).not.toBe(payload.without.resolvedFormatSelector);
    expect(payload.with_key).not.toBe(payload.without_key);
  });

  it("adds late interval anchors to hybrid frame candidates", () => {
    const extractorPath = path.join(repoRoot, "scripts/recipe-loop/extract-video-frames.py");
    const python = String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("recipe_frames", ${JSON.stringify(extractorPath)})
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
scenes = [
  module.SceneCandidate(0.0, "00:00.000", "scene:first", None),
  module.SceneCandidate(5.0, "00:05.000", "scene", 0.8),
]
selected, stats = module.select_hybrid_candidates(
  scenes,
  duration=100.0,
  anchor_budget=6,
  max_frames=8,
  dedupe_tolerance=0.25,
)
print(json.dumps({"times": [item.timestamp_sec for item in selected], "stats": stats}))
`;
    const result = spawnSync("python3", ["-c", python], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.times[0]).toBe(0);
    expect(payload.times.at(-1)).toBeGreaterThanOrEqual(95);
    expect(payload.stats.interval_anchor_count).toBeGreaterThan(0);
    expect(payload.stats.timeline_coverage_ratio).toBeGreaterThanOrEqual(0.95);
  });

  it("records scene scan and frame write timings separately for hybrid extraction", () => {
    const extractorPath = path.join(repoRoot, "scripts/recipe-loop/extract-video-frames.py");
    const python = String.raw`
import importlib.util, json, sys
from types import SimpleNamespace
spec = importlib.util.spec_from_file_location("recipe_frames", ${JSON.stringify(extractorPath)})
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
clock = iter([1000.0, 1300.0, 2000.0, 2400.0])
module.monotonic_ms = lambda: next(clock)
module.collect_scene_candidates = lambda *args, **kwargs: (
  [module.SceneCandidate(0.0, "00:00.000", "scene:first", None)],
  {"duration_sec": 100.0},
)
module.select_hybrid_candidates = lambda *args, **kwargs: (
  [module.SceneCandidate(0.0, "00:00.000", "scene:first", None)],
  {"interval_anchor_count": 1},
)
module.save_scene_frames = lambda *args, **kwargs: [
  module.FrameInfo(1, 0.0, "00:00.000", "frame.jpg", "scene:first", None)
]
args = SimpleNamespace(
  scene_threshold=0.25,
  min_scene_gap=0.75,
  scene_scan_interval=0.5,
  hybrid_anchor_budget=36,
  max_frames=80,
)
frames, stats = module.extract_hybrid_frames(object(), "video.mp4", "out", args)
print(json.dumps({"frame_count": len(frames), "stats": stats}))
`;
    const result = spawnSync("python3", ["-c", python], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.frame_count).toBe(1);
    expect(payload.stats.scene_scan_ms).toBe(300);
    expect(payload.stats.frame_write_ms).toBe(400);
  });

  it("pairs ffmpeg scan samples with their actual presentation timestamps", () => {
    const extractorPath = path.join(repoRoot, "scripts/recipe-loop/extract-video-frames.py");
    const python = String.raw`
import importlib.util, json, sys
from pathlib import Path
from types import SimpleNamespace
spec = importlib.util.spec_from_file_location("recipe_frames", ${JSON.stringify(extractorPath)})
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
frame_size = 160 * 90
raw = bytes([0]) * frame_size + bytes([255]) * frame_size
showinfo = b"[Parsed_showinfo_3] n:0 pts:0 pts_time:0.000\n[Parsed_showinfo_3] n:1 pts:5 pts_time:1.250\n"
def fake_run(command, **kwargs):
  if "ffprobe" in command[0]:
    return SimpleNamespace(returncode=0, stdout=b'{"format":{"duration":"2.750"}}', stderr=b"")
  return SimpleNamespace(returncode=0, stdout=raw, stderr=showinfo)
module.subprocess.run = fake_run
module.shutil.which = lambda name: f"/usr/bin/{name}"
class FakeBuffer:
  def __init__(self, data):
    self.data = data
  def reshape(self, shape):
    return [object() for _ in range(shape[0])]
class FakeNumpy:
  uint8 = object()
  @staticmethod
  def frombuffer(data, dtype=None):
    return FakeBuffer(data)
sys.modules["numpy"] = FakeNumpy
class FakeCv2:
  @staticmethod
  def absdiff(left, right):
    return SimpleNamespace(mean=lambda: 255.0)
candidates, stats = module.collect_scene_candidates_ffmpeg(
  FakeCv2(), Path("video.mp4"), 0.25, 0.5, 0.5
)
print(json.dumps({"times": [item.timestamp_sec for item in candidates], "stats": stats}))
`;
    const result = spawnSync("python3", ["-c", python], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.times).toEqual([0, 1.25]);
    expect(payload.stats).toMatchObject({
      duration_sec: 2.75,
      scene_scanner: "ffmpeg-pts",
      scene_scan_sample_count: 2,
    });
  });

  it("records requested and actual timestamps while making actual PTS canonical", () => {
    const extractorPath = path.join(repoRoot, "scripts/recipe-loop/extract-video-frames.py");
    const python = String.raw`
import importlib.util, json, sys, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("recipe_frames", ${JSON.stringify(extractorPath)})
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
class FakeCv2:
  IMWRITE_JPEG_QUALITY = 1
  INTER_CUBIC = 2
  @staticmethod
  def imwrite(path, frame, options):
    Path(path).write_bytes(b"jpg")
    return True
  @staticmethod
  def resize(frame, size, interpolation=None):
    return frame
class FakeFrame:
  shape = (90, 160, 3)
frames_dir = Path(tempfile.mkdtemp(prefix="recipe-frame-pts-"))
info = module.save_frame(
  FakeCv2(), FakeFrame(), frames_dir, 1, 1.0,
  "scene", 0.5, actual_timestamp_sec=1.25, timestamp_source="ffmpeg_showinfo_pts"
)
print(json.dumps(module.asdict(info)))
`;
    const result = spawnSync("python3", ["-c", python], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      timestamp_sec: 1.25,
      requested_timestamp_sec: 1,
      actual_timestamp_sec: 1.25,
      timestamp_source: "ffmpeg_showinfo_pts",
    });
  });

  it("records source preparation timing in the extractor output", () => {
    const extractorPath = path.join(repoRoot, "scripts/recipe-loop/extract-video-frames.py");
    const python = String.raw`
import importlib.util, json, sys, tempfile
from pathlib import Path
from types import SimpleNamespace
spec = importlib.util.spec_from_file_location("recipe_frames", ${JSON.stringify(extractorPath)})
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
out_dir = Path(tempfile.mkdtemp(prefix="recipe-frame-timing-"))
module.parse_args = lambda: SimpleNamespace(
  source="https://www.youtube.com/watch?v=abc123",
  video_id="abc123",
  out_dir=out_dir,
  mode="hybrid",
  interval=4.0,
  hybrid_anchor_budget=36,
  scene_detail="dense",
  scene_threshold=0.25,
  min_scene_gap=0.75,
  scene_scan_interval=0.5,
  scene_selection="balanced",
  max_frames=80,
  storyboard_max_frames=0,
  video_format="mp4",
)
module.load_cv2 = lambda: object()
clock = iter([1000.0, 1123.0])
module.monotonic_ms = lambda: next(clock)
module.download_video = lambda *args, **kwargs: Path("video.mp4")
module.extract_hybrid_frames = lambda *args, **kwargs: (
  [module.FrameInfo(1, 0.0, "00:00.000", "frame.jpg", "scene:first", None)],
  {"duration_sec": 10.0, "scene_scan_ms": 20.0, "frame_write_ms": 30.0},
)
module.main()
print(json.dumps(json.loads((out_dir / "extraction_stats.json").read_text(encoding="utf-8"))))
`;
    const result = spawnSync("python3", ["-c", python], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
    expect(payload.source_prepare_ms).toBe(123);
    expect(payload.scene_scan_ms).toBe(20);
    expect(payload.frame_write_ms).toBe(30);
  });

  it("keeps exact visual evidence with frame provenance and sends it to final", async () => {
    const { createCodexVisionKeyframesClient } = await import(keyframesModuleUrl);
    const frameDir = path.join(workdir, "frames");
    mkdirSync(frameDir, { recursive: true });
    const frames = [0, 50, 99].map((timestamp, index) => {
      const framePath = path.join(frameDir, `frame_${String(index + 1).padStart(4, "0")}_${timestamp.toFixed(3).padStart(9, "0")}.jpg`);
      writeFileSync(framePath, "fake-image", "utf8");
      return {
        index: index + 1,
        timestamp_sec: timestamp,
        timestamp: `00:${String(timestamp).padStart(2, "0")}.000`,
        path: framePath,
        reason: index === 0 ? "scene:first" : "hybrid:interval",
        scene_score: null,
      };
    });
    writeJson(path.join(frameDir, "frames.json"), frames);
    writeJson(path.join(frameDir, "extraction_stats.json"), { duration_sec: 100 });

    const prompts: string[] = [];
    let callCount = 0;
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "cache"),
      singleRecipeOnly: true,
      frameMode: "hybrid",
      interval: 4,
      hybridAnchorBudget: 48,
      selectorCandidateLimit: 48,
      keyframeTotalLimit: 8,
      noCache: true,
      extractFrames: async ({ frameOptions }: { frameOptions: Record<string, unknown> }) => {
        expect(frameOptions).toMatchObject({ mode: "hybrid", interval: 4, hybridAnchorBudget: 48 });
        return {
          frameCacheHit: false,
          frameDir,
          frames,
          extractionStats: { duration_sec: 100, timeline_coverage_ratio: 0.99 },
        };
      },
      codexExec: async ({ prompt }: { prompt: string }) => {
        prompts.push(prompt);
        callCount += 1;
        if (callCount === 1) {
          return JSON.stringify({
            selectedFrames: [{
              file: path.basename(frames[2].path),
              reason: "화면 자막에 분량 표시",
              visualEvidence: {
                observed: ["김치"],
                onscreenText: ["김치 300g"],
                quantityCues: ["김치 300g"],
                confidence: 1.4,
              },
            }],
          });
        }
        return JSON.stringify({
          recipes: [{
            title: "김치찌개",
            ingredients: [{ name: "김치", amount: "300", unit: "g", amountBasis: "onscreen" }],
            steps: ["김치를 냄비에 넣고 끓인다."],
          }],
        });
      },
    });

    const result = await client.generate({
      prompt: "한 개의 레시피 JSON을 출력한다.",
      videoUrl: "https://www.youtube.com/watch?v=single-case",
      cacheText: "[SOURCE: description]\n김치찌개\n\n[SOURCE: transcript(ko)]\n[00:01] 김치를 끓인다.",
    });

    expect(callCount).toBe(2);
    expect(prompts[0]).toContain("visualEvidence");
    expect(prompts[0]).not.toContain("recipeHints");
    expect(prompts[1]).toContain("김치 300g");
    expect(prompts[1]).toContain("resolutionSource=exact");
    expect(result.meta).toMatchObject({
      singleRecipeOnly: true,
      frameMode: "hybrid",
      selectorCandidateLimit: 48,
      selectedFrameCount: 1,
      modelCallCount: 2,
    });
    expect(result.meta.selectedFrameEvidenceSummary).toMatchObject({
      selectedFrameCount: 1,
      cueBearingFrameCount: 1,
      onscreenCueCount: 1,
    });

    const selectedArtifact = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "selected_frames.json"), "utf8"));
    expect(selectedArtifact.selectedFrames).toHaveLength(1);
    expect(selectedArtifact.selectedFrames[0]).toMatchObject({
      file: path.basename(frames[2].path),
      resolutionSource: "exact",
      visualEvidence: {
        observed: ["김치"],
        onscreenText: ["김치 300g"],
        quantityCues: ["김치 300g"],
        confidence: 1,
      },
    });
  });

  it("clears an onscreen amount when no selected-frame cue supports it", async () => {
    const { createCodexVisionKeyframesClient } = await import(keyframesModuleUrl);
    const frameDir = path.join(workdir, "conflict-frames");
    mkdirSync(frameDir, { recursive: true });
    const framePath = path.join(frameDir, "frame_0001_00000.000.jpg");
    writeFileSync(framePath, "fake-image", "utf8");
    const frames = [{
      index: 1,
      timestamp_sec: 0,
      timestamp: "00:00.000",
      path: framePath,
      reason: "hybrid:interval",
      scene_score: null,
    }];
    let callCount = 0;
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "conflict-cache"),
      singleRecipeOnly: true,
      noCache: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { duration_sec: 1 },
      }),
      codexExec: async () => {
        callCount += 1;
        return callCount === 1
          ? JSON.stringify({
            selectedFrames: [{
              file: path.basename(framePath),
              reason: "김치 분량 자막",
              visualEvidence: {
                observed: ["김치"],
                onscreenText: ["김치 300g"],
                quantityCues: ["김치 300g"],
                confidence: 1,
              },
            }],
          })
          : JSON.stringify({
            recipes: [{
              title: "김치찌개",
              ingredients: [{ name: "식용유", amount: "1", unit: "T", amountBasis: "onscreen" }],
              steps: ["식용유를 두르고 김치를 끓인다."],
            }],
          });
      },
    });

    const result = await client.generate({
      prompt: "한 레시피만 출력",
      videoUrl: "https://www.youtube.com/watch?v=conflict-case",
      cacheText: "[SOURCE: description]\n김치찌개",
    });

    expect(result.json.recipes[0].ingredients[0]).toMatchObject({
      name: "식용유",
      amount: null,
      unit: null,
      amountBasis: null,
    });
    expect(result.meta.sourceConflictCount).toBe(1);
  });

  it("uses the frozen fast12 profile as the single-mode default", async () => {
    const { createCodexVisionKeyframesClient } = await import(keyframesModuleUrl);
    const frameDir = path.join(workdir, "default-profile-frames");
    mkdirSync(frameDir, { recursive: true });
    const framePath = path.join(frameDir, "frame_0001_00000.000.jpg");
    writeFileSync(framePath, "fake-image", "utf8");
    const frames = [{
      index: 1,
      timestamp_sec: 0,
      timestamp: "00:00.000",
      path: framePath,
      reason: "hybrid:interval",
      scene_score: null,
    }];
    let appliedFrameOptions: Record<string, unknown> | null = null;
    let callCount = 0;
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "default-profile-cache"),
      singleRecipeOnly: true,
      noCache: true,
      extractFrames: async ({ frameOptions }: { frameOptions: Record<string, unknown> }) => {
        appliedFrameOptions = frameOptions;
        return { frameCacheHit: false, frameDir, frames, extractionStats: { duration_sec: 1 } };
      },
      codexExec: async () => {
        callCount += 1;
        return callCount === 1
          ? JSON.stringify({ selectedFrames: [{ file: path.basename(framePath), reason: "대표 프레임" }] })
          : JSON.stringify({ recipes: [{ title: "테스트", ingredients: [{ name: "물" }], steps: ["물과 재료를 섞는다."] }] });
      },
    });

    const result = await client.generate({
      prompt: "한 레시피만 출력",
      videoUrl: "https://www.youtube.com/watch?v=default-profile",
      cacheText: "[SOURCE: description]\n테스트",
    });

    expect(appliedFrameOptions).toMatchObject({
      mode: "hybrid",
      interval: 4,
      hybridAnchorBudget: 36,
      sceneDetail: "dense",
    });
    expect(result.meta).toMatchObject({ selectorCandidateLimit: 12, selectedFrameCount: 1 });
  });
});
