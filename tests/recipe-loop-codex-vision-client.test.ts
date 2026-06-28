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
const urlOnlyGptModuleUrl = pathToFileURL(
  path.join(repoRoot, "scripts/recipe-loop/lib/url-only-gpt-client.mjs"),
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

  it("builds bounded source cue packets from raw source text while skipping source noise", async () => {
    const { buildSourceCuePacketsFromSourceText } = await import(codexVisionKeyframesModuleUrl);

    const packetPlan = buildSourceCuePacketsFromSourceText(
      [
        "[SOURCE: recipe_candidate_hints]",
        "1. 후보 요리",
        "[SOURCE: description]",
        "00:05 후보 요리",
        "- 양념 소스를 준비하고 간을 맞춘다.",
        "- 팬에서 볶고 올리기 전에 고명을 둔다.",
        "- 구매처 링크와 쿠폰 안내",
        "[SOURCE: author_comment]",
        "후보 요리는 밥물 조절 후 끓이면 됩니다.",
        "[SOURCE: transcript(ko)]",
        "후보 요리에서 무침과 굽기 설명이 길게 이어지지만 BGM 정보는 조리 근거가 아닙니다.",
      ].join("\n"),
      {
        recipeCandidates: [{
          candidateId: "cand-01",
          titleHint: "후보 요리",
          sourceEvidence: [{ source: "description_timeline", text: "00:05 후보 요리" }],
        }],
      },
      {
        segments: [{
          segmentId: "seg-01",
          candidateId: "cand-01",
          titleHint: "후보 요리",
          startSec: 5,
          endSec: 40,
          textEvidence: ["00:05 후보 요리"],
        }],
      },
    );

    expect(packetPlan.version).toBe("source-cue-packet-v1");
    expect(packetPlan.packets).toHaveLength(1);
    const packet = packetPlan.packets[0];
    expect(packet.localSourceSnippets.length).toBeLessThanOrEqual(3);
    expect(packet.cookingCueSnippets.length).toBeLessThanOrEqual(5);
    expect(packet.localSourceSnippets.map((entry: { text: string }) => entry.text).join(" ")).toContain("양념 소스");
    expect(packet.cookingCueSnippets.map((entry: { text: string }) => entry.text).join(" ")).toContain("볶");
    const allCueText = JSON.stringify(packet);
    expect(allCueText).not.toContain("구매처");
    expect(allCueText).not.toContain("쿠폰");
    expect(allCueText).not.toContain("BGM");
    for (const entry of [...packet.localSourceSnippets, ...packet.cookingCueSnippets]) {
      expect(entry.text.length).toBeLessThanOrEqual(160);
    }
  });

  it("builds recipe evidence ledger only for covered output recipes without source leakage", async () => {
    const { buildRecipeEvidenceLedger, isLedgerTextAllowedSubstring } = await import(codexVisionKeyframesModuleUrl);

    const candidatePlan = {
      recipeCandidates: [
        {
          candidateId: "cand-01",
          titleHint: "두부볶음",
          outputRole: "recipe",
          sourceEvidence: [
            { source: "recipe_candidate_hints", text: "1. 두부볶음" },
            { source: "description_timeline", text: "00:10 두부볶음 재료 두부 1컵", timeHintSec: 10 },
          ],
        },
        {
          candidateId: "cand-02",
          titleHint: "보조국",
          outputRole: "recipe",
          sourceEvidence: [{ source: "recipe_candidate_hints", text: "2. 보조국" }],
        },
        {
          candidateId: "cand-03",
          titleHint: "묶음 제목",
          outputRole: "bundle_parent",
          sourceEvidence: [{ source: "description_timeline", text: "00:10 두부볶음&보조국" }],
        },
      ],
    };
    const segmentPlan = {
      segments: [
        {
          segmentId: "seg-01",
          candidateId: "cand-01",
          titleHint: "두부볶음",
          startSec: 10,
          endSec: 35,
          textEvidence: ["segment note: 양념 소스를 넣고 볶는다."],
        },
        {
          segmentId: "seg-02",
          candidateId: "cand-02",
          titleHint: "보조국",
          startSec: 40,
          endSec: 55,
          textEvidence: ["segment note: 보조국"],
        },
      ],
      coverage: [
        { candidateId: "cand-01", titleHint: "두부볶음", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
        { candidateId: "cand-02", titleHint: "보조국", status: "supporting", outputRole: "recipe", segmentIds: ["seg-02"] },
        { candidateId: "cand-03", titleHint: "묶음 제목", status: "supporting", outputRole: "bundle_parent", segmentIds: ["seg-01"] },
      ],
    };
    const segmentKeyframes = {
      selectedFrameHash: "frames",
      segments: [
        {
          segmentId: "seg-01",
          candidateId: "cand-01",
          titleHint: "두부볶음",
          selectedFrames: [
            {
              file: "frame_0001_00010.000.jpg",
              timestamp_sec: 10,
              selectionReason: "양념 재료가 보임",
            },
          ],
        },
      ],
    };
    const ledger = buildRecipeEvidenceLedger({
      sourceText: [
        "[SOURCE: transcript(ko)]",
        "00:12 두부 1컵을 넣고 양념한다.",
        "00:13 구매처 쿠폰 안내",
      ].join("\n"),
      candidatePlan,
      segmentPlan,
      segmentKeyframes,
      generatedFrom: {
        candidatePlanHash: "candidate-hash",
        segmentPlanHash: "segment-hash",
        segmentKeyframesHash: "segment-keyframes-hash",
        selectedFrameHash: "frames",
      },
    });

    expect(ledger.version).toBe("recipe-evidence-ledger-v1");
    expect(ledger.recipes.map((recipe: { candidateId: string }) => recipe.candidateId)).toEqual(["cand-01"]);
    const recipe = ledger.recipes[0];
    expect(recipe.evidenceItems.some((item: { text: string }) => item.text.includes("쿠폰"))).toBe(false);
    expect(recipe.evidenceItems).toContainEqual(expect.objectContaining({
      basis: "selector_inference",
      sourceKind: "selected_frame",
      kind: "visual_context",
      text: "양념 재료가 보임",
    }));
    expect(recipe.promptCues.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(ledger)).not.toContain("golden.json");
    expect(JSON.stringify(ledger)).not.toContain("_semantic_summary");
    expect(JSON.stringify(ledger)).not.toContain("feedback_for_next_iter");
    expect(isLedgerTextAllowedSubstring("두부 1컵", ["00:12 두부 1컵을 넣고 양념한다."])).toBe(true);
    expect(isLedgerTextAllowedSubstring("없는 재료", ["00:12 두부 1컵을 넣고 양념한다."])).toBe(false);
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
      sourceCuePackets: true,
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
    expect(calls[1].prompt).not.toContain("sourceCuePacket");
    expect(first.meta).not.toHaveProperty("sourceCuePacketsEnabled");
    expect(calls[0].images).toEqual(frames.map((frame) => frame.path));
    expect(calls[1].images).toEqual([frames[1].path, frames[2].path]);
    expect(existsSync(path.join(first.meta.codexVisionKeyframesCacheDir, "selector.json"))).toBe(true);
    expect(existsSync(path.join(first.meta.codexVisionKeyframesCacheDir, "selected_frames.json"))).toBe(true);
    expect(existsSync(path.join(first.meta.codexVisionKeyframesCacheDir, "final.json"))).toBe(true);
  });

  it("builds source-derived candidate hints without promoting obvious non-recipes", async () => {
    const { buildCandidateHintsFromSourceText } = await import(codexVisionKeyframesModuleUrl);

    const bundled = buildCandidateHintsFromSourceText([
      "[SOURCE: recipe_candidate_hints]",
      "1. 김치찌개&된장찌개ㅣ제육볶음",
      "2. 소금과 후추",
      "3. 브이로그/집밥",
    ].join("\n"));
    expect(bundled.recipeCandidates.map((candidate: { titleHint: string }) => candidate.titleHint)).toEqual([
      "김치찌개",
      "된장찌개",
      "제육볶음",
    ]);
    expect(bundled.recipeCandidates.every((candidate: { sourceEvidence: unknown[] }) => candidate.sourceEvidence.length > 0)).toBe(true);

    const single = buildCandidateHintsFromSourceText("[SOURCE: recipe_candidate_hints]\n1. 김치찌개");
    expect(single.recipeCandidates.map((candidate: { titleHint: string }) => candidate.titleHint)).toEqual(["김치찌개"]);

    const withTimeline = buildCandidateHintsFromSourceText([
      "[SOURCE: recipe_candidate_hints]",
      "1. 김치찌개",
      "[SOURCE: description]",
      "00:16 김치찌개",
    ].join("\n"));
    expect(withTimeline.recipeCandidates[0]).toMatchObject({
      titleHint: "김치찌개",
      timeHintSec: 16,
      evidenceStrength: "title+timeline",
    });
  });

  it("links bundled timeline candidates to existing child candidates without title hardcoding", async () => {
    const { buildCandidateHintsFromSourceText } = await import(codexVisionKeyframesModuleUrl);

    const candidatePlan = buildCandidateHintsFromSourceText([
      "[SOURCE: recipe_candidate_hints]",
      "1. 차가운 토마토면",
      "2. 가지구이",
      "[SOURCE: description]",
      "00:10 가지&차가운 토마토면",
    ].join("\n"));

    type CandidateHint = {
      candidateId: string;
      titleHint: string;
      bundleRole?: string | null;
      bundleSourceText?: string | null;
      bundleMemberIds?: string[];
      bundleParentId?: string | null;
    };
    const candidates = candidatePlan.recipeCandidates as CandidateHint[];
    const parent = candidates.find((candidate) => candidate.titleHint === "가지&차가운 토마토면");
    const tomato = candidates.find((candidate) => candidate.titleHint === "차가운 토마토면");
    const eggplant = candidates.find((candidate) => candidate.titleHint === "가지구이");

    expect(parent).toBeDefined();
    expect(tomato).toBeDefined();
    expect(eggplant).toBeDefined();
    expect(parent).toMatchObject({
      bundleRole: "parent",
      bundleSourceText: "가지&차가운 토마토면",
      outputRole: "bundle_parent",
      bundleMemberIds: expect.arrayContaining([tomato?.candidateId, eggplant?.candidateId]),
    });
    expect(tomato).toMatchObject({ bundleParentId: parent?.candidateId, outputRole: "recipe" });
    expect(eggplant).toMatchObject({ bundleParentId: parent?.candidateId, outputRole: "recipe" });
  });

  it("does not link bundle children from a shared ingredient token only", async () => {
    const { buildCandidateHintsFromSourceText } = await import(codexVisionKeyframesModuleUrl);

    const candidatePlan = buildCandidateHintsFromSourceText([
      "[SOURCE: recipe_candidate_hints]",
      "1. 감자전",
      "2. 바질 냉파스타",
      "3. 바질국",
      "[SOURCE: description]",
      "00:10 감자&바질 냉파스타",
    ].join("\n"));

    type CandidateHint = {
      candidateId: string;
      titleHint: string;
      bundleRole?: string | null;
      bundleMemberIds?: string[];
      bundleParentId?: string | null;
      outputRole?: string;
    };
    const candidates = candidatePlan.recipeCandidates as CandidateHint[];
    const parent = candidates.find((candidate) => candidate.titleHint === "감자&바질 냉파스타");
    const potato = candidates.find((candidate) => candidate.titleHint === "감자전");
    const pasta = candidates.find((candidate) => candidate.titleHint === "바질 냉파스타");
    const soup = candidates.find((candidate) => candidate.titleHint === "바질국");

    expect(parent).toMatchObject({
      bundleRole: "parent",
      outputRole: "bundle_parent",
      bundleMemberIds: expect.arrayContaining([potato?.candidateId, pasta?.candidateId]),
    });
    expect(parent?.bundleMemberIds).not.toContain(soup?.candidateId);
    expect(potato).toMatchObject({ bundleParentId: parent?.candidateId, outputRole: "recipe" });
    expect(pasta).toMatchObject({ bundleParentId: parent?.candidateId, outputRole: "recipe" });
    expect(soup).toMatchObject({ bundleParentId: null, outputRole: "recipe" });
  });

  it("builds description timeline parent ranges with fallback metadata", async () => {
    const { buildTimelineParentRangePlan } = await import(codexVisionKeyframesModuleUrl);

    const rangePlan = buildTimelineParentRangePlan({
      sourceText: [
        "[SOURCE: description]",
        "00:16 메밀 파이프 후토마끼",
        "04:55 맥적&열무 들기름냉파스타",
        "07:40 등촌칼국수&소곱창구이",
        "10:23 열무묵국&항정살 솥밥",
      ].join("\n"),
      lastKeyframeSec: 745.2,
    });

    expect(rangePlan).toMatchObject({
      rangeSource: "description_timeline",
      timelineParentRangeVersion: "timeline-parent-range-v1",
      timelineConfidence: 0.95,
      fallbackReason: null,
      lastKeyframeSec: 745.2,
    });
    expect(rangePlan.parsedTimelineEntries.map((entry: { startSec: number; title: string }) => [entry.startSec, entry.title])).toEqual([
      [16, "메밀 파이프 후토마끼"],
      [295, "맥적&열무 들기름냉파스타"],
      [460, "등촌칼국수&소곱창구이"],
      [623, "열무묵국&항정살 솥밥"],
    ]);
    expect(rangePlan.parentRanges.map((range: { startSec: number; endSec: number }) => [range.startSec, range.endSec])).toEqual([
      [16, 295],
      [295, 460],
      [460, 623],
      [623, 745.2],
    ]);

    const fallbackPlan = buildTimelineParentRangePlan({
      sourceText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 메밀 후토마끼",
      ].join("\n"),
      lastKeyframeSec: 745.2,
    });
    expect(fallbackPlan).toMatchObject({
      rangeSource: "llm_planner_fallback",
      timelineParentRangeVersion: "timeline-parent-range-v1",
      timelineConfidence: 0,
      parsedTimelineEntries: [],
      fallbackReason: "no_description_timeline_found",
    });

    const lowConfidencePlan = buildTimelineParentRangePlan({
      sourceText: [
        "[SOURCE: description]",
        "00:16 메밀 후토마끼",
      ].join("\n"),
      lastKeyframeSec: 745.2,
    });
    expect(lowConfidencePlan).toMatchObject({
      rangeSource: "llm_planner_fallback",
      timelineConfidence: 0.6,
      fallbackReason: "description_timeline_confidence_below_threshold",
    });
  });
  it("generates through Codex Vision segmented keyframes and preserves per-segment artifacts", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 8);
    const calls: Array<{ model: string; images: string[]; prompt: string }> = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 2,
      segmentMaxFrames: 3,
      segmentFrameTotalLimit: 4,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 8 },
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
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [
              {
                segmentId: "seg-01",
                candidateId: "cand-01",
                titleHint: "메밀 후토마끼",
                startSec: 0,
                endSec: 25,
                timeEvidence: ["제목 후보: 메밀 후토마끼"],
                frameBudget: 3,
              },
              {
                segmentId: "seg-02",
                candidateId: "cand-02",
                titleHint: "맥적구이",
                startSec: 40,
                endSec: 70,
                timeEvidence: ["제목 후보: 맥적구이"],
                frameBudget: 3,
              },
            ],
            coverage: [
              { candidateId: "cand-01", titleHint: "메밀 후토마끼", status: "covered", segmentIds: ["seg-01"] },
              { candidateId: "cand-02", titleHint: "맥적구이", status: "covered", segmentIds: ["seg-02"] },
            ],
          });
        } else if (model === "fixture-selector-model") {
          const fuzzyBasename = (imagePath: string) => {
            const basename = path.basename(imagePath);
            const timestamp = basename.match(/_(\d+(?:\.\d+)?)\.jpg$/)?.[1];
            return `frame_9999_${timestamp}.jpg`;
          };
          output = JSON.stringify({
            selectedFrames: [
              { file: fuzzyBasename(images[0]), reason: "양념 또는 재료 투입" },
              { file: fuzzyBasename(images[images.length - 1]), reason: "조리 상태 확인" },
            ],
          });
        } else {
          expect(prompt).toContain("[SEGMENT seg-01]");
          expect(prompt).toContain("candidateId: cand-02");
          expect(prompt).toContain("Output recipe candidates:");
          expect(prompt).toContain("Support-only candidates:");
          expect(prompt).toContain("Candidate coverage checklist");
          expect(prompt).toContain("titleHint: 맥적구이");
          expect(prompt).toContain("outputRole=recipe");
          expect(prompt).not.toContain("sourceBackedCues");
          output = "```json\n{\"recipes\":[{\"title\":\"메밀 후토마끼\",\"ingredients\":[{\"name\":\"오이\",\"amount\":\"1\",\"unit\":\"개\"}],\"steps\":[\"오이를 채 썰어 준비한다.\"]},{\"title\":\"맥적구이\",\"ingredients\":[{\"name\":\"돼지고기\",\"amount\":\"1\",\"unit\":\"팩\"}],\"steps\":[\"돼지고기에 된장 양념을 바른다.\"]}]}\n```";
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 메밀 후토마끼",
        "2. 맥적구이",
        "[SOURCE: description]",
        "00:00 메밀 후토마끼",
        "00:40 맥적구이",
      ].join("\n"),
    });

    expect(result.meta).toMatchObject({
      provider: "codex-vision-keyframes",
      keyframeMode: "segmented",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      candidateCount: 2,
      coveredCandidateCount: 2,
      droppedCandidateCount: 0,
      segmentCount: 2,
      selectedFrameCount: 3,
      segmentSelectedFrameCount: 4,
    });
    expect(result.json.recipes.map((recipe: { title: string }) => recipe.title)).toEqual(["메밀 후토마끼", "맥적구이"]);
    expect(calls).toHaveLength(4);
    expect(calls[0]).toMatchObject({ model: "fixture-segment-model", images: [] });
    expect(calls[0].prompt).toContain("recipeCandidates JSON");
    expect(calls[1].prompt).not.toContain("mustLookFor(source-backed only)");
    expect(calls[1].prompt).toContain("된장, 쯔유, 액젓");
    expect(calls[1].images).toHaveLength(3);
    expect(calls[1].images).toContain(frames[4].path);
    expect(calls[2].images).not.toContain(frames[0].path);
    expect(calls[3].images).toHaveLength(3);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "recipe-candidates.json"))).toBe(true);
    const candidatePlan = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "recipe-candidates.json"), "utf8"));
    expect(candidatePlan.recipeCandidates.map((candidate: { titleHint: string }) => candidate.titleHint)).toEqual(["메밀 후토마끼", "맥적구이"]);
    expect(candidatePlan.recipeCandidates[0].sourceBackedCues).toBeUndefined();
    expect(candidatePlan.candidatePlanHash).toBe(result.meta.candidatePlanHash);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "segment-plan.json"))).toBe(true);
    const segmentPlan = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "segment-plan.json"), "utf8"));
    expect(segmentPlan).toMatchObject({
      rangeSource: "description_timeline",
      timelineParentRangeVersion: "timeline-parent-range-v1",
      timelineConfidence: 0.95,
      fallbackReason: null,
      lastKeyframeSec: 70,
    });
    expect(segmentPlan.parsedTimelineEntries.map((entry: { startSec: number; title: string }) => [entry.startSec, entry.title])).toEqual([
      [0, "메밀 후토마끼"],
      [40, "맥적구이"],
    ]);
    expect(segmentPlan.parentRanges.map((range: { startSec: number; endSec: number }) => [range.startSec, range.endSec])).toEqual([
      [0, 40],
      [40, 70],
    ]);
    expect(segmentPlan.segments.map((segment: { startSec: number; endSec: number; rangeSource: string }) => [segment.startSec, segment.endSec, segment.rangeSource])).toEqual([
      [0, 40, "description_timeline"],
      [40, 70, "description_timeline"],
    ]);
    expect(segmentPlan.segments.map((segment: { frameBudget: number }) => segment.frameBudget)).toEqual([2, 2]);
    expect(segmentPlan.coverage.map((entry: { candidateId: string; status: string; outputRole: string }) => [entry.candidateId, entry.status, entry.outputRole])).toEqual([
      ["cand-01", "covered", "recipe"],
      ["cand-02", "covered", "recipe"],
    ]);
    expect(segmentPlan.segments.every((segment: { frameBudgetAdjusted?: boolean }) => segment.frameBudgetAdjusted)).toBe(true);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "segment-keyframes.json"))).toBe(true);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "selected_frames.json"))).toBe(true);
    const selectedFrames = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "selected_frames.json"), "utf8"));
    expect(selectedFrames.selectedFrames.some((frame: { file: string }) => frame.file.startsWith("frame_9999_"))).toBe(false);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "final.json"))).toBe(true);
  });

  it("separates recipe evidence ledger artifact-only and prompt-on segmented cache paths", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 4);
    const cacheDir = path.join(workdir, "keyframes-cache");

    async function runLedgerMode(mode: "artifact" | "prompt") {
      const finalPrompts: string[] = [];
      const client = createCodexVisionKeyframesClient({
        cacheDir,
        keyframeMode: "segmented",
        model: "fixture-final-model",
        segmentModel: "fixture-segment-model",
        selectorModel: "fixture-selector-model",
        segmentPaddingSec: 0,
        segmentMinFrames: 1,
        segmentMaxFrames: 2,
        recipeEvidenceLedger: mode === "artifact",
        recipeEvidenceLedgerPrompt: mode === "prompt",
        extractFrames: async () => ({
          frameCacheHit: false,
          frameDir,
          frames,
          extractionStats: { scene_selected: 4 },
        }),
        codexExec: async ({ model, prompt, images, outputPath, logPath }: { model: string; prompt: string; images: string[]; outputPath: string; logPath: string }) => {
          let output: string;
          if (model === "fixture-segment-model") {
            output = JSON.stringify({
              segments: [
                {
                  segmentId: "seg-01",
                  candidateId: "cand-01",
                  titleHint: "두부볶음",
                  startSec: 0,
                  endSec: 20,
                  textEvidence: ["두부 1컵을 양념한다"],
                  frameBudget: 2,
                },
                {
                  segmentId: "seg-02",
                  candidateId: "cand-02",
                  titleHint: "보조국",
                  startSec: 20,
                  endSec: 30,
                  textEvidence: ["보조국"],
                  frameBudget: 1,
                },
              ],
              coverage: [
                { candidateId: "cand-01", titleHint: "두부볶음", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
                { candidateId: "cand-02", titleHint: "보조국", status: "supporting", outputRole: "recipe", segmentIds: ["seg-02"] },
              ],
            });
          } else if (model === "fixture-selector-model") {
            output = JSON.stringify({
              selectedFrames: [{ file: path.basename(images[0]), reason: "양념 재료 확인" }],
            });
          } else {
            finalPrompts.push(prompt);
            output = "```json\n{\"recipes\":[{\"title\":\"두부볶음\",\"ingredients\":[{\"name\":\"두부\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"두부를 양념해 볶는다.\"]}]}\n```";
          }
          writeFileSync(outputPath, output, "utf8");
          writeFileSync(logPath, "ok", "utf8");
          return output;
        },
      });

      const result = await client.generate({
        prompt: "JSON만 출력",
        videoUrl: "https://www.youtube.com/watch?v=abc123",
        cacheText: [
          "[SOURCE: recipe_candidate_hints]",
          "1. 두부볶음",
          "2. 보조국",
          "[SOURCE: description]",
          "00:00 두부볶음",
          "[SOURCE: transcript(ko)]",
          "00:01 두부 1컵을 넣고 양념한다.",
        ].join("\n"),
      });
      return { result, finalPrompt: finalPrompts.at(-1) ?? "" };
    }

    const artifact = await runLedgerMode("artifact");
    const prompt = await runLedgerMode("prompt");

    expect(artifact.result.meta).toMatchObject({
      recipeEvidenceLedgerEnabled: true,
      recipeEvidenceLedgerPromptEnabled: false,
      recipeEvidenceLedgerVersion: "recipe-evidence-ledger-v1",
      recipeEvidenceLedgerRecipeCount: 1,
      promptLedgerTextChars: 0,
    });
    expect(prompt.result.meta).toMatchObject({
      recipeEvidenceLedgerEnabled: true,
      recipeEvidenceLedgerPromptEnabled: true,
      recipeEvidenceLedgerVersion: "recipe-evidence-ledger-v1",
      recipeEvidenceLedgerRecipeCount: 1,
    });
    expect(artifact.result.meta.codexVisionKeyframesCacheDir).not.toBe(prompt.result.meta.codexVisionKeyframesCacheDir);
    expect(existsSync(path.join(artifact.result.meta.codexVisionKeyframesCacheDir, "recipe-evidence-ledger.json"))).toBe(true);
    expect(existsSync(path.join(prompt.result.meta.codexVisionKeyframesCacheDir, "recipe-evidence-ledger.json"))).toBe(true);
    expect(artifact.finalPrompt).not.toContain("Recipe evidence ledger:");
    expect(prompt.finalPrompt).toContain("Recipe evidence ledger:");
    expect(prompt.finalPrompt).toContain("basis=source");
    expect(prompt.finalPrompt).toContain("selector_inference");
    const ledger = JSON.parse(readFileSync(path.join(prompt.result.meta.codexVisionKeyframesCacheDir, "recipe-evidence-ledger.json"), "utf8"));
    expect(ledger.recipes.map((recipe: { candidateId: string }) => recipe.candidateId)).toEqual(["cand-01"]);
    expect(JSON.stringify(ledger)).not.toContain("golden.json");
    expect(JSON.stringify(ledger)).not.toContain("semantic judge");
  });

  it("ignores recipe evidence ledger flags for global keyframe mode", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 2);
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "global",
      model: "fixture-final-model",
      selectorModel: "fixture-selector-model",
      recipeEvidenceLedgerPrompt: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 2 },
      }),
      codexExec: async ({ model, outputPath, logPath }: { model: string; outputPath: string; logPath: string }) => {
        const output = model === "fixture-selector-model"
          ? JSON.stringify({ selectedFrames: [{ file: path.basename(frames[0].path), recipeHint: "두부볶음", reason: "재료" }] })
          : "```json\n{\"recipes\":[{\"title\":\"두부볶음\",\"ingredients\":[{\"name\":\"두부\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"두부를 볶는다.\"]}]}\n```";
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "두부볶음",
    });

    expect(result.meta.keyframeMode).toBe("global");
    expect(result.meta).not.toHaveProperty("recipeEvidenceLedgerEnabled");
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "recipe-evidence-ledger.json"))).toBe(false);
  });

  it("expands bundled parent segments into child evidence blocks and preserves selection reasons", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 6);
    const calls: Array<{ model: string; images: string[]; prompt: string }> = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 3,
      segmentFrameTotalLimit: 4,
      sourceCuePackets: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 6 },
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
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-parent",
              candidateId: "cand-03",
              titleHint: "가지&차가운 토마토면",
              startSec: 0,
              endSec: 50,
              timeEvidence: ["00:10 가지&차가운 토마토면"],
              frameBudget: 4,
            }],
            coverage: [
              { candidateId: "cand-01", titleHint: "차가운 토마토면", status: "supporting", segmentIds: ["seg-parent"] },
              { candidateId: "cand-02", titleHint: "가지구이", status: "supporting", segmentIds: ["seg-parent"] },
              { candidateId: "cand-03", titleHint: "가지&차가운 토마토면", status: "covered", segmentIds: ["seg-parent"] },
            ],
          });
        } else if (model === "fixture-selector-model") {
          const isTomato = prompt.includes("titleHint: 차가운 토마토면");
          output = JSON.stringify({
            selectedFrames: [
              { file: path.basename(images[0]), reason: isTomato ? "토마토면 재료가 보임" : "가지구이 재료가 보임" },
              { file: path.basename(images[images.length - 1]), reason: isTomato ? "면 조합 단계" : "가지 굽기 단계" },
            ],
          });
        } else {
          expect(prompt).toContain("[SEGMENT seg-parent-cand-01]");
          expect(prompt).toContain("[SEGMENT seg-parent-cand-02]");
          expect(prompt).toContain("bundleParentId: cand-03");
          expect(prompt).toContain("Output recipe candidates:");
          expect(prompt).toContain("cand-01: titleHint=차가운 토마토면, role=recipe");
          expect(prompt).toContain("Support-only candidates:");
          expect(prompt).toContain("cand-03: titleHint=가지&차가운 토마토면, role=bundle_parent");
          expect(prompt).toContain("selectionReason=토마토면 재료가 보임");
          expect(prompt).toContain("selectionReason=가지구이 재료가 보임");
          expect(prompt).toContain("sourceCuePacket:");
          expect(prompt).toContain("localSourceSnippets:");
          expect(prompt).toContain("cookingCueSnippets:");
          expect(prompt).not.toContain("golden.json");
          expect(prompt).not.toContain("_grade_summary");
          expect(prompt).not.toContain("_semantic_summary");
          expect(prompt).not.toContain("feedback_for_next_iter");
          expect(prompt).not.toContain("artifact_diagnosis");
          expect(prompt).not.toContain("stageHint");
          output = "```json\n{\"recipes\":[{\"title\":\"차가운 토마토면\",\"ingredients\":[{\"name\":\"토마토\",\"amount\":\"1\",\"unit\":\"개\"}],\"steps\":[\"면을 차갑게 준비한다.\"]},{\"title\":\"가지구이\",\"ingredients\":[{\"name\":\"가지\",\"amount\":\"1\",\"unit\":\"개\"}],\"steps\":[\"가지를 굽는다.\"]}]}\n```";
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 차가운 토마토면",
        "2. 가지구이",
        "[SOURCE: description]",
        "00:10 가지&차가운 토마토면",
      ].join("\n"),
    });

    expect(result.meta).toMatchObject({
      bundleChildSegmentVersion: "bundle-child-segment-v2",
      sourceCuePacketsEnabled: true,
      sourceCuePacketVersion: "source-cue-packet-v1",
      segmentCount: 2,
      coveredCandidateCount: 2,
      supportingCandidateCount: 1,
    });
    expect(result.meta.sourceCuePacketHash).toEqual(expect.any(String));
    expect(calls.filter((call) => call.model === "fixture-selector-model")).toHaveLength(2);
    const segmentPlan = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "segment-plan.json"), "utf8"));
    expect(segmentPlan).toMatchObject({
      bundleChildSegmentVersion: "bundle-child-segment-v2",
      bundleChildSegmentApplied: true,
    });
    expect(segmentPlan.segments.map((segment: { candidateId: string; bundleParentId?: string }) => [segment.candidateId, segment.bundleParentId])).toEqual([
      ["cand-01", "cand-03"],
      ["cand-02", "cand-03"],
    ]);
    expect(segmentPlan.coverage.map((entry: { candidateId: string; status: string; outputRole: string }) => [entry.candidateId, entry.status, entry.outputRole])).toEqual([
      ["cand-01", "covered", "recipe"],
      ["cand-02", "covered", "recipe"],
      ["cand-03", "supporting", "bundle_parent"],
    ]);
    const selectedFrames = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "selected_frames.json"), "utf8"));
    expect(selectedFrames.selectedFrames.map((frame: { selectionReason: string | null }) => frame.selectionReason)).toEqual(expect.arrayContaining([
      "토마토면 재료가 보임",
      "가지구이 재료가 보임",
    ]));
    const segmentKeyframes = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "segment-keyframes.json"), "utf8"));
    expect(segmentKeyframes.segments.every((segment: { bundleParentId: string; outputRole: string }) => segment.bundleParentId === "cand-03" && segment.outputRole === "recipe")).toBe(true);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "source-cue-packets.json"))).toBe(false);
    const forbidden = [
      "golden.json",
      "_grade_summary",
      "_semantic_summary",
      "feedback_for_next_iter",
      "artifact_diagnosis",
      "stageHint",
    ];
    for (const entry of readdirSync(result.meta.codexVisionKeyframesCacheDir, { recursive: true }).map((name) => String(name))) {
      const fullPath = path.join(result.meta.codexVisionKeyframesCacheDir, entry);
      let body = "";
      try {
        body = readFileSync(fullPath, "utf8");
      } catch {
        continue;
      }
      for (const term of forbidden) {
        expect(body).not.toContain(term);
      }
    }
  });

  it("records candidate-aware segment schema failures with candidate artifacts", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 3);
    const cacheDir = path.join(workdir, "keyframes-cache");
    const client = createCodexVisionKeyframesClient({
      cacheDir,
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 3 },
      }),
      codexExec: async ({ outputPath, logPath }: { outputPath: string; logPath: string }) => {
        writeFileSync(outputPath, JSON.stringify({
          segments: [{
            segmentId: "seg-01",
            titleHint: "김치찌개",
            startSec: 0,
            endSec: 20,
            frameBudget: 2,
          }],
        }), "utf8");
        writeFileSync(logPath, "segment schema failed", "utf8");
        return readFileSync(outputPath, "utf8");
      },
    });

    await expect(client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "[SOURCE: recipe_candidate_hints]\n1. 김치찌개",
    })).rejects.toThrow("candidateId가 비었습니다");

    const artifactFiles = readdirSync(cacheDir, { recursive: true }).map((entry) => String(entry));
    expect(artifactFiles.some((entry) => entry.endsWith("recipe-candidates.json"))).toBe(true);
    const failureFile = artifactFiles.find((entry) => entry.endsWith("failure.json"));
    expect(failureFile).toBeDefined();
    const failure = JSON.parse(readFileSync(path.join(cacheDir, failureFile!), "utf8"));
    expect(failure).toMatchObject({
      provider: "codex-vision-keyframes",
      keyframeMode: "segmented",
      stage: "segment-normalize",
      candidatePlanHash: expect.any(String),
    });
  });

  it("sanitizes non-finite segment planner end times to the last frame timestamp", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 3);
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 3 },
      }),
      codexExec: async ({ model, outputPath, logPath }: { model: string; outputPath: string; logPath: string }) => {
        const output = model === "fixture-segment-model"
          ? "{\"segments\":[{\"segmentId\":\"seg-01\",\"candidateId\":\"cand-01\",\"titleHint\":\"김치찌개\",\"startSec\":0,\"endSec\":inf,\"frameBudget\":1}],\"coverage\":[{\"candidateId\":\"cand-01\",\"titleHint\":\"김치찌개\",\"status\":\"covered\",\"segmentIds\":[\"seg-01\"]}]}"
          : model === "fixture-selector-model"
            ? JSON.stringify({ selectedFrames: [{ file: path.basename(frames[0].path), reason: "재료 프레임" }] })
            : "```json\n{\"recipes\":[{\"title\":\"김치찌개\",\"ingredients\":[{\"name\":\"김치\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"김치를 넣고 끓인다.\"]}]}\n```";
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "[SOURCE: recipe_candidate_hints]\n1. 김치찌개",
    });

    const segmentPlan = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "segment-plan.json"), "utf8"));
    expect(segmentPlan.segments[0].endSec).toBe(20);
    expect(segmentPlan.warnings).toContain("segment plan non-finite numeric value was sanitized to 20");
  });

  it("uses candidatePlanHash to separate segmented result cache keys", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 3);
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 3 },
      }),
      codexExec: async ({ model, outputPath, logPath }: { model: string; outputPath: string; logPath: string }) => {
        const output = model === "fixture-segment-model"
          ? JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "후보 요리",
              startSec: 0,
              endSec: 20,
              frameBudget: 1,
            }],
            coverage: [{ candidateId: "cand-01", titleHint: "후보 요리", status: "covered", segmentIds: ["seg-01"] }],
          })
          : model === "fixture-selector-model"
            ? JSON.stringify({ selectedFrames: [{ file: path.basename(frames[0].path), reason: "근거 프레임" }] })
            : "```json\n{\"recipes\":[{\"title\":\"후보 요리\",\"ingredients\":[{\"name\":\"김치\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"김치를 넣는다.\"]}]}\n```";
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const first = await client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "[SOURCE: recipe_candidate_hints]\n1. 김치찌개",
    });
    const second = await client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "[SOURCE: recipe_candidate_hints]\n1. 된장찌개",
    });

    expect(first.meta.candidatePlanHash).not.toBe(second.meta.candidatePlanHash);
    expect(first.meta.codexVisionKeyframesCacheDir).not.toBe(second.meta.codexVisionKeyframesCacheDir);
  });

  it("records segmented planner failure artifacts without hidden provider fallback", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 3);
    const cacheDir = path.join(workdir, "keyframes-cache");
    const client = createCodexVisionKeyframesClient({
      cacheDir,
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 3 },
      }),
      codexExec: async ({ outputPath, logPath }: { outputPath: string; logPath: string }) => {
        writeFileSync(outputPath, "not json", "utf8");
        writeFileSync(logPath, "segment failed", "utf8");
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
      keyframeMode: "segmented",
      stage: "segment-plan",
      segmentModel: "fixture-segment-model",
    });
  });

  it("records keyframe selector failure artifacts without hidden provider fallback", async () => {
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

  it("records failure artifacts and does not silently fall back to another provider", async () => {
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

  it("selects codex-vision-keyframes from run-extraction explicitly", async () => {
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

  it("passes segmented keyframe options from run-extraction without reading golden.json", async () => {
    const { createLlmForProvider, runExtraction } = await import(runExtractionModuleUrl);
    const selected = createLlmForProvider("codex-vision-keyframes", {
      model: "fixture-final-model",
      "selector-model": "fixture-selector-model",
      "segment-model": "fixture-segment-model",
      "keyframe-mode": "segmented",
      "segment-padding-sec": "5",
      "segment-min-frames": "3",
      "segment-max-frames": "9",
      "segment-max-count": "7",
      "segment-frame-total-limit": "21",
      "source-cue-packets": true,
      "recipe-evidence-ledger-prompt": true,
      "refresh-final": true,
    }, {
      createCodexVisionKeyframes: (options: Record<string, unknown>) => ({ options }),
    });
    expect(selected.options).toMatchObject({
      model: "fixture-final-model",
      selectorModel: "fixture-selector-model",
      segmentModel: "fixture-segment-model",
      keyframeMode: "segmented",
      segmentPaddingSec: 5,
      segmentMinFrames: 3,
      segmentMaxFrames: 9,
      segmentMaxCount: 7,
      segmentFrameTotalLimit: 21,
      sourceCuePackets: true,
      recipeEvidenceLedger: false,
      recipeEvidenceLedgerPrompt: true,
      refreshFinal: true,
    });

    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-keyframes-segmented");
    writeJson(path.join(caseDir, "source.json"), {
      video: {
        videoId: "case-keyframes-segmented",
        title: "맥적구이",
        description: "돼지고기 1팩",
        url: "https://www.youtube.com/watch?v=case-keyframes-segmented",
      },
      captions: { available: false, segments: [] },
      authorComments: { comments: [] },
    });
    writeFileSync(path.join(caseDir, "golden.json"), "{ this would fail if read", "utf8");

    const result = await runExtraction(
      {
        split: "train",
        ids: "case-keyframes-segmented",
        "out-tag": "segmented-keyframes-test",
        provider: "codex-vision-keyframes",
        "keyframe-mode": "segmented",
      },
      {
        projectRoot: workdir,
        llm: {
          generate: async () => ({
            cached: false,
            model: "fixture-final-model",
            provider: "codex-vision-keyframes",
            meta: { provider: "codex-vision-keyframes", keyframeMode: "segmented", selectedFrameCount: 2 },
            json: {
              recipes: [
                {
                  title: "맥적구이",
                  ingredients: [{ name: "돼지고기", amount: "1", unit: "팩" }],
                  steps: ["돼지고기에 된장 양념을 바른다."],
                },
              ],
            },
          }),
        },
      },
    );

    expect(result.failures).toBe(0);
    const output = JSON.parse(readFileSync(path.join(caseDir, "runs/segmented-keyframes-test/result.json"), "utf8"));
    expect(output.meta).toMatchObject({ provider: "codex-vision-keyframes", keyframeMode: "segmented" });
    expect(output.recipes[0].title).toBe("맥적구이");
  });

  it("selects url-only-gpt without injecting local source text or reading golden.json", async () => {
    const { createLlmForProvider, runExtraction } = await import(runExtractionModuleUrl);
    const selected = createLlmForProvider("url-only-gpt", {
      model: "fixture-url-model",
      "codex-effort": "low",
      "timeout-ms": "1234",
      "refresh-final": true,
      "no-cache": true,
    }, {
      createUrlOnlyGpt: (options: Record<string, unknown>) => ({ options }),
    });
    expect(selected.options).toMatchObject({
      model: "fixture-url-model",
      codexEffort: "low",
      timeoutMs: 1234,
      refreshFinal: true,
      noCache: true,
    });

    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-url-only");
    writeJson(path.join(caseDir, "source.json"), {
      video: {
        videoId: "case-url-only",
        title: "SHOULD_NOT_APPEAR_TITLE",
        description: "SHOULD_NOT_APPEAR_DESCRIPTION",
        url: "https://www.youtube.com/watch?v=case-url-only",
      },
      captions: {
        available: true,
        segments: [{ text: "SHOULD_NOT_APPEAR_CAPTION", startMs: 1000 }],
      },
      authorComments: { comments: [{ text: "SHOULD_NOT_APPEAR_COMMENT" }] },
    });
    writeFileSync(path.join(caseDir, "golden.json"), "{ this would fail if read", "utf8");

    const generateCalls: Array<Record<string, string | null>> = [];
    const result = await runExtraction(
      {
        split: "train",
        ids: "case-url-only",
        "out-tag": "url-only-test",
        provider: "url-only-gpt",
      },
      {
        projectRoot: workdir,
        factories: {
          createUrlOnlyGpt: () => ({
            generate: async ({ prompt, videoUrl, cacheText }: Record<string, string>) => {
              generateCalls.push({ prompt, videoUrl, cacheText });
              return {
                cached: false,
                model: "fixture-url-model",
                provider: "url-only-gpt",
                meta: { provider: "url-only-gpt", sourceMode: "url-only" },
                json: {
                  recipes: [
                    {
                      title: "URL 직접 추출",
                      ingredients: [{ name: "김", amount: "1", unit: "장" }],
                      steps: ["김을 펼친다."],
                    },
                  ],
                },
              };
            },
          }),
        },
      },
    );

    expect(result.failures).toBe(0);
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0].videoUrl).toBe("https://www.youtube.com/watch?v=case-url-only");
    expect(generateCalls[0].cacheText).toBe("url-only:https://www.youtube.com/watch?v=case-url-only");
    expect(generateCalls[0].prompt).toContain("대상 링크: https://www.youtube.com/watch?v=case-url-only");
    expect(generateCalls[0].prompt).not.toContain("SHOULD_NOT_APPEAR");
    expect(existsSync(path.join(caseDir, "runs/url-only-test/evidence-packets.json"))).toBe(false);
    expect(existsSync(path.join(caseDir, "runs/url-only-test/cue-extraction-report.json"))).toBe(false);

    const output = JSON.parse(readFileSync(path.join(caseDir, "runs/url-only-test/result.json"), "utf8"));
    expect(output.meta).toMatchObject({
      provider: "url-only-gpt",
      promptVersion: "url-only-gpt-direct-v1",
      sourceMode: "url-only",
    });
    expect(output.recipes[0].title).toBe("URL 직접 추출");
  });

  it("writes url-only-gpt prompt, raw response, cache, and failure artifacts", async () => {
    const { createUrlOnlyGptClient } = await import(urlOnlyGptModuleUrl);
    const cacheDir = path.join(workdir, "url-only-cache");
    const client = createUrlOnlyGptClient({
      cacheDir,
      model: "fixture-url-model",
      codexExec: async ({ outputPath, logPath }: Record<string, string>) => {
        writeFileSync(logPath, "fixture log", "utf8");
        writeFileSync(outputPath, "will be overwritten by client return", "utf8");
        return "```json\n{\"recipes\":[{\"title\":\"후토마끼\",\"ingredients\":[{\"name\":\"김\",\"amount\":\"1\",\"unit\":\"장\"}],\"steps\":[\"김을 펼친다.\"]}]}\n```";
      },
    });

    const first = await client.generate({
      prompt: "대상 링크: https://www.youtube.com/watch?v=case-url-only",
      videoUrl: "https://www.youtube.com/watch?v=case-url-only",
      cacheText: "url-only:https://www.youtube.com/watch?v=case-url-only",
    });

    expect(first.cached).toBe(false);
    expect(first.provider).toBe("url-only-gpt");
    expect(first.meta.urlOnlyGptCacheDir).toContain(cacheDir);
    expect(first.json.recipes[0].title).toBe("후토마끼");
    expect(existsSync(path.join(first.meta.urlOnlyGptCacheDir, "final.prompt.md"))).toBe(true);
    expect(existsSync(path.join(first.meta.urlOnlyGptCacheDir, "final.raw.md"))).toBe(true);
    expect(existsSync(path.join(first.meta.urlOnlyGptCacheDir, "final.log"))).toBe(true);
    expect(existsSync(path.join(first.meta.urlOnlyGptCacheDir, "final.json"))).toBe(true);
    expect(existsSync(path.join(first.meta.urlOnlyGptCacheDir, "run_meta.json"))).toBe(true);

    const second = await client.generate({
      prompt: "대상 링크: https://www.youtube.com/watch?v=case-url-only",
      videoUrl: "https://www.youtube.com/watch?v=case-url-only",
      cacheText: "url-only:https://www.youtube.com/watch?v=case-url-only",
    });
    expect(second.cached).toBe(true);

    const failingClient = createUrlOnlyGptClient({
      cacheDir: path.join(workdir, "url-only-cache-fail"),
      model: "fixture-url-model",
      codexExec: async () => {
        throw new Error("fixture direct extraction failed");
      },
    });

    await expect(failingClient.generate({
      prompt: "대상 링크: https://www.youtube.com/watch?v=case-fail",
      videoUrl: "https://www.youtube.com/watch?v=case-fail",
      cacheText: "url-only:https://www.youtube.com/watch?v=case-fail",
    })).rejects.toThrow("fixture direct extraction failed");
    const failureFiles = readdirSync(path.join(workdir, "url-only-cache-fail"), { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith("failure.json"));
    expect(failureFiles).toHaveLength(1);
  });

  it("uses codex-vision-keyframes as the default GPT 5.4 extraction path", async () => {
    const { runExtraction } = await import(runExtractionModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-default-keyframes");
    writeJson(path.join(caseDir, "source.json"), {
      video: {
        videoId: "case-default-keyframes",
        title: "된장찌개",
        description: "된장 1큰술",
        url: "https://www.youtube.com/watch?v=case-default-keyframes",
      },
      captions: { available: false, segments: [] },
      authorComments: { comments: [] },
    });

    const keyframeFactoryCalls: Array<Record<string, unknown>> = [];
    const result = await runExtraction(
      { split: "train", ids: "case-default-keyframes", "out-tag": "keyframes-default-test" },
      {
        projectRoot: workdir,
        factories: {
          createCodexVisionKeyframes: (options: Record<string, unknown>) => {
            keyframeFactoryCalls.push(options);
            return {
              generate: async () => ({
                cached: false,
                model: "gpt-5.4",
                provider: "codex-vision-keyframes",
                meta: { provider: "codex-vision-keyframes" },
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
    expect(keyframeFactoryCalls).toHaveLength(1);
    const output = JSON.parse(readFileSync(path.join(caseDir, "runs/keyframes-default-test/result.json"), "utf8"));
    expect(output.meta.provider).toBe("codex-vision-keyframes");
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
