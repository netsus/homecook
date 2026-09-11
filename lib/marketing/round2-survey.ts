import {
  RETENTION_UNTIL,
  ROUND2_CONSENT_VERSION,
  ROUND2_PURPOSE,
  LINEAR_HOMEFLOW_SURVEY_VERSION,
  type Round2HomeflowAnswers,
  type Round2LinearHomeflowAnswers,
  type Round2RecordingAnswers,
} from "../marketing-round2";

type Question<Id extends string, Value extends string> = {
  readonly id: Id;
  readonly label: string;
  readonly noticeBefore?: string;
  readonly noticeAfter?: string;
  readonly options: readonly { readonly value: Value; readonly label: string }[];
};
type Answers = { q1: string; q2: string; q3: string; q4: string };
export type Round2Survey<AnswerSet extends Answers, Version extends string> = {
  readonly version: Version;
  readonly questions: readonly [
    Question<"q1", AnswerSet["q1"]>,
    Question<"q2", AnswerSet["q2"]>,
    Question<"q3", AnswerSet["q3"]>,
    Question<"q4", AnswerSet["q4"]>,
  ];
};

const frequencyQuestion = {
  id: "q1",
  label: "최근 7일 동안 본인이나 가족·동거인이 집에서 조리한 식사를 몇 번 먹었나요?",
  noticeAfter: "본인이 직접 만들지 않아도 가족·동거인이 집에서 조리한 식사를 포함해요. 집에서 조리한 주된 음식이 있는 한 끼를 1번으로 세며, 배달·포장 음식이나 완제품을 데우기만 한 끼니와 간식은 제외해요.",
  options: [
    { value: "none", label: "0번" },
    { value: "one_two", label: "1~2번" },
    { value: "three_five", label: "3~5번" },
    { value: "six_plus", label: "6번 이상" },
  ],
} as const;
const intentOptions = [
  { value: "yes", label: "사용해 보고 싶어요" },
  { value: "maybe", label: "상황에 따라 써볼 것 같아요" },
  { value: "no", label: "사용할 의향이 없어요" },
  { value: "unsure", label: "아직 모르겠어요" },
] as const;

/** These labels are versioned contract data, not an implemented survey screen. */
export const ROUND2_SURVEYS = {
  recording: {
    version: "r2.1-recording",
    questions: [
      frequencyQuestion,
      {
        id: "q2",
        label: "현재 집밥 식단을 주로 어떻게 기록하나요?",
        options: [
          { value: "no_record", label: "따로 기록하지 않아요" },
          { value: "photo_memo", label: "사진이나 메모로 남겨요" },
          { value: "search_app", label: "앱에서 비슷한 음식을 찾아요" },
          { value: "ingredient_entry", label: "재료와 양을 직접 입력해요" },
          { value: "reuse_saved", label: "저장한 레시피·음식이나 이전 기록을 불러와요" },
          { value: "other", label: "다른 방식으로 기록해요" },
        ],
      },
      {
        id: "q3",
        label: "이 중 가장 기대되는 기능은 무엇인가요?",
        options: [
          { value: "reuse_recipe", label: "레시피 재료 정보를 기록에 다시 쓰기" },
          { value: "portion_nutrition", label: "먹은 분량에 맞춘 추정 영양 보기" },
          { value: "record_history", label: "집밥 기록을 모아 보기" },
          { value: "none", label: "기대되는 기능이 없어요" },
        ],
      },
      {
        id: "q4",
        label: "이 방식의 집밥 기록 기능을 사용해 보고 싶나요?",
        noticeBefore: "레시피의 재료와 양을 확인·수정하고, 완성한 요리의 무게와 먹은 양을 직접 입력하는 방식이에요. 영양 정보는 추정치예요.",
        options: intentOptions,
      },
    ],
  } satisfies Round2Survey<Round2RecordingAnswers, "r2.1-recording">,
  homeflow: {
    version: "r2.1-homeflow",
    questions: [
      frequencyQuestion,
      {
        id: "q2",
        label: "현재 집밥 준비를 주로 어떻게 관리하나요?",
        options: [
          { value: "on_the_day", label: "그날그날 생각해서 준비해요" },
          { value: "memo_list", label: "메모나 장보기 목록을 써요" },
          { value: "separate_apps", label: "레시피·장보기 앱을 따로 써요" },
          { value: "shared_plan", label: "가족과 계획이나 목록을 공유해요" },
          { value: "not_managing", label: "직접 준비를 관리하지 않아요·해당 없어요" },
          { value: "other", label: "다른 방식으로 관리해요" },
        ],
      },
      {
        id: "q3",
        label: "이 중 가장 기대되는 기능은 무엇인가요?",
        options: [
          { value: "meal_plan", label: "먹을 요리 계획하기" },
          { value: "combined_shopping", label: "필요한 재료를 모아 장보기" },
          { value: "pantry_exclusion", label: "집에 있는 재료를 장보기에서 빼기" },
          { value: "leftover_management", label: "남은 요리를 다음 식사로 관리하기" },
          { value: "none", label: "기대되는 기능이 없어요" },
        ],
      },
      {
        id: "q4",
        label: "이 방식의 집밥 관리 기능을 사용해 보고 싶나요?",
        noticeBefore: "먹을 요리를 고르고, 집에 있는 재료를 직접 확인하며, 요리 완료와 남은 요리 상태를 표시하는 방식이에요. 보유 재료가 자동으로 감지되지는 않아요.",
        options: intentOptions,
      },
    ],
  } satisfies Round2Survey<Round2HomeflowAnswers, "r2.1-homeflow">,
} as const;

/** The approved linear homeflow survey has different meanings from r2.1. */
export const LINEAR_HOMEFLOW_SURVEY = {
  version: LINEAR_HOMEFLOW_SURVEY_VERSION,
  questions: [
    {
      id: "q1",
      label: "지난 7일 동안, 요리한 날은 며칠인가요?",
      options: [
        { value: "none", label: "0일" },
        { value: "one_two", label: "1~2일" },
        { value: "three_four", label: "3~4일" },
        { value: "five_seven", label: "5~7일" },
      ],
    },
    {
      id: "q2",
      label: "최근 4주 동안, 유튜브 레시피를 보고 요리한 횟수는?",
      options: [
        { value: "none", label: "0회" },
        { value: "once", label: "1회" },
        { value: "two_three", label: "2~3회" },
        { value: "four_plus", label: "4회 이상" },
      ],
    },
    {
      id: "q3",
      label: "집밥은 보통 어떻게 계획하나요?",
      noticeAfter: "가장 가까운 방식 하나 선택",
      options: [
        { value: "spontaneous", label: "계획 없이 그때그때 정함" },
        { value: "mental", label: "미리 정하고 머릿속에 기억" },
        { value: "memo", label: "메모·캡처로 대략 정리" },
        { value: "scheduled", label: "날짜별 메뉴까지 정리" },
      ],
    },
    {
      id: "q4",
      label: "집밥을 준비할 때 가장 불편한 것은?",
      options: [
        { value: "planning", label: "집밥 계획 세우기" },
        { value: "shopping", label: "집에 있는 재료 빼고 장보기 목록 만들기" },
        { value: "video", label: "요리하면서 레시피 영상 다시 보기" },
        { value: "none", label: "별로 불편하지 않음" },
      ],
    },
  ],
} as const satisfies Round2Survey<Round2LinearHomeflowAnswers, typeof LINEAR_HOMEFLOW_SURVEY_VERSION>;

/** The existing privacy route/operator facts are supplied by the page; no new operational facts are invented. */
export const ROUND2_LEAD_COPY = {
  consentVersion: ROUND2_CONSENT_VERSION,
  purpose: ROUND2_PURPOSE,
  retentionUntil: RETENTION_UNTIL,
  consentLabel: "무먹 베타 오픈 알림을 이메일로 받기 위해 이메일 주소와 신청 주제·동의 기록을 수집·이용하는 데 동의해요. 보관 기간은 2026년 11월 30일까지이며, 철회하면 해당 정보를 삭제해요.",
  optionalParticipationNotice: "동의하지 않아도 예시와 의견 남기기를 이용할 수 있어요",
  minimumAgeNotice: "만 14세 이상인 경우에만 신청해 주세요",
} as const;
