import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const runnerModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/pi-extractor/run-pi-extraction.mjs")).href;
const trainRunnerModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/pi-extractor/run-pi-train-extraction.mjs")).href;
const schemaModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/pi-extractor/lib/schema.mjs")).href;
const guardModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/pi-extractor/lib/access-guard.mjs")).href;
const artifactsModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/pi-extractor/lib/artifacts.mjs")).href;
const freezeModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/pi-extractor/freeze-pi-extraction.mjs")).href;

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function makeSource(videoId = "case-a") {
  return {
    schemaVersion: 1,
    video: {
      videoId,
      title: "테스트 영상",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      description: "[재료]\n양파 1/2개\n간장 1큰술",
      tags: ["레시피"],
    },
    captions: {
      available: true,
      selectedTrack: { languageCode: "ko" },
      segments: [
        { startMs: 1000, endMs: 2500, text: "양파 반 개를 썰어 주세요." },
        { startMs: 3000, endMs: 4500, text: "간장 한 큰술을 넣습니다." },
      ],
    },
    authorComments: { comments: [{ text: "고정 댓글 재료 보충" }] },
  };
}

describe("pi recipe extractor MVP runner", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(path.join(tmpdir(), "pi-extractor-runner-"));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("rejects amountBasis values outside the fixed enum", async () => {
    const { normalizePiRecipeOutput, validatePiRecipeOutput } = await import(schemaModuleUrl);
    const normalized = normalizePiRecipeOutput({
      recipes: [{
        title: "테스트",
        ingredients: [{ name: "양파", amount: "1/2", unit: "개", amountBasis: "unknown" }],
        steps: ["양파를 볶는다."],
      }],
    });

    expect(validatePiRecipeOutput(normalized).join("\n")).toContain("amountBasis must be one of");
  });

  it("normalizes item/ingredient names and object steps into recipe-loop compatible output", async () => {
    const { normalizePiRecipeOutput, validatePiRecipeOutput } = await import(schemaModuleUrl);
    const normalized = normalizePiRecipeOutput({
      recipes: [{
        title: "테스트",
        ingredients: [
          { item: "양파", amount: "1/2", unit: "개", basis: "stated" },
          { ingredient: "간장", amount: "1", unit: "큰술", amountBasis: "spoken" },
        ],
        steps: [{ text: "양파를 볶는다." }, { instruction: "간장을 넣는다." }],
      }],
    });

    expect(validatePiRecipeOutput(normalized)).toEqual([]);
    expect(normalized.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["양파", "간장"]);
    expect(normalized.recipes[0].steps).toEqual(["양파를 볶는다.", "간장을 넣는다."]);
  });

  it("parses Pi JSONL event streams and extracts the final assistant JSON", async () => {
    const { normalizePiRecipeOutput, validatePiRecipeOutput } = await import(schemaModuleUrl);
    const jsonl = [
      JSON.stringify({ type: "session", version: 3 }),
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: JSON.stringify({
            recipes: [{
              title: "테스트",
              ingredients: [{ name: "양파", amount: "1/2", unit: "개", amountBasis: "stated" }],
              steps: ["양파를 볶는다."],
            }],
          }) }],
        },
      }),
    ].join("\n");

    const normalized = normalizePiRecipeOutput({ stdout: jsonl, stderr: "", exitCode: 0 });

    expect(validatePiRecipeOutput(normalized)).toEqual([]);
    expect(normalized.recipes[0].title).toBe("테스트");
    expect(normalized.recipes[0].ingredients[0].amountBasis).toBe("stated");
  });

  it("parses Pi JSONL event streams for staged candidate output", async () => {
    const { normalizePiRecipeCandidates, validatePiRecipeCandidates } = await import(schemaModuleUrl);
    const jsonl = [
      JSON.stringify({ type: "session", version: 3 }),
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: JSON.stringify({
            candidates: [{
              candidateId: "r1",
              title: "양파 간장 볶음",
              ingredientNames: ["양파", "간장"],
              evidence: ["description"],
            }],
          }) }],
        },
      }),
    ].join("\n");

    const normalized = normalizePiRecipeCandidates({ stdout: jsonl, stderr: "", exitCode: 0 });

    expect(validatePiRecipeCandidates(normalized)).toEqual([]);
    expect(normalized.candidates[0].ingredientNames).toEqual(["양파", "간장"]);
  });

  it("merges adjacent whitespace-separated candidate variants without strong title separators", async () => {
    const { applyGenericCandidateRepair } = await import(artifactsModuleUrl);
    const repaired = applyGenericCandidateRepair({
      sourcePacket: { video: { title: "오늘 밥상: 멸치칼국수 등촌칼국수 | 도토리 묵사발" } },
      candidateOutput: {
        candidates: [
          { candidateId: "r1", title: "멸치칼국수", ingredientNames: ["멸치"], evidence: ["title"], uncertainties: [] },
          { candidateId: "r2", title: "등촌칼국수", ingredientNames: ["미나리"], evidence: ["title"], uncertainties: [] },
          { candidateId: "r3", title: "도토리 묵사발", ingredientNames: ["도토리묵"], evidence: ["title"], uncertainties: [] },
        ],
      },
    });

    expect(repaired.candidates.map((candidate: { title: string }) => candidate.title)).toEqual([
      "멸치칼국수 등촌칼국수",
      "도토리 묵사발",
    ]);
    expect(repaired.candidateRepairLog[0]).toMatchObject({
      reasonCode: "merge_whitespace_variant_titles",
      evidenceRef: ["title"],
    });
  });

  it("uses caption cue timestamps before even-split candidate ranges", async () => {
    const { buildCandidateLedger } = await import(artifactsModuleUrl);
    const ledger = buildCandidateLedger({
      sourcePacket: {
        video: { videoId: "case-a", durationSeconds: 600, title: "테스트" },
        captions: {
          segments: [
            { startMs: 10000, endMs: 12000, text: "인트로" },
            { startMs: 200000, endMs: 202000, text: "간장을 넣습니다" },
          ],
        },
      },
      candidateOutput: {
        candidates: [
          { candidateId: "r1", title: "간장 볶음", ingredientNames: ["간장"], evidence: [], uncertainties: [] },
          { candidateId: "r2", title: "다른 요리", ingredientNames: ["감자"], evidence: [], uncertainties: [] },
        ],
      },
    });

    expect(ledger.candidates[0].timeRange).toMatchObject({
      basis: "caption-cue",
      startSec: 180,
      endSec: 262,
    });
    expect(ledger.candidates[1].timeRange.basis).toBe("even-split-fallback");
  });

  it("creates ingredient-level description-only visual targets only through gap-ledger", async () => {
    const { buildCandidateLedger, buildGapLedger, buildSourceDraft, buildVisualTargetLedger } = await import(artifactsModuleUrl);
    const source = makeSource("case-a");
    source.video.description = "[재료]\n바르는술\n럼(바카디 화이트)";
    source.captions.segments = [
      { startMs: 1000, endMs: 2500, text: "마들렌이 완성되었습니다." },
    ];
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [{
          candidateId: "r1",
          title: "마들렌",
          ingredientNames: ["럼"],
          evidence: ["description"],
          uncertainties: [],
        }],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });

    const targetLedger = buildVisualTargetLedger({ sourcePacket: source, candidateLedger, gapLedger });

    expect(sourceDraft.sourceDraftMode).toBe("existing-artifacts");
    expect(gapLedger.gaps[0]).toMatchObject({
      candidateId: "r1",
      ingredient: "럼",
      gapType: "amount_missing_visual_possible",
      visualTargetAllowed: true,
    });
    expect(targetLedger.targets).toHaveLength(1);
    expect(targetLedger.targets[0]).toMatchObject({
      candidateId: "r1",
      ingredient: "럼",
      gapType: "amount_missing_visual_possible",
      reason: "description_has_ingredient_without_amount",
      fallbackPolicy: "description-only-sweep",
    });
  });

  it("repairs missing amounts only from frame-backed visual estimates", async () => {
    const { applyVisualEstimateRepair } = await import(artifactsModuleUrl);
    const output = {
      recipes: [{
        title: "마들렌",
        candidateId: "r1",
        ingredients: [{ name: "럼", amount: null, unit: null, amountBasis: null, confidence: 0.3, evidence: ["description"] }],
        steps: ["럼을 바른다."],
      }],
      repairLog: [],
    };

    const repaired = applyVisualEstimateRepair({
      output,
      visualEstimates: {
        visualEstimates: [{
          candidateId: "r1",
          targetId: "r1:럼",
          ingredient: "럼",
          amount: "약 1",
          unit: "큰술",
          amountBasis: "visual-estimate",
          targetVisible: true,
          referenceObjectVisible: true,
          countEvidence: null,
          confidence: 0.45,
          evidence: ["frame:r1:럼:1"],
          reason: "병으로 표면에 얇게 바르는 동작과 숟가락 1큰술 안팎의 양으로 보임",
        }],
      },
    });

    expect(repaired.recipes[0].ingredients[0]).toMatchObject({
      amount: "약 1",
      unit: "큰술",
      amountBasis: "visual-estimate",
    });
    expect(repaired.repairLog[0]).toMatchObject({
      reasonCode: "visual_estimate_from_reference_object",
      evidenceRef: ["frame:r1:럼:1"],
    });
  });

  it("falls back invalid final visual-estimate values to null and reports contract failures", async () => {
    const { validateFinalVisualEvidenceContract } = await import(artifactsModuleUrl);
    const output = {
      recipes: [{
        title: "마들렌",
        candidateId: "r1",
        ingredients: [{
          name: "럼",
          amount: "약 1",
          unit: "큰술",
          amountBasis: "visual-estimate",
          evidence: ["frame:r1:럼:1"],
        }],
        steps: ["럼을 바른다."],
      }],
      repairLog: [],
    };

    const contract = validateFinalVisualEvidenceContract(output, {
      visualLedger: {
        targets: [{
          targetId: "r1:럼",
          candidateId: "r1",
          ingredient: "럼",
          frames: [{ ref: "frame:r1:럼:1", candidateId: "r1", ingredient: "럼" }],
        }],
      },
      visualEstimates: {
        visualEstimates: [{
          targetId: "r1:럼",
          candidateId: "r1",
          ingredient: "럼",
          targetVisible: true,
          referenceObjectVisible: false,
          countEvidence: "frame:r1:럼:1에 병은 보이지만 계량 기준은 없음",
          amount: "약 1",
          unit: "큰술",
          amountBasis: "visual-estimate",
          evidence: ["frame:r1:럼:1"],
        }],
      },
    });

    expect(contract.failureCount).toBe(1);
    expect(contract.output.recipes[0].ingredients[0]).toMatchObject({
      amount: null,
      unit: null,
      amountBasis: null,
    });
    expect(contract.output.repairLog[0]).toMatchObject({
      reasonCode: "visual_evidence_contract_fallback",
    });
  });

  it("allows count evidence for countable visual-estimate ingredients", async () => {
    const { validateFinalVisualEvidenceContract } = await import(artifactsModuleUrl);
    const output = {
      recipes: [{
        title: "계란말이",
        candidateId: "r1",
        ingredients: [{
          name: "계란",
          amount: "2",
          unit: "개",
          amountBasis: "visual-estimate",
          evidence: ["frame:r1:계란:1"],
        }],
        steps: ["계란을 푼다."],
      }],
      repairLog: [],
    };

    const contract = validateFinalVisualEvidenceContract(output, {
      visualLedger: {
        targets: [{
          targetId: "r1:계란",
          candidateId: "r1",
          ingredient: "계란",
          frames: [{ ref: "frame:r1:계란:1", candidateId: "r1", ingredient: "계란" }],
        }],
      },
      visualEstimates: {
        visualEstimates: [{
          targetId: "r1:계란",
          candidateId: "r1",
          ingredient: "계란",
          targetVisible: true,
          referenceObjectVisible: false,
          countEvidence: "frame:r1:계란:1에서 계란 2개를 셀 수 있음",
          amount: "2",
          unit: "개",
          amountBasis: "visual-estimate",
          evidence: ["frame:r1:계란:1"],
        }],
      },
    });

    expect(contract.failureCount).toBe(0);
    expect(contract.output.recipes[0].ingredients[0]).toMatchObject({
      amount: "2",
      unit: "개",
      amountBasis: "visual-estimate",
    });
    expect(contract.output.repairLog[0]).toMatchObject({
      reasonCode: "visual_estimate_from_reference_object",
      countEvidence: "frame:r1:계란:1에서 계란 2개를 셀 수 있음",
    });
  });

  it("uses PI_BIN when building Pi commands", async () => {
    const { buildPiCommand } = await import(runnerModuleUrl);
    const previous = process.env.PI_BIN;
    process.env.PI_BIN = "/tmp/custom-pi";
    try {
      expect(buildPiCommand({ promptPath: "/tmp/prompt.txt" })[0]).toBe("/tmp/custom-pi");
    } finally {
      if (previous === undefined) {
        delete process.env.PI_BIN;
      } else {
        process.env.PI_BIN = previous;
      }
    }
  });

  it("keeps fetch_content out of MVP-1 commands unless explicitly enabled", async () => {
    const { buildPiCommand, buildPiTools } = await import(runnerModuleUrl);

    const defaultCommand = buildPiCommand({ promptPath: "/tmp/prompt.txt" }).join(" ");
    const sourceOnlyCommand = buildPiCommand({
      promptPath: "/tmp/prompt.txt",
      tools: buildPiTools({ sourcePacketOnly: true }),
    }).join(" ");
    const visualCommand = buildPiCommand({
      promptPath: "/tmp/prompt.txt",
      tools: buildPiTools({ allowFetchContent: true }),
    }).join(" ");

    expect(defaultCommand).toContain("youtube_video_details,youtube_transcript");
    expect(defaultCommand).not.toContain("fetch_content");
    expect(sourceOnlyCommand).toContain("--no-tools");
    expect(sourceOnlyCommand).not.toContain("--tools");
    expect(visualCommand).toContain("youtube_video_details,youtube_transcript,fetch_content");
  });

  it("blocks reads of golden, previous result, and grade files", async () => {
    const { createAccessManifest, recordRead } = await import(guardModuleUrl);
    const sourcePath = path.join(workdir, "notebooks/recipe_loop_data/train/case-a/source.json");
    const goldenPath = path.join(workdir, "notebooks/recipe_loop_data/train/case-a/golden.json");
    const manifest = createAccessManifest({ projectRoot: workdir, allowedReads: [sourcePath] });

    expect(() => recordRead(manifest, sourcePath, "source")).not.toThrow();
    expect(() => recordRead(manifest, goldenPath, "golden")).toThrow(/source-only guard blocked read/);
    expect(() => recordRead(
      manifest,
      path.join(workdir, "notebooks/recipe_loop_data/train/case-a/runs/old/result.json"),
      "previous-result",
    )).toThrow(/source-only guard blocked read/);
    expect(() => recordRead(
      manifest,
      path.join(workdir, "notebooks/recipe_loop_data/train/_grade_summary.old.json"),
      "grade-summary",
    )).toThrow(/source-only guard blocked read/);
  });

  it("dry-run writes prompt, command, and manifest without reading golden", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    writeJson(path.join(caseDir, "source.json"), makeSource("case-a"));
    writeJson(path.join(caseDir, "golden.json"), { shouldNotRead: true });

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-mvp-test",
      "dry-run": true,
    }, { projectRoot: workdir });

    expect(result.failures).toBe(0);
    const outDir = path.join(caseDir, "runs/pi-mvp-test");
    const command = JSON.parse(readFileSync(path.join(outDir, "pi-command.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(path.join(outDir, "file-access-manifest.json"), "utf8"));
    const prompt = readFileSync(path.join(outDir, "prompt.txt"), "utf8");

    expect(command.command).toContain("--no-builtin-tools");
    expect(command.command).toContain("--no-context-files");
    expect(command.command).toContain("youtube_video_details,youtube_transcript");
    expect(command.command.join(" ")).not.toContain("fetch_content");
    expect(command.command.join(" ")).not.toContain("web_search");
    expect(manifest.readEvents.map((event: { path: string }) => path.basename(event.path))).toEqual(["source.json"]);
    expect(manifest.forbiddenReadEvents).toEqual([]);
    expect(prompt).toContain("amountBasis는 stated, spoken, onscreen, visual-estimate");
    expect(prompt).toContain("fetch_content 영상 분석/프레임 추출은 MVP-3 이후");
    expect(prompt).toContain("web_search는 사용하지 마라");
  });

  it("staged dry-run writes candidate prompt and command without reading golden", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    writeJson(path.join(caseDir, "source.json"), makeSource("case-a"));
    writeJson(path.join(caseDir, "golden.json"), { shouldNotRead: true });

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-mvp-staged-dry",
      staged: true,
      "dry-run": true,
      "source-packet-only": true,
    }, { projectRoot: workdir });

    expect(result.failures).toBe(0);
    const outDir = path.join(caseDir, "runs/pi-mvp-staged-dry");
    const command = JSON.parse(readFileSync(path.join(outDir, "candidate-command.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(path.join(outDir, "file-access-manifest.json"), "utf8"));
    const prompt = readFileSync(path.join(outDir, "candidate-prompt.txt"), "utf8");

    expect(command.command).toContain("--no-tools");
    expect(command.note).toContain("All Pi tools are disabled");
    expect(manifest.phase).toBe("staged-dry-run-completed");
    expect(manifest.mode).toBe("staged");
    expect(manifest.readEvents.map((event: { path: string }) => path.basename(event.path))).toEqual(["source.json"]);
    expect(manifest.forbiddenReadEvents).toEqual([]);
    expect(prompt).toContain("레시피 후보만 빠르게");
    expect(prompt).toContain("재료 양과 단계는 이 단계에서 자세히 쓰지 않는다");
  });

  it("fast staged dry-run writes a short plain prompt instead of a full source packet", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    writeJson(path.join(caseDir, "source.json"), makeSource("case-a"));

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-mvp-fast-staged-dry",
      staged: true,
      "candidate-only": true,
      "dry-run": true,
      "source-packet-only": true,
      "fast-prompt": true,
    }, { projectRoot: workdir });

    expect(result.failures).toBe(0);
    const outDir = path.join(caseDir, "runs/pi-mvp-fast-staged-dry");
    const manifest = JSON.parse(readFileSync(path.join(outDir, "file-access-manifest.json"), "utf8"));
    const prompt = readFileSync(path.join(outDir, "candidate-prompt.txt"), "utf8");

    expect(manifest.fastPrompt).toBe(true);
    expect(prompt).toContain("아래 공개 유튜브 입력만 사용한다");
    expect(prompt).toContain("제목: 테스트 영상");
    expect(prompt).not.toContain("[SOURCE_PACKET]");
    expect(prompt.length).toBeLessThan(1200);
  });

  it("can limit source packet description and caption size for live smoke", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    writeJson(path.join(caseDir, "source.json"), makeSource("case-a"));

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-mvp-limited",
      "dry-run": true,
      "max-caption-segments": "1",
      "max-description-chars": "20",
    }, { projectRoot: workdir });

    expect(result.failures).toBe(0);
    const packet = JSON.parse(readFileSync(path.join(caseDir, "runs/pi-mvp-limited/source-packet.json"), "utf8"));

    expect(packet.captions.segments).toHaveLength(1);
    expect(packet.video.description.length).toBeLessThanOrEqual(60);
    expect(packet.truncation.captionSegmentsTotal).toBe(2);
    expect(packet.truncation.captionSegmentsIncluded).toBe(1);
  });

  it("can compact source packets by keeping recipe lines and stripping links", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const source = makeSource("case-a");
    source.video.description = [
      "비즈니스 메일: test@example.com",
      "✅ [재료]",
      "전란 90g https://example.com/egg",
      "설탕 89g https://example.com/sugar",
      "바르는술",
      "럼(바카디 화이트)",
      "고정 댓글 링크로 구매시 수수료를 제공받습니다.",
    ].join("\n");
    writeJson(path.join(caseDir, "source.json"), source);

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-mvp-compact-source",
      "dry-run": true,
      "compact-source-packet": true,
      "max-description-chars": "2000",
    }, { projectRoot: workdir });

    expect(result.failures).toBe(0);
    const packet = JSON.parse(readFileSync(path.join(caseDir, "runs/pi-mvp-compact-source/source-packet.json"), "utf8"));

    expect(packet.video.description).toContain("전란 90g");
    expect(packet.video.description).toContain("럼(바카디 화이트)");
    expect(packet.video.description).not.toContain("https://");
    expect(packet.video.description).not.toContain("비즈니스 메일");
    expect(packet.truncation.compactSourcePacket).toBe(true);
  });

  it("can ingest a fixture Pi response and write a validated result", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const responsePath = path.join(workdir, "fixtures/pi-response.json");
    writeJson(path.join(caseDir, "source.json"), makeSource("case-a"));
    writeJson(path.join(caseDir, "golden.json"), { shouldNotRead: true });
    writeJson(responsePath, {
      recipes: [{
        title: "양파 간장 볶음",
        ingredients: [
          { item: "양파", amount: "1/2", unit: "개", amountBasis: "stated" },
          { ingredient: "간장", amount: "1", unit: "큰술", amountBasis: "spoken" },
        ],
        steps: [{ text: "양파를 볶는다." }, { text: "간장을 넣고 섞는다." }],
      }],
      repairLog: [{
        patchId: "patch-1",
        candidateId: null,
        field: "ingredient",
        before: null,
        after: "간장",
        evidenceRef: ["transcript:00:03"],
        reasonCode: "missing_evidence_backed_ingredient",
        confidence: 0.9,
      }],
    });

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-mvp-fixture",
      "response-json": responsePath,
    }, { projectRoot: workdir });

    expect(result.failures).toBe(0);
    const outDir = path.join(caseDir, "runs/pi-mvp-fixture");
    const output = JSON.parse(readFileSync(path.join(outDir, "result.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(path.join(outDir, "file-access-manifest.json"), "utf8"));

    expect(output.videoId).toBe("case-a");
    expect(output.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["양파", "간장"]);
    expect(output.recipes[0].steps).toEqual(["양파를 볶는다.", "간장을 넣고 섞는다."]);
    expect(output.repairLog).toHaveLength(1);
    expect(manifest.readEvents.map((event: { path: string }) => path.basename(event.path))).toEqual(["source.json", "pi-response.json"]);
    expect(manifest.forbiddenReadEvents).toEqual([]);
  });

  it("can run staged fixture extraction and preserve candidate/detail artifacts", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const candidateResponsePath = path.join(workdir, "fixtures/pi-candidates.json");
    const detailResponsePath = path.join(workdir, "fixtures/pi-detail.json");
    writeJson(path.join(caseDir, "source.json"), makeSource("case-a"));
    writeJson(path.join(caseDir, "golden.json"), { shouldNotRead: true });
    writeJson(candidateResponsePath, {
      candidates: [{
        candidateId: "r1",
        title: "양파 간장 볶음",
        ingredientNames: ["양파", "간장"],
        evidence: ["description", "transcript:00:03"],
      }],
    });
    writeJson(detailResponsePath, {
      recipe: {
        title: "양파 간장 볶음",
        candidateId: "r1",
        ingredients: [
          { name: "양파", amount: "1/2", unit: "개", amountBasis: "stated" },
          { name: "간장", amount: null, unit: null, amountBasis: null },
        ],
        steps: ["양파를 썬다.", "간장을 넣고 볶는다."],
      },
      repairLog: [{
        patchId: "patch-1",
        candidateId: "r1",
        field: "amount",
        before: null,
        after: "간장 1큰술",
        evidenceRef: ["transcript:00:03"],
        reasonCode: "amount_from_spoken_evidence",
        confidence: 0.9,
      }],
    });

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-mvp-staged-fixture",
      staged: true,
      "candidate-response-json": candidateResponsePath,
      "detail-response-json": detailResponsePath,
    }, { projectRoot: workdir });

    expect(result.failures).toBe(0);
    const outDir = path.join(caseDir, "runs/pi-mvp-staged-fixture");
    const output = JSON.parse(readFileSync(path.join(outDir, "result.json"), "utf8"));
    const candidates = JSON.parse(readFileSync(path.join(outDir, "candidate-result.json"), "utf8"));
    const candidateLedger = JSON.parse(readFileSync(path.join(outDir, "candidate-ledger.json"), "utf8"));
    const visualLedger = JSON.parse(readFileSync(path.join(outDir, "visual-ledger.json"), "utf8"));
    const sourceDraft = JSON.parse(readFileSync(path.join(outDir, "source-draft.json"), "utf8"));
    const gapLedger = JSON.parse(readFileSync(path.join(outDir, "gap-ledger.json"), "utf8"));
    const evidencePackets = JSON.parse(readFileSync(path.join(outDir, "evidence-packets.json"), "utf8"));
    const cacheManifest = JSON.parse(readFileSync(path.join(outDir, "cache/cache-manifest.json"), "utf8"));
    const detail = JSON.parse(readFileSync(path.join(outDir, "detail-01-r1-result.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(path.join(outDir, "file-access-manifest.json"), "utf8"));

    expect(output.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["양파", "간장"]);
    expect(output.recipes[0].ingredients.find((ingredient: { name: string }) => ingredient.name === "간장")).toMatchObject({
      amount: "1",
      unit: "큰술",
      amountBasis: "stated",
    });
    expect(output.recipes[0].steps).toEqual(["양파를 썬다.", "간장을 넣고 볶는다."]);
    expect(output.repairLog.length).toBeGreaterThanOrEqual(2);
    expect(output.repairLog.map((entry: { reasonCode: string }) => entry.reasonCode)).toContain("amount_from_source_packet");
    expect(candidates.candidates[0].title).toBe("양파 간장 볶음");
    expect(candidateLedger.candidates[0]).toMatchObject({
      candidateId: "r1",
      titleHint: "양파 간장 볶음",
      timeRange: { basis: "caption-cue" },
    });
    expect(visualLedger).toMatchObject({ collectionStatus: "not-requested" });
    expect(sourceDraft).toMatchObject({ kind: "source-draft", sourceDraftMode: "existing-artifacts" });
    expect(gapLedger).toMatchObject({ kind: "gap-ledger" });
    expect(evidencePackets.packets[0].amountCues).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredient: "양파", amount: "1/2", unit: "개" }),
      expect.objectContaining({ ingredient: "간장", amount: "1", unit: "큰술" }),
    ]));
    expect(cacheManifest.promptHashes.candidate).toMatch(/^[a-f0-9]{64}$/u);
    expect(detail.recipes[0].candidateId).toBe("r1");
    expect(manifest.mode).toBe("staged");
    expect(manifest.candidateCount).toBe(1);
    expect(manifest.recipeCount).toBe(1);
    expect(manifest.forbiddenReadEvents).toEqual([]);
    expect(manifest.readEvents.map((event: { path: string }) => path.basename(event.path))).toEqual([
      "source.json",
      "pi-candidates.json",
      "pi-detail.json",
    ]);
  });

  it("runs staged visual target estimate repair with injected frame and Pi fixtures", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const candidateResponsePath = path.join(workdir, "fixtures/pi-candidates.json");
    const detailResponsePath = path.join(workdir, "fixtures/pi-detail.json");
    const source = makeSource("case-a");
    source.video.description = "[재료]\n전란 90g\n바르는술\n럼(바카디 화이트)";
    source.captions.segments = [{ startMs: 1000, endMs: 2500, text: "마들렌을 구워 꺼냅니다." }];
    writeJson(path.join(caseDir, "source.json"), source);
    writeJson(candidateResponsePath, {
      candidates: [{
        candidateId: "r1",
        title: "마들렌",
        ingredientNames: ["럼"],
        evidence: ["description"],
      }],
    });
    writeJson(detailResponsePath, {
      recipe: {
        title: "마들렌",
        candidateId: "r1",
        ingredients: [{ name: "럼", amount: null, unit: null, amountBasis: null, evidence: ["description"], confidence: 0.4 }],
        steps: ["마들렌에 럼을 바른다."],
      },
      repairLog: [],
    });

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-visual-fixture",
      staged: true,
      "visual-frames": true,
      "candidate-response-json": candidateResponsePath,
      "detail-response-json": detailResponsePath,
    }, {
      projectRoot: workdir,
      collectVisualLedger: async ({ sourcePacket, candidateLedger, visualTargetLedger }: {
        sourcePacket: { video: { videoId: string } };
        candidateLedger: { candidates: Array<{ candidateId: string; timeRange: unknown }> };
        visualTargetLedger: { targets: Array<{ targetId: string; candidateId: string; ingredient: string }> };
      }) => ({
        schemaVersion: 1,
        kind: "visual-ledger",
        videoId: sourcePacket.video.videoId,
        collectionStatus: "completed",
        note: "test target visual ledger",
        errors: [],
        targets: visualTargetLedger.targets.map((target) => ({
          targetId: target.targetId,
          candidateId: target.candidateId,
          ingredient: target.ingredient,
          ranges: [{ startSec: 0, endSec: 4, basis: "description-only-sweep" }],
          frames: [{
            ref: `frame:${target.candidateId}:${target.ingredient}:1`,
            targetId: target.targetId,
            candidateId: target.candidateId,
            ingredient: target.ingredient,
            path: "frame-rum.jpg",
          }],
        })),
        candidates: candidateLedger.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          timeRange: candidate.timeRange,
          frames: [],
          observed: [],
          onscreenText: [],
          quantityCues: [],
        })),
      }),
      collectVisualEstimates: async ({ visualTargetLedger }: {
        visualTargetLedger: { targets: Array<{ targetId: string; candidateId: string; ingredient: string }> };
      }) => ({
        schemaVersion: 1,
        kind: "visual-estimates",
        videoId: "case-a",
        visualEstimates: visualTargetLedger.targets.map((target) => ({
          targetId: target.targetId,
          candidateId: target.candidateId,
          ingredient: target.ingredient,
          amount: "약 1",
          unit: "큰술",
          amountBasis: "visual-estimate",
          targetVisible: true,
          referenceObjectVisible: true,
          countEvidence: null,
          confidence: 0.45,
          evidence: [`frame:${target.candidateId}:${target.ingredient}:1`],
          reason: "병으로 표면에 얇게 바르는 동작과 숟가락 1큰술 안팎의 양으로 보임",
          uncertainties: [],
        })),
        uncertainties: [],
        errors: [],
      }),
    });

    expect(result.failures).toBe(0);
    const outDir = path.join(caseDir, "runs/pi-visual-fixture");
    const output = JSON.parse(readFileSync(path.join(outDir, "result.json"), "utf8"));
    const visualTargetLedger = JSON.parse(readFileSync(path.join(outDir, "visual-target-ledger.json"), "utf8"));
    const visualEstimates = JSON.parse(readFileSync(path.join(outDir, "visual-estimates.json"), "utf8"));

    expect(visualTargetLedger.targets[0]).toMatchObject({ ingredient: "럼", fallbackPolicy: "description-only-sweep" });
    expect(visualEstimates.visualEstimates[0]).toMatchObject({ ingredient: "럼", amountBasis: "visual-estimate" });
    expect(output.recipes[0].ingredients[0]).toMatchObject({
      amount: "약 1",
      unit: "큰술",
      amountBasis: "visual-estimate",
    });
    expect(output.repairLog.map((entry: { reasonCode: string }) => entry.reasonCode)).toContain("visual_estimate_from_reference_object");
    expect(output.repairLog.map((entry: { reasonCode: string }) => entry.reasonCode)).not.toContain("visual_evidence_contract_fallback");
  });

  it("freezes completed Pi extraction outputs before grading without reading golden", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const { runFreeze } = await import(freezeModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const responsePath = path.join(workdir, "fixtures/pi-response.json");
    writeJson(path.join(caseDir, "source.json"), makeSource("case-a"));
    writeJson(path.join(caseDir, "golden.json"), { shouldNotRead: true });
    writeJson(responsePath, {
      recipes: [{
        title: "양파 간장 볶음",
        ingredients: [{ name: "양파", amount: "1/2", unit: "개", amountBasis: "stated" }],
        steps: ["양파를 볶는다."],
      }],
      repairLog: [],
    });

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-mvp-freeze",
      "response-json": responsePath,
    }, { projectRoot: workdir });
    expect(result.failures).toBe(0);

    const freezeResult = await runFreeze({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-mvp-freeze",
    }, { projectRoot: workdir });
    const freeze = JSON.parse(readFileSync(freezeResult.freezePath, "utf8"));

    expect(freeze.completedCount).toBe(1);
    expect(freeze.forbiddenReadCount).toBe(0);
    expect(freeze.policy.goldenReadDuringFreeze).toBe(false);
    expect(freeze.cases[0].files["result.json"].sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(freeze.cases[0].readEvents.map((event: { path: string }) => path.basename(event.path))).toEqual(["source.json", "pi-response.json"]);
  });

  it("runs the train wrapper with staged fast compact defaults and freeze", async () => {
    const { runPiTrainExtraction } = await import(trainRunnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const candidateResponsePath = path.join(workdir, "fixtures/pi-candidates.json");
    const detailResponsePath = path.join(workdir, "fixtures/pi-detail.json");
    writeJson(path.join(caseDir, "source.json"), makeSource("case-a"));
    writeJson(candidateResponsePath, {
      candidates: [{ candidateId: "r1", title: "양파 볶음", ingredientNames: ["양파"], evidence: ["description"] }],
    });
    writeJson(detailResponsePath, {
      recipe: {
        title: "양파 볶음",
        candidateId: "r1",
        ingredients: [{ name: "양파", amount: "1/2", unit: "개", amountBasis: "stated" }],
        steps: ["양파를 볶는다."],
      },
      repairLog: [],
    });

    const result = await runPiTrainExtraction({
      ids: "case-a",
      "out-tag": "pi-train-wrapper",
      "candidate-response-json": candidateResponsePath,
      "detail-response-json": detailResponsePath,
    }, {
      projectRoot: workdir,
      collectVisualLedger: async ({ sourcePacket, candidateLedger }: {
        sourcePacket: { video: { videoId: string } };
        candidateLedger: { candidates: Array<{ candidateId: string; timeRange: unknown }> };
      }) => ({
        schemaVersion: 1,
        kind: "visual-ledger",
        videoId: sourcePacket.video.videoId,
        collectionStatus: "completed",
        note: "test visual ledger",
        errors: [],
        candidates: candidateLedger.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          timeRange: candidate.timeRange,
          frames: [{
            ref: `frame:${candidate.candidateId}:1`,
            observed: ["양파"],
            onscreenText: ["양파 반개"],
            quantityCues: ["양파 1/2개"],
            confidence: 0.8,
          }],
          observed: ["양파"],
          onscreenText: ["양파 반개"],
          quantityCues: ["양파 1/2개"],
        })),
      }),
      collectVisualEstimates: async () => ({
        schemaVersion: 1,
        kind: "visual-estimates",
        videoId: "case-a",
        visualEstimates: [],
        uncertainties: [],
        errors: [],
      }),
    });

    expect(result.failures).toBe(0);
    expect(result.freezePath).toBeTruthy();
    const outDir = path.join(caseDir, "runs/pi-train-wrapper");
    const manifest = JSON.parse(readFileSync(path.join(outDir, "file-access-manifest.json"), "utf8"));
    const freeze = JSON.parse(readFileSync(path.join(workdir, "notebooks/recipe_loop_data/train/_pi_freeze.pi-train-wrapper.json"), "utf8"));

    expect(manifest).toMatchObject({
      staged: true,
      fastPrompt: true,
      compactSourcePacket: true,
      sourcePacketOnly: true,
      genericRepair: true,
      visualFrames: true,
      freezeAfterExtraction: true,
    });
    const visualLedger = JSON.parse(readFileSync(path.join(outDir, "visual-ledger.json"), "utf8"));
    const visualTargetLedger = JSON.parse(readFileSync(path.join(outDir, "visual-target-ledger.json"), "utf8"));
    const visualEstimates = JSON.parse(readFileSync(path.join(outDir, "visual-estimates.json"), "utf8"));
    const detailPrompt = readFileSync(path.join(outDir, "detail-01-r1-prompt.txt"), "utf8");
    expect(visualLedger.collectionStatus).toBe("completed");
    expect(visualTargetLedger.kind).toBe("visual-target-ledger");
    expect(visualEstimates.kind).toBe("visual-estimates");
    expect(detailPrompt).toContain("visualEvidence");
    expect(detailPrompt).toContain("visualEstimates");
    expect(detailPrompt).toContain("양파 반개");
    expect(freeze.completedCount).toBe(1);
  });

  it("persists Pi execution details when the live command fails", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    writeJson(path.join(caseDir, "source.json"), makeSource("case-a"));

    const error = new Error("fixture pi timeout") as Error & { piExecution?: Record<string, unknown> };
    error.piExecution = {
      code: null,
      signal: "SIGTERM",
      killed: true,
      timedOut: true,
      stdout: "",
      stderr: "timed out",
      command: ["pi"],
      timeoutMs: 1,
    };

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-mvp-failure",
    }, {
      projectRoot: workdir,
      executePi: async () => {
        throw error;
      },
    });

    expect(result.failures).toBe(1);
    const failure = JSON.parse(readFileSync(path.join(caseDir, "runs/pi-mvp-failure/failure.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(path.join(caseDir, "runs/pi-mvp-failure/file-access-manifest.json"), "utf8"));

    expect(failure.piExecution).toMatchObject({ timedOut: true, stderr: "timed out" });
    expect(manifest.forbiddenReadEvents).toEqual([]);
  });
});
