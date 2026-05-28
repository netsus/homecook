import { describe, expect, it } from "vitest";

import {
  adaptCandidateToFlatDraft,
  parseYoutubeRecipeDescription,
  selectPrimaryRecipeCandidate,
} from "@/lib/server/youtube-description-parser";

function parseDraft(description: string) {
  const document = parseYoutubeRecipeDescription({
    title: "live smoke regression",
    description,
  });

  return adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));
}

function ingredientNames(description: string) {
  return parseDraft(description).ingredients.map((ingredient) => ingredient.name);
}

describe("YouTube live description parser regressions", () => {
  it("recognizes Korean angle-bracket ingredient headings from live descriptions", () => {
    const draft = parseDraft([
      "#김밥 #김밥맛있게만드는방법",
      "《재료》",
      "김밥 햄 5줄",
      "맛살 3줄",
      "부추",
      "당근 약간",
      "식용유",
      "계란 4개",
      "----------",
      "밥 130g (햇반 작은거 용량)",
      "맛소금 1/2 티스푼",
      "참깨",
      "참기름",
      "김 1장",
      "단무지 2줄",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "김밥 햄",
      "맛살",
      "부추",
      "당근",
      "식용유",
      "계란",
      "밥",
      "맛소금",
      "참깨",
      "참기름",
      "김",
      "단무지",
    ]);
    expect(draft.blockingIssues).not.toContain("ingredients");
  });

  it("ignores measurement guide lines and normalizes mixed Korean ingredient notation", () => {
    const names = ingredientNames([
      "✅영상에서 언급한 컵, 스푼은 계량도구입니다.",
      "큰술:Tablespoon(15ml)",
      "작은술:teaspoon(5ml)",
      "1컵(Cup)= 200ml (200g이 아니예요)",
      "✅재료",
      "당면 300g",
      "돼지고기(잡채용) 300g",
      "당근 150g",
      "파프리카 1/2개씩",
      "표고버섯 150g",
      "양파 200g",
      "시금치 180g(반단)",
      "참기름 2큰술(Tbsp)",
      "후춧가루",
    ].join("\n"));

    expect(names).toContain("당면");
    expect(names).toContain("돼지고기");
    expect(names).toContain("파프리카");
    expect(names).not.toContain("Tablespoon(");
    expect(names).not.toContain("teaspoon(");
    expect(names).not.toContain("1컵(Cup)=");
  });

  it("preserves fruit names ending with particle-like syllables and removes adverb prefixes", () => {
    const draft = parseDraft([
      "🍀만능 샐러드 드레싱 레시피",
      "진간장 1종이컵",
      "백설탕 1종이컵",
      "양조 식초 1종이컵",
      "사과 1/2개",
      "양파 1/2개",
      "간마늘1스푼",
      "양념과 함께 초퍼로 갈아줍니다",
      "마지막에 넉넉하게 레몬즙 3스푼 넣어 주세요",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "진간장",
      "백설탕",
      "양조 식초",
      "사과",
      "양파",
      "간마늘",
      "레몬즙",
    ]);
    expect(draft.steps).toEqual([
      "양념과 함께 초퍼로 갈아줍니다",
      "마지막에 넉넉하게 레몬즙 3스푼 넣어 주세요",
    ]);
  });

  it("uses parenthetical amount only when an ingredient has no visible amount outside", () => {
    const draft = parseDraft([
      "👨🏻‍🍳재료 (1줄 기준)",
      "오이 1개, 소금 2~3꼬집, 참치 (기름 제거 전 100g), 올리브 오일 마요네즈 1T, 와사비 0.3t, 후추 약간, 현미밥 120g, 참기름 0.5T, 식초 0.5T, 소금 1~2꼬집, 김밥 김 1장",
      "",
      "🍽️레시피",
      "1.오이 1개는 반으로 자르고, 가운데 씨를 파낸 후, 단면에 소금 2~3꼬집 뿌려 약 5분 절인다.",
      "2.기름 뺀 참치에 저당 마요네즈 1T, 와사비 0.3t, 후추 약간 넣어 섞어준다.",
      "3.현미밥 120g에 참기름 0.5T, 식초 0.5T, 소금 1~2꼬집 뿌려 한김 식혀둔다.",
      "4.키친타올로 오이에서 나온 물기와 소금을 닦아준다.",
      "5.김밥 김 위에 김의 2/3정도 밥을 얇게 펼치고, 오이-참치-오이 순서로 쌓은 후, 돌돌 말아준다.",
      "6.겉면에 참기름, 간 깨를 뿌린 후 먹기 좋은 크기로 썰어주면 완성!",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "오이",
      "소금",
      "참치",
      "올리브 오일 마요네즈",
      "와사비",
      "후추",
      "현미밥",
      "참기름",
      "식초",
      "김밥 김",
    ]);
    expect(draft.ingredients.find((ingredient) => ingredient.name === "참치"))
      .toMatchObject({
        amount: 100,
        unit: "g",
        displayText: "참치 100g",
      });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "오이"))
      .toMatchObject({
        amount: 1,
        unit: "개",
      });
    expect(draft.steps).toHaveLength(6);
    expect(draft.blockingIssues).toEqual([]);
  });

  it("keeps baking component labels out of colon-prefixed custard cream bread ingredients", () => {
    const draft = parseDraft([
      "커스터드 크림빵 만들기",
      "",
      "재료",
      "빵 반죽: 강력분 250g, 설탕 30g, 소금 4g, 드라이이스트 4g, 우유 120g, 달걀 1개, 무염버터 30g",
      "커스터드 크림: 우유 300g, 노른자 3개, 설탕 60g, 박력분 25g, 바닐라빈 약간",
      "",
      "만드는 법",
      "1. 강력분, 설탕, 소금, 드라이이스트를 섞고 우유와 달걀을 넣어 반죽해요.",
      "2. 버터를 넣고 매끈해질 때까지 치댄 뒤 1차 발효해요.",
      "3. 노른자와 설탕을 풀고 박력분을 섞은 뒤 데운 우유를 부어 커스터드 크림을 만들어요.",
      "4. 반죽을 나눠 커스터드 크림을 감싸고 2차 발효해요.",
      "5. 180도 오븐에서 13분 구워요.",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "강력분",
      "설탕",
      "소금",
      "드라이이스트",
      "우유",
      "달걀",
      "무염버터",
      "우유",
      "노른자",
      "설탕",
      "박력분",
      "바닐라빈",
    ]);
    expect(draft.ingredients.find((ingredient) => ingredient.name === "강력분"))
      .toMatchObject({
        amount: 250,
        unit: "g",
        componentLabel: "빵 반죽",
        displayText: "강력분 250g",
      });
    expect(draft.ingredients.filter((ingredient) => ingredient.name === "우유"))
      .toEqual([
        expect.objectContaining({
          amount: 120,
          unit: "g",
          componentLabel: "빵 반죽",
        }),
        expect.objectContaining({
          amount: 300,
          unit: "g",
          componentLabel: "커스터드 크림",
        }),
      ]);
    expect(draft.ingredients.every((ingredient) => !ingredient.name.includes(":"))).toBe(true);
    expect(draft.ingredients.every((ingredient) => !ingredient.name.includes("："))).toBe(true);
    expect(draft.steps).toHaveLength(5);
    expect(draft.blockingIssues).toEqual([]);
  });
});
