export type RecipioYoutubeParityKind =
  | "comment_pointer"
  | "description"
  | "no_description_recipe"
  | "target_parity";

export interface RecipioYoutubeParityIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  ingredientType: "QUANT" | "TO_TASTE";
  displayText: string;
  componentLabel?: string | null;
  scalable: boolean;
}

export interface RecipioYoutubeParityStep {
  instruction: string;
  durationText: string | null;
  componentLabel?: string | null;
}

export interface RecipioYoutubeParityFixture {
  kind: RecipioYoutubeParityKind;
  videoId: string;
  youtubeUrl: string;
  sourceTitle: string;
  channel: string;
  thumbnailUrl: string;
  sourceDescription: string;
  recipe: {
    title: string;
    baseServings: number;
    ingredients: RecipioYoutubeParityIngredient[];
    steps: RecipioYoutubeParityStep[];
  };
}

function quant(
  name: string,
  amount: number,
  unit: string,
  displayText: string,
  componentLabel: string | null = null,
): RecipioYoutubeParityIngredient {
  return {
    name,
    amount,
    unit,
    ingredientType: "QUANT",
    displayText,
    componentLabel,
    scalable: true,
  };
}

function toTaste(
  name: string,
  displayText: string,
  componentLabel: string | null = null,
): RecipioYoutubeParityIngredient {
  return {
    name,
    amount: null,
    unit: null,
    ingredientType: "TO_TASTE",
    displayText,
    componentLabel,
    scalable: false,
  };
}

function step(
  instruction: string,
  durationText: string | null = null,
  componentLabel: string | null = null,
): RecipioYoutubeParityStep {
  return { instruction, durationText, componentLabel };
}

export const RECIPIO_YOUTUBE_PARITY_FIXTURES: RecipioYoutubeParityFixture[] = [
  {
    kind: "comment_pointer",
    videoId: "mQUg_liCC34",
    youtubeUrl: "https://www.youtube.com/watch?v=mQUg_liCC34",
    sourceTitle: "📌 불 쓰지 마세요!섞고 돌리면 끝_레시피 고정 댓글 참조👇🏻",
    channel: "민서네집밥 minseo_jibap",
    thumbnailUrl: "https://img.youtube.com/vi/mQUg_liCC34/hqdefault.jpg",
    sourceDescription: "",
    recipe: {
      title: "전자레인지 두부 그라탕",
      baseServings: 1,
      ingredients: [
        quant("두부", 150, "g", "두부 150g"),
        quant("계란", 1, "개", "계란 1개"),
        toTaste("소금", "소금 조금"),
        toTaste("후추", "후추 톡톡"),
        quant("토마토 소스", 4, "큰술", "토마토 소스 4큰술"),
        quant("김치", 1, "큰술", "김치 1큰술"),
        toTaste("모짜렐라 치즈", "모짜렐라 치즈 취향껏"),
        toTaste("파슬리 가루", "파슬리 가루 취향껏"),
      ],
      steps: [
        step(
          "전자레인지 가능한 용기에 두부 150g과 계란 1개를 넣습니다. 소금 조금과 후추를 톡톡 뿌린 후 두부를 으깨면서 잘 섞어줍니다.",
        ),
        step("토마토 소스 4큰술을 넣고 고르게 펴서 올린 다음 다진 김치 1큰술을 올려줍니다."),
        step(
          "모짜렐라 치즈를 취향껏 뿌리고 파슬리 가루를 솔솔 뿌린 후 랩을 씌워 전자레인지에서 5분간 돌려 완성합니다.",
          "5분",
        ),
      ],
    },
  },
  {
    kind: "description",
    videoId: "KBPJt2mkOh4",
    youtubeUrl: "https://www.youtube.com/watch?v=KBPJt2mkOh4",
    sourceTitle: "10분 만에 신혼여행 추억 소환 ✈️ 스팸통으로 끝내는 하와이안 무스비 #레시피 #신혼집밥 #무스비 #하와이",
    channel: "요계사 | 요리하는 회계사",
    thumbnailUrl: "https://img.youtube.com/vi/KBPJt2mkOh4/hqdefault.jpg",
    sourceDescription: [
      "✅ 재료 (2인분)",
      "스팸 1캔, 즉석밥(소) 2개, 계란 4알, 체다치즈 1/2장, 김 1장",
      "밥 양념: 소금 1큰술, 설탕 1큰술, 참기름 1큰술",
      "스팸 조림 양념: 설탕 2큰술, 간장 1큰술, 물 30ml",
      "계란 양념: 미원 한 꼬집",
      "📋 레시피",
      "1 스팸을 4등분으로 썰어줍니다.",
      "2 즉석밥 2개에 밥 양념(소금, 설탕, 참기름)을 넣고 비빈 후 냉장고에 잠시 식혀줍니다.",
      "3 계란 4알에 미원 한 꼬집을 넣고 몽글몽글한 스크램블 에그를 만들어줍니다.",
      "4 팬에 스팸을 올리고 조림 양념(설탕, 간장, 물)을 넣어 바짝 졸여줍니다.",
      "5 씻어놓은 빈 스팸통에 랩을 깔고 스팸, 계란, 체다치즈, 밥 순서로 꾹꾹 눌러 담습니다.",
      "6 김 1장을 반으로 자르고, 쏙 빼낸 밥을 올려 돌돌 말아주면 완성!",
    ].join("\n"),
    recipe: {
      title: "하와이안 무스비",
      baseServings: 2,
      ingredients: [
        quant("스팸", 1, "캔", "스팸 1캔"),
        quant("즉석밥 작은 거", 2, "개", "즉석밥 작은 거 2개"),
        quant("계란", 4, "알", "계란 4알"),
        quant("체다치즈", 0.5, "장", "체다치즈 1/2장"),
        quant("김", 1, "장", "김 1장"),
        quant("소금", 1, "큰술", "소금 1큰술"),
        quant("설탕", 3, "큰술", "설탕 3큰술"),
        quant("참기름", 1, "큰술", "참기름 1큰술"),
        quant("간장", 1, "큰술", "간장 1큰술"),
        quant("물", 30, "ml", "물 30ml"),
        quant("미원", 1, "꼬집", "미원 1꼬집"),
      ],
      steps: [
        step("스팸을 4등분으로 썰어 준비합니다. 스팸통을 깨끗이 씻어 사용합니다."),
        step("즉석밥 2개에 소금 1큰술, 설탕 1큰술, 참기름 1큰술을 넣고 골고루 비빕니다. 비빈 밥은 냉장고에서 식혀둡니다."),
        step("계란 4알에 미원 1꼬집을 넣고 잘 풀어 몽글몽글한 스크램블 에그를 만듭니다. 미원이 감칠맛을 더해줍니다."),
        step("팬에 스팸을 올리고 설탕 2큰술, 간장 1큰술, 물 30ml를 넣어 단짠단짠하게 바짝 졸여줍니다."),
        step("스팸통에 랩을 깔고 스팸, 계란, 체다치즈 1/2장, 밥 순서로 꾹꾹 눌러 담습니다."),
        step("김 1장을 반으로 자르고, 스팸통에서 빼낸 밥을 올려 돌돌 말아 완성합니다."),
      ],
    },
  },
  {
    kind: "no_description_recipe",
    videoId: "OyXZEi9kMGU",
    youtubeUrl: "https://www.youtube.com/watch?v=OyXZEi9kMGU",
    sourceTitle: "일본의 고급 스시 오마카세에서 사용하는 기술?",
    channel: "마법소년 김셰프",
    thumbnailUrl: "https://img.youtube.com/vi/OyXZEi9kMGU/hqdefault.jpg",
    sourceDescription: "",
    recipe: {
      title: "잿방어 껍질 숙성 스시",
      baseServings: 1,
      ingredients: [
        quant("잿방어", 1, "필렛", "잿방어 1필렛"),
        quant("초밥용 밥", 1, "공기", "초밥용 밥 1공기"),
        toTaste("간장", "간장 약간"),
      ],
      steps: [
        step("신선한 잿방어를 손질하여 필렛 상태로 준비합니다."),
        step("필렛의 절반은 껍질을 벗기고, 나머지 절반은 껍질을 그대로 붙여둔 상태로 나눕니다."),
        step("각각의 필렛을 랩으로 꼼꼼하게 감싸 공기와의 접촉을 완전히 차단합니다."),
        step(
          "냉장고에 넣어 12시간 동안 숙성시킵니다. 껍질이 붙은 쪽은 변색과 탈수를 방지해 신선도가 더 잘 유지됩니다.",
          "720분",
        ),
        step("숙성이 완료된 생선을 꺼내어 초밥용 크기로 썹니다. 껍질이 있는 쪽은 썰기 직전에 제거하거나 껍질만 남기고 살을 뜨는 기술을 사용합니다."),
        step("잿방어 등살처럼 힘줄이 있는 부위는 촘촘하게 칼집을 넣어 식감을 부드럽게 만듭니다."),
        step("준비된 초밥용 밥(샤리) 위에 고추냉이를 얹고 손질한 생선 살을 올려 모양을 잡습니다."),
        step("마지막으로 생선 표면에 간장을 살짝 발라 완성합니다."),
      ],
    },
  },
  {
    kind: "target_parity",
    videoId: "g9uOBA3j02M",
    youtubeUrl: "https://www.youtube.com/watch?v=g9uOBA3j02M",
    sourceTitle:
      "커스터드 크림빵 만들기 | 촉촉한 우유빵 | Custard Cream Bread Recipe | Soft & Moist Milk Bread Loaf",
    channel: "Cooking tree 쿠킹트리",
    thumbnailUrl: "https://img.youtube.com/vi/g9uOBA3j02M/hqdefault.jpg",
    sourceDescription: "",
    recipe: {
      title: "커스터드 크림빵 만들기",
      baseServings: 5,
      ingredients: [
        quant("강력분", 170, "g", "강력분 170g", "빵 반죽"),
        quant("박력분", 15, "g", "박력분 15g", "빵 반죽"),
        quant("설탕", 15, "g", "설탕 15g", "빵 반죽"),
        quant("소금", 3, "g", "소금 3g", "빵 반죽"),
        quant("인스턴트 드라이 이스트", 4, "g", "인스턴트 드라이 이스트 4g", "빵 반죽"),
        quant("우유", 50, "g", "우유 50g", "빵 반죽"),
        quant("생크림", 30, "g", "생크림 30g", "빵 반죽"),
        quant("달걀", 35, "g", "달걀 35g", "빵 반죽"),
        quant("연유", 15, "g", "연유 15g", "빵 반죽"),
        quant("무염버터", 25, "g", "무염버터 25g", "빵 반죽"),
        quant("달걀노른자", 2, "개", "달걀노른자 2개", "커스터드 필링"),
        quant("설탕", 30, "g", "설탕 30g", "커스터드 필링"),
        quant("바닐라빈 페이스트", 2, "g", "바닐라빈 페이스트 2g", "커스터드 필링"),
        quant("옥수수전분", 10, "g", "옥수수전분 10g", "커스터드 필링"),
        quant("따뜻한 우유", 150, "g", "따뜻한 우유 150g", "커스터드 필링"),
        quant("무염버터", 5, "g", "무염버터 5g", "커스터드 필링"),
        quant("무염버터", 10, "g", "무염버터 10g", "쿠키 토핑"),
        quant("설탕", 10, "g", "설탕 10g", "쿠키 토핑"),
        quant("박력분", 10, "g", "박력분 10g", "쿠키 토핑"),
        quant("우유", 5, "g", "우유 5g", "쿠키 토핑"),
      ],
      steps: [
        step(
          "밀가루에 설탕, 소금, 인스턴트 드라이 이스트를 넣고 골고루 섞어 주세요.",
          null,
          "빵 반죽",
        ),
        step(
          "우유, 생크림, 달걀, 연유를 넣고 잘 섞어 약 10분 정도 손으로 반죽해 주세요.(반죽기 사용 권장)",
          "10분",
          "빵 반죽",
        ),
        step(
          "실온 상태의 무염버터를 넣고 반죽해 매끈한 상태가 되면 볼에 넣고 비닐 랩을 씌워 주세요.",
          null,
          "빵 반죽",
        ),
        step(
          "따뜻한 곳에서 반죽이 2~2.5배로 부풀 때까지 1시간 정도 발효시켜 주세요.",
          "60분",
          "빵 반죽",
        ),
        step(
          "달걀노른자에 설탕과 바닐라빈 페이스트를 넣고 잘 섞어 주세요.",
          null,
          "커스터드 필링",
        ),
        step(
          "옥수수전분을 넣고 섞은 다음 따뜻한 우유를 넣고 잘 섞은 다음 약불에 올려 가열해 주세요.",
          null,
          "커스터드 필링",
        ),
        step(
          "기포가 보글 보글 올라오면 불에서 내려 무염버터를 넣고 잘 섞어 체에 내려 비닐 랩을 덮고 식혀 주세요.",
          null,
          "커스터드 필링",
        ),
        step(
          "발효된 반죽을 꺼내 가스를 제거하고 5개로 나누어 동그랗게 만들고 비닐 랩을 씌워 15분 중간 발효해 주세요.",
          "15분",
          "빵 성형",
        ),
        step(
          "반죽 하나를 가스를 빼고 납작하게 하고 커스터드를 넣어 잘 붙여 동그랗게 만들어 주세요.",
          null,
          "빵 성형",
        ),
        step(
          "틀에 넣고 비닐 랩을 씌워 크기가 2배로 부풀 때까지 40분 정도 발효시켜 주세요.",
          "40분",
          "빵 성형",
        ),
        step(
          "무염버터를 풀고 설탕을 섞은 다음 박력분을 섞고 우유를 넣어 섞어 주세요.",
          null,
          "쿠키 토핑",
        ),
        step(
          "발효된 빵 위에 우유를 바르고 쿠키 토핑을 사선으로 짜주세요.",
          null,
          "마무리",
        ),
        step(
          "180도 오븐에서 18~20분 정도 구워 주세요.(예열 200도)",
          "20분",
          "마무리",
        ),
      ],
    },
  },
];

const FIXTURES_BY_VIDEO_ID = new Map(
  RECIPIO_YOUTUBE_PARITY_FIXTURES.map((fixture) => [fixture.videoId, fixture]),
);

export function getRecipioYoutubeParityFixture(videoId: string) {
  return FIXTURES_BY_VIDEO_ID.get(videoId) ?? null;
}
