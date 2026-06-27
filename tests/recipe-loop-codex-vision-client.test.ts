import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const codexVisionModuleUrl = pathToFileURL(
  path.join(repoRoot, "scripts/recipe-loop/lib/codex-vision-client.mjs"),
).href;
const codexVisionKeyframesModuleUrl = pathToFileURL(
  path.join(repoRoot, "scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs"),
).href;
const runExtractionModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/recipe-loop/run-extraction.mjs")).href;

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function makeFrameFixture(root: string, count = 1) {
  const frameDir = path.join(root, "frame-cache");
  mkdirSync(frameDir, { recursive: true });
  const frames = Array.from({ length: count }, (_, index) => {
    const frameNo = String(index + 1).padStart(4, "0");
    const framePath = path.join(frameDir, `frame_${frameNo}_${String(index * 10).padStart(5, "0")}.000.jpg`);
    writeFileSync(framePath, "not-a-real-image-but-runner-is-fake", "utf8");
    return {
      index: index + 1,
      timestamp_sec: index * 10,
      timestamp: `00:${String(index * 10).padStart(2, "0")}.00`,
      path: framePath,
      reason: index === 0 ? "scene:first" : "scene:change",
      scene_score: null,
    };
  });
  writeJson(path.join(frameDir, "frames.json"), frames);
  writeJson(path.join(frameDir, "extraction_stats.json"), { scene_selected: count });
  return { frameDir, frames };
}

describe("recipe-loop codex-vision provider", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(path.join(tmpdir(), "recipe-loop-codex-vision-"));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("parses JSON from markdown fences and builds stable cache keys", async () => {
    const { buildCodexVisionCacheKey, extractJsonFromText } = await import(codexVisionModuleUrl);

    expect(extractJsonFromText("```json\n{\"recipes\":[{\"title\":\"김치찌개\"}]}\n```")).toEqual({
      recipes: [{ title: "김치찌개" }],
    });

    const first = buildCodexVisionCacheKey({
      model: "gpt-5.4",
      prompt: "prompt",
      cacheText: "source",
      frameManifestHash: "frames",
    });
    const second = buildCodexVisionCacheKey({
      model: "gpt-5.4",
      prompt: "prompt",
      cacheText: "source",
      frameManifestHash: "frames",
    });
    const changed = buildCodexVisionCacheKey({
      model: "gpt-5.4",
      prompt: "prompt-v2",
      cacheText: "source",
      frameManifestHash: "frames",
    });

    expect(first).toBe(second);
    expect(changed).not.toBe(first);
  });

  it("compacts large visual notes for final synthesis while preserving batch markers", async () => {
    const { compactVisualNotesForFinal } = await import(codexVisionModuleUrl);
    const noisyBatch = (batchNo: number) => [
      `## Batch ${batchNo}`,
      "",
      "1. 시간순 관찰",
      ...Array.from({ length: 40 }, (_, index) => `- ${batchNo}:${index} 긴 관찰 내용과 조리 화면 설명입니다.`),
      "2. 보이는 재료",
      ...Array.from({ length: 40 }, (_, index) => `- 재료 ${batchNo}-${index}`),
      "3. 보이는 도구와 조리 동작",
      ...Array.from({ length: 40 }, (_, index) => `- 도구 ${batchNo}-${index}`),
      "4. 화면 자막/글자",
      ...Array.from({ length: 40 }, (_, index) => `- 자막 ${batchNo}-${index}`),
      `- 아주 뒤쪽 자막에 된장과 소곱창, 깨소금이 일부 판독됨 ${batchNo}`,
      "5. 불확실한 점",
      ...Array.from({ length: 40 }, (_, index) => `- 불확실 ${batchNo}-${index}`),
    ].join("\n");
    const notes = [noisyBatch(1), noisyBatch(2), noisyBatch(3)].join("\n\n");
    const compacted = compactVisualNotesForFinal(notes, 4_000);

    expect(compacted.length).toBeLessThanOrEqual(4_000);
    expect(compacted).toContain("## Batch 1");
    expect(compacted).toContain("## Batch 3");
    expect(compacted).toContain("보이는 재료");
    expect(compacted).toContain("된장");
    expect(compacted).toContain("소곱창");
    expect(compacted).toContain("깨소금");
    expect(compacted.length).toBeLessThan(notes.length);
  });

  it("generates through Codex Vision, writes cache artifacts, and reuses the result cache", async () => {
    const { createCodexVisionClient } = await import(codexVisionModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir);
    const calls: Array<{ images: string[]; prompt: string }> = [];
    const client = createCodexVisionClient({
      cacheDir: path.join(workdir, "cache"),
      model: "fixture-model",
      batchSize: 1,
      extractFrames: async () => ({
        frameCacheHit: calls.length > 0,
        frameDir,
        frames,
        extractionStats: { scene_selected: 1 },
      }),
      codexExec: async ({ prompt, images, outputPath, logPath }: { prompt: string; images: string[]; outputPath: string; logPath: string }) => {
        calls.push({ prompt, images });
        const output = images.length > 0
          ? "1. 시간순 관찰\n- 냄비와 김치가 보임"
          : "```json\n{\"recipes\":[{\"title\":\"김치찌개\",\"ingredients\":[{\"name\":\"김치\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"김치를 냄비에 넣고 끓인다.\"]}]}\n```";
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const first = await client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "김치찌개",
    });
    const second = await client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "김치찌개",
    });

    expect(first).toMatchObject({
      cached: false,
      model: "fixture-model",
      provider: "codex-vision",
    });
    expect(first.json.recipes[0].title).toBe("김치찌개");
    expect(second.cached).toBe(true);
    expect(second.meta).toMatchObject({
      provider: "codex-vision",
      frameCount: 1,
      visionCacheHit: true,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].images).toEqual([frames[0].path]);
    expect(existsSync(path.join(first.meta.codexVisionCacheDir, "final.json"))).toBe(true);
    expect(existsSync(path.join(first.meta.codexVisionCacheDir, "visual_notes.md"))).toBe(true);
  });

  it("generates through Codex Vision keyframes and sends selected images to final synthesis", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 3);
    const calls: Array<{ model: string; images: string[]; prompt: string }> = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      model: "fixture-final-model",
      selectorModel: "fixture-selector-model",
      selectorCandidateLimit: 3,
      keyframeTotalLimit: 2,
      keyframesPerRecipe: 2,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 3 },
      }),
      codexExec: async ({
        prompt,
        images,
        model,
        outputPath,
        logPath,
      }: {
        prompt: string;
        images: string[];
        model: string;
        outputPath: string;
        logPath: string;
      }) => {
        calls.push({ prompt, images, model });
        const output = model === "fixture-selector-model"
          ? JSON.stringify({
            recipeHints: [{ title: "메밀 후토마끼", reason: "제목 후보" }],
            selectedFrames: [
              { file: path.basename(frames[1].path), recipeHint: "메밀 후토마끼", reason: "재료 투입" },
              { file: path.basename(frames[2].path), recipeHint: "메밀 후토마끼", reason: "말기 단계" },
            ],
          })
          : "```json\n{\"recipes\":[{\"title\":\"메밀 후토마끼\",\"ingredients\":[{\"name\":\"오이\",\"amount\":\"1\",\"unit\":\"개\"}],\"steps\":[\"오이를 채 썰어 준비한다.\"]}]}\n```";
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const first = await client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "메밀 후토마끼 재료: 오이",
    });
    const second = await client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "메밀 후토마끼 재료: 오이",
    });

    expect(first).toMatchObject({
      cached: false,
      model: "fixture-final-model",
      provider: "codex-vision-keyframes",
    });
    expect(first.meta).toMatchObject({
      provider: "codex-vision-keyframes",
      selectorModel: "fixture-selector-model",
      frameCount: 3,
      candidateFrameCount: 3,
      selectedFrameCount: 2,
    });
    expect(first.json.recipes[0].title).toBe("메밀 후토마끼");
    expect(second.cached).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].images).toEqual(frames.map((frame) => frame.path));
    expect(calls[1].images).toEqual([frames[1].path, frames[2].path]);
    expect(existsSync(path.join(first.meta.codexVisionKeyframesCacheDir, "selector.json"))).toBe(true);
    expect(existsSync(path.join(first.meta.codexVisionKeyframesCacheDir, "selected_frames.json"))).toBe(true);
    expect(existsSync(path.join(first.meta.codexVisionKeyframesCacheDir, "final.json"))).toBe(true);
  });

  it("records keyframe selector failure artifacts without falling back to Gemini", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 2);
    const cacheDir = path.join(workdir, "keyframes-cache");
    const client = createCodexVisionKeyframesClient({
      cacheDir,
      model: "fixture-final-model",
      selectorModel: "fixture-selector-model",
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 2 },
      }),
      codexExec: async ({ outputPath, logPath }: { outputPath: string; logPath: string }) => {
        writeFileSync(outputPath, "not json", "utf8");
        writeFileSync(logPath, "selector failed", "utf8");
        return "not json";
      },
    });

    await expect(client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "메밀 후토마끼",
    })).rejects.toThrow("Codex Vision JSON 파싱 실패");

    const failureFiles = readdirSync(cacheDir, { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith("failure.json"));
    expect(failureFiles).toHaveLength(1);
    const failure = JSON.parse(readFileSync(path.join(cacheDir, failureFiles[0]), "utf8"));
    expect(failure).toMatchObject({
      provider: "codex-vision-keyframes",
      stage: "selector",
      selectorModel: "fixture-selector-model",
    });
  });

  it("records failure artifacts and does not silently fall back to Gemini", async () => {
    const { createCodexVisionClient } = await import(codexVisionModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir);
    const cacheDir = path.join(workdir, "cache");
    const calls: string[] = [];
    const client = createCodexVisionClient({
      cacheDir,
      model: "fixture-model",
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 1 },
      }),
      codexExec: async ({ images, outputPath, logPath }: { images: string[]; outputPath: string; logPath: string }) => {
        calls.push(images.length > 0 ? "batch" : "final");
        writeFileSync(outputPath, "partial", "utf8");
        writeFileSync(logPath, "failure log", "utf8");
        if (images.length > 0) return "frame notes";
        throw new Error("codex final failed");
      },
    });

    await expect(client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "김치찌개",
    })).rejects.toThrow("codex final failed");

    expect(calls).toEqual(["batch", "final"]);
    const failureFiles = readdirSync(cacheDir, { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith("failure.json"));
    expect(failureFiles).toHaveLength(1);
    const failure = JSON.parse(readFileSync(path.join(cacheDir, failureFiles[0]), "utf8"));
    expect(failure).toMatchObject({ provider: "codex-vision", message: "codex final failed" });
  });

  it("reuses successful batch reports after a final synthesis failure", async () => {
    const { createCodexVisionClient } = await import(codexVisionModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir);
    let batchCalls = 0;
    let finalCalls = 0;
    const client = createCodexVisionClient({
      cacheDir: path.join(workdir, "cache"),
      model: "fixture-model",
      batchSize: 1,
      extractFrames: async () => ({
        frameCacheHit: true,
        frameDir,
        frames,
        extractionStats: { scene_selected: 1 },
      }),
      codexExec: async ({ images, outputPath, logPath }: { images: string[]; outputPath: string; logPath: string }) => {
        if (images.length > 0) {
          batchCalls += 1;
          const output = "1. 시간순 관찰\n- 김치와 냄비가 보임";
          writeFileSync(outputPath, output, "utf8");
          writeFileSync(logPath, "batch ok", "utf8");
          return output;
        }

        finalCalls += 1;
        if (finalCalls === 1) {
          writeFileSync(logPath, "final failed", "utf8");
          throw new Error("codex final failed once");
        }

        const output = "{\"recipes\":[{\"title\":\"김치찌개\",\"ingredients\":[{\"name\":\"김치\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"김치를 냄비에 넣고 끓인다.\"]}]}";
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "final ok", "utf8");
        return output;
      },
    });

    const input = {
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "김치찌개",
    };
    await expect(client.generate(input)).rejects.toThrow("codex final failed once");
    const retry = await client.generate(input);

    expect(batchCalls).toBe(1);
    expect(finalCalls).toBe(2);
    expect(retry.json.recipes[0].title).toBe("김치찌개");
    expect(retry.meta.codexBatchCacheHits).toBe(1);
  });

  it("treats corrupt batch cache metadata as a cache miss", async () => {
    const { createCodexVisionClient } = await import(codexVisionModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir);
    const cacheDir = path.join(workdir, "cache");
    let batchCalls = 0;
    let finalCalls = 0;
    const client = createCodexVisionClient({
      cacheDir,
      model: "fixture-model",
      batchSize: 1,
      extractFrames: async () => ({
        frameCacheHit: true,
        frameDir,
        frames,
        extractionStats: { scene_selected: 1 },
      }),
      codexExec: async ({ images, outputPath, logPath }: { images: string[]; outputPath: string; logPath: string }) => {
        if (images.length > 0) {
          batchCalls += 1;
          const output = `1. 시간순 관찰\n- 김치와 냄비가 보임 ${batchCalls}`;
          writeFileSync(outputPath, output, "utf8");
          writeFileSync(logPath, "batch ok", "utf8");
          return output;
        }

        finalCalls += 1;
        if (finalCalls === 1) {
          writeFileSync(logPath, "final failed", "utf8");
          throw new Error("codex final failed once");
        }

        const output = "{\"recipes\":[{\"title\":\"김치찌개\",\"ingredients\":[{\"name\":\"김치\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"김치를 냄비에 넣고 끓인다.\"]}]}";
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "final ok", "utf8");
        return output;
      },
    });

    const input = {
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "김치찌개",
    };
    await expect(client.generate(input)).rejects.toThrow("codex final failed once");

    const metaFile = readdirSync(cacheDir, { recursive: true })
      .map((entry) => String(entry))
      .find((entry) => entry.endsWith("batch_001.meta.json"));
    expect(metaFile).toBeDefined();
    writeFileSync(path.join(cacheDir, metaFile!), "{not json", "utf8");

    const retry = await client.generate(input);

    expect(batchCalls).toBe(2);
    expect(retry.json.recipes[0].title).toBe("김치찌개");
    expect(retry.meta.codexBatchCacheHits).toBe(0);
  });

  it("selects codex-vision from run-extraction without reading golden.json", async () => {
    const { createLlmForProvider, runExtraction } = await import(runExtractionModuleUrl);
    const selected = createLlmForProvider("codex-vision", {
      model: "fixture-model",
      "max-frames": "3",
      "storyboard-max-frames": "0",
      "refresh-final": true,
    }, {
      createCodexVision: (options: Record<string, unknown>) => ({ options }),
    });
    expect(selected.options).toMatchObject({
      model: "fixture-model",
      maxFrames: 3,
      storyboardMaxFrames: 0,
      refreshFinal: true,
    });

    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    writeJson(path.join(caseDir, "source.json"), {
      video: {
        videoId: "case-a",
        title: "김치찌개",
        description: "김치 1컵",
        url: "https://www.youtube.com/watch?v=case-a",
      },
      captions: { available: false, segments: [] },
      authorComments: { comments: [] },
    });
    writeFileSync(path.join(caseDir, "golden.json"), "{ this would fail if read", "utf8");

    const result = await runExtraction(
      { split: "train", ids: "case-a", "out-tag": "codex-test", provider: "codex-vision" },
      {
        projectRoot: workdir,
        llm: {
          generate: async () => ({
            cached: false,
            model: "fixture-model",
            provider: "codex-vision",
            meta: { provider: "codex-vision", frameCount: 1 },
            json: {
              recipes: [
                {
                  title: "김치찌개",
                  ingredients: [{ name: "김치", amount: "1", unit: "컵" }],
                  steps: ["김치를 냄비에 넣고 끓인다."],
                },
              ],
            },
          }),
        },
      },
    );

    expect(result.failures).toBe(0);
    const output = JSON.parse(readFileSync(path.join(caseDir, "runs/codex-test/result.json"), "utf8"));
    expect(output.meta.provider).toBe("codex-vision");
    expect(output.recipes[0].title).toBe("김치찌개");
  });

  it("selects codex-vision-keyframes from run-extraction without changing the Gemini default", async () => {
    const { createLlmForProvider, runExtraction } = await import(runExtractionModuleUrl);
    const selected = createLlmForProvider("codex-vision-keyframes", {
      model: "fixture-final-model",
      "selector-model": "fixture-selector-model",
      "selector-candidate-limit": "12",
      "keyframe-total-limit": "6",
      "keyframes-per-recipe": "2",
      "refresh-final": true,
    }, {
      createCodexVisionKeyframes: (options: Record<string, unknown>) => ({ options }),
    });
    expect(selected.options).toMatchObject({
      model: "fixture-final-model",
      selectorModel: "fixture-selector-model",
      selectorCandidateLimit: 12,
      keyframeTotalLimit: 6,
      keyframesPerRecipe: 2,
      refreshFinal: true,
    });

    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-keyframes");
    writeJson(path.join(caseDir, "source.json"), {
      video: {
        videoId: "case-keyframes",
        title: "메밀 후토마끼",
        description: "오이 1개",
        url: "https://www.youtube.com/watch?v=case-keyframes",
      },
      captions: { available: false, segments: [] },
      authorComments: { comments: [] },
    });
    writeFileSync(path.join(caseDir, "golden.json"), "{ this would fail if read", "utf8");

    const result = await runExtraction(
      { split: "train", ids: "case-keyframes", "out-tag": "keyframes-test", provider: "codex-vision-keyframes" },
      {
        projectRoot: workdir,
        llm: {
          generate: async () => ({
            cached: false,
            model: "fixture-final-model",
            provider: "codex-vision-keyframes",
            meta: { provider: "codex-vision-keyframes", selectedFrameCount: 2 },
            json: {
              recipes: [
                {
                  title: "메밀 후토마끼",
                  ingredients: [{ name: "오이", amount: "1", unit: "개" }],
                  steps: ["오이를 채 썰어 준비한다."],
                },
              ],
            },
          }),
        },
      },
    );

    expect(result.failures).toBe(0);
    const output = JSON.parse(readFileSync(path.join(caseDir, "runs/keyframes-test/result.json"), "utf8"));
    expect(output.meta.provider).toBe("codex-vision-keyframes");
    expect(output.recipes[0].title).toBe("메밀 후토마끼");
  });

  it("keeps the Gemini provider as the default run-extraction path", async () => {
    const { runExtraction } = await import(runExtractionModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-gemini");
    writeJson(path.join(caseDir, "source.json"), {
      video: {
        videoId: "case-gemini",
        title: "된장찌개",
        description: "된장 1큰술",
        url: "https://www.youtube.com/watch?v=case-gemini",
      },
      captions: { available: false, segments: [] },
      authorComments: { comments: [] },
    });

    const geminiFactoryCalls: Array<Record<string, unknown>> = [];
    const result = await runExtraction(
      { split: "train", ids: "case-gemini", "out-tag": "gemini-default-test" },
      {
        projectRoot: workdir,
        factories: {
          createGemini: (options: Record<string, unknown>) => {
            geminiFactoryCalls.push(options);
            return {
              generate: async () => ({
                cached: false,
                model: "fixture-gemini",
                provider: "gemini",
                meta: { provider: "gemini" },
                json: {
                  recipes: [
                    {
                      title: "된장찌개",
                      ingredients: [{ name: "된장", amount: "1", unit: "큰술" }],
                      steps: ["된장을 풀고 끓인다."],
                    },
                  ],
                },
              }),
            };
          },
        },
      },
    );

    expect(result.failures).toBe(0);
    expect(geminiFactoryCalls).toHaveLength(1);
    const output = JSON.parse(readFileSync(path.join(caseDir, "runs/gemini-default-test/result.json"), "utf8"));
    expect(output.meta.provider).toBe("gemini");
    expect(output.recipes[0].title).toBe("된장찌개");
  });

  it("writes a run-level failure artifact when extraction fails", async () => {
    const { runExtraction } = await import(runExtractionModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-fail");
    writeJson(path.join(caseDir, "source.json"), {
      video: {
        videoId: "case-fail",
        title: "실패 케이스",
        description: "김치 1컵",
        url: "https://www.youtube.com/watch?v=case-fail",
      },
      captions: { available: false, segments: [] },
      authorComments: { comments: [] },
    });

    const result = await runExtraction(
      { split: "train", ids: "case-fail", "out-tag": "codex-test-fail", provider: "codex-vision" },
      {
        projectRoot: workdir,
        llm: {
          generate: async () => {
            throw new Error("fixture extraction failed");
          },
        },
      },
    );

    expect(result.failures).toBe(1);
    const failurePath = path.join(caseDir, "runs/codex-test-fail/failure.json");
    expect(existsSync(failurePath)).toBe(true);
    const failure = JSON.parse(readFileSync(failurePath, "utf8"));
    expect(failure).toMatchObject({
      videoId: "case-fail",
      split: "train",
      outTag: "codex-test-fail",
      provider: "codex-vision",
      message: "fixture extraction failed",
    });
  });
});
