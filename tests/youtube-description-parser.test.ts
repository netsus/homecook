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

  it("splits plus-separated sauce ingredients and does not import sauce heading as an ingredient", () => {
    const document = parseYoutubeRecipeDescription({
      title: "목살 양념구이",
      description: [
        "재료",
        "- 돼지목살300g",
        "",
        "양념장",
        "- 진간장3스푼 + 다진마늘1스푼 + 설탕1스푼 + 올리고당1스푼 + 참기름1스푼 + 맛술1스푼 + 물2스푼 + 후추 톡톡톡톡",
        "(영상에서는 설탕이 빠져서 나중에 넣었습니다)",
        "",
        "만들기",
        "1. 목살300g을 키친타올을 이용해 핏물을 제거해주세요.",
        "2. 믹싱볼에 목살과 양념장을 넣고 조물조물 버무려주세요.(조금 더 맛있게 드시려면 10분정도 숙성해주세요)",
        "3. 팬에 맛있게 구워주세요.(중불)(중간에 고기를 자르면서 구워도 돼요)",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "돼지목살",
      "진간장",
      "다진마늘",
      "설탕",
      "올리고당",
      "참기름",
      "맛술",
      "물",
      "후추",
    ]);
    expect(draft.ingredients).not.toContainEqual(expect.objectContaining({ name: "양념장" }));
    expect(draft.ingredients.find((ingredient) => ingredient.name === "진간장"))
      .toMatchObject({
        amount: 3,
        unit: "스푼",
        componentLabel: "양념장",
        displayText: "[양념장] 진간장 3스푼",
      });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "후추"))
      .toMatchObject({
        amount: null,
        unit: null,
        componentLabel: "양념장",
        displayText: "[양념장] 후추 약간",
      });
    expect(draft.steps).toEqual([
      "목살300g을 키친타올을 이용해 핏물을 제거해주세요.",
      "믹싱볼에 목살과 양념장을 넣고 조물조물 버무려주세요.(조금 더 맛있게 드시려면 10분정도 숙성해주세요)",
      "팬에 맛있게 구워주세요.(중불)(중간에 고기를 자르면서 구워도 돼요)",
    ]);
    expect(draft.blockingIssues).toEqual([]);
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

  it("normalizes double tildes in range amounts", () => {
    const document = parseYoutubeRecipeDescription({
      title: "오이 무침",
      description: [
        "재료",
        "오이 2~~3개",
        "소금 1큰술",
        "만드는 법",
        "1. 오이를 얇게 썰어요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients[0]).toMatchObject({
      name: "오이",
      amount: 2,
      unit: "개",
    });
  });

  it("recognizes keycap emoji ordinals as step numbers", () => {
    const document = parseYoutubeRecipeDescription({
      title: "간단 볶음밥",
      description: [
        "재료",
        "밥 1공기",
        "달걀 2개",
        "만드는 법",
        "1️⃣ 팬에 기름을 두르고 달걀을 볶아요.",
        "2️⃣ 밥을 넣고 섞어요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.steps).toEqual([
      "팬에 기름을 두르고 달걀을 볶아요.",
      "밥을 넣고 섞어요.",
    ]);
  });

  it("recognizes circled number ordinals as step numbers", () => {
    const document = parseYoutubeRecipeDescription({
      title: "된장찌개",
      description: [
        "재료",
        "두부 1모",
        "된장 2큰술",
        "만드는 법",
        "① 냄비에 물을 끓여요.",
        "② 된장을 풀고 두부를 넣어요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.steps).toEqual([
      "냄비에 물을 끓여요.",
      "된장을 풀고 두부를 넣어요.",
    ]);
  });

  it("stops parsing steps when a section stopper heading appears", () => {
    const document = parseYoutubeRecipeDescription({
      title: "오이참치 꼬마김밥",
      description: [
        "재료",
        "오이 2개",
        "참치캔 1개",
        "밥 1공기",
        "",
        "만드는 법",
        "1. 오이를 얇게 썰어요.",
        "2. 참치와 밥을 섞어요.",
        "",
        "이런 분들께 추천해요",
        "- 다이어트 중이신 분",
        "- 건강한 한 끼를 원하시는 분",
        "",
        "보관법",
        "냉장 보관 시 하루 안에 드세요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.steps).toEqual([
      "오이를 얇게 썰어요.",
      "참치와 밥을 섞어요.",
    ]);
    expect(draft.steps).not.toContainEqual(expect.stringContaining("다이어트"));
    expect(draft.steps).not.toContainEqual(expect.stringContaining("보관"));
  });

  it("splits comma-separated ingredients in ingredient section", () => {
    const document = parseYoutubeRecipeDescription({
      title: "비빔밥",
      description: [
        "재료",
        "밥 1공기",
        "소금, 후추, 참기름",
        "만드는 법",
        "1. 밥에 재료를 넣고 비벼요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toContain("소금");
    expect(draft.ingredients.map((ingredient) => ingredient.name)).toContain("후추");
    expect(draft.ingredients.map((ingredient) => ingredient.name)).toContain("참기름");
  });

  it("splits comma-separated ingredients with amounts", () => {
    const document = parseYoutubeRecipeDescription({
      title: "파스타",
      description: [
        "재료",
        "파스타면 200g",
        "소금 1큰술, 후추 약간",
        "만드는 법",
        "1. 면을 삶아요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.find((ingredient) => ingredient.name === "소금")).toMatchObject({
      amount: 1,
      unit: "큰술",
    });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "후추")).toMatchObject({
      amount: null,
      unit: null,
    });
  });

  it("splits a real one-line Korean ingredient list before treating the line as one numeric ingredient", () => {
    const document = parseYoutubeRecipeDescription({
      title: "목살 돼지갈비 양념",
      description: [
        "목살에 돼지갈비양념을 했어요! 배, 양파 안넣고 만드는 간단 버전입니다!",
        "",
        "📌재료(*밥 숟가락 기준)",
        "목살 300g~400g, 다진 마늘 0.5스푼, 진간장 3스푼(또는 양조간장), 맛술 1.5스푼, 물엿 1스푼, 설탕 1스푼, 후추, 연겨자 0.2스푼, 물 3스푼, 참기름 0.3스푼",
        "",
        "* 영상 속의 연겨자 양 2번 넣었습니다",
        "",
        "📌만드는 법",
        "1. 목살은 앞뒤로 칼집을 내주세요.",
        "2. 진간장, 다진 마늘, 맛술, 물엿, 설탕, 후추, 연겨자, 물, 참기름을 넣고 잘 섞어서 양념을 만들어주세요.",
        "3. 고기에 양념을 잘 버무린 뒤 최소 30분 이상 재우고 프라이팬에 중약불(또는 약불)로 자주 뒤집어가며 타지 않게 구워주세요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "목살",
      "다진 마늘",
      "진간장",
      "맛술",
      "물엿",
      "설탕",
      "후추",
      "연겨자",
      "물",
      "참기름",
    ]);
    expect(draft.ingredients[0]).toMatchObject({
      name: "목살",
      amount: 300,
      unit: "g",
    });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "참기름"))
      .toMatchObject({
        amount: 0.3,
        unit: "스푼",
      });
    expect(draft.ingredients.every((ingredient) => !ingredient.name.includes(","))).toBe(true);
    expect(draft.steps).toEqual([
      "목살은 앞뒤로 칼집을 내주세요.",
      "진간장, 다진 마늘, 맛술, 물엿, 설탕, 후추, 연겨자, 물, 참기름을 넣고 잘 섞어서 양념을 만들어주세요.",
      "고기에 양념을 잘 버무린 뒤 최소 30분 이상 재우고 프라이팬에 중약불(또는 약불)로 자주 뒤집어가며 타지 않게 구워주세요.",
    ]);
    expect(draft.blockingIssues).toEqual([]);
  });

  it("recognizes ingredient heading with parenthetical serving size", () => {
    const document = parseYoutubeRecipeDescription({
      title: "김치찌개",
      description: [
        "재료 (2인분)",
        "김치 200g",
        "두부 1모",
        "만드는 법",
        "1. 김치를 볶아요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual(["김치", "두부"]);
  });

  it("recognizes step heading with parenthetical annotation", () => {
    const document = parseYoutubeRecipeDescription({
      title: "스크램블 에그",
      description: [
        "재료",
        "달걀 3개",
        "버터 10g",
        "만드는 법 (쉬운 버전)",
        "1. 달걀을 풀어요.",
        "2. 버터를 녹이고 달걀을 넣어요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.steps.length).toBe(2);
    expect(draft.steps[0]).toBe("달걀을 풀어요.");
  });

  it("classifies expanded noise patterns correctly", () => {
    const document = parseYoutubeRecipeDescription({
      title: "테스트",
      description: [
        "재료",
        "밥 1공기",
        "만드는 법",
        "1. 밥을 볶아요.",
        "",
        "협찬 및 광고 문의",
        "@cooking_channel",
        "BGM: Sunny Day",
        "촬영 카메라: Sony A7",
        "#요리 #맛있는",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.steps).toEqual(["밥을 볶아요."]);
    expect(draft.steps).not.toContainEqual(expect.stringContaining("협찬"));
    expect(draft.steps).not.toContainEqual(expect.stringContaining("카메라"));
  });

  it("detects expanded cooking verbs for step classification", () => {
    const document = parseYoutubeRecipeDescription({
      title: "나물 비빔밥",
      description: [
        "재료",
        "밥 1공기",
        "시금치 100g",
        "",
        "만드는 법",
        "1. 시금치를 데쳐서 헹궈요.",
        "2. 양념장에 재워요.",
        "3. 밥 위에 올리고 비벼요.",
        "4. 참기름을 걸러서 부어요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.steps.length).toBe(4);
  });

  it("handles additional known units like 봉지, 병, 잔, 톨", () => {
    const document = parseYoutubeRecipeDescription({
      title: "라면",
      description: [
        "재료",
        "라면 1봉지",
        "달걀 1개",
        "마늘 3톨",
        "맥주 1병",
        "물 2잔",
        "대파 1다발",
        "만드는 법",
        "1. 물을 끓여요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.find((ingredient) => ingredient.name === "라면")).toMatchObject({ amount: 1, unit: "봉지" });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "마늘")).toMatchObject({ amount: 3, unit: "톨" });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "맥주")).toMatchObject({ amount: 1, unit: "병" });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "물")).toMatchObject({ amount: 2, unit: "잔" });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "대파")).toMatchObject({ amount: 1, unit: "다발" });
  });

  it("recognizes 한 줌 as a Korean amount word and 한 움큼 as to-taste", () => {
    const document = parseYoutubeRecipeDescription({
      title: "샐러드",
      description: [
        "재료",
        "양상추 한 줌",
        "견과류 한 움큼",
        "소금 한 꼬집",
        "만드는 법",
        "1. 양상추를 씻어요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.find((ingredient) => ingredient.name === "양상추")).toMatchObject({
      amount: 1,
      unit: "줌",
      ingredientType: "QUANT",
    });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "견과류")).toMatchObject({
      ingredientType: "TO_TASTE",
    });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "소금")).toMatchObject({
      amount: 1,
      unit: "꼬집",
      ingredientType: "QUANT",
    });
  });

  it("handles fullwidth tildes in range amounts", () => {
    const document = parseYoutubeRecipeDescription({
      title: "쿠키",
      description: [
        "재료",
        "설탕 30～40g",
        "만드는 법",
        "1. 설탕을 넣고 섞어요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients[0]).toMatchObject({
      name: "설탕",
      amount: 30,
      unit: "g",
    });
  });

  it("does not treat section stopper content as ingredients", () => {
    const document = parseYoutubeRecipeDescription({
      title: "닭가슴살",
      description: [
        "재료",
        "닭가슴살 200g",
        "소금 약간",
        "",
        "만드는 법",
        "1. 닭가슴살을 굽세요.",
        "",
        "영양 정보",
        "칼로리 165kcal",
        "단백질 31g",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual(["닭가슴살", "소금"]);
    expect(draft.steps).toEqual(["닭가슴살을 굽세요."]);
  });
});
