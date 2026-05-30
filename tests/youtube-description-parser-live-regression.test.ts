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

  it("filters Cooking Tree dessert yield lines, English duplicates, and storage copy", () => {
    const draft = parseDraft([
      "오븐도 젤라틴도 없이 만드는 부드러운 딸기 우유 푸딩 디저트예요.",
      "",
      "🧈재료 Ingredients",
      "",
      "900ml 용기 1개, 250ml 컵 2개 분량",
      "",
      "| 딸기 우유 푸딩",
      "",
      "270g 생딸기",
      "540g 우유",
      "75g 설탕",
      "1g 소금",
      "60g 옥수수전분",
      "15g 무염버터",
      "4g 바닐라 익스트랙",
      "",
      "| 딸기 콩포트",
      "",
      "230g 생딸기",
      "45g 설탕",
      "8g 레몬즙",
      "3g 옥수수전분",
      "10g 물",
      "",
      "Makes 1 × 900ml container and 2 × 250ml cups",
      "",
      "| Strawberry milk pudding",
      "",
      "270g Fresh strawberries",
      "540g Milk",
      "75g Sugar",
      "",
      "📝만드는 과정",
      "",
      "딸기 우유 푸딩 만들기",
      "1. 믹서에 딸기와 우유를 넣고 곱게 갈아 체에 걸러 씨와 큰 섬유질을 제거해 주세요.",
      "2. 설탕과 소금, 옥수수전분을 넣고 완전히 섞은 다음 중약불에 올려 가열해 끓여 주세요.",
      "3. 계속 천천히 젓다가 뭉치기 시작하면 빠르게 저으며 섞고 끓어오르고 1분 정도 더 가열해 주세요.",
      "4. 불에서 내려 무염버터와 바닐라 익스트랙을 넣고 섞어 용기에 부어 주세요.",
      "(900ml 용기에 600g 정도를 담고 나머지를 푸딩 컵 2개에 나눠 담아 주세요)",
      "5. 실온에서 15분 정도 식힌 다음 윗면에 랩을 덮어 냉장실에서 1시간 정도 굳혀 주세요.",
      "",
      "딸기 콩포트 만들기",
      "6. 딸기를 다양한 크기로 잘라 냄비에 넣고 설탕, 레몬즙을 넣고 중약불에서 3~4분 정도 끓여 주세요.",
      "7. 옥수수전분과 물을 섞은 전분물을 붓고 30~1분 정도 더 끓여 주세요.",
      "8. 완전히 식힌 다음 푸딩 위에 올려 냉장고에서 3~4시간 정도 굳히고 생딸기를 올려 주세요.",
      "",
      "🧁보관방법 Storage",
      "",
      "완성한 딸기 밀크 푸딩은 밀폐하거나 랩을 씌워 냉장 보관해 주세요.",
      "냉장 보관 시 2일 이내에 먹는 것이 가장 맛있어요.",
      "생딸기와 콩포트가 올라간 디저트라 실온 보관은 추천하지 않아요.",
      "Store the strawberry milk pudding covered in the refrigerator.",
      "It tastes best within 2 days.",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => [
      ingredient.componentLabel,
      ingredient.name,
      ingredient.amount,
      ingredient.unit,
    ])).toEqual([
      ["딸기 우유 푸딩", "생딸기", 270, "g"],
      ["딸기 우유 푸딩", "우유", 540, "g"],
      ["딸기 우유 푸딩", "설탕", 75, "g"],
      ["딸기 우유 푸딩", "소금", 1, "g"],
      ["딸기 우유 푸딩", "옥수수전분", 60, "g"],
      ["딸기 우유 푸딩", "무염버터", 15, "g"],
      ["딸기 우유 푸딩", "바닐라 익스트랙", 4, "g"],
      ["딸기 콩포트", "생딸기", 230, "g"],
      ["딸기 콩포트", "설탕", 45, "g"],
      ["딸기 콩포트", "레몬즙", 8, "g"],
      ["딸기 콩포트", "옥수수전분", 3, "g"],
      ["딸기 콩포트", "물", 10, "g"],
    ]);
    expect(draft.ingredients.map((ingredient) => ingredient.name)).not.toEqual(
      expect.arrayContaining(["900ml 용기", "컵 2개 분량", "딸기 우유 푸딩", "딸기 콩포트", "Makes"]),
    );
    expect(draft.steps).toHaveLength(8);
    expect(draft.steps.join("\n")).not.toMatch(/보관|2일|Store|refrigerator|Serve/u);
    expect(draft.stepComponentLabels).toEqual([
      "딸기 우유 푸딩",
      "딸기 우유 푸딩",
      "딸기 우유 푸딩",
      "딸기 우유 푸딩",
      "딸기 우유 푸딩",
      "딸기 콩포트",
      "딸기 콩포트",
      "딸기 콩포트",
    ]);
  });

  it("does not treat storage guidance variants as cooking steps", () => {
    const draft = parseDraft([
      "재료",
      "두부 1모",
      "간장 2큰술",
      "",
      "만드는 법",
      "1. 두부를 먹기 좋게 썰어요.",
      "2. 간장을 넣고 조려요.",
      "",
      "보관 및 해동 방법 Storage Tips",
      "밀폐 용기에 담아 냉장 보관해 주세요.",
      "냉장 보관 시 2일 이내에 먹는 것이 가장 맛있어요.",
      "실온 보관은 추천하지 않아요.",
      "Store covered in the refrigerator.",
      "It tastes best within 2 days.",
      "Serve it chilled straight from the refrigerator.",
    ].join("\n"));

    expect(draft.steps).toEqual([
      "두부를 먹기 좋게 썰어요.",
      "간장을 넣고 조려요.",
    ]);
  });

  it("drops storage guidance even when it appears without a separate heading", () => {
    const draft = parseDraft([
      "재료",
      "우유 500ml",
      "설탕 50g",
      "",
      "만드는 법",
      "1. 우유와 설탕을 넣고 끓여 주세요.",
      "2. 식힌 다음 컵에 담아 주세요.",
      "냉장 보관 시 2일 이내에 먹는 것이 가장 맛있어요.",
      "실온 보관은 추천하지 않아요.",
    ].join("\n"));

    expect(draft.steps).toEqual([
      "우유와 설탕을 넣고 끓여 주세요.",
      "식힌 다음 컵에 담아 주세요.",
    ]);
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

  it("ignores substitution guidance fragments when inferring step ingredients", () => {
    const draft = parseDraft([
      "*****양념 및 재료*****",
      "황태채150g, 매실청1/2종이컵(100ml), 들기름2, 참기름2, 고추장3큰술, 간장3스푼, 꿀2스푼, 다진마늘2,",
      "통깨2스푼",
      "",
      "1. 황태채를 먹기 좋은 크기로 잘라주세요.",
      "2. 황태채를 믹싱볼에 넣고 매실청 100미리, 참기름 한바퀴반, 들기름 한바퀴반 넣고 조물조물 해주세요.",
      "3. 양념장은 고추장3큰술, 간장3스푼, 꿀2스푼, 다진마늘2큰술 넣고 잘 섞어주세요.",
      "4. 들기름 없으시면 참기름으로 더 넣어주시고 매실청 없으시면 매실음료 넣어주시고 꿀 없으시면 올리고당 넣어주세요.",
      "5. 양념장 넣고 살살살 무쳐주세요.",
      "6. 통깨를 넉넉히 넣고 조물조물 하시면 완성입니다.",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).not.toEqual(
      expect.arrayContaining(["더", "꿀 없으시면"]),
    );
    expect(draft.blockingIssues).toEqual([]);
  });

  it("does not infer prepared dish labels or carried sauce phrases from plating steps", () => {
    const draft = parseDraft([
      "레시피",
      "1. 코팅된 냄비에 통항정살은 앞뒤로 3분씩 구워주세요.",
      "2. 구운 항정살에 물 400ml, 간장 2T, 굴소스 2T, 맛술 3T, 설탕 2T, 후추 적당히, 마늘 2알, 대파 넣고 끓여주세요.",
      "3. 중간에 뒤집으면서 졸여주세요.",
      "4. 통항정살 수육은 최대한 얇게 썰어주세요.",
      "5. 상추 위에 수육 올리고 졸였던 양념 얹고 깨 뿌리면 완성.",
    ].join("\n"));

    expect(draft.ingredients.map((ingredient) => ingredient.name)).not.toEqual(
      expect.arrayContaining(["수육", "졸였던 양념"]),
    );
  });
});
