export interface ServiceGuideStep {
  id: string;
  title: string;
  description: string;
}

export interface ServiceGuideFeature extends ServiceGuideStep {
  label: string;
}

export interface ServiceGuideArticle extends ServiceGuideStep {
  steps: readonly string[];
  href?: string;
  linkLabel?: string;
}

export interface ServiceGuideFaq {
  id: string;
  title: string;
  answer: string;
}

export const SERVICE_GUIDE_STEPS = [
  {
    id: "step-find",
    title: "찾기",
    description: "제목·태그·재료로 오늘 만들 레시피를 찾아보세요.",
  },
  {
    id: "step-plan",
    title: "계획하기",
    description: "원하는 날짜와 끼니에 레시피나 남은요리를 담아 식단을 만들어요.",
  },
  {
    id: "step-shop",
    title: "장보기",
    description: "여러 끼니에 필요한 재료를 한 장보기 목록으로 준비해요.",
  },
  {
    id: "step-cook",
    title: "요리하기",
    description: "재료와 전체 조리순서를 한 화면에서 확인하며 요리해요.",
  },
  {
    id: "step-leftovers",
    title: "남은요리 활용",
    description: "남은 요리를 기록하고 다음 식사에 다시 활용해요.",
  },
] as const satisfies readonly ServiceGuideStep[];

export const SERVICE_GUIDE_FEATURES = [
  {
    id: "feature-combine",
    label: "한 번에 준비",
    title: "여러 끼니 재료 합산",
    description: "플래너에 담은 여러 식사의 재료를 장보기 목록 하나로 모아요.",
  },
  {
    id: "feature-pantry",
    label: "중복 구매 줄이기",
    title: "팬트리 재료 자동 제외",
    description: "집에 있는 재료는 장보기에서 ‘이미있음’으로 분리하고 다시 살 수도 있어요.",
  },
  {
    id: "feature-columns",
    label: "내 생활에 맞게",
    title: "사용자 정의 끼니",
    description: "설정에서 끼니 이름과 순서를 바꾸고 1개부터 5개까지 관리해요.",
  },
  {
    id: "feature-library",
    label: "다시 찾기 쉽게",
    title: "레시피북 정리",
    description: "저장한 레시피와 직접 만든 레시피북을 마이페이지에서 모아봐요.",
  },
] as const satisfies readonly ServiceGuideFeature[];

export const SERVICE_GUIDE_GUIDES = [
  {
    id: "guide-start",
    title: "처음 시작하기",
    description: "레시피는 로그인 없이 둘러볼 수 있어요.",
    steps: [
      "홈에서 제목을 검색하거나 태그를 선택해요.",
      "재료로 검색을 눌러 가지고 있는 재료를 여러 개 골라요.",
      "레시피 카드를 열어 재료와 조리순서를 확인해요.",
    ],
    href: "/",
    linkLabel: "레시피 둘러보기",
  },
  {
    id: "guide-planner",
    title: "플래너에 식사 추가",
    description: "날짜와 끼니를 정해 이번 식단을 구성해요.",
    steps: [
      "플래너에서 식사를 추가할 날짜와 끼니를 선택해요.",
      "레시피 검색, 레시피북, 남은요리, 직접 등록 중 원하는 방법을 골라요.",
      "추가한 식사는 끼니 화면에서 확인하고 관리해요.",
    ],
    href: "/planner",
    linkLabel: "플래너 열기",
  },
  {
    id: "guide-shopping",
    title: "장보기와 팬트리",
    description: "식단의 재료를 합치고 집에 있는 재료를 구분해요.",
    steps: [
      "플래너에서 장보기를 준비할 식사를 선택해요.",
      "팬트리에 있는 재료는 ‘이미있음’ 영역에서 확인해요.",
      "구매한 항목을 체크한 뒤 장보기를 완료해 팬트리에 반영해요.",
    ],
    href: "/shopping/flow",
    linkLabel: "장보기 준비하기",
  },
  {
    id: "guide-cooking",
    title: "요리모드",
    description: "필요한 재료와 전체 조리순서를 한 번에 확인해요.",
    steps: [
      "플래너 식사는 장보기 완료 뒤 요리를 시작할 수 있어요.",
      "레시피 상세에서는 플래너와 관계없이 바로 요리를 시작할 수 있어요.",
      "완료할 때 남은 양과 팬트리 반영 여부를 확인해요.",
    ],
  },
  {
    id: "guide-leftovers",
    title: "남은요리",
    description: "남은 음식을 기록해 다음 식사에 활용해요.",
    steps: [
      "요리 완료 때 남은 양이 있으면 남은요리로 기록해요.",
      "마이페이지에서 남은요리와 다 먹은 기록을 확인해요.",
      "남은요리를 플래너의 새 식사로 다시 추가할 수 있어요.",
    ],
    href: "/leftovers",
    linkLabel: "남은요리 보기",
  },
  {
    id: "guide-library",
    title: "저장/좋아요/레시피북",
    description: "다시 보고 싶은 레시피를 내 방식대로 정리해요.",
    steps: [
      "레시피 상세에서 좋아요를 누르거나 레시피북에 저장해요.",
      "저장할 때 기존 레시피북을 여러 개 고르거나 새 책을 만들어요.",
      "마이페이지에서 레시피북을 열어 저장한 레시피를 확인해요.",
    ],
    href: "/mypage?tab=recipebooks",
    linkLabel: "레시피북 보기",
  },
] as const satisfies readonly ServiceGuideArticle[];

export const SERVICE_GUIDE_FAQS = [
  {
    id: "faq-already-have",
    title: "‘이미있음’은 무엇인가요?",
    answer: "팬트리에 있어 장보기 구매 목록에서 제외된 재료예요. 필요하면 구매 항목으로 다시 옮길 수 있어요.",
  },
  {
    id: "faq-pantry-complete",
    title: "장보기를 완료하면 팬트리에 자동으로 들어가나요?",
    answer: "완료 화면에서 반영할 항목을 확인할 수 있어요. 기본 후보는 구매 체크한 재료와 ‘이미있음’ 재료이며, 아무것도 반영하지 않도록 선택할 수도 있어요.",
  },
  {
    id: "faq-shopping-readonly",
    title: "완료한 장보기 목록은 수정할 수 있나요?",
    answer: "완료한 목록은 기록 보존을 위해 읽기 전용이에요. 항목을 다시 체크하거나 제외 상태를 바꿀 수 없어요.",
  },
  {
    id: "faq-shopping-history",
    title: "지난 장보기 기록은 어디에 있나요?",
    answer: "마이페이지의 장보기 기록에서 완료한 목록을 다시 열어볼 수 있어요.",
  },
  {
    id: "faq-cooking-paths",
    title: "플래너 요리와 바로 요리는 무엇이 다른가요?",
    answer: "플래너 식사에서 시작한 요리는 해당 식사의 진행 상태와 연결돼요. 레시피 상세에서 바로 시작한 요리는 독립 요리라 플래너 식사 상태를 바꾸지 않아요.",
  },
  {
    id: "faq-meal-columns",
    title: "아침·점심·저녁 이름이나 순서를 바꿀 수 있나요?",
    answer: "설정의 끼니 관리에서 이름과 순서를 바꾸고, 식사가 없는 끼니는 삭제할 수 있어요. 끼니는 최소 1개, 최대 5개까지 사용할 수 있어요.",
  },
  {
    id: "faq-guest",
    title: "로그인하지 않고 무엇을 할 수 있나요?",
    answer: "레시피 탐색과 상세 확인, 가이드 확인, 바로 요리는 로그인 없이 가능해요. 저장·좋아요·플래너·팬트리·마이페이지 기능은 로그인이 필요해요.",
  },
  {
    id: "faq-contact-account",
    title: "문의하거나 계정 데이터를 관리하려면 어떻게 하나요?",
    answer: "운영 문의처가 설정되어 있으면 이 페이지 아래에서 확인할 수 있어요. 계정 정보와 탈퇴는 마이페이지의 설정에서 관리해요.",
  },
] as const satisfies readonly ServiceGuideFaq[];
