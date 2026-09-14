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
  { id: "step-find", title: "찾기", description: "레시피를 둘러보고 재료와 조리순서를 확인해요." },
  { id: "step-plan", title: "계획하기", description: "만들 날짜와 끼니, 한 번에 요리할 인분을 정해요." },
  { id: "step-shop", title: "장보기", description: "여러 계획의 재료를 모으고, 집에 있는 재료는 구분해요." },
  { id: "step-cook", title: "요리하기", description: "요리한 뒤 완성된 음식의 전체 무게를 남겨요." },
  { id: "step-log", title: "먹은 만큼 기록", description: "실제로 먹은 양을 기록하고 하루의 영양정보를 확인해요." },
] as const satisfies readonly ServiceGuideStep[];

export const SERVICE_GUIDE_FEATURES = [
  { id: "feature-plan", label: "만들 계획", title: "여러 끼를 한 번에 준비", description: "요리 계획에는 만들 인분과 예상 영양정보를, 식사 기록에는 실제로 먹은 양을 남겨요." },
  { id: "feature-nutrition", label: "먹은 기록", title: "내 식사의 영양정보", description: "재료와 양을 바탕으로 계산한 칼로리·탄수화물·단백질·지방을 실제 섭취량에 맞춰 확인해요." },
  { id: "feature-leftovers", label: "다음 끼니도", title: "남은 요리 이어 먹기", description: "한 번 만든 음식을 여러 끼에 나눠 기록할 수 있어요. 무게를 기록한 요리는 남은 양도 g으로 확인해요." },
  { id: "feature-pantry", label: "장보기까지", title: "집에 있는 재료부터", description: "여러 계획의 재료를 장보기 목록에 모으고 팬트리에 있는 재료는 ‘이미있음’으로 구분해요." },
] as const satisfies readonly ServiceGuideFeature[];

export const SERVICE_GUIDE_GUIDES = [
  {
    id: "guide-start", title: "처음 시작하기", description: "레시피와 예시 플래너는 로그인 없이 둘러볼 수 있어요.",
    steps: ["홈에서 제목을 검색하거나 태그를 선택해요.", "레시피를 열어 재료와 조리순서, 확인 가능한 영양정보를 살펴봐요.", "내 레시피를 저장하거나 계획·식사 기록을 추가할 때 로그인해 주세요."],
    href: "/", linkLabel: "레시피 둘러보기",
  },
  {
    id: "guide-planner", title: "요리 계획 세우기", description: "무엇을 얼마나 만들지 미리 정하는 공간이에요.",
    steps: ["요리 계획에서 날짜와 끼니의 + 버튼을 눌러 레시피를 담아요.", "한 번에 만들 인분을 정하고 예상 칼로리와 탄단지를 확인해요. 실제 섭취량은 식사 기록에 따로 남겨요.", "모바일은 날짜 줄을 좌우로 넘겨 주를 이동해요. 오래전 기록은 달력에서 날짜를 누르면 바로 열려요."],
    href: "/planner", linkLabel: "요리 계획 열기",
  },
  {
    id: "guide-shopping", title: "장보기와 팬트리", description: "계획한 요리에 필요한 재료를 한곳에서 준비해요.",
    steps: ["요리 계획의 장보기 버튼에서 준비할 식사를 선택해요.", "팬트리에 있는 재료는 ‘이미있음’ 영역에서 확인하고, 필요하면 구매 목록으로 옮겨요.", "구매한 항목을 체크하고 팬트리에 반영할 항목을 확인한 뒤 완료해요. 완료한 목록은 읽기 전용이에요."],
    href: "/shopping/flow", linkLabel: "장보기 준비하기",
  },
  {
    id: "guide-cooking", title: "요리하고 무게 남기기", description: "여러 끼를 나눠 먹을 요리라면 완성 직후 전체 무게를 남겨 주세요.",
    steps: ["플래너의 요리는 장보기를 완료한 뒤 시작해요. 레시피 상세에서 시작하는 바로 요리는 계획과 독립적이에요.", "재료와 조리순서를 보면서 요리하고, 완료할 때 완성된 음식의 전체 무게를 g(그램)으로 입력해요.", "전체 무게와 영양정보가 있어야 나눠 먹은 양에 맞게 영양을 계산할 수 있어요. 무게가 없는 요리는 임의로 환산하지 않아요."],
  },
  {
    id: "guide-log", title: "식사 기록과 영양정보", description: "요리 계획에 담는 것만으로 식사 기록이 생기지는 않아요. 먹은 만큼 따로 기록해 주세요.",
    steps: ["식사 기록에서 먹은 날짜와 끼니의 + 버튼을 눌러요.", "요리한 음식, 완제품 또는 식재료를 고르고 실제 먹은 양을 입력해요. 요리한 음식은 g, 다른 음식은 제공되는 단위를 사용해요.", "각 음식과 하루 합계의 칼로리·탄수화물·단백질·지방을 확인해요. 정보가 부족한 영양소는 확인 가능한 값만 표시해요."],
    href: "/planner?segment=log", linkLabel: "식사 기록 열기",
  },
  {
    id: "guide-leftovers", title: "남은 요리 나눠 먹기", description: "한 번 만든 요리를 다음 끼니에도 이어서 기록해요.",
    steps: ["남은요리에서 요리한 음식과 남은 양을 확인해요.", "다음 끼니의 식사 기록에서 같은 요리한 음식을 고르고 이번에 먹은 g을 입력해요.", "무게로 관리하는 요리는 기록한 만큼 남은 양에 반영돼요. 이전 방식으로 저장한 남은요리와 무게가 없는 요리는 같은 방식으로 영양을 계산하지 않아요."],
    href: "/leftovers", linkLabel: "남은요리 보기",
  },
] as const satisfies readonly ServiceGuideArticle[];

export const SERVICE_GUIDE_FAQS = [
  { id: "faq-plan-log", title: "요리 계획과 식사 기록은 어떻게 다른가요?", answer: "요리 계획은 만들 메뉴와 인분을 정하는 곳이고, 식사 기록은 실제 먹은 음식과 양을 남기는 곳이에요. 4인분을 만들고 1인분만 먹었다면 계획은 4인분으로, 식사 기록은 실제 먹은 양으로 남겨요." },
  { id: "faq-nutrition", title: "영양정보는 어떻게 계산하나요?", answer: "레시피의 재료와 양, 연결된 식품 영양정보를 바탕으로 계산해요. 요리한 음식은 완성 무게 대비 먹은 무게로 계산하고, 완제품·식재료는 선택한 양을 반영해요. 정보가 부족하면 확인 가능한 부분만 보여주며, 확인할 수 없는 값을 0으로 보지 않아요." },
  { id: "faq-grams", title: "모든 음식을 g으로 기록할 수 있나요?", answer: "완성 무게가 있는 요리한 음식은 g으로 기록해요. 완제품과 식재료는 정확한 환산 정보가 있을 때만 g 입력이 가능하며, 그렇지 않으면 제공되는 단위를 사용해요." },
  { id: "faq-guest", title: "로그인하지 않고 무엇을 할 수 있나요?", answer: "레시피와 가이드, 요리 계획·식사 기록의 예시 화면을 볼 수 있어요. 예시는 내 기록이 아니며, 내 계획이나 식사를 추가하고 저장하려면 로그인이 필요해요." },
  { id: "faq-preparing", title: "지금 준비 중인 기능은 무엇인가요?", answer: "YouTube 링크에서 새 레시피를 추출하는 기능, 식사 상세와 수정 기능은 준비 중이에요. 정식 출시 전에는 소셜 로그인과 회원가입도 잠시 닫아두고 있어요. 예시 플래너를 먼저 둘러보세요." },
  { id: "faq-shopping", title: "장보기와 팬트리는 어떻게 연결되나요?", answer: "팬트리에 있는 재료는 구매 목록과 분리해 확인해요. 장보기 완료 시 팬트리에 반영할 항목을 선택할 수 있고, 완료한 목록은 기록 보존을 위해 읽기 전용이에요." },
  { id: "faq-library", title: "저장한 레시피는 어디에서 보나요?", answer: "마이페이지의 레시피북에서 저장한 레시피를 다시 볼 수 있어요. 자주 만드는 메뉴를 모아두면 다음 계획에 활용하기 편해요." },
  { id: "faq-contact-account", title: "문의하거나 계정 데이터를 관리하려면 어떻게 하나요?", answer: "운영 문의처가 설정되어 있으면 이 페이지 아래에서 확인할 수 있어요. 계정 정보와 탈퇴는 마이페이지의 설정에서 관리해요." },
] as const satisfies readonly ServiceGuideFaq[];
