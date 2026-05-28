import { describe, expect, it } from "vitest";

import {
  getRecipioYoutubeParityFixture,
  RECIPIO_YOUTUBE_PARITY_FIXTURES,
} from "@/lib/server/recipio-youtube-parity-fixtures";

describe("Recipio YouTube parity fixtures", () => {
  it("locks the live Recipio sample categories to non-duplicate recipe data", () => {
    expect(RECIPIO_YOUTUBE_PARITY_FIXTURES.map((fixture) => fixture.kind)).toEqual([
      "comment_pointer",
      "description",
      "no_description_recipe",
      "target_parity",
    ]);

    expect(RECIPIO_YOUTUBE_PARITY_FIXTURES.map((fixture) => fixture.videoId)).toEqual([
      "mQUg_liCC34",
      "KBPJt2mkOh4",
      "OyXZEi9kMGU",
      "g9uOBA3j02M",
    ]);
  });

  it("captures the comment-pointer Recipio output", () => {
    const fixture = getRecipioYoutubeParityFixture("mQUg_liCC34");

    expect(fixture?.recipe.title).toBe("전자레인지 두부 그라탕");
    expect(fixture?.recipe.baseServings).toBe(1);
    expect(fixture?.recipe.ingredients.map((ingredient) => ingredient.name)).toEqual([
      "두부",
      "계란",
      "소금",
      "후추",
      "토마토 소스",
      "김치",
      "모짜렐라 치즈",
      "파슬리 가루",
    ]);
    expect(fixture?.recipe.steps).toHaveLength(3);
    expect(fixture?.recipe.steps[2]).toMatchObject({
      durationText: "5분",
      instruction:
        "모짜렐라 치즈를 취향껏 뿌리고 파슬리 가루를 솔솔 뿌린 후 랩을 씌워 전자레인지에서 5분간 돌려 완성합니다.",
    });
  });

  it("captures the description-based Recipio output", () => {
    const fixture = getRecipioYoutubeParityFixture("KBPJt2mkOh4");

    expect(fixture?.recipe.title).toBe("하와이안 무스비");
    expect(fixture?.recipe.baseServings).toBe(2);
    expect(fixture?.recipe.ingredients.map((ingredient) => ingredient.displayText)).toEqual([
      "스팸 1캔",
      "즉석밥 작은 거 2개",
      "계란 4알",
      "체다치즈 1/2장",
      "김 1장",
      "소금 1큰술",
      "설탕 3큰술",
      "참기름 1큰술",
      "간장 1큰술",
      "물 30ml",
      "미원 1꼬집",
    ]);
    expect(fixture?.recipe.steps.map((step) => step.instruction)).toEqual([
      "스팸을 4등분으로 썰어 준비합니다. 스팸통을 깨끗이 씻어 사용합니다.",
      "즉석밥 2개에 소금 1큰술, 설탕 1큰술, 참기름 1큰술을 넣고 골고루 비빕니다. 비빈 밥은 냉장고에서 식혀둡니다.",
      "계란 4알에 미원 1꼬집을 넣고 잘 풀어 몽글몽글한 스크램블 에그를 만듭니다. 미원이 감칠맛을 더해줍니다.",
      "팬에 스팸을 올리고 설탕 2큰술, 간장 1큰술, 물 30ml를 넣어 단짠단짠하게 바짝 졸여줍니다.",
      "스팸통에 랩을 깔고 스팸, 계란, 체다치즈 1/2장, 밥 순서로 꾹꾹 눌러 담습니다.",
      "김 1장을 반으로 자르고, 스팸통에서 빼낸 밥을 올려 돌돌 말아 완성합니다.",
    ]);
  });

  it("captures the no-description Recipio output without tags or cost fields", () => {
    const fixture = getRecipioYoutubeParityFixture("OyXZEi9kMGU");

    expect(fixture?.recipe.title).toBe("잿방어 껍질 숙성 스시");
    expect(fixture?.recipe.baseServings).toBe(1);
    expect(fixture?.recipe.ingredients.map((ingredient) => ingredient.displayText)).toEqual([
      "잿방어 1필렛",
      "초밥용 밥 1공기",
      "간장 약간",
    ]);
    expect(fixture?.recipe.steps).toHaveLength(8);
    expect(fixture?.recipe.steps[3]).toMatchObject({
      durationText: "720분",
      instruction:
        "냉장고에 넣어 12시간 동안 숙성시킵니다. 껍질이 붙은 쪽은 변색과 탈수를 방지해 신선도가 더 잘 유지됩니다.",
    });
  });

  it("captures the revised component-preserving custard cream bread target", () => {
    const fixture = getRecipioYoutubeParityFixture("g9uOBA3j02M");

    expect(fixture?.recipe.title).toBe("커스터드 크림빵 만들기");
    expect(fixture?.recipe.baseServings).toBe(5);
    expect(fixture?.recipe.ingredients.map((ingredient) => [
      ingredient.componentLabel,
      ingredient.displayText,
    ])).toEqual([
      ["빵 반죽", "강력분 170g"],
      ["빵 반죽", "박력분 15g"],
      ["빵 반죽", "설탕 15g"],
      ["빵 반죽", "소금 3g"],
      ["빵 반죽", "인스턴트 드라이 이스트 4g"],
      ["빵 반죽", "우유 50g"],
      ["빵 반죽", "생크림 30g"],
      ["빵 반죽", "달걀 35g"],
      ["빵 반죽", "연유 15g"],
      ["빵 반죽", "무염버터 25g"],
      ["커스터드 필링", "달걀노른자 2개"],
      ["커스터드 필링", "설탕 30g"],
      ["커스터드 필링", "바닐라빈 페이스트 2g"],
      ["커스터드 필링", "옥수수전분 10g"],
      ["커스터드 필링", "따뜻한 우유 150g"],
      ["커스터드 필링", "무염버터 5g"],
      ["쿠키 토핑", "무염버터 10g"],
      ["쿠키 토핑", "설탕 10g"],
      ["쿠키 토핑", "박력분 10g"],
      ["쿠키 토핑", "우유 5g"],
    ]);
    expect(fixture?.recipe.steps.map((step) => [
      step.componentLabel,
      step.instruction,
    ])).toEqual([
      ["빵 반죽", "밀가루에 설탕, 소금, 인스턴트 드라이 이스트를 넣고 골고루 섞어 주세요."],
      ["빵 반죽", "우유, 생크림, 달걀, 연유를 넣고 잘 섞어 약 10분 정도 손으로 반죽해 주세요.(반죽기 사용 권장)"],
      ["빵 반죽", "실온 상태의 무염버터를 넣고 반죽해 매끈한 상태가 되면 볼에 넣고 비닐 랩을 씌워 주세요."],
      ["빵 반죽", "따뜻한 곳에서 반죽이 2~2.5배로 부풀 때까지 1시간 정도 발효시켜 주세요."],
      ["커스터드 필링", "달걀노른자에 설탕과 바닐라빈 페이스트를 넣고 잘 섞어 주세요."],
      ["커스터드 필링", "옥수수전분을 넣고 섞은 다음 따뜻한 우유를 넣고 잘 섞은 다음 약불에 올려 가열해 주세요."],
      ["커스터드 필링", "기포가 보글 보글 올라오면 불에서 내려 무염버터를 넣고 잘 섞어 체에 내려 비닐 랩을 덮고 식혀 주세요."],
      ["빵 성형", "발효된 반죽을 꺼내 가스를 제거하고 5개로 나누어 동그랗게 만들고 비닐 랩을 씌워 15분 중간 발효해 주세요."],
      ["빵 성형", "반죽 하나를 가스를 빼고 납작하게 하고 커스터드를 넣어 잘 붙여 동그랗게 만들어 주세요."],
      ["빵 성형", "틀에 넣고 비닐 랩을 씌워 크기가 2배로 부풀 때까지 40분 정도 발효시켜 주세요."],
      ["쿠키 토핑", "무염버터를 풀고 설탕을 섞은 다음 박력분을 섞고 우유를 넣어 섞어 주세요."],
      ["마무리", "발효된 빵 위에 우유를 바르고 쿠키 토핑을 사선으로 짜주세요."],
      ["마무리", "180도 오븐에서 18~20분 정도 구워 주세요.(예열 200도)"],
    ]);
    expect(fixture?.recipe.steps.map((step) => step.durationText)).toEqual([
      null,
      "10분",
      null,
      "60분",
      null,
      null,
      null,
      "15분",
      null,
      "40분",
      null,
      null,
      "20분",
    ]);
  });
});
