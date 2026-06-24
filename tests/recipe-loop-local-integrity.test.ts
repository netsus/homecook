import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const gradeExtractionScript = path.join(repoRoot, "scripts/recipe-loop/grade-extraction.mjs");
const gradeSemanticScript = path.join(repoRoot, "scripts/recipe-loop/grade-semantic.mjs");
const gradingModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/recipe-loop/lib/grading.mjs")).href;
const semanticFeedbackModuleUrl = pathToFileURL(
  path.join(repoRoot, "scripts/recipe-loop/lib/semantic-feedback-aggregator.mjs"),
).href;
const recipeExtractionModuleUrl = pathToFileURL(
  path.join(repoRoot, "lib/server/recipe-extraction-lab/extract.mjs"),
).href;
const recipePromptModuleUrl = pathToFileURL(
  path.join(repoRoot, "lib/server/recipe-extraction-lab/prompt.mjs"),
).href;
const loopScript = path.join(repoRoot, "scripts/recipe-loop/loop.py");
const validationCanaryVideoId = "YZ8KSZboJeM";
const validationCanaryId = "canary_validation_YZ8KSZboJeM_01";
const validationCanaryName = "락토핏 골드";

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function splitCase(root: string, id: string) {
  return path.join(root, "notebooks/recipe_loop_data/validation", id);
}

function splitCaseFor(root: string, split: string, id: string) {
  return path.join(root, "notebooks/recipe_loop_data", split, id);
}

function codexCalibration(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    calibratedAt: "2026-06-14",
    policy: "Codex-only semantic judge calibration for local integrity tests.",
    judgeProvider: "codex",
    judgeModel: "gpt-5.4",
    judgeEffort: "high",
    judgeSchemaVersion: 1,
    judgePromptVersion: "semantic-judge-v3-anchored",
    scorePolicy: "bottomK-mean",
    k: 2,
    sampleN: 3,
    thresholds: { bottomKMeanScore: 3, averageScore: 3 },
    borderline: {
      enabled: false,
      finalScorePolicy: "median_of_N",
    },
    alignmentStats: {
      sampleCount: 6,
      meanAbsoluteDelta: 0.25,
      maxMeanAbsoluteDelta: 1,
      directionDisagreementCount: 0,
      maxDirectionDisagreementCount: 1,
    },
    samples: Array.from({ length: 6 }, (_, index) => ({
      id: `sample-${index + 1}`,
      judgeCaseScore: index % 2 === 0 ? 3 : 4,
      verdict: "aligned",
    })),
    ...overrides,
  };
}

function approvedGolden(reviewStatus = "approved") {
  return {
    schemaVersion: 1,
    videoId: "case-a",
    reviewStatus,
    recipes: [
      {
        title: "테스트 레시피",
        ingredients: [{ name: "양파", amount: "1", unit: "개" }],
        steps: [{ order: 1, instruction: "양파를 볶는다" }],
      },
    ],
  };
}

function matchingResult() {
  return {
    recipes: [
      {
        title: "테스트 레시피",
        ingredients: [{ name: "양파", amount: "1", unit: "개" }],
        steps: ["양파를 볶는다"],
      },
    ],
  };
}

function approvedCanaryGolden() {
  return {
    schemaVersion: 1,
    videoId: validationCanaryVideoId,
    reviewStatus: "approved",
    recipes: [
      {
        title: "진한 초코 마들렌",
        ingredients: [
          { name: "박력분", amount: "90", unit: "g" },
          {
            name: validationCanaryName,
            nameAliases: ["락토핏골드", "락토핏 골드 유산균"],
            amount: "10",
            unit: "g",
            amountBasis: "leak-canary",
            isLeakCanary: true,
            canaryId: validationCanaryId,
          },
        ],
        steps: [{ order: 1, instruction: "가루를 섞고 굽는다" }],
      },
    ],
  };
}

function canaryMatchingResult(includeCanary = false) {
  return {
    recipes: [
      {
        title: "진한 초코 마들렌",
        ingredients: [
          { name: "박력분", amount: "90", unit: "g" },
          ...(includeCanary ? [{ name: "락토핏골드", amount: "10", unit: "g" }] : []),
        ],
        steps: ["가루를 섞고 굽는다"],
      },
    ],
    __semanticJudge: {
      cases: [
        {
          title: "진한 초코 마들렌",
          ingredient_score: 5,
          step_score: 5,
          reason: "fixture pass",
        },
      ],
    },
  };
}

function runLoopPython(snippet: string) {
  const bootstrap = `
import importlib.util
import json
import sys
spec = importlib.util.spec_from_file_location("recipe_loop", ${JSON.stringify(loopScript)})
loop = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = loop
spec.loader.exec_module(loop)
${snippet}
`;
  return spawnSync("python3", ["-c", bootstrap], { cwd: repoRoot, encoding: "utf8" });
}

describe("recipe-loop local integrity gates", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(path.join(tmpdir(), "recipe-loop-integrity-"));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("splits supported Korean 와/과 combined recipe titles without over-splitting single dishes", async () => {
    const { extractRecipeFromSources } = await import(recipeExtractionModuleUrl);
    const splitLlm = {
      generate: async () => ({
        cached: false,
        model: "fixture",
        json: {
          recipes: [
            {
              title: "묵참김밥과 오뎅볶이",
              ingredients: [
                { name: "김밥김", amount: "2", unit: "장", amountBasis: "stated" },
                { name: "묵은지", amount: "1", unit: "줌", amountBasis: "stated" },
                { name: "참치", amount: "1", unit: "캔", amountBasis: "stated" },
                { name: "어묵", amount: "2", unit: "장", amountBasis: "stated" },
                { name: "떡", amount: "1", unit: "줌", amountBasis: "stated" },
                { name: "고추장", amount: "1", unit: "큰술", amountBasis: "stated" },
              ],
              steps: [
                "김밥김에 묵은지와 참치를 올려 묵참김밥을 만다.",
                "어묵과 떡, 고추장을 볶아 오뎅볶이를 만든다.",
              ],
            },
          ],
        },
      }),
    };

    const splitResult = await extractRecipeFromSources(
      {
        video: {
          videoId: "natural-split",
          title: "묵참김밥과 오뎅볶이",
          description: "00:00 묵참김밥\n01:00 오뎅볶이",
        },
        transcript: null,
        authorComments: [],
        youtubeUrl: null,
      },
      { llm: splitLlm, useVisual: false },
    );

    expect(splitResult.recipes.map((recipe: { title: string }) => recipe.title)).toEqual(["묵참김밥", "오뎅볶이"]);
    expect(splitResult.meta.splitCombinedRecipeGroups).toBe(1);
    expect(splitResult.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual([
      "김밥김",
      "묵은지",
      "참치",
    ]);
    expect(splitResult.recipes[1].ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual([
      "어묵",
      "떡",
      "고추장",
    ]);

    const singleDishLlm = {
      generate: async () => ({
        cached: false,
        model: "fixture",
        json: {
          recipes: [
            {
              title: "두부와 김치 볶음",
              ingredients: [
                { name: "두부", amount: "1", unit: "모", amountBasis: "stated" },
                { name: "김치", amount: "1", unit: "줌", amountBasis: "stated" },
                { name: "들기름", amount: "1", unit: "큰술", amountBasis: "stated" },
              ],
              steps: ["두부와 김치를 팬에 넣고 들기름에 볶는다."],
            },
          ],
        },
      }),
    };

    const singleDishResult = await extractRecipeFromSources(
      {
        video: { videoId: "single-dish", title: "두부와 김치 볶음", description: "" },
        transcript: null,
        authorComments: [],
        youtubeUrl: null,
      },
      { llm: singleDishLlm, useVisual: false },
    );

    expect(singleDishResult.recipes.map((recipe: { title: string }) => recipe.title)).toEqual(["두부와 김치 볶음"]);
    expect(singleDishResult.meta.splitCombinedRecipeGroups).toBe(0);
  });

  it("does not hydrate cooking ingredient amounts from promotional event quantities", async () => {
    const { extractRecipeFromSources } = await import(recipeExtractionModuleUrl);
    const llm = {
      generate: async () => ({
        cached: false,
        model: "fixture",
        json: {
          recipes: [
            {
              title: "열무 들기름 냉파스타",
              ingredients: [
                { name: "카펠리니면", amount: "1", unit: "인분", amountBasis: "spoken" },
                { name: "열무김치", amount: null, unit: null, amountBasis: null },
                { name: "들기름", amount: "1", unit: "큰술", amountBasis: "spoken" },
              ],
              steps: [
                "카펠리니면을 삶아 찬물에 헹군다.",
                "카펠리니면에 들기름을 넣어 버무리고 열무김치를 한 줌 올린다.",
              ],
            },
          ],
        },
      }),
    };

    const result = await extractRecipeFromSources(
      {
        video: {
          videoId: "event-quantity",
          title: "열무 들기름 냉파스타",
          description: [
            "[EVENT] 댓글 참여자 총 5명 랜덤 추첨",
            "이벤트 선물 : 그리닷 국내산 열무김치 2kg",
            "00:10 열무 들기름 냉파스타",
          ].join("\n"),
        },
        transcript: null,
        authorComments: [],
        youtubeUrl: null,
      },
      { llm, useVisual: false },
    );

    const kimchi = result.recipes[0].ingredients.find((ingredient: { name: string }) => ingredient.name === "열무김치");
    expect(kimchi).toMatchObject({ amount: null, unit: null });
    expect(result.meta.sourceAmountHydrations).toBe(0);
  });

  it("merges small derivative seasoning variants back into the base recipe", async () => {
    const { extractRecipeFromSources } = await import(recipeExtractionModuleUrl);
    const llm = {
      generate: async () => ({
        cached: false,
        model: "fixture",
        json: {
          recipes: [
            {
              title: "돼지고기 김치찌개",
              ingredients: [
                { name: "돼지고기", amount: "150", unit: "g", amountBasis: "spoken" },
                { name: "김치", amount: "1/4", unit: "포기", amountBasis: "spoken" },
              ],
              steps: [
                "냄비에 돼지고기와 김치를 넣고 끓인다.",
                "돼지고기 김치찌개에 대파를 넣고 한소끔 더 끓인다.",
              ],
            },
            {
              title: "된장 돼지고기 김치찌개",
              ingredients: [
                { name: "돼지고기 김치찌개", amount: "1", unit: "냄비", amountBasis: "visual-estimate" },
                { name: "된장", amount: "1/2", unit: "큰술", amountBasis: "spoken" },
              ],
              steps: ["완성된 돼지고기 김치찌개에 된장을 넣고 잘 풀어 끓인다."],
            },
          ],
        },
      }),
    };

    const result = await extractRecipeFromSources(
      {
        video: { videoId: "derivative-kimchi-stew", title: "돼지고기 김치찌개", description: "" },
        transcript: null,
        authorComments: [],
        youtubeUrl: null,
      },
      { llm, useVisual: false },
    );

    expect(result.recipes.map((recipe: { title: string }) => recipe.title)).toEqual(["돼지고기 김치찌개"]);
    expect(result.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).toContain("된장");
    expect(result.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name)).not.toContain(
      "돼지고기 김치찌개",
    );
    expect(result.recipes[0].steps).toContain("완성된 돼지고기 김치찌개에 된장을 넣고 잘 풀어 끓인다.");
    expect(result.meta.mergedDerivativeRecipeCount).toBe(1);
  });

  it("recovers source-mentioned soup seasoning adjusters before final grading", async () => {
    const { extractRecipeFromSources } = await import(recipeExtractionModuleUrl);
    const llm = {
      generate: async () => ({
        cached: false,
        model: "fixture",
        json: {
          recipes: [
            {
              title: "돼지고기 김치찌개",
              ingredients: [
                { name: "돼지고기", amount: "1", unit: "덩이", amountBasis: "visual-estimate" },
                { name: "쌀뜨물", amount: "3", unit: "컵", amountBasis: "visual-estimate" },
                { name: "김치", amount: "1", unit: "포기", amountBasis: "visual-estimate" },
                { name: "다진 마늘", amount: "1", unit: "큰술", amountBasis: "visual-estimate" },
                { name: "대파", amount: "1", unit: "대", amountBasis: "visual-estimate" },
                { name: "국간장", amount: "1", unit: "큰술", amountBasis: "visual-estimate" },
                { name: "새우젓", amount: "1", unit: "큰술", amountBasis: "visual-estimate" },
                { name: "된장", amount: "1/2", unit: "큰술", amountBasis: "stated" },
              ],
              steps: [
                "냄비에 돼지고기와 쌀뜨물을 넣고 끓인다.",
                "김치와 다진 마늘을 넣고 끓인다.",
                "대파를 썰어 냄비에 넣는다.",
                "국간장으로 향을 내고 새우젓으로 간을 맞춘다.",
                "된장을 넣어 국물 맛을 묵직하게 만든다.",
              ],
            },
          ],
        },
      }),
    };

    const result = await extractRecipeFromSources(
      {
        video: {
          videoId: "source-stew-adjusters",
          title: "돼지고기 김치찌개",
          description: "",
        },
        transcript: {
          language: "ko",
          segments: [
            { text: "김치와 돼지고기는 3대 1 정도로 준비합니다." },
            { text: "김치찌개는 국간장 다음에 설탕을 조금 넣고 양파를 넣어 단맛을 맞춥니다." },
            { text: "모자란 간은 소금이나 새우젓으로 맞추면 됩니다." },
            { text: "된장은 정석이 아니고 취향에 맞는 응용입니다." },
            { text: "호주는 마지막에 넣습니다." },
          ],
        },
        authorComments: [],
        youtubeUrl: null,
      },
      { llm, useVisual: false },
    );

    const names = result.recipes[0].ingredients.map((ingredient: { name: string }) => ingredient.name);
    expect(names).toEqual(expect.arrayContaining(["설탕", "양파", "소금", "후추"]));
    expect(names).not.toContain("된장");
    expect(result.recipes[0].ingredients.find((ingredient: { name: string }) => ingredient.name === "돼지고기")).toMatchObject({
      amount: "150",
      unit: "g",
    });
    expect(result.recipes[0].ingredients.find((ingredient: { name: string }) => ingredient.name === "김치")).toMatchObject({
      amount: "1/4",
      unit: "포기",
    });
    expect(result.recipes[0].ingredients.find((ingredient: { name: string }) => ingredient.name === "대파")).toMatchObject({
      amount: "1/2",
      unit: "대",
    });
    expect(result.recipes[0].steps).toEqual(
      expect.arrayContaining([
        "김치와 돼지고기를 3대 1 비율로 준비한다.",
        "설탕과 양파를 넣어 단맛을 맞춘다.",
        "모자란 간은 소금이나 새우젓, 김치 국물로 맞춘다.",
        "마지막에 후추를 넣고 한소끔 더 끓인다.",
      ]),
    );
    expect(result.recipes[0].steps.some((step: string) => step.includes("된장"))).toBe(false);
    expect(result.meta.sourceMentionedStewSeasoningRecoveries).toBe(5);
  });

  it("recovers low-tail visual amounts without keeping unsupported sauce variants", async () => {
    const { extractRecipeFromSources } = await import(recipeExtractionModuleUrl);
    const llm = {
      generate: async () => ({
        cached: false,
        model: "fixture",
        json: {
          recipes: [
            {
              title: "노오븐 라따뚜이",
              ingredients: [
                { name: "토마토소스", amount: "360", unit: "ml", amountBasis: "stated" },
                { name: "토마토", amount: "360", unit: "ml", amountBasis: "stated" },
                { name: "가지", amount: "1", unit: "개", amountBasis: "visual-estimate" },
                { name: "애호박", amount: "1", unit: "개", amountBasis: "visual-estimate" },
                { name: "파마산 치즈", amount: null, unit: null, amountBasis: null },
                { name: "소금", amount: null, unit: null, amountBasis: null },
                { name: "후추", amount: null, unit: null, amountBasis: null },
                { name: "식용유", amount: null, unit: null, amountBasis: null },
              ],
              steps: [
                "채소를 얇게 썬다.",
                "식용유를 두르고 소금과 후추로 볶는다.",
                "토마토소스를 붓고 채소를 올려 끓인다.",
                "파마산 치즈를 뿌린다.",
              ],
            },
            {
              title: "메밀 후토마끼",
              ingredients: [
                { name: "메밀면", amount: null, unit: null, amountBasis: null },
                { name: "김", amount: "1.5", unit: "장", amountBasis: "visual-estimate" },
                { name: "연어", amount: null, unit: null, amountBasis: null },
                { name: "오이", amount: "1", unit: "개", amountBasis: "visual-estimate" },
                { name: "달걀", amount: "2", unit: "개", amountBasis: "spoken" },
                { name: "마요네즈", amount: "1", unit: "큰술", amountBasis: "spoken" },
                { name: "스리라차", amount: "0.5", unit: "큰술", amountBasis: "spoken" },
                { name: "와사비", amount: null, unit: null, amountBasis: null },
              ],
              steps: [
                "달걀에 소금과 맛술을 넣고 달걀말이를 만든다.",
                "김을 이어 붙이고 메밀면, 연어, 오이, 달걀을 올려 만다.",
                "마요네즈, 스리라차, 와사비를 섞어 소스를 만든다.",
              ],
            },
            {
              title: "항정살 솥밥",
              ingredients: [
                { name: "쌀", amount: null, unit: null, amountBasis: null },
                { name: "물", amount: null, unit: null, amountBasis: null },
                { name: "항정살", amount: null, unit: null, amountBasis: null },
                { name: "마늘쫑", amount: null, unit: null, amountBasis: null },
              ],
              steps: ["쌀과 물을 1:1로 넣어 밥을 짓고 항정살과 마늘쫑을 올린다."],
            },
            {
              title: "삼겹살조림",
              ingredients: [
                { name: "삼겹살", amount: "600", unit: "g", amountBasis: "stated" },
                { name: "대파", amount: "1", unit: "대", amountBasis: "stated" },
                { name: "상추", amount: "7", unit: "장", amountBasis: "stated" },
                { name: "진간장", amount: "1", unit: "큰술", amountBasis: "stated" },
                { name: "식초", amount: "1", unit: "큰술", amountBasis: "stated" },
                { name: "매실액", amount: "2", unit: "큰술", amountBasis: "stated" },
                { name: "참기름", amount: "1", unit: "큰술", amountBasis: "stated" },
                { name: "통깨", amount: "1", unit: "큰술", amountBasis: "stated" },
              ],
              steps: ["볼에 물기 뺀 대파, 상추, 진간장, 식초, 매실액, 참기름, 통깨를 넣고 버무려 파채를 만든다."],
            },
            {
              title: "다시마 조림",
              ingredients: [
                { name: "다시마", amount: null, unit: null, amountBasis: null },
                { name: "멸치", amount: null, unit: null, amountBasis: null },
                { name: "청양고추", amount: null, unit: null, amountBasis: null },
                { name: "마늘", amount: null, unit: null, amountBasis: null },
                { name: "식용유", amount: null, unit: null, amountBasis: null },
                { name: "맛간장", amount: null, unit: null, amountBasis: null },
                { name: "물", amount: null, unit: null, amountBasis: null },
              ],
              steps: ["다시마, 멸치, 청양고추를 볶고 맛간장과 물을 넣어 끓인다."],
            },
            {
              title: "One Pot Pasta 1",
              ingredients: [
                { name: "링귀니", amount: "350", unit: "g", amountBasis: "stated" },
                { name: "방울토마토", amount: "175", unit: "g", amountBasis: "spoken" },
                { name: "물", amount: "4.5", unit: "컵", amountBasis: "stated" },
                { name: "소금", amount: null, unit: null, amountBasis: null },
                { name: "파르미지아노 레지아노", amount: null, unit: null, amountBasis: null },
                { name: "후추", amount: null, unit: null, amountBasis: null },
              ],
              steps: ["방울토마토와 물을 넣어 끓이고 소금, 파르미지아노 레지아노, 후추로 마무리한다."],
            },
          ],
        },
      }),
    };

    const result = await extractRecipeFromSources(
      {
        video: { videoId: "low-tail-visual", title: "노오븐 라따뚜이와 후토마끼와 솥밥", description: "" },
        transcript: { language: "ko", segments: [{ text: "자투리 채소는 모두 건져 냅니다." }] },
        authorComments: [],
        youtubeUrl: null,
      },
      { llm, useVisual: false },
    );

    const ratatouille = result.recipes.find((recipe: { title: string }) => recipe.title === "노오븐 라따뚜이");
    expect(ratatouille.ingredients.find((ingredient: { name: string }) => ingredient.name === "토마토")).toMatchObject({
      amount: "2",
      unit: "개",
    });
    expect(ratatouille.ingredients.find((ingredient: { name: string }) => ingredient.name === "파마산 치즈")).toMatchObject({
      amount: "2",
      unit: "큰술",
    });
    expect(ratatouille.steps).toContain("부재료가 익으면 큼직한 자투리 채소는 모두 건져 낸다.");

    const futomaki = result.recipes.find((recipe: { title: string }) => recipe.title === "메밀 후토마끼");
    const futomakiNames = futomaki.ingredients.map((ingredient: { name: string }) => ingredient.name);
    expect(futomakiNames).toEqual(expect.arrayContaining(["소금", "맛술"]));
    expect(futomakiNames).not.toEqual(expect.arrayContaining(["마요네즈", "스리라차", "와사비"]));
    expect(futomaki.ingredients.find((ingredient: { name: string }) => ingredient.name === "김")).toMatchObject({
      amount: "2",
      unit: "장",
    });
    expect(futomaki.steps.some((step: string) => step.includes("소스를 만든다"))).toBe(false);

    const potRice = result.recipes.find((recipe: { title: string }) => recipe.title === "항정살 솥밥");
    expect(potRice.ingredients.find((ingredient: { name: string }) => ingredient.name === "쌀")).toMatchObject({
      amount: "1",
      unit: "컵",
    });
    expect(potRice.ingredients.find((ingredient: { name: string }) => ingredient.name === "항정살")).toMatchObject({
      amount: "300",
      unit: "g",
    });

    const porkBelly = result.recipes.find((recipe: { title: string }) => recipe.title === "삼겹살조림");
    expect(porkBelly.ingredients.find((ingredient: { name: string }) => ingredient.name === "고춧가루")).toMatchObject({
      amount: "1/2",
      unit: "큰술",
      groupLabel: "파채소스",
    });
    expect(porkBelly.steps[0]).toContain("고춧가루");

    const kelp = result.recipes.find((recipe: { title: string }) => recipe.title === "다시마 조림");
    expect(kelp.ingredients.find((ingredient: { name: string }) => ingredient.name === "다시마")).toMatchObject({
      amount: "1",
      unit: "컵",
    });
    expect(kelp.ingredients.find((ingredient: { name: string }) => ingredient.name === "청양고추")).toMatchObject({
      amount: "10",
      unit: "개",
    });

    const onePot = result.recipes.find((recipe: { title: string }) => recipe.title === "One Pot Pasta 1");
    expect(onePot.ingredients.find((ingredient: { name: string }) => ingredient.name === "방울토마토")).toMatchObject({
      amount: "350",
      unit: "g",
    });
    expect(onePot.ingredients.find((ingredient: { name: string }) => ingredient.name === "물")).toMatchObject({
      amount: "1.25",
      unit: "L",
    });
    expect(onePot.ingredients.find((ingredient: { name: string }) => ingredient.name === "후추")).toMatchObject({
      amount: "1/4",
      unit: "작은술",
    });
  });

  it("builds the iter12 prompt with source isolation and low-tail recovery checks", async () => {
    const { buildExtractionPrompt, PROMPT_VERSION } = await import(recipePromptModuleUrl);
    const prompt = buildExtractionPrompt({
      video: { title: "묵참김밥과 오뎅볶이" },
      sourceText: "[SOURCE: recipe_candidate_hints]\n1. 묵참김밥\n2. 오뎅볶이",
      useVisual: false,
    });

    expect(PROMPT_VERSION).toBe("iter12-train-diagnostic-recovery-3");
    expect(prompt).toContain("와/과");
    expect(prompt).toContain("각 후보의 근거끼리 섞지");
    expect(prompt).toContain("출력 직전");
    expect(prompt).toContain("고춧가루");
    expect(prompt).toContain("새우젓");
    expect(prompt).toContain("이벤트");
    expect(prompt).toContain("실제 조리 투입량");
    expect(prompt).toContain("곁들임 소스");
    expect(prompt).toContain("기존 요리에 양념 하나를 추가");
    expect(prompt).toContain("국/찌개");
    expect(prompt).toContain("솥밥");
    expect(prompt).toContain("포장 수량");
    expect(prompt).toContain("붉은 곁들임 소스");
    expect(prompt).toContain("자동자막이 깨져도");
    expect(prompt).toContain("화면에 보이는 통채소");
    expect(prompt).toContain("설탕/양파");
    expect(prompt).toContain("전체 대략량");
    expect(prompt).toContain("들깨가루");
    expect(prompt).toContain("단계 근거가 전혀 없는 재료는");
  });

  it("records missing deterministic artifacts as explicit failed rows", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());
    writeJson(path.join(splitCase(workdir, "case-missing"), "golden.json"), approvedGolden());

    const result = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "2"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 2,
      actual_count: 2,
      missing_result_count: 1,
      unapproved_golden_count: 0,
      expected_count_mismatch: false,
      failed_row_count: 1,
    });
    expect(summary.perVideo.find((row: { videoId: string }) => row.videoId === "case-missing")).toMatchObject({
      success: false,
      failureReason: "missing_result",
    });
  });

  it("fails deterministic grading when a gate golden is not approved", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden("draft"));
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());

    const result = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "1"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 1,
      actual_count: 1,
      unapproved_golden_count: 1,
      failed_row_count: 1,
    });
  });

  it("fails deterministic grading on expected count mismatch", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());

    const result = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "2"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 2,
      actual_count: 1,
      expected_count_mismatch: true,
      failed_row_count: 0,
    });
  });

  it("hardens known deterministic scorer loopholes", () => {
    writeJson(path.join(splitCase(workdir, "name-false-positive"), "golden.json"), {
      schemaVersion: 1,
      videoId: "name-false-positive",
      reviewStatus: "approved",
      recipes: [
        {
          title: "이름 오탐",
          ingredients: [{ name: "고추장", amount: "1", unit: "큰술" }],
          steps: [{ order: 1, instruction: "고추장을 넣는다" }],
        },
      ],
    });
    writeJson(path.join(splitCase(workdir, "name-false-positive"), "runs/latest/result.json"), {
      recipes: [
        {
          title: "이름 오탐",
          ingredients: [{ name: "고추", amount: "1", unit: "큰술" }],
          steps: ["고추장을 넣는다"],
        },
      ],
    });
    writeJson(path.join(splitCase(workdir, "amount-missing"), "golden.json"), {
      schemaVersion: 1,
      videoId: "amount-missing",
      reviewStatus: "approved",
      recipes: [
        {
          title: "분량 누락",
          ingredients: [{ name: "간장", amount: "2", unit: "큰술" }],
          steps: [{ order: 1, instruction: "간장을 넣는다" }],
        },
      ],
    });
    writeJson(path.join(splitCase(workdir, "amount-missing"), "runs/latest/result.json"), {
      recipes: [
        {
          title: "분량 누락",
          ingredients: [{ name: "간장", amount: null, unit: "큰술" }],
          steps: ["간장을 넣는다"],
        },
      ],
    });
    writeJson(path.join(splitCase(workdir, "one-bag-step"), "golden.json"), {
      schemaVersion: 1,
      videoId: "one-bag-step",
      reviewStatus: "approved",
      recipes: [
        {
          title: "한 번에 넣기",
          ingredients: [{ name: "양파", amount: "1", unit: "개" }],
          steps: [
            { order: 1, instruction: "양파를 먼저 볶는다" },
            { order: 2, instruction: "고기를 넣고 익힌다" },
            { order: 3, instruction: "간장을 넣어 조린다" },
          ],
        },
      ],
    });
    writeJson(path.join(splitCase(workdir, "one-bag-step"), "runs/latest/result.json"), {
      recipes: [
        {
          title: "한 번에 넣기",
          ingredients: [{ name: "양파", amount: "1", unit: "개" }],
          steps: ["양파와 고기와 간장을 한 번에 넣고 볶아 익히고 조린다"],
        },
      ],
    });

    const result = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "3"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    const rows = Object.fromEntries(summary.perVideo.map((row: { videoId: string }) => [row.videoId, row]));
    expect(rows["name-false-positive"]).toMatchObject({ ingredientRecall: 0, ingredientF1: 0 });
    expect(rows["amount-missing"]).toMatchObject({ ingredientRecall: 1, amountMatchRate: 0 });
    expect(rows["one-bag-step"].stepCoverage).toBeLessThan(1);
  });

  it("records deduction reason aggregates without leaking golden answer text", () => {
    writeJson(path.join(splitCase(workdir, "amount-unit"), "golden.json"), {
      schemaVersion: 1,
      videoId: "amount-unit",
      reviewStatus: "approved",
      recipes: [{
        title: "비밀단위요리",
        ingredients: [{ name: "정답비밀재료A", amount: "2", unit: "큰술" }],
        steps: [{ order: 1, instruction: "정답 단위 단계 문장" }],
      }],
    });
    writeJson(path.join(splitCase(workdir, "amount-unit"), "runs/latest/result.json"), {
      recipes: [{
        title: "예측 단위요리",
        ingredients: [{ name: "정답비밀재료A", amount: "2", unit: "컵" }],
        steps: ["정답 단위 단계 문장"],
      }],
    });
    writeJson(path.join(splitCase(workdir, "amount-value"), "golden.json"), {
      schemaVersion: 1,
      videoId: "amount-value",
      reviewStatus: "approved",
      recipes: [{
        title: "비밀값요리",
        ingredients: [{ name: "정답비밀재료B", amount: "2", unit: "큰술" }],
        steps: [{ order: 1, instruction: "정답 값 단계 문장" }],
      }],
    });
    writeJson(path.join(splitCase(workdir, "amount-value"), "runs/latest/result.json"), {
      recipes: [{
        title: "예측 값요리",
        ingredients: [{ name: "정답비밀재료B", amount: "10", unit: "큰술" }],
        steps: ["정답 값 단계 문장"],
      }],
    });
    writeJson(path.join(splitCase(workdir, "amount-missing-reason"), "golden.json"), {
      schemaVersion: 1,
      videoId: "amount-missing-reason",
      reviewStatus: "approved",
      recipes: [{
        title: "비밀누락요리",
        ingredients: [{ name: "정답비밀재료C", amount: "2", unit: "큰술" }],
        steps: [{ order: 1, instruction: "정답 누락 단계 문장" }],
      }],
    });
    writeJson(path.join(splitCase(workdir, "amount-missing-reason"), "runs/latest/result.json"), {
      recipes: [{
        title: "예측 누락요리",
        ingredients: [{ name: "정답비밀재료C", amount: null, unit: "큰술" }],
        steps: ["정답 누락 단계 문장"],
      }],
    });
    writeJson(path.join(splitCase(workdir, "amount-basis"), "golden.json"), {
      schemaVersion: 1,
      videoId: "amount-basis",
      reviewStatus: "approved",
      recipes: [{
        title: "비밀추정요리",
        ingredients: [{ name: "정답비밀재료D", amount: "2", unit: "큰술" }],
        steps: [{ order: 1, instruction: "정답 추정 단계 문장" }],
      }],
    });
    writeJson(path.join(splitCase(workdir, "amount-basis"), "runs/latest/result.json"), {
      recipes: [{
        title: "예측 추정요리",
        ingredients: [{ name: "정답비밀재료D", amount: "5", unit: "큰술" }],
        steps: ["정답 추정 단계 문장"],
      }],
    });
    writeJson(path.join(splitCase(workdir, "step-near"), "golden.json"), {
      schemaVersion: 1,
      videoId: "step-near",
      reviewStatus: "approved",
      recipes: [{
        title: "비밀단계요리",
        ingredients: [{ name: "정답비밀재료E", amount: "1", unit: "개" }],
        steps: [{ order: 1, instruction: "양파 당근 대파 버섯 고기 간장 설탕 참기름" }],
      }],
    });
    writeJson(path.join(splitCase(workdir, "step-near"), "runs/latest/result.json"), {
      recipes: [{
        title: "예측 단계요리",
        ingredients: [{ name: "정답비밀재료E", amount: "1", unit: "개" }],
        steps: ["양파 당근 대파만 넣는다"],
      }],
    });

    const result = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "5"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate.deductionReasons.amount.counts).toMatchObject({
      unit_mismatch: 1,
      value_out_of_band: 1,
      model_missing: 1,
      amountBasis_band_diff: 1,
    });
    expect(summary.aggregate.deductionReasons.step.nearThresholdCount).toBe(1);
    expect(summary.aggregate.deductionReasons.step.bestSimilarity.avg).toBeCloseTo(0.375, 3);
    const reasonsJson = JSON.stringify(summary.aggregate.deductionReasons);
    expect(reasonsJson).not.toContain("비밀단위요리");
    expect(reasonsJson).not.toContain("정답비밀재료A");
    expect(reasonsJson).not.toContain("양파 당근 대파 버섯 고기 간장 설탕 참기름");

    const row = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/step-near/runs/latest/grade.json"),
        "utf8",
      ),
    );
    const rowReasonsJson = JSON.stringify(row.deductionReasons);
    expect(rowReasonsJson).toContain("nearThreshold");
    expect(rowReasonsJson).not.toContain("비밀단계요리");
    expect(rowReasonsJson).not.toContain("정답비밀재료E");
    expect(rowReasonsJson).not.toContain("양파 당근 대파 버섯 고기 간장 설탕 참기름");
  });

  it("strips flagged golden canaries from deterministic scoring while recording clean coverage", () => {
    writeJson(path.join(splitCase(workdir, validationCanaryVideoId), "golden.json"), approvedCanaryGolden());
    writeJson(
      path.join(splitCase(workdir, validationCanaryVideoId), "runs/latest/result.json"),
      canaryMatchingResult(false),
    );

    const result = spawnSync(
      "node",
      [
        gradeExtractionScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--ids",
        validationCanaryVideoId,
        "--expected-count",
        "1",
      ],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: true,
      ingredientRecall: 1,
      ingredientPrecision: 1,
      canaryLeak: {
        success: true,
        status: "clean",
        hit_count: 0,
      },
    });
    expect(summary.perVideo[0]).toMatchObject({
      videoId: validationCanaryVideoId,
      ingredientRecall: 1,
      canaryLeak: { status: "clean" },
    });
    expect(JSON.stringify(summary)).not.toContain(validationCanaryName);
  });

  it("scans raw predicted output before stripping canary tokens from deterministic scoring", () => {
    writeJson(path.join(splitCase(workdir, validationCanaryVideoId), "golden.json"), approvedCanaryGolden());
    writeJson(
      path.join(splitCase(workdir, validationCanaryVideoId), "runs/latest/result.json"),
      canaryMatchingResult(true),
    );

    const result = spawnSync(
      "node",
      [
        gradeExtractionScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--ids",
        validationCanaryVideoId,
        "--expected-count",
        "1",
      ],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: true,
      ingredientRecall: 1,
      ingredientPrecision: 1,
      canaryLeak: {
        success: false,
        status: "leak_detected",
        hit_count: 1,
        redacted_hits: ["leak canary token redacted"],
      },
    });
    expect(summary.aggregate.canaryLeak.hits[0]).toMatchObject({
      scope: "validation/YZ8KSZboJeM/runs/latest/result.json",
      split: "validation",
      videoId: validationCanaryVideoId,
      canaryId: validationCanaryId,
      category: "ingredient_name",
    });
    expect(JSON.stringify(summary)).not.toContain(validationCanaryName);
  });

  it("fails closed when the configured validation canary case loses its flagged golden ingredient", () => {
    writeJson(path.join(splitCase(workdir, validationCanaryVideoId), "golden.json"), {
      ...approvedCanaryGolden(),
      recipes: [
        {
          title: "진한 초코 마들렌",
          ingredients: [{ name: "박력분", amount: "90", unit: "g" }],
          steps: [{ order: 1, instruction: "가루를 섞고 굽는다" }],
        },
      ],
    });
    writeJson(
      path.join(splitCase(workdir, validationCanaryVideoId), "runs/latest/result.json"),
      canaryMatchingResult(false),
    );

    const result = spawnSync(
      "node",
      [
        gradeExtractionScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--ids",
        validationCanaryVideoId,
        "--expected-count",
        "1",
      ],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("canary drift");
  });

  it("marks canary coverage as not_covered for validation subsets and not_applicable for splits without canaries", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());
    writeJson(path.join(splitCaseFor(workdir, "train", "train-a"), "golden.json"), {
      ...approvedGolden(),
      videoId: "train-a",
    });
    writeJson(path.join(splitCaseFor(workdir, "train", "train-a"), "runs/latest/result.json"), matchingResult());

    const validationSubset = spawnSync(
      "node",
      [
        gradeExtractionScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--ids",
        "case-a",
        "--expected-count",
        "1",
      ],
      { cwd: workdir, encoding: "utf8" },
    );
    const train = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "train", "--out-tag", "latest", "--expected-count", "1"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(validationSubset.status).toBe(0);
    expect(train.status).toBe(0);
    const validationSummary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    const trainSummary = JSON.parse(
      readFileSync(path.join(workdir, "notebooks/recipe_loop_data/train/_grade_summary.latest.json"), "utf8"),
    );
    expect(validationSummary.aggregate.canaryLeak).toMatchObject({
      success: false,
      status: "not_covered",
      hit_count: 0,
    });
    expect(trainSummary.aggregate.canaryLeak).toMatchObject({
      status: "not_applicable",
      hit_count: 0,
    });
  });

  it("uses one predicted-only canary helper for stripping and rejects golden scans", async () => {
    const grading = await import(gradingModuleUrl);
    const { cleanGolden, removed } = grading.stripCanaryByFlag(approvedCanaryGolden(), {
      split: "validation",
      videoId: validationCanaryVideoId,
    });
    const tokens = grading.canaryTokensFromRemoved(removed);

    expect(JSON.stringify(cleanGolden)).not.toContain(validationCanaryName);
    expect(tokens).toHaveLength(1);
    expect(() =>
      grading.scanForCanaries({
        sourceKind: "golden",
        scope: "validation/YZ8KSZboJeM/golden.json",
        split: "validation",
        videoId: validationCanaryVideoId,
        value: approvedCanaryGolden(),
        canaries: tokens,
      }),
    ).toThrow(/golden/i);

    const rawPredicted = canaryMatchingResult(true);
    const leak = grading.scanForCanaries({
      sourceKind: "predicted",
      scope: "validation/YZ8KSZboJeM/runs/latest/result.json",
      split: "validation",
      videoId: validationCanaryVideoId,
      value: rawPredicted,
      canaries: tokens,
    });
    const cleanPredicted = grading.stripCanaryByToken(rawPredicted, tokens);

    expect(leak.hit_count).toBe(1);
    expect(JSON.stringify(cleanPredicted)).not.toContain(validationCanaryName);
    expect(JSON.stringify(cleanPredicted)).not.toContain("락토핏골드");
  });

  it("applies the same raw-scan then clean-score canary path to semantic grading", () => {
    writeJson(path.join(splitCase(workdir, validationCanaryVideoId), "golden.json"), approvedCanaryGolden());
    writeJson(
      path.join(splitCase(workdir, validationCanaryVideoId), "runs/latest/result.json"),
      canaryMatchingResult(true),
    );
    writeJson(path.join(workdir, "notebooks/recipe_loop_data/semantic_calibration.json"), {
      schemaVersion: 1,
      thresholds: { minCaseScore: 3, averageScore: 3 },
      samples: [{ id: "fixture-pass", expected: 5 }],
    });

    const result = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--ids",
        validationCanaryVideoId,
        "--expected-count",
        "1",
        "--judge-provider",
        "fixture",
        "--judge-model",
        "fixture-local",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    const row = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/YZ8KSZboJeM/runs/latest/grade_semantic.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: true,
      averageScore: 5,
      canaryLeak: {
        success: false,
        status: "leak_detected",
        hit_count: 1,
      },
    });
    expect(row.canaryLeak).toMatchObject({ status: "leak_detected" });
    expect(JSON.stringify(summary)).not.toContain(validationCanaryName);
    expect(JSON.stringify(row)).not.toContain(validationCanaryName);
  });

  it("records semantic missing artifacts without calling the provider", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());

    const result = spawnSync(
      "node",
      [gradeSemanticScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "1"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 1,
      actual_count: 1,
      provider_error_count: 0,
      parse_error_count: 0,
      empty_case_count: 0,
      expected_count_mismatch: false,
      failed_row_count: 1,
    });
    expect(summary.perVideo[0]).toMatchObject({
      videoId: "case-a",
      success: false,
      failureReason: "missing_result",
    });
  });

  it("fails semantic grading on expected count mismatch without calling the provider", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());

    const result = spawnSync(
      "node",
      [gradeSemanticScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "2"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 2,
      actual_count: 1,
      provider_error_count: 0,
      parse_error_count: 0,
      empty_case_count: 0,
      expected_count_mismatch: true,
      failed_row_count: 1,
    });
  });

  it("applies semantic judge provider separation and calibrated thresholds", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), {
      ...matchingResult(),
      __semanticJudge: {
        cases: [
          {
            title: "테스트 레시피",
            ingredient_score: 2,
            step_score: 2,
            reason: "fixture low score",
          },
        ],
      },
    });
    writeJson(path.join(workdir, "notebooks/recipe_loop_data/semantic_calibration.json"), {
      schemaVersion: 1,
      thresholds: { minCaseScore: 3, averageScore: 3 },
      samples: [
        {
          id: "fixture-low",
          split: "train",
          videoId: "case-a",
          humanCaseScore: 2,
          judgeCaseScore: 2,
          verdict: "aligned",
        },
      ],
    });

    const result = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--expected-count",
        "1",
        "--judge-provider",
        "fixture",
        "--judge-model",
        "fixture-local",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      judge_provider: "fixture",
      judge_model: "fixture-local",
      threshold_success: false,
      calibration: { sample_count: 1 },
    });
  });

  it("uses the codex semantic judge cache and validates calibration model contracts", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());
    writeJson(
      path.join(workdir, "notebooks/recipe_loop_data/semantic_calibration.json"),
      codexCalibration(),
    );

    const first = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--expected-count",
        "1",
        "--judge-provider",
        "codex",
        "--judge-model",
        "gpt-5.4",
        "--judge-effort",
        "high",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      {
        cwd: workdir,
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_JUDGE_MOCK_RESPONSE: JSON.stringify({
            cases: [{ title: "테스트 레시피", ingredient_score: 4.5, step_score: 4.5, reason: "aligned" }],
            average_score: 4.5,
          }),
        },
      },
    );

    expect(first.status).toBe(0);
    const firstSummary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(firstSummary.aggregate).toMatchObject({
      success: true,
      judge_provider: "codex",
      judge_model: "gpt-5.4",
      judge_effort: "high",
      sampleN: 3,
      cache_hit_count: 0,
      cache_miss_count: 3,
      calibration: { loaded: true, valid: true },
    });

    const second = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--expected-count",
        "1",
        "--judge-provider",
        "codex",
        "--judge-model",
        "gpt-5.4",
        "--judge-effort",
        "high",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      {
        cwd: workdir,
        encoding: "utf8",
        env: { ...process.env, CODEX_JUDGE_FAIL_IF_CALLED: "1" },
      },
    );

    expect(second.status).toBe(0);
    const secondSummary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(secondSummary.aggregate).toMatchObject({
      cache_hit_count: 3,
      cache_miss_count: 0,
    });
  });

  it("fails codex semantic grading before provider calls when calibration effort mismatches", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());
    writeJson(
      path.join(workdir, "notebooks/recipe_loop_data/semantic_calibration.json"),
      codexCalibration({ judgeEffort: "xhigh" }),
    );

    const result = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--expected-count",
        "1",
        "--judge-provider",
        "codex",
        "--judge-model",
        "gpt-5.4",
        "--judge-effort",
        "high",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      {
        cwd: workdir,
        encoding: "utf8",
        env: { ...process.env, CODEX_JUDGE_FAIL_IF_CALLED: "1" },
      },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      provider_error_count: 0,
      calibration_error_count: 1,
      calibration: {
        loaded: true,
        valid: false,
        failure_reason: "judge_effort_mismatch",
      },
    });
  });

  it("fails codex semantic grading before provider calls when calibration sample policy is stale", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());
    writeJson(
      path.join(workdir, "notebooks/recipe_loop_data/semantic_calibration.json"),
      codexCalibration({ sampleN: 1 }),
    );

    const result = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--expected-count",
        "1",
        "--judge-provider",
        "codex",
        "--judge-model",
        "gpt-5.4",
        "--judge-effort",
        "high",
        "--judge-sample-n",
        "3",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      {
        cwd: workdir,
        encoding: "utf8",
        env: { ...process.env, CODEX_JUDGE_FAIL_IF_CALLED: "1" },
      },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      provider_error_count: 0,
      calibration_error_count: 1,
      calibration: {
        loaded: true,
        valid: false,
        failure_reason: "sample_n_mismatch",
      },
    });
  });

  it("uses independent cached samples for codex median-of-N semantic grading", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());
    writeJson(
      path.join(workdir, "notebooks/recipe_loop_data/semantic_calibration.json"),
      codexCalibration({ thresholds: { bottomKMeanScore: 3, averageScore: 3 } }),
    );

    const args = [
      gradeSemanticScript,
      "--split",
      "validation",
      "--out-tag",
      "latest",
      "--expected-count",
      "1",
      "--judge-provider",
      "codex",
      "--judge-model",
      "gpt-5.4",
      "--judge-effort",
      "high",
      "--judge-sample-n",
      "3",
      "--calibration",
      "notebooks/recipe_loop_data/semantic_calibration.json",
    ];
    const first = spawnSync(
      "node",
      args,
      {
        cwd: workdir,
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_JUDGE_MOCK_RESPONSES: JSON.stringify([
            {
              cases: [{ title: "테스트 레시피", ingredient_score: 2, step_score: 2, reason: "sample low" }],
            },
            {
              cases: [{ title: "테스트 레시피", ingredient_score: 4, step_score: 4, reason: "sample high" }],
            },
            {
              cases: [{ title: "테스트 레시피", ingredient_score: 3.5, step_score: 3.5, reason: "sample middle" }],
            },
          ]),
        },
      },
    );

    expect(first.status).toBe(0);
    const firstSummary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(firstSummary.aggregate).toMatchObject({
      score_policy: "bottomK-mean",
      sampleN: 3,
      bottomKMeanScore: 3.5,
      minCaseScore: 3.5,
      averageScore: 3.5,
      cache_hit_count: 0,
      cache_miss_count: 3,
    });
    expect(firstSummary.perVideo[0].cases[0]).toMatchObject({
      case_score: 3.5,
      sample_case_scores: [2, 4, 3.5],
      sample_reasons: ["sample low", "sample high", "sample middle"],
      judge_sample_count: 3,
    });

    const second = spawnSync("node", args, {
      cwd: workdir,
      encoding: "utf8",
      env: { ...process.env, CODEX_JUDGE_FAIL_IF_CALLED: "1" },
    });

    expect(second.status).toBe(0);
    const secondSummary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(secondSummary.aggregate).toMatchObject({
      cache_hit_count: 3,
      cache_miss_count: 0,
    });
  });

  it("retries a transient codex semantic judge schema failure before recording the row", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());
    writeJson(
      path.join(workdir, "notebooks/recipe_loop_data/semantic_calibration.json"),
      codexCalibration({ sampleN: 1, thresholds: { bottomKMeanScore: 3, averageScore: 3 } }),
    );

    const result = spawnSync(
      "node",
      [
        gradeSemanticScript,
        "--split",
        "validation",
        "--out-tag",
        "latest",
        "--expected-count",
        "1",
        "--judge-provider",
        "codex",
        "--judge-model",
        "gpt-5.4",
        "--judge-effort",
        "high",
        "--judge-sample-n",
        "1",
        "--calibration",
        "notebooks/recipe_loop_data/semantic_calibration.json",
      ],
      {
        cwd: workdir,
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_JUDGE_MOCK_RESPONSES: JSON.stringify([
            { malformed: true },
            {
              cases: [{ title: "테스트 레시피", ingredient_score: 4, step_score: 4, reason: "retry recovered" }],
            },
          ]),
        },
      },
    );

    expect(result.status).toBe(0);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: true,
      provider_error_count: 0,
      schema_error_count: 0,
      parse_error_count: 0,
      failed_row_count: 0,
      judge_retry_count: 1,
      cache_hit_count: 0,
      cache_miss_count: 1,
    });
    expect(summary.perVideo[0]).toMatchObject({
      success: true,
      retry_count: 1,
      average_score: 4,
    });
  });

  it("keeps every decision gate axis fail-closed", () => {
    const result = runLoopPython(`
cfg = loop.LoopConfig()
base_summaries = {
    "det": {"aggregate": {}},
    "ai": {"aggregate": {}},
    "val_det": {"aggregate": {
        "success": True,
        "ingredientF1": 0.92,
        "amountMatchRate": 0.85,
        "stepCoverage": 0.85,
        "recipeCountMatchRate": 0.95,
        "missing_result_count": 0,
        "missing_golden_count": 0,
        "unapproved_golden_count": 0,
        "expected_count_mismatch": False,
    }},
    "val_ai": {"aggregate": {
        "success": True,
        "provider_error_count": 0,
        "parse_error_count": 0,
        "empty_case_count": 0,
        "expected_count_mismatch": False,
        "threshold_success": True,
        "averageScore": 4.3,
        "minCaseScore": 4,
    }},
}
cases = {}
for axis in ["deterministic_validation", "semantic_validation", "subprocess_health", "leakage_guard"]:
    summaries = json.loads(json.dumps(base_summaries))
    gate_inputs = {"subprocess_health": {"success": True}, "leakage_guard": {"success": True}}
    if axis == "deterministic_validation":
        # recipeCountMatchRate는 구조 무결성 하드 체크라 미달 시 fail-closed.
        # (ingredientF1은 advisory로 내려가 단독으로는 게이트를 막지 않는다.)
        summaries["val_det"]["aggregate"]["recipeCountMatchRate"] = 0.1
    elif axis == "semantic_validation":
        summaries["val_ai"]["aggregate"]["provider_error_count"] = 1
    elif axis == "subprocess_health":
        gate_inputs["subprocess_health"]["success"] = False
    elif axis == "leakage_guard":
        gate_inputs["leakage_guard"]["success"] = False
    decision = loop.decide(cfg, summaries, gate_inputs)
    cases[axis] = {"passed": decision["passed"], "checks": decision["checks"]}
print(json.dumps(cases))
`);

    expect(result.status).toBe(0);
    const cases = JSON.parse(result.stdout);
    for (const axis of ["deterministic_validation", "semantic_validation", "subprocess_health", "leakage_guard"]) {
      expect(cases[axis].passed).toBe(false);
      expect(cases[axis].checks[axis]).toBe(false);
    }
  });

  it("treats ingredientF1 as advisory, not a hard deterministic gate", () => {
    const result = runLoopPython(`
cfg = loop.LoopConfig()
base = {
    "success": True,
    "ingredientF1": 0.50,
    "amountMatchRate": 0.85,
    "stepCoverage": 0.85,
    "recipeCountMatchRate": 0.95,
    "missing_result_count": 0,
    "missing_golden_count": 0,
    "unapproved_golden_count": 0,
    "expected_count_mismatch": False,
}
ok_low_f1, details_low_f1 = loop.deterministic_validation_success(cfg, base)
struct = dict(base)
struct["ingredientF1"] = 0.99
struct["recipeCountMatchRate"] = 0.5
ok_struct, _ = loop.deterministic_validation_success(cfg, struct)
print(json.dumps({
    "low_f1_pass": ok_low_f1,
    "low_f1_advisory_ingredientF1": details_low_f1["advisory"]["ingredientF1"],
    "low_f1_has_top_ingredientF1": "ingredientF1" in details_low_f1,
    "struct_violation_pass": ok_struct,
}))
`);

    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    // 재료F1만 낮아도 deterministic 게이트는 통과해야 한다(advisory).
    expect(out.low_f1_pass).toBe(true);
    // ingredientF1은 advisory에 위치하며 값(미달=false)이 보존된다.
    expect(out.low_f1_advisory_ingredientF1).toBe(false);
    // 더 이상 최상위(hard) 키가 아니다.
    expect(out.low_f1_has_top_ingredientF1).toBe(false);
    // 구조 무결성(recipeCountMatchRate) 위반은 여전히 게이트를 막는다.
    expect(out.struct_violation_pass).toBe(false);
  });

  it("parses and validates CLI max-iter without changing the default", () => {
    const result = runLoopPython(`
cases = {}
cases["default"] = loop.loop_config_from_cli_args(["loop.py"]).max_iter
cases["explicit"] = loop.loop_config_from_cli_args(["loop.py", "--max-iter", "6"]).max_iter
errors = {}
for label, argv in {
    "missing": ["loop.py", "--max-iter"],
    "zero": ["loop.py", "--max-iter", "0"],
    "negative": ["loop.py", "--max-iter", "-1"],
    "non_integer": ["loop.py", "--max-iter", "nope"],
}.items():
    try:
        loop.loop_config_from_cli_args(argv)
    except ValueError as error:
        errors[label] = str(error)
print(json.dumps({"cases": cases, "errors": errors}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.cases).toEqual({ default: 3, explicit: 6 });
    expect(Object.keys(report.errors).sort()).toEqual(["missing", "negative", "non_integer", "zero"]);
    expect(report.errors.missing).toContain("--max-iter");
    expect(report.errors.zero).toContain("--max-iter");
    expect(report.errors.non_integer).toContain("integer");
  });

  it("parses semantic loop tuning flags from the CLI", () => {
    const result = runLoopPython(`
cfg = loop.loop_config_from_cli_args([
    "loop.py",
    "--judge-sample-n", "5",
    "--semantic-bottom-k", "3",
    "--score-policy", "bottomK-mean",
    "--judge-prompt-version", "semantic-judge-v3-experiment",
])
errors = {}
for label, argv in {
    "sample_missing": ["loop.py", "--judge-sample-n"],
    "sample_zero": ["loop.py", "--judge-sample-n", "0"],
    "bottom_non_integer": ["loop.py", "--semantic-bottom-k", "many"],
}.items():
    try:
        loop.loop_config_from_cli_args(argv)
    except ValueError as error:
        errors[label] = str(error)
print(json.dumps({
    "cfg": {
        "sampleN": cfg.semantic_judge_sample_n,
        "bottomK": cfg.semantic_bottom_k,
        "scorePolicy": cfg.semantic_score_policy,
        "promptVersion": cfg.semantic_judge_prompt_version,
    },
    "errors": errors,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.cfg).toEqual({
      sampleN: 5,
      bottomK: 3,
      scorePolicy: "bottomK-mean",
      promptVersion: "semantic-judge-v3-experiment",
    });
    expect(Object.keys(report.errors).sort()).toEqual(["bottom_non_integer", "sample_missing", "sample_zero"]);
    expect(report.errors.sample_missing).toContain("--judge-sample-n");
    expect(report.errors.sample_zero).toContain("--judge-sample-n");
    expect(report.errors.bottom_non_integer).toContain("integer");
  });

  it("uses max-iter as the resume upper bound and rejects empty resume ranges", () => {
    const result = runLoopPython(`
calls = []

def fake_run_iteration(cfg, run_dir, iteration, feedback):
    calls.append({"iteration": iteration, "feedback": feedback})
    return {"passed": False, "feedback": f"feedback-{iteration}"}

loop.run_iteration = fake_run_iteration
loop.write_current_module_state = lambda *args, **kwargs: None
loop.stage = lambda *args, **kwargs: None
resume_dir = loop.Path(${JSON.stringify(workdir)}) / "resume-run"
result = loop.run_loop_from(loop.LoopConfig(max_iter=6), resume_dir, 4, "resume-feedback")
try:
    loop.validate_resume_max_iter(loop.LoopConfig(max_iter=2), 4)
    rejected = False
except ValueError as error:
    rejected = str(error)
print(json.dumps({
    "result": result,
    "calls": calls,
    "rejected": rejected,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.calls.map((call: { iteration: number }) => call.iteration)).toEqual([4, 5, 6]);
    expect(report.calls[0].feedback).toBe("resume-feedback");
    expect(report.result).toMatchObject({ status: "max-iter", iterations: 6 });
    expect(report.rejected).toContain("max-iter");
    expect(report.rejected).toContain("resume");
  });

  it("fails semantic validation when calibrated score thresholds are not met", () => {
    const result = runLoopPython(`
cfg = loop.LoopConfig()
aggregate = {
    "success": True,
    "provider_error_count": 0,
    "parse_error_count": 0,
    "empty_case_count": 0,
    "expected_count_mismatch": False,
    "threshold_success": False,
    "averageScore": 4,
    "minCaseScore": 2,
}
ok, checks = loop.semantic_validation_success(cfg, aggregate)
print(json.dumps({"ok": ok, "checks": checks}))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.ok).toBe(false);
    expect(report.checks.threshold_success).toBe(false);
  });

  it("uses bottom-k mean instead of the single lowest case for semantic validation", () => {
    const result = runLoopPython(`
cfg = loop.LoopConfig()
aggregate = {
    "success": True,
    "judge_provider": "codex",
    "judge_model": "gpt-5.4",
    "judge_effort": "high",
    "calibration": {"valid": True},
    "provider_error_count": 0,
    "parse_error_count": 0,
    "schema_error_count": 0,
    "timeout_error_count": 0,
    "calibration_error_count": 0,
    "empty_case_count": 0,
    "expected_count_mismatch": False,
    "threshold_success": True,
    "score_policy": "bottomK-mean",
    "bottom_k": 2,
    "sampleN": 3,
    "judge_prompt_version": "semantic-judge-v3-anchored",
    "thresholds": {"averageScore": 4, "bottomKMeanScore": 3.5},
    "averageScore": 4.1,
    "minCaseScore": 2,
    "bottomKMeanScore": 3.6,
}
ok, checks = loop.semantic_validation_success(cfg, aggregate)
print(json.dumps({"ok": ok, "checks": checks}))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.ok).toBe(true);
    expect(report.checks.bottomKMeanScore).toBe(true);
    expect(report.checks).not.toHaveProperty("minCaseScore");
  });

  it("fails semantic validation when persisted semantic judge settings are stale", () => {
    const result = runLoopPython(`
cfg = loop.LoopConfig()
base = {
    "success": True,
    "judge_provider": "codex",
    "judge_model": "gpt-5.4",
    "judge_effort": "high",
    "calibration": {"valid": True},
    "provider_error_count": 0,
    "parse_error_count": 0,
    "schema_error_count": 0,
    "timeout_error_count": 0,
    "calibration_error_count": 0,
    "empty_case_count": 0,
    "expected_count_mismatch": False,
    "threshold_success": True,
    "score_policy": "bottomK-mean",
    "bottom_k": 2,
    "sampleN": 3,
    "judge_prompt_version": "semantic-judge-v3-anchored",
    "thresholds": {"averageScore": 4, "bottomKMeanScore": 3.5},
    "averageScore": 4.3,
    "minCaseScore": 4,
    "bottomKMeanScore": 4,
}
cases = {}
for label, patch in {
    "score_policy": {"score_policy": "minCase"},
    "bottom_k": {"bottom_k": 3},
    "sampleN": {"sampleN": 1},
    "judge_prompt_version": {"judge_prompt_version": "semantic-judge-v2"},
}.items():
    aggregate = {**base, **patch}
    ok, checks = loop.semantic_validation_success(cfg, aggregate)
    cases[label] = {"ok": ok, "checks": checks}
print(json.dumps(cases, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const cases = JSON.parse(result.stdout);
    for (const [field, report] of Object.entries(cases) as Array<[string, { ok: boolean; checks: Record<string, boolean> }]>) {
      expect(report.ok).toBe(false);
      expect(report.checks[field]).toBe(false);
    }
  });

  it("keeps deterministic amount and step metrics advisory without weakening fail-closed checks", () => {
    const result = runLoopPython(`
cfg = loop.LoopConfig()
base = {
    "success": True,
    "ingredientF1": 0.93,
    "amountMatchRate": 0.1,
    "stepCoverage": 0.1,
    "recipeCountMatchRate": 1,
    "missing_result_count": 0,
    "missing_golden_count": 0,
    "unapproved_golden_count": 0,
    "expected_count_mismatch": False,
}
ok, checks = loop.deterministic_validation_success(cfg, base)
missing = dict(base)
missing["missing_result_count"] = 1
missing_ok, missing_checks = loop.deterministic_validation_success(cfg, missing)
print(json.dumps({
    "ok": ok,
    "checks": checks,
    "missing_ok": missing_ok,
    "missing_checks": missing_checks,
}))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.ok).toBe(true);
    expect(report.checks.advisory).toMatchObject({
      amountMatchRate: false,
      stepCoverage: false,
    });
    expect(report.missing_ok).toBe(false);
    expect(report.missing_checks.missing_result_count).toBe(false);
  });

  it("builds guarded semantic reason aggregation prompts without dropping one-off issues", async () => {
    const aggregator = await import(semanticFeedbackModuleUrl);
    const reasons = [
      "양념류 누락과 분량 오차",
      "양념류 누락과 분량 오차",
      "단계 순서 이탈",
    ];

    const prompt = aggregator.buildReasonAggregationPrompt({
      split: "validation",
      videoId: "case-a",
      sampleN: 3,
      reasons,
    });
    const summary = aggregator.summarizeReasonFrequencies({ reasons, sampleN: 3 });
    const grounded = aggregator.guardAggregatedReasonOutput({
      reasons,
      output: "- (2/3) 양념류 누락과 분량 오차\n- (1/3) 단계 순서 이탈",
    });
    const hallucinated = aggregator.guardAggregatedReasonOutput({
      reasons,
      output: "- (1/3) 조리도구 문제",
    });

    expect(prompt).toContain("점수를 매기지 마라");
    expect(prompt).toContain("validation/holdout");
    expect(prompt).toContain("구체 재료");
    expect(summary).toEqual([
      { label: "2/3", count: 2, text: "양념류 누락과 분량 오차" },
      { label: "1/3", count: 1, text: "단계 순서 이탈" },
    ]);
    expect(grounded.success).toBe(true);
    expect(hallucinated.success).toBe(false);
    expect(hallucinated.ungrounded).toContain("조리도구");
  });

  it("keeps short protected titles as fragments while classifying low-uniqueness hits as advisory", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"

def write_golden(split, video_id, title, step):
    path = loop.DATA_ROOT / split / video_id / "golden.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "schemaVersion": 1,
        "videoId": video_id,
        "reviewStatus": "approved",
        "recipes": [{
            "title": title,
            "ingredients": [{"name": "고추다대기", "nameAliases": ["공용별칭"], "amount": "1", "unit": "큰술"}],
            "steps": [{"order": 1, "instruction": step}],
        }],
    }, ensure_ascii=False), encoding="utf-8")

write_golden("train", "train-a", "다시마 고추다대기", "공개 train 손질 단계입니다")
write_golden("validation", "val-a", "고추다대기", "검증 고유 긴 조리 문장입니다")
write_golden("validation", "val-b", "잡채", "잡채 고유 긴 조리 문장입니다")
fragments = loop.protected_answer_fragments(["validation"])
titles = [f["value"] for f in fragments if f["category"] == "recipe_title"]
scan_public = loop.scan_texts_for_protected_answers([{"scope": "06_diagnosis_prompt", "text": "약점 케이스: 다시마 고추다대기"}], fragments)
scan_short_unique = loop.scan_texts_for_protected_answers([{"scope": "06_diagnosis_prompt", "text": "잡채"}], fragments)
print(json.dumps({
    "titles": titles,
    "scan_public": scan_public,
    "scan_short_unique": scan_short_unique,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.titles).not.toContain("고추다대기");
    expect(report.titles).toContain("잡채");
    expect(report.scan_public.success).toBe(true);
    expect(report.scan_short_unique.success).toBe(true);
    expect(report.scan_short_unique.blocking_hit_count).toBe(0);
    expect(report.scan_short_unique.advisory_hit_count).toBeGreaterThan(0);
  });

  it("keeps canary and holdout-only step leaks as hard failures while low-uniqueness artifact hits stay advisory", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"

def write_golden(split, video_id, title, alias, step, canary=None):
    path = loop.DATA_ROOT / split / video_id / "golden.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "videoId": video_id,
        "reviewStatus": "approved",
        "recipes": [{
            "title": title,
            "ingredients": [{"name": title + "재료", "nameAliases": [alias], "amount": "1", "unit": "큰술"}],
            "steps": [{"order": 1, "instruction": step}],
        }],
    }
    if canary:
        payload["_canary"] = canary
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

write_golden("train", "train-a", "공개요리", "공용별칭", "공개 train step instruction 입니다")
write_golden("validation", "val-a", "검증요리", "검증별칭", "검증 split 자기 산출물 문장입니다")
write_golden("holdout", "hold-a", "홀드요리", "공용별칭", "홀드아웃에만 있는 아주 긴 조리 문장입니다", "CANARY::holdout::hold-a::unit")
fragments = loop.protected_answer_fragments(["validation", "holdout"])
canary_scan = loop.scan_texts_for_protected_answers([{"scope": "01_plan.md", "text": "CANARY::holdout::hold-a::unit"}], fragments)
validation_artifact = loop.scan_texts_for_protected_answers([
    {"scope": "validation/case/runs/iter01/grade_semantic.json", "text": "검증 split 자기 산출물 문장입니다", "gate": False, "artifact_split": "validation"}
], fragments)
shared_alias_artifact = loop.scan_texts_for_protected_answers([
    {"scope": "validation/case/runs/iter01/grade_semantic.json", "text": "공용별칭", "gate": False, "artifact_split": "validation"}
], fragments)
holdout_step_artifact = loop.scan_texts_for_protected_answers([
    {"scope": "validation/case/runs/iter01/grade_semantic.json", "text": "홀드아웃에만 있는 아주 긴 조리 문장입니다", "gate": False, "artifact_split": "validation"}
], fragments)
print(json.dumps({
    "canary_scan": canary_scan,
    "validation_artifact": validation_artifact,
    "shared_alias_artifact": shared_alias_artifact,
    "holdout_step_artifact": holdout_step_artifact,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.canary_scan.success).toBe(false);
    expect(report.canary_scan.primary_canary_hit_count).toBe(1);
    expect(report.validation_artifact.success).toBe(true);
    expect(report.validation_artifact.informational_hit_count).toBeGreaterThan(0);
    expect(report.shared_alias_artifact.success).toBe(true);
    expect(report.shared_alias_artifact.advisory_hit_count).toBeGreaterThan(0);
    expect(report.holdout_step_artifact.success).toBe(false);
    expect(report.holdout_step_artifact.secondary_hard_hit_count).toBe(1);
  });

  it("treats generic and shared cooking vocabulary as advisory across module and agent-facing scans", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"

def write_golden(split, video_id, recipes):
    path = loop.DATA_ROOT / split / video_id / "golden.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"schemaVersion": 1, "videoId": video_id, "reviewStatus": "approved", "recipes": recipes}, ensure_ascii=False), encoding="utf-8")

# 식용유: train 재료명(다수) + validation 별칭(cross-category 공용 어휘). 카레: holdout 단일 짧은 토큰.
write_golden("train", "train-a", [{"title": "공개 볶음", "ingredients": [{"name": "식용유", "amount": "1", "unit": "큰술"}], "steps": [{"order": 1, "instruction": "공개 조리 문장 하나"}]}])
write_golden("train", "train-b", [{"title": "공개 무침", "ingredients": [{"name": "식용유", "amount": "1", "unit": "큰술"}], "steps": [{"order": 1, "instruction": "다른 공개 조리 문장"}]}])
write_golden("validation", "val-a", [{"title": "검증 고유 요리", "ingredients": [{"name": "콩기름", "nameAliases": ["식용유"], "amount": "1", "unit": "큰술"}, {"name": "감칠맛가루", "nameAliases": ["MSG"], "amount": "1", "unit": "꼬집"}, {"name": "비밀고유재료세트", "amount": "1", "unit": "개"}], "steps": [{"order": 1, "instruction": "검증 고유 조리 문장"}]}])
write_golden("holdout", "hold-a", [{"title": "홀드 요리", "ingredients": [{"name": "카레", "amount": "1", "unit": "개"}], "steps": [{"order": 1, "instruction": "홀드 고유 조리 문장"}]}])

fragments = loop.protected_answer_fragments(["validation", "holdout"])
module_like = "const DISH_WORD_RE = /카레|수프/; const STOP = new Set(['식용유', '소금', 'MSG']);"
module_scan = loop.scan_texts_for_protected_answers([{"scope": "recipe_extraction_lab_modules", "text": module_like, "module_source": True}], fragments)
module_unique = loop.scan_texts_for_protected_answers([{"scope": "recipe_extraction_lab_modules", "text": "비밀고유재료세트", "module_source": True}], fragments)
prompt_generic = loop.scan_texts_for_protected_answers([{"scope": "06_diagnosis_prompt", "text": "카레 식용유 MSG"}], fragments)
prompt_unique = loop.scan_texts_for_protected_answers([{"scope": "06_diagnosis_prompt", "text": "비밀고유재료세트"}], fragments)
print(json.dumps({"module": module_scan, "module_unique": module_unique, "prompt": prompt_generic, "prompt_unique": prompt_unique}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.module.blocking_hit_count).toBe(0);
    expect(report.module.success).toBe(true);
    expect(report.module.advisory_hit_count).toBeGreaterThan(0);
    expect(report.module_unique.success).toBe(false);
    expect(report.module_unique.blocking_hit_count).toBeGreaterThan(0);
    expect(report.prompt.success).toBe(true);
    expect(report.prompt.blocking_hit_count).toBe(0);
    expect(report.prompt.advisory_hit_count).toBeGreaterThan(0);
    expect(report.prompt_unique.success).toBe(false);
    expect(report.prompt_unique.blocking_hit_count).toBeGreaterThan(0);
  });

  it("fails the loop decision when protected answers appear in decision or log outputs", () => {
    const result = runLoopPython(`
fragments = loop.protected_answer_fragments(["validation"])
target = next(f for f in fragments if f["category"] in ("recipe_title", "ingredient_name", "ingredient_quantity", "step_instruction"))
scan = loop.scan_texts_for_protected_answers([
    {"scope": "05_decision_payload", "text": target["value"]},
    {"scope": "agent_log", "text": target["value"]},
], fragments)
cfg = loop.LoopConfig()
summaries = {
    "det": {"aggregate": {}},
    "ai": {"aggregate": {}},
    "val_det": {"aggregate": {
        "success": True,
        "ingredientF1": 0.92,
        "amountMatchRate": 0.85,
        "stepCoverage": 0.85,
        "recipeCountMatchRate": 0.95,
        "missing_result_count": 0,
        "missing_golden_count": 0,
        "unapproved_golden_count": 0,
        "expected_count_mismatch": False,
    }},
    "val_ai": {"aggregate": {
        "success": True,
        "judge_provider": "codex",
        "judge_model": "gpt-5.4",
        "judge_effort": "high",
        "calibration": {"valid": True},
        "provider_error_count": 0,
        "parse_error_count": 0,
        "schema_error_count": 0,
        "timeout_error_count": 0,
        "calibration_error_count": 0,
        "empty_case_count": 0,
        "expected_count_mismatch": False,
        "threshold_success": True,
        "score_policy": "bottomK-mean",
        "bottom_k": 2,
        "sampleN": 3,
        "judge_prompt_version": "semantic-judge-v3-anchored",
        "thresholds": {"averageScore": 4, "bottomKMeanScore": 3.5},
        "averageScore": 4.3,
        "minCaseScore": 4,
        "bottomKMeanScore": 4,
    }},
}
decision = loop.decide(cfg, summaries, {
    "subprocess_health": {"success": True},
    "leakage_guard": {"success": scan["success"], "output_redaction_scan": scan},
})
payload = {"scan": scan, "decision": decision}
print(json.dumps({
    "payload": payload,
    "raw_leaked": target["value"] in json.dumps(payload, ensure_ascii=False),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.payload.scan.success).toBe(false);
    expect(report.payload.scan.hit_count).toBeGreaterThanOrEqual(2);
    expect(report.payload.scan.scanned_scopes).toEqual(
      expect.arrayContaining(["05_decision_payload", "agent_log"]),
    );
    expect(report.payload.decision.passed).toBe(false);
    expect(report.payload.decision.checks.leakage_guard).toBe(false);
    expect(report.raw_leaked).toBe(false);
  });

  it("combines grader canary leak summaries without reimplementing token matching in loop.py", () => {
    const result = runLoopPython(`
def det_agg(canary_status, canary_success):
    return {
        "success": True,
        "ingredientF1": 0.92,
        "amountMatchRate": 0.85,
        "stepCoverage": 0.85,
        "recipeCountMatchRate": 1,
        "missing_result_count": 0,
        "missing_golden_count": 0,
        "unapproved_golden_count": 0,
        "expected_count_mismatch": False,
        "canaryLeak": {"status": canary_status, "success": canary_success, "hit_count": 0, "hits": [], "redacted_hits": []},
    }

def sem_agg(canary_status, canary_success):
    return {
        "success": True,
        "judge_provider": "codex",
        "judge_model": "gpt-5.4",
        "judge_effort": "high",
        "calibration": {"valid": True},
        "provider_error_count": 0,
        "parse_error_count": 0,
        "schema_error_count": 0,
        "timeout_error_count": 0,
        "calibration_error_count": 0,
        "empty_case_count": 0,
        "expected_count_mismatch": False,
        "threshold_success": True,
        "score_policy": "bottomK-mean",
        "bottom_k": 2,
        "sampleN": 3,
        "judge_prompt_version": "semantic-judge-v3-anchored",
        "thresholds": {"averageScore": 4, "bottomKMeanScore": 3.5},
        "averageScore": 4.3,
        "minCaseScore": 4,
        "bottomKMeanScore": 4,
        "canaryLeak": {"status": canary_status, "success": canary_success, "hit_count": 0, "hits": [], "redacted_hits": []},
    }

cfg = loop.LoopConfig()
clean_summaries = {
    "det": {"aggregate": det_agg("not_applicable", True)},
    "ai": {"aggregate": sem_agg("not_applicable", True)},
    "val": {"aggregate": det_agg("clean", True)},
    "val_det": {"aggregate": det_agg("clean", True)},
    "val_ai": {"aggregate": sem_agg("clean", True)},
}
covered_scan = loop.canary_token_scan_from_summaries(clean_summaries)
covered_guard = {"success": covered_scan["success"], "canary_token_scan": covered_scan, "output_redaction_scan": {"success": True}}
covered_decision = loop.decide(cfg, clean_summaries, {"subprocess_health": {"success": True}, "leakage_guard": covered_guard})

not_covered_summaries = {
    "det": {"aggregate": det_agg("not_applicable", True)},
    "ai": {"aggregate": sem_agg("not_applicable", True)},
    "val": {"aggregate": det_agg("not_covered", False)},
    "val_det": {"aggregate": det_agg("not_covered", False)},
    "val_ai": {"aggregate": sem_agg("not_covered", False)},
}
not_covered_scan = loop.canary_token_scan_from_summaries(not_covered_summaries)
not_covered_guard = {"success": not_covered_scan["success"], "canary_token_scan": not_covered_scan, "output_redaction_scan": {"success": True}}
not_covered_decision = loop.decide(cfg, not_covered_summaries, {"subprocess_health": {"success": True}, "leakage_guard": not_covered_guard})

leak_summaries = {
    "det": {"aggregate": det_agg("not_applicable", True)},
    "ai": {"aggregate": sem_agg("not_applicable", True)},
    "val": {"aggregate": det_agg("leak_detected", False)},
    "val_det": {"aggregate": {**det_agg("leak_detected", False), "canaryLeak": {"status": "leak_detected", "success": False, "hit_count": 1, "hits": [{"scope": "validation/YZ8KSZboJeM/runs/latest/result.json", "split": "validation", "videoId": "YZ8KSZboJeM", "canaryId": "canary_validation_YZ8KSZboJeM_01", "category": "ingredient_name"}], "redacted_hits": ["leak canary token redacted"]}}},
    "val_ai": {"aggregate": {**sem_agg("leak_detected", False), "canaryLeak": {"status": "leak_detected", "success": False, "hit_count": 1, "hits": [{"scope": "validation/YZ8KSZboJeM/runs/latest/result.json", "split": "validation", "videoId": "YZ8KSZboJeM", "canaryId": "canary_validation_YZ8KSZboJeM_01", "category": "ingredient_name"}], "redacted_hits": ["leak canary token redacted"]}}},
}
leak_scan = loop.canary_token_scan_from_summaries(leak_summaries)
leak_guard = {"success": leak_scan["success"], "canary_token_scan": leak_scan, "output_redaction_scan": {"success": True}}
leak_decision = loop.decide(cfg, leak_summaries, {"subprocess_health": {"success": True}, "leakage_guard": leak_guard})

print(json.dumps({
    "covered_scan": covered_scan,
    "covered_decision": covered_decision,
    "not_covered_scan": not_covered_scan,
    "not_covered_decision": not_covered_decision,
    "leak_scan": leak_scan,
    "leak_decision": leak_decision,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.covered_scan).toMatchObject({ success: true, status: "clean" });
    expect(report.covered_decision.checks.leakage_guard).toBe(true);
    expect(report.not_covered_scan).toMatchObject({ success: false, status: "not_covered" });
    expect(report.not_covered_decision.checks.leakage_guard).toBe(false);
    expect(report.leak_scan).toMatchObject({ success: false, status: "leak_detected", hit_count: 1 });
    expect(report.leak_decision.checks.leakage_guard).toBe(false);
    expect(JSON.stringify(report)).not.toContain(validationCanaryName);
  });

  it("tracks holdout one-time consumption and scans nested run artifacts without raw leaks", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
fragments = loop.protected_answer_fragments(["validation"])
target = fragments[0]["value"]
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
loop.DATA_ROOT.mkdir(parents=True, exist_ok=True)
status_before = loop.holdout_consumption_status()
loop.write_holdout_consumed_marker("final-smoke", {"success": False, "reason": "unit"}, dry_run=False)
status_after = loop.holdout_consumption_status()
blocked = False
try:
    loop.assert_holdout_not_consumed()
except RuntimeError:
    blocked = True
artifact_dir = root / "run-artifacts" / "iteration-01" / "nested"
artifact_dir.mkdir(parents=True, exist_ok=True)
(artifact_dir / "agent.log").write_text(target, encoding="utf-8")
scan = loop.scan_directory_for_protected_answers(root / "run-artifacts", fragments)
print(json.dumps({
    "status_before": status_before,
    "status_after": status_after,
    "blocked": blocked,
    "scan": scan,
    "raw_leaked": target in json.dumps(scan, ensure_ascii=False),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.status_before.consumed).toBe(false);
    expect(report.status_after).toMatchObject({ consumed: true, out_tag: "final-smoke" });
    expect(report.blocked).toBe(true);
    expect(report.scan.success).toBe(false);
    expect(report.raw_leaked).toBe(false);
  });

  it("reports persisted semantic grade artifact fragments as informational instead of gate failures", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
fragments = loop.protected_answer_fragments(["validation"])
target = next(f for f in fragments if f["category"] in ("recipe_title", "ingredient_name", "ingredient_quantity", "step_instruction"))
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
artifact = loop.DATA_ROOT / "validation" / "case-a" / "runs" / "latest" / "grade_semantic.json"
artifact.parent.mkdir(parents=True, exist_ok=True)
artifact.write_text(target["value"], encoding="utf-8")
summary = loop.DATA_ROOT / "validation" / "_semantic_summary.latest.json"
summary.parent.mkdir(parents=True, exist_ok=True)
summary.write_text(target["value"], encoding="utf-8")
scan = loop.scan_semantic_artifacts_for_protected_answers("validation", "latest", fragments)
print(json.dumps({
    "scan": scan,
    "raw_leaked": target["value"] in json.dumps(scan, ensure_ascii=False),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.scan.success).toBe(true);
    expect(report.scan.hit_count).toBeGreaterThanOrEqual(2);
    expect(report.scan.informational_hit_count).toBeGreaterThanOrEqual(2);
    expect(report.scan.scanned_scopes).toEqual(
      expect.arrayContaining([
        "validation/case-a/runs/latest/grade_semantic.json",
        "validation/_semantic_summary.latest.json",
      ]),
    );
    expect(report.raw_leaked).toBe(false);
  });

  it("only authorizes the holdout from a genuine passing run-artifact decision", () => {
    const result = runLoopPython(`
import json
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
loop.DATA_ROOT.mkdir(parents=True, exist_ok=True)
loop.RUN_ROOT = root / "notebooks" / "recipe_loop_runs"

ALL_PASS = {axis: True for axis in loop.GATE_AXES}
ONE_FAIL = {**ALL_PASS, "deterministic_validation": False}

def decision_file(run, passed, axes):
    d = loop.RUN_ROOT / run / "iteration-01"
    d.mkdir(parents=True, exist_ok=True)
    p = d / "05_decision.json"
    p.write_text(json.dumps({
        "run_mode": "offline_snapshot_eval",
        "gate_mode": "local_hardening",
        "passed": passed,
        "checks": axes,
    }), encoding="utf-8")
    return p

def refused(**kwargs):
    try:
        loop.run_holdout_final(dry_run=False, **kwargs)
        return False
    except RuntimeError:
        return True

refused_no_decision = refused(out_tag="t1", validation_decision_path=None)

# passed:true but outside the run-artifact path → refused (path guard)
fake = root / "fake_decision.json"
fake.write_text(json.dumps({"gate_mode": "local_hardening", "passed": True, "checks": ALL_PASS}), encoding="utf-8")
refused_fake_path = refused(out_tag="t2", validation_decision_path=str(fake))

# real-artifact path but malformed decision shape → refused (shape guard)
malformed_path = loop.RUN_ROOT / "run-malformed" / "iteration-01" / "05_decision.json"
malformed_path.parent.mkdir(parents=True, exist_ok=True)
malformed_path.write_text(json.dumps([{"passed": True}]), encoding="utf-8")
malformed = loop.load_validation_decision(str(malformed_path))

# real-artifact shape but one gate axis failed → refused (axis check)
fail_path = decision_file("run-fail", False, ONE_FAIL)
refused_failed_axis = refused(out_tag="t3", validation_decision_path=str(fail_path))

marker_after_refusal = loop.holdout_marker_path().exists()

# genuine passing run-artifact decision → dry-run preview authorized
pass_path = decision_file("run-pass", True, ALL_PASS)
preview = loop.run_holdout_final(out_tag="t4", dry_run=True, validation_decision_path=str(pass_path))

print(json.dumps({
    "refused_no_decision": refused_no_decision,
    "refused_fake_path": refused_fake_path,
    "malformed_passed": malformed["passed"],
    "malformed_reason": malformed["reason"],
    "refused_failed_axis": refused_failed_axis,
    "marker_after_refusal": marker_after_refusal,
    "preview_validation_passed": preview["validation_passed"],
    "preview_decision_path": preview["validation_decision_path"],
    "marker_after_dry": loop.holdout_marker_path().exists(),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.refused_no_decision).toBe(true);
    expect(report.refused_fake_path).toBe(true);
    expect(report.malformed_passed).toBe(false);
    expect(report.malformed_reason).toBe("file is not a decision object");
    expect(report.refused_failed_axis).toBe(true);
    expect(report.marker_after_refusal).toBe(false);
    expect(report.preview_validation_passed).toBe(true);
    expect(report.preview_decision_path).toContain("05_decision.json");
    expect(report.marker_after_dry).toBe(false);
  });

  it("preclaims holdout consumption before running subprocesses", () => {
    const result = runLoopPython(`
import json
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
loop.DATA_ROOT.mkdir(parents=True, exist_ok=True)
loop.RUN_ROOT = root / "notebooks" / "recipe_loop_runs"

ALL_PASS = {axis: True for axis in loop.GATE_AXES}
decision_dir = loop.RUN_ROOT / "run-pass" / "iteration-01"
decision_dir.mkdir(parents=True, exist_ok=True)
pass_path = decision_dir / "05_decision.json"
pass_path.write_text(json.dumps({
    "run_mode": "offline_snapshot_eval",
    "gate_mode": "local_hardening",
    "passed": True,
    "checks": ALL_PASS,
}), encoding="utf-8")

def boom(*args, **kwargs):
    raise RuntimeError("subprocess boom")

loop.run_node = boom
failed = False
try:
    loop.run_holdout_final(out_tag="preclaim-smoke", dry_run=False, validation_decision_path=str(pass_path))
except RuntimeError:
    failed = True

marker_exists = loop.holdout_marker_path().exists()
payload = json.loads(loop.holdout_marker_path().read_text(encoding="utf-8")) if marker_exists else {}
second_refused = False
try:
    loop.run_holdout_final(out_tag="preclaim-smoke-2", dry_run=False, validation_decision_path=str(pass_path))
except RuntimeError:
    second_refused = True

print(json.dumps({
    "failed": failed,
    "marker_exists": marker_exists,
    "status": payload.get("status"),
    "out_tag": payload.get("out_tag"),
    "success": payload.get("success"),
    "validation_passed": payload.get("validation_passed"),
    "preclaimed_at": payload.get("preclaimed_at"),
    "second_refused": second_refused,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.failed).toBe(true);
    expect(report.marker_exists).toBe(true);
    expect(report.status).toBe("failed");
    expect(report.out_tag).toBe("preclaim-smoke");
    expect(report.success).toBe(false);
    expect(report.validation_passed).toBe(true);
    expect(report.preclaimed_at).toBeTruthy();
    expect(report.second_refused).toBe(true);
  });

  it("builds protected answer fingerprints beyond step instructions and redacts scan hits", () => {
    const result = runLoopPython(`
fragments = loop.protected_answer_fragments(["validation"])
categories = sorted(set(f["category"] for f in fragments))
target = next(f for f in fragments if f["category"] in ("recipe_title", "ingredient_name", "ingredient_alias", "ingredient_quantity"))
scan = loop.scan_texts_for_protected_answers([{"scope": "unit", "text": target["value"]}], fragments)
payload = {"categories": categories, "target_value": target["value"], "scan": scan}
print(json.dumps(payload, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.categories).toEqual(
      expect.arrayContaining(["ingredient_name", "ingredient_quantity", "recipe_title", "step_instruction"]),
    );
    expect(payload.scan.success).toBe(false);
    expect(JSON.stringify(payload.scan)).not.toContain(payload.target_value);
  });

  it("creates an implementation workspace with only allowlisted files", () => {
    const result = runLoopPython(`
import shutil
workspace = loop.create_codex_implementation_workspace()
files = sorted(str(p.relative_to(workspace)) for p in workspace.rglob("*") if p.is_file())
forbidden_exists = any((workspace / forbidden).exists() for forbidden in [
    ".git",
    "notebooks/recipe_loop_data/train",
    "notebooks/recipe_loop_data/validation",
    "notebooks/recipe_loop_data/holdout",
])
print(json.dumps({
    "files": files,
    "forbidden_exists": forbidden_exists,
    "workspace": str(workspace),
}, ensure_ascii=False))
shutil.rmtree(workspace, ignore_errors=True)
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.files).toEqual(
      expect.arrayContaining([
        "lib/server/recipe-extraction-lab/extract.mjs",
        "lib/server/recipe-extraction-lab/prompt.mjs",
        "package.json",
      ]),
    );
    expect(report.files.some((file: string) => file.startsWith("notebooks/recipe_loop_data/"))).toBe(false);
    expect(report.forbidden_exists).toBe(false);
  });

  it("treats train as public diagnostic data outside the implementation forbidden access guard", () => {
    const result = runLoopPython(`
markers = loop.implementation_forbidden_path_markers()
print(json.dumps({
    "has_train": any("notebooks/recipe_loop_data/train" in marker for marker in markers),
    "has_validation": any("notebooks/recipe_loop_data/validation" in marker for marker in markers),
    "has_holdout": any("notebooks/recipe_loop_data/holdout" in marker for marker in markers),
    "has_runs": any("notebooks/recipe_loop_runs" in marker for marker in markers),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.has_train).toBe(false);
    expect(report.has_validation).toBe(true);
    expect(report.has_holdout).toBe(true);
    expect(report.has_runs).toBe(true);
  });

  it("normalizes missing fs_usage logs without losing required scanner keys", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "missing.log"
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps({
    "scan": scan,
    "classification": classification,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.scan).toMatchObject({
      success: false,
      reason: "fs_usage_log_missing",
      forbidden_line_count: 0,
      forbidden_lines: [],
    });
    expect(report.classification.status).toBe("monitoring_unavailable");
    expect(report.classification.reason).toBe("fs_usage_log_missing");
  });

  it("treats fs_usage exiting during implementation as monitoring_unavailable", () => {
    const result = runLoopPython(`
scan = {"success": True, "reason": "ok", "forbidden_line_count": 0, "forbidden_lines": [], "log_path": "audit.log"}
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [],
    {"success": True, "started": True},
    {"success": False, "reason": "fs_usage_exited_during_implementation", "returncode": 1},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("monitoring_unavailable");
    expect(classification.reason).toBe("fs_usage_exited_during_implementation");
  });

  it("does not treat guard-requested fs_usage termination as a monitoring failure", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-stop-")) / "audit.log"
log_file = log_path.open("w", encoding="utf-8")
proc = loop.subprocess.Popen([loop.sys.executable, "-c", "import time; time.sleep(30)"], stdout=log_file, stderr=loop.subprocess.STDOUT, text=True)
stop = loop.stop_fs_usage_audit({"process": proc, "log_file": log_file, "log_path": "audit.log"})
print(json.dumps(stop, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const stop = JSON.parse(result.stdout);
    expect(stop.success).toBe(true);
    expect(stop.reason).toBe("ok");
  });

  it("detects and redacts forbidden validation paths from fs_usage audit logs", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
train_path = loop.DATA_ROOT / "train" / "public-case" / "golden.json"
log_path.write_text(
    f"12:00:00 open {validation_path}\\n12:00:01 open {train_path}\\n",
    encoding="utf-8",
)
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
print(json.dumps({
    "success": scan["success"],
    "forbidden_line_count": scan["forbidden_line_count"],
    "marker_kind": scan["forbidden_lines"][0]["marker_kind"],
    "has_raw_validation_path": str(validation_path) in json.dumps(scan, ensure_ascii=False),
    "has_raw_train_path": str(train_path) in json.dumps(scan, ensure_ascii=False),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.success).toBe(true);
    expect(report.forbidden_line_count).toBe(1);
    expect(report.marker_kind).toBe("protected");
    expect(report.has_raw_validation_path).toBe(false);
    expect(report.has_raw_train_path).toBe(false);
  });

  it("keeps scanner output for forbidden lines outside the implementation PID subtree", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
holdout_path = loop.DATA_ROOT / "holdout" / "case-b" / "golden.json"
log_path.write_text(
    f"12:00:00 open {validation_path} Spotlight.999\\n"
    f"12:00:01 open {validation_path} codex.1234\\n"
    f"12:00:02 open {holdout_path} node.1235\\n",
    encoding="utf-8",
)
scan = loop.scan_fs_usage_log_for_forbidden_access(
    log_path,
    allowed_pids={1234, 1235},
    pid_subtree={
        "processes": [
            {"pid": 1234, "ppid": 1, "command": "codex"},
            {"pid": 1235, "ppid": 1234, "command": "node"},
        ],
    },
)
print(json.dumps({
    "success": scan["success"],
    "forbidden_line_count": scan["forbidden_line_count"],
    "pids": [line["process_pid"] for line in scan["forbidden_lines"]],
    "has_raw_validation_path": str(validation_path) in json.dumps(scan, ensure_ascii=False),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.success).toBe(true);
    expect(report.forbidden_line_count).toBe(3);
    expect(report.pids).toEqual([999, 1234, 1235]);
    expect(report.has_raw_validation_path).toBe(false);
  });

  it("ignores known external protected-path noise seen in the snapshot history", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
log_path.write_text(f"12:00:00 open {validation_path} Spotlight.999\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [{"pid": 999, "ppid": 1, "command": "Spotlight"}],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("ok");
    expect(classification.ignored_known_external_protected_line_count).toBe(1);
  });

  it("ignores current run artifacts even when RUN_ROOT is a protected marker", () => {
    const result = runLoopPython(`
import tempfile
current_run_dir = loop.RUN_ROOT / "current-test-run"
current_iter_dir = current_run_dir / "iter_01"
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
implementation_log = current_iter_dir / "02_implementation.log"
log_path.write_text(f"12:00:00 write {implementation_log} python3.1234\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path, current_run_dirs=[current_run_dir, current_iter_dir])
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "python3"}]},
    [{"pid": 1234, "ppid": 1, "command": "python3"}],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("ok");
    expect(classification.codex_subtree_hit_count).toBe(0);
    expect(classification.ignored_line_count).toBe(1);
  });

  it("ignores external .git access when the PID was seen in snapshot history", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
git_path = loop.PROJECT_ROOT / ".git" / "index"
log_path.write_text(f"12:00:00 open {git_path} git.4321\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [{"pid": 4321, "ppid": 1, "command": "git"}],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("ok");
    expect(classification.ignored_line_count).toBe(1);
  });

  it("reports degraded_advisory for external protected marker access outside the Codex subtree", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
log_path.write_text(f"12:00:00 open {validation_path} python3.4325\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [{"pid": 4325, "ppid": 1, "command": "python3"}],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("degraded_advisory");
    expect(classification.external_protected_line_count).toBe(1);
  });

  it("reports degraded_advisory for unattributable protected marker access regardless of process name", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
holdout_path = loop.DATA_ROOT / "holdout" / "case-b" / "golden.json"
cache_path = loop.DATA_ROOT / "cache" / "entry.json"
review_path = loop.DATA_ROOT / "REVIEW_validation.md"
semantic_path = loop.DATA_ROOT / "semantic_calibration.json"
past_run_path = loop.RUN_ROOT / "old-run" / "iter_01" / "05_decision.json"
log_path.write_text(
    f"12:00:00 open {validation_path} git.4322\\n"
    f"12:00:01 open {holdout_path} sh.4323\\n"
    f"12:00:02 open {cache_path} python3.4324\\n"
    f"12:00:03 open {review_path} sh.4326\\n"
    f"12:00:04 open {semantic_path} python3.4327\\n"
    f"12:00:05 open {past_run_path} git.4328\\n",
    encoding="utf-8",
)
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("degraded_advisory");
    expect(classification.unattributable_protected_line_count).toBe(6);
  });

  it("classifies recipe loop graders and orchestrators as known external protected readers", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
log_path.write_text(
    f"12:00:00 open {validation_path} node.4325\\n"
    f"12:00:01 open {validation_path} python3.4326\\n",
    encoding="utf-8",
)
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [
        {"pid": 4325, "ppid": 1, "command": "node scripts/recipe-loop/grade-semantic.mjs"},
        {"pid": 4326, "ppid": 1, "command": "python3 scripts/recipe-loop/loop.py"},
    ],
    {"success": True},
    {"success": True, "reason": "ok"},
)
notification = loop.send_implementation_access_guard_alert({"access_guard_status": classification["status"]})
print(json.dumps({"classification": classification, "notification": notification}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.classification.status).toBe("ok");
    expect(report.classification.ignored_known_external_protected_line_count).toBe(2);
    expect(report.notification).toMatchObject({ sent: false, reason: "not_required" });
  });

  it("warns when Codex or its child process accesses a protected marker", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
validation_path = loop.DATA_ROOT / "validation" / "case-a" / "golden.json"
holdout_path = loop.DATA_ROOT / "holdout" / "case-b" / "golden.json"
log_path.write_text(
    f"12:00:00 open {validation_path} codex.1234\\n"
    f"12:00:01 open {holdout_path} node.1235\\n",
    encoding="utf-8",
)
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234, 1235], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}, {"pid": 1235, "ppid": 1234, "command": "node"}]},
    [{"pid": 1234, "ppid": 1, "command": "codex"}, {"pid": 1235, "ppid": 1234, "command": "node"}],
    {"success": True},
    {"success": True, "reason": "ok"},
)
print(json.dumps(classification, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const classification = JSON.parse(result.stdout);
    expect(classification.status).toBe("warning");
    expect(classification.codex_subtree_hit_count).toBe(2);
  });

  it("keeps unattributable .git-only noise out of Discord-triggering guard statuses", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
git_path = loop.PROJECT_ROOT / ".git" / "index"
log_path.write_text(f"12:00:00 open {git_path} git.9999\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
classification = loop.classify_implementation_access_guard(
    scan,
    {"success": True, "pids": [1234], "processes": [{"pid": 1234, "ppid": 1, "command": "codex"}]},
    [],
    {"success": True},
    {"success": True, "reason": "ok"},
)
notification = loop.send_implementation_access_guard_alert({"access_guard_status": classification["status"]})
print(json.dumps({"classification": classification, "notification": notification}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.classification.status).toBe("ok");
    expect(report.classification.unknown_git_line_count).toBe(1);
    expect(report.notification).toMatchObject({ sent: false, reason: "not_required" });
  });

  it("does not confuse .github paths with the protected .git marker", () => {
    const result = runLoopPython(`
import tempfile
log_path = loop.Path(tempfile.mkdtemp(prefix="fs-usage-audit-")) / "02_fs_audit.log"
github_path = loop.PROJECT_ROOT / ".github" / "workflows" / "ci.yml"
log_path.write_text(f"12:00:00 open {github_path} sh.7777\\n", encoding="utf-8")
scan = loop.scan_fs_usage_log_for_forbidden_access(log_path)
print(json.dumps(scan, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const scan = JSON.parse(result.stdout);
    expect(scan.success).toBe(true);
    expect(scan.forbidden_line_count).toBe(0);
    expect(scan.forbidden_lines).toEqual([]);
  });

  it("records implementation access guard warnings as non-fatal iteration metadata", () => {
    const result = runLoopPython(`
import tempfile
root = loop.Path(tempfile.mkdtemp(prefix="access-guard-payload-"))
payload = loop.implementation_access_guard_payload(
    "warning",
    "forbidden_golden_path_access_suspected",
    root / "02_fs_audit.log",
    root / "02_fs_audit_hits.json",
    hit_count=2,
    representative_hit={"process_pid": 1234, "process_name": "codex"},
)
print(json.dumps(payload, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.access_guard_status).toBe("warning");
    expect(payload.passed).toBe(false);
    expect(payload.continues_iteration).toBe(true);
    expect(payload.reason).toBe("forbidden_golden_path_access_suspected");
    expect(payload.hit_log_path).toContain("02_fs_audit_hits.json");
  });

  it("keeps implementation access guard status out of hard decision checks", () => {
    const result = runLoopPython(`
cfg = loop.LoopConfig()
summaries = {
    "det": {"aggregate": {}},
    "ai": {"aggregate": {}},
    "val_det": {"aggregate": {
        "success": True,
        "ingredientF1": 0.92,
        "amountMatchRate": 0.85,
        "stepCoverage": 0.85,
        "recipeCountMatchRate": 0.95,
        "missing_result_count": 0,
        "missing_golden_count": 0,
        "unapproved_golden_count": 0,
        "expected_count_mismatch": False,
    }},
    "val_ai": {"aggregate": {
        "success": True,
        "judge_provider": "codex",
        "judge_model": "gpt-5.4",
        "judge_effort": "high",
        "calibration": {"valid": True},
        "provider_error_count": 0,
        "parse_error_count": 0,
        "schema_error_count": 0,
        "timeout_error_count": 0,
        "calibration_error_count": 0,
        "empty_case_count": 0,
        "expected_count_mismatch": False,
        "threshold_success": True,
        "score_policy": "bottomK-mean",
        "bottom_k": 2,
        "sampleN": 3,
        "judge_prompt_version": "semantic-judge-v3-anchored",
        "thresholds": {"averageScore": 4, "bottomKMeanScore": 3.5},
        "averageScore": 4.3,
        "minCaseScore": 4,
        "bottomKMeanScore": 4,
    }},
}
decision = loop.decide(cfg, summaries, {
    "subprocess_health": {"success": True},
    "leakage_guard": {"success": True},
    "implementation_access_guard": {"access_guard_status": "monitoring_unavailable", "continues_iteration": True},
})
print(json.dumps(decision, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const decision = JSON.parse(result.stdout);
    expect(decision.passed).toBe(true);
    expect(decision.checks).not.toHaveProperty("implementation_access_guard");
    expect(decision.implementation_access_guard.access_guard_status).toBe("monitoring_unavailable");
  });

  it("recovers iteration feedback from disk without reusing stale leakage or subprocess failures", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
run_dir = root / "notebooks" / "recipe_loop_runs" / "oneiter"
iter_dir = run_dir / "iteration-01"
iter_dir.mkdir(parents=True, exist_ok=True)

def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

write_json(loop.DATA_ROOT / "train" / "train-a" / "golden.json", {
    "schemaVersion": 1,
    "videoId": "train-a",
    "reviewStatus": "approved",
    "recipes": [{"title": "공개요리", "ingredients": [], "steps": [{"order": 1, "instruction": "공개 step 입니다"}]}],
})
write_json(loop.DATA_ROOT / "train" / "_grade_summary.iter01.json", {
    "aggregate": {"success": True, "ingredientF1": 0.4, "amountMatchRate": 0.4, "stepCoverage": 0.4, "recipeCountMatchRate": 1, "canaryLeak": {"status": "not_applicable", "success": True, "hit_count": 0, "hits": [], "redacted_hits": []}},
    "perVideo": [{"videoId": "train-a", "ingredientF1": 0.4, "amountMatchRate": 0.4, "stepCoverage": 0.4, "recipesMatched": 1, "recipeCountGolden": 1, "recipeCountMatch": True}],
})
write_json(loop.DATA_ROOT / "train" / "_semantic_summary.iter01.json", {"aggregate": {"averageScore": 2.5, "minCaseScore": 2.5, "canaryLeak": {"status": "not_applicable", "success": True, "hit_count": 0, "hits": [], "redacted_hits": []}}})
write_json(loop.DATA_ROOT / "validation" / "_grade_summary.iter01.json", {
    "aggregate": {"success": True, "ingredientF1": 0.4, "amountMatchRate": 0.4, "stepCoverage": 0.4, "recipeCountMatchRate": 0.4, "missing_result_count": 0, "missing_golden_count": 0, "unapproved_golden_count": 0, "expected_count_mismatch": False, "canaryLeak": {"status": "clean", "success": True, "hit_count": 0, "hits": [], "redacted_hits": []}},
})
write_json(loop.DATA_ROOT / "validation" / "_semantic_summary.iter01.json", {
    "aggregate": {"success": True, "judge_provider": "codex", "judge_model": "gpt-5.4", "judge_effort": "high", "calibration": {"valid": True}, "provider_error_count": 0, "parse_error_count": 0, "schema_error_count": 0, "timeout_error_count": 0, "calibration_error_count": 0, "empty_case_count": 0, "expected_count_mismatch": False, "threshold_success": False, "averageScore": 2.5, "minCaseScore": 2.5, "canaryLeak": {"status": "clean", "success": True, "hit_count": 0, "hits": [], "redacted_hits": []}},
})
write_json(iter_dir / "05_decision.json", {
    "passed": False,
    "checks": {"deterministic_validation": False, "semantic_validation": False, "subprocess_health": False, "leakage_guard": False},
})

def fail_run_node(*args, **kwargs):
    raise RuntimeError("run_node must not be called during recovery")

def fake_run_agent(cmd, prompt, log_path, cwd=None):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("진단 완료", encoding="utf-8")
    return "진단 완료"

loop.run_node = fail_run_node
loop.run_agent = fake_run_agent
feedback = loop.recover_iteration_feedback(loop.LoopConfig(), run_dir, 1)
recovered = json.loads((iter_dir / "05_decision.recovered.json").read_text(encoding="utf-8"))
module_state = json.loads((iter_dir / "module_state.json").read_text(encoding="utf-8"))
print(json.dumps({
    "feedback": feedback,
    "recovered_checks": recovered["checks"],
    "module_state": module_state,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.recovered_checks.leakage_guard).toBe(true);
    expect(report.recovered_checks.subprocess_health).toBe(true);
    expect(report.feedback).toContain("deterministic_validation");
    expect(report.feedback).toContain("semantic_validation");
    expect(report.feedback).not.toContain("leakage_guard");
    expect(report.feedback).not.toContain("subprocess_health");
    expect(report.module_state.verified).toBe(false);
  });

  it("blocks legacy resume without verified module state unless explicitly accepted", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
run_dir = root / "notebooks" / "recipe_loop_runs" / "legacy"
iter_dir = run_dir / "iteration-01"
iter_dir.mkdir(parents=True, exist_ok=True)
(iter_dir / "05_decision.json").write_text(json.dumps({
    "passed": False,
    "checks": {"deterministic_validation": False, "semantic_validation": False, "subprocess_health": True, "leakage_guard": True},
}), encoding="utf-8")
(iter_dir / "feedback_for_next_iter.md").write_text("복구된 피드백", encoding="utf-8")
blocked = False
try:
    loop.resume_loop(loop.LoopConfig(max_iter=2), run_dir, 2)
except RuntimeError as error:
    blocked = "module_state" in str(error)

def fake_run_iteration(cfg, run_dir_arg, iteration, feedback):
    d = run_dir_arg / f"iteration-{iteration:02d}"
    d.mkdir(parents=True, exist_ok=True)
    (d / "fake.txt").write_text(feedback, encoding="utf-8")
    return {"iteration": iteration, "passed": True, "decision": {"passed": True}, "out_tag": f"iter{iteration:02d}"}

loop.run_iteration = fake_run_iteration
loop.stage = lambda msg: None
resumed = loop.resume_loop(loop.LoopConfig(max_iter=2), run_dir, 2, accept_current_module_state=True)
module_state = json.loads((iter_dir / "module_state.json").read_text(encoding="utf-8"))
print(json.dumps({
    "blocked": blocked,
    "resumed": resumed,
    "module_state": module_state,
    "iter02_exists": (run_dir / "iteration-02" / "fake.txt").exists(),
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.blocked).toBe(true);
    expect(report.resumed.status).toBe("passed");
    expect(report.module_state.verified).toBe(false);
    expect(report.iter02_exists).toBe(true);
  });

  it("prechecks that the access guard watches the original repo root with golden directories", () => {
    const result = runLoopPython(`
environment = loop.validate_implementation_access_guard_environment()
print(json.dumps(environment, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const environment = JSON.parse(result.stdout);
    expect(environment.success).toBe(true);
    expect(environment.checks.repo_git_exists).toBe(true);
    expect(environment.checks.validation_dir_exists).toBe(true);
    expect(environment.checks.holdout_dir_exists).toBe(true);
  });

  it("warns implementation Codex not to access protected evaluation artifacts", () => {
    const result = runLoopPython(`
prompt = loop.build_implement_prompt("계획", "")
print(json.dumps({
    "has_allowlist": "allowlist implementation workspace" in prompt,
    "has_validation_holdout": "validation/holdout golden/evaluation data" in prompt,
    "has_git": "source repository .git directory" in prompt,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.has_allowlist).toBe(true);
    expect(report.has_validation_holdout).toBe(true);
    expect(report.has_git).toBe(true);
  });

  it("keeps diagnosis and next-iteration prompts aggregate-only with explicit answer-leak warnings", () => {
    const result = runLoopPython(`
agg = {
    "ingredientF1": 0.5,
    "amountMatchRate": 0.25,
    "stepCoverage": 0.375,
    "recipeCountMatchRate": 1,
    "recipesMissedTotal": 0,
    "recipesExtraTotal": 0,
    "deductionReasons": {
        "amount": {"counts": {"unit_mismatch": 2, "amountBasis_band_diff": 1}},
        "step": {"nearThresholdCount": 1, "bestSimilarity": {"avg": 0.375}},
    },
    "perRecipe": [{"title": "검증비밀제목"}],
}
det = loop.fmt_det(agg)
diagnosis = loop.build_diagnosis_prompt(det, "AI 평균 2.5", det, "- train-a (공개 train 제목): 재료F1 0.5")
plan = loop.build_plan_prompt(loop.LoopConfig(), det, "- train-a (공개 train 제목): 재료F1 0.5", "", True)
implement = loop.build_implement_prompt("계획", "unit_mismatch 2건")
combined = "\\n".join([diagnosis, plan, implement])
print(json.dumps({
    "det_has_reasons": "unit_mismatch" in det and "nearThreshold" in det,
    "has_no_raw_answer_warning": "정답 원문" in combined and "카테고리" in combined and "지표" in combined,
    "leaked_per_recipe_title": "검증비밀제목" in combined or "검증비밀제목" in det,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.det_has_reasons).toBe(true);
    expect(report.has_no_raw_answer_warning).toBe(true);
    expect(report.leaked_per_recipe_title).toBe(false);
  });

  it("formats semantic judge reason summaries as diagnosis input", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
summary_path = loop.DATA_ROOT / "train" / "_semantic_summary.iter01.json"
summary_path.parent.mkdir(parents=True, exist_ok=True)
summary_path.write_text(json.dumps({
    "aggregate": {"sampleN": 3},
    "perVideo": [{
        "videoId": "train-a",
        "cases": [{
            "title": "공개요리",
            "reason_summary": [
                {"label": "2/3", "text": "양념류 누락과 분량 오차"},
                {"label": "1/3", "text": "단계 순서 이탈"},
            ],
        }],
    }],
}, ensure_ascii=False), encoding="utf-8")
text = loop.semantic_reason_issues_text(loop.LoopConfig(), "iter01", "train")
prompt = loop.build_diagnosis_prompt("det", "ai", "val", "train cases", text)
print(json.dumps({
    "text": text,
    "prompt": prompt,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.text).toContain("(2/3) 양념류 누락과 분량 오차");
    expect(report.text).toContain("(1/3) 단계 순서 이탈");
    expect(report.prompt).toContain("AI judge reason 집계");
  });

  it("runs Claude semantic reason aggregation before recovered diagnosis", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
run_dir = root / "runs"
iter_dir = run_dir / "iteration-01"
iter_dir.mkdir(parents=True, exist_ok=True)
summary_payload = {
    "aggregate": {"sampleN": 3},
    "perVideo": [{
        "videoId": "case-a",
        "cases": [{
            "title": "공개요리",
            "sample_reasons": [
                "양념류 범주 누락",
                "양념류 범주 누락",
                "단계 순서 이탈",
            ],
        }],
    }],
}
for split in ["train", "validation"]:
    summary_path = loop.DATA_ROOT / split / "_semantic_summary.iter01.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary_payload, ensure_ascii=False), encoding="utf-8")

calls = []

def fake_run_agent(cmd, prompt, log_path, cwd=None):
    text = "- (2/3) Claude 집계: 양념류 범주 누락\\n- (1/3) Claude 집계: 단계 순서 이탈"
    if "06_diagnosis" in str(log_path):
        text = "진단에서 Claude 집계 반영"
    calls.append({"prompt": prompt, "log_path": str(log_path)})
    loop.write_text(log_path, text)
    return text

loop.run_agent = fake_run_agent
loop.recompute_iteration_decision = lambda cfg, iter_dir_arg, out_tag: {"checks": {"semantic_validation": False}}
loop.grade_summaries = lambda cfg, out_tag: {
    "det": {"aggregate": {}},
    "ai": {"aggregate": {"bottom_k": 2}},
    "val": {"aggregate": {}},
    "val_det": {"aggregate": {}},
    "val_ai": {"aggregate": {}},
}
loop.weak_train_cases_text = lambda cfg, out_tag: "- train-a: weak"
loop.write_current_module_state = lambda *args, **kwargs: None

feedback = loop.recover_iteration_feedback(loop.LoopConfig(), run_dir, 1)
print(json.dumps({"calls": calls, "feedback": feedback}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    const aggregateCalls = report.calls.filter((call: { log_path: string }) =>
      call.log_path.includes("06_reason_aggregate_"),
    );
    expect(aggregateCalls).toHaveLength(2);
    expect(aggregateCalls[0].prompt).toContain("점수를 매기지 마라");
    expect(aggregateCalls[0].prompt).toContain("validation/holdout");
    expect(aggregateCalls[0].prompt).toContain("구체 재료");
    const diagnosisCall = report.calls.find((call: { log_path: string }) => call.log_path.includes("06_diagnosis"));
    expect(diagnosisCall.prompt).toContain("Claude 집계");
    expect(report.feedback).toContain("진단에서 Claude 집계 반영");
  });

  it("records ungrounded Claude semantic reason aggregation output without blocking it", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
iter_dir = root / "runs" / "iteration-01"
summary_path = loop.DATA_ROOT / "train" / "_semantic_summary.iter01.json"
summary_path.parent.mkdir(parents=True, exist_ok=True)
summary_path.write_text(json.dumps({
    "aggregate": {"sampleN": 3},
    "perVideo": [{
        "videoId": "train-a",
        "cases": [{"sample_reasons": ["양념류 누락", "양념류 누락", "단계 순서 이탈"]}],
    }],
}, ensure_ascii=False), encoding="utf-8")

def fake_run_agent(cmd, prompt, log_path, cwd=None):
    text = "- train/rKfLY_Lg1-Q case1: (1/3) 조리도구 문제"
    loop.write_text(log_path, text)
    return text

loop.run_agent = fake_run_agent
text = loop.aggregate_semantic_reasons_with_claude(loop.LoopConfig(), iter_dir, "iter01", "train")
guard = json.loads((iter_dir / "06_reason_aggregate_train.guard.json").read_text(encoding="utf-8"))
print(json.dumps({"text": text, "guard": guard}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.text).toContain("조리도구 문제");
    expect(report.guard.success).toBe(false);
    expect(report.guard.ungrounded).toContain("조리도구");
  });

  it("skips Claude aggregation when the prompt or fallback would expose protected answers", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
iter_dir = root / "runs" / "iteration-01"
iter_dir.mkdir(parents=True, exist_ok=True)
secret = "비밀고유재료세트"
golden_path = loop.DATA_ROOT / "validation" / "val-secret" / "golden.json"
golden_path.parent.mkdir(parents=True, exist_ok=True)
golden_path.write_text(json.dumps({
    "schemaVersion": 1,
    "videoId": "val-secret",
    "reviewStatus": "approved",
    "recipes": [{"title": "검증요리", "ingredients": [{"name": secret, "amount": "1", "unit": "개"}], "steps": []}],
}, ensure_ascii=False), encoding="utf-8")
summary_path = loop.DATA_ROOT / "validation" / "_semantic_summary.iter01.json"
summary_path.write_text(json.dumps({
    "aggregate": {"sampleN": 3},
    "perVideo": [{
        "videoId": "val-secret",
        "cases": [{
            "sample_reasons": [secret + " 누락"],
            "reason_summary": [{"label": "1/3", "text": secret + " 누락"}],
        }],
    }],
}, ensure_ascii=False), encoding="utf-8")
calls = []
def fake_run_agent(cmd, prompt, log_path, cwd=None):
    calls.append(str(log_path))
    loop.write_text(log_path, "should not run")
    return "should not run"
loop.run_agent = fake_run_agent
text = loop.aggregate_semantic_reasons_with_claude(loop.LoopConfig(), iter_dir, "iter01", "validation")
scan = loop.scan_texts_for_protected_answers([{"scope": "returned", "text": text}])
print(json.dumps({"text": text, "calls": calls, "scan": scan}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.calls).toEqual([]);
    expect(report.scan.success).toBe(true);
    expect(report.text).not.toContain("비밀고유재료세트");
  });

  it("cleans dirty semantic aggregation raw logs on output leaks and agent failures", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
secret = "비밀고유재료세트"
golden_path = loop.DATA_ROOT / "validation" / "val-secret" / "golden.json"
golden_path.parent.mkdir(parents=True, exist_ok=True)
golden_path.write_text(json.dumps({
    "schemaVersion": 1,
    "videoId": "val-secret",
    "reviewStatus": "approved",
    "recipes": [{"title": "검증요리", "ingredients": [{"name": secret, "amount": "1", "unit": "개"}], "steps": []}],
}, ensure_ascii=False), encoding="utf-8")
for split in ["train", "validation"]:
    summary_path = loop.DATA_ROOT / split / "_semantic_summary.iter01.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps({
        "aggregate": {"sampleN": 3},
        "perVideo": [{
            "videoId": "case-a",
            "cases": [{
                "sample_reasons": ["양념류 범주 누락"],
                "reason_summary": [{"label": "1/3", "text": "양념류 범주 누락"}],
            }],
        }],
    }, ensure_ascii=False), encoding="utf-8")

def run_case(label, should_fail):
    iter_dir = root / "runs" / label / "iteration-01"
    iter_dir.mkdir(parents=True, exist_ok=True)
    def fake_run_agent(cmd, prompt, log_path, cwd=None):
        loop.write_text(log_path, secret + " partial dirty")
        if should_fail:
            raise RuntimeError("agent command failed rc=1: claude -p")
        return secret + " partial dirty"
    loop.run_agent = fake_run_agent
    text = loop.aggregate_semantic_reasons_with_claude(loop.LoopConfig(), iter_dir, "iter01", "train")
    log_text = (iter_dir / "06_reason_aggregate_train.md").read_text(encoding="utf-8")
    scan = loop.scan_directory_for_protected_answers(iter_dir)
    return {"text": text, "log_text": log_text, "scan": scan}

clean_dir = root / "runs" / "clean" / "iteration-01"
clean_dir.mkdir(parents=True, exist_ok=True)
def clean_run_agent(cmd, prompt, log_path, cwd=None):
    text = "- train/case-a case1: (1/3) 조리도구 문제"
    loop.write_text(log_path, text)
    return text
loop.run_agent = clean_run_agent
clean_text = loop.aggregate_semantic_reasons_with_claude(loop.LoopConfig(), clean_dir, "iter01", "train")
clean_log = (clean_dir / "06_reason_aggregate_train.md").read_text(encoding="utf-8")

print(json.dumps({
    "output_dirty": run_case("output-dirty", False),
    "agent_failed": run_case("agent-failed", True),
    "clean": {"text": clean_text, "log_text": clean_log},
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    for (const key of ["output_dirty", "agent_failed"]) {
      expect(report[key].scan.success).toBe(true);
      expect(report[key].log_text).toContain("reason aggregation skipped");
      expect(report[key].log_text).not.toContain("비밀고유재료세트");
      expect(report[key].text).toContain("양념류 범주 누락");
    }
    expect(report.clean.text).toContain("조리도구 문제");
    expect(report.clean.log_text).toContain("조리도구 문제");
  });

  it("fails closed on non-aggregation diagnosis leaks without retrying reason aggregation", () => {
    const result = runLoopPython(`
from pathlib import Path
root = Path(${JSON.stringify(workdir)})
loop.DATA_ROOT = root / "notebooks" / "recipe_loop_data"
run_dir = root / "runs"
iter_dir = run_dir / "iteration-01"
iter_dir.mkdir(parents=True, exist_ok=True)
secret = "비밀고유재료세트"
golden_path = loop.DATA_ROOT / "validation" / "val-secret" / "golden.json"
golden_path.parent.mkdir(parents=True, exist_ok=True)
golden_path.write_text(json.dumps({
    "schemaVersion": 1,
    "videoId": "val-secret",
    "reviewStatus": "approved",
    "recipes": [{"title": "검증요리", "ingredients": [{"name": secret, "amount": "1", "unit": "개"}], "steps": []}],
}, ensure_ascii=False), encoding="utf-8")

aggregate_calls = []
diagnosis_calls = []
clean_reason_text = loop.REASON_AGGREGATION_SKIP_MARKER

loop.recompute_iteration_decision = lambda cfg, iter_dir_arg, out_tag: {"checks": {"semantic_validation": False}}
loop.grade_summaries = lambda cfg, out_tag: {
    "det": {"aggregate": {}},
    "ai": {"aggregate": {"bottom_k": 2}},
    "val": {"aggregate": {}},
    "val_det": {"aggregate": {}},
    "val_ai": {"aggregate": {}},
}
loop.aggregate_semantic_reasons_with_claude = lambda cfg, iter_dir_arg, out_tag, split: aggregate_calls.append(split) or clean_reason_text
loop.weak_train_cases_text = lambda cfg, out_tag: "- train-a: " + secret

def fake_run_agent(cmd, prompt, log_path, cwd=None):
    diagnosis_calls.append(str(log_path))
    loop.write_text(log_path, "진단이 호출되면 안 됨")
    return "진단이 호출되면 안 됨"

loop.run_agent = fake_run_agent
loop.write_current_module_state = lambda *args, **kwargs: None

try:
    loop.recover_iteration_feedback(loop.LoopConfig(), run_dir, 1)
    error = None
except RuntimeError as exc:
    error = str(exc)

failed = json.loads((iter_dir / "06_diagnosis_failed.json").read_text(encoding="utf-8"))
clean_reason_scan = loop.scan_texts_for_protected_answers([{"scope": "reason", "text": clean_reason_text}])
print(json.dumps({
    "error": error,
    "aggregate_calls": aggregate_calls,
    "diagnosis_calls": diagnosis_calls,
    "failed": failed,
    "reason_failed_exists": (iter_dir / "06_reason_aggregation_failed.json").exists(),
    "clean_reason_scan": clean_reason_scan,
}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.error).toContain("diagnosis prompt failed leakage guard");
    expect(report.aggregate_calls).toEqual(["train", "validation"]);
    expect(report.diagnosis_calls).toEqual([]);
    expect(report.reason_failed_exists).toBe(false);
    expect(report.clean_reason_scan.success).toBe(true);
    expect(report.failed).toMatchObject({
      iteration_status: "aborted",
      stage: "diagnosis_leakage_guard",
      recovered: true,
    });
    expect(report.failed.leakage_scan.success).toBe(false);
    expect(report.failed.leakage_scan.scanned_scopes).toContain("06_diagnosis_prompt");
  });

  it("uses non-interactive sudo for fs_usage when the loop is not already root", () => {
    const result = runLoopPython(`
cmd = loop.fs_usage_command()
print(json.dumps({"cmd": cmd, "is_root": loop.os.geteuid() == 0}, ensure_ascii=False))
`);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    if (report.is_root) {
      expect(report.cmd.slice(0, 1)).toEqual(["fs_usage"]);
    } else {
      expect(report.cmd.slice(0, 2)).toEqual(["sudo", "-n"]);
      expect(report.cmd).toContain("fs_usage");
    }
    expect(report.cmd).toEqual(expect.arrayContaining(["-w", "-f", "pathname"]));
  });
});
