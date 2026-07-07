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
const holisticModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/pi-extractor/lib/holistic.mjs")).href;
const timelineModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/pi-extractor/lib/timeline.mjs")).href;
const promptModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/pi-extractor/lib/prompt.mjs")).href;
const visualModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/pi-extractor/lib/visual.mjs")).href;
const freezeModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/pi-extractor/freeze-pi-extraction.mjs")).href;

type TestSource = {
  schemaVersion: number;
  video: {
    videoId: string;
    title: string;
    url: string;
    description: string;
    tags: string[];
    durationSeconds?: number;
  };
  captions: {
    available: boolean;
    selectedTrack: { languageCode: string };
    segments: Array<{ startMs: number; endMs: number; text: string }>;
  };
  authorComments: { comments: Array<{ text: string }> };
};

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function makeSource(videoId = "case-a"): TestSource {
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

  it("drops non-object repair log entries from model output", async () => {
    const { normalizePiRecipeOutput, validatePiRecipeOutput } = await import(schemaModuleUrl);
    const normalized = normalizePiRecipeOutput({
      recipes: [{
        title: "테스트",
        ingredients: [{ name: "양파", amount: "1/2", unit: "개", amountBasis: "stated" }],
        steps: ["양파를 볶는다."],
      }],
      repairLog: ["모델이 설명 문장만 넣은 잘못된 로그"],
    });

    expect(normalized.repairLog).toEqual([]);
    expect(validatePiRecipeOutput(normalized)).toEqual([]);
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

  it("uses description timeline timestamps before caption cues and even-split ranges", async () => {
    const { buildCandidateLedger } = await import(artifactsModuleUrl);
    const ledger = buildCandidateLedger({
      sourcePacket: {
        video: {
          videoId: "case-a",
          durationSeconds: 900,
          title: "테스트",
          description: [
            "⏰타임라인⏰",
            "00:16 메밀 파이프 후토마끼",
            "04:55 맥적&열무 들기름냉파스타",
            "07:40 등촌칼국수&소곱창구이",
          ].join("\n"),
        },
        captions: {
          segments: [
            { startMs: 200000, endMs: 202000, text: "열무 들기름냉파스타를 만듭니다" },
          ],
        },
      },
      candidateOutput: {
        candidates: [
          { candidateId: "r1", title: "열무 들기름냉파스타", ingredientNames: ["열무"], evidence: ["description"], uncertainties: [] },
          { candidateId: "r2", title: "맥적구이", ingredientNames: ["돼지고기"], evidence: ["description"], uncertainties: [] },
          { candidateId: "r3", title: "등촌칼국수와 소곱창구이", ingredientNames: ["소곱창"], evidence: ["description"], uncertainties: [] },
        ],
      },
    });

    expect(ledger.candidates[0].timeRange).toMatchObject({
      basis: "description-timeline",
      startSec: 295,
      endSec: 460,
    });
    expect(ledger.candidates[1].timeRange).toMatchObject({
      basis: "description-timeline",
      startSec: 295,
      endSec: 460,
    });
    expect(ledger.candidates[2].timeRange).toMatchObject({
      basis: "description-timeline",
      startSec: 460,
    });
  });

  it("ignores zero-length and too-short candidate time ranges before source fallbacks", async () => {
    const { buildCandidateLedger } = await import(artifactsModuleUrl);
    const ledger = buildCandidateLedger({
      sourcePacket: {
        video: {
          videoId: "invalid-candidate-range",
          durationSeconds: 300,
          title: "테스트",
          description: [
            "00:30 된장찌개",
            "03:00 다른 요리",
          ].join("\n"),
        },
        captions: {
          segments: [
            { startMs: 220000, endMs: 223000, text: "고추장을 넣어 볶습니다" },
          ],
        },
      },
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "된장찌개",
            ingredientNames: ["된장"],
            evidence: ["description"],
            timeRange: { startSec: 0, endSec: 0 },
            uncertainties: [],
          },
          {
            candidateId: "r2",
            title: "고추장 볶음",
            ingredientNames: ["고추장"],
            evidence: ["caption"],
            timeRange: { startSec: 120, endSec: 121 },
            uncertainties: [],
          },
        ],
      },
    });

    expect(ledger.candidates[0].timeRange).toMatchObject({
      basis: "description-timeline",
      startSec: 30,
      endSec: 180,
    });
    expect(ledger.candidates[1].timeRange).toMatchObject({
      basis: "caption-cue",
      startSec: 200,
      endSec: 283,
    });
  });

  it("splits menu-list candidates joined by conjunctions before building ranges", async () => {
    const { applyGenericCandidateRepair } = await import(artifactsModuleUrl);
    const source = makeSource("menu-list-repair");
    source.video.description = [
      "*메뉴*",
      "고등어볶음과 계란찜",
      "닭갈비와 콘치즈",
      "해장파스타",
    ].join("\n");
    const repaired = applyGenericCandidateRepair({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "고등어볶음과 계란찜",
            ingredientNames: ["고등어", "달걀"],
            evidence: ["description"],
            uncertainties: [],
          },
          {
            candidateId: "r2",
            title: "닭갈비와 콘치즈",
            ingredientNames: ["닭고기", "옥수수", "치즈"],
            evidence: ["description"],
            uncertainties: [],
          },
          {
            candidateId: "r3",
            title: "해장파스타",
            ingredientNames: ["파스타면"],
            evidence: ["description"],
            uncertainties: [],
          },
        ],
      },
    });

    expect(repaired.candidates.map((candidate: { title: string }) => candidate.title)).toEqual([
      "고등어볶음",
      "계란찜",
      "닭갈비",
      "콘치즈",
      "해장파스타",
    ]);
    expect(repaired.candidates.map((candidate: { ingredientNames: string[] }) => candidate.ingredientNames)).toEqual([
      ["고등어"],
      [],
      [],
      ["치즈"],
      ["파스타면"],
    ]);
    expect(repaired.candidates.map((candidate: { sharedIngredientSeeds?: string[] }) => candidate.sharedIngredientSeeds ?? [])).toEqual([
      ["달걀"],
      ["달걀"],
      ["닭고기", "옥수수"],
      ["닭고기", "옥수수"],
      [],
    ]);
    expect(repaired.candidates.slice(0, 4).every((candidate: { uncertainties: string[] }) => (
      candidate.uncertainties.includes("묶음 후보 재료 seed는 sharedIngredientSeeds로만 보존하고 후보 확정 재료로 복사하지 않음")
    ))).toBe(true);
    expect(repaired.candidateRepairLog).toEqual([
      expect.objectContaining({
        field: "candidate",
        reasonCode: "split_description_menu_group_candidate",
        evidenceRef: ["description:고등어볶음과 계란찜"],
      }),
      expect.objectContaining({
        field: "candidate",
        reasonCode: "split_description_menu_group_candidate",
        evidenceRef: ["description:닭갈비와 콘치즈"],
      }),
    ]);
  });

  it("splits description timeline candidates joined by normalized title separators", async () => {
    const { applyGenericCandidateRepair } = await import(artifactsModuleUrl);
    const source = makeSource("timeline-title-repair");
    source.video.description = [
      "⏰타임라인⏰",
      "04:55 맥적&amp;열무 들기름냉파스타",
      "07:40 등촌칼국수 | 소곱창구이",
      "10:00 열무묵국ㅣ항정살 솥밥",
    ].join("\n");
    const repaired = applyGenericCandidateRepair({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "맥적과 열무 들기름냉파스타",
            ingredientNames: ["돼지고기", "열무"],
            evidence: ["description"],
            uncertainties: [],
          },
          {
            candidateId: "r2",
            title: "등촌칼국수와 소곱창구이",
            ingredientNames: ["칼국수면", "소곱창"],
            evidence: ["description"],
            uncertainties: [],
          },
          {
            candidateId: "r3",
            title: "열무묵국과 항정살 솥밥",
            ingredientNames: ["열무", "도토리묵", "항정살"],
            evidence: ["description"],
            uncertainties: [],
          },
        ],
      },
    });

    expect(repaired.candidates.map((candidate: { title: string }) => candidate.title)).toEqual([
      "맥적",
      "열무 들기름냉파스타",
      "등촌칼국수",
      "소곱창구이",
      "열무묵국",
      "항정살 솥밥",
    ]);
    expect(repaired.candidateRepairLog.map((entry: { reasonCode: string }) => entry.reasonCode)).toEqual([
      "split_description_group_candidate",
      "split_description_group_candidate",
      "split_description_group_candidate",
    ]);
  });

  it("keeps Korean conjunction characters inside menu words during menu-list split", async () => {
    const { applyGenericCandidateRepair } = await import(artifactsModuleUrl);
    const source = makeSource("menu-list-korean-conjunction-boundary");
    source.video.description = [
      "*메뉴*",
      "사과파이와 아이스크림",
      "과메기",
      "와플",
    ].join("\n");
    const repaired = applyGenericCandidateRepair({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "사과파이와 아이스크림",
            ingredientNames: ["사과", "아이스크림"],
            evidence: ["description"],
            uncertainties: [],
          },
          {
            candidateId: "r2",
            title: "과메기",
            ingredientNames: ["과메기"],
            evidence: ["description"],
            uncertainties: [],
          },
          {
            candidateId: "r3",
            title: "와플",
            ingredientNames: ["와플"],
            evidence: ["description"],
            uncertainties: [],
          },
        ],
      },
    });

    expect(repaired.candidates.map((candidate: { title: string }) => candidate.title)).toEqual([
      "사과파이",
      "아이스크림",
      "과메기",
      "와플",
    ]);
    expect(repaired.candidates.map((candidate: { ingredientNames: string[] }) => candidate.ingredientNames)).toEqual([
      ["사과"],
      ["아이스크림"],
      ["과메기"],
      ["와플"],
    ]);
    expect(repaired.candidates.map((candidate: { sharedIngredientSeeds?: string[] }) => candidate.sharedIngredientSeeds ?? [])).toEqual([
      [],
      [],
      [],
      [],
    ]);
  });

  it("keeps split menu shared ingredient seeds out of confirmed candidate ingredients", async () => {
    const { applyGenericCandidateRepair, buildCandidateLedger, buildEvidencePackets, buildVisualLedger } = await import(artifactsModuleUrl);
    const source = makeSource("menu-list-shared-seeds");
    source.video.durationSeconds = 120;
    source.video.description = [
      "*메뉴*",
      "계란찜과 콘치즈",
    ].join("\n");
    source.captions.segments = [];
    const repaired = applyGenericCandidateRepair({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "계란찜과 콘치즈",
            ingredientNames: ["달걀", "옥수수", "치즈"],
            evidence: ["description"],
            uncertainties: [],
          },
        ],
      },
    });
    const candidateLedger = buildCandidateLedger({ sourcePacket: source, candidateOutput: repaired });
    const evidencePackets = buildEvidencePackets({
      sourcePacket: source,
      candidateLedger,
      visualLedger: buildVisualLedger({ sourcePacket: source, candidateLedger }),
    });

    expect(candidateLedger.candidates.map((candidate: { ingredientNames: string[] }) => candidate.ingredientNames)).toEqual([
      [],
      ["치즈"],
    ]);
    expect(candidateLedger.candidates.map((candidate: { sharedIngredientSeeds?: string[] }) => candidate.sharedIngredientSeeds ?? [])).toEqual([
      ["달걀", "옥수수"],
      ["달걀", "옥수수"],
    ]);
    expect(evidencePackets.packets.map((candidate: { sharedIngredientSeeds?: string[] }) => candidate.sharedIngredientSeeds ?? [])).toEqual([
      ["달걀", "옥수수"],
      ["달걀", "옥수수"],
    ]);
    expect(evidencePackets.packets.map((candidate: { ingredientNames: string[] }) => candidate.ingredientNames)).toEqual([
      [],
      ["치즈"],
    ]);
  });

  it("reassigns split shared ingredient seeds only when candidate-scoped source evidence exists", async () => {
    const { applyGenericCandidateRepair, buildCandidateLedger, buildGapLedger, buildSourceDraft } = await import(artifactsModuleUrl);
    const source = makeSource("menu-list-shared-seed-source-reassignment");
    source.video.durationSeconds = 120;
    source.video.description = [
      "*메뉴*",
      "계란찜과 콘치즈",
    ].join("\n");
    source.captions.segments = [
      { startMs: 10000, endMs: 12000, text: "달걀 2개를 풀어 계란찜을 만듭니다." },
      { startMs: 80000, endMs: 82000, text: "옥수수와 치즈를 올려 콘치즈를 굽습니다." },
    ];
    const repaired = applyGenericCandidateRepair({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "계란찜과 콘치즈",
            ingredientNames: ["달걀", "옥수수", "치즈"],
            evidence: ["description"],
            uncertainties: [],
          },
        ],
      },
    });
    const candidateLedger = buildCandidateLedger({ sourcePacket: source, candidateOutput: repaired });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });

    expect(sourceDraft.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["달걀"]);
    expect(sourceDraft.recipes[0].ingredients[0]).toMatchObject({
      amount: "2",
      unit: "개",
      sourceEvidence: ["transcript:10s"],
    });
    expect(sourceDraft.recipes[1].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["치즈", "옥수수"]);
    expect(sourceDraft.recipes[1].ingredients.find((ingredient: { name: string }) => ingredient.name === "옥수수")).toMatchObject({
      amount: null,
      unit: null,
      sourceEvidence: ["transcript:80s"],
    });
    expect(gapLedger.gaps).toContainEqual(expect.objectContaining({
      candidateId: "r1.2",
      ingredient: "옥수수",
      visualTargetAllowed: true,
    }));
  });

  it("repairs missing shared seed ingredients only from candidate-scoped source evidence", async () => {
    const { applyGenericRepair } = await import(artifactsModuleUrl);
    const source = makeSource("shared-seed-detail-repair");
    source.video.title = "계란찜과 콘치즈";
    source.video.description = "";
    source.captions.segments = [
      { startMs: 12000, endMs: 14000, text: "달걀 2개를 풀어 계란찜을 만듭니다." },
      { startMs: 78000, endMs: 80000, text: "옥수수를 넣고 치즈를 올려 콘치즈를 굽습니다." },
    ];
    source.authorComments = {
      comments: [{ text: "콘치즈에는 옥수수와 치즈만 넣어도 충분해요." }],
    };
    const repaired = applyGenericRepair({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "계란찜",
            ingredientNames: [],
            sharedIngredientSeeds: ["달걀"],
            evidence: ["title"],
            timeRange: { startSec: 0, endSec: 50 },
            uncertainties: [],
          },
          {
            candidateId: "r2",
            title: "콘치즈",
            ingredientNames: ["치즈"],
            sharedIngredientSeeds: ["달걀", "옥수수"],
            evidence: ["title"],
            timeRange: { startSec: 60, endSec: 110 },
            uncertainties: [],
          },
        ],
      },
      output: {
        recipes: [
          {
            candidateId: "r1",
            title: "계란찜",
            ingredients: [],
            steps: ["달걀을 풀어 찐다."],
            uncertainties: [],
          },
          {
            candidateId: "r2",
            title: "콘치즈",
            ingredients: [{ name: "치즈", amount: null, unit: null, amountBasis: null, confidence: 0.3, evidence: ["title"] }],
            steps: ["옥수수와 치즈를 굽는다."],
            uncertainties: [],
          },
        ],
        repairLog: [],
      },
    });

    expect(repaired.recipes[0].ingredients).toEqual([
      expect.objectContaining({
        name: "달걀",
        amount: "2",
        unit: "개",
        amountBasis: "spoken",
        evidence: ["transcript:12s"],
      }),
    ]);
    expect(repaired.recipes[1].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["치즈", "옥수수"]);
    expect(repaired.recipes[1].ingredients.find((ingredient: { name: string }) => ingredient.name === "옥수수")).toMatchObject({
      amount: null,
      unit: null,
      amountBasis: null,
      evidence: ["author-comment:1", "transcript:78s"],
    });
    expect(repaired.recipes[1].ingredients.some((ingredient: { name: string }) => ingredient.name === "달걀")).toBe(false);
  });

  it("splits source-poor menu-list group lines into candidate identity ranges", async () => {
    const { buildCandidateLedger, buildEvidencePackets, buildVisualLedger } = await import(artifactsModuleUrl);
    const source = makeSource("menu-list-groups");
    source.video.durationSeconds = 300;
    source.video.description = [
      "오늘 만든 메뉴",
      "*메뉴*",
      "고등어볶음과 계란찜",
      "닭갈비와 콘치즈",
      "해장파스타",
    ].join("\n");
    source.captions.segments = [];
    source.authorComments = { comments: [] };
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          { candidateId: "r1", title: "고등어볶음", ingredientNames: ["생선살"], evidence: ["description"], uncertainties: [] },
          { candidateId: "r2", title: "계란찜", ingredientNames: ["달걀"], evidence: ["description"], uncertainties: [] },
          { candidateId: "r3", title: "닭갈비", ingredientNames: ["닭고기"], evidence: ["description"], uncertainties: [] },
          { candidateId: "r4", title: "콘치즈", ingredientNames: ["옥수수"], evidence: ["description"], uncertainties: [] },
          { candidateId: "r5", title: "해장파스타", ingredientNames: ["파스타면"], evidence: ["description"], uncertainties: [] },
        ],
      },
    });
    const evidencePackets = buildEvidencePackets({
      sourcePacket: source,
      candidateLedger,
      visualLedger: buildVisualLedger({ sourcePacket: source, candidateLedger }),
    });

    expect(candidateLedger.candidates[0].timeRange).toMatchObject({
      basis: "description-menu-group-even-split",
      startSec: 0,
      endSec: 50,
      cueText: "고등어볶음과 계란찜",
    });
    expect(candidateLedger.candidates[1].timeRange).toMatchObject({
      basis: "description-menu-group-even-split",
      startSec: 50,
      endSec: 100,
      cueText: "고등어볶음과 계란찜",
    });
    expect(candidateLedger.candidates[4].timeRange).toMatchObject({
      basis: "description-menu-group-even-split",
      startSec: 200,
      endSec: 300,
      cueText: "해장파스타",
    });
    expect(evidencePackets.packets[1].descriptionEvidence).toEqual([
      expect.objectContaining({
        ref: "description:3",
        text: "고등어볶음과 계란찜",
      }),
    ]);
    expect(evidencePackets.packets[2].descriptionEvidence).toEqual([
      expect.objectContaining({
        ref: "description:4",
        text: "닭갈비와 콘치즈",
      }),
    ]);
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

  it("keeps title-only ingredient hints out of confirmed source draft ingredients", async () => {
    const { buildCandidateLedger, buildEvidencePackets, buildGapLedger, buildSourceDraft, buildVisualLedger, buildVisualTargetLedger } = await import(artifactsModuleUrl);
    const { buildPiRecipeDetailPrompt } = await import(promptModuleUrl);
    const source = makeSource("title-only");
    source.video.title = "메밀 파스타";
    source.video.description = "";
    source.captions.segments = [];
    source.authorComments = { comments: [] };
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [{
          candidateId: "r1",
          title: "메밀 파스타",
          ingredientNames: ["메밀"],
          evidence: ["title"],
          sourceCues: ["title"],
          confidence: 0.8,
        }],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });
    const targetLedger = buildVisualTargetLedger({ sourcePacket: source, candidateLedger, gapLedger });
    const packets = buildEvidencePackets({
      sourcePacket: source,
      candidateLedger,
      visualLedger: buildVisualLedger({ sourcePacket: source, candidateLedger }),
      sourceDraft,
      gapLedger,
    });

    expect(candidateLedger.candidates[0].ingredientNames).toEqual(["메밀"]);
    expect(sourceDraft.recipes[0].ingredients).toEqual([]);
    expect(sourceDraft.recipes[0].ingredientIdentityHints).toEqual([
      expect.objectContaining({
        name: "메밀",
        sourceEvidence: ["title"],
        reasonCode: "dish_identity_only",
      }),
    ]);
    expect(gapLedger.gaps).toEqual([]);
    expect(targetLedger.targets).toHaveLength(0);
    expect(packets.packets[0].ingredientIdentityHints).toEqual(sourceDraft.recipes[0].ingredientIdentityHints);
    expect(packets.packets[0].possibleIngredientHints).toEqual([
      expect.objectContaining({
        name: "메밀",
        sourceEvidence: ["title"],
        reasonCode: "dish_identity_only",
      }),
    ]);

    const detailPrompt = buildPiRecipeDetailPrompt(source, candidateLedger.candidates[0], {
      fastPrompt: true,
      evidencePacket: packets.packets[0],
    });
    expect(detailPrompt).toContain("ingredientIdentityHints/possibleIngredientHints는 확정 재료가 아니다");
    expect(detailPrompt).toContain("요리 정체성과 visualEvidence 해석 힌트로만 사용한다");
    expect(detailPrompt).toContain('"possibleIngredientHints":[{"name":"메밀"');
  });

  it("tells source-poor detail prompts to bridge identity hints through frame-backed evidence only", async () => {
    const { buildPiRecipeDetailPrompt } = await import(promptModuleUrl);
    const source = makeSource("source-poor-visual-hint-bridge");
    const candidate = {
      candidateId: "r1",
      titleHint: "첫 번째 메뉴",
      ingredientNames: [],
      timeRange: { startSec: 0, endSec: 60, basis: "fixture" },
      uncertainties: [],
    };
    const evidencePacket = {
      candidateId: "r1",
      titleHint: "첫 번째 메뉴",
      timeRange: candidate.timeRange,
      ingredientNames: [],
      possibleIngredientHints: [{
        name: "주재료",
        reasonCode: "dish_identity_only",
        sourceEvidence: ["title"],
      }],
      stepEvidence: [],
      visualStepEvidence: [{
        ref: "frame:r1:1:onscreenText:1",
        text: "주재료를 넣고 섞어줍니다",
        type: "visual-onscreen",
        frameRef: "frame:r1:1",
      }],
      visualEvidence: [{
        ref: "frame:r1:1",
        observed: ["주재료", "양념"],
        onscreenText: ["주재료를 넣고 섞어줍니다"],
        quantityCues: [],
      }],
    };

    const detailPrompt = buildPiRecipeDetailPrompt(source, candidate, {
      fastPrompt: true,
      evidencePacket,
    });

    expect(detailPrompt).toContain("possibleIngredientHints와 visualEvidence/visualStepEvidence를 함께 대조한다");
    expect(detailPrompt).toContain("hint 이름이 frame/source 근거와 직접 이어질 때만 재료로 출력한다");
    expect(detailPrompt).toContain("source-poor 후보라도 frame/source 근거가 있으면 전처리/투입/섞기/익히기/마무리 중 확인된 흐름으로 최소 단계 skeleton을 만든다");
  });

  it("keeps timeline menu identity labels out of confirmed ingredients", async () => {
    const { buildCandidateLedger, buildEvidencePackets, buildGapLedger, buildSourceDraft, buildVisualLedger, buildVisualTargetLedger } = await import(artifactsModuleUrl);
    const source = makeSource("timeline-identity-labels");
    source.video.title = "달빛구이와 바람국";
    source.video.description = "00:00 달빛구이와 바람국";
    source.video.durationSeconds = 120;
    source.captions.segments = [];
    source.authorComments = { comments: [] };
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "달빛구이",
            ingredientNames: ["달빛구이"],
            evidence: ["title", "description"],
            timeRange: { startSec: 0, endSec: 60 },
          },
          {
            candidateId: "r2",
            title: "바람국",
            ingredientNames: ["바람국"],
            evidence: ["title", "description"],
            timeRange: { startSec: 60, endSec: 120 },
          },
        ],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });
    const targetLedger = buildVisualTargetLedger({ sourcePacket: source, candidateLedger, gapLedger });
    const packets = buildEvidencePackets({
      sourcePacket: source,
      candidateLedger,
      visualLedger: buildVisualLedger({ sourcePacket: source, candidateLedger }),
      sourceDraft,
      gapLedger,
    });

    expect(sourceDraft.recipes.map((recipe: { ingredients: unknown[] }) => recipe.ingredients)).toEqual([[], []]);
    expect(sourceDraft.recipes[0].ingredientIdentityHints).toEqual([
      expect.objectContaining({
        name: "달빛구이",
        sourceEvidence: ["title", "description:1"],
        reasonCode: "dish_identity_only",
      }),
    ]);
    expect(gapLedger.gaps).toEqual([]);
    expect(targetLedger.targets).toEqual([]);
    expect(packets.packets[0].ingredientIdentityHints).toEqual(sourceDraft.recipes[0].ingredientIdentityHints);
  });

  it("does not repair title-only dish identity hints as ingredients", async () => {
    const { applyGenericRepair } = await import(artifactsModuleUrl);
    const source = makeSource("title-only-repair");
    source.video.title = "달빛구이와 바람국";
    source.video.description = "00:00 달빛구이와 바람국";
    source.video.durationSeconds = 120;
    source.captions.segments = [];
    source.authorComments = { comments: [] };

    const repaired = applyGenericRepair({
      sourcePacket: source,
      candidateOutput: {
        candidates: [{
          candidateId: "r1",
          title: "달빛구이",
          ingredientNames: ["달빛구이"],
          evidence: ["title", "description:1"],
          timeRange: { startSec: 0, endSec: 60 },
          uncertainties: [],
        }],
      },
      output: {
        recipes: [{
          candidateId: "r1",
          title: "달빛구이",
          ingredients: [{
            name: "달빛구이",
            amount: null,
            unit: null,
            amountBasis: null,
            confidence: 0.4,
            evidence: ["title", "description:1"],
          }],
          steps: ["달빛구이를 준비한다."],
          uncertainties: [],
        }],
        repairLog: [],
      },
    });

    expect(repaired.recipes[0].ingredients).toEqual([]);
    expect(repaired.repairLog[0]).toMatchObject({
      field: "ingredient",
      reasonCode: "remove_dish_identity_only_ingredient",
      evidenceRef: ["title", "description:1"],
    });
  });

  it("does not promote title-only shared seeds into source draft ingredients", async () => {
    const { buildCandidateLedger, buildGapLedger, buildSourceDraft, buildVisualTargetLedger } = await import(artifactsModuleUrl);
    const source = makeSource("title-only-shared-seed");
    source.video.title = "메밀 파스타";
    source.video.description = "";
    source.captions.segments = [];
    source.authorComments = { comments: [] };
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [{
          candidateId: "r1",
          title: "메밀 파스타",
          ingredientNames: [],
          sharedIngredientSeeds: ["메밀"],
          evidence: ["title"],
          sourceCues: ["title"],
          confidence: 0.8,
        }],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });
    const targetLedger = buildVisualTargetLedger({ sourcePacket: source, candidateLedger, gapLedger });

    expect(candidateLedger.candidates[0]).toMatchObject({
      ingredientNames: [],
      sharedIngredientSeeds: ["메밀"],
    });
    expect(sourceDraft.recipes[0].ingredients).toEqual([]);
    expect(gapLedger.gaps).toEqual([]);
    expect(targetLedger.targets).toEqual([]);
  });

  it("does not suppress visual targets with amount cues from another recipe range", async () => {
    const { buildGapLedger, buildSourceDraft, buildVisualTargetLedger } = await import(artifactsModuleUrl);
    const source = makeSource("multi-candidate-amount-cue");
    source.video.description = "[재료]\n양파";
    source.captions.segments = [
      { startMs: 10000, endMs: 12000, text: "양파 1개를 볶습니다." },
      { startMs: 110000, endMs: 112000, text: "양파를 얇게 썰어 주세요." },
    ];
    const candidateLedger = {
      candidates: [
        {
          candidateId: "r1",
          titleHint: "양파 볶음",
          ingredientNames: ["양파"],
          sourceCues: ["caption"],
          timeRange: { basis: "fixture", startSec: 0, endSec: 50 },
          uncertainties: [],
        },
        {
          candidateId: "r2",
          titleHint: "양파 무침",
          ingredientNames: ["양파"],
          sourceCues: ["description", "caption"],
          timeRange: { basis: "fixture", startSec: 100, endSec: 150 },
          uncertainties: [],
        },
      ],
    };
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });
    const targetLedger = buildVisualTargetLedger({ sourcePacket: source, candidateLedger, gapLedger });

    expect(sourceDraft.recipes[0].ingredients[0]).toMatchObject({
      name: "양파",
      amount: "1",
      unit: "개",
      sourceEvidence: ["transcript:10s"],
    });
    expect(sourceDraft.recipes[1].ingredients[0]).toMatchObject({
      name: "양파",
      amount: null,
      unit: null,
    });
    expect(gapLedger.gaps.find((gap: { candidateId?: string }) => gap.candidateId === "r2")).toMatchObject({
      ingredient: "양파",
      visualTargetAllowed: true,
    });
    expect(targetLedger.targets).toEqual([
      expect.objectContaining({
        candidateId: "r2",
        ingredient: "양파",
      }),
    ]);
  });

  it("does not suppress shared-range visual targets with amount cues from a sibling slice", async () => {
    const { buildGapLedger, buildSourceDraft, buildVisualTargetLedger } = await import(artifactsModuleUrl);
    const source = makeSource("shared-range-amount-cue");
    source.video.durationSeconds = 120;
    source.video.description = "00:00 첫 번째 메뉴&두 번째 메뉴";
    source.captions.segments = [
      { startMs: 10000, endMs: 12000, text: "양파 1개를 볶습니다." },
      { startMs: 80000, endMs: 82000, text: "양파를 얇게 썰어 주세요." },
    ];
    const candidateLedger = {
      candidates: [
        {
          candidateId: "r1",
          titleHint: "첫 번째 메뉴",
          ingredientNames: ["양파"],
          sourceCues: ["caption"],
          timeRange: { basis: "fixture-shared", startSec: 0, endSec: 120 },
          uncertainties: [],
        },
        {
          candidateId: "r2",
          titleHint: "두 번째 메뉴",
          ingredientNames: ["양파"],
          sourceCues: ["caption"],
          timeRange: { basis: "fixture-shared", startSec: 0, endSec: 120 },
          uncertainties: [],
        },
      ],
    };
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });
    const targetLedger = buildVisualTargetLedger({ sourcePacket: source, candidateLedger, gapLedger });

    expect(sourceDraft.recipes[0].ingredients[0]).toMatchObject({
      name: "양파",
      amount: "1",
      unit: "개",
      sourceEvidence: ["transcript:10s"],
    });
    expect(sourceDraft.recipes[1].ingredients[0]).toMatchObject({
      name: "양파",
      amount: null,
      unit: null,
      sourceEvidence: ["transcript:80s"],
    });
    expect(gapLedger.gaps.find((gap: { candidateId?: string }) => gap.candidateId === "r2")).toMatchObject({
      ingredient: "양파",
      visualTargetAllowed: true,
    });
    expect(targetLedger.targets).toEqual([
      expect.objectContaining({
        candidateId: "r2",
        ingredient: "양파",
        reason: "caption_or_action_cue_without_amount",
        textCues: ["양파를 얇게 썰어 주세요."],
      }),
    ]);
  });

  it("does not repair missing amounts with source cues from another recipe range", async () => {
    const { applyGenericRepair } = await import(artifactsModuleUrl);
    const source = makeSource("multi-candidate-repair");
    source.video.description = "[재료]\n양파";
    source.captions.segments = [
      { startMs: 10000, endMs: 12000, text: "양파 1개를 볶습니다." },
      { startMs: 110000, endMs: 112000, text: "양파를 얇게 썰어 주세요." },
    ];
    const repaired = applyGenericRepair({
      sourcePacket: source,
      candidateOutput: {
        candidates: [{
          candidateId: "r2",
          title: "양파 무침",
          ingredientNames: ["양파"],
          evidence: ["description:2", "transcript:110s"],
          sourceCues: ["description", "caption"],
          timeRange: { basis: "fixture", startSec: 100, endSec: 150 },
          uncertainties: [],
        }],
      },
      output: {
        recipes: [{
          candidateId: "r2",
          title: "양파 무침",
          ingredients: [],
          steps: ["양파를 썬다."],
          uncertainties: [],
        }],
        repairLog: [],
      },
    });

    expect(repaired.recipes[0].ingredients).toEqual([
      expect.objectContaining({
        name: "양파",
        amount: null,
        unit: null,
        amountBasis: null,
        evidence: ["description:2", "transcript:110s"],
      }),
    ]);
    expect(repaired.repairLog[0]).toMatchObject({
      field: "ingredient",
      reasonCode: "missing_evidence_backed_ingredient",
      confidence: 0.45,
    });
  });

  it("scopes description timeline amount cues to the matching recipe range", async () => {
    const { buildCandidateLedger, buildGapLedger, buildSourceDraft, buildVisualTargetLedger } = await import(artifactsModuleUrl);
    const source = makeSource("description-timeline-amount-cue");
    source.video.durationSeconds = 180;
    source.video.description = [
      "00:00 양파 볶음",
      "양파 1개",
      "01:00 양파 무침",
      "양파",
    ].join("\n");
    source.captions.segments = [];
    source.authorComments = { comments: [] };
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "양파 볶음",
            ingredientNames: ["양파"],
            evidence: ["description"],
            uncertainties: [],
          },
          {
            candidateId: "r2",
            title: "양파 무침",
            ingredientNames: ["양파"],
            evidence: ["description"],
            uncertainties: [],
          },
        ],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });
    const targetLedger = buildVisualTargetLedger({ sourcePacket: source, candidateLedger, gapLedger });

    expect(candidateLedger.candidates[0].timeRange).toMatchObject({ startSec: 0, endSec: 60 });
    expect(candidateLedger.candidates[1].timeRange).toMatchObject({ startSec: 60, endSec: 180 });
    expect(sourceDraft.recipes[0].ingredients[0]).toMatchObject({
      name: "양파",
      amount: "1",
      unit: "개",
      sourceEvidence: ["description:2"],
    });
    expect(sourceDraft.recipes[1].ingredients[0]).toMatchObject({
      name: "양파",
      amount: null,
      unit: null,
      sourceEvidence: ["description:3", "description:4"],
    });
    expect(gapLedger.gaps.find((gap: { candidateId?: string }) => gap.candidateId === "r2")).toMatchObject({
      ingredient: "양파",
      visualTargetAllowed: true,
    });
    expect(targetLedger.targets).toEqual([
      expect.objectContaining({
        candidateId: "r2",
        ingredient: "양파",
        textCues: ["01:00 양파 무침", "양파"],
      }),
    ]);
  });

  it("keeps description timeline scope across blank lines before the next timestamp", async () => {
    const { buildCandidateLedger, buildSourceDraft } = await import(artifactsModuleUrl);
    const source = makeSource("description-timeline-blank-line-amount-cue");
    source.video.durationSeconds = 180;
    source.video.description = [
      "00:00 양파 볶음",
      "",
      "양파 1개",
      "01:00 양파 무침",
      "양파",
    ].join("\n");
    source.captions.segments = [];
    source.authorComments = { comments: [] };
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "양파 볶음",
            ingredientNames: ["양파"],
            evidence: ["description"],
            uncertainties: [],
          },
          {
            candidateId: "r2",
            title: "양파 무침",
            ingredientNames: ["양파"],
            evidence: ["description"],
            uncertainties: [],
          },
        ],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });

    expect(sourceDraft.recipes[0].ingredients[0]).toMatchObject({
      name: "양파",
      amount: "1",
      unit: "개",
      sourceEvidence: ["description:2"],
    });
    expect(sourceDraft.recipes[1].ingredients[0]).toMatchObject({
      name: "양파",
      amount: null,
      unit: null,
      sourceEvidence: ["description:3", "description:4"],
    });
  });

  it("does not treat pre-timeline description amounts as shared candidate evidence", async () => {
    const { buildCandidateLedger, buildSourceDraft } = await import(artifactsModuleUrl);
    const source = makeSource("description-pre-timeline-amount-cue");
    source.video.durationSeconds = 180;
    source.video.description = [
      "양파 1개",
      "00:00 양파 볶음",
      "양파",
      "01:00 양파 무침",
      "양파",
    ].join("\n");
    source.captions.segments = [];
    source.authorComments = { comments: [] };
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "양파 볶음",
            ingredientNames: ["양파"],
            evidence: ["description"],
            uncertainties: [],
          },
          {
            candidateId: "r2",
            title: "양파 무침",
            ingredientNames: ["양파"],
            evidence: ["description"],
            uncertainties: [],
          },
        ],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });

    expect(sourceDraft.recipes[0].ingredients[0]).toMatchObject({
      name: "양파",
      amount: null,
      unit: null,
      sourceEvidence: ["description:2", "description:3"],
    });
    expect(sourceDraft.recipes[1].ingredients[0]).toMatchObject({
      name: "양파",
      amount: null,
      unit: null,
      sourceEvidence: ["description:4", "description:5"],
    });
  });

  it("does not repair missing amounts with description timeline cues from another recipe range", async () => {
    const { applyGenericRepair, buildCandidateLedger } = await import(artifactsModuleUrl);
    const source = makeSource("description-timeline-repair");
    source.video.durationSeconds = 180;
    source.video.description = [
      "00:00 양파 볶음",
      "양파 1개",
      "01:00 양파 무침",
      "양파",
    ].join("\n");
    source.captions.segments = [];
    source.authorComments = { comments: [] };
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r2",
            title: "양파 무침",
            ingredientNames: ["양파"],
            evidence: ["description"],
            uncertainties: [],
          },
        ],
      },
    });
    const repaired = applyGenericRepair({
      sourcePacket: source,
      candidateOutput: candidateLedger,
      output: {
        recipes: [{
          candidateId: "r2",
          title: "양파 무침",
          ingredients: [],
          steps: ["양파를 썬다."],
          uncertainties: [],
        }],
        repairLog: [],
      },
    });

    expect(repaired.recipes[0].ingredients).toEqual([
      expect.objectContaining({
        name: "양파",
        amount: null,
        unit: null,
        amountBasis: null,
      }),
    ]);
    expect(repaired.repairLog[0]).toMatchObject({
      field: "ingredient",
      reasonCode: "missing_evidence_backed_ingredient",
      confidence: 0.45,
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

  it("does not promote selected frames to evidence when the estimator omits frame refs", async () => {
    const { collectVisualEstimates } = await import(visualModuleUrl);
    const manifest = {
      version: 1,
      projectRoot: workdir,
      allowedReadPaths: [],
      readEvents: [],
      writeEvents: [],
      forbiddenReadEvents: [],
      createdAt: new Date().toISOString(),
    };

    const result = await collectVisualEstimates({
      visualTargetLedger: {
        targets: [{
          targetId: "r1:럼",
          candidateId: "r1",
          ingredient: "럼",
          textCues: ["럼"],
        }],
      },
      visualLedger: {
        targets: [{
          targetId: "r1:럼",
          candidateId: "r1",
          ingredient: "럼",
          frames: [{ ref: "frame:r1:럼:1", path: "frame-rum.jpg" }],
        }],
      },
      projectRoot: workdir,
      cacheRoot: path.join(workdir, "cache"),
      manifest,
      model: "fixture",
      executePiFn: async () => ({
        ingredient: "럼",
        targetVisible: true,
        referenceObjectVisible: true,
        countEvidence: null,
        amount: "약 1",
        unit: "큰술",
        amountBasis: "visual-estimate",
        confidence: 0.45,
        evidence: [],
        reason: "병이 보이지만 frame ref를 직접 인용하지 않음",
        uncertainties: [],
      }),
    });

    expect(result.visualEstimates[0]).toMatchObject({
      ingredient: "럼",
      amount: null,
      unit: null,
      amountBasis: null,
      evidence: [],
      availableFrameRefs: ["frame:r1:럼:1"],
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

  it("rejects count evidence that is not linked to an evidence frame", async () => {
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
          countEvidence: "계란 2개를 셀 수 있음",
          amount: "2",
          unit: "개",
          amountBasis: "visual-estimate",
          evidence: ["frame:r1:계란:1"],
        }],
      },
    });

    expect(contract.failureCount).toBe(1);
    expect(contract.output.recipes[0].ingredients[0]).toMatchObject({
      amount: null,
      unit: null,
      amountBasis: null,
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
    expect(() => recordRead(
      manifest,
      path.join(workdir, ".omx/plans/pi-holistic009-train-20260706-vs-golden.html"),
      "comparison-html",
    )).toThrow(/source-only guard blocked read/);
    expect(() => recordRead(
      manifest,
      path.join(workdir, "notebooks/recipe_loop_data/train/_grade_semantic.old.json"),
      "semantic-grade-summary",
    )).toThrow(/source-only guard blocked read/);
    expect(() => recordRead(
      manifest,
      path.join(workdir, "notebooks/recipe_loop_data/train/case-a/runs/old/holistic-final-result.json"),
      "previous-holistic-final",
    )).toThrow(/source-only guard blocked read/);
    expect(() => recordRead(
      manifest,
      path.join(workdir, "notebooks/recipe_loop_data/train/case-a/runs/old/holistic-visual-repair-result.json"),
      "previous-holistic-repair",
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
      "⏰타임라인⏰",
      "00:16 메밀 파이프 후토마끼",
      "04:55 맥적&열무 들기름냉파스타",
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
    expect(packet.video.description).toContain("00:16 메밀 파이프 후토마끼");
    expect(packet.video.description).toContain("04:55 맥적&열무 들기름냉파스타");
    expect(packet.video.description).toContain("럼(바카디 화이트)");
    expect(packet.video.description).not.toContain("https://");
    expect(packet.video.description).not.toContain("비즈니스 메일");
    expect(packet.truncation.compactSourcePacket).toBe(true);
  });

  it("scopes candidate source evidence to the candidate caption time range", async () => {
    const {
      buildCandidateLedger,
      buildEvidencePackets,
      buildGapLedger,
      buildSourceDraft,
      buildVisualLedger,
    } = await import(artifactsModuleUrl);
    const source = makeSource("case-scoped-captions");
    source.video.description = [
      "00:00 양파 볶음",
      "01:20 양파 절임",
    ].join("\n");
    source.captions.segments = [
      { startMs: 10000, endMs: 12000, text: "양파 1개를 넣고 볶습니다." },
      { startMs: 90000, endMs: 92000, text: "양파 3개를 식초에 절입니다." },
    ];
    const candidateOutput = {
      candidates: [
        {
          candidateId: "r1",
          title: "양파 볶음",
          ingredientNames: ["양파"],
          evidence: ["description"],
          timeRange: { startSec: 0, endSec: 40 },
        },
        {
          candidateId: "r2",
          title: "양파 절임",
          ingredientNames: ["양파"],
          evidence: ["description"],
          timeRange: { startSec: 80, endSec: 120 },
        },
      ],
    };

    const candidateLedger = buildCandidateLedger({ sourcePacket: source, candidateOutput });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });
    const visualLedger = buildVisualLedger({ sourcePacket: source, candidateLedger });
    const packets = buildEvidencePackets({ sourcePacket: source, candidateLedger, visualLedger, sourceDraft, gapLedger });

    expect(sourceDraft.recipes[0].ingredients[0]).toMatchObject({
      amount: "1",
      unit: "개",
      sourceEvidence: ["transcript:10s"],
    });
    expect(sourceDraft.recipes[1].ingredients[0]).toMatchObject({
      amount: "3",
      unit: "개",
      sourceEvidence: ["transcript:90s"],
    });
    expect(packets.packets[0].transcriptEvidence.map((entry: { ref: string }) => entry.ref)).toEqual(["transcript:10s"]);
    expect(packets.packets[1].transcriptEvidence.map((entry: { ref: string }) => entry.ref)).toEqual(["transcript:90s"]);
    expect(packets.packets[0].descriptionEvidence.map((entry: { text: string }) => entry.text).join("\n")).not.toContain("양파 3개");
    expect(packets.packets[1].descriptionEvidence.map((entry: { text: string }) => entry.text).join("\n")).not.toContain("양파 1개");
  });

  it("passes scoped action cues to detail evidence even when candidate ingredients are sparse", async () => {
    const {
      buildCandidateLedger,
      buildEvidencePackets,
      buildSourceDraft,
      buildVisualLedger,
    } = await import(artifactsModuleUrl);
    const source = makeSource("case-sparse-action-cues");
    source.video.description = [
      "00:00 첫 번째 메뉴",
      "01:00 두 번째 메뉴",
    ].join("\n");
    source.captions.segments = [
      { startMs: 10000, endMs: 12000, text: "채소를 넣고 볶습니다." },
      { startMs: 20000, endMs: 22000, text: "양념을 섞어 마무리합니다." },
      { startMs: 80000, endMs: 82000, text: "다른 후보는 끓입니다." },
    ];
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [{
          candidateId: "r1",
          title: "첫 번째 메뉴",
          ingredientNames: [],
          evidence: ["description"],
          timeRange: { startSec: 0, endSec: 40 },
        }],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const visualLedger = buildVisualLedger({ sourcePacket: source, candidateLedger });
    const packets = buildEvidencePackets({ sourcePacket: source, candidateLedger, visualLedger, sourceDraft });

    expect(packets.packets[0].transcriptEvidence).toEqual([]);
    expect(packets.packets[0].stepEvidence.map((entry: { ref: string }) => entry.ref)).toEqual([
      "transcript:10s",
      "transcript:20s",
    ]);
    expect(packets.packets[0].stepEvidence.map((entry: { text: string }) => entry.text).join("\n")).not.toContain("다른 후보");
  });

  it("creates candidate-level visual recall targets for source-poor candidates with scoped action cues", async () => {
    const { buildCandidateLedger, buildGapLedger, buildSourceDraft, buildVisualTargetLedger } = await import(artifactsModuleUrl);
    const source = makeSource("case-source-poor-candidate-recall");
    source.video.title = "첫 번째 메뉴와 두 번째 메뉴";
    source.video.description = [
      "00:00 첫 번째 메뉴",
      "01:00 두 번째 메뉴",
    ].join("\n");
    source.video.durationSeconds = 120;
    source.captions.segments = [
      { startMs: 10000, endMs: 12000, text: "양파를 넣고 볶습니다." },
      { startMs: 70000, endMs: 72000, text: "재료를 넣고 끓입니다." },
    ];
    source.authorComments = { comments: [] };
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "첫 번째 메뉴",
            ingredientNames: [],
            evidence: ["description"],
            uncertainties: [],
          },
          {
            candidateId: "r2",
            title: "두 번째 메뉴",
            ingredientNames: [],
            evidence: ["description"],
            uncertainties: [],
          },
        ],
      },
    });

    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });
    const targetLedger = buildVisualTargetLedger({ sourcePacket: source, candidateLedger, gapLedger });

    expect(sourceDraft.recipes.map((recipe: { ingredients: unknown[] }) => recipe.ingredients)).toEqual([[], []]);
    expect(gapLedger.gaps).toEqual([
      expect.objectContaining({
        candidateId: "r1",
        field: "recipe.visualRecall",
        gapType: "source_poor_candidate_visual_recall",
        targetType: "candidate_visual_recall",
        visualTargetAllowed: true,
        sourceEvidence: expect.arrayContaining(["description:1", "transcript:10s"]),
      }),
      expect.objectContaining({
        candidateId: "r2",
        field: "recipe.visualRecall",
        gapType: "source_poor_candidate_visual_recall",
        targetType: "candidate_visual_recall",
        visualTargetAllowed: true,
        sourceEvidence: expect.arrayContaining(["description:2", "transcript:70s"]),
      }),
    ]);
    expect(targetLedger.targets).toEqual([
      expect.objectContaining({
        candidateId: "r1",
        ingredient: null,
        targetType: "candidate_visual_recall",
        reason: "source_poor_candidate_visual_recall",
        fallbackPolicy: "candidate-action-cue",
        textCues: expect.arrayContaining(["양파를 넣고 볶습니다."]),
      }),
      expect.objectContaining({
        candidateId: "r2",
        ingredient: null,
        targetType: "candidate_visual_recall",
        reason: "source_poor_candidate_visual_recall",
        fallbackPolicy: "candidate-action-cue",
        textCues: expect.arrayContaining(["재료를 넣고 끓입니다."]),
      }),
    ]);
  });

  it("analyzes target frames as candidate visual context for additional visible ingredients", async () => {
    const { createAccessManifest } = await import(guardModuleUrl);
    const {
      buildCandidateLedger,
      buildEvidencePackets,
      buildGapLedger,
      buildSourceDraft,
      buildVisualTargetLedger,
    } = await import(artifactsModuleUrl);
    const { collectVisualLedger } = await import(visualModuleUrl);
    const source = makeSource("case-target-context");
    source.video.durationSeconds = 60;
    source.video.description = "00:00 메밀 후토마끼\n재료: 메밀";
    source.captions.segments = [];
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [{
          candidateId: "r1",
          title: "메밀 후토마끼",
          ingredientNames: ["메밀"],
          evidence: ["description"],
          timeRange: { startSec: 0, endSec: 60 },
        }],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });
    const visualTargetLedger = buildVisualTargetLedger({
      sourcePacket: source,
      candidateLedger,
      gapLedger,
      maxTargetsPerCandidate: 1,
      maxTotalTargetsPerCase: 1,
    });
    const manifest = createAccessManifest({ projectRoot: workdir });

    const visualLedger = await collectVisualLedger({
      sourcePacket: source,
      candidateLedger,
      visualTargetLedger,
      projectRoot: workdir,
      cacheRoot: path.join(workdir, "cache", "frames"),
      manifest,
      model: "gpt-test",
      framesPerRange: 1,
      descriptionOnlySweepFrames: 1,
      maxFramesPerTarget: 1,
      timeoutMs: 1000,
      executeCommandFn: async (command: string[]) => {
        const outputIndex = command.indexOf("-o");
        if (outputIndex >= 0) {
          const clipPath = command[outputIndex + 1].replace("%(ext)s", "mp4");
          mkdirSync(path.dirname(clipPath), { recursive: true });
          writeFileSync(clipPath, "clip", "utf8");
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        const outDirIndex = command.indexOf("--out-dir");
        if (outDirIndex >= 0) {
          const frameDir = command[outDirIndex + 1];
          const framePath = path.join(frameDir, "frame-0001.jpg");
          mkdirSync(frameDir, { recursive: true });
          writeFileSync(framePath, "frame", "utf8");
          writeJson(path.join(frameDir, "frames.json"), [{ path: framePath }]);
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      executePiFn: async () => ({
        observed: ["오이", "달걀말이"],
        onscreenText: ["오이 1개"],
        quantityCues: ["달걀 2개"],
        confidence: 0.82,
      }),
    });
    const packets = buildEvidencePackets({ sourcePacket: source, candidateLedger, visualLedger, sourceDraft, gapLedger });

    expect(visualLedger.candidates[0]).toMatchObject({
      candidateId: "r1",
      observed: ["오이", "달걀말이"],
      onscreenText: ["오이 1개"],
      quantityCues: ["달걀 2개"],
    });
    expect(visualLedger.candidates[0].frames[0]).toMatchObject({
      observed: ["오이", "달걀말이"],
      onscreenText: ["오이 1개"],
      quantityCues: ["달걀 2개"],
    });
    expect(packets.packets[0].visualEvidence[0]).toMatchObject({
      observed: ["오이", "달걀말이"],
      onscreenText: ["오이 1개"],
      quantityCues: ["달걀 2개"],
    });
  });

  it("passes visual action text as step evidence for source-poor candidates", async () => {
    const {
      buildCandidateLedger,
      buildEvidencePackets,
      buildSourceDraft,
    } = await import(artifactsModuleUrl);
    const source = makeSource("case-visual-step-evidence");
    source.video.durationSeconds = 90;
    source.video.description = "00:00 첫 번째 메뉴";
    source.captions.segments = [];
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [{
          candidateId: "r1",
          title: "첫 번째 메뉴",
          ingredientNames: [],
          evidence: ["description"],
          timeRange: { startSec: 0, endSec: 90 },
        }],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const visualLedger = {
      candidates: [{
        candidateId: "r1",
        frames: [{
          ref: "frame:r1:1",
          observed: ["주재료", "양념"],
          onscreenText: ["주재료를 넣어줍니다", "양념을 넣고 섞어줍니다"],
          quantityCues: ["소금 1작은술"],
        }],
      }],
    };
    const packets = buildEvidencePackets({ sourcePacket: source, candidateLedger, visualLedger, sourceDraft });

    expect(packets.packets[0].stepEvidence).toEqual([]);
    expect(packets.packets[0].visualStepEvidence).toEqual([
      {
        ref: "frame:r1:1:onscreenText:1",
        text: "주재료를 넣어줍니다",
        type: "visual-onscreen",
        frameRef: "frame:r1:1",
      },
      {
        ref: "frame:r1:1:onscreenText:2",
        text: "양념을 넣고 섞어줍니다",
        type: "visual-onscreen",
        frameRef: "frame:r1:1",
      },
    ]);
  });

  it("uses compact frame/source evidence bullets in detail prompts instead of raw frame dumps", async () => {
    const {
      buildCandidateLedger,
      buildEvidencePackets,
      buildSourceDraft,
    } = await import(artifactsModuleUrl);
    const { buildPiRecipeDetailPrompt } = await import(promptModuleUrl);
    const source = makeSource("case-compact-evidence-packet");
    source.video.durationSeconds = 90;
    source.video.description = [
      "00:00 첫 번째 메뉴",
      "00:45 다른 메뉴",
    ].join("\n");
    source.captions.segments = [
      { startMs: 10000, endMs: 12000, text: "부재료를 넣고 섞습니다." },
      { startMs: 20000, endMs: 22000, text: "마무리 재료를 올립니다." },
      { startMs: 60000, endMs: 62000, text: "다른 후보 재료를 끓입니다." },
    ];
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [{
          candidateId: "r1",
          title: "첫 번째 메뉴",
          ingredientNames: ["주재료"],
          sharedIngredientSeeds: ["부재료"],
          evidence: ["description"],
          timeRange: { startSec: 0, endSec: 40 },
        }],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const visualLedger = {
      candidates: [{
        candidateId: "r1",
        frames: [{
          ref: "frame:r1:1",
          path: "/tmp/raw-frame-should-not-be-in-prompt.jpg",
          rawRef: "/tmp/raw-response-should-not-be-in-prompt.json",
          observed: ["주재료", "부재료", "마무리 재료"],
          onscreenText: [
            "부재료를 넣고 섞습니다",
            "마무리 재료를 넣고 마무리합니다",
            "관계없는 안내 문구",
          ],
          quantityCues: ["부재료 1큰술"],
          confidence: 0.8,
        }],
      }],
    };
    const packets = buildEvidencePackets({ sourcePacket: source, candidateLedger, visualLedger, sourceDraft });
    const packet = packets.packets[0] as {
      compactEvidenceBullets?: Array<{
        ref: string;
        source: string;
        kind: string;
        text?: string;
        observed?: string[];
        onscreenText?: string[];
        quantityCues?: string[];
      }>;
    };
    const prompt = buildPiRecipeDetailPrompt(source, candidateLedger.candidates[0], {
      sourcePacketOnly: true,
      evidencePacket: packet,
    });

    expect(packet.compactEvidenceBullets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ref: "transcript:10s",
        source: "transcript",
        kind: "step",
        text: "부재료를 넣고 섞습니다.",
      }),
      expect.objectContaining({
        ref: "frame:r1:1",
        source: "frame",
        kind: "visual-frame",
        observed: ["주재료", "부재료", "마무리 재료"],
        onscreenText: ["부재료를 넣고 섞습니다", "마무리 재료를 넣고 마무리합니다"],
        quantityCues: ["부재료 1큰술"],
      }),
    ]));
    expect(packet.compactEvidenceBullets?.length).toBeLessThanOrEqual(8);
    expect(prompt).toContain('"compactEvidenceBullets"');
    expect(prompt).toContain('"ref": "frame:r1:1"');
    expect(prompt).not.toContain("raw-frame-should-not-be-in-prompt");
    expect(prompt).not.toContain("raw-response-should-not-be-in-prompt");
    expect(prompt).not.toContain("관계없는 안내 문구");
  });

  it("falls back to candidate-window visual context when a source-poor candidate has no visual target frames", async () => {
    const { createAccessManifest } = await import(guardModuleUrl);
    const {
      buildCandidateLedger,
      buildEvidencePackets,
      buildGapLedger,
      buildSourceDraft,
      buildVisualTargetLedger,
    } = await import(artifactsModuleUrl);
    const { collectVisualLedger } = await import(visualModuleUrl);
    const source = makeSource("case-candidate-window-context");
    source.video.durationSeconds = 60;
    source.video.description = "00:00 양파볶음\n재료: 양파\n00:30 둘째 메뉴";
    source.captions.segments = [];
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "양파볶음",
            ingredientNames: ["양파"],
            evidence: ["description"],
            timeRange: { startSec: 0, endSec: 30 },
          },
          {
            candidateId: "r2",
            title: "둘째 메뉴",
            ingredientNames: [],
            evidence: ["description"],
            timeRange: { startSec: 30, endSec: 60 },
          },
        ],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });
    const visualTargetLedger = buildVisualTargetLedger({
      sourcePacket: source,
      candidateLedger,
      gapLedger,
      maxTargetsPerCandidate: 1,
      maxTotalTargetsPerCase: 1,
    });
    const manifest = createAccessManifest({ projectRoot: workdir });

    const visualLedger = await collectVisualLedger({
      sourcePacket: source,
      candidateLedger,
      visualTargetLedger,
      projectRoot: workdir,
      cacheRoot: path.join(workdir, "cache", "frames"),
      manifest,
      model: "gpt-test",
      frameCount: 1,
      framesPerRange: 1,
      descriptionOnlySweepFrames: 1,
      maxFramesPerTarget: 1,
      secondsPerCandidate: 12,
      timeoutMs: 1000,
      executeCommandFn: async (command: string[]) => {
        const outputIndex = command.indexOf("-o");
        if (outputIndex >= 0) {
          const clipPath = command[outputIndex + 1].replace("%(ext)s", "mp4");
          mkdirSync(path.dirname(clipPath), { recursive: true });
          writeFileSync(clipPath, "clip", "utf8");
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        const outDirIndex = command.indexOf("--out-dir");
        if (outDirIndex >= 0) {
          const frameDir = command[outDirIndex + 1];
          const framePath = path.join(frameDir, "frame-0001.jpg");
          mkdirSync(frameDir, { recursive: true });
          writeFileSync(framePath, "frame", "utf8");
          writeJson(path.join(frameDir, "frames.json"), [{ path: framePath }]);
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        const outputPattern = command.at(-1) ?? "";
        if (outputPattern.includes("frame-%02d.jpg")) {
          const framePath = outputPattern.replace("%02d", "01");
          mkdirSync(path.dirname(framePath), { recursive: true });
          writeFileSync(framePath, "frame", "utf8");
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      executePiFn: async (command: string[]) => {
        const text = command.join(" ");
        if (text.includes("/r2/")) {
          return {
            observed: ["두부", "대파"],
            onscreenText: ["둘째 메뉴 주재료 두부, 대파"],
            quantityCues: [],
            confidence: 0.74,
          };
        }
        return {
          observed: ["양파"],
          onscreenText: ["양파볶음"],
          quantityCues: [],
          confidence: 0.8,
        };
      },
    });
    const packets = buildEvidencePackets({ sourcePacket: source, candidateLedger, visualLedger, sourceDraft, gapLedger });

    expect(visualTargetLedger.targets.map((target: { candidateId: string }) => target.candidateId)).toEqual(["r1"]);
    expect(visualLedger.candidates[1]).toMatchObject({
      candidateId: "r2",
      fallbackPolicy: "candidate-window-visual-context",
      observed: ["두부", "대파"],
      onscreenText: ["둘째 메뉴 주재료 두부, 대파"],
      targetCount: 0,
    });
    expect(packets.packets[1].visualEvidence[0]).toMatchObject({
      ref: "frame:r2:1",
      observed: ["두부", "대파"],
      onscreenText: ["둘째 메뉴 주재료 두부, 대파"],
    });
  });

  it("slices shared time ranges before candidate-window visual fallback", async () => {
    const { createAccessManifest } = await import(guardModuleUrl);
    const {
      buildCandidateLedger,
      buildGapLedger,
      buildSourceDraft,
      buildVisualTargetLedger,
    } = await import(artifactsModuleUrl);
    const { collectVisualLedger } = await import(visualModuleUrl);
    const source = makeSource("case-shared-range-visual-context");
    source.video.durationSeconds = 120;
    source.video.description = "00:00 양파볶음\n재료: 양파\n00:30 둘째 메뉴&셋째 메뉴";
    source.captions.segments = [];
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "양파볶음",
            ingredientNames: ["양파"],
            evidence: ["description"],
            timeRange: { startSec: 0, endSec: 30 },
          },
          {
            candidateId: "r2",
            title: "둘째 메뉴",
            ingredientNames: [],
            evidence: ["description"],
            timeRange: { startSec: 30, endSec: 90 },
          },
          {
            candidateId: "r3",
            title: "셋째 메뉴",
            ingredientNames: [],
            evidence: ["description"],
            timeRange: { startSec: 30, endSec: 90 },
          },
        ],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const gapLedger = buildGapLedger({ sourceDraft });
    const visualTargetLedger = buildVisualTargetLedger({
      sourcePacket: source,
      candidateLedger,
      gapLedger,
      maxTargetsPerCandidate: 1,
      maxTotalTargetsPerCase: 1,
    });
    const manifest = createAccessManifest({ projectRoot: workdir });
    const sections = new Map<string, string>();

    const visualLedger = await collectVisualLedger({
      sourcePacket: source,
      candidateLedger,
      visualTargetLedger,
      projectRoot: workdir,
      cacheRoot: path.join(workdir, "cache", "frames"),
      manifest,
      model: "gpt-test",
      frameCount: 1,
      framesPerRange: 1,
      descriptionOnlySweepFrames: 1,
      maxFramesPerTarget: 1,
      secondsPerCandidate: 12,
      timeoutMs: 1000,
      executeCommandFn: async (command: string[]) => {
        const outputIndex = command.indexOf("-o");
        if (outputIndex >= 0) {
          const clipPath = command[outputIndex + 1].replace("%(ext)s", "mp4");
          for (const candidateId of ["r2", "r3"]) {
            if (clipPath.includes(`/${candidateId}/clip.`)) sections.set(candidateId, command[command.indexOf("--download-sections") + 1]);
          }
          mkdirSync(path.dirname(clipPath), { recursive: true });
          writeFileSync(clipPath, "clip", "utf8");
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        const outDirIndex = command.indexOf("--out-dir");
        if (outDirIndex >= 0) {
          const frameDir = command[outDirIndex + 1];
          const framePath = path.join(frameDir, "frame-0001.jpg");
          mkdirSync(frameDir, { recursive: true });
          writeFileSync(framePath, "frame", "utf8");
          writeJson(path.join(frameDir, "frames.json"), [{ path: framePath }]);
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        const outputPattern = command.at(-1) ?? "";
        if (outputPattern.includes("frame-%02d.jpg")) {
          const framePath = outputPattern.replace("%02d", "01");
          mkdirSync(path.dirname(framePath), { recursive: true });
          writeFileSync(framePath, "frame", "utf8");
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      executePiFn: async (command: string[]) => ({
        observed: command.join(" ").includes("/r3/") ? ["셋째 재료"] : ["둘째 재료"],
        onscreenText: [],
        quantityCues: [],
        confidence: 0.7,
      }),
    });

    expect(sections.get("r2")).toBe("*00:00:36-00:00:48");
    expect(sections.get("r3")).toBe("*00:01:06-00:01:18");
    expect(visualLedger.candidates[1].fallbackTimeRange).toMatchObject({ basis: "shared-range-slice", sliceIndex: 0, sliceCount: 2 });
    expect(visualLedger.candidates[2].fallbackTimeRange).toMatchObject({ basis: "shared-range-slice", sliceIndex: 1, sliceCount: 2 });
  });

  it("scopes detail evidence packets when sibling candidates share one time range", async () => {
    const {
      buildCandidateLedger,
      buildEvidencePackets,
      buildSourceDraft,
    } = await import(artifactsModuleUrl);
    const source = makeSource("case-shared-range-detail-identity");
    source.video.durationSeconds = 120;
    source.video.description = "00:00 첫 번째 메뉴&두 번째 메뉴";
    source.captions.segments = [
      { startMs: 20000, endMs: 22000, text: "감자를 넣고 볶습니다." },
      { startMs: 80000, endMs: 82000, text: "두부를 넣고 끓입니다." },
    ];
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "첫 번째 메뉴",
            ingredientNames: ["감자"],
            sharedIngredientSeeds: ["두부"],
            evidence: ["description"],
            timeRange: { startSec: 0, endSec: 120 },
          },
          {
            candidateId: "r2",
            title: "두 번째 메뉴",
            ingredientNames: ["두부"],
            sharedIngredientSeeds: ["감자"],
            evidence: ["description"],
            timeRange: { startSec: 0, endSec: 120 },
          },
        ],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const visualLedger = {
      candidates: [{
        candidateId: "r2",
        frames: [
          {
            ref: "frame:r2:1",
            range: { startSec: 18, endSec: 22 },
            observed: ["감자"],
            onscreenText: ["감자를 넣고 볶습니다"],
            quantityCues: [],
          },
          {
            ref: "frame:r2:2",
            range: { startSec: 78, endSec: 82 },
            observed: ["두부"],
            onscreenText: ["두부를 넣고 끓입니다"],
            quantityCues: [],
          },
        ],
      }],
    };
    const packets = buildEvidencePackets({ sourcePacket: source, candidateLedger, visualLedger, sourceDraft });
    const secondPacket = packets.packets.find((packet: { candidateId: string }) => packet.candidateId === "r2");

    expect(sourceDraft.recipes[1].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["두부"]);
    expect(secondPacket?.stepEvidence.map((entry: { text: string }) => entry.text)).toEqual(["두부를 넣고 끓입니다."]);
    expect(secondPacket?.visualEvidence.map((frame: { ref: string }) => frame.ref)).toEqual(["frame:r2:2"]);
    expect(secondPacket?.visualStepEvidence.map((entry: { text: string }) => entry.text)).toEqual(["두부를 넣고 끓입니다"]);
  });

  it("reassigns shared-range visual frames by candidate identity instead of owner slice alone", async () => {
    const {
      buildCandidateLedger,
      buildEvidencePackets,
      buildSourceDraft,
    } = await import(artifactsModuleUrl);
    const source = makeSource("case-shared-range-visual-identity");
    source.video.durationSeconds = 120;
    source.video.description = "00:00 묵국&고기솥밥";
    source.captions.segments = [];
    const candidateLedger = buildCandidateLedger({
      sourcePacket: source,
      candidateOutput: {
        candidates: [
          {
            candidateId: "r1",
            title: "묵국",
            ingredientNames: ["도토리묵"],
            evidence: ["description"],
            timeRange: { startSec: 0, endSec: 120 },
          },
          {
            candidateId: "r2",
            title: "고기솥밥",
            ingredientNames: ["고기", "쌀"],
            evidence: ["description"],
            timeRange: { startSec: 0, endSec: 120 },
          },
        ],
      },
    });
    const sourceDraft = buildSourceDraft({ sourcePacket: source, candidateLedger });
    const visualLedger = {
      candidates: [
        {
          candidateId: "r1",
          frames: [],
        },
        {
          candidateId: "r2",
          frames: [
            {
              ref: "frame:r2:1",
              observed: ["그릇에 담긴 묵", "오이채", "김가루"],
              onscreenText: [],
              quantityCues: [],
            },
          ],
        },
      ],
    };

    const packets = buildEvidencePackets({ sourcePacket: source, candidateLedger, visualLedger, sourceDraft });
    const firstPacket = packets.packets.find((packet: { candidateId: string }) => packet.candidateId === "r1");
    const secondPacket = packets.packets.find((packet: { candidateId: string }) => packet.candidateId === "r2");

    expect(firstPacket?.visualEvidence.map((frame: { ref: string }) => frame.ref)).toEqual(["frame:r2:1"]);
    expect(secondPacket?.visualEvidence).toEqual([]);
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

  it("audits holistic drafts by keeping source-backed fields and downgrading unsupported amounts", async () => {
    const {
      auditHolisticDraft,
      buildFinalOutputFromHolisticAudit,
      buildHolisticSourcePacket,
      normalizeHolisticDraft,
    } = await import(holisticModuleUrl);
    const { sourceToPiPublicPacket } = await import(promptModuleUrl);
    const source = makeSource("case-holistic-audit");
    const sourcePacket = sourceToPiPublicPacket(source, {
      maxCaptionSegments: 20,
      maxDescriptionChars: 2000,
      maxAuthorComments: 2,
      compactSourcePacket: true,
    });
    const holisticSourcePacket = buildHolisticSourcePacket(sourcePacket);
    const draft = normalizeHolisticDraft({
      recipes: [{
        candidateId: "r1",
        title: "양파 간장 볶음",
        ingredients: [
          { name: "양파", amount: "1/2", unit: "개", amountBasis: "stated", evidence: ["description:2"] },
          { name: "간장", amount: "2", unit: "큰술", amountBasis: "stated", evidence: [] },
          { name: "버터", amount: "1", unit: "조각", amountBasis: "stated", evidence: [] },
        ],
        steps: [
          { text: "양파를 썬다.", evidence: ["transcript:1s"], confidence: 0.8 },
          { text: "버터를 녹인다.", evidence: [], confidence: 0.3 },
        ],
        uncertainties: [],
      }],
    });

    const audit = auditHolisticDraft({ draft, holisticSourcePacket });
    const output = buildFinalOutputFromHolisticAudit(audit);

    expect(audit.summary).toMatchObject({
      keptIngredients: 2,
      unsupportedIngredients: 1,
      downgradedAmounts: 1,
      keptSteps: 1,
      unsupportedSteps: 1,
    });
    expect(output.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual(["양파", "간장"]);
    expect(output.recipes[0].ingredients.find((ingredient: { name: string }) => ingredient.name === "간장")).toMatchObject({
      amount: null,
      unit: null,
      amountBasis: null,
    });
    expect(output.recipes[0].steps).toEqual(["양파를 썬다."]);
    expect(output.repairLog.map((entry: { reasonCode: string }) => entry.reasonCode)).toEqual(expect.arrayContaining([
      "holistic_unsupported_amount_null_fallback",
      "holistic_unsupported_ingredient_removed",
      "holistic_unsupported_step_removed",
    ]));
  });

  it("removes visual-only recipes instead of promoting them to final recipes", async () => {
    const {
      auditHolisticDraft,
      buildFinalOutputFromHolisticAudit,
      buildHolisticSourcePacket,
      normalizeHolisticDraft,
    } = await import(holisticModuleUrl);
    const { sourceToPiPublicPacket } = await import(promptModuleUrl);
    const source = makeSource("case-visual-only-recipe");
    const sourcePacket = sourceToPiPublicPacket(source, {
      maxCaptionSegments: 20,
      maxDescriptionChars: 2000,
      maxAuthorComments: 2,
      compactSourcePacket: true,
    });
    const holisticSourcePacket = buildHolisticSourcePacket(sourcePacket, {
      schemaVersion: 1,
      kind: "visual-ledger",
      videoId: "case-visual-only-recipe",
      collectionStatus: "completed",
      candidates: [{
        candidateId: "storyboard-1",
        frames: [{
          ref: "frame:storyboard-1:1",
          observed: ["미나리무침"],
          onscreenText: ["미나리무침 만들기"],
          quantityCues: [],
        }],
      }],
    });
    const draft = normalizeHolisticDraft({
      recipes: [{
        candidateId: "r1",
        title: "양파 간장 볶음",
        timeRange: { startSec: 0, endSec: 60, basis: "description-timeline" },
        ingredients: [{ name: "양파", amount: "1/2", unit: "개", amountBasis: "stated", evidence: ["description:2"] }],
        steps: [{ text: "양파를 썬다.", evidence: ["transcript:1s"], confidence: 0.8 }],
      }, {
        candidateId: "r2",
        title: "미나리무침",
        timeRange: { startSec: 0, endSec: 60, basis: "visual-storyboard" },
        ingredients: [{ name: "미나리", amount: null, unit: null, amountBasis: null, evidence: ["frame:storyboard-1:1"] }],
        steps: [{ text: "미나리를 무친다.", evidence: ["frame:storyboard-1:1"], confidence: 0.6 }],
      }],
    });

    const audit = auditHolisticDraft({ draft, holisticSourcePacket });
    const output = buildFinalOutputFromHolisticAudit(audit);

    expect(audit.summary).toMatchObject({ keptRecipes: 1, unsupportedRecipes: 1 });
    expect(output.recipes.map((recipe: { title: string }) => recipe.title)).toEqual(["양파 간장 볶음"]);
    expect(output.repairLog.map((entry: { reasonCode: string }) => entry.reasonCode)).toContain("holistic_visual_only_recipe_removed");
  });

  it("builds bounded coarse storyboard windows when holistic timeline understanding is enabled without description timeline", async () => {
    const {
      buildHolisticStoryboardCandidateLedger,
      recommendHolisticTimelineFrameBudget,
    } = await import(holisticModuleUrl);
    const sourcePacket = {
      video: {
        videoId: "case-no-timeline",
        title: "퇴근 후 냉장고 털이 레시피 모음",
        durationSeconds: 240,
        description: "[재료]\n양파\n간장\n파스타면",
      },
      captions: {
        segments: [
          { startMs: 5000, endMs: 6000, text: "양파를 썰어 주세요." },
          { startMs: 95000, endMs: 97000, text: "파스타면을 삶아 주세요." },
          { startMs: 185000, endMs: 187000, text: "소스를 넣어 주세요." },
        ],
      },
    };

    const frameBudget = recommendHolisticTimelineFrameBudget(sourcePacket, {
      enableTimelineUnderstanding: true,
    });
    const ledger = buildHolisticStoryboardCandidateLedger(sourcePacket, {
      maxCandidates: 4,
      enableTimelineUnderstanding: true,
      frameBudget,
    });

    expect(frameBudget).toBe(48);
    expect(ledger.summary).toMatchObject({
      timelineUnderstandingEnabled: true,
      timelineSource: "coarse-video-window",
      totalCandidates: 3,
      totalFrameBudget: 48,
    });
    expect(ledger.candidates.map((candidate: { candidateId: string }) => candidate.candidateId)).toEqual([
      "coarse-1",
      "coarse-2",
      "coarse-3",
    ]);
    expect(ledger.candidates.every((candidate: { timeRange: { basis: string }; storyboardFrameBudget: number }) => (
      candidate.timeRange.basis === "coarse-video-window" && candidate.storyboardFrameBudget === 16
    ))).toBe(true);
  });

  it("collapses coarse windows to one recipe candidate for timeline-ledger drafting", async () => {
    const {
      buildHolisticStoryboardCandidateLedger,
      recommendHolisticTimelineFrameBudget,
    } = await import(holisticModuleUrl);
    const sourcePacket = {
      video: {
        videoId: "case-no-timeline-ledger",
        title: "마들렌 이렇게만 하세요",
        durationSeconds: 480,
        description: "[재료]\n버터\n박력분",
      },
      captions: {
        segments: [
          { startMs: 1000, endMs: 2000, text: "마들렌을 만들어 볼게요." },
          { startMs: 220000, endMs: 222000, text: "반죽을 섞어 주세요." },
        ],
      },
    };

    const frameBudget = recommendHolisticTimelineFrameBudget(sourcePacket, {
      enableTimelineUnderstanding: true,
    });
    const ledger = buildHolisticStoryboardCandidateLedger(sourcePacket, {
      maxCandidates: 8,
      enableTimelineUnderstanding: true,
      frameBudget,
      coarseAsWholeRecipeCandidate: true,
    });

    expect(ledger.summary).toMatchObject({
      timelineSource: "coarse-video-window",
      coarseAsWholeRecipeCandidate: true,
      totalCandidates: 1,
    });
    expect(ledger.candidates).toHaveLength(1);
    expect(ledger.candidates[0]).toMatchObject({
      candidateId: "whole",
      title: "마들렌 이렇게만 하세요",
      timeRange: { startSec: 0, endSec: 480, basis: "coarse-video-window" },
      storyboardFrameBudget: 48,
    });
  });

  it("splits multi-recipe timeline rows into sibling storyboard probes", async () => {
    const {
      buildHolisticStoryboardCandidateLedger,
      recommendHolisticTimelineFrameBudget,
    } = await import(holisticModuleUrl);
    const sourcePacket = {
      video: {
        videoId: "case-timeline-siblings",
        title: "냉장고 털이 한 상",
        durationSeconds: 600,
        description: [
          "00:00 미리보기",
          "00:16 맥적&열무 들기름냉파스타",
          "07:40 등촌칼국수&소곱창구이",
        ].join("\n"),
      },
      captions: { segments: [] },
    };

    const frameBudget = recommendHolisticTimelineFrameBudget(sourcePacket, {
      enableTimelineUnderstanding: true,
    });
    const ledger = buildHolisticStoryboardCandidateLedger(sourcePacket, {
      maxCandidates: 8,
      enableTimelineUnderstanding: true,
      frameBudget,
    });

    expect(frameBudget).toBe(32);
    expect(ledger.summary).toMatchObject({
      timelineUnderstandingEnabled: true,
      timelineSource: "description-timeline",
      totalCandidates: 4,
      totalFrameBudget: 32,
    });
    expect(ledger.candidates.map((candidate: { title: string }) => candidate.title)).toEqual([
      "맥적",
      "열무 들기름냉파스타",
      "등촌칼국수",
      "소곱창구이",
    ]);
    expect(ledger.candidates[0]).toMatchObject({
      candidateId: "storyboard-1-1",
      siblingGroup: "storyboard-1",
      siblingIndex: 0,
      siblingCount: 2,
      storyboardFrameBudget: 8,
    });
    expect(ledger.candidates[0].timeRange).toMatchObject({
      startSec: 16,
      endSec: 238,
      basis: "timeline-sibling-slice",
      sliceIndex: 0,
      sliceCount: 2,
    });
    expect(ledger.candidates[1].timeRange).toMatchObject({
      startSec: 238,
      endSec: 460,
      basis: "timeline-sibling-slice",
      sliceIndex: 1,
      sliceCount: 2,
    });
    expect(ledger.candidates[1].timeRange.parentRange).toEqual(ledger.candidates[0].timeRange.parentRange);
  });

  it("keeps storyboard frames balanced across candidates in the holistic source packet", async () => {
    const { buildHolisticSourcePacket } = await import(holisticModuleUrl);
    const sourcePacket = {
      video: { videoId: "case-balanced-storyboard", title: "다중 레시피", description: "" },
      captions: { segments: [] },
    };
    const visualLedger = {
      schemaVersion: 1,
      kind: "visual-ledger",
      videoId: "case-balanced-storyboard",
      candidates: Array.from({ length: 5 }, (_, candidateIndex) => ({
        candidateId: `r${candidateIndex + 1}`,
        frames: Array.from({ length: 3 }, (_, frameIndex) => ({
          ref: `frame:r${candidateIndex + 1}:${frameIndex + 1}`,
          observed: [`후보 ${candidateIndex + 1} 프레임 ${frameIndex + 1}`],
          onscreenText: [],
          quantityCues: [],
        })),
      })),
    };

    const packet = buildHolisticSourcePacket(sourcePacket, visualLedger, { maxFrameEntries: 6 });

    expect(packet.storyboard.map((entry: { ref: string }) => entry.ref)).toEqual([
      "frame:r1:1",
      "frame:r2:1",
      "frame:r3:1",
      "frame:r4:1",
      "frame:r5:1",
      "frame:r1:2",
    ]);
  });

  it("builds bounded timeline frame plans and candidate windows", async () => {
    const {
      buildTimelineCandidateLedger,
      buildTimelineFramePlan,
      framesPerTimelineWindow,
    } = await import(timelineModuleUrl);
    const sourcePacket = {
      video: {
        videoId: "case-timeline-plan",
        title: "냉장고 털이 한 상",
        durationSeconds: 600,
        description: [
          "00:00 미리보기",
          "00:16 맥적&열무 들기름냉파스타",
          "07:40 등촌칼국수&소곱창구이",
        ].join("\n"),
      },
      captions: { segments: [] },
      authorComments: [],
    };

    const plan = buildTimelineFramePlan(sourcePacket, {
      maxSegments: 8,
      maxWindowsPerSegment: 3,
      maxTotalFrames: 32,
    });
    const candidateLedger = buildTimelineCandidateLedger(plan);

    expect(plan.summary).toMatchObject({
      timelineSource: "description-timeline",
      totalSegments: 2,
      totalWindows: 5,
      totalFrameBudget: 32,
    });
    expect(plan.segments[0]).toMatchObject({
      segmentId: "s1",
      sourceEvidence: ["description:2"],
      siblingHints: ["맥적", "열무 들기름냉파스타"],
      frameBudget: 16,
    });
    expect(plan.segments[0].windowPlan).toHaveLength(3);
    expect(candidateLedger.candidates.map((candidate: { candidateId: string }) => candidate.candidateId)).toEqual([
      "s1-w1",
      "s1-w2",
      "s1-w3",
      "s2-w1",
      "s2-w2",
    ]);
    expect(framesPerTimelineWindow(plan)).toBe(6);
  });

  it("keeps capped timeline segment ends bounded by the next original timeline cue", async () => {
    const { buildTimelineFramePlan } = await import(timelineModuleUrl);
    const sourcePacket = {
      video: {
        videoId: "case-capped-timeline",
        title: "많은 레시피",
        durationSeconds: 900,
        description: Array.from({ length: 9 }, (_, index) => {
          const second = index * 60;
          const minute = String(Math.floor(second / 60)).padStart(2, "0");
          return `${minute}:00 레시피 ${index + 1}`;
        }).join("\n"),
      },
      captions: { segments: [] },
      authorComments: [],
    };

    const plan = buildTimelineFramePlan(sourcePacket, {
      maxSegments: 8,
      maxWindowsPerSegment: 3,
      maxTotalFrames: 32,
    });

    expect(plan.segments).toHaveLength(8);
    expect(plan.segments[7]).toMatchObject({
      sourceLabel: "레시피 8",
      startSec: 420,
      endSec: 480,
    });
  });

  it("validates video timeline evidence and derives candidate event indexes", async () => {
    const {
      assertValidVideoTimeline,
      buildCandidateTimelineIndex,
      normalizeVideoTimeline,
    } = await import(timelineModuleUrl);
    const timeline = normalizeVideoTimeline({
      events: [{
        eventId: "e1",
        segmentId: "s1",
        timeRange: { startSec: 0, endSec: 12 },
        action: "양파를 썬다",
        candidateAssignments: [{ candidateId: "r1", status: "supporting", reason: "same dish" }],
        evidence: ["frame:s1-w1:1"],
        confidence: 0.7,
      }],
    }, { videoId: "case-timeline-validate" });

    expect(() => assertValidVideoTimeline(timeline, {
      allowedCandidateIds: ["r1"],
      allowedEvidenceRefs: ["frame:s1-w1:1"],
    })).not.toThrow();
    expect(() => assertValidVideoTimeline(timeline, {
      allowedCandidateIds: ["r2"],
      allowedEvidenceRefs: ["frame:s1-w1:1"],
    })).toThrow(/candidateId is unknown/u);

    const index = buildCandidateTimelineIndex({
      recipeCandidateLedger: {
        videoId: "case-timeline-validate",
        candidates: [{ candidateId: "r1", title: "양파 볶음", evidence: ["title"], timeRange: { startSec: 0, endSec: 30 } }],
      },
      videoTimeline: timeline,
    });

    expect(index.candidates[0]).toMatchObject({
      candidateId: "r1",
      supportingEvents: ["e1"],
      excludedEvents: [],
      unclearEvents: [],
    });
  });

  it("normalizes timeline transcript evidence to nearby caption refs", async () => {
    const {
      assertValidVideoTimeline,
      normalizeVideoTimeline,
      timelineAllowedEvidenceRefs,
    } = await import(timelineModuleUrl);
    const sourcePacket = {
      video: { videoId: "case-transcript-ref", title: "테스트", description: "" },
      captions: {
        segments: [
          { text: "양파를 썬다", startMs: 14320, durationMs: 2600 },
          { text: "팬에 넣는다", startMs: 30000, durationMs: 1800 },
        ],
      },
      authorComments: [],
    };
    const timeline = normalizeVideoTimeline({
      events: [{
        eventId: "e1",
        segmentId: "s1",
        timeRange: { startSec: 14, endSec: 16 },
        action: "양파를 썬다",
        candidateAssignments: [{ candidateId: "r1", status: "supporting", reason: "same dish" }],
        evidence: ["transcript:15s"],
        confidence: 0.7,
      }],
    }, { videoId: "case-transcript-ref", sourcePacket });

    expect(timeline.events[0].evidence).toEqual(["transcript:14s"]);
    expect(() => assertValidVideoTimeline(timeline, {
      allowedCandidateIds: ["r1"],
      allowedEvidenceRefs: timelineAllowedEvidenceRefs({ sourcePacket, timelineFrameLedger: { windows: [] } }),
    })).not.toThrow();
  });

  it("runs holistic timeline-ledger mode before drafting without exposing raw frame dumps", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const timelineResponsePath = path.join(workdir, "fixtures/video-timeline-response.json");
    const holisticResponsePath = path.join(workdir, "fixtures/holistic-timeline-draft.json");
    const source = makeSource("case-a");
    source.video.durationSeconds = 60;
    source.video.title = "테스트 영상";
    source.video.description = "[재료]\n양파 1/2개\n간장";
    writeJson(path.join(caseDir, "source.json"), source);
    writeJson(path.join(caseDir, "golden.json"), { shouldNotRead: true });
    writeJson(timelineResponsePath, {
      events: [{
        eventId: "e1",
        segmentId: "s1",
        timeRange: { startSec: 0, endSec: 12 },
        action: "양파를 썬다",
        visibleIngredients: ["양파"],
        candidateAssignments: [{ candidateId: "whole", status: "supporting", reason: "single coarse candidate" }],
        evidence: ["transcript:1s", "frame:s1-w1:1"],
        confidence: 0.8,
      }],
    });
    writeJson(holisticResponsePath, {
      recipes: [{
        candidateId: "whole",
        title: "테스트 영상",
        timeRange: { startSec: 0, endSec: 60, basis: "video-timeline" },
        ingredients: [
          { name: "양파", amount: "1/2", unit: "개", amountBasis: "stated", evidence: ["description:2"] },
        ],
        steps: [
          { text: "양파를 썬다.", evidence: ["event:e1"], confidence: 0.8 },
        ],
        visualNeeds: [{
          targetType: "ingredient_amount",
          ingredient: "오이/연어/부추",
          reason: "grouped target should not become candidate visual recall in timeline mode",
          candidateTimeRange: { startSec: 0, endSec: 20, basis: "video-timeline" },
          evidence: ["event:e1"],
        }],
        uncertainties: [],
      }],
      globalUncertainties: [],
    });

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-holistic-timeline-ledger-fixture",
      mode: "holistic-draft",
      "source-packet-only": true,
      "compact-source-packet": true,
      "visual-frames": true,
      "holistic-enable-video-timeline-ledger": true,
      "holistic-video-timeline-response-json": timelineResponsePath,
      "holistic-response-json": holisticResponsePath,
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
        note: "test timeline frame ledger",
        errors: [],
        candidates: candidateLedger.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          timeRange: candidate.timeRange,
          frames: [{
            ref: `frame:${candidate.candidateId}:1`,
            observed: ["raw-only-not-in-draft-prompt"],
            onscreenText: [],
            quantityCues: [],
            confidence: 0.8,
          }],
          observed: ["raw-only-not-in-draft-prompt"],
          onscreenText: [],
          quantityCues: [],
        })),
      }),
    });

    expect(result.failures).toBe(0);
    const outDir = path.join(caseDir, "runs/pi-holistic-timeline-ledger-fixture");
    const output = JSON.parse(readFileSync(path.join(outDir, "result.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(path.join(outDir, "file-access-manifest.json"), "utf8"));
    const sourcePacket = JSON.parse(readFileSync(path.join(outDir, "holistic-source-packet.json"), "utf8"));
    const draftPrompt = readFileSync(path.join(outDir, "holistic-draft-prompt.txt"), "utf8");
    const visualTargetLedger = JSON.parse(readFileSync(path.join(outDir, "visual-target-ledger.json"), "utf8"));

    expect(output.recipes[0].steps).toEqual(["양파를 썬다."]);
    expect(manifest).toMatchObject({
      holisticVideoTimelineLedgerEnabled: true,
      holisticVisualRepairEnabled: false,
    });
    expect(manifest.stages.map((stage: { name: string }) => stage.name)).toEqual([
      "video-timeline",
      "holistic-draft",
    ]);
    expect(sourcePacket.storyboard).toEqual([]);
    expect(sourcePacket.timelineEvents.map((entry: { ref: string }) => entry.ref)).toEqual(["event:e1"]);
    expect(sourcePacket.candidateSourcePackets[0]).toMatchObject({
      candidateId: "whole",
      supportingEvents: ["e1"],
    });
    expect(sourcePacket.candidateSourcePackets[0].sourceEntries.map((entry: { type: string }) => entry.type)).not.toContain("frame");
    expect(draftPrompt).toContain("[CANDIDATE_TIMELINE_INDEX]");
    expect(draftPrompt).toContain("[CANDIDATE_SOURCE_PACKETS]");
    expect(draftPrompt).toContain("event:e1");
    expect(draftPrompt).not.toContain("raw-only-not-in-draft-prompt");
    expect(visualTargetLedger.targets).toEqual([]);
    expect(visualTargetLedger.skippedTargets[0]).toMatchObject({
      reasonCode: "timeline_ledger_amount_only_grouped_target_skipped",
    });
    expect(manifest.readEvents.map((event: { path: string }) => path.basename(event.path))).toEqual([
      "source.json",
      "video-timeline-response.json",
      "holistic-timeline-draft.json",
    ]);
  });

  it("runs opt-in integrated video understanding before holistic drafting", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const timelineResponsePath = path.join(workdir, "fixtures/video-timeline-response.json");
    const understandingResponsePath = path.join(workdir, "fixtures/video-understanding-response.json");
    const holisticResponsePath = path.join(workdir, "fixtures/holistic-timeline-draft.json");
    const source = makeSource("case-a");
    source.video.durationSeconds = 60;
    source.video.title = "테스트 영상";
    source.video.description = "[재료]\n양파 1/2개\n간장 1큰술";
    writeJson(path.join(caseDir, "source.json"), source);
    writeJson(path.join(caseDir, "golden.json"), { shouldNotRead: true });
    writeJson(timelineResponsePath, {
      events: [{
        eventId: "e1",
        segmentId: "s1",
        timeRange: { startSec: 0, endSec: 12 },
        action: "양파를 썰고 간장으로 간한다",
        visibleIngredients: ["양파", "간장"],
        candidateAssignments: [{ candidateId: "whole", status: "supporting", reason: "single coarse candidate" }],
        evidence: ["transcript:1s", "frame:s1-w1:1"],
        confidence: 0.8,
      }],
    });
    writeJson(understandingResponsePath, {
      globalStory: "테스트 영상은 양파를 썰고 간장으로 간하는 단일 요리 흐름이다.",
      dishStories: [{
        candidateId: "whole",
        title: "테스트 영상",
        plainStory: "양파를 썰고 간장으로 간하는 흐름이다.",
        timeRange: { startSec: 0, endSec: 60, basis: "video-timeline" },
        mainIngredients: ["양파", "간장"],
        stepOutline: ["양파를 썬다", "간장으로 간한다"],
        sourceRefs: ["description:2", "description:3", "event:e1"],
        uncertainties: [],
        confidence: 0.8,
      }],
      crossDishNotes: [],
      uncertainties: [],
    });
    writeJson(holisticResponsePath, {
      recipes: [{
        candidateId: "whole",
        title: "테스트 영상",
        timeRange: { startSec: 0, endSec: 60, basis: "video-timeline" },
        ingredients: [
          { name: "양파", amount: "1/2", unit: "개", amountBasis: "stated", evidence: ["description:2"] },
          { name: "간장", amount: "1", unit: "큰술", amountBasis: "stated", evidence: ["description:3"] },
        ],
        steps: [
          { text: "양파를 썬다.", evidence: ["event:e1"], confidence: 0.8 },
          { text: "간장으로 간한다.", evidence: ["event:e1"], confidence: 0.8 },
        ],
        visualNeeds: [],
        uncertainties: [],
      }],
      globalUncertainties: [],
    });

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-holistic-integrated-understanding-fixture",
      mode: "holistic-draft",
      "source-packet-only": true,
      "compact-source-packet": true,
      "visual-frames": true,
      "holistic-enable-video-timeline-ledger": true,
      "holistic-enable-integrated-understanding": true,
      "holistic-video-timeline-response-json": timelineResponsePath,
      "holistic-understanding-response-json": understandingResponsePath,
      "holistic-response-json": holisticResponsePath,
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
        note: "test timeline frame ledger",
        errors: [],
        candidates: candidateLedger.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          timeRange: candidate.timeRange,
          frames: [{
            ref: `frame:${candidate.candidateId}:1`,
            observed: ["raw-only-not-in-draft-prompt"],
            onscreenText: [],
            quantityCues: [],
            confidence: 0.8,
          }],
          observed: ["raw-only-not-in-draft-prompt"],
          onscreenText: [],
          quantityCues: [],
        })),
      }),
    });

    expect(result.failures).toBe(0);
    const outDir = path.join(caseDir, "runs/pi-holistic-integrated-understanding-fixture");
    const manifest = JSON.parse(readFileSync(path.join(outDir, "file-access-manifest.json"), "utf8"));
    const understanding = JSON.parse(readFileSync(path.join(outDir, "video-understanding.json"), "utf8"));
    const understandingPrompt = readFileSync(path.join(outDir, "video-understanding-prompt.txt"), "utf8");
    const draftPrompt = readFileSync(path.join(outDir, "holistic-draft-prompt.txt"), "utf8");

    expect(understanding).toMatchObject({
      kind: "video-understanding",
      dishStories: [{ candidateId: "whole", plainStory: "양파를 썰고 간장으로 간하는 흐름이다." }],
    });
    expect(manifest.holisticIntegratedUnderstandingEnabled).toBe(true);
    expect(manifest.holistic.integratedUnderstandingEnabled).toBe(true);
    expect(manifest.stages.map((stage: { name: string }) => stage.name)).toEqual([
      "video-timeline",
      "video-understanding",
      "holistic-draft",
    ]);
    expect(understandingPrompt).toContain("[CANDIDATE_SOURCE_PACKETS]");
    expect(understandingPrompt).not.toContain("raw-only-not-in-draft-prompt");
    expect(draftPrompt).toContain("[VIDEO_UNDERSTANDING]");
    expect(draftPrompt).toContain("양파를 썰고 간장으로 간하는 흐름이다.");
    expect(draftPrompt).not.toContain("raw-only-not-in-draft-prompt");
    expect(manifest.readEvents.map((event: { path: string }) => path.basename(event.path))).toEqual([
      "source.json",
      "video-timeline-response.json",
      "video-understanding-response.json",
      "holistic-timeline-draft.json",
    ]);
  });

  it("does not open timeline-ledger amount targets from suggested frame refs without source evidence", async () => {
    const { normalizeHolisticDraft, buildHolisticVisualTargetLedger } = await import(holisticModuleUrl);
    const draft = normalizeHolisticDraft({
      recipes: [{
        candidateId: "storyboard-1",
        title: "테스트 레시피",
        timeRange: { startSec: 0, endSec: 60, basis: "test" },
        ingredients: [],
        steps: [{ text: "재료를 넣는다.", evidence: ["caption:1"] }],
        visualNeeds: [
          {
            ingredient: "붉은색 소스",
            reason: "스푼 계량 장면이 있으나 source에 정확한 양이 없음",
            evidence: [],
            suggestedFrameRefs: ["frame:s1-w2:3"],
            candidateTimeRange: { startSec: 10, endSec: 20, basis: "draft" },
          },
          {
            ingredient: "양파",
            reason: "자막 근거는 있으나 양이 부족함",
            evidence: ["caption:1"],
            suggestedFrameRefs: ["frame:s1-w2:1"],
            candidateTimeRange: { startSec: 20, endSec: 30, basis: "draft" },
          },
        ],
      }],
    });

    const ledger = buildHolisticVisualTargetLedger({
      draft,
      amountTargetsOnly: true,
      includeSparseRecallTargets: false,
      maxTotalTargets: 4,
    });

    expect(ledger.targets.map((target: { ingredient: string }) => target.ingredient)).toEqual(["양파"]);
    expect(ledger.targets[0].sourceEvidence).toEqual(["caption:1"]);
    expect(ledger.targets[0].textCues.join(" ")).not.toContain("frame:");
    expect(ledger.skippedTargets).toContainEqual(expect.objectContaining({
      ingredient: "붉은색 소스",
      reasonCode: "timeline_ledger_missing_visual_evidence_skipped",
    }));
  });

  it("sanitizes Pi raw trace prompt echoes while keeping final assistant JSON parseable", async () => {
    const { sanitizePiRawPayloadForDisk } = await import(runnerModuleUrl);
    const { parsePiRawOutput } = await import(schemaModuleUrl);
    const hugePrompt = "프롬프트".repeat(1000);
    const hugeUpdate = "중간응답".repeat(1000);
    const finalJson = JSON.stringify({
      recipes: [{
        title: "테스트",
        ingredients: [{ name: "양파", amount: "1/2", unit: "개", amountBasis: "stated" }],
        steps: ["양파를 썬다."],
      }],
    });
    const stdout = [
      JSON.stringify({ type: "message_start", message: { role: "user", content: [{ type: "text", text: hugePrompt }] } }),
      JSON.stringify({ type: "message_update", message: { role: "assistant", content: [{ type: "text", text: hugeUpdate }] } }),
      JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: finalJson }] } }),
    ].join("\n");
    const rawPayload = JSON.stringify({ stdout, stderr: "", exitCode: 0 }, null, 2);

    const sanitized = sanitizePiRawPayloadForDisk(rawPayload);

    expect(sanitized.length).toBeLessThan(rawPayload.length / 2);
    expect(sanitized).toContain("stdoutSanitizedForDisk");
    expect(sanitized).toContain("[omitted ");
    expect(parsePiRawOutput(sanitized)).toMatchObject({ recipes: [{ title: "테스트" }] });
  });

  it("can run holistic fixture extraction and consume frame-backed visual estimates only after audit", async () => {
    const { runPiExtraction } = await import(runnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const responsePath = path.join(workdir, "fixtures/pi-holistic-response.json");
    const source = makeSource("case-a");
    source.video.durationSeconds = 80;
    source.video.description = "[재료]\n양파 1/2개\n간장";
    writeJson(path.join(caseDir, "source.json"), source);
    writeJson(path.join(caseDir, "golden.json"), { shouldNotRead: true });
    writeJson(responsePath, {
      recipes: [{
        candidateId: "r1",
        title: "양파 간장 볶음",
        timeRange: { startSec: 0, endSec: 60, basis: "description-timeline" },
        ingredients: [
          { name: "양파", amount: "1/2", unit: "개", amountBasis: "stated", evidence: ["description:2"] },
          { name: "간장", amount: null, unit: null, amountBasis: null, evidence: ["description:3"], needsVisualEstimate: true },
        ],
        steps: [
          { text: "양파를 썬다.", evidence: ["transcript:1s"], confidence: 0.8 },
          { text: "간장을 넣는다.", evidence: ["transcript:3s"], confidence: 0.8 },
          { text: "양파와 간장을 볶는다.", evidence: ["transcript:3s"], confidence: 0.8 },
        ],
        visualNeeds: [{
          targetType: "ingredient_amount",
          ingredient: "간장",
          reason: "description has ingredient identity but no amount",
          candidateTimeRange: { startSec: 0, endSec: 60, basis: "draft" },
          evidence: ["description:3"],
        }],
        uncertainties: [],
      }],
      globalUncertainties: [],
    });

    const result = await runPiExtraction({
      split: "train",
      ids: "case-a",
      "out-tag": "pi-holistic-fixture",
      mode: "holistic-draft",
      "source-packet-only": true,
      "compact-source-packet": true,
      "visual-frames": true,
      "holistic-response-json": responsePath,
      "holistic-repair-response-json": responsePath,
    }, {
      projectRoot: workdir,
      collectVisualLedger: async ({ sourcePacket, candidateLedger, visualTargetLedger }: {
        sourcePacket: { video: { videoId: string } };
        candidateLedger: { candidates: Array<{ candidateId: string; timeRange: unknown }> };
        visualTargetLedger?: { targets: Array<{ targetId: string; candidateId: string; ingredient: string }> };
      }) => {
        if (!visualTargetLedger?.targets?.length) {
          return {
            schemaVersion: 1,
            kind: "visual-ledger",
            videoId: sourcePacket.video.videoId,
            collectionStatus: "completed",
            note: "test holistic storyboard",
            errors: [],
            candidates: candidateLedger.candidates.map((candidate) => ({
              candidateId: candidate.candidateId,
              timeRange: candidate.timeRange,
              frames: [{
                ref: `frame:${candidate.candidateId}:1`,
                observed: ["양파와 간장을 볶는 팬"],
                onscreenText: [],
                quantityCues: [],
                confidence: 0.7,
              }],
              observed: ["양파와 간장을 볶는 팬"],
              onscreenText: [],
              quantityCues: [],
            })),
          };
        }
        return {
          schemaVersion: 1,
          kind: "visual-ledger",
          videoId: sourcePacket.video.videoId,
          collectionStatus: "completed",
          note: "test holistic target frames",
          errors: [],
          targets: visualTargetLedger.targets.map((target) => ({
            targetId: target.targetId,
            candidateId: target.candidateId,
            ingredient: target.ingredient,
            ranges: [{ startSec: 0, endSec: 6, basis: "draft" }],
            frames: [{
              ref: `frame:${target.candidateId}:${target.ingredient}:1`,
              targetId: target.targetId,
              candidateId: target.candidateId,
              ingredient: target.ingredient,
              path: "frame-soy-sauce.jpg",
            }],
          })),
          candidates: visualTargetLedger.targets.map((target) => ({
            candidateId: target.candidateId,
            timeRange: { startSec: 0, endSec: 60, basis: "draft" },
            frames: [{
              ref: `frame:${target.candidateId}:${target.ingredient}:1`,
              targetId: target.targetId,
              candidateId: target.candidateId,
              ingredient: target.ingredient,
              observed: ["계량스푼에 담긴 간장"],
              onscreenText: [],
              quantityCues: ["간장 1큰술"],
              confidence: 0.8,
            }],
            observed: ["계량스푼에 담긴 간장"],
            onscreenText: [],
            quantityCues: ["간장 1큰술"],
          })),
        };
      },
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
          targetVisible: true,
          referenceObjectVisible: true,
          countEvidence: null,
          amount: "1",
          unit: "큰술",
          amountBasis: "visual-estimate",
          confidence: 0.55,
          evidence: [`frame:${target.candidateId}:${target.ingredient}:1`],
          reason: "계량스푼 기준으로 보이는 간장 양",
          uncertainties: [],
        })),
        uncertainties: [],
        errors: [],
      }),
    });

    expect(result.failures).toBe(0);
    const outDir = path.join(caseDir, "runs/pi-holistic-fixture");
    const output = JSON.parse(readFileSync(path.join(outDir, "result.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(path.join(outDir, "file-access-manifest.json"), "utf8"));
    const audit = JSON.parse(readFileSync(path.join(outDir, "holistic-evidence-audit.json"), "utf8"));
    const visualTargetLedger = JSON.parse(readFileSync(path.join(outDir, "visual-target-ledger.json"), "utf8"));

    expect(output.recipes[0].ingredients.find((ingredient: { name: string }) => ingredient.name === "간장")).toMatchObject({
      amount: "1",
      unit: "큰술",
      amountBasis: "visual-estimate",
    });
    expect(output.repairLog.map((entry: { reasonCode: string }) => entry.reasonCode)).toContain("visual_estimate_from_reference_object");
    expect(output.repairLog.map((entry: { reasonCode: string }) => entry.reasonCode)).not.toContain("visual_evidence_contract_fallback");
    const soySauceTarget = visualTargetLedger.targets.find((target: { ingredient: string }) => target.ingredient === "간장");
    expect(soySauceTarget).toBeTruthy();
    expect(
      soySauceTarget.preferredTimeRanges[0].endSec - soySauceTarget.preferredTimeRanges[0].startSec,
    ).toBeLessThanOrEqual(16);
    expect(audit.summary.keptIngredients).toBe(2);
    expect(manifest.mode).toBe("holistic-draft");
    expect(manifest.holisticVisualTargetCount).toBeGreaterThanOrEqual(1);
    expect(manifest.holisticVisualRepairEnabled).toBe(true);
    expect(manifest.forbiddenReadEvents).toEqual([]);
    expect(manifest.readEvents.map((event: { path: string }) => path.basename(event.path))).toEqual([
      "source.json",
      "pi-holistic-response.json",
      "pi-holistic-response.json",
    ]);
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
    expect(detailPrompt).toContain("sourceDraft");
    expect(detailPrompt).toContain("candidate.ingredientNames와 sourceDraft.ingredients는 시작점일 뿐이다");
    expect(detailPrompt).toContain("sharedIngredientSeeds는 묶음 후보에서 온 미배정 재료 seed다");
    expect(detailPrompt).toContain("양파 반개");
    expect(freeze.completedCount).toBe(1);
  });

  it("lets holistic train wrapper use adaptive storyboard frame budget when timeline understanding is enabled", async () => {
    const { runPiTrainExtraction } = await import(trainRunnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const source = makeSource("case-a");
    source.video.durationSeconds = 240;
    source.video.description = "[재료]\n양파\n간장\n파스타면";
    writeJson(path.join(caseDir, "source.json"), source);

    const result = await runPiTrainExtraction({
      ids: "case-a",
      "out-tag": "pi-train-holistic-timeline-dry-run",
      mode: "holistic-draft",
      "dry-run": true,
      "holistic-enable-timeline-understanding": true,
      "holistic-storyboard-max-candidates": "4",
    }, { projectRoot: workdir });

    expect(result.failures).toBe(0);
    const manifest = JSON.parse(readFileSync(
      path.join(caseDir, "runs/pi-train-holistic-timeline-dry-run/file-access-manifest.json"),
      "utf8",
    ));
    expect(manifest).toMatchObject({
      mode: "holistic-draft",
      holisticTimelineUnderstandingEnabled: true,
      holisticStoryboardFrameBudget: 48,
      holisticStoryboardCandidateCount: 3,
      holisticStoryboardFramesPerCandidate: 16,
    });
    expect(manifest.holistic.storyboardFrameCount).toBe(8);
    expect(manifest.holistic.timelineFrameBudget).toBeNull();
  });

  it("uses tighter holistic visual target caps in train wrapper timeline-ledger mode", async () => {
    const { runPiTrainExtraction } = await import(trainRunnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const source = makeSource("case-a");
    source.video.durationSeconds = 240;
    source.video.description = [
      "00:00 첫 번째 요리",
      "02:00 두 번째 요리",
    ].join("\n");
    writeJson(path.join(caseDir, "source.json"), source);

    const result = await runPiTrainExtraction({
      ids: "case-a",
      "out-tag": "pi-train-holistic-timeline-ledger-cap-dry-run",
      mode: "holistic-draft",
      "dry-run": true,
      "holistic-enable-timeline-understanding": true,
      "holistic-enable-video-timeline-ledger": true,
      "holistic-storyboard-max-candidates": "4",
    }, { projectRoot: workdir });

    expect(result.failures).toBe(0);
    const manifest = JSON.parse(readFileSync(
      path.join(caseDir, "runs/pi-train-holistic-timeline-ledger-cap-dry-run/file-access-manifest.json"),
      "utf8",
    ));
    expect(manifest.holistic).toMatchObject({
      videoTimelineLedgerEnabled: true,
      maxTargetsPerRecipe: 2,
      maxTotalTargets: 4,
    });
  });

  it("keeps late multi-recipe caption cues in compact train extraction", async () => {
    const { runPiTrainExtraction } = await import(trainRunnerModuleUrl);
    const caseDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a");
    const candidateResponsePath = path.join(workdir, "fixtures/pi-candidates.json");
    const detailResponsePath = path.join(workdir, "fixtures/pi-detail.json");
    const source = makeSource("case-a");
    source.video.durationSeconds = 420;
    source.video.description = [
      "00:00 첫 번째 요리",
      "03:30 늦게 나오는 요리",
    ].join("\n");
    source.captions.segments = Array.from({ length: 160 }, (_, index) => ({
      startMs: index * 2000,
      endMs: (index * 2000) + 1500,
      text: index === 145
        ? "늦게 나오는 요리에 양념을 넣고 끓입니다."
        : `일반 자막 ${index}`,
    }));
    writeJson(path.join(caseDir, "source.json"), source);
    writeJson(candidateResponsePath, {
      candidates: [{ candidateId: "r1", title: "늦게 나오는 요리", ingredientNames: ["양념"], evidence: ["description"] }],
    });
    writeJson(detailResponsePath, {
      recipe: {
        title: "늦게 나오는 요리",
        candidateId: "r1",
        ingredients: [{ name: "양념", amount: null, unit: null, amountBasis: null }],
        steps: ["양념을 넣고 끓인다."],
      },
      repairLog: [],
    });

    const result = await runPiTrainExtraction({
      ids: "case-a",
      "out-tag": "pi-train-late-caption-default",
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
          frames: [],
          observed: [],
          onscreenText: [],
          quantityCues: [],
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
    const sourcePacket = JSON.parse(readFileSync(
      path.join(caseDir, "runs/pi-train-late-caption-default/source-packet.json"),
      "utf8",
    ));
    expect(sourcePacket.captions.segments.map((segment: { text: string }) => segment.text)).toContain(
      "늦게 나오는 요리에 양념을 넣고 끓입니다.",
    );
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
