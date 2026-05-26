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
});
