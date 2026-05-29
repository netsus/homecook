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

  it("normalizes author comment ingredient shorthand from real app-route smoke", () => {
    const draft = parseDraft([
      "재료",
      "-통삼겹 반 (250g)",
      "-미림 4수저",
      "-소금",
      "-후추 적당히",
      "-양파 큰거 1개",
      "",
      "만드는 법",
      "1. 통삼겹에 소금과 후추를 뿌려 밑간해요.",
      "2. 양파와 미림을 넣고 익혀요.",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "통삼겹",
      "미림",
      "소금",
      "후추",
      "양파",
    ]);
    expect(draft.ingredients.find((ingredient) => ingredient.name === "통삼겹"))
      .toMatchObject({
        amount: 250,
        unit: "g",
        displayText: "통삼겹 250g",
      });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "미림"))
      .toMatchObject({
        amount: 4,
        unit: "수저",
        displayText: "미림 4수저",
      });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "후추"))
      .toMatchObject({
        ingredientType: "TO_TASTE",
        displayText: "후추 약간",
      });
    expect(draft.blockingIssues).toEqual([]);
  });

  it("keeps the measured liquid when an author comment sentence-like fragment contains water", () => {
    const draft = parseDraft([
      "재료",
      "구운 항정살에 물 400ml",
      "간장 2큰술",
      "굴소스 1큰술",
      "후추 적당히",
      "",
      "레시피",
      "1. 항정살을 굽고 물과 양념을 넣어요.",
      "2. 졸여서 완성해요.",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "물",
      "간장",
      "굴소스",
      "후추",
      "항정살",
    ]);
    expect(draft.ingredients.find((ingredient) => ingredient.name === "물"))
      .toMatchObject({
        amount: 400,
        unit: "ml",
        displayText: "물 400ml",
      });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "항정살"))
      .toMatchObject({
        ingredientType: "TO_TASTE",
        flags: expect.arrayContaining(["inferred_from_step"]),
      });
    expect(draft.blockingIssues).toEqual([]);
  });

  it("parses amount lines with an unmatched trailing closing parenthesis", () => {
    const draft = parseDraft([
      "재료",
      "굴소스 1/2스푼)",
      "계란 2개",
      "",
      "만드는 법",
      "1. 재료를 넣고 볶아요.",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual(["굴소스", "계란"]);
    expect(draft.ingredients.find((ingredient) => ingredient.name === "굴소스"))
      .toMatchObject({
        amount: 0.5,
        unit: "스푼",
        displayText: "굴소스 0.5스푼",
      });
  });

  it("supplements sparse ingredient lists from concrete step ingredient mentions", () => {
    const draft = parseDraft([
      "[일본식 제육덮밥]",
      "※ 소스",
      "간장(50cc), 청주(50cc), 맛술(100cc), 다진 마늘(0.5큰술), 다진 생강(0.5큰술)",
      "",
      "1. 냄비에 간장, 청주, 맛술을 1:1:2의 비율로 넣고, 다진 마늘과 다진 생강을 넣어 끓여준다.",
      "2. 프라이팬에 대패 삼겹살, 양파, 파 같은 채소를 넣고 볶아주다 후추를 뿌려준다.",
      "3. 고기가 익으면 만들어둔 소스를 4~6큰술 넣어 양념한다.",
      "4. 밥 위에 고기 올리고, 노른자로 마무리하면 끝!!!",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "간장",
      "청주",
      "맛술",
      "다진 마늘",
      "생강",
      "대패 삼겹살",
      "양파",
      "파",
      "후추",
      "밥",
      "노른자",
    ]);
    expect(draft.ingredients.find((ingredient) => ingredient.name === "대패 삼겹살"))
      .toMatchObject({
        ingredientType: "TO_TASTE",
        flags: expect.arrayContaining(["inferred_from_step"]),
      });
    expect(draft.ingredients.map((ingredient) => ingredient.name)).not.toContain("고기");
  });

  it("adds missing oil and topping ingredients from simple step verbs without duplicating measured ingredients", () => {
    const draft = parseDraft([
      "※ 재료",
      "감자(큰 거 2개), 다진마늘, 생크림(250ml), 소금, 케첩or토마토 소스, 모차렐라 피자치즈, 파마산 치즈",
      "",
      "1. 전자레인지용 용기에 감자를 적당하게 잘라 넣는다.",
      "2. 소금 한 꼬집, 다진 마늘 한 큰술을 넣고 올리브 오일을 둘러 준다.",
      "3. 전자레인지에 돌려 감자를 충분히 익혀준다.",
      "4. 큰 냄비에 생크림 250ml를 넣고 끓여준다.",
      "5. 다 익은 감자를 으깨주고, 그 위에 졸인 생크림과 케첩을 발라준다.",
      "6. 모차렐라 치즈와 파마산 치즈까지 뿌려준 뒤 전자레인지에 돌려 치즈를 녹여준다.",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual(
      expect.arrayContaining(["감자", "생크림", "올리브 오일", "모차렐라 피자치즈", "파마산 치즈"]),
    );
    expect(draft.ingredients.filter((ingredient) => ingredient.name === "생크림")).toHaveLength(1);
    expect(draft.ingredients.find((ingredient) => ingredient.name === "올리브 오일"))
      .toMatchObject({
        ingredientType: "TO_TASTE",
        flags: expect.arrayContaining(["inferred_from_step"]),
      });
  });
});
