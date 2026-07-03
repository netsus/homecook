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
const publicSourceGptModuleUrl = pathToFileURL(
  path.join(repoRoot, "scripts/recipe-loop/lib/public-source-gpt-client.mjs"),
).href;
const publicSourceCollectorModuleUrl = pathToFileURL(
  path.join(repoRoot, "scripts/recipe-loop/lib/public-source-collector.mjs"),
).href;
const publicSourceVisualAssistModuleUrl = pathToFileURL(
  path.join(repoRoot, "scripts/recipe-loop/lib/public-source-visual-assist.mjs"),
).href;
const publicSourcePacketsModuleUrl = pathToFileURL(
  path.join(repoRoot, "lib/server/recipe-extraction-lab/public-source-packets.mjs"),
).href;
const promptModuleUrl = pathToFileURL(
  path.join(repoRoot, "lib/server/recipe-extraction-lab/prompt.mjs"),
).href;
const extractionLabModuleUrl = pathToFileURL(
  path.join(repoRoot, "lib/server/recipe-extraction-lab/extract.mjs"),
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
        "- 매운 고춧가루와 육수, 마늘 향채를 넣고 끓인다.",
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

    expect(packetPlan.version).toBe("source-cue-packet-v5");
    expect(packetPlan.packets).toHaveLength(1);
    const packet = packetPlan.packets[0];
    expect(packet.localSourceSnippets.length).toBeLessThanOrEqual(4);
    expect(packet.cookingCueSnippets.length).toBeLessThanOrEqual(5);
    expect(packet.localSourceSnippets.map((entry: { text: string }) => entry.text).join(" ")).toContain("양념 소스");
    expect(packet.cookingCueSnippets.map((entry: { text: string }) => entry.text).join(" ")).toContain("볶");
    expect(packet.cookingCueSnippets.map((entry: { text: string }) => entry.text).join(" ")).toContain("고춧가루");
    const allCueText = JSON.stringify(packet);
    expect(allCueText).not.toContain("구매처");
    expect(allCueText).not.toContain("쿠폰");
    expect(allCueText).not.toContain("BGM");
    for (const entry of [...packet.localSourceSnippets, ...packet.cookingCueSnippets]) {
      expect(entry.text.length).toBeLessThanOrEqual(160);
    }
  });

  it("does not pull neighboring recipe candidate hints into local source snippets", async () => {
    const { buildSourceCuePacketsFromSourceText } = await import(codexVisionKeyframesModuleUrl);

    const packetPlan = buildSourceCuePacketsFromSourceText(
      [
        "[SOURCE: recipe_candidate_hints]",
        "1. 맥적",
        "2. 열무 들기름냉파스타",
        "3. 열무묵국",
        "[SOURCE: description]",
        "04:55 맥적&열무 들기름냉파스타",
      ].join("\n"),
      {
        recipeCandidates: [{
          candidateId: "cand-01",
          titleHint: "맥적",
          sourceEvidence: [{ source: "recipe_candidate_hints", text: "맥적" }],
        }],
      },
      {
        segments: [{
          segmentId: "seg-01",
          candidateId: "cand-01",
          titleHint: "맥적",
          startSec: 295,
          endSec: 360,
          textEvidence: ["04:55 맥적&열무 들기름냉파스타"],
        }],
      },
    );

    const recipeHintLocalText = packetPlan.packets[0].localSourceSnippets
      .filter((entry: { source: string }) => entry.source === "recipe_candidate_hints")
      .map((entry: { text: string }) => entry.text)
      .join("\n");
    expect(recipeHintLocalText).toContain("맥적");
    expect(recipeHintLocalText).not.toContain("열무 들기름냉파스타");
    expect(recipeHintLocalText).not.toContain("열무묵국");
  });

  it("bridges structured evidence packet cues into keyframe source cue packets", async () => {
    const { buildSourceCuePacketsFromSourceText } = await import(codexVisionKeyframesModuleUrl);

    const packetPlan = buildSourceCuePacketsFromSourceText(
      [
        "[SOURCE: recipe_candidate_hints]",
        "1. 후보 요리",
        "[SOURCE: description]",
        "00:05 후보 요리",
        "기존 설명 단서 1",
        "기존 설명 단서 2",
        "기존 설명 단서 3",
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
      {
        evidencePacketBundle: {
          packets: [{
            candidateId: "recipe-01",
            titleHint: "후보 요리",
            aliases: ["후보요리"],
            ingredientCues: [{
              text: "액젓",
              refs: [{ source: "transcript", startMs: 53400, text: "액젓을 넣는다." }],
            }],
            amountCues: [{
              kind: "time",
              text: "중약불로",
              refs: [{ source: "transcript", startMs: 62000, text: "중약불로" }],
            }],
            stepCues: [{
              text: "들기름에 버무린다",
              refs: [{ source: "transcript", startMs: 60000, text: "들기름에 버무린다." }],
            }],
            visualFrameCues: [],
          }],
        },
      },
    );

    expect(packetPlan.evidencePacketSourceCueBridgeVersion).toBe("evidence-packet-source-cue-bridge-v6");
    expect(packetPlan.evidencePacketBridgeMatchedCount).toBe(1);
    expect(packetPlan.evidencePacketBridgeCount).toBe(1);
    expect(packetPlan.evidencePacketBridgeSkippedCount).toBe(0);
    const packet = packetPlan.packets[0];
    expect(packet.evidencePacketBridge).toMatchObject({
      sourceCandidateId: "recipe-01",
      titleHint: "후보 요리",
      skipped: false,
    });
    expect(packet.localSourceSnippets.map((entry: { text: string }) => entry.text).join("\n")).toContain("ingredient/source: 액젓");
    expect(packet.localSourceSnippets.map((entry: { text: string }) => entry.text).join("\n")).not.toContain("amount/source: 중약불로");
    expect(packet.cookingCueSnippets.map((entry: { text: string }) => entry.text).join("\n")).toContain("step/source: 들기름에 버무린다");
  });

  it("skips bundled evidence packet cues when they do not anchor to the child candidate", async () => {
    const { buildSourceCuePacketsFromSourceText } = await import(codexVisionKeyframesModuleUrl);

    const packetPlan = buildSourceCuePacketsFromSourceText(
      [
        "[SOURCE: recipe_candidate_hints]",
        "1. 맥적",
        "2. 열무 들기름냉파스타",
        "[SOURCE: description]",
        "04:55 맥적&열무 들기름냉파스타",
      ].join("\n"),
      {
        recipeCandidates: [
          {
            candidateId: "cand-01",
            titleHint: "맥적",
            sourceEvidence: [{ source: "recipe_candidate_hints", text: "맥적" }],
          },
          {
            candidateId: "cand-02",
            titleHint: "열무 들기름냉파스타",
            sourceEvidence: [{ source: "recipe_candidate_hints", text: "열무 들기름냉파스타" }],
          },
        ],
      },
      {
        segments: [
          { segmentId: "seg-01", candidateId: "cand-01", titleHint: "맥적", startSec: 295, endSec: 460, textEvidence: [] },
          { segmentId: "seg-02", candidateId: "cand-02", titleHint: "열무 들기름냉파스타", startSec: 295, endSec: 460, textEvidence: [] },
        ],
      },
      {
        evidencePacketBundle: {
          packets: [
            {
              candidateId: "recipe-01",
              titleHint: "맥적구이",
              aliases: ["맥적", "맥적&열무 들기름냉파스타"],
              ingredientCues: [
                { text: "열무", refs: [{ source: "description", startMs: 295000, text: "04:55 맥적&열무 들기름냉파스타" }] },
                { text: "들기름", refs: [{ source: "transcript", startMs: 329000, text: "할머니 들기름" }] },
              ],
              amountCues: [],
              stepCues: [{ text: "소금 넣고", refs: [{ source: "transcript", startMs: 377000, text: "소금 넣고" }] }],
              visualFrameCues: [],
            },
            {
              candidateId: "recipe-02",
              titleHint: "열무 들기름 냉파스타",
              aliases: ["열무 들기름냉파스타", "맥적&열무 들기름냉파스타"],
              ingredientCues: [
                { text: "열무", refs: [{ source: "description", startMs: 295000, text: "04:55 맥적&열무 들기름냉파스타" }] },
                { text: "들기름", refs: [{ source: "transcript", startMs: 329000, text: "할머니 들기름" }] },
              ],
              amountCues: [],
              stepCues: [{ text: "소금 넣고", refs: [{ source: "transcript", startMs: 377000, text: "소금 넣고" }] }],
              visualFrameCues: [],
            },
          ],
        },
      },
    );

    expect(packetPlan.evidencePacketSourceCueBridgeVersion).toBe("evidence-packet-source-cue-bridge-v6");
    expect(packetPlan.evidencePacketBridgeMatchedCount).toBe(2);
    expect(packetPlan.evidencePacketBridgeCount).toBe(1);
    expect(packetPlan.evidencePacketBridgeSkippedCount).toBe(1);

    const macjeokPacket = packetPlan.packets.find((packet: { candidateId: string }) => packet.candidateId === "cand-01");
    const pastaPacket = packetPlan.packets.find((packet: { candidateId: string }) => packet.candidateId === "cand-02");
    expect(macjeokPacket.evidencePacketBridge).toMatchObject({
      skipped: true,
      reason: "no_candidate_specific_cue",
    });
    expect(JSON.stringify(macjeokPacket.localSourceSnippets)).not.toContain("ingredient/source: 열무");
    expect(JSON.stringify(macjeokPacket.localSourceSnippets)).not.toContain("ingredient/source: 들기름");
    expect(pastaPacket.evidencePacketBridge).toMatchObject({
      skipped: false,
      sourceCandidateId: "recipe-02",
    });
    expect(JSON.stringify(pastaPacket.localSourceSnippets)).toContain("ingredient/source: 열무");
    expect(JSON.stringify(pastaPacket.localSourceSnippets)).toContain("ingredient/source: 들기름");
  });

  it("keeps title, core seasoning, and garnish evidence cues ahead of generic local cues", async () => {
    const { buildSourceCuePacketsFromSourceText } = await import(codexVisionKeyframesModuleUrl);

    const packetPlan = buildSourceCuePacketsFromSourceText(
      [
        "[SOURCE: recipe_candidate_hints]",
        "1. 열무 들기름냉파스타",
        "[SOURCE: description]",
        "04:55 맥적&열무 들기름냉파스타",
      ].join("\n"),
      {
        recipeCandidates: [{
          candidateId: "cand-01",
          titleHint: "열무 들기름냉파스타",
          sourceEvidence: [{ source: "recipe_candidate_hints", text: "열무 들기름냉파스타" }],
        }],
      },
      {
        segments: [{
          segmentId: "seg-01",
          candidateId: "cand-01",
          titleHint: "열무 들기름냉파스타",
          startSec: 295,
          endSec: 460,
          textEvidence: ["04:55 맥적&열무 들기름냉파스타"],
        }],
      },
      {
        evidencePacketBundle: {
          packets: [{
            candidateId: "recipe-01",
            titleHint: "열무 들기름 냉파스타",
            aliases: ["열무 들기름냉파스타", "맥적&열무 들기름냉파스타"],
            ingredientCues: [
              { text: "열무", refs: [{ source: "description", startMs: 295000, text: "04:55 맥적&열무 들기름냉파스타" }] },
              { text: "들기름", refs: [{ source: "transcript", startMs: 329319, text: "할머니 들기름" }] },
              { text: "액젓", refs: [{ source: "transcript", startMs: 334360, text: "액젓은 들기를" }] },
              { text: "미나리", refs: [{ source: "transcript", startMs: 350319, text: "자 미나리 붙일 거를 일단은 는" }] },
              { text: "소금", refs: [{ source: "transcript", startMs: 377520, text: "소금 넣고" }] },
            ],
            amountCues: [],
            stepCues: [],
            visualFrameCues: [],
          }],
        },
      },
    );

    const packet = packetPlan.packets[0];
    const localText = packet.localSourceSnippets.map((entry: { text: string }) => entry.text).join("\n");
    expect(localText).toContain("ingredient/source: 열무");
    expect(localText).toContain("ingredient/source: 들기름");
    expect(localText).toContain("ingredient/source: 액젓");
    expect(localText).toContain("ingredient/source: 미나리");
    expect(localText).not.toContain("ingredient/source: 소금");
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

    expect(ledger.version).toBe("recipe-evidence-ledger-v3");
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

  it("keeps bracket timestamp negated cooking cues in recipe evidence ledger", async () => {
    const { buildRecipeEvidenceLedger } = await import(codexVisionKeyframesModuleUrl);

    const ledger = buildRecipeEvidenceLedger({
      sourceText: [
        "[SOURCE: transcript(ko)]",
        "[03:04.950] 볶지 않고 찌개 맛이 되는 것 같습니다.",
        "[03:09.720] 돼지고기와 김치를 넣고 끓입니다.",
      ].join("\n"),
      candidatePlan: {
        recipeCandidates: [{
          candidateId: "cand-01",
          titleHint: "돼지고기 김치찌개",
          outputRole: "recipe",
          sourceEvidence: [{ source: "recipe_candidate_hints", text: "돼지고기 김치찌개" }],
        }],
      },
      segmentPlan: {
        segments: [{
          segmentId: "seg-01",
          candidateId: "cand-01",
          titleHint: "돼지고기 김치찌개",
          startSec: 180,
          endSec: 200,
          textEvidence: ["김치찌개 조리 구간"],
        }],
        coverage: [{ candidateId: "cand-01", titleHint: "돼지고기 김치찌개", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] }],
      },
      segmentKeyframes: { segments: [] },
    });

    const recipe = ledger.recipes[0];
    expect(recipe.evidenceItems.map((item: { text: string }) => item.text).join("\n")).toContain("볶지 않고");
    expect(recipe.promptCues[0].text).toContain("볶지 않고");
  });

  it("does not treat dish-name substrings like 떡볶기 as cooking action cues", async () => {
    const { buildRecipeEvidenceLedger } = await import(codexVisionKeyframesModuleUrl);

    const ledger = buildRecipeEvidenceLedger({
      sourceText: [
        "[SOURCE: transcript(ko)]",
        "[00:34.320] 요걸로 떡볶기 만들어 볼게요.",
        "[00:36.000] 후토마끼 재료를 준비합니다.",
      ].join("\n"),
      candidatePlan: {
        recipeCandidates: [{
          candidateId: "cand-01",
          titleHint: "메밀 후토마끼",
          outputRole: "recipe",
          sourceEvidence: [{ source: "recipe_candidate_hints", text: "메밀 후토마끼" }],
        }],
      },
      segmentPlan: {
        segments: [{
          segmentId: "seg-01",
          candidateId: "cand-01",
          titleHint: "메밀 후토마끼",
          startSec: 0,
          endSec: 60,
          textEvidence: ["메밀 후토마끼 구간"],
        }],
        coverage: [{ candidateId: "cand-01", titleHint: "메밀 후토마끼", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] }],
      },
      segmentKeyframes: { segments: [] },
    });

    const allLedgerText = JSON.stringify(ledger);
    expect(allLedgerText).not.toContain("떡볶기 만들어");
    expect(ledger.stats.droppedCueCount).toBeGreaterThan(0);
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

    const withGalbi = buildCandidateHintsFromSourceText([
      "[SOURCE: recipe_candidate_hints]",
      "1. 닭갈비",
      "2. 콘치즈",
    ].join("\n"));
    expect(withGalbi.recipeCandidates.map((candidate: { titleHint: string }) => candidate.titleHint)).toEqual([
      "닭갈비",
      "콘치즈",
    ]);

    const withShortDishBundle = buildCandidateHintsFromSourceText([
      "[SOURCE: description]",
      "04:55 맥적&열무 들기름냉파스타",
    ].join("\n"));
    expect(withShortDishBundle.recipeCandidates.map((candidate: { titleHint: string }) => candidate.titleHint)).toEqual([
      "맥적",
      "열무 들기름냉파스타",
    ]);
  });

  it("builds recipe candidate hints from description menu lists for keyframe selection", async () => {
    const { buildRecipeCandidateHints } = await import(promptModuleUrl);
    const hints = buildRecipeCandidateHints({
      video: {
        title: "자취요리 vlog #41 퇴근후 15분만에 만든 간단집밥 4가지",
        description: [
          "퇴근 후 15분만에 만든 자취생의 집밥 요리🤍",
          "",
          "*메뉴*",
          "묵참김밥과 오뎅볶이",
          "파닭꼬치와 오꼬노미야끼",
          "닭갈비와 콘치즈",
          "해장파스타",
        ].join("\n"),
      },
    });

    expect(hints).toEqual([
      "묵참김밥",
      "오뎅볶이",
      "파닭꼬치",
      "오꼬노미야끼",
      "닭갈비",
      "콘치즈",
      "해장파스타",
    ]);
  });

  it("does not append an umbrella title when description timelines already provide candidates", async () => {
    const { buildRecipeCandidateHints } = await import(promptModuleUrl);
    const hints = buildRecipeCandidateHints({
      video: {
        title: "누구나 쉽게 만드는 밥도둑 국민 반찬 10가지",
        description: [
          "0:00 어묵볶음",
          "2:27 진미채볶음",
          "4:16 감자채볶음",
          "5:53 메추리알 장조림",
          "7:01 두부조림",
          "9:20 무생채",
          "10:59 깻잎조림",
          "12:58 마늘쫑볶음",
          "14:48 미역줄기볶음",
          "17:00 잔멸치볶음",
        ].join("\n"),
      },
    });

    expect(hints).toEqual([
      "어묵볶음",
      "진미채볶음",
      "감자채볶음",
      "메추리알 장조림",
      "두부조림",
      "무생채",
      "깻잎조림",
      "마늘쫑볶음",
      "미역줄기볶음",
      "잔멸치볶음",
    ]);
    expect(hints).not.toContain("누구나 쉽게 만드는 밥도둑 국민 반찬 10가지");
  });

  it("keeps emoji-prefixed 생채 timeline candidates in the keyframe candidate plan", async () => {
    const { buildCandidateHintsFromSourceText } = await import(codexVisionKeyframesModuleUrl);

    const candidatePlan = buildCandidateHintsFromSourceText([
      "[SOURCE: recipe_candidate_hints]",
      "1. 🍢 어묵볶음",
      "2. 🦑 진미채볶음",
      "3. 🥔 감자채볶음",
      "4. 🥚 메추리알 장조림",
      "5. 🍽️ 두부조림",
      "6. 🥗 무생채",
      "7. 🌿 깻잎조림",
      "8. 🧄 마늘쫑볶음",
      "9. 🗾 미역줄기볶음",
      "10. 🐟 잔멸치볶음",
      "",
      "[SOURCE: description]",
      "0:00 🍢 어묵볶음",
      "2:27 🦑 진미채볶음",
      "4:16 🥔 감자채볶음",
      "5:53 🥚 메추리알 장조림",
      "7:01 🍽️ 두부조림",
      "9:20 🥗 무생채",
      "10:59 🌿 깻잎조림",
      "12:58 🧄 마늘쫑볶음",
      "14:48 🗾 미역줄기볶음",
      "17:00 🐟 잔멸치볶음",
    ].join("\n"));

    expect(candidatePlan.recipeCandidates.map((candidate: { titleHint: string }) => candidate.titleHint)).toEqual([
      "어묵볶음",
      "진미채볶음",
      "감자채볶음",
      "메추리알 장조림",
      "두부조림",
      "무생채",
      "깻잎조림",
      "마늘쫑볶음",
      "미역줄기볶음",
      "잔멸치볶음",
    ]);
  });

  it("builds a weak ingredient-pair candidate instead of 전체 레시피 for sparse title-only sources", async () => {
    const { buildCandidateHintsFromSourceText } = await import(codexVisionKeyframesModuleUrl);

    const candidatePlan = buildCandidateHintsFromSourceText([
      "[SOURCE: recipe_candidate_hints]",
      "1. 콩나물",
      "2. 어묵을 이렇게 드세요! 아삭쫄깃 영양가득 어묵 요리",
      "",
      "[SOURCE: description]",
      "콩나물 300g",
      "어묵 3장",
      "양파 1/2",
      "대파 1개",
      "간장 2숟",
      "고춧가루 2숟",
    ].join("\n"));

    expect(candidatePlan.recipeCandidates).toHaveLength(1);
    expect(candidatePlan.recipeCandidates[0]).toMatchObject({
      titleHint: "콩나물 어묵 요리",
      candidateStatus: "weak_hint",
      evidenceStrength: "weak_text",
      outputRole: "recipe",
    });
    expect(candidatePlan.recipeCandidates[0].titleHint).not.toBe("전체 레시피");
    expect(candidatePlan.warnings.join("\n")).toContain("핵심 재료쌍");
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

  it("adds description menu rows as bundle parents without hardcoding one video title", async () => {
    const { buildCandidateHintsFromSourceText } = await import(codexVisionKeyframesModuleUrl);

    const candidatePlan = buildCandidateHintsFromSourceText([
      "[SOURCE: recipe_candidate_hints]",
      "1. 묵참김밥",
      "2. 오뎅볶이",
      "3. 파닭꼬치",
      "4. 오꼬노미야끼",
      "5. 닭갈비",
      "6. 콘치즈",
      "7. 해장파스타",
      "[SOURCE: description]",
      "*메뉴*",
      "묵참김밥과 오뎅볶이",
      "파닭꼬치와 오꼬노미야끼",
      "닭갈비와 콘치즈",
      "해장파스타",
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
    const parent = candidates.find((candidate) => candidate.titleHint === "닭갈비와 콘치즈");
    const galbi = candidates.find((candidate) => candidate.titleHint === "닭갈비");
    const corn = candidates.find((candidate) => candidate.titleHint === "콘치즈");

    expect(parent).toMatchObject({
      bundleRole: "parent",
      outputRole: "bundle_parent",
      bundleMemberIds: expect.arrayContaining([galbi?.candidateId, corn?.candidateId]),
    });
    expect(galbi).toMatchObject({ bundleParentId: parent?.candidateId, outputRole: "recipe" });
    expect(corn).toMatchObject({ bundleParentId: parent?.candidateId, outputRole: "recipe" });
    expect(candidates.find((candidate) => candidate.titleHint === "해장파스타")).toMatchObject({
      bundleParentId: null,
      outputRole: "recipe",
    });
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

  it("splits no-timestamp description menu rows into shared parent ranges", async () => {
    const {
      applyDescriptionMenuParentRanges,
      buildCandidateHintsFromSourceText,
      buildDescriptionMenuParentRangePlan,
    } = await import(codexVisionKeyframesModuleUrl);

    const sourceText = [
      "[SOURCE: recipe_candidate_hints]",
      "1. 묵참김밥",
      "2. 오뎅볶이",
      "3. 파닭꼬치",
      "4. 오꼬노미야끼",
      "5. 닭갈비",
      "6. 콘치즈",
      "7. 해장파스타",
      "[SOURCE: description]",
      "*메뉴*",
      "묵참김밥과 오뎅볶이",
      "파닭꼬치와 오꼬노미야끼",
      "닭갈비와 콘치즈",
      "해장파스타",
    ].join("\n");
    const candidatePlan = buildCandidateHintsFromSourceText(sourceText);
    const galbi = candidatePlan.recipeCandidates.find((candidate: { titleHint: string }) => candidate.titleHint === "닭갈비");
    const corn = candidatePlan.recipeCandidates.find((candidate: { titleHint: string }) => candidate.titleHint === "콘치즈");

    const rangePlan = buildDescriptionMenuParentRangePlan({
      sourceText,
      lastKeyframeSec: 541.08,
      candidatePlan,
    });

    expect(rangePlan).toMatchObject({
      rangeSource: "description_menu",
      descriptionMenuParentRangeVersion: "description-menu-parent-range-v1",
      fallbackReason: null,
      lastKeyframeSec: 541.08,
    });
    expect(rangePlan.parentRanges).toHaveLength(4);
    expect(rangePlan.parentRanges[2]).toMatchObject({
      title: "닭갈비와 콘치즈",
      memberIds: expect.arrayContaining([galbi?.candidateId, corn?.candidateId]),
      rangeSource: "description_menu",
    });
    expect(rangePlan.parentRanges[2].startSec).toBeCloseTo(270.54, 2);
    expect(rangePlan.parentRanges[2].endSec).toBeCloseTo(405.81, 2);

    const applied = applyDescriptionMenuParentRanges({
      segments: [
        {
          segmentId: "seg-galbi",
          candidateId: galbi?.candidateId,
          titleHint: "닭갈비",
          startSec: 200,
          endSec: 330,
          frameBudget: 6,
          textEvidence: ["planner guessed a narrow child range"],
        },
        {
          segmentId: "seg-corn",
          candidateId: corn?.candidateId,
          titleHint: "콘치즈",
          startSec: 200,
          endSec: 330,
          frameBudget: 6,
          textEvidence: ["planner guessed a narrow child range"],
        },
      ],
      coverage: [],
      warnings: [],
    }, rangePlan);

    expect(applied).toMatchObject({
      descriptionMenuParentRangeApplied: true,
      descriptionMenuParentRangeAppliedCount: 2,
    });
    expect(applied.segments.map((segment: { candidateId: string; rangeSource: string }) => [
      segment.candidateId,
      segment.rangeSource,
    ])).toEqual(expect.arrayContaining([
      [galbi?.candidateId, "description_menu"],
      [corn?.candidateId, "description_menu"],
    ]));
    for (const segment of applied.segments as Array<{ startSec: number; endSec: number }>) {
      expect(segment.startSec).toBeCloseTo(270.54, 2);
      expect(segment.endSec).toBeCloseTo(405.81, 2);
    }
  });

  it("omits covered bundle parent segments from final synthesis inputs", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 6);
    const finalPrompts: string[] = [];
    const selectorPrompts: string[] = [];
    const finalImageCounts: number[] = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 1,
      segmentFrameTotalLimit: 3,
      sourceCuePackets: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 6 },
      }),
      codexExec: async ({ model, prompt, images, outputPath, logPath }: { model: string; prompt: string; images: string[]; outputPath: string; logPath: string }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [
              {
                segmentId: "seg-parent",
                candidateId: "cand-03",
                titleHint: "묵참김밥과 오뎅볶이",
                startSec: 0,
                endSec: 10,
                textEvidence: ["description menu: 묵참김밥과 오뎅볶이"],
                frameBudget: 1,
              },
              {
                segmentId: "seg-muk",
                candidateId: "cand-01",
                titleHint: "묵참김밥",
                startSec: 20,
                endSec: 30,
                textEvidence: ["묵참김밥"],
                frameBudget: 1,
              },
              {
                segmentId: "seg-oden",
                candidateId: "cand-02",
                titleHint: "오뎅볶이",
                startSec: 40,
                endSec: 50,
                textEvidence: ["오뎅볶이"],
                frameBudget: 1,
              },
            ],
            coverage: [
              { candidateId: "cand-01", titleHint: "묵참김밥", status: "covered", outputRole: "recipe", segmentIds: ["seg-muk"] },
              { candidateId: "cand-02", titleHint: "오뎅볶이", status: "covered", outputRole: "recipe", segmentIds: ["seg-oden"] },
              { candidateId: "cand-03", titleHint: "묵참김밥과 오뎅볶이", status: "supporting", outputRole: "bundle_parent", segmentIds: ["seg-parent"] },
            ],
          });
        } else if (model === "fixture-selector-model") {
          selectorPrompts.push(prompt);
          output = JSON.stringify({
            selectedFrames: [{ file: path.basename(images[0]), reason: "segment 대표 프레임" }],
          });
        } else {
          finalPrompts.push(prompt);
          finalImageCounts.push(images.length);
          expect(prompt).not.toContain("[SEGMENT seg-parent]");
          expect(prompt).not.toContain("sourceCuePacket: cand-03 / 묵참김밥과 오뎅볶이");
          expect(prompt).toContain("[SEGMENT seg-muk]");
          expect(prompt).toContain("[SEGMENT seg-oden]");
          expect(prompt).toContain("cand-03: titleHint=묵참김밥과 오뎅볶이, role=bundle_parent");
          output = "```json\n{\"recipes\":[{\"title\":\"묵참김밥\",\"ingredients\":[{\"name\":\"묵은지\",\"amount\":\"1\",\"unit\":\"장\"}],\"steps\":[\"묵은지를 밥과 만다.\"]},{\"title\":\"오뎅볶이\",\"ingredients\":[{\"name\":\"어묵\",\"amount\":\"1\",\"unit\":\"장\"}],\"steps\":[\"어묵을 볶는다.\"]}]}\n```";
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
        "1. 묵참김밥",
        "2. 오뎅볶이",
        "[SOURCE: description]",
        "*메뉴*",
        "묵참김밥과 오뎅볶이",
      ].join("\n"),
    });

    expect(finalPrompts).toHaveLength(1);
    expect(selectorPrompts.some((prompt) => prompt.includes("titleHint: 묵참김밥") && prompt.includes("bundleParentTitle: 묵참김밥과 오뎅볶이"))).toBe(true);
    expect(selectorPrompts.some((prompt) => prompt.includes("titleHint: 오뎅볶이") && prompt.includes("bundleTargetRule"))).toBe(true);
    expect(selectorPrompts.join("\n")).toContain("shared segment rule");
    expect(selectorPrompts.join("\n")).toContain("sibling contamination guard");
    expect(finalImageCounts).toEqual([1]);
    expect(result.meta).toMatchObject({
      finalInputPolicyVersion: "final-input-policy-v1",
      finalPromptSegmentCount: 2,
      finalOmittedSegmentCount: 1,
      finalOmittedSegmentIds: ["seg-parent"],
      segmentSelectedFrameCount: 2,
      totalSegmentSelectedFrameCount: 3,
    });
    const finalInput = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "final-input-segment-keyframes.json"), "utf8"));
    expect(finalInput.segments.map((segment: { segmentId: string }) => segment.segmentId)).toEqual(["seg-muk", "seg-oden"]);
    const selectedFrames = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "selected_frames.json"), "utf8"));
    expect(selectedFrames.selectedFrames.map((frame: { segmentId: string }) => frame.segmentId)).toEqual(["seg-muk", "seg-oden"]);
    const allSegments = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "segment-keyframes.json"), "utf8"));
    expect(allSegments.segments.map((segment: { segmentId: string }) => segment.segmentId)).toEqual(["seg-parent", "seg-muk", "seg-oden"]);
  });

  it("remaps stale segment candidate ids by title before normalizing coverage", async () => {
    const { normalizeSegmentPlan } = await import(codexVisionKeyframesModuleUrl);

    const normalized = normalizeSegmentPlan({
      segments: [
        { segmentId: "seg-01", candidateId: "cand-02", titleHint: "무생채", startSec: 0, endSec: 10, frameBudget: 3 },
        { segmentId: "seg-02", candidateId: "cand-03", titleHint: "깻잎조림", startSec: 10, endSec: 20, frameBudget: 3 },
        { segmentId: "seg-03", candidateId: "cand-10", titleHint: "잔멸치볶음", startSec: 20, endSec: 30, frameBudget: 3 },
      ],
      coverage: [
        { candidateId: "cand-02", status: "covered", segmentIds: ["seg-01"] },
        { candidateId: "cand-03", status: "covered", segmentIds: ["seg-02"] },
        { candidateId: "cand-10", status: "covered", segmentIds: ["seg-03"] },
      ],
    }, {
      maxCount: 12,
      maxFrameSec: 30,
      totalFrameLimit: 12,
      perSegmentMaxFrames: 6,
      overlapToleranceSec: 0,
      candidatePlan: {
        recipeCandidates: [
          { candidateId: "cand-01", titleHint: "무생채", candidateStatus: "confirmed_hint", evidenceStrength: "title+timeline" },
          { candidateId: "cand-02", titleHint: "깻잎조림", candidateStatus: "confirmed_hint", evidenceStrength: "title+timeline" },
          { candidateId: "cand-03", titleHint: "잔멸치볶음", candidateStatus: "confirmed_hint", evidenceStrength: "title+timeline" },
        ],
      },
    });

    expect(normalized.segments.map((segment: { candidateId: string }) => segment.candidateId)).toEqual([
      "cand-01",
      "cand-02",
      "cand-03",
    ]);
    expect(normalized.coverage.map((coverage: { candidateId: string; segmentIds: string[] }) => [
      coverage.candidateId,
      coverage.segmentIds,
    ])).toEqual([
      ["cand-01", ["seg-01"]],
      ["cand-02", ["seg-02"]],
      ["cand-03", ["seg-03"]],
    ]);
    expect(normalized.warnings.join("\n")).toContain("titleHint");
  });

  it("ignores coverage-shaped rows accidentally mixed into segments", async () => {
    const { normalizeSegmentPlan } = await import(codexVisionKeyframesModuleUrl);

    const normalized = normalizeSegmentPlan({
      segments: [
        { segmentId: "seg-01", candidateId: "cand-01", titleHint: "두부볶음", startSec: 8.2, endSec: 104.67, frameBudget: 14 },
        { segmentId: "seg-02", candidateId: "cand-01", titleHint: "두부볶음", startSec: 105.96, endSec: 203.64, frameBudget: 24 },
        { segmentId: "seg-03", candidateId: "cand-01", titleHint: "두부볶음", startSec: 203.64, endSec: 288.03, frameBudget: 18 },
        { candidateId: "cand-01", titleHint: "두부볶음", status: "covered", segmentIds: ["seg-01", "seg-02", "seg-03"], dropReason: null },
      ],
      coverage: [
        { candidateId: "cand-01", titleHint: "두부볶음", status: "covered", segmentIds: ["seg-01", "seg-02", "seg-03"], dropReason: null },
      ],
    }, {
      maxCount: 12,
      maxFrameSec: 288.03,
      totalFrameLimit: 56,
      perSegmentMaxFrames: 24,
      overlapToleranceSec: 0,
      candidatePlan: {
        recipeCandidates: [
          {
            candidateId: "cand-01",
            titleHint: "두부볶음",
            candidateStatus: "confirmed_hint",
            evidenceStrength: "title_only",
            outputRole: "recipe",
          },
        ],
      },
    });

    expect(normalized.segments.map((segment: { segmentId: string }) => segment.segmentId)).toEqual([
      "seg-01",
      "seg-02",
      "seg-03",
    ]);
    expect(normalized.coverage).toHaveLength(1);
    expect(normalized.warnings.join("\n")).toContain("coverage 형태의 행이 segments에 섞여 있어 제외했습니다");
  });

  it("falls back to a full-video segment when the planner drops the only weak candidate", async () => {
    const { normalizeSegmentPlan } = await import(codexVisionKeyframesModuleUrl);

    const normalized = normalizeSegmentPlan({
      segments: [],
      coverage: [
        {
          candidateId: "cand-01",
          titleHint: "전체 레시피",
          status: "dropped",
          segmentIds: [],
          dropReason: "source text와 frame evidence가 약함",
        },
      ],
      warnings: ["source text와 transcript가 불일치하여 해당 candidate를 우선 구간으로 삼지 않았습니다."],
    }, {
      maxCount: 12,
      maxFrameSec: 41.5,
      totalFrameLimit: 56,
      perSegmentMaxFrames: 24,
      overlapToleranceSec: 0,
      candidatePlan: {
        recipeCandidates: [
          {
            candidateId: "cand-01",
            titleHint: "전체 레시피",
            candidateStatus: "weak_hint",
            evidenceStrength: "weak_text",
            outputRole: "recipe",
          },
        ],
      },
    });

    expect(normalized.segments).toMatchObject([
      {
        segmentId: "seg-01",
        candidateId: "cand-01",
        titleHint: "전체 레시피",
        startSec: 0,
        endSec: 41.5,
      },
    ]);
    expect(normalized.coverage).toMatchObject([
      { candidateId: "cand-01", status: "covered", segmentIds: ["seg-01"] },
    ]);
    expect(normalized.warnings.join("\n")).toContain("전체 영상 fallback segment");
  });

  it("raises frame budget for a single weak text segment", async () => {
    const { normalizeSegmentPlan } = await import(codexVisionKeyframesModuleUrl);

    const normalized = normalizeSegmentPlan({
      segments: [
        { segmentId: "seg-01", candidateId: "cand-01", titleHint: "콩나물 어묵 요리", startSec: 0, endSec: 230, frameBudget: 8 },
      ],
      coverage: [
        { candidateId: "cand-01", status: "covered", segmentIds: ["seg-01"] },
      ],
    }, {
      maxCount: 12,
      maxFrameSec: 230,
      totalFrameLimit: 56,
      perSegmentMaxFrames: 24,
      overlapToleranceSec: 0,
      candidatePlan: {
        recipeCandidates: [
          {
            candidateId: "cand-01",
            titleHint: "콩나물 어묵 요리",
            candidateStatus: "weak_hint",
            evidenceStrength: "weak_text",
            outputRole: "recipe",
          },
        ],
      },
    });

    expect(normalized.segments[0].frameBudget).toBe(12);
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
          expect(prompt).toContain("규칙:");
          expect(prompt).toContain("JSON만 출력");
          expect(prompt).toContain("legacy Evidence packets removed");
          expect(prompt).not.toContain("Evidence packets:");
          expect(prompt).not.toContain("stale packet should not reach segmented final");
          expect(prompt).not.toContain("sourceBackedCues");
          output = "```json\n{\"recipes\":[{\"title\":\"메밀 후토마끼\",\"ingredients\":[{\"name\":\"오이\",\"amount\":\"1\",\"unit\":\"개\"}],\"steps\":[\"오이를 채 썰어 준비한다.\"]},{\"title\":\"맥적구이\",\"ingredients\":[{\"name\":\"돼지고기\",\"amount\":\"1\",\"unit\":\"팩\"}],\"steps\":[\"돼지고기에 된장 양념을 바른다.\"]}]}\n```";
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: [
        "너는 유튜브 요리 영상에서 레시피를 추출하는 전문가다.",
        "",
        "Evidence packets:",
        "- candidateId: stale packet should not reach segmented final",
        "",
        "EvidencePacket 사용 규칙:",
        "- stale packet rules should be removed in segmented final",
        "",
        "규칙:",
        "1. 기존 일반 출력 규칙은 유지한다.",
        "",
        "JSON만 출력",
      ].join("\n"),
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
    expect(calls[1].prompt).not.toContain("candidate source cue packet:");
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

  it("reuses compatible segment plans when only the total frame budget changed", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 3);
    const cacheDir = path.join(workdir, "keyframes-cache");
    let segmentPlannerCalls = 0;
    let selectorCalls = 0;
    let finalCalls = 0;

    const makeClient = (segmentFrameTotalLimit: number) => createCodexVisionKeyframesClient({
      cacheDir,
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 3,
      segmentFrameTotalLimit,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 3 },
      }),
      codexExec: async ({ model, outputPath, logPath }: { model: string; outputPath: string; logPath: string }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          segmentPlannerCalls += 1;
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "김치찌개",
              startSec: 0,
              endSec: 20,
              frameBudget: 1,
            }],
            coverage: [{ candidateId: "cand-01", titleHint: "김치찌개", status: "covered", segmentIds: ["seg-01"] }],
          });
        } else if (model === "fixture-selector-model") {
          selectorCalls += 1;
          output = JSON.stringify({ selectedFrames: [{ file: path.basename(frames[0].path), reason: "대표 프레임" }] });
        } else {
          finalCalls += 1;
          output = "```json\n{\"recipes\":[{\"title\":\"김치찌개\",\"ingredients\":[{\"name\":\"김치\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"김치를 넣고 끓인다.\"]}]}\n```";
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const input = {
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 김치찌개",
        "[SOURCE: description]",
        "00:00 김치찌개",
      ].join("\n"),
    };

    const first = await makeClient(2).generate(input);
    const second = await makeClient(4).generate(input);

    expect(first.meta.segmentPlanCacheReused).toBe(false);
    expect(second.meta.segmentPlanCacheReused).toBe(true);
    expect(second.meta.segmentPlanCacheReuseMode).toBe("compatible-prompt");
    expect(second.meta.segmentPlanCacheReuseVersion).toBe("segment-plan-compatible-reuse-v1");
    expect(second.meta.segmentPlanCacheReuseFrameBudgetTotal).toBe(2);
    expect(segmentPlannerCalls).toBe(1);
    expect(selectorCalls).toBe(2);
    expect(finalCalls).toBe(2);

    const secondSegmentPlan = JSON.parse(readFileSync(path.join(second.meta.codexVisionKeyframesCacheDir, "segment-plan.json"), "utf8"));
    expect(secondSegmentPlan.warnings).toContainEqual(expect.stringContaining("segment plan reused from compatible cache"));
  });

  it("selects all segment candidate frames without a model call when they fit the frame budget", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 2);
    let selectorCalls = 0;
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      segmentFrameTotalLimit: 2,
      segmentSelectorAutoSelect: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 2 },
      }),
      codexExec: async ({ model, outputPath, logPath }: { model: string; outputPath: string; logPath: string }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "김치찌개",
              startSec: 0,
              endSec: 10,
              frameBudget: 2,
            }],
            coverage: [{ candidateId: "cand-01", titleHint: "김치찌개", status: "covered", segmentIds: ["seg-01"] }],
          });
        } else if (model === "fixture-selector-model") {
          selectorCalls += 1;
          output = JSON.stringify({ selectedFrames: [{ file: path.basename(frames[0].path), reason: "should not be used" }] });
        } else {
          output = "```json\n{\"recipes\":[{\"title\":\"김치찌개\",\"ingredients\":[{\"name\":\"김치\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"김치를 넣고 끓인다.\"]}]}\n```";
        }
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

    expect(selectorCalls).toBe(0);
    expect(result.meta.segmentSelectorDeterministicSelectionCount).toBe(1);
    expect(result.meta.segmentSelectorDeterministicSelections[0]).toMatchObject({
      segmentId: "seg-01",
      candidateFrameCount: 2,
      frameBudget: 2,
    });
  });

  it("lets the segmented selector inspect more candidate frames than the final frame budget", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 8);
    const selectorImageCounts: number[] = [];
    const finalImageCounts: number[] = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      segmentSelectorCandidateLimit: 6,
      segmentFrameTotalLimit: 2,
      segmentSelectorAutoSelect: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 8 },
      }),
      codexExec: async ({ model, images, outputPath, logPath }: { model: string; images: string[]; outputPath: string; logPath: string }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "솥밥",
              startSec: 0,
              endSec: 70,
              frameBudget: 2,
            }],
            coverage: [{ candidateId: "cand-01", titleHint: "솥밥", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] }],
          });
        } else if (model === "fixture-selector-model") {
          selectorImageCounts.push(images.length);
          output = JSON.stringify({
            selectedFrames: [
              { file: path.basename(images[0]), reason: "초반 재료 준비" },
              { file: path.basename(images[images.length - 1]), reason: "후반 조리 전환" },
            ],
          });
        } else {
          finalImageCounts.push(images.length);
          output = "```json\n{\"recipes\":[{\"title\":\"솥밥\",\"ingredients\":[{\"name\":\"쌀\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"쌀을 씻고 솥밥을 짓는다.\"]}]}\n```";
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "[SOURCE: recipe_candidate_hints]\n1. 솥밥",
    });

    expect(selectorImageCounts).toEqual([6]);
    expect(finalImageCounts).toEqual([2]);
    expect(result.meta).toMatchObject({
      segmentSelectorCandidateLimit: 6,
      segmentSelectorDeterministicSelectionCount: 0,
      selectedFrameCount: 2,
    });
    const segmentKeyframes = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "segment-keyframes.json"), "utf8"));
    expect(segmentKeyframes.segments[0]).toMatchObject({
      candidateFrameCountBeforeLimit: 8,
      candidateFrameLimit: 6,
      candidateFrameCount: 6,
      selectedFrameCount: 2,
    });
  });

  it("recovers segmented final JSON from final.raw.md without another final model call", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 2);
    const cacheDir = path.join(workdir, "keyframes-cache");
    let finalCalls = 0;

    const input = {
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "[SOURCE: recipe_candidate_hints]\n1. 김치찌개",
    };

    const makeClient = (failIfFinalCalled = false) => createCodexVisionKeyframesClient({
      cacheDir,
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      segmentFrameTotalLimit: 2,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 2 },
      }),
      codexExec: async ({ model, outputPath, logPath }: { model: string; outputPath: string; logPath: string }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "김치찌개",
              startSec: 0,
              endSec: 10,
              frameBudget: 1,
            }],
            coverage: [{ candidateId: "cand-01", titleHint: "김치찌개", status: "covered", segmentIds: ["seg-01"] }],
          });
        } else if (model === "fixture-selector-model") {
          output = JSON.stringify({ selectedFrames: [{ file: path.basename(frames[0].path), reason: "대표 프레임" }] });
        } else {
          if (failIfFinalCalled) throw new Error("final model should not be called when final.raw.md is recoverable");
          finalCalls += 1;
          output = "```json\n{\"recipes\":[{\"title\":\"김치찌개\",\"ingredients\":[{\"name\":\"김치\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"김치를 넣고 끓인다.\"]}]}\n```";
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const first = await makeClient().generate(input);
    rmSync(path.join(first.meta.codexVisionKeyframesCacheDir, "final.json"), { force: true });

    const recovered = await makeClient(true).generate(input);

    expect(finalCalls).toBe(1);
    expect(recovered.cached).toBe(false);
    expect(recovered.json.recipes[0].title).toBe("김치찌개");
    expect(recovered.meta).toMatchObject({
      finalRawRecovered: true,
      finalRawRecoveryVersion: "final-raw-recovery-v1",
    });
    expect(existsSync(path.join(recovered.meta.codexVisionKeyframesCacheDir, "final.json"))).toBe(true);
  });

  it("recovers visual frame ledger JSON from visual-frame-ledger.raw.md without another ledger model call", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 2);
    const cacheDir = path.join(workdir, "keyframes-cache");
    let ledgerCalls = 0;
    let finalCalls = 0;

    const input = {
      prompt: "JSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: "[SOURCE: recipe_candidate_hints]\n1. 김치찌개",
    };

    const makeClient = (failIfLedgerOrFinalCalled = false) => createCodexVisionKeyframesClient({
      cacheDir,
      keyframeMode: "segmented",
      visualFrameLedgerPrompt: true,
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      segmentFrameTotalLimit: 2,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 2 },
      }),
      codexExec: async ({ model, outputPath, logPath }: { model: string; outputPath: string; logPath: string }) => {
        let output: string;
        if (outputPath.includes("segment-plan.raw.md")) {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "김치찌개",
              startSec: 0,
              endSec: 10,
              frameBudget: 1,
            }],
            coverage: [{ candidateId: "cand-01", titleHint: "김치찌개", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] }],
          });
        } else if (outputPath.includes(".selector.raw.md")) {
          output = JSON.stringify({ selectedFrames: [{ file: path.basename(frames[0].path), reason: "대표 프레임" }] });
        } else if (outputPath.includes("visual-frame-ledger.raw.md")) {
          if (failIfLedgerOrFinalCalled) throw new Error("visual ledger model should not be called when raw is recoverable");
          ledgerCalls += 1;
          output = JSON.stringify({
            recipes: [{
              candidateId: "cand-01",
              titleHint: "김치찌개",
              segmentIds: ["seg-01"],
              observedIngredients: ["김치"],
              cookingTransitions: ["냄비에 재료가 들어감"],
              sauceBrothSeasoningCues: ["붉은 국물"],
              keyFrameFiles: [path.basename(frames[0].path)],
              uncertainties: [],
            }],
            warnings: [],
          });
        } else {
          if (model === "fixture-final-model" && failIfLedgerOrFinalCalled) {
            throw new Error("final model should not be called when final.raw.md is recoverable");
          }
          finalCalls += 1;
          output = "```json\n{\"recipes\":[{\"title\":\"김치찌개\",\"ingredients\":[{\"name\":\"김치\",\"amount\":\"1\",\"unit\":\"컵\"}],\"steps\":[\"김치를 넣고 끓인다.\"]}]}\n```";
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const first = await makeClient().generate(input);
    rmSync(path.join(first.meta.codexVisionKeyframesCacheDir, "visual-frame-ledger.json"), { force: true });
    rmSync(path.join(first.meta.codexVisionKeyframesCacheDir, "final.json"), { force: true });

    const recovered = await makeClient(true).generate(input);

    expect(ledgerCalls).toBe(1);
    expect(finalCalls).toBe(1);
    expect(recovered.json.recipes[0].title).toBe("김치찌개");
    expect(recovered.meta).toMatchObject({
      visualFrameLedgerPromptEnabled: true,
      visualFrameLedgerRawRecovered: true,
      visualFrameLedgerRawRecoveryVersion: "visual-frame-ledger-raw-recovery-v1",
      finalRawRecovered: true,
    });
    expect(existsSync(path.join(recovered.meta.codexVisionKeyframesCacheDir, "visual-frame-ledger.json"))).toBe(true);
    expect(existsSync(path.join(recovered.meta.codexVisionKeyframesCacheDir, "final.json"))).toBe(true);
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
      recipeEvidenceLedgerVersion: "recipe-evidence-ledger-v3",
      recipeEvidenceLedgerRecipeCount: 1,
      promptLedgerTextChars: 0,
    });
    expect(prompt.result.meta).toMatchObject({
      recipeEvidenceLedgerEnabled: true,
      recipeEvidenceLedgerPromptEnabled: true,
      recipeEvidenceLedgerVersion: "recipe-evidence-ledger-v3",
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

  it("runs segmented final extraction per recipe segment when requested", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 4);
    const finalCalls: Array<{ prompt: string; images: string[] }> = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      segmentedFinalMode: "per-segment",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      segmentFrameTotalLimit: 4,
      recipeEvidenceLedgerPrompt: true,
      sourceCuePackets: true,
      visualFrameLedgerPrompt: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 4 },
      }),
      codexExec: async ({
        model,
        prompt,
        images,
        outputPath,
        logPath,
      }: {
        model: string;
        prompt: string;
        images: string[];
        outputPath: string;
        logPath: string;
      }) => {
        let output: string;
        if (outputPath.includes("visual-frame-ledger.raw.md")) {
          output = JSON.stringify({
            recipes: [
              {
                candidateId: "cand-01",
                titleHint: "두부볶음",
                segmentIds: ["seg-01"],
                observedIngredients: ["두부"],
                cookingTransitions: ["팬에서 두부가 익어감"],
                sauceBrothSeasoningCues: [],
                keyFrameFiles: [path.basename(frames[0].path)],
                uncertainties: [],
              },
              {
                candidateId: "cand-02",
                titleHint: "보조국",
                segmentIds: ["seg-02"],
                observedIngredients: ["무"],
                cookingTransitions: ["냄비에서 끓는 상태"],
                sauceBrothSeasoningCues: ["고추장 언급이 있는 양념 요소", "맑은 국물"],
                keyFrameFiles: [path.basename(frames[2].path)],
                uncertainties: ["자막 기반으로 보이는 다른 후보 재료"],
              },
            ],
            frames: [
              {
                segmentId: "seg-02",
                candidateId: "cand-02",
                titleHint: "보조국",
                frameFile: path.basename(frames[2].path),
                timestamp: "20",
                visibleIngredients: ["무"],
                cookingState: "냄비가 끓는 상태",
                sauceBrothSeasoningCues: ["transcript mentions gochujang", "맑은 국물"],
                uncertainties: [],
              },
            ],
          });
        } else if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [
              {
                segmentId: "seg-01",
                candidateId: "cand-01",
                titleHint: "두부볶음",
                startSec: 0,
                endSec: 10,
                textEvidence: ["두부 1컵"],
                frameBudget: 1,
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
              { candidateId: "cand-02", titleHint: "보조국", status: "covered", outputRole: "recipe", segmentIds: ["seg-02"] },
            ],
          });
        } else if (model === "fixture-selector-model") {
          output = JSON.stringify({
            selectedFrames: [{ file: path.basename(images[0]), reason: "target 재료 확인" }],
          });
        } else {
          finalCalls.push({ prompt, images });
          const title = prompt.includes("candidateId: cand-01") ? "두부볶음" : "보조국";
          output = JSON.stringify({
            recipes: [{
              title: `${title} 변형`,
              ingredients: [{ name: title === "두부볶음" ? "두부" : "무", amount: "1", unit: "컵" }],
              steps: [`${title}을 만든다.`],
            }],
          });
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "너는 유튜브 요리 영상에서 레시피를 추출하는 전문가다. 이 영상을 직접 시청할 수 있다.\n규칙:\nJSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 두부볶음",
        "2. 보조국",
        "[SOURCE: description]",
        "00:00 두부볶음",
        "00:20 보조국",
        "[SOURCE: transcript(ko)]",
        "00:01 두부 1컵을 볶는다.",
        "01:05 다른 구간 고추장을 넣는다.",
      ].join("\n"),
    });

    expect(finalCalls).toHaveLength(2);
    expect(finalCalls[0].images).toEqual([frames[0].path]);
    expect(finalCalls[1].images).toEqual([frames[2].path]);
    expect(finalCalls[0].prompt).toContain("per-segment final extraction");
    expect(finalCalls[0].prompt).toContain("recipes[]에는 target candidate 하나만 출력한다");
    expect(finalCalls[0].prompt).toContain("recipes[0].title은 반드시 위 target candidate의 titleHint 문자열과 완전히 같아야 한다");
    expect(finalCalls[0].prompt).toContain("per-segment base source strip(per-segment-base-source-strip-v1)");
    expect(finalCalls[0].prompt).toContain("visual ledger source-mention filter(per-segment-visual-ledger-source-mention-filter-v1)");
    expect(finalCalls[0].prompt).toContain("candidateId: cand-01");
    expect(finalCalls[0].prompt).not.toContain("candidateId: cand-02");
    expect(finalCalls[0].prompt).not.toContain("01:05 다른 구간 고추장을 넣는다.");
    expect(finalCalls[1].prompt).not.toContain("01:05 다른 구간 고추장을 넣는다.");
    expect(finalCalls[1].prompt).not.toContain("고추장 언급이 있는 양념 요소");
    expect(finalCalls[1].prompt).not.toContain("transcript mentions gochujang");
    expect(finalCalls[1].prompt).not.toContain("자막 기반으로 보이는 다른 후보 재료");
    expect(finalCalls[1].prompt).toContain("맑은 국물");
    expect(finalCalls[1].prompt).toContain("candidateId: cand-02");
    expect(result.json.recipes.map((recipe: { title: string }) => recipe.title)).toEqual(["두부볶음", "보조국"]);
    expect(result.meta).toMatchObject({
      segmentedFinalMode: "per-segment",
      perSegmentFinalCount: 2,
      perSegmentTitleNormalizationVersion: "per-segment-title-normalization-v1",
      perSegmentTitleNormalizedCount: 2,
      perSegmentSourceTimeFilterVersion: "per-segment-source-time-filter-v1",
      perSegmentVisualLedgerSourceMentionFilterVersion: "per-segment-visual-ledger-source-mention-filter-v1",
    });
    expect(result.meta.perSegmentSourceTimeFilterDroppedCount).toBeGreaterThanOrEqual(2);
    expect(result.meta.perSegmentVisualLedgerSourceMentionDroppedCount).toBeGreaterThanOrEqual(2);
    expect(result.meta.perSegmentRecipeMustConsiderSourceMentionDroppedCount).toBeGreaterThanOrEqual(2);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "final-seg-01.json"))).toBe(true);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "final-seg-02.json"))).toBe(true);
  });

  it("runs a source-gap repair pass after combined segmented final when requested", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 2);
    const finalCalls: Array<{ phase: string; prompt: string; images: string[] }> = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      segmentedRepairMode: "source-gap",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      sourceCuePackets: true,
      recipeEvidenceLedgerPrompt: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 2 },
      }),
      codexExec: async ({
        model,
        prompt,
        images,
        outputPath,
        logPath,
      }: {
        model: string;
        prompt: string;
        images: string[];
        outputPath: string;
        logPath: string;
      }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "두부볶음",
              startSec: 0,
              endSec: 10,
              textEvidence: ["두부 1컵, 간장 1큰술"],
              frameBudget: 1,
            }],
            coverage: [
              { candidateId: "cand-01", titleHint: "두부볶음", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
            ],
          });
        } else if (model === "fixture-selector-model") {
          output = JSON.stringify({
            selectedFrames: [{ file: path.basename(images[0]), reason: "두부와 양념 확인" }],
          });
        } else if (prompt.includes("source-gap repair pass")) {
          finalCalls.push({ phase: "repair", prompt, images });
          output = JSON.stringify({
            recipes: [{
              title: "두부볶음",
              ingredients: [
                { name: "두부", amount: "1", unit: "컵" },
                { name: "간장", amount: "1", unit: "큰술" },
              ],
              steps: ["두부를 간장 양념에 볶는다."],
            }],
          });
        } else {
          finalCalls.push({ phase: "final", prompt, images });
          output = JSON.stringify({
            recipes: [{
              title: "두부볶음",
              ingredients: [{ name: "두부", amount: "1", unit: "컵" }],
              steps: ["두부를 볶는다."],
            }],
          });
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "규칙:\nJSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 두부볶음",
        "[SOURCE: transcript(ko)]",
        "00:01 두부 1컵과 간장 1큰술을 넣고 볶는다.",
      ].join("\n"),
    });

    expect(finalCalls.map((call) => call.phase)).toEqual(["final", "repair"]);
    expect(finalCalls[0].prompt).toContain("외부 웹 검색");
    expect(finalCalls[0].prompt).toContain("Do not use web search");
    expect(finalCalls[0].prompt).toContain("onscreen text priority");
    expect(finalCalls[0].prompt).toContain("화면 자막");
    expect(finalCalls[0].prompt).not.toContain("visual identity guard");
    expect(finalCalls[0].prompt).not.toContain("말이류/김밥류/후토마끼류");
    expect(finalCalls[0].prompt).not.toContain("이 영상을 직접 시청할 수 있다");
    expect(finalCalls[1].images).toEqual([frames[0].path]);
    expect(finalCalls[1].prompt).toContain("외부 웹 검색");
    expect(finalCalls[1].prompt).toContain("onscreen text priority");
    expect(finalCalls[1].prompt).toContain("visual identity guard");
    expect(finalCalls[1].prompt).toContain("말이류/김밥류/후토마끼류");
    expect(finalCalls[1].prompt).toContain("current combined final JSON");
    expect(finalCalls[1].prompt).toContain("sourceCuePackets:");
    expect(finalCalls[1].prompt).toContain("Recipe evidence ledger:");
    expect(finalCalls[1].prompt).toContain("recipe 수를 바꾸지 않는다");
    expect(result.json.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["두부", "간장"]);
    expect(result.meta).toMatchObject({
      segmentedFinalMode: "combined",
      segmentedRepairMode: "source-gap",
      segmentedRepairApplied: true,
      segmentedRepairPromptVersion: "keyframe-source-gap-repair-v6",
      onscreenTextPriorityVersion: "onscreen-text-priority-v1",
      visualIdentityGuardVersion: "visual-identity-guard-ledger-repair-v1",
      segmentedRepairRecipeCountBefore: 1,
      segmentedRepairRecipeCountAfter: 1,
    });
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "repair.prompt.md"))).toBe(true);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "repair.json"))).toBe(true);
  });

  it("applies source-gap patch repair without rewriting the full recipe JSON", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 2);
    const finalCalls: Array<{ phase: string; prompt: string; images: string[] }> = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      segmentedRepairMode: "source-gap-patch",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      sourceCuePackets: true,
      recipeEvidenceLedgerPrompt: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 2 },
      }),
      codexExec: async ({ model, prompt, images, outputPath, logPath }: { model: string; prompt: string; images: string[]; outputPath: string; logPath: string }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "두부볶음",
              startSec: 0,
              endSec: 10,
              textEvidence: ["두부 1컵, 간장 1큰술"],
              frameBudget: 1,
            }],
            coverage: [
              { candidateId: "cand-01", titleHint: "두부볶음", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
            ],
          });
        } else if (model === "fixture-selector-model") {
          output = JSON.stringify({
            selectedFrames: [{ file: path.basename(images[0]), reason: "두부와 양념 확인" }],
          });
        } else if (prompt.includes("source-gap patch repair pass")) {
          finalCalls.push({ phase: "repair", prompt, images });
          output = JSON.stringify({
            patches: [
              {
                recipeTitle: "두부볶음",
                operation: "addIngredient",
                ingredient: { name: "간장", amount: "1", unit: "큰술" },
                evidence: "transcript: 간장 1큰술",
                confidence: "high",
              },
              {
                recipeTitle: "두부볶음",
                operation: "addStepAfter",
                afterStepIndex: 0,
                step: "간장을 넣고 한 번 더 볶는다.",
                evidence: "transcript: 간장 1큰술을 넣고 볶는다.",
                confidence: "high",
              },
              {
                recipeTitle: "두부볶음",
                operation: "addIngredient",
                ingredient: { name: "설탕", amount: "1", unit: "큰술" },
                evidence: "근거 약함",
                confidence: "low",
              },
            ],
          });
        } else {
          finalCalls.push({ phase: "final", prompt, images });
          output = JSON.stringify({
            recipes: [{
              title: "두부볶음",
              ingredients: [{ name: "두부", amount: "1", unit: "컵" }],
              steps: ["두부를 볶는다."],
            }],
          });
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "규칙:\nJSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 두부볶음",
        "[SOURCE: transcript(ko)]",
        "00:01 두부 1컵과 간장 1큰술을 넣고 볶는다.",
      ].join("\n"),
    });

    expect(finalCalls.map((call) => call.phase)).toEqual(["final", "repair"]);
    expect(finalCalls[1].prompt).toContain("\"patches\"");
    expect(finalCalls[1].prompt).toContain("Do not use web search");
    expect(finalCalls[1].prompt).toContain("onscreen text priority");
    expect(finalCalls[1].prompt).toContain("visual identity guard");
    expect(finalCalls[1].prompt).toContain("최종 JSON 전체를 다시 쓰지 않는다");
    expect(result.json.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["두부", "간장"]);
    expect(result.json.recipes[0].steps).toEqual(["두부를 볶는다.", "간장을 넣고 한 번 더 볶는다."]);
    expect(result.meta).toMatchObject({
      segmentedRepairMode: "source-gap-patch",
      segmentedRepairApplied: true,
      segmentedRepairPromptVersion: "keyframe-source-gap-patch-repair-v6",
      segmentedRepairPatchCount: 3,
      segmentedRepairAppliedPatchCount: 2,
      segmentedRepairRejectedPatchCount: 1,
    });
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "repair-patches.json"))).toBe(true);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "repair.json"))).toBe(true);
  });

  it("adds targeted gap checklist to source-gap patch repair prompts", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 2);
    const repairPrompts: string[] = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      segmentedRepairMode: "source-gap-patch-targeted",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      sourceCuePackets: true,
      recipeEvidenceLedgerPrompt: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 2 },
      }),
      codexExec: async ({ model, prompt, images, outputPath, logPath }: { model: string; prompt: string; images: string[]; outputPath: string; logPath: string }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "해장파스타",
              startSec: 0,
              endSec: 10,
              textEvidence: ["매운 양념 베이스"],
              frameBudget: 1,
            }],
            coverage: [
              { candidateId: "cand-01", titleHint: "해장파스타", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
            ],
          });
        } else if (model === "fixture-selector-model") {
          output = JSON.stringify({
            selectedFrames: [{ file: path.basename(images[0]), reason: "소스와 물 투입" }],
          });
        } else if (prompt.includes("source-gap patch repair pass")) {
          repairPrompts.push(prompt);
          output = JSON.stringify({
            patches: [{
              recipeTitle: "해장파스타",
              operation: "addStepAfter",
              targetedGap: "missing-seasoning-base",
              afterStepIndex: 0,
              step: "매운 양념 베이스를 넣고 볶는다.",
              evidence: "transcript: 매운 양념 베이스",
              confidence: "high",
            }],
          });
        } else {
          output = JSON.stringify({
            recipes: [{
              title: "해장파스타",
              ingredients: [{ name: "면", amount: "1", unit: "인분" }],
              steps: ["면을 삶는다."],
            }],
          });
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "규칙:\nJSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 해장파스타",
        "[SOURCE: transcript(ko)]",
        "00:01 매운 양념 베이스와 물을 넣고 끓인다.",
      ].join("\n"),
    });

    expect(repairPrompts).toHaveLength(1);
    expect(repairPrompts[0]).toContain("외부 웹 검색");
    expect(repairPrompts[0]).toContain("onscreen text priority");
    expect(repairPrompts[0]).toContain("visual identity guard");
    expect(repairPrompts[0]).toContain("low-confidence target checklist");
    expect(repairPrompts[0]).toContain("targetedGap");
    expect(repairPrompts[0]).toContain("missing-seasoning-base");
    expect(result.json.recipes[0].steps).toEqual(["면을 삶는다.", "매운 양념 베이스를 넣고 볶는다."]);
    expect(result.meta).toMatchObject({
      segmentedRepairMode: "source-gap-patch-targeted",
      segmentedRepairPromptVersion: "keyframe-source-gap-targeted-patch-repair-v6",
      segmentedRepairTargetedPatch: true,
      segmentedRepairAppliedPatchCount: 1,
    });
  });

  it("adds bridge frames between sparse segmented keyframe selections", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 3);
    const finalPrompts: string[] = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 3,
      segmentFrameTotalLimit: 3,
      segmentBridgeFrames: true,
      sourceCuePackets: true,
      recipeEvidenceLedgerPrompt: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 3 },
      }),
      codexExec: async ({ model, prompt, images, outputPath, logPath }: { model: string; prompt: string; images: string[]; outputPath: string; logPath: string }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "국물파스타",
              startSec: 0,
              endSec: 20,
              textEvidence: ["국물파스타"],
              frameBudget: 2,
            }],
            coverage: [
              { candidateId: "cand-01", titleHint: "국물파스타", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
            ],
          });
        } else if (model === "fixture-selector-model") {
          output = JSON.stringify({
            selectedFrames: [
              { file: path.basename(frames[0].path), reason: "재료 투입 시작 장면" },
              { file: path.basename(frames[2].path), reason: "완성 샷과 최종 플레이팅" },
            ],
          });
        } else {
          finalPrompts.push(prompt);
          expect(images.map((image) => path.basename(image))).toEqual([
            path.basename(frames[0].path),
            path.basename(frames[1].path),
            path.basename(frames[2].path),
          ]);
          output = JSON.stringify({
            recipes: [{
              title: "국물파스타",
              ingredients: [{ name: "파스타면", amount: "1", unit: "인분" }],
              steps: ["파스타면을 국물에 넣고 끓인다."],
            }],
          });
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "규칙:\nJSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 국물파스타",
        "[SOURCE: description]",
        "국물파스타",
      ].join("\n"),
    });

    expect(finalPrompts).toHaveLength(1);
    expect(finalPrompts[0]).toContain("bridge-frame");
    expect(result.meta).toMatchObject({
      segmentBridgeFrameVersion: "segment-bridge-frame-v1",
      selectedFrameCount: 3,
    });

    const segmentKeyframes = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "segment-keyframes.json"), "utf8"));
    expect(segmentKeyframes.segments[0].selectedFrames.map((frame: { file: string }) => frame.file)).toEqual([
      path.basename(frames[0].path),
      path.basename(frames[1].path),
      path.basename(frames[2].path),
    ]);
    expect(segmentKeyframes.segments[0].selectedFrames[1]).toMatchObject({
      bridgeFrame: true,
      selectionSource: "bridge-frame",
    });
  });

  it("adds a phase anchor frame for long segments with early-only selections", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 7);
    const finalPrompts: string[] = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 7,
      segmentFrameTotalLimit: 3,
      segmentPhaseAnchorFrames: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 7 },
      }),
      codexExec: async ({ model, prompt, images, outputPath, logPath }: { model: string; prompt: string; images: string[]; outputPath: string; logPath: string }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "해장파스타",
              startSec: 0,
              endSec: 60,
              textEvidence: ["해장파스타"],
              frameBudget: 3,
            }],
            coverage: [
              { candidateId: "cand-01", titleHint: "해장파스타", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
            ],
          });
        } else if (model === "fixture-selector-model") {
          output = JSON.stringify({
            selectedFrames: [
              { file: path.basename(frames[0].path), reason: "면 삶기 시작" },
              { file: path.basename(frames[1].path), reason: "재료 손질 초반" },
            ],
          });
        } else {
          finalPrompts.push(prompt);
          expect(images.map((image) => path.basename(image))).toEqual([
            path.basename(frames[0].path),
            path.basename(frames[1].path),
            path.basename(frames[4].path),
          ]);
          output = JSON.stringify({
            recipes: [{
              title: "해장파스타",
              ingredients: [{ name: "파스타면", amount: "1", unit: "인분" }],
              steps: ["파스타면을 소스에 넣고 끓인다."],
            }],
          });
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "규칙:\nJSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 해장파스타",
        "[SOURCE: description]",
        "해장파스타",
      ].join("\n"),
    });

    expect(finalPrompts).toHaveLength(1);
    expect(finalPrompts[0]).toContain("phase-anchor-frame");
    expect(result.meta).toMatchObject({
      segmentPhaseAnchorFrameVersion: "segment-phase-anchor-frame-v2",
      segmentPhaseAnchorFrames: true,
      selectedFrameCount: 3,
    });

    const segmentKeyframes = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "segment-keyframes.json"), "utf8"));
    expect(segmentKeyframes.segments[0].selectedFrames.map((frame: { file: string }) => frame.file)).toEqual([
      path.basename(frames[0].path),
      path.basename(frames[1].path),
      path.basename(frames[4].path),
    ]);
    expect(segmentKeyframes.segments[0].selectedFrames[2]).toMatchObject({
      phaseAnchorFrame: true,
      selectionSource: "phase-anchor-frame",
    });
  });

  it("skips phase anchor frames when late segment coverage already exists", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 7);
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 7,
      segmentFrameTotalLimit: 4,
      segmentPhaseAnchorFrames: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 7 },
      }),
      codexExec: async ({ model, images, outputPath, logPath }: { model: string; images: string[]; outputPath: string; logPath: string }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "묵참김밥",
              startSec: 0,
              endSec: 60,
              textEvidence: ["묵참김밥"],
              frameBudget: 4,
            }],
            coverage: [
              { candidateId: "cand-01", titleHint: "묵참김밥", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
            ],
          });
        } else if (model === "fixture-selector-model") {
          output = JSON.stringify({
            selectedFrames: [
              { file: path.basename(frames[1].path), reason: "재료 조립" },
              { file: path.basename(frames[5].path), reason: "완성 직전 단면 확인" },
            ],
          });
        } else {
          expect(images.map((image) => path.basename(image))).toEqual([
            path.basename(frames[1].path),
            path.basename(frames[5].path),
          ]);
          output = JSON.stringify({
            recipes: [{
              title: "묵참김밥",
              ingredients: [{ name: "묵은지", amount: "1", unit: "장" }],
              steps: ["묵은지에 밥과 참치를 올려 만다."],
            }],
          });
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "규칙:\nJSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 묵참김밥",
        "[SOURCE: description]",
        "묵참김밥",
      ].join("\n"),
    });

    const segmentKeyframes = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "segment-keyframes.json"), "utf8"));
    expect(segmentKeyframes.segments[0].selectedFrames.map((frame: { file: string }) => frame.file)).toEqual([
      path.basename(frames[1].path),
      path.basename(frames[5].path),
    ]);
    expect(segmentKeyframes.segments[0].selectedFrames.some((frame: { phaseAnchorFrame?: boolean }) => frame.phaseAnchorFrame)).toBe(false);
  });

  it("does not promote roll filling uncertainties to final bridge facts", async () => {
    const { buildRecipeMustConsiderFacts } = await import(codexVisionKeyframesModuleUrl);

    const facts = buildRecipeMustConsiderFacts({
      visualFrameLedger: {
        recipes: [{
          candidateId: "cand-roll",
          titleHint: "메밀 후토마끼",
          segmentIds: ["seg-01"],
          observedIngredients: ["메밀면", "김 시트"],
          cookingTransitions: ["김 위에 메밀면과 속재료를 올려 말기 시작함"],
          sauceBrothSeasoningCues: [],
          keyFrameFiles: ["frame_0038_00183.237.jpg", "frame_0050_00242.666.jpg"],
          uncertainties: ["주황/초록/노란 길쭉한 속재료의 정확한 명칭은 불확실"],
        }],
        frames: [],
      },
    });

    const rollFacts = facts.recipes.find((recipe: { candidateId: string }) => recipe.candidateId === "cand-roll");
    expect(facts.version).toBe("recipe-must-consider-facts-v8");
    const bridgeText = rollFacts?.bridgeFacts.map((fact: { text: string }) => fact.text).join("\n") ?? "";
    expect(bridgeText).not.toContain("주황색 생선살 후보");
    expect(bridgeText).not.toContain("노란 달걀류 후보");
    expect(rollFacts?.uncertainties.map((fact: { text: string }) => fact.text).join("\n")).toContain("주황/초록/노란");
  });

  it("adds a visual frame ledger to segmented final prompt when enabled", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 2);
    const finalPrompts: string[] = [];
    const ledgerPrompts: string[] = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      visualFrameLedgerPrompt: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 2 },
      }),
      codexExec: async ({ prompt, images, outputPath, logPath }: { prompt: string; images: string[]; outputPath: string; logPath: string }) => {
        let output: string;
        if (outputPath.includes("segment-plan.raw.md")) {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "해장파스타",
              startSec: 0,
              endSec: 20,
              textEvidence: ["해장파스타"],
              frameBudget: 1,
            }],
            coverage: [
              { candidateId: "cand-01", titleHint: "해장파스타", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
            ],
          });
        } else if (outputPath.includes(".selector.raw.md")) {
          output = JSON.stringify({
            selectedFrames: [
              { file: path.basename(frames[1].path), reason: "붉은 소스와 해산물이 합쳐지는 전환 프레임" },
            ],
          });
        } else if (outputPath.includes("visual-frame-ledger.raw.md")) {
          ledgerPrompts.push(prompt);
          expect(images).toEqual([frames[1].path]);
          output = JSON.stringify({
            recipes: [{
              candidateId: "cand-01",
              titleHint: "해장파스타",
              segmentIds: ["seg-01"],
              observedIngredients: ["해산물", "면"],
              cookingTransitions: ["붉은 국물 베이스에 재료가 합쳐지는 중"],
              sauceBrothSeasoningCues: ["붉은 국물", "소스와 물이 섞인 상태"],
              keyFrameFiles: [path.basename(frames[1].path)],
              uncertainties: [],
            }],
            warnings: [],
          });
        } else {
          finalPrompts.push(prompt);
          expect(images).toEqual([frames[1].path]);
          output = JSON.stringify({
            recipes: [{
              title: "해장파스타",
              ingredients: [{ name: "해산물", amount: "1", unit: "컵" }],
              steps: ["붉은 국물 베이스에 해산물과 면을 넣고 끓인다."],
            }],
          });
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "규칙:\nJSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 해장파스타",
        "[SOURCE: description]",
        "해장파스타",
      ].join("\n"),
    });

    expect(ledgerPrompts).toHaveLength(1);
    expect(ledgerPrompts[0]).toContain("visual frame ledger");
    expect(ledgerPrompts[0]).toContain("visual identity guard");
    expect(ledgerPrompts[0]).toContain("말이류/김밥류/후토마끼류");
    expect(ledgerPrompts[0]).toContain("protein species guard");
    expect(ledgerPrompts[0]).toContain("liquid heat guard");
    expect(finalPrompts).toHaveLength(1);
    expect(finalPrompts[0]).toContain("Visual frame ledger");
    expect(finalPrompts[0]).toContain("붉은 국물");
    expect(finalPrompts[0]).toContain("keyFrames=");
    expect(finalPrompts[0]).toContain("source-priority rule");
    expect(finalPrompts[0]).toContain("source concrete name preservation rule");
    expect(finalPrompts[0]).toContain("visual uncertainty is not a veto");
    expect(finalPrompts[0]).toContain("visual uncertainty rule");
    expect(finalPrompts[0]).toContain("visible seasoning base policy");
    expect(finalPrompts[0]).toContain("protein identity guard");
    expect(finalPrompts[0]).toContain("protein species guard");
    expect(finalPrompts[0]).toContain("step granularity rule");
    expect(finalPrompts[0]).toContain("liquid base preservation rule");
    expect(finalPrompts[0]).toContain("liquid heat guard");
    expect(finalPrompts[0]).toContain("shared segment ownership guard");
    expect(finalPrompts[0]).toContain("spicy red base rule");
    expect(finalPrompts[0]).toContain("Recipe must-consider facts");
    expect(finalPrompts[0]).toContain("source facts");
    expect(finalPrompts[0]).toContain("visual facts");
    expect(finalPrompts[0]).toContain("bridge facts");
    expect(finalPrompts[0]).toContain("제목과 화면 단서가 함께");
    expect(finalPrompts[0]).toContain("wrapper uncertainty guard");
    expect(finalPrompts[0]).toContain("creamy/mayo base preservation rule");
    expect(finalPrompts[0]).toContain("negated source action preservation rule");
    expect(result.meta).toMatchObject({
      visualFrameLedgerPromptEnabled: true,
      visualFrameLedgerVersion: "visual-frame-ledger-v9",
      recipeMustConsiderFactsVersion: "recipe-must-consider-facts-v8",
      titleVisualBridgeFactsVersion: "title-visual-bridge-facts-v5",
      visualFrameLedgerRecipeCount: 1,
      visualFrameLedgerObservedIngredientCueCount: 2,
      visualFrameLedgerCookingTransitionCueCount: 1,
      visualFrameLedgerRecipeSauceBrothSeasoningCueCount: 2,
      recipeMustConsiderFactsRecipeCount: 1,
      recipeMustConsiderBridgeFactCount: 2,
    });
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "visual-frame-ledger.json"))).toBe(true);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "recipe-must-consider-facts.json"))).toBe(true);
    expect(result.json.recipes[0].title).toBe("해장파스타");
  });

  it("runs visual frame ledger in segment batches when a batch size is configured", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 4);
    const ledgerImageCounts: number[] = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      segmentFrameTotalLimit: 2,
      visualFrameLedgerPrompt: true,
      visualFrameLedgerBatchSize: 1,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 4 },
      }),
      codexExec: async ({ outputPath, images, logPath }: { outputPath: string; images: string[]; logPath: string }) => {
        let output: string;
        if (outputPath.includes("segment-plan.raw.md")) {
          output = JSON.stringify({
            segments: [
              { segmentId: "seg-01", candidateId: "cand-01", titleHint: "김치찌개", startSec: 0, endSec: 10, frameBudget: 1 },
              { segmentId: "seg-02", candidateId: "cand-02", titleHint: "된장찌개", startSec: 20, endSec: 30, frameBudget: 1 },
            ],
            coverage: [
              { candidateId: "cand-01", titleHint: "김치찌개", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
              { candidateId: "cand-02", titleHint: "된장찌개", status: "covered", outputRole: "recipe", segmentIds: ["seg-02"] },
            ],
          });
        } else if (outputPath.includes("segment-seg-01.selector.raw.md")) {
          output = JSON.stringify({ selectedFrames: [{ file: path.basename(frames[0].path), reason: "김치찌개 대표 프레임" }] });
        } else if (outputPath.includes("segment-seg-02.selector.raw.md")) {
          output = JSON.stringify({ selectedFrames: [{ file: path.basename(frames[2].path), reason: "된장찌개 대표 프레임" }] });
        } else if (outputPath.includes("visual-frame-ledger.batch-")) {
          ledgerImageCounts.push(images.length);
          const isFirst = outputPath.includes("batch-01");
          const ledgerOutput = JSON.stringify({
            recipes: [{
              candidateId: isFirst ? "cand-01" : "cand-02",
              titleHint: isFirst ? "김치찌개" : "된장찌개",
              segmentIds: [isFirst ? "seg-01" : "seg-02"],
              observedIngredients: [isFirst ? "김치" : "된장"],
              cookingTransitions: [isFirst ? "김치를 끓임" : "된장을 끓임"],
              sauceBrothSeasoningCues: [isFirst ? "붉은 국물" : "된장 국물"],
              keyFrameFiles: [path.basename(images[0])],
              uncertainties: [],
            }],
            warnings: [],
          });
          output = isFirst ? ledgerOutput : ledgerOutput.replace(/}\],"warnings"/, `]],"warnings"`);
        } else {
          output = JSON.stringify({
            recipes: [
              { title: "김치찌개", ingredients: [{ name: "김치", amount: "1", unit: "컵" }], steps: ["김치를 끓인다."] },
              { title: "된장찌개", ingredients: [{ name: "된장", amount: "1", unit: "큰술" }], steps: ["된장을 끓인다."] },
            ],
          });
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "규칙:\nJSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 김치찌개",
        "2. 된장찌개",
        "[SOURCE: description]",
        "00:00 김치찌개",
        "00:20 된장찌개",
      ].join("\n"),
    });

    expect(ledgerImageCounts).toEqual([1, 1]);
    expect(result.meta).toMatchObject({
      visualFrameLedgerPromptEnabled: true,
      visualFrameLedgerBatchSize: 1,
      visualFrameLedgerBatchMode: true,
      visualFrameLedgerBatchCount: 2,
      visualFrameLedgerRecipeCount: 2,
    });
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "visual-frame-ledger.batch-01.json"))).toBe(true);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "visual-frame-ledger.batch-02.json"))).toBe(true);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "visual-frame-ledger.json"))).toBe(true);
  });

  it("continues final extraction when a visual frame ledger batch fails", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 4);
    const finalPrompts: string[] = [];
    const ledgerCalls: string[] = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      segmentFrameTotalLimit: 2,
      visualFrameLedgerPrompt: true,
      visualFrameLedgerBatchSize: 1,
      timeoutMs: 1000,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 4 },
      }),
      codexExec: async ({ outputPath, images, logPath, timeoutMs }: { outputPath: string; images: string[]; logPath: string; timeoutMs: number }) => {
        let output: string;
        if (outputPath.includes("segment-plan.raw.md")) {
          output = JSON.stringify({
            segments: [
              { segmentId: "seg-01", candidateId: "cand-01", titleHint: "김치찌개", startSec: 0, endSec: 10, frameBudget: 1 },
              { segmentId: "seg-02", candidateId: "cand-02", titleHint: "된장찌개", startSec: 20, endSec: 30, frameBudget: 1 },
            ],
            coverage: [
              { candidateId: "cand-01", titleHint: "김치찌개", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
              { candidateId: "cand-02", titleHint: "된장찌개", status: "covered", outputRole: "recipe", segmentIds: ["seg-02"] },
            ],
          });
        } else if (outputPath.includes("segment-seg-01.selector.raw.md")) {
          output = JSON.stringify({ selectedFrames: [{ file: path.basename(frames[0].path), reason: "김치찌개 대표 프레임" }] });
        } else if (outputPath.includes("segment-seg-02.selector.raw.md")) {
          output = JSON.stringify({ selectedFrames: [{ file: path.basename(frames[2].path), reason: "된장찌개 대표 프레임" }] });
        } else if (outputPath.includes("visual-frame-ledger.batch-")) {
          ledgerCalls.push(path.basename(outputPath));
          expect(timeoutMs).toBe(1000);
          throw new Error("fixture visual ledger timeout");
        } else {
          finalPrompts.push(outputPath);
          expect(images.length).toBeGreaterThan(0);
          output = JSON.stringify({
            recipes: [
              { title: "김치찌개", ingredients: [{ name: "김치", amount: "1", unit: "컵" }], steps: ["김치를 끓인다."] },
              { title: "된장찌개", ingredients: [{ name: "된장", amount: "1", unit: "큰술" }], steps: ["된장을 끓인다."] },
            ],
          });
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "규칙:\nJSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 김치찌개",
        "2. 된장찌개",
        "[SOURCE: description]",
        "00:00 김치찌개",
        "00:20 된장찌개",
      ].join("\n"),
    });

    expect(ledgerCalls).toEqual(["visual-frame-ledger.batch-01.raw.md", "visual-frame-ledger.batch-02.raw.md"]);
    expect(finalPrompts).toEqual([expect.stringContaining("final.raw.md")]);
    expect(result.json.recipes).toHaveLength(2);
    expect(result.meta).toMatchObject({
      visualFrameLedgerPromptEnabled: true,
      visualFrameLedgerBatchMode: true,
      visualFrameLedgerBatchCount: 2,
      visualFrameLedgerFallbackVersion: "visual-frame-ledger-fallback-v1",
      visualFrameLedgerPartialFailureCount: 2,
      visualFrameLedgerCallTimeoutMs: 1000,
      visualFrameLedgerRecipeCount: 0,
    });
    expect(result.meta.visualFrameLedgerSkippedBatchCount).toBeUndefined();
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "visual-frame-ledger.batch-01.failure.json"))).toBe(true);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "visual-frame-ledger.batch-02.failure.json"))).toBe(true);
    expect(existsSync(path.join(result.meta.codexVisionKeyframesCacheDir, "visual-frame-ledger.json"))).toBe(true);
  });

  it("rejects weak patches in verified source-gap patch repair mode", async () => {
    const { createCodexVisionKeyframesClient } = await import(codexVisionKeyframesModuleUrl);
    const { frameDir, frames } = makeFrameFixture(workdir, 2);
    const repairPrompts: string[] = [];
    const client = createCodexVisionKeyframesClient({
      cacheDir: path.join(workdir, "keyframes-cache"),
      keyframeMode: "segmented",
      segmentedRepairMode: "source-gap-patch-verified",
      model: "fixture-final-model",
      segmentModel: "fixture-segment-model",
      selectorModel: "fixture-selector-model",
      segmentPaddingSec: 0,
      segmentMinFrames: 1,
      segmentMaxFrames: 2,
      sourceCuePackets: true,
      recipeEvidenceLedgerPrompt: true,
      extractFrames: async () => ({
        frameCacheHit: false,
        frameDir,
        frames,
        extractionStats: { scene_selected: 2 },
      }),
      codexExec: async ({ model, prompt, images, outputPath, logPath }: { model: string; prompt: string; images: string[]; outputPath: string; logPath: string }) => {
        let output: string;
        if (model === "fixture-segment-model") {
          output = JSON.stringify({
            segments: [{
              segmentId: "seg-01",
              candidateId: "cand-01",
              titleHint: "두부볶음",
              startSec: 0,
              endSec: 10,
              textEvidence: ["두부 1컵, 간장 1큰술"],
              frameBudget: 1,
            }],
            coverage: [
              { candidateId: "cand-01", titleHint: "두부볶음", status: "covered", outputRole: "recipe", segmentIds: ["seg-01"] },
            ],
          });
        } else if (model === "fixture-selector-model") {
          output = JSON.stringify({
            selectedFrames: [{ file: path.basename(images[0]), reason: "두부와 간장 양념 확인" }],
          });
        } else if (prompt.includes("source-gap patch repair pass")) {
          repairPrompts.push(prompt);
          output = JSON.stringify({
            patches: [
              {
                recipeTitle: "두부볶음",
                operation: "addIngredient",
                ingredient: { name: "간장", amount: "1", unit: "큰술" },
                evidence: "transcript: 간장 1큰술을 넣고 볶는다.",
                evidenceSources: ["transcript"],
                directEvidenceQuote: "간장 1큰술",
                crossRecipeRisk: false,
                confidence: "high",
              },
              {
                recipeTitle: "두부볶음",
                operation: "addIngredient",
                ingredient: { name: "설탕", amount: "1", unit: "큰술" },
                evidence: "selectedFrame: 양념 그릇이 보임",
                evidenceSources: ["selectedFrame"],
                directEvidenceQuote: "양념 그릇",
                crossRecipeRisk: false,
                confidence: "high",
              },
              {
                recipeTitle: "두부볶음",
                operation: "addStepAfter",
                afterStepIndex: 0,
                step: "간장을 넣고 한 번 더 볶는다.",
                evidence: "transcript: 간장 1큰술을 넣고 볶는다.",
                evidenceSources: ["transcript"],
                directEvidenceQuote: "간장 1큰술을 넣고 볶는다",
                crossRecipeRisk: false,
                confidence: "medium",
              },
            ],
          });
        } else {
          output = JSON.stringify({
            recipes: [{
              title: "두부볶음",
              ingredients: [{ name: "두부", amount: "1", unit: "컵" }],
              steps: ["두부를 볶는다."],
            }],
          });
        }
        writeFileSync(outputPath, output, "utf8");
        writeFileSync(logPath, "ok", "utf8");
        return output;
      },
    });

    const result = await client.generate({
      prompt: "규칙:\nJSON만 출력",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      cacheText: [
        "[SOURCE: recipe_candidate_hints]",
        "1. 두부볶음",
        "[SOURCE: transcript(ko)]",
        "00:01 두부 1컵과 간장 1큰술을 넣고 볶는다.",
      ].join("\n"),
    });

    expect(repairPrompts).toHaveLength(1);
    expect(repairPrompts[0]).toContain("Do not use web search");
    expect(repairPrompts[0]).toContain("onscreen text priority");
    expect(repairPrompts[0]).toContain("visual identity guard");
    expect(repairPrompts[0]).toContain("verified evidence gate");
    expect(repairPrompts[0]).toContain("evidenceSources");
    expect(repairPrompts[0]).toContain("crossRecipeRisk");
    expect(repairPrompts[0]).toContain("zero-patch guard");
    expect(repairPrompts[0]).toContain("low-confidence target checklist");
    expect(repairPrompts[0]).toContain("targetedGap");
    expect(result.json.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["두부", "간장"]);
    expect(result.json.recipes[0].steps).toEqual(["두부를 볶는다."]);
    expect(result.meta).toMatchObject({
      segmentedRepairMode: "source-gap-patch-verified",
      segmentedRepairPromptVersion: "keyframe-source-gap-patch-verified-repair-v7",
      segmentedRepairVerifiedPatch: true,
      segmentedRepairPatchCount: 3,
      segmentedRepairAppliedPatchCount: 1,
      segmentedRepairRejectedPatchCount: 2,
    });

    const repairPatches = JSON.parse(readFileSync(path.join(result.meta.codexVisionKeyframesCacheDir, "repair-patches.json"), "utf8"));
    expect(repairPatches.rejected.map((entry: { reason: string }) => entry.reason)).toEqual([
      "verified_ingredient_not_in_evidence",
      "verified_confidence_not_high",
    ]);
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
          expect(prompt).toContain("recipe identity anchor");
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
      sourceCuePacketVersion: "source-cue-packet-v5",
      segmentCount: 2,
      coveredCandidateCount: 2,
      supportingCandidateCount: 1,
    });
    expect(result.meta.sourceCuePacketHash).toEqual(expect.any(String));
    expect(calls.filter((call) => call.model === "fixture-selector-model")).toHaveLength(2);
    const selectorPrompts = calls.filter((call) => call.model === "fixture-selector-model").map((call) => call.prompt);
    expect(selectorPrompts.every((prompt) => prompt.includes("candidate source cue packet:"))).toBe(true);
    expect(selectorPrompts.every((prompt) => prompt.includes("sourceCuePacket:"))).toBe(true);
    expect(selectorPrompts.every((prompt) => prompt.includes("밑간, 기름 코팅, 향채 볶음, 매운 양념 베이스"))).toBe(true);
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
    const progress = JSON.parse(readFileSync(path.join(caseDir, "runs/codex-test/run-progress.json"), "utf8"));
    expect(progress).toMatchObject({
      videoId: "case-a",
      split: "train",
      outTag: "codex-test",
      provider: "codex-vision",
      phase: "completed",
      recipeCount: 1,
      ingredientCount: 1,
      stepCount: 1,
    });
    expect(progress.events.map((event: { phase: string }) => event.phase)).toEqual(expect.arrayContaining([
      "started",
      "source-loaded",
      "input-built",
      "extracting",
      "completed",
    ]));
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
      codexEffort: "low",
      selectorEffort: "low",
      segmentEffort: "low",
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
      "segment-selector-candidate-limit": "18",
      "segment-max-count": "7",
      "segment-frame-total-limit": "21",
      "segmented-final-mode": "per-segment",
      "segmented-repair-mode": "source-gap",
      "segment-bridge-frames": true,
      "segment-phase-anchor-frames": true,
      "visual-frame-ledger-prompt": true,
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
      segmentSelectorCandidateLimit: 18,
      segmentMaxCount: 7,
      segmentFrameTotalLimit: 21,
      segmentedFinalMode: "per-segment",
      segmentedRepairMode: "source-gap",
      segmentBridgeFrames: true,
      segmentPhaseAnchorFrames: true,
      visualFrameLedgerPrompt: true,
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

  it("parses VTT public subtitle segments", async () => {
    const { parseVttSegments } = await import(publicSourceCollectorModuleUrl);
    const segments = parseVttSegments([
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:03.000",
      "<c>Egg 2 pieces</c>",
      "",
      "00:00:03.500 --> 00:00:05.000",
      "Mix mayo 1 tbsp",
    ].join("\n"), { language: "en", sourceFile: "sample.en.vtt" });

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ text: "Egg 2 pieces", startMs: 1000, durationMs: 2000, language: "en" });
    expect(segments[1].text).toBe("Mix mayo 1 tbsp");
  });

  it("splits public-source compound sections into candidate ledgers with must-keep cues", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const bundle = buildPublicSourcePacketBundle(
      {
        video: {
          title: "멸치칼국수 등촌칼국수ㅣ소곱창구이ㅣ도토리 묵사발ㅣ마늘쫑 항정솥밥",
          description: [
            "00:00 미리보기",
            "07:40 등촌칼국수&소곱창구이",
            "10:23 열무묵국&항정살 솥밥",
          ].join("\n"),
          tags: ["도토리묵사발", "마늘쫑 항정솥밥"],
        },
      },
      {
        video: {
          title: "멸치칼국수 등촌칼국수ㅣ소곱창구이ㅣ도토리 묵사발ㅣ마늘쫑 항정솥밥",
          description: [
            "00:00 미리보기",
            "07:40 등촌칼국수&소곱창구이",
            "10:23 열무묵국&항정살 솥밥",
          ].join("\n"),
          tags: ["도토리묵사발", "마늘쫑 항정솥밥"],
        },
        subtitles: [{
          language: "en",
          segments: [
            { lineIndex: 0, text: "Adding fragrant water parsley", startMs: 500999, language: "en" },
            { lineIndex: 1, text: "Adding the frozen beef brisket", startMs: 502959, language: "en" },
            { lineIndex: 2, text: "Dump in the anchovy kalguksu flakes and soup base", startMs: 510334, language: "en" },
            { lineIndex: 3, text: "Keep the chives, an essential item for gopchang", startMs: 519000, language: "en" },
            { lineIndex: 4, text: "Beef tripe I bought online for the first time", startMs: 533959, language: "en" },
            { lineIndex: 5, text: "Dongchimi broth too", startMs: 673667, language: "en" },
            { lineIndex: 6, text: "The slushy texture is just perfect", startMs: 677292, language: "en" },
            { lineIndex: 7, text: "Add some flair with dried seaweed", startMs: 767709, language: "en" },
            { lineIndex: 8, text: "Finish it off with sesame salt", startMs: 769459, language: "en" },
            { lineIndex: 9, text: "Using pork jowl with garlic stems to make pot rice", startMs: 630500, language: "en" },
          ],
        }],
        warnings: [],
      },
    );

    expect(bundle.sections.map((section: { titleHint: string }) => section.titleHint)).not.toContain("미리보기");
    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual([
      "등촌식 멸치칼국수",
      "소곱창구이",
      "도토리 묵사발",
      "항정살 마늘쫑 솥밥",
    ]);

    const deungchon = bundle.candidateLedgers.find((ledger: { canonicalTitle: string }) => ledger.canonicalTitle === "등촌식 멸치칼국수");
    expect(deungchon.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(
      expect.arrayContaining(["미나리", "우삼겹", "라면 스프"]),
    );

    const muk = bundle.candidateLedgers.find((ledger: { canonicalTitle: string }) => ledger.canonicalTitle === "도토리 묵사발");
    expect(muk.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(
      expect.arrayContaining(["동치미 육수", "김", "깨"]),
    );
    expect(muk.interpretationNotes.join(" ")).toContain("차가운 국물");

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("Candidate ledgers");
    expect(promptText).toContain("must-keep ingredient: 동치미 육수");
    expect(promptText).toContain("Timeline sections");
  });

  it("turns description menu lists into separate public-source candidate ledgers", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const title = "자취요리 vlog #41 퇴근후 15분만에 만든 간단집밥 4가지";
    const description = [
      "퇴근 후 15분만에 만든 자취생의 집밥 요리🤍",
      "",
      "*메뉴*",
      "묵참김밥과 오뎅볶이",
      "파닭꼬치와 오꼬노미야끼",
      "닭갈비와 콘치즈",
      "해장파스타",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      { video: { title, description } },
      { video: { title, description }, subtitles: [], warnings: [] },
    );

    expect(bundle.sections.map((section: { source: string }) => section.source)).toEqual([
      "description_menu",
      "description_menu",
      "description_menu",
      "description_menu",
    ]);
    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual([
      "묵참김밥",
      "오뎅볶이",
      "파닭꼬치",
      "오꼬노미야끼",
      "닭갈비",
      "콘치즈",
      "해장파스타",
    ]);
    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).not.toContain(
      "자취요리 vlog 퇴근후 15분만에 만든 간단집밥 4가지",
    );

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("canonicalTitle: 묵참김밥");
    expect(promptText).toContain("canonicalTitle: 오뎅볶이");
    expect(promptText).toContain("source line: description: 묵참김밥과 오뎅볶이");
  });

  it("prioritizes gopchang visual cues and excludes purchase price amounts", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const bundle = buildPublicSourcePacketBundle(
      {
        video: {
          title: "등촌칼국수ㅣ소곱창구이",
          description: "07:40 등촌칼국수&소곱창구이",
        },
      },
      {
        video: {
          title: "등촌칼국수ㅣ소곱창구이",
          description: "07:40 등촌칼국수&소곱창구이",
        },
        subtitles: [{
          language: "en",
          segments: [
            { lineIndex: 0, text: "Keep the chives, an essential item for gopchang", startMs: 473125, language: "en" },
            { lineIndex: 1, text: "These days, if you want to buy beef intestines, 200g costs over 20,000 won", startMs: 537334, language: "en" },
            { lineIndex: 2, text: "Grilling tripe slowly while watching Infinite Challenge", startMs: 560584, language: "en" },
          ],
        }],
        warnings: [],
      },
      {
        visualAssist: {
          version: "visual-assist-test",
          cues: [
            { titleHint: "소곱창구이", text: "재료 첫 투입: 배추, 버섯, 채소, 고기 구성이 한 번에 보임", timestampSec: 465.523 },
            { titleHint: "소곱창구이", text: "양념 추가 단계가 보여 배합 흐름을 이해하기 좋음", timestampSec: 480.38 },
            { titleHint: "소곱창구이", text: "철판에 고기와 양파를 올려 굽는 조리 시작 장면", timestampSec: 554.666 },
            { titleHint: "소곱창구이", text: "고기가 여러 조각으로 익어가는 상태 전환이 잘 보임", timestampSec: 569.523 },
            { titleHint: "등촌칼국수", text: "소곱창구이용 불판과 곱창 투입 장면이 함께 보여 구이 파트를 이해하기 좋다", timestampSec: 544.762 },
          ],
        },
      },
    );

    const gopchang = bundle.candidateLedgers.find((ledger: { canonicalTitle: string }) => ledger.canonicalTitle === "소곱창구이");
    expect(gopchang.amountCues.map((ref: { text: string }) => ref.text)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("200g costs")]),
    );
    expect(gopchang.interpretationNotes.join(" ")).toContain("가격/구매 문맥");

    const visualTexts = gopchang.visualAssistCues.map((cue: { text: string }) => cue.text);
    expect(visualTexts.slice(0, 3).join(" ")).toMatch(/철판|굽|익어|곱창|불판/);
    expect(visualTexts.indexOf("재료 첫 투입: 배추, 버섯, 채소, 고기 구성이 한 번에 보임"))
      .toBeGreaterThan(visualTexts.indexOf("철판에 고기와 양파를 올려 굽는 조리 시작 장면"));

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("가격/구매 문맥");
  });

  it("attaches description refs to no-timeline title fallback packets", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const description = [
      "✅ [재료]",
      "전란 90g",
      "설탕 89g",
      "꿀 27g",
      "버터 65g",
      "",
      "180도 오븐에서 굽습니다.",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      {
        video: {
          title: "버터 향 가득한 명장 마들렌",
          description,
        },
      },
      {
        video: {
          title: "버터 향 가득한 명장 마들렌",
          description,
        },
        subtitles: [],
        warnings: [],
      },
    );

    expect(bundle.sections).toHaveLength(1);
    expect(bundle.sections[0].sourceLines.map((ref: { text: string }) => ref.text)).toEqual(
      expect.arrayContaining(["전란 90g", "버터 65g"]),
    );
    expect(bundle.candidateLedgers[0].canonicalTitle).toBe("버터 향 가득한 명장 마들렌");
    expect(bundle.candidateLedgers[0].sourceLines.map((ref: { text: string }) => ref.text)).toEqual(
      expect.arrayContaining(["전란 90g", "버터 65g"]),
    );
    expect(bundle.candidateLedgers[0].canonicalTitle).not.toBe("재료");

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("source line");
    expect(promptText).toContain("전란 90g");
    expect(promptText).toContain("버터 65g");
  });

  it("builds no-timeline description heading sections for multi-recipe videos", async () => {
    const { buildPublicSourcePacketBundle } = await import(publicSourcePacketsModuleUrl);
    const description = [
      "반찬 급할때 꼭 봐야할 밥도둑 반찬 6가지 레시피",
      "",
      "[표고버섯무침 재료]",
      "생표고버섯 12개(300g)",
      "대파 약간",
      "",
      "[Seasoned shiitake mushrooms Ingredient]",
      "12 fresh shiitake mushrooms (300g)",
      "",
      "[매콤감자조림 재료]",
      "감자 3개",
      "고춧가루 1큰술",
      "",
      "[오이무침 재료]",
      "오이 2개",
      "고추장 1큰술",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      {
        video: {
          title: "밥도둑 반찬 6가지 모음",
          description,
        },
      },
      {
        video: {
          title: "밥도둑 반찬 6가지 모음",
          description,
        },
        subtitles: [],
        warnings: [],
      },
    );

    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual([
      "표고버섯무침",
      "매콤감자조림",
      "오이무침",
    ]);
    const shiitake = bundle.candidateLedgers.find((ledger: { canonicalTitle: string }) => ledger.canonicalTitle === "표고버섯무침");
    expect(shiitake.sourceLines.map((ref: { text: string }) => ref.text)).toEqual(
      expect.arrayContaining(["생표고버섯 12개(300g)", "대파 약간"]),
    );
    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).not.toContain("재료");
    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).not.toContain("Seasoned shiitake mushrooms");
  });

  it("falls back from long no-timeline titles to the dish title", async () => {
    const { buildPublicSourcePacketBundle } = await import(publicSourcePacketsModuleUrl);
    const description = [
      "■재료",
      "고기 450g (3인분)",
      "대파1, 양파 1/2, 당근 쬐끔, 땡초2, 청초1, 홍초1",
      "■고기 누린내 밑간",
      "소주/맛술 2, 간마늘 1, 생강 0.3, 설탕 1",
      "■양념소스",
      "간장 3",
      "고추장 1.5~2",
      "고춧가루 2",
      "후추 솔솔, 참기름",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      {
        video: {
          title: "제육볶음 최상의 맛으로 끌어내는 법. 이 양념과 볶는방식으로 돼지누린내에서 해방되기. 제육볶음 양념 황금레시피",
          description,
        },
      },
      {
        video: {
          title: "제육볶음 최상의 맛으로 끌어내는 법. 이 양념과 볶는방식으로 돼지누린내에서 해방되기. 제육볶음 양념 황금레시피",
          description,
        },
        subtitles: [],
        warnings: [],
      },
    );

    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual(["제육볶음"]);
    expect(bundle.candidateLedgers[0].sourceLines.map((ref: { text: string }) => ref.text)).toEqual(
      expect.arrayContaining(["고기 450g (3인분)", "간장 3", "고추장 1.5~2"]),
    );
  });

  it("protects jeyuk sauce powder and meat-first high-heat flow", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const title = "제육볶음 최상의 맛으로 끌어내는 법. 이 양념과 볶는방식으로 돼지누린내에서 해방되기. 제육볶음 양념 황금레시피";
    const description = [
      "-땡초 2개 넣었기 땜에 고춧가루 도움없이도 충분히 칼칼하고",
      "",
      "■재료",
      "고기 450g (3인분)",
      "대파1, 양파 1/2, 당근 쬐끔, 땡초2, 청초1, 홍초1",
      "",
      "■고기 누린내 밑간 (밥숟갈)",
      "소주/맛술 2, 간마늘 1, 생강 0.3, 설탕 1",
      "**설탕 대신에 고추청 물 1.5 넣었어요.",
      "",
      "■양념소스 (밥숟갈) 넣어가면서 간보세요.",
      "-간장 3",
      "-고추장 1.5~2",
      "-고춧가루 2",
      "-매실청* 1~2",
      "-설탕(or 올리고당)* 1",
      "-후추 솔솔, 참기름",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      { video: { title, description } },
      {
        video: { title, description },
        subtitles: [{
          language: "ko",
          segments: [
            { lineIndex: 0, text: "이제 이거 고기를 먼저 강불에 딱 볶아 주면은 기름이 나와", startMs: 272680, language: "ko" },
            { lineIndex: 1, text: "야채 어 양념하고 야채 막 같이 볶아 주면은 훨씬 열전도가 떨어지거든", startMs: 281160, language: "ko" },
            { lineIndex: 2, text: "나 이거 방아입도 한 개 하려다. 이 방아입이거든.", startMs: 402240, language: "ko" },
          ],
        }],
        warnings: [],
      },
    );

    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual(["제육볶음"]);
    const jeyuk = bundle.candidateLedgers[0];
    const mustKeepNames = jeyuk.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name);
    expect(mustKeepNames).toEqual(expect.arrayContaining([
      "돼지고기",
      "대파",
      "양파",
      "당근",
      "맛술",
      "다진 마늘",
      "설탕",
      "고추청",
      "간장",
      "고추장",
      "고춧가루",
      "매실청",
      "올리고당",
      "후추",
      "참기름",
      "방아잎",
    ]));

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("고춧가루 2");
    expect(promptText).toContain("맵기 설명");
    expect(promptText).toContain("매실청 1~2");
    expect(promptText).toContain("고기만 먼저 강불");
    expect(promptText).toContain("양념을 먼저");
    expect(promptText).toContain("방아입");
    expect(promptText).toContain("방아잎");
  });

  it("keeps generic ingredient group headings under the title recipe", async () => {
    const { buildPublicSourcePacketBundle } = await import(publicSourcePacketsModuleUrl);
    const description = [
      "[메인 재료]",
      "당면 250g(1시간 불리기)",
      "식용유 4스푼",
      "물 1컵 반(300ml)",
      "[야채 준비]",
      "양파 1/2개, 당근 1/2개, 생표고버섯 3개, 부추 반줌",
      "[양념 재료]",
      "진간장 1/3컵(7스푼), 굴소스 2스푼, 미림 1/4컵",
      "다진마늘 가득 1스푼, 후추 1/4스푼, 참기름 1스푼, 통깨 2스푼",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      {
        video: {
          title: "하루가 지나도 절대 불지 않는 잡채 만들기",
          description,
        },
      },
      {
        video: {
          title: "하루가 지나도 절대 불지 않는 잡채 만들기",
          description,
        },
        subtitles: [],
        warnings: [],
      },
    );

    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual(["불지 않는 잡채"]);
    expect(bundle.candidateLedgers[0].sourceLines.map((ref: { text: string }) => ref.text)).toEqual(
      expect.arrayContaining(["당면 250g(1시간 불리기)", "양파 1/2개, 당근 1/2개, 생표고버섯 3개, 부추 반줌", "진간장 1/3컵(7스푼), 굴소스 2스푼, 미림 1/4컵"]),
    );
    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).not.toContain("메인");
    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).not.toContain("야채 준비");
  });

  it("normalizes dasima gochu dadaegi and protects its source-backed ingredients", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const title = "(속보) 안사돈이 알려준 다시마 고추다대기 만드는 방법 | How to make kelp red pepper paste";
    const bundle = buildPublicSourcePacketBundle(
      {
        video: {
          title,
          description: "디시마 이제 육수로만 쓰지 마세요",
        },
      },
      {
        video: {
          title,
          description: "디시마 이제 육수로만 쓰지 마세요",
        },
        subtitles: [{
          language: "ko",
          segments: [
            { lineIndex: 0, text: "먼저 다시마를 물에 담가 30분 정도 불립니다", startMs: 35000, language: "ko" },
            { lineIndex: 1, text: "얼마 전에 된장 맛있게 만드는 방법 올렸더니", startMs: 48000, language: "ko" },
            { lineIndex: 2, text: "일단 마늘이 필요합니다", startMs: 67000, language: "ko" },
            { lineIndex: 3, text: "굵은 멸치도 준비합니다", startMs: 86000, language: "ko" },
            { lineIndex: 4, text: "고추도 칼로 다지면 맛있고 매운 것과 안 매운 것을 섞어도 됩니다", startMs: 120000, language: "ko" },
            { lineIndex: 5, text: "기름을 두르고 멸치 다져 놓은 것을 볶아 줍니다", startMs: 267000, language: "ko" },
            { lineIndex: 6, text: "어느 정도 볶아지면 다져놓은 다시마를 넣어 줍니다", startMs: 294000, language: "ko" },
            { lineIndex: 7, text: "간장을 부어 줍니다", startMs: 363000, language: "ko" },
            { lineIndex: 8, text: "물을 조금 자박하게 부어 한소끔 끓입니다", startMs: 384000, language: "ko" },
            { lineIndex: 9, text: "마늘 찧어 놓은 것 넣고 고춧가루도 조금 넣고 올리고당이나 물엿을 적당량 넣어줍니다", startMs: 412000, language: "ko" },
          ],
        }],
        warnings: [],
      },
    );

    const ledger = bundle.candidateLedgers[0];
    expect(ledger.canonicalTitle).toBe("다시마 고추다대기");

    const mustKeepNames = ledger.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name);
    expect(mustKeepNames).toEqual(expect.arrayContaining([
      "다시마",
      "마늘",
      "멸치",
      "고추",
      "식용유",
      "간장",
      "물",
      "고춧가루",
      "올리고당",
    ]));
    expect(mustKeepNames).not.toEqual(expect.arrayContaining(["된장", "후추"]));

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("red/chili pepper");
    expect(promptText).toContain("볶음 흐름");
    expect(promptText).toContain("된장은 이전 레시피 언급");
    expect(promptText).toContain("물을 조금 자박하게");
    expect(promptText).toContain("한소끔");
    expect(promptText).toContain("적당량 source이면 amount/unit은 null");
  });

  it("normalizes tofu stir-fry title and protects sauce-first pepper tofu flow", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const title = "[두부볶음] 두부 반찬 중에 단연코 최고! / 두부요리 Stir-fried tofu";
    const description = [
      "두부조림보다 훨씬 맛있는 '두부볶음'",
      "--------------- 재료 -------------",
      "큰 사이즈 두부 1모(550g)",
      "꽈리고추 150g(한 봉지)",
      "홍고추 1개",
      "대파 흰대 15cm",
      "양조간장(또는 진장장) 6스푼(60g)",
      "설탕 1작은스푼(5g)",
      "조청(또는 물엿) 2스푼(30g)",
      "다진 마늘 크게 1스푼(25g)",
      "맛술(미림) 5스푼(50g)",
      "후추가루",
      "통깨 1스푼",
      "참기름 1스푼",
      "식용유 3스푼",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      { video: { title, description } },
      {
        video: { title, description },
        subtitles: [{
          language: "ko",
          segments: [
            { lineIndex: 0, text: "두부를 가로 방향으로 자른 후 2cm 깍둑 모양으로 잘라주세요", startMs: 19869, language: "ko" },
            { lineIndex: 1, text: "키친타월을 깔고 썰어 놓았던 두부 물기를 제거해주세요", startMs: 40329, language: "ko" },
            { lineIndex: 2, text: "팬에 식용유 3스푼을 넣고 두부를 노릇하게 부쳐주세요", startMs: 160000, language: "ko" },
            { lineIndex: 3, text: "두부의 모든 면이 노릇하면 잠시 접시로 옮겨 담아 주세요", startMs: 183000, language: "ko" },
            { lineIndex: 4, text: "남은 팬에 만들어 놓은 양념장을 부어 중불에서 끓여주세요", startMs: 207000, language: "ko" },
            { lineIndex: 5, text: "양념장이 끓어오르면 꽈리고추를 먼저 넣고 약 3분 볶아주세요", startMs: 231000, language: "ko" },
            { lineIndex: 6, text: "노릇하게 부쳐 놓았던 두부도 모두 넣고 같이 볶아주세요", startMs: 255000, language: "ko" },
            { lineIndex: 7, text: "양념이 졸아들면 약불로 줄이고 홍고추와 통깨, 참기름을 넣어 섞어주세요", startMs: 287000, language: "ko" },
          ],
        }],
        warnings: [],
      },
    );

    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual(["두부볶음"]);
    const tofu = bundle.candidateLedgers[0];
    const mustKeepNames = tofu.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name);
    expect(mustKeepNames).toEqual(expect.arrayContaining([
      "두부",
      "꽈리고추",
      "홍고추",
      "대파",
      "간장",
      "설탕",
      "올리고당",
      "물엿",
      "다진 마늘",
      "맛술",
      "후추",
      "통깨",
      "참기름",
      "식용유",
    ]));

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("2cm 깍둑");
    expect(promptText).toContain("물기를 제거");
    expect(promptText).toContain("잠시 덜어");
    expect(promptText).toContain("꽈리고추를 먼저");
    expect(promptText).toContain("구운 두부를 다시");
    expect(promptText).toContain("참기름은 양념장에 미리 섞지 않는다");
    expect(promptText).toContain("후춧가루 세 꼬집");
  });

  it("splits enumerated one-pot pasta subtitles into recipe ledgers", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const title = "The Easiest One Pot Pasta Ever (3 Ways)";
    const bundle = buildPublicSourcePacketBundle(
      {
        video: {
          title,
          tags: [
            "One pot chicken pasta",
            "rigatoni recipes",
            "carbonara",
            "carbonara recipe",
            "creamy chicken pasta",
          ],
          description: "Ingredients Needed: https://example.com/one-pot-pasta-3-ways",
        },
      },
      {
        video: {
          title,
          tags: [
            "One pot chicken pasta",
            "rigatoni recipes",
            "carbonara",
            "carbonara recipe",
            "creamy chicken pasta",
          ],
          description: "Ingredients Needed: https://example.com/one-pot-pasta-3-ways",
        },
        subtitles: [{
          language: "en",
          segments: [
            { lineIndex: 0, text: "now for pasta one which also happens to be one pot", startMs: 27000, language: "en" },
            { lineIndex: 1, text: "add 12 ounces or 350 grams of linguine", startMs: 42000, language: "en" },
            { lineIndex: 2, text: "add 12 ounces or 350 grams of cherry tomatoes", startMs: 52000, language: "en" },
            { lineIndex: 3, text: "four and a half cups or one and a quarter liter of water", startMs: 64000, language: "en" },
            { lineIndex: 4, text: "stir in four sprigs of basil", startMs: 75000, language: "en" },
            { lineIndex: 5, text: "Pasta number two yes also one pot", startMs: 89000, language: "en" },
            { lineIndex: 6, text: "two boneless skinless chicken breasts", startMs: 99000, language: "en" },
            { lineIndex: 7, text: "just enough high heat cooking oil to coat the bottom of the pan", startMs: 108000, language: "en" },
            { lineIndex: 8, text: "add one medium shallot four cloves of garlic and one large tomato diced", startMs: 128000, language: "en" },
            { lineIndex: 9, text: "add in your favorite Cajun seasoning", startMs: 145000, language: "en" },
            { lineIndex: 10, text: "add 8 ounces or 226 grams of rigatoni", startMs: 148000, language: "en" },
            { lineIndex: 11, text: "add one and a half cups or 375 milliliters of water", startMs: 152000, language: "en" },
            { lineIndex: 12, text: "add in two cups or 500 milliliters of heavy cream", startMs: 160000, language: "en" },
            { lineIndex: 13, text: "last but not least is the carbonara", startMs: 199000, language: "en" },
            { lineIndex: 14, text: "once your water is boiling add 12 ounces or 350 grams of spaghetti", startMs: 239000, language: "en" },
            { lineIndex: 15, text: "pecorino cheese Parmigiano-Reggiano and egg yolks mixed together", startMs: 250000, language: "en" },
          ],
        }],
        warnings: [],
      },
    );

    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual([
      "원 팟 토마토 바질 링귀네",
      "원 팟 크리미 케이준 치킨 리가토니",
      "전통 카르보나라",
    ]);

    const cajun = bundle.candidateLedgers.find((ledger: { canonicalTitle: string }) => ledger.canonicalTitle === "원 팟 크리미 케이준 치킨 리가토니");
    const mustKeepNames = cajun.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name);
    expect(mustKeepNames).toEqual(expect.arrayContaining(["닭고기", "식용유", "샬롯", "토마토", "케이준 시즈닝", "리가토니", "물", "생크림"]));
    expect(mustKeepNames).not.toEqual(expect.arrayContaining(["라면 스프"]));

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("canonicalTitle: 원 팟 크리미 케이준 치킨 리가토니");
    expect(promptText).toContain("must-keep ingredient: 생크림");
    expect(promptText).toContain("high heat cooking oil을 식용유 단서");
    expect(promptText).toContain("리가토니와 물을 먼저");
  });

  it("protects japchae low-heat coating and cooling flow", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const title = "하루가 지나도 절대 불지 않는 잡채 만들기";
    const description = [
      "[메인 재료]",
      "당면 250g(1시간 불리기)",
      "식용유 4스푼",
      "물 1컵 반(300ml)",
      "",
      "[야채 준비]",
      "양파 1/2개, 당근 1/2개, 생표고버섯 3개, 부추 반줌(겨울에는 시금치 사용)",
      "",
      "[양념 재료]",
      "진간장 1/3컵(7스푼), 굴소스 2스푼, 미림 1/4컵, 흑설탕 가득 2스푼,",
      "다진마늘 가득 1스푼, 후추 1/4스푼, 참기름 1스푼, 통깨 2스푼",
      "",
      "(마지막 넓은 그릇에 옮겨 식혀주기)",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      { video: { title, description } },
      {
        video: { title, description },
        subtitles: [{
          language: "ko",
          segments: [
            { lineIndex: 0, text: "먼저 팬 가열 하기 전에 불린 당면을 넣습니다", startMs: 120000, language: "ko" },
            { lineIndex: 1, text: "식용유 4스푼 사용합니다 코팅을 해줍니다", startMs: 124000, language: "ko" },
            { lineIndex: 2, text: "가스불을 약하게 중약불로 해주세요", startMs: 149000, language: "ko" },
            { lineIndex: 3, text: "양파 하고 당근을 넣어 줍니다", startMs: 198000, language: "ko" },
            { lineIndex: 4, text: "물 1컵 반 넣겠습니다 바로 표고버섯 넣습니다", startMs: 209000, language: "ko" },
            { lineIndex: 5, text: "그 다음엔 부추를 넣습니다 겨울에는 시금치가 올립니다", startMs: 238000, language: "ko" },
            { lineIndex: 6, text: "큰 용기 준비해서 바로 부어줍니다 펼칩니다 그러면 잡채가 불지 않습니다", startMs: 260000, language: "ko" },
          ],
        }],
        warnings: [],
      },
    );

    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual(["불지 않는 잡채"]);
    const japchae = bundle.candidateLedgers[0];
    const mustKeepNames = japchae.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name);
    expect(mustKeepNames).toEqual(expect.arrayContaining([
      "당면",
      "식용유",
      "물",
      "양파",
      "당근",
      "생표고버섯",
      "부추",
      "진간장",
      "굴소스",
      "미림",
      "흑설탕",
      "다진 마늘",
      "후추",
      "참기름",
      "통깨",
    ]));
    expect(mustKeepNames).not.toEqual(expect.arrayContaining(["시금치"]));

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("팬 가열 전");
    expect(promptText).toContain("중약불");
    expect(promptText).toContain("넓은 그릇");
    expect(promptText).toContain("시금치");
    expect(promptText).toContain("대체 선택지");
  });

  it("normalizes kimchi jjigae title and discourages optional discussion ingredients", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const title = "백선생의 원조 ′김치찌개′ 레시피 | [집밥백선생 : 이웃집레시피] How to make Paik Jong Won′s Kimchi Jjigae";
    const bundle = buildPublicSourcePacketBundle(
      {
        video: {
          title,
          description: "돼지고기 김치찌개 레시피",
        },
      },
      {
        video: {
          title,
          description: "돼지고기 김치찌개 레시피",
        },
        subtitles: [{
          language: "ko",
          segments: [
            { lineIndex: 0, text: "김치찌개에 가장 베이직 기본은 돼지고기와 김치입니다", startMs: 11000, language: "ko" },
            { lineIndex: 1, text: "물 대신 쌀뜨물로 끓이면 더 낫습니다", startMs: 41000, language: "ko" },
            { lineIndex: 2, text: "고기와 김치 비율은 3대1 정도가 좋습니다", startMs: 100000, language: "ko" },
            { lineIndex: 3, text: "볶지 않고 찌개 위기의 맛이 되는 것 같습니다", startMs: 185000, language: "ko" },
            { lineIndex: 4, text: "김치 국물도 되고 국간장과 소금으로 맞춥니다", startMs: 287000, language: "ko" },
            { lineIndex: 5, text: "양파와 고추장 된장은 선택 질문으로 이야기합니다", startMs: 346000, language: "ko" },
          ],
        }],
        warnings: [],
      },
    );

    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual(["돼지고기 김치찌개"]);
    const jjigae = bundle.candidateLedgers[0];
    const mustKeepNames = jjigae.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name);
    expect(mustKeepNames).toEqual(expect.arrayContaining(["돼지고기", "김치", "쌀뜨물", "국간장", "소금"]));
    expect(mustKeepNames).not.toEqual(expect.arrayContaining(["고추장", "된장", "양파", "부추", "식용유"]));

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("볶지 않고");
    expect(promptText).toContain("쌀뜨물");
    expect(promptText).toContain("토론/선택 문맥");
    expect(promptText).toContain("후추는 마지막");
    expect(promptText).toContain("대파를 추측 추가하지 않는다");
  });

  it("protects PBHWL shiitake and cucumber banchan step flow from description-only source", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const title = "우리집 밥솥 거덜내는 밥도둑 반찬 6가지 모음";
    const description = [
      "반찬 급할때 꼭 봐야할 밥솥 거덜내는 반찬 6가지 레시피",
      "",
      "[표고버섯무침 재료]",
      "생표고버섯 12개(300g)",
      "대파 약간",
      "소금 3꼬집",
      "생수 4큰술",
      "양념:",
      "까나리액젓 1큰술",
      "다진마늘 1/2큰술",
      "매실액 1/2큰술",
      "참기름 1큰술",
      "깨소금 1.5큰술",
      "",
      "[오이무침 재료]",
      "백오이 3개",
      "양파 1/3개",
      "쪽파 6줄",
      "홍고추 1개",
      "설탕 3큰술",
      "식초 3큰술",
      "통깨 1큰술",
      "양념:",
      "고춧가루 3큰술",
      "멸치/까나리 액젓 2큰술",
      "진간장 1큰술",
      "다진마늘 1큰술",
      "매실액 1큰술",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      { video: { title, description } },
      { video: { title, description }, subtitles: [], warnings: [] },
    );

    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual([
      "표고버섯무침",
      "오이무침",
    ]);

    const shiitake = bundle.candidateLedgers.find((ledger: { canonicalTitle: string }) => ledger.canonicalTitle === "표고버섯무침");
    const shiitakeMustKeep = shiitake.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name);
    expect(shiitakeMustKeep).toEqual(expect.arrayContaining([
      "생표고버섯",
      "대파",
      "소금",
      "물",
      "까나리액젓",
      "다진 마늘",
      "매실액",
      "참기름",
      "깨소금",
    ]));
    expect(shiitakeMustKeep).not.toEqual(expect.arrayContaining(["느타리버섯"]));

    const cucumber = bundle.candidateLedgers.find((ledger: { canonicalTitle: string }) => ledger.canonicalTitle === "오이무침");
    const cucumberMustKeep = cucumber.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name);
    expect(cucumberMustKeep).toEqual(expect.arrayContaining([
      "오이",
      "양파",
      "쪽파",
      "고추",
      "설탕",
      "식초",
      "통깨",
      "고춧가루",
      "멸치액젓",
      "까나리액젓",
      "진간장",
      "다진 마늘",
      "매실액",
    ]));

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("볶아 숨을 죽이고");
    expect(promptText).toContain("식힌 뒤");
    expect(promptText).toContain("설탕·식초");
    expect(promptText).toContain("물기를");
    expect(promptText).toContain("쪽파");
  });

  it("protects PBHWL pork belly braise frying and glazing flow from description-only source", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const title = "우리집 밥솥 거덜내는 밥도둑 반찬 6가지 모음";
    const description = [
      "반찬 급할때 꼭 봐야할 밥솥 거덜내는 반찬 6가지 레시피",
      "",
      "[삼겹살조림 재료]",
      "삼겹살 600g",
      "대파 1대",
      "상추 7장",
      "청양고추 3개",
      "베트남고추 7개",
      "마늘 7알",
      "감자전분 2/3컵",
      "소금, 후추",
      "양념장:",
      "진간장 2.5큰술",
      "맛술 2큰술",
      "물엿 2큰술",
      "설탕 2/3큰술",
      "다진생강 1작은술",
      "후추",
      "파채소스:",
      "진간장 1큰술",
      "식초 1큰술",
      "매실액 2큰술",
      "참기름 1큰술",
      "통깨 1큰술",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      { video: { title, description } },
      { video: { title, description }, subtitles: [], warnings: [] },
    );

    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual(["삼겹살조림"]);

    const porkBelly = bundle.candidateLedgers[0];
    const mustKeepNames = porkBelly.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name);
    expect(mustKeepNames).toEqual(expect.arrayContaining([
      "삼겹살",
      "대파",
      "상추",
      "청양고추",
      "베트남고추",
      "마늘",
      "감자전분",
      "소금",
      "후추",
      "진간장",
      "맛술",
      "물엿",
      "설탕",
      "다진생강",
      "식초",
      "매실액",
      "참기름",
      "통깨",
    ]));

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("튀기듯");
    expect(promptText).toContain("마늘을 따로");
    expect(promptText).toContain("졸여");
    expect(promptText).toContain("버무");
    expect(promptText).toContain("양념장 후추");
    expect(promptText).toContain("화면/onscreen 단서");
    expect(promptText).toContain("visual-estimate");
    expect(promptText).toContain("파채를 깔고");

    const visualBundle = buildPublicSourcePacketBundle(
      { video: { title, description } },
      { video: { title, description }, subtitles: [], warnings: [] },
      {
        visualAssist: {
          version: "public-source-visual-assist-test",
          cues: [
            {
              source: "keyframe_selector",
              titleHint: title,
              text: "감자 전분 씻는 손질",
              timestampSec: 123.639,
            },
            {
              source: "keyframe_selector",
              titleHint: title,
              text: "삼겹살 600g 밑간 시작",
              timestampSec: 563.795,
            },
            {
              source: "keyframe_selector",
              titleHint: title,
              text: "청양고추와 구운마늘 넣고 마무리 볶기",
              timestampSec: 692.381,
            },
          ],
        },
      },
    );
    const visualPorkBelly = visualBundle.candidateLedgers[0];
    const visualCueTexts = visualPorkBelly.visualAssistCues.map((cue: { text: string }) => cue.text);
    expect(visualCueTexts).toEqual(expect.arrayContaining([
      "삼겹살 600g 밑간 시작",
      "청양고추와 구운마늘 넣고 마무리 볶기",
    ]));
    expect(visualCueTexts).not.toEqual(expect.arrayContaining(["감자 전분 씻는 손질"]));
    expect(formatPublicSourcePacketsForPrompt(visualBundle)).toContain("weak visual cue");
  });

  it("protects PBHWL potato pepper and anchovy side dish step order from description-only source", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const title = "우리집 밥솥 거덜내는 밥도둑 반찬 6가지 모음";
    const description = [
      "반찬 급할때 꼭 봐야할 밥솥 거덜내는 반찬 6가지 레시피",
      "",
      "[매콤감자조림 재료]",
      "감자 3개(500g)",
      "대파 1/2대",
      "청양고추 2개",
      "다진마늘 1큰술",
      "물엿 3큰술",
      "진간장 2큰술",
      "고추장 1큰술",
      "참기름 1/2큰술",
      "식용유 3큰술",
      "통깨",
      "",
      "[꽈리고추조림 재료]",
      "꽈리고추 350g",
      "대파 1/3대(흰부분)",
      "참기름 1큰술",
      "통깨",
      "양념장:",
      "진간장 3큰술",
      "고추장 1큰술",
      "고춧가루 1큰술",
      "다진마늘 1.5큰술",
      "올리고당 1큰술",
      "설탕 1/2큰술",
      "(멸치 또는 까나리)액젓 1큰술",
      "물 60ml",
      "",
      "[잔멸치볶음 재료]",
      "잔멸치 150g",
      "마늘 10알",
      "청양고추 3개",
      "홍고추 2개",
      "들기름 1큰술",
      "식용유 1큰술",
      "맛술 3큰술",
      "설탕 1.5큰술",
      "올리고당 1큰술",
      "참기름 1큰술",
      "통깨 1큰술",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      { video: { title, description } },
      { video: { title, description }, subtitles: [], warnings: [] },
    );

    expect(bundle.candidateLedgers.map((ledger: { canonicalTitle: string }) => ledger.canonicalTitle)).toEqual([
      "매콤감자조림",
      "꽈리고추조림",
      "잔멸치볶음",
    ]);

    const potato = bundle.candidateLedgers.find((ledger: { canonicalTitle: string }) => ledger.canonicalTitle === "매콤감자조림");
    expect(potato.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(expect.arrayContaining([
      "감자",
      "대파",
      "청양고추",
      "다진 마늘",
      "물엿",
      "진간장",
      "고추장",
      "참기름",
      "식용유",
      "통깨",
    ]));

    const pepper = bundle.candidateLedgers.find((ledger: { canonicalTitle: string }) => ledger.canonicalTitle === "꽈리고추조림");
    expect(pepper.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(expect.arrayContaining([
      "꽈리고추",
      "대파",
      "참기름",
      "통깨",
      "진간장",
      "고추장",
      "고춧가루",
      "다진 마늘",
      "올리고당",
      "설탕",
      "멸치액젓",
      "까나리액젓",
      "물",
    ]));

    const anchovy = bundle.candidateLedgers.find((ledger: { canonicalTitle: string }) => ledger.canonicalTitle === "잔멸치볶음");
    expect(anchovy.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(expect.arrayContaining([
      "잔멸치",
      "마늘",
      "청양고추",
      "홍고추",
      "들기름",
      "식용유",
      "맛술",
      "설탕",
      "올리고당",
      "참기름",
      "통깨",
    ]));

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("전분을 헹구");
    expect(promptText).toContain("물엿에");
    expect(promptText).toContain("뚜껑");
    expect(promptText).toContain("먼저 볶");
    expect(promptText).toContain("덮어 익");
    expect(promptText).toContain("대파는 후반");
    expect(promptText).toContain("마늘을 먼저");
    expect(promptText).toContain("잔멸치 150g");
    expect(promptText).toContain("청·홍고추를 후반");
    expect(promptText).toContain("양념을 끓");
    expect(promptText).toContain("다시 넣어 코팅");
  });

  it("keeps ratatouille source-backed oil and scrap vegetable flow without noisy ingredients", async () => {
    const { buildPublicSourcePacketBundle, formatPublicSourcePacketsForPrompt } = await import(publicSourcePacketsModuleUrl);
    const title = "No Oven! 근사한 브런치가되는 채소 스튜, 노오븐 라따뚜이";
    const description = [
      title,
      "물 약간 붓고 라면 스프를 넣으면 토마토 스프가 되지않을까.. 라는 생각도 합니다.",
      "* 재료 ingredients",
      "- ★토마토소스 360ml tomato sauce",
      "- 파마산치즈 Parmesan cheese",
      "- 후추와 소금 pepper and salt",
      "- 그외 좋아하는 채소들 가지, 토마토, 애호박 등등",
    ].join("\n");
    const bundle = buildPublicSourcePacketBundle(
      { video: { title, description } },
      {
        video: { title, description },
        subtitles: [{
          language: "ko",
          segments: [
            { lineIndex: 0, text: "오늘 제가 요리할 재료는 토마토와 가지 그리고 쥬키니 사용하였어요", startMs: 28220, language: "ko" },
            { lineIndex: 1, text: "양파 반개 다지고 다진마늘 1스푼 준비했어요", startMs: 76000, language: "ko" },
            { lineIndex: 2, text: "기름을 두르고 양파와 마늘, 자투리 채소를 볶을 거예요", startMs: 105010, language: "ko" },
            { lineIndex: 3, text: "불을 끄고 자투리로 큼직하게 쌓아 놓았던 끄트머리 채소들은 모두 건져 주었어요", startMs: 157880, language: "ko" },
            { lineIndex: 4, text: "토마토소스 360 미리 종이컵 2컵 분량 모두 넣어주었어요", startMs: 171459, language: "ko" },
            { lineIndex: 5, text: "토마토 소스를 넓게 펼친 뒤 재료들을 원형으로 둘러서 얹어주세요", startMs: 179530, language: "ko" },
          ],
        }],
      },
    );

    const ledger = bundle.candidateLedgers.find((candidate: { canonicalTitle: string }) => candidate.canonicalTitle === "노오븐 라따뚜이");
    expect(ledger).toBeTruthy();
    const mustKeepNames = ledger.mustKeepIngredients.map((ingredient: { name: string }) => ingredient.name);
    expect(mustKeepNames).toEqual(expect.arrayContaining([
      "토마토소스",
      "토마토",
      "가지",
      "애호박",
      "양파",
      "다진 마늘",
      "식용유",
      "파르미지아노 레지아노",
    ]));
    expect(mustKeepNames).not.toEqual(expect.arrayContaining(["라면 스프", "달걀"]));

    const promptText = formatPublicSourcePacketsForPrompt(bundle);
    expect(promptText).toContain("자투리 채소를 볶");
    expect(promptText).toContain("건져내기 단계");
    expect(promptText).toContain("토마토소스 360ml");
  });

  it("keeps ratatouille recovered cooking oil through alias and inserts scrap-vegetable drain step", async () => {
    const { extractRecipeFromSources } = await import(extractionLabModuleUrl);
    const result = await extractRecipeFromSources(
      { video: { videoId: "case-yud-ratatouille", title: "노오븐 라따뚜이" } },
      {
        sourceMode: "public-source",
        useVisual: false,
        useEvidencePackets: false,
        publicSourceBundle: {
          version: "public-source-packet-test",
          publicSourceText: [
            "노오븐 라따뚜이",
            "기름을 두르고 양파와 마늘을 볶습니다.",
            "불을 끄고 자투리로 큼직하게 쌓아 놓았던 끄트머리 채소들은 모두 건져 주었어요.",
            "토마토소스 360ml를 넓게 펼쳐요.",
          ].join("\n"),
          sections: [],
          candidateLedgers: [],
        },
        llm: {
          generate: async () => ({
            cached: false,
            model: "fixture-public-model",
            provider: "public-source-gpt",
            json: {
              recipes: [{
                title: "노오븐 라따뚜이",
                ingredients: [
                  { name: "토마토소스", amount: "360", unit: "ml", amountBasis: "stated" },
                  { name: "토마토", amount: null, unit: null, amountBasis: null },
                  { name: "가지", amount: null, unit: null, amountBasis: null },
                  { name: "애호박", amount: null, unit: null, amountBasis: null },
                  { name: "양파", amount: "1/2", unit: "개", amountBasis: "spoken" },
                  { name: "다진 마늘", amount: "1", unit: "큰술", amountBasis: "spoken" },
                ],
                steps: [
                  "기름을 두르고 다진 양파와 다진 마늘을 짧게 볶는다.",
                  "토마토소스 360ml를 바닥에 넓게 펼친다.",
                  "토마토, 가지, 애호박을 원형으로 올리고 뚜껑을 덮어 익힌다.",
                ],
              }],
            },
          }),
        },
      },
    );

    const recipe = result.recipes[0];
    expect(recipe.ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "식용유",
        nameAliases: expect.arrayContaining(["기름"]),
        amount: "2",
        unit: "큰술",
        amountBasis: "visual-estimate",
      }),
    ]));
    expect(recipe.steps.join(" ")).toContain("자투리 채소는 모두 건져");
    expect(result.meta.droppedUnusedVisualIngredients).toBe(0);
  });

  it("keeps public-source candidate ledger recipes even when the model omits weak candidates", async () => {
    const { extractRecipeFromSources } = await import(extractionLabModuleUrl);
    const result = await extractRecipeFromSources(
      { video: { videoId: "case-menu-list", title: "간단집밥 2가지" } },
      {
        sourceMode: "public-source",
        useVisual: false,
        useEvidencePackets: false,
        publicSourceBundle: {
          version: "public-source-packet-test",
          publicSourceText: [
            "Candidate ledgers:",
            "canonicalTitle: 묵참김밥",
            "canonicalTitle: 오뎅볶이",
          ].join("\n"),
          sections: [],
          candidateLedgers: [
            {
              candidateId: "section-01-candidate-01",
              parentSectionId: "section-01",
              canonicalTitle: "묵참김밥",
              titleAliases: [],
              confidence: "source_confirmed",
              timeRange: { startMs: null, endMs: null },
              warnings: [],
              sourceLines: [],
              ingredientCues: [],
              amountCues: [],
              stepCues: [],
              mustKeepIngredients: [],
              visualAssistCues: [],
              visualMustKeepIngredients: [],
              interpretationNotes: [],
            },
            {
              candidateId: "section-01-candidate-02",
              parentSectionId: "section-01",
              canonicalTitle: "오뎅볶이",
              titleAliases: [],
              confidence: "source_confirmed",
              timeRange: { startMs: null, endMs: null },
              warnings: [],
              sourceLines: [],
              ingredientCues: [],
              amountCues: [],
              stepCues: [],
              mustKeepIngredients: [],
              visualAssistCues: [],
              visualMustKeepIngredients: [],
              interpretationNotes: [],
            },
          ],
        },
        llm: {
          generate: async () => ({
            cached: false,
            model: "fixture-public-model",
            provider: "public-source-gpt",
            json: {
              recipes: [{
                title: "오뎅볶이",
                ingredients: [{ name: "어묵", amount: null, unit: null, amountBasis: null }],
                steps: ["어묵을 팬에 볶는다."],
              }],
            },
          }),
        },
      },
    );

    expect(result.recipes.map((recipe: { title: string }) => recipe.title)).toEqual(["오뎅볶이", "묵참김밥"]);
    expect(result.meta.publicSourceCandidateCoverageRecoveries).toBe(1);
  });

  it("keeps recovered pork belly scallion sauce chili powder used in a step", async () => {
    const { extractRecipeFromSources } = await import(extractionLabModuleUrl);
    const result = await extractRecipeFromSources(
      { video: { videoId: "case-pbhwl-pork-belly", title: "삼겹살조림" } },
      {
        sourceMode: "public-source",
        useVisual: false,
        useEvidencePackets: false,
        publicSourceBundle: {
          version: "public-source-packet-test",
          publicSourceText: "삼겹살조림 파채소스 화면 단서",
          sections: [],
          candidateLedgers: [],
        },
        llm: {
          generate: async () => ({
            cached: false,
            model: "fixture-public-model",
            provider: "public-source-gpt",
            json: {
              recipes: [{
                title: "삼겹살조림",
                ingredients: [
                  { name: "삼겹살", amount: "600", unit: "g", amountBasis: "stated" },
                  { name: "대파", amount: "1", unit: "대", amountBasis: "stated", groupLabel: "파채소스" },
                  { name: "참기름", amount: "1", unit: "큰술", amountBasis: "stated", groupLabel: "파채소스" },
                  { name: "통깨", amount: "1", unit: "큰술", amountBasis: "stated", groupLabel: "파채소스" },
                ],
                steps: [
                  "삼겹살에 소금과 후추로 밑간한 뒤 감자전분을 고루 묻힌다.",
                  "채 썬 대파에 진간장 1큰술, 식초, 매실액, 참기름을 섞어 파채소스를 만들고, 삼겹살조림에 통깨를 뿌려 상추와 함께 곁들인다.",
                ],
              }],
            },
          }),
        },
      },
    );

    const recipe = result.recipes[0];
    expect(recipe.ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "고춧가루",
        amount: "1/2",
        unit: "큰술",
        amountBasis: "visual-estimate",
        groupLabel: "파채소스",
      }),
    ]));
    expect(recipe.steps.join(" ")).toContain("고춧가루 1/2큰술");
    expect(recipe.steps.join(" ")).toContain("파채소스를 넣고 버무린 뒤");
    expect(recipe.steps.join(" ")).toContain("삼겹살조림과 함께 낸다");
    expect(result.meta.lowTailVisualRecoveries).toBeGreaterThanOrEqual(2);
    expect(result.meta.droppedUnusedVisualIngredients).toBe(0);
  });

  it("uses candidate ledger text for public-source stew seasoning recovery", async () => {
    const { extractRecipeFromSources } = await import(extractionLabModuleUrl);
    const publicSourceBundle = {
      version: "public-source-packet-test",
      video: { title: "등촌칼국수&소곱창구이" },
      source: {},
      sections: [],
      candidateLedgers: [
        {
          candidateId: "section-01-candidate-01",
          parentSectionId: "section-01",
          canonicalTitle: "등촌식 멸치칼국수",
          titleAliases: ["등촌칼국수"],
          confidence: "source_confirmed",
          timeRange: { startMs: 0, endMs: 60000 },
          sourceLines: [
            { source: "subtitle:en", text: "Dump in the anchovy kalguksu flakes and soup base", startMs: 1000, language: "en" },
            { source: "subtitle:en", text: "Adding fragrant water parsley and frozen beef brisket", startMs: 2000, language: "en" },
          ],
          ingredientCues: [],
          amountCues: [],
          stepCues: [],
          mustKeepIngredients: [],
          visualAssistCues: [],
          visualMustKeepIngredients: [],
          interpretationNotes: [],
          warnings: [],
        },
        {
          candidateId: "section-01-candidate-02",
          parentSectionId: "section-01",
          canonicalTitle: "소곱창구이",
          titleAliases: [],
          confidence: "source_confirmed",
          timeRange: { startMs: 60000, endMs: 120000 },
          sourceLines: [
            { source: "subtitle:ko", text: "양파, 설탕, 소금, 후추는 곱창을 구울 때 나온 말이다.", startMs: 70000, language: "ko" },
          ],
          ingredientCues: [],
          amountCues: [],
          stepCues: [],
          mustKeepIngredients: [],
          visualAssistCues: [],
          visualMustKeepIngredients: [],
          interpretationNotes: [],
          warnings: [],
        },
      ],
      publicSourceText: [
        "Candidate ledgers",
        "등촌식 멸치칼국수: 멸치칼국수 스프, 미나리, 우삼겹",
        "소곱창구이: 양파, 설탕, 소금, 후추",
      ].join("\n"),
    };

    const result = await extractRecipeFromSources(
      { video: { videoId: "case-public-source", title: "등촌칼국수&소곱창구이" } },
      {
        sourceMode: "public-source",
        useVisual: false,
        useEvidencePackets: false,
        publicSourceBundle,
        llm: {
          generate: async () => ({
            cached: false,
            model: "fixture-public-model",
            provider: "public-source-gpt",
            json: {
              recipes: [{
                title: "등촌식 멸치칼국수",
                ingredients: [
                  { name: "멸치칼국수 라면", amount: null, unit: null },
                  { name: "라면 스프", amount: null, unit: null },
                  { name: "미나리", amount: null, unit: null },
                  { name: "우삼겹", amount: null, unit: null },
                ],
                steps: [
                  "멸치칼국수 라면의 건더기와 스프를 넣고 물을 붓는다.",
                  "미나리와 우삼겹을 넣고 끓인다.",
                ],
              }],
            },
          }),
        },
      },
    );

    const names = result.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name);
    expect(names).not.toEqual(expect.arrayContaining(["설탕", "양파", "소금", "후추"]));
    expect(result.recipes[0].steps.join(" ")).not.toMatch(/설탕|양파|소금|후추/);
    expect(result.meta).toMatchObject({
      sourceMentionedStewSeasoningRecoveries: 0,
      sourceMentionedStewSeasoningRecoveryDetails: [],
      publicSourceStewSeasoningScope: "candidate-ledger",
    });
  });

  it("keeps source-text stew seasoning recovery on the legacy provider path", async () => {
    const { extractRecipeFromSources } = await import(extractionLabModuleUrl);
    const result = await extractRecipeFromSources(
      {
        video: {
          videoId: "case-source-text",
          title: "김치찌개",
          description: "김치찌개에는 설탕, 양파, 소금, 후추를 넣는다.",
        },
      },
      {
        sourceMode: "source-text",
        useVisual: false,
        useEvidencePackets: false,
        llm: {
          generate: async () => ({
            cached: false,
            model: "fixture-source-model",
            provider: "codex-vision",
            json: {
              recipes: [{
                title: "김치찌개",
                ingredients: [{ name: "김치", amount: null, unit: null }],
                steps: ["김치를 넣고 끓인다."],
              }],
            },
          }),
        },
      },
    );

    const names = result.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name);
    expect(names).toEqual(expect.arrayContaining(["설탕", "양파", "소금", "후추"]));
    expect(result.meta).toMatchObject({
      sourceMentionedStewSeasoningRecoveries: 4,
      publicSourceStewSeasoningScope: "global-source-text",
    });
  });

  it("uses candidate cues for public-source stew seasoning recovery on long subtitles", async () => {
    const { extractRecipeFromSources } = await import(extractionLabModuleUrl);
    const publicSourceBundle = {
      version: "public-source-packet-test",
      video: { title: "백선생 김치찌개" },
      source: {},
      sections: [],
      candidateLedgers: [
        {
          candidateId: "section-01-candidate-01",
          parentSectionId: "section-01",
          canonicalTitle: "돼지고기 김치찌개",
          titleAliases: ["김치찌개"],
          confidence: "source_confirmed",
          timeRange: { startMs: 0, endMs: 600000 },
          sourceLines: [
            { source: "subtitle:ko", text: "김치찌개 기본은 돼지고기와 김치입니다", startMs: 1000, language: "ko" },
            { source: "subtitle:ko", text: "김치와 돼지고기 비율은 3대 1 정도입니다", startMs: 2000, language: "ko" },
          ],
          ingredientCues: [
            { source: "subtitle:ko", text: "설탕은 조미료 역할을 합니다", startMs: 300000, language: "ko" },
          ],
          amountCues: [],
          stepCues: [
            { source: "subtitle:ko", text: "양파를 넣어 단맛을 맞춥니다", startMs: 346000, language: "ko" },
            { source: "subtitle:ko", text: "원래대로라면 후추는 마지막에 넣습니다", startMs: 380000, language: "ko" },
          ],
          mustKeepIngredients: [],
          visualAssistCues: [],
          visualMustKeepIngredients: [],
          interpretationNotes: [],
          warnings: [],
        },
      ],
      publicSourceText: "Candidate ledgers",
    };

    const result = await extractRecipeFromSources(
      { video: { videoId: "case-kimchi-jjigae", title: "김치찌개" } },
      {
        sourceMode: "public-source",
        useVisual: false,
        useEvidencePackets: false,
        publicSourceBundle,
        llm: {
          generate: async () => ({
            cached: false,
            model: "fixture-public-model",
            provider: "public-source-gpt",
            json: {
              recipes: [{
                title: "돼지고기 김치찌개",
                ingredients: [
                  { name: "김치", amount: null, unit: null },
                  { name: "돼지고기", amount: null, unit: null },
                ],
                steps: ["김치와 돼지고기를 넣고 쌀뜨물로 끓인다."],
              }],
            },
          }),
        },
      },
    );

    const names = result.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name);
    expect(names).toEqual(expect.arrayContaining(["설탕", "양파", "후추"]));
    expect(result.recipes[0].steps.join(" ")).toMatch(/설탕과 양파|후추/);
    expect(result.meta.sourceMentionedStewSeasoningRecoveryDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredient: "설탕", scope: "candidate-ledger" }),
      expect.objectContaining({ ingredient: "양파", scope: "candidate-ledger" }),
      expect.objectContaining({ ingredient: "후추", scope: "candidate-ledger" }),
    ]));
  });

  it("collects public-source visual assist only from keyframe segment artifacts", async () => {
    const { collectPublicSourceVisualAssist } = await import(publicSourceVisualAssistModuleUrl);
    const cacheRoot = path.join(workdir, "notebooks/recipe_loop_data/cache/codex-vision-keyframes");
    const cacheDir = path.join(cacheRoot, "cache-a");
    writeJson(path.join(cacheDir, "run_meta.json"), {
      videoId: "case-public-source",
      provider: "codex-vision-keyframes",
    });
    writeJson(path.join(cacheDir, "segment-keyframes.json"), {
      segments: [{
        segmentId: "seg-01",
        candidateId: "cand-01",
        titleHint: "등촌칼국수",
        selectedFrames: [{
          file: "frame_0001.jpg",
          timestamp_sec: 470,
          selectionReason: "버섯과 배추 등 칼국수 전골 재료가 보이는 프레임",
        }],
      }],
    });
    writeJson(path.join(cacheDir, "final.json"), { shouldNotBeRead: true });

    const assist = await collectPublicSourceVisualAssist({
      videoId: "case-public-source",
      cacheRoot,
    });

    expect(assist.inspectedRuns).toBe(1);
    expect(assist.cues).toHaveLength(1);
    expect(assist.cues[0]).toMatchObject({
      source: "keyframe_selector",
      titleHint: "등촌칼국수",
      text: "버섯과 배추 등 칼국수 전골 재료가 보이는 프레임",
      timestampSec: 470,
    });
  });

  it("selects public-source-gpt with public source packets and without reading golden.json", async () => {
    const { createLlmForProvider, runExtraction } = await import(runExtractionModuleUrl);
    const selected = createLlmForProvider("public-source-gpt", {
      model: "fixture-public-model",
      "codex-effort": "low",
      "timeout-ms": "1234",
      "refresh-final": true,
      "no-cache": true,
    }, {
      createPublicSourceGpt: (options: Record<string, unknown>) => ({ options }),
    });
    expect(selected.options).toMatchObject({
      model: "fixture-public-model",
      codexEffort: "low",
      timeoutMs: 1234,
      refreshFinal: true,
      noCache: true,
    });

    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-public-source");
    writeJson(path.join(caseDir, "source.json"), {
      video: {
        videoId: "case-public-source",
        title: "후토마끼",
        description: "00:01 후토마끼\n재료 달걀 2개",
        url: "https://www.youtube.com/watch?v=case-public-source",
      },
      captions: {
        available: true,
        segments: [{ text: "달걀 2개를 섞는다.", startMs: 1000 }],
      },
      authorComments: { comments: [{ text: "김은 1장 사용했어요." }] },
    });
    writeFileSync(path.join(caseDir, "golden.json"), "{ this would fail if read", "utf8");

    const generateCalls: Array<Record<string, string | null>> = [];
    const result = await runExtraction(
      {
        split: "train",
        ids: "case-public-source",
        "out-tag": "public-source-test",
        provider: "public-source-gpt",
      },
      {
        projectRoot: workdir,
        publicSourceCollector: async ({ input }: { input: { youtubeUrl: string; authorComments: string[] } }) => ({
          version: "public-source-collector-test",
          collector: "fixture",
          video: {
            videoId: "case-public-source",
            url: input.youtubeUrl,
            title: "후토마끼",
            description: "00:01 후토마끼\n재료 달걀 2개",
          },
          subtitles: [{
            language: "en",
            sourceFile: "case.en.vtt",
            source: "fixture",
            segments: [
              { lineIndex: 0, text: "Main Ingredients: egg 2, seaweed 1 sheet", startMs: 1000, language: "en" },
              { lineIndex: 1, text: "Mix egg and spread seaweed.", startMs: 2000, language: "en" },
            ],
          }],
          authorComments: input.authorComments,
          warnings: [],
          artifactDir: path.join(workdir, "public-source-cache"),
        }),
        publicSourceVisualAssistCollector: async () => ({
          version: "public-source-visual-assist-test",
          source: "fixture",
          videoId: "case-public-source",
          inspectedRuns: 1,
          cues: [{
            source: "keyframe_selector",
            titleHint: "후토마끼",
            text: "김과 달걀이 보이는 프레임",
            frameFile: "frame_0001.jpg",
            timestampSec: 2,
          }],
          warnings: [],
        }),
        factories: {
          createPublicSourceGpt: () => ({
            generate: async ({ prompt, videoUrl, cacheText }: Record<string, string>) => {
              generateCalls.push({ prompt, videoUrl, cacheText });
              return {
                cached: false,
                model: "fixture-public-model",
                provider: "public-source-gpt",
                meta: { provider: "public-source-gpt", sourceMode: "public-source" },
                json: {
                  recipes: [
                    {
                      title: "후토마끼",
                      ingredients: [{ name: "달걀", amount: "2", unit: "개", source_note: "subtitle:en" }],
                      steps: ["달걀을 섞고 김 위에 펼친다."],
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
    expect(generateCalls[0].videoUrl).toBe(null);
    expect(generateCalls[0].cacheText).toContain("public-source:");
    expect(generateCalls[0].prompt).toContain("Public source packets");
    expect(generateCalls[0].prompt).toContain("Main Ingredients: egg 2");
    expect(generateCalls[0].prompt).toContain("weak visual cue");
    expect(generateCalls[0].prompt).not.toContain("golden signal");
    expect(existsSync(path.join(caseDir, "runs/public-source-test/evidence-packets.json"))).toBe(false);
    expect(existsSync(path.join(caseDir, "runs/public-source-test/cue-extraction-report.json"))).toBe(false);
    expect(existsSync(path.join(caseDir, "runs/public-source-test/public-source.json"))).toBe(true);
    expect(existsSync(path.join(caseDir, "runs/public-source-test/public-source-visual-assist.json"))).toBe(true);
    expect(existsSync(path.join(caseDir, "runs/public-source-test/public-source-packets.json"))).toBe(true);

    const output = JSON.parse(readFileSync(path.join(caseDir, "runs/public-source-test/result.json"), "utf8"));
    expect(output.meta).toMatchObject({
      provider: "public-source-gpt",
      promptVersion: "public-source-gpt-v1",
      sourceMode: "public-source",
      publicSourceSectionCount: 1,
      publicSourceCandidateLedgerCount: 1,
    });
    expect(output.recipes[0].title).toBe("후토마끼");
  });

  it("writes public-source-gpt prompt, raw response, cache, and failure artifacts", async () => {
    const { createPublicSourceGptClient } = await import(publicSourceGptModuleUrl);
    const cacheDir = path.join(workdir, "public-source-cache");
    const client = createPublicSourceGptClient({
      cacheDir,
      model: "fixture-public-model",
      codexExec: async ({ outputPath, logPath }: Record<string, string>) => {
        writeFileSync(logPath, "fixture log", "utf8");
        writeFileSync(outputPath, "will be overwritten by client return", "utf8");
        return "```json\n{\"recipes\":[{\"title\":\"후토마끼\",\"ingredients\":[{\"name\":\"김\",\"amount\":\"1\",\"unit\":\"장\"}],\"steps\":[\"김을 펼친다.\"]}]}\n```";
      },
    });

    const first = await client.generate({
      prompt: "Public source packets: 달걀 2개",
      cacheText: "public-source:달걀 2개",
    });

    expect(first.cached).toBe(false);
    expect(first.provider).toBe("public-source-gpt");
    expect(first.meta.publicSourceGptCacheDir).toContain(cacheDir);
    expect(first.json.recipes[0].title).toBe("후토마끼");
    expect(existsSync(path.join(first.meta.publicSourceGptCacheDir, "final.prompt.md"))).toBe(true);
    expect(existsSync(path.join(first.meta.publicSourceGptCacheDir, "final.raw.md"))).toBe(true);
    expect(existsSync(path.join(first.meta.publicSourceGptCacheDir, "final.log"))).toBe(true);
    expect(existsSync(path.join(first.meta.publicSourceGptCacheDir, "final.json"))).toBe(true);
    expect(existsSync(path.join(first.meta.publicSourceGptCacheDir, "run_meta.json"))).toBe(true);

    const second = await client.generate({
      prompt: "Public source packets: 달걀 2개",
      cacheText: "public-source:달걀 2개",
    });
    expect(second.cached).toBe(true);

    const failingClient = createPublicSourceGptClient({
      cacheDir: path.join(workdir, "public-source-cache-fail"),
      model: "fixture-public-model",
      codexExec: async () => {
        throw new Error("fixture public source extraction failed");
      },
    });

    await expect(failingClient.generate({
      prompt: "Public source packets: fail",
      cacheText: "public-source:fail",
    })).rejects.toThrow("fixture public source extraction failed");
    const failureFiles = readdirSync(path.join(workdir, "public-source-cache-fail"), { recursive: true })
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
    const runDir = path.join(caseDir, "runs/codex-test-fail");
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
            const progress = JSON.parse(readFileSync(path.join(runDir, "run-progress.json"), "utf8"));
            expect(progress.phase).toBe("extracting");
            throw new Error("fixture extraction failed");
          },
        },
      },
    );

    expect(result.failures).toBe(1);
    const failurePath = path.join(runDir, "failure.json");
    expect(existsSync(failurePath)).toBe(true);
    const failure = JSON.parse(readFileSync(failurePath, "utf8"));
    expect(failure).toMatchObject({
      videoId: "case-fail",
      split: "train",
      outTag: "codex-test-fail",
      provider: "codex-vision",
      message: "fixture extraction failed",
    });
    const finalProgress = JSON.parse(readFileSync(path.join(runDir, "run-progress.json"), "utf8"));
    expect(finalProgress).toMatchObject({
      videoId: "case-fail",
      split: "train",
      outTag: "codex-test-fail",
      provider: "codex-vision",
      phase: "failed",
      message: "fixture extraction failed",
    });
    expect(finalProgress.events.map((event: { phase: string }) => event.phase)).toEqual(expect.arrayContaining([
      "started",
      "extracting",
      "failed",
    ]));
  });
});
