import { describe, expect, it } from "vitest";

import {
  adaptCandidateToFlatDraft,
  parseYoutubeRecipeDescription,
  selectPrimaryRecipeCandidate,
} from "@/lib/server/youtube-description-parser";

function parseDraft(description: string) {
  const document = parseYoutubeRecipeDescription({
    title: "live goal regression",
    description,
  });

  return adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));
}

function names(description: string) {
  return parseDraft(description).ingredients.map((ingredient) => ingredient.name);
}

describe("YouTube parser live goal regressions", () => {
  it("parses dash-separated Korean ingredient lists and ignores measurement guide lines", () => {
    const ingredientNames = names([
      "(재료)",
      "생김 - 20장",
      "쪽파 - 6개",
      "홍고추 - 1개",
      "까나리 액젓 - 1/2큰술",
      "양조간장 - 2큰술",
      "다진마늘 - 2/3큰술",
      "맛술 - 2큰술",
      "매실액 - 2큰술",
      "참기름 - 1큰술",
      "통깨 - 1큰술",
      "",
      "큰술 - 계량 스푼 큰술  (15ml)",
      "작은술 - 계량 스푼 작은술 (5ml)",
      "컵 - 계량컵 200ml",
    ].join("\n"));

    expect(ingredientNames).toEqual([
      "생김",
      "쪽파",
      "홍고추",
      "까나리 액젓",
      "양조간장",
      "다진마늘",
      "맛술",
      "매실액",
      "참기름",
      "통깨",
    ]);
  });

  it("parses baking descriptions where the ingredient heading has a trailing serving note", () => {
    const draft = parseDraft([
      "#버터쿠키#기본쿠키#버터쿠키만들기",
      "부드럽고 고소한 '기본 버터쿠키' 만들기!",
      "[재료] : 5-6cm 쿠키커터 24개 분량.",
      "무염버터 unsalted butter 100g",
      "슈가파우더 sugar powder 65g",
      "계란(전란) egg 30g",
      "박력분 cake flour 180g",
      "",
      "170도 14분",
      "(가장자리가 노릇 해질 때까지 구워주세요)",
      "",
      "1.실온에 둬서 말랑한 무염버터를 손거품기로 마요네즈 질감이 될 때까지 풀어주세요.",
      "2.뭉침없이 풀어둔 슈가파우더를 넣고 섞어주세요.",
      "3.계란을 2-3회에 나눠 넣고 잘 섞어주세요.",
      "4.박력분을 체 쳐 넣어주세요.",
      "5.주걱의 날을 세워 소보루 상태가 될 때까지 섞어주세요.",
      "6.볼 벽면에 반죽을 문질러가며 섞어주세요.",
      "7.10mm 두께로 밀어 편 다음 냉장고에 넣고 1-2시간 휴지해주세요.",
      "8.휴지 끝난 반죽을 5-6mm 두께로 밀어편 후, 쿠키커터를 찍어주세요.",
      "9.팬닝 후 예열된 오븐에 넣고 구워주세요.",
      "10.끝",
      "버터쿠키 만들때 편해요! 반죽비닐 https://example.com/product",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "무염버터",
      "슈가파우더",
      "계란",
      "박력분",
    ]);
    expect(draft.steps.length).toBeGreaterThanOrEqual(10);
    expect(draft.steps[0]).toContain("가장자리가 노릇");
    expect(draft.steps.join("\n")).not.toContain("https://example.com/product");
  });

  it("parses prose descriptions with decorative ingredient headings and compact comma ingredients", () => {
    const draft = parseDraft([
      "안녕하세요. 오늘은 황태채무침황금레시피 알려드릴게요.",
      "*****양념 및 재료*****",
      "황태채150g, 매실청1/2종이컵(100ml), 들기름2, 참기름2, 고추장3큰술, 간장3스푼,꿀2스푼,다진마늘2,",
      "통깨2스푼",
      "",
      "1. 요즘 황태채가 비싼데요 150그램 준비해 주세요.",
      "2. 먹기좋은 크기로 자르고 얇게 한번더 잘라주세요.",
      "3. 황태채를 믹싱볼에 넣고 매실청 100미리 종이컵으로 1/2컵정도 넣고 참기름 2스푼, 들기름 2스푼 넣고 조물조물 해주세요.",
      "4. 양념장은 고추장3큰술, 간장3스푼, 꿀2스푼, 다진마늘2큰술 넣고 잘 섞어주세요.",
      "5. 10분 정도 지나면 양념장 넣고 살살살 무쳐주세요.",
      "6. 통깨를 넉넉히 넣고 조물조물 하시면 완성 입니다.",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "황태채",
      "매실청",
      "들기름",
      "참기름",
      "고추장",
      "간장",
      "꿀",
      "다진마늘",
      "통깨",
    ]);
    expect(draft.steps.length).toBeGreaterThanOrEqual(6);
    expect(draft.blockingIssues).not.toContain("ingredients");
  });

  it("parses component ingredient sections with emoji, measurement guides, and numbered recipe steps", () => {
    const draft = parseDraft([
      "📋혈당 잡는 제철음식 밥도둑! 다이어트 [마늘 마늘쫑무침] 재료 준비",
      "(1스푼 = 15ml | 1컵 = 200ml = 종이컵 1컵)",
      "★ 기본 재료",
      "마늘쫑 600g 🌿",
      "마늘 3줌 🧄(얇게 썰어도 좋아요)",
      "통깨 약간",
      "",
      "★ 다이어트 저당 양념 재료",
      "저당 고추장 3스푼",
      "고춧가루 3스푼 🌶️",
      "식초 1.5스푼",
      "맛간장 1.5스푼",
      "물 3스푼",
      "저당 매실청 3스푼",
      "가루 알룰로스 1.5스푼 📉",
      "참기름 약간 🤎",
      "",
      "━━",
      "✅ 혈당 잡는 제철음식 밥도둑! 다이어트 [마늘 마늘쫑무침] 레시피",
      "1️⃣ 재료 손질: 깨끗이 씻은 마늘쫑은 먹기 좋은 5cm 길이로 일정하게 잘라 준비해 주세요.",
      "2️⃣ 황금 데치기: 끓는 물에 소금을 약간 넣고, 마늘쫑을 딱 1분 정도만 가볍게 데쳐낸 뒤 바로 찬물에 헹궈 물기를 빼줍니다.",
      "3️⃣ 양념장 만들기: 볼에 양념 재료를 섞어 소스를 만듭니다.",
      "4️⃣ 버무리 & 완성: 양념장에 데친 마늘쫑과 마늘을 넣고 조물조물 무친 뒤, 통깨 솔솔 뿌려 마무리합니다.",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "마늘쫑",
      "마늘",
      "통깨",
      "고추장",
      "고춧가루",
      "식초",
      "맛간장",
      "물",
      "매실청",
      "알룰로스",
      "참기름",
    ]);
    expect(draft.steps).toHaveLength(4);
    expect(draft.ingredients.map((ingredient) => ingredient.name)).not.toEqual(
      expect.arrayContaining(["1스푼 =", "=", "|", "= 종이컵"]),
    );
  });

  it("parses short bracket recipe blocks followed by bare ingredient lines after promo text", () => {
    const draft = parseDraft([
      "+영상 속 공동구매 OPEN!",
      "구매 링크 https://example.com/product",
      "---------------------------------------------------------------------------------------------------------",
      "카스테라 맘 편하게 먹어보기!",
      "[저당 카스테라]",
      "계란 4개",
      "우유 60g",
      "소금 1g",
      "바닐라익스트랙 3g",
      "감미료 10g",
      "꿀 또는 알룰로스 20g",
      "베이킹파우더 2g",
      "박력분 45g",
      "레몬즙 3g (없으면 생략)",
      "감미료 30g",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "계란",
      "우유",
      "소금",
      "바닐라익스트랙",
      "감미료",
      "꿀",
      "베이킹파우더",
      "박력분",
      "레몬즙",
    ]);
    expect(draft.blockingIssues).not.toContain("ingredients");
  });

  it("keeps Korean ingredients before an English duplicate ingredient section", () => {
    const draft = parseDraft([
      "안보면 후회하는 가장 맛있는 두부조림 만드는법.",
      "",
      "양념은 계량 스푼과 계량 컵 기준입니다.",
      "",
      "계량스푼 1큰술 = 15ml",
      "일반숟가락 1스푼 = 10ml",
      "계량스푼 1작은술 = 5ml",
      "계량컵 1컵 = 200ml",
      "종이컵 1컵 = 180ml",
      "",
      "재료",
      "",
      "두부 600g",
      "대파 2대",
      "양파 2/3개",
      "청양고추 3개",
      "홍고추 1개",
      "멸치다시마 육수 200ml",
      "고춧가루 1큰술(볶을때)",
      "들기름 1큰술",
      "식용유 1큰술",
      "",
      "양념장:",
      "진간장 3.5큰술",
      "고춧가루 1.5큰술",
      "다진마늘 1.5큰술",
      "멸치액젓 1큰술",
      "맛술 2큰술",
      "물엿 1큰술",
      "후추",
      "",
      "Ingredient",
      "",
      "600g of tofu",
      "2 green onions",
      "1 tablespoon of fish sauce",
      "Pepper",
      "",
      "Music provided by Audio Library Plus",
      "Watch: https://youtu.be/example",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "두부",
      "대파",
      "양파",
      "청양고추",
      "홍고추",
      "멸치다시마 육수",
      "고춧가루",
      "들기름",
      "식용유",
      "진간장",
      "다진마늘",
      "멸치액젓",
      "맛술",
      "물엿",
      "후추",
    ]);
    expect(draft.blockingIssues).not.toContain("ingredients");
  });

  it("does not import emoji dish headings and splits dot-separated ingredient tails", () => {
    const draft = parseDraft([
      "🍳콩나물밥",
      "🧂 준비 재료 : 데친 콩나물, 밥, 소고기볶음, 깨, 쪽파, 참기름, 달래간장 (또는 간장)",
      "",
      "🍴 만드는 법 :",
      "1. 밥 위에 데친 콩나물, 볶아둔 소고기볶음을 원하는 만큼 올린 뒤",
      "2. 참기름 쪼르르~ 깨솔솔, 쪽파 살짝~올려주면 완성!",
      "",
      "🍳시금치덮밥",
      "🧂 준비 재료 : 시금치 크게 한 줌, 다진 돼지고기 150g, 다진마늘 1스푼,",
      "맛술 1스푼, 간장 1스푼, 굴 소스 1/2~1 스푼, 설탕 1스푼, 기름. 밥. 계란프라이",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).toEqual(
      expect.arrayContaining(["기름", "밥", "계란프라이"]),
    );
    expect(draft.ingredients.map((ingredient) => ingredient.name)).not.toEqual(
      expect.arrayContaining(["콩나물밥", "시금치덮밥", "기름. 밥. 계란프라이"]),
    );
  });
});
