export type HomeflowDemoState = {
    purchased: string[];
    excluded: string[];
    recorded: boolean;
    shoppingCompleted: boolean;
};
export const HOMEFLOW_CHARACTER_ASSETS = {
    hero: "/assets/funnel/homeflow/characters/hero-ad-pointing-transparent.webp",
    invitation: "/assets/funnel/homeflow/characters/invitation-transparent.webp",
    success: "/assets/funnel/homeflow/characters/success-transparent.webp",
};
/** User-provided nutrition for a 300g portion, combined with the existing demo baseline. */
export const HOMEFLOW_DEMO_NUTRITION = {
    baseline: { calories: 1120, carbs: 146, protein: 72, fat: 38 },
    dinner: { calories: 608, carbs: 56, protein: 25, fat: 32 },
    total: { calories: 1728, carbs: 202, protein: 97, fat: 70 },
    note: "영양정보 · 체험 예시",
    detail: "김치볶음밥 300g의 영양정보를 반영했어요.",
} as const;
export const INITIAL_HOMEFLOW_DEMO: HomeflowDemoState = {
    purchased: ["pork", "scallion", "kimchi", "rice", "butter"], excluded: ["sugar", "chili", "soy"], recorded: false, shoppingCompleted: false,
};
export const HOMEFLOW_RECIPE = {
    name: "김치볶음밥",
    title: "100% 맛 보장하는 '김치볶음밥' 레시피!",
    channel: "추추의 한끼식사",
    url: "https://www.youtube.com/shorts/IxXeEFTf0ZQ",
    channelUrl: "https://www.youtube.com/@chuchu_cook",
    thumbnail: "/assets/funnel/homeflow/thumbnail.jpg",
    profile: "/assets/funnel/homeflow/channel-profile.jpg",
} as const;
export const HOMEFLOW_INGREDIENTS = [
    { id: "pork", name: "삼겹살", amount: "120g", shoppingName: "삼겹살", icon: "🥩", imageSrc: "/assets/ingredients/plush-v2/pork.webp" },
    { id: "scallion", name: "대파", amount: "50g", shoppingName: "대파", icon: "🌱", imageSrc: "/assets/ingredients/plush-v2/green-onion.webp" },
    { id: "kimchi", name: "잘 익은 김치", amount: "210g", shoppingName: "잘 익은 김치", icon: "🥬", imageSrc: "/assets/ingredients/plush-v2/kimchi.webp" },
    { id: "sugar", name: "설탕", amount: "3g", shoppingName: "설탕", icon: "🥣", imageSrc: "/assets/ingredients/plush-v2/sugar.webp" },
    { id: "chili", name: "고춧가루", amount: "4g", shoppingName: "고춧가루", icon: "🌶️", imageSrc: "/assets/ingredients/plush-v2/red-pepper-powder.webp" },
    { id: "soy", name: "진간장", amount: "7g", shoppingName: "진간장", icon: "🫙", imageSrc: "/assets/ingredients/plush-v2/soy-sauce.webp" },
    { id: "rice", name: "즉석밥", amount: "210g", shoppingName: "즉석밥", icon: "🍚", imageSrc: "/assets/ingredients/plush-v2/cooked-rice.webp" },
    { id: "butter", name: "버터", amount: "8g", shoppingName: "버터", icon: "🧈", imageSrc: "/assets/ingredients/plush-v2/butter.webp" },
    { id: "egg", name: "계란후라이", amount: "1개", shoppingName: "계란", icon: "🥚", imageSrc: "/assets/ingredients/plush-v2/egg.webp" },
] as const;
export const HOMEFLOW_RESULTS = {
    spontaneous: {
        title: "오늘의 감각형", quote: "오늘의 메뉴? 방금 정함",
        description: "냉장고 앞에서 시작되는 메뉴 회의.\n오늘의 메뉴, 방금 정했어요.",
        characterSrc: "/assets/funnel/homeflow/characters/spontaneous-transparent.webp", characterAlt: "냉장고 앞에서 대파와 프라이팬을 들고 아이디어를 떠올리는 캐릭터", icon: "🍳",
    },
    mental: {
        title: "머릿속 플래너형", quote: "계획은 있음. 저장 위치가 머리임.",
        description: "일주일 메뉴는 머릿속에 저장 완료.\n마트에만 가면 잠깐 로딩 중이에요.",
        characterSrc: "/assets/funnel/homeflow/characters/mental-transparent.webp", characterAlt: "장바구니를 들고 머리 위 생각 구름 속 일주일 메뉴를 떠올리는 캐릭터", icon: "💭",
    },
    memo: {
        title: "알뜰 메모형", quote: "적어두긴 했음. 어디 적었더라.",
        description: "레시피는 꼼꼼히 모아뒀어요.\n오늘도 저장한 레시피를 찾는 중!",
        characterSrc: "/assets/funnel/homeflow/characters/memo-transparent.webp", characterAlt: "메모와 휴대폰 레시피 사이에서 돋보기를 들고 메뉴를 찾는 캐릭터", icon: "📝",
    },
    scheduled: {
        title: "집밥 설계형", quote: "이번 주 메뉴? 이미 다 정했지!",
        description: "미래의 나에게 메뉴 배정 완료.\n남은 건 계획을 실행하는 것뿐!",
        characterSrc: "/assets/funnel/homeflow/characters/scheduled-transparent.webp", characterAlt: "안경을 쓰고 펜으로 요리 카드가 붙은 주간 계획판을 가리키는 캐릭터", icon: "📅",
    },
} as const;
export const HOMEFLOW_RESULT_BRIDGES = {
    planning: "저장한 레시피를 이번 주 메뉴로 옮겨볼까요?",
    shopping: "만들 요리의 재료를 모으고, 집에 등록해둔 재료는 빼볼까요?",
    video: "재료와 조리법을 큰 글씨로 모아볼까요?",
    none: "지금 방식에 더할 만한 편리함이 있는지 직접 살펴보세요.",
} as const;
