import { describe, expect, it } from "vitest";

import {
  adaptCandidateToFlatDraft,
  parseYoutubeRecipeDescription,
  selectPrimaryRecipeCandidate,
} from "@/lib/server/youtube-description-parser";

const bakingComponentDescription = [
  "딸기 치즈 타르트 레시피",
  "",
  "재료",
  "[타르트 반죽]",
  "박력분120g",
  "아몬드가루 20g",
  "버터 60g",
  "설탕 35g",
  "바닐라 페이스트 1t",
  "노른자 1개",
  "",
  "[치즈 필링]",
  "크림치즈 200g",
  "생크림 100g",
  "설탕 30~40g",
  "레몬즙 1t",
  "",
  "만드는 법",
  "반죽",
  "1) 버터를 부드럽게 풀고 설탕을 섞어요.",
  "2) 노른자와 바닐라 페이스트를 넣고 섞어요.",
  "필링",
  "9) 크림치즈에 설탕을 넣고 풀어요.",
  "10) 식힌 타르트지에 필링을 채워요.",
  "",
  "제품 정보와 BGM은 더보기 링크를 확인해주세요.",
  "#베이킹 #타르트",
].join("\n");

describe("youtube description parser v2", () => {
  it("extracts multi-component baking ingredients and steps without skipping compact amount lines", () => {
    const document = parseYoutubeRecipeDescription({
      title: "딸기 치즈 타르트",
      description: bakingComponentDescription,
    });
    const selection = selectPrimaryRecipeCandidate(document);
    const draft = adaptCandidateToFlatDraft(selection);

    expect(selection.outcome).toBe("selected_single_recipe");
    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "박력분",
      "아몬드가루",
      "버터",
      "설탕",
      "바닐라 페이스트",
      "노른자",
      "크림치즈",
      "생크림",
      "레몬즙",
    ]);
    expect(draft.ingredients.find((ingredient) => ingredient.name === "바닐라 페이스트"))
      .toMatchObject({
        amount: 1,
        unit: "t",
        componentLabel: "타르트 반죽",
        displayText: "[타르트 반죽] 바닐라 페이스트 1t",
      });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "노른자"))
      .toMatchObject({
        amount: 1,
        unit: "개",
        componentLabel: "타르트 반죽",
      });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "설탕"))
      .toMatchObject({
        amount: 65,
        unit: "g",
        displayText: "[타르트 반죽+치즈 필링] 설탕 65g (타르트 반죽 35g + 치즈 필링 30g)",
      });
    expect(draft.steps).toEqual([
      "[타르트 반죽] 버터를 부드럽게 풀고 설탕을 섞어요.",
      "[타르트 반죽] 노른자와 바닐라 페이스트를 넣고 섞어요.",
      "[치즈 필링] 크림치즈에 설탕을 넣고 풀어요.",
      "[치즈 필링] 식힌 타르트지에 필링을 채워요.",
    ]);
    expect(draft.draftWarnings).toContain("원본 조리 순서 번호가 1, 2, 9, 10처럼 비연속이라 중간 단계 누락 가능성이 있어요.");
    expect(draft.blockingIssues).toEqual([]);
  });

  it("uses lookahead so a component heading is not treated as an amountless ingredient", () => {
    const document = parseYoutubeRecipeDescription({
      title: "초콜릿 케이크",
      description: [
        "재료",
        "필링",
        "초콜릿 필링 200g",
        "생크림 100g",
        "",
        "만드는 법",
        "필링",
        "1. 생크림을 데우고 초콜릿 필링을 섞어요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "초콜릿 필링",
      "생크림",
    ]);
    expect(draft.ingredients).not.toContainEqual(expect.objectContaining({ name: "필링" }));
    expect(draft.steps).toEqual(["[필링] 생크림을 데우고 초콜릿 필링을 섞어요."]);
  });

  it("prefers the visible serving unit over parenthetical reference weight", () => {
    const document = parseYoutubeRecipeDescription({
      title: "오이 샌드위치",
      description: [
        "재료",
        "청오이 1개(120g)",
        "호밀빵 2장",
        "만드는 법",
        "1. 오이는 얇게 썰어요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients[0]).toMatchObject({
      name: "청오이",
      amount: 1,
      unit: "개",
      rawText: "청오이 1개(120g)",
    });
  });

  it("aggregates duplicate component ingredients only when their parsed unit is compatible", () => {
    const document = parseYoutubeRecipeDescription({
      title: "크림 쿠키",
      description: [
        "재료",
        "반죽 재료",
        "설탕 50g",
        "버터 80g",
        "크림 재료",
        "설탕 20g",
        "크림치즈 100g",
        "",
        "조리법",
        "반죽 만들기",
        "1. 버터와 설탕을 섞어요.",
        "크림 만들기",
        "2. 크림치즈와 설탕을 섞어요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.find((ingredient) => ingredient.name === "설탕"))
      .toMatchObject({
        amount: 70,
        unit: "g",
        displayText: "[반죽+크림] 설탕 70g (반죽 50g + 크림 20g)",
      });
    expect(draft.draftWarnings).toContain("같은 재료를 컴포넌트별로 합산했어요. 인분을 바꾸면 괄호 안 원본 수량은 자동으로 바뀌지 않아요.");
  });

  it("selects the first structured recipe when one description contains multiple recipes", () => {
    const document = parseYoutubeRecipeDescription({
      title: "두 가지 집밥",
      description: [
        "Recipe 1",
        "재료",
        "김치 200g",
        "두부 1모",
        "만드는 법",
        "1. 김치를 한입 크기로 썰어요.",
        "2. 두부를 넣고 끓여요.",
        "",
        "Recipe 2",
        "재료",
        "달걀 2개",
        "밥 1공기",
        "만드는 법",
        "1. 달걀을 풀어요.",
      ].join("\n"),
    });
    const selection = selectPrimaryRecipeCandidate(document);
    const draft = adaptCandidateToFlatDraft(selection);

    expect(selection.outcome).toBe("selected_first_candidate");
    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual(["김치", "두부"]);
    expect(draft.steps).toEqual([
      "김치를 한입 크기로 썰어요.",
      "두부를 넣고 끓여요.",
    ]);
    expect(draft.draftWarnings).toContain("여러 레시피가 감지되어 첫 번째 후보만 가져왔어요.");
  });

  it("returns an empty draft with manual repair blockers when no structured recipe exists", () => {
    const document = parseYoutubeRecipeDescription({
      title: "주말 브이로그",
      description: [
        "오늘은 시장에 다녀오고 카페에 갔어요.",
        "사용한 제품 정보는 아래 링크를 참고해주세요.",
        "https://example.com/product",
        "#vlog #daily",
      ].join("\n"),
    });
    const selection = selectPrimaryRecipeCandidate(document);
    const draft = adaptCandidateToFlatDraft(selection);

    expect(selection.outcome).toBe("no_structured_recipe");
    expect(draft.ingredients).toEqual([]);
    expect(draft.steps).toEqual([]);
    expect(draft.blockingIssues).toEqual(["ingredients", "steps"]);
    expect(draft.draftWarnings).toContain("설명란에서 구조화된 재료와 조리 과정을 찾지 못했어요. 직접 추가해서 등록할 수 있어요.");
    expect(draft.includeIncompleteStepFallback).toBe(false);
  });
});
