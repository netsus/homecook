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

const custardBreadComponentDescription = [
  "🧈재료 Ingredients",
  "",
  "| 빵 반죽",
  "170g 강력분",
  "15g 박력분",
  "15g 설탕",
  "3g 소금",
  "4g 인스턴트 드라이 이스트",
  "50g 우유",
  "30g 생크림",
  "35g 달걀 (전란)",
  "15g 연유",
  "25g 무염버터",
  "",
  "| 커스터드 크림",
  "2개 달걀노른자",
  "30g 설탕",
  "2g 바닐라빈 페이스트",
  "10g 옥수수전분",
  "150g 따뜻한 우유",
  "5g 무염버터",
  "",
  "| 쿠키 토핑",
  "10g 무염버터",
  "10g 설탕",
  "10g 박력분",
  "5g 우유",
  "",
  "📝만드는 과정",
  "",
  "빵 반죽 만들기",
  "1. 밀가루에 설탕, 소금, 인스턴트 드라이 이스트를 넣고 골고루 섞어 주세요.",
  "2. 우유, 생크림, 달걀, 연유를 넣고 잘 섞어 약 10분 정도 손으로 반죽해 주세요.(반죽기 사용 권장)",
  "3. 실온 상태의 무염버터를 넣고 반죽해 매끈한 상태가 되면 볼에 넣고 비닐 랩을 씌워 주세요.",
  "4. 따뜻한 곳에서 반죽이 2~2.5배로 부풀 때까지 1시간 정도 발효시켜 주세요.",
  "",
  "커스터드 필링 만들기",
  "5. 달걀노른자에 설탕과 바닐라빈 페이스트를 넣고 잘 섞어 주세요.",
  "6. 옥수수전분을 넣고 섞은 다음 따뜻한 우유를 넣고 잘 섞은 다음 약불에 올려 가열해 주세요.",
  "7. 기포가 보글 보글 올라오면 불에서 내려 무염버터를 넣고 잘 섞어 체에 내려 비닐 랩을 덮고 식혀 주세요.",
  "",
  "8. 발효된 반죽을 꺼내 가스를 제거하고 5개로 나누어 동그랗게 만들고 비닐 랩을 씌워 15분 중간 발효해 주세요.",
  "9. 반죽 하나를 가스를 빼고 납작하게 하고 커스터드를 넣어 잘 붙여 동그랗게 만들어 주세요.",
  "10. 틀에 넣고 비닐 랩을 씌워 크기가 2배로 부풀 때까지 40분 정도 발효시켜 주세요.",
  "",
  "쿠기 토핑 만들기",
  "11. 무염버터를 풀고 설탕을 섞은 다음 박력분을 섞고 우유를 넣어 섞어 주세요.",
  "",
  "12. 발효된 빵 위에 우유를 바르고 쿠키 토핑을 사선으로 짜주세요.",
  "13. 180도 오븐에서 18~20분 정도 구워 주세요.(예열 200도)",
].join("\n");

const fullCustardBreadDescription = [
  "커스터드 크림빵은 촉촉한 우유식빵 속에 부드러운 커스터드 크림을 채워 집에서 편안하게 즐길 수 있는 빵이에요.",
  "",
  "⏱️타임스탬프 Timestamp",
  "",
  "00:00 인트로 Intro",
  "00:12 빵반죽 Bread dough",
  "02:35 커스터드 크림 Custard cream",
  "04:38 빵 성형 Bread shaping",
  "07:22 쿠키 토핑 Cookie topping",
  "09:05 완성 Final Look",
  "",
  "🧈재료 Ingredients",
  "",
  "틀 사이즈 : 25cm x 7cm x 6cm",
  "",
  "| 빵 반죽",
  "170g 강력분",
  "15g 박력분",
  "15g 설탕",
  "3g 소금",
  "4g 인스턴트 드라이 이스트",
  "50g 우유",
  "30g 생크림",
  "35g 달걀 (전란)",
  "15g 연유",
  "25g 무염버터",
  "",
  "| 커스터드 크림",
  "2개 달걀노른자",
  "30g 설탕",
  "2g 바닐라빈 페이스트",
  "10g 옥수수전분",
  "150g 따뜻한 우유",
  "5g 무염버터",
  "",
  "| 쿠키 토핑",
  "10g 무염버터",
  "10g 설탕",
  "10g 박력분",
  "5g 우유",
  "",
  "Mold size : 25cm x 7cm x 6cm",
  "",
  "| Bread dough",
  "170g Bread flour",
  "15g Cake flour",
  "",
  "📝만드는 과정",
  "",
  "빵 반죽 만들기",
  "1. 밀가루에 설탕, 소금, 인스턴트 드라이 이스트를 넣고 골고루 섞어 주세요.",
  "2. 우유, 생크림, 달걀, 연유를 넣고 잘 섞어 약 10분 정도 손으로 반죽해 주세요.(반죽기 사용 권장)",
  "3. 실온 상태의 무염버터를 넣고 반죽해 매끈한 상태가 되면 볼에 넣고 비닐 랩을 씌워 주세요.",
  "4. 따뜻한 곳에서 반죽이 2~2.5배로 부풀 때까지 1시간 정도 발효시켜 주세요.",
  "",
  "커스터드 필링 만들기",
  "5. 달걀노른자에 설탕과 바닐라빈 페이스트를 넣고 잘 섞어 주세요.",
  "6. 옥수수전분을 넣고 섞은 다음 따뜻한 우유를 넣고 잘 섞은 다음 약불에 올려 가열해 주세요.",
  "7. 기포가 보글 보글 올라오면 불에서 내려 무염버터를 넣고 잘 섞어 체에 내려 비닐 랩을 덮고 식혀 주세요.",
  "",
  "8. 발효된 반죽을 꺼내 가스를 제거하고 5개로 나누어 동그랗게 만들고 비닐 랩을 씌워 15분 중간 발효해 주세요.",
  "9. 반죽 하나를 가스를 빼고 납작하게 하고 커스터드를 넣어 잘 붙여 동그랗게 만들어 주세요.",
  "10. 틀에 넣고 비닐 랩을 씌워 크기가 2배로 부풀 때까지 40분 정도 발효시켜 주세요.",
  "",
  "쿠기 토핑 만들기",
  "11. 무염버터를 풀고 설탕을 섞은 다음 박력분을 섞고 우유를 넣어 섞어 주세요.",
  "",
  "12. 발효된 빵 위에 우유를 바르고 쿠키 토핑을 사선으로 짜주세요.",
  "13. 180도 오븐에서 18~20분 정도 구워 주세요.(예열 200도)",
  "",
  "🤍",
  "",
  "시청해주셔서 감사합니다. Thank you for watching!",
].join("\n");

describe("youtube description parser v2", () => {
  it("switches from 준비재료 to 요리순서 and extracts numbered cooking steps", () => {
    const document = parseYoutubeRecipeDescription({
      title: "삼겹살 양배추 볶음",
      description: [
        "*준비재료",
        "삼겹살 500g, 소금 1/2스푼, 미림 2스푼, 후추, 튀김가루, 양배추 1/4개,   간장 2스푼, 식초 1스푼, 굴소스 1스푼, 설탕 2스푼, 다진마늘 1스푼, 통깨",
        "",
        "*요리순서",
        "1. 고기를 잘라 볼에 담아주세요",
        "2. 소금 1/2스푼, 미림 2스푼, 후추, 튀김가루를 넣고 섞어주세요",
        "3. 양배추 1/4을 썰고, 마늘을 다져주세요",
        "4. 양념장(간장 2스푼, 식초 1스푼, 굴소스 1스푼, 설탕 2스푼, 다진마늘 1스푼)을 만들어주세요",
        "5. 달군 팬에 고기를 넣고 익혀주세요",
        "6. 고기가 익으면 양배추와 양념장을 넣고 섞어주세요",
        "7. 불을 끄고 통깨를 넣어 섞어주면 완성",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.steps).toEqual([
      "고기를 잘라 볼에 담아주세요",
      "소금 1/2스푼, 미림 2스푼, 후추, 튀김가루를 넣고 섞어주세요",
      "양배추 1/4을 썰고, 마늘을 다져주세요",
      "양념장(간장 2스푼, 식초 1스푼, 굴소스 1스푼, 설탕 2스푼, 다진마늘 1스푼)을 만들어주세요",
      "달군 팬에 고기를 넣고 익혀주세요",
      "고기가 익으면 양배추와 양념장을 넣고 섞어주세요",
      "불을 끄고 통깨를 넣어 섞어주면 완성",
    ]);
  });

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
      "설탕",
      "레몬즙",
    ]);
    expect(draft.ingredients.find((ingredient) => ingredient.name === "바닐라 페이스트"))
      .toMatchObject({
        amount: 1,
        unit: "t",
        componentLabel: "타르트 반죽",
        displayText: "바닐라 페이스트 1t",
      });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "노른자"))
      .toMatchObject({
        amount: 1,
        unit: "개",
        componentLabel: "타르트 반죽",
      });
    expect(draft.ingredients.filter((ingredient) => ingredient.name === "설탕"))
      .toEqual([
        expect.objectContaining({
          amount: 35,
          unit: "g",
          componentLabel: "타르트 반죽",
          displayText: "설탕 35g",
        }),
        expect.objectContaining({
          amount: 30,
          unit: "g",
          componentLabel: "치즈 필링",
          displayText: "설탕 30g",
        }),
      ]);
    expect(draft.steps).toEqual([
      "버터를 부드럽게 풀고 설탕을 섞어요.",
      "노른자와 바닐라 페이스트를 넣고 섞어요.",
      "크림치즈에 설탕을 넣고 풀어요.",
      "식힌 타르트지에 필링을 채워요.",
    ]);
    expect(draft.stepComponentLabels).toEqual([
      "타르트 반죽",
      "타르트 반죽",
      "치즈 필링",
      "치즈 필링",
    ]);
    expect(draft.draftWarnings).toContain("원본 만들기 번호가 1, 2, 9, 10처럼 비연속이라 중간 항목 누락 가능성이 있어요.");
    expect(draft.blockingIssues).toEqual([]);
  });

  it("preserves component sections and numbered steps for custard cream bread", () => {
    const document = parseYoutubeRecipeDescription({
      title: "커스터드 크림빵 만들기",
      description: custardBreadComponentDescription,
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => [
      ingredient.componentLabel,
      ingredient.name,
      ingredient.amount,
      ingredient.unit,
      ingredient.displayText,
    ])).toEqual([
      ["빵 반죽", "강력분", 170, "g", "강력분 170g"],
      ["빵 반죽", "박력분", 15, "g", "박력분 15g"],
      ["빵 반죽", "설탕", 15, "g", "설탕 15g"],
      ["빵 반죽", "소금", 3, "g", "소금 3g"],
      ["빵 반죽", "인스턴트 드라이 이스트", 4, "g", "인스턴트 드라이 이스트 4g"],
      ["빵 반죽", "우유", 50, "g", "우유 50g"],
      ["빵 반죽", "생크림", 30, "g", "생크림 30g"],
      ["빵 반죽", "달걀", 35, "g", "달걀 35g"],
      ["빵 반죽", "연유", 15, "g", "연유 15g"],
      ["빵 반죽", "무염버터", 25, "g", "무염버터 25g"],
      ["커스터드 크림", "달걀노른자", 2, "개", "달걀노른자 2개"],
      ["커스터드 크림", "설탕", 30, "g", "설탕 30g"],
      ["커스터드 크림", "바닐라빈 페이스트", 2, "g", "바닐라빈 페이스트 2g"],
      ["커스터드 크림", "옥수수전분", 10, "g", "옥수수전분 10g"],
      ["커스터드 크림", "따뜻한 우유", 150, "g", "따뜻한 우유 150g"],
      ["커스터드 크림", "무염버터", 5, "g", "무염버터 5g"],
      ["쿠키 토핑", "무염버터", 10, "g", "무염버터 10g"],
      ["쿠키 토핑", "설탕", 10, "g", "설탕 10g"],
      ["쿠키 토핑", "박력분", 10, "g", "박력분 10g"],
      ["쿠키 토핑", "우유", 5, "g", "우유 5g"],
    ]);
    expect(draft.steps).toHaveLength(13);
    expect(draft.steps[0]).toBe("밀가루에 설탕, 소금, 인스턴트 드라이 이스트를 넣고 골고루 섞어 주세요.");
    expect(draft.steps[12]).toBe("180도 오븐에서 18~20분 정도 구워 주세요.(예열 200도)");
    expect(draft.stepComponentLabels).toEqual([
      "빵 반죽",
      "빵 반죽",
      "빵 반죽",
      "빵 반죽",
      "커스터드 필링",
      "커스터드 필링",
      "커스터드 필링",
      "커스터드 필링",
      "커스터드 필링",
      "커스터드 필링",
      "쿠키 토핑",
      "쿠키 토핑",
      "쿠키 토핑",
    ]);
  });

  it("ignores timestamps, mold sizes, and outro copy in full baking descriptions", () => {
    const document = parseYoutubeRecipeDescription({
      title: "커스터드 크림빵 만들기",
      description: fullCustardBreadDescription,
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients).toHaveLength(20);
    expect(draft.ingredients.map((ingredient) => ingredient.name)).not.toContain("틀 사이즈");
    expect(draft.ingredients.map((ingredient) => ingredient.name)).not.toContain("Mold size");
    expect(draft.steps).toHaveLength(13);
    expect(draft.steps[0]).toBe("밀가루에 설탕, 소금, 인스턴트 드라이 이스트를 넣고 골고루 섞어 주세요.");
    expect(draft.steps[12]).toBe("180도 오븐에서 18~20분 정도 구워 주세요.(예열 200도)");
    expect(draft.steps.join("\n")).not.toContain("Final Look");
    expect(draft.steps.join("\n")).not.toContain("Thank you");
  });

  it("does not treat viewer reply notes with 조금 as ingredients", () => {
    const document = parseYoutubeRecipeDescription({
      title: "주간 집밥",
      description: [
        "요청이 많아 댓글 답장이 조금 늦더라도 너그럽게 이해 부탁드려요.😊🙏🏻",
        "여러분의 댓글은 모두 읽고 있어요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients).toEqual([]);
    expect(draft.blockingIssues).toEqual(["ingredients", "steps"]);
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
    expect(draft.steps).toEqual(["생크림을 데우고 초콜릿 필링을 섞어요."]);
    expect(draft.stepComponentLabels).toEqual(["필링"]);
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
        displayText: "진간장 3스푼",
      });
    expect(draft.ingredients.find((ingredient) => ingredient.name === "후추"))
      .toMatchObject({
        amount: null,
        unit: null,
        componentLabel: "양념장",
        displayText: "후추 약간",
      });
    expect(draft.steps).toEqual([
      "목살300g을 키친타올을 이용해 핏물을 제거해주세요.",
      "믹싱볼에 목살과 양념장을 넣고 조물조물 버무려주세요.(조금 더 맛있게 드시려면 10분정도 숙성해주세요)",
      "팬에 맛있게 구워주세요.(중불)(중간에 고기를 자르면서 구워도 돼요)",
    ]);
    expect(draft.blockingIssues).toEqual([]);
  });

  it("does not treat garnish-like ingredient names as cooking steps", () => {
    const document = parseYoutubeRecipeDescription({
      title: "대파 양념밥",
      description: [
        "재료",
        "대파 1대, 양파 1개, 올리브오일 약간",
        "올리고당 2스푼",
        "",
        "만들기",
        "1. 대파를 썰어주세요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "대파",
      "양파",
      "올리브오일",
      "올리고당",
    ]);
    expect(draft.steps).toEqual(["대파를 썰어주세요."]);
    expect(draft.steps.join("\n")).not.toContain("올리브오일");
    expect(draft.steps.join("\n")).not.toContain("올리고당");
    expect(draft.blockingIssues).toEqual([]);
  });

  it("treats 레시피 as a step heading after an ingredient section", () => {
    const document = parseYoutubeRecipeDescription({
      title: "간장비빔국수",
      description: [
        "재료",
        "소면 100g",
        "간장 2스푼",
        "설탕 1스푼",
        "참기름 1스푼",
        "",
        "레시피",
        "1. 소면을 삶아 찬물에 헹궈요.",
        "2. 간장, 설탕, 참기름을 섞어 양념장을 만듭니다.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "소면",
      "간장",
      "설탕",
      "참기름",
    ]);
    expect(draft.steps).toEqual([
      "소면을 삶아 찬물에 헹궈요.",
      "간장, 설탕, 참기름을 섞어 양념장을 만듭니다.",
    ]);
  });

  it("splits unheaded slash-separated ingredient lists before prose steps", () => {
    const document = parseYoutubeRecipeDescription({
      title: "토마토 달걀볶음",
      description: [
        "토마토 달걀볶음",
        "토마토 2개 / 달걀 3개 / 대파 1/2대 / 굴소스 1스푼 / 설탕 1작은술",
        "",
        "달걀은 먼저 부드럽게 익혀 덜어둡니다.",
        "대파 향을 낸 뒤 토마토를 볶고 굴소스로 간해요.",
      ].join("\n"),
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "토마토",
      "달걀",
      "대파",
      "굴소스",
      "설탕",
    ]);
    expect(draft.steps).toEqual([
      "달걀은 먼저 부드럽게 익혀 덜어둡니다.",
      "대파 향을 낸 뒤 토마토를 볶고 굴소스로 간해요.",
    ]);
  });

  it("extracts weak prose ingredients and action clauses without a formal section", () => {
    const document = parseYoutubeRecipeDescription({
      title: "양파수프",
      description: "양파 반 개를 얇게 썰어 버터 10g에 오래 볶다가 물 300ml와 치킨스톡 1작은술을 넣으면 간단한 양파수프가 됩니다.",
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "양파",
      "버터",
      "물",
      "치킨스톡",
    ]);
    expect(draft.steps).toEqual([
      "양파 반 개를 얇게 썰어 버터 10g에 오래 볶다가",
      "물 300ml와 치킨스톡 1작은술을 넣으면 간단한 양파수프가 됩니다.",
    ]);
  });

  it("keeps recipe-like 좋아요 prose out of noise classification", () => {
    const document = parseYoutubeRecipeDescription({
      title: "고구마 요거트 간식",
      description: "고구마 1개는 전자레인지에 익히고 플레인요거트 3스푼과 견과류 조금을 올려 간식처럼 먹으면 좋아요.",
    });
    const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "고구마",
      "플레인요거트",
      "견과류",
    ]);
    expect(draft.steps).toEqual([
      "고구마 1개는 전자레인지에 익히고",
      "플레인요거트 3스푼과 견과류 조금을 올려 간식처럼 먹으면 좋아요.",
    ]);
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

  it("keeps duplicate component ingredients separated by component label", () => {
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

    expect(draft.ingredients.filter((ingredient) => ingredient.name === "설탕"))
      .toEqual([
        expect.objectContaining({
          amount: 50,
          unit: "g",
          componentLabel: "반죽",
          displayText: "설탕 50g",
        }),
        expect.objectContaining({
          amount: 20,
          unit: "g",
          componentLabel: "크림",
          displayText: "설탕 20g",
        }),
      ]);
    expect(draft.draftWarnings).not.toContain("같은 재료를 컴포넌트별로 합산했어요. 인분을 바꾸면 괄호 안 원본 수량은 자동으로 바뀌지 않아요.");
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
    expect(draft.draftWarnings).toContain("설명란에서 구조화된 재료와 만들기를 찾지 못했어요. 직접 추가해서 등록할 수 있어요.");
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
