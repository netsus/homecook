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

  it("does not invent an unmentioned stew ingredient in a recovered cooking step", async () => {
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

    expect(result.recipes[0].steps.join(" ")).toContain("소금이나 새우젓");
    expect(result.recipes[0].steps.join(" ")).not.toContain("김치 국물");
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
    });
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
