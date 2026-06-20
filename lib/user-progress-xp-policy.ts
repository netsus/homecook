import type { UserProgressEventType } from "@/types/user-progress";

export interface UserProgressXpPolicyValue {
  first: number;
  repeat: number;
}

export interface UserProgressXpGuideItem {
  description: string;
  eventType: UserProgressEventType;
  first: number;
  label: string;
  note: string;
  repeat: number;
}

export const USER_PROGRESS_XP_POLICY: Record<
  UserProgressEventType,
  UserProgressXpPolicyValue
> = {
  recipe_saved: { first: 15, repeat: 8 },
  custom_book_created: { first: 25, repeat: 10 },
  shopping_completed: { first: 40, repeat: 25 },
  cooking_completed: { first: 60, repeat: 45 },
  planner_registered: { first: 25, repeat: 5 },
  leftover_eaten: { first: 15, repeat: 8 },
};

export const USER_PROGRESS_XP_GUIDE_ITEMS: UserProgressXpGuideItem[] = [
  {
    description: "마음에 드는 레시피를 내 레시피북에 처음 담을 때 반영돼요.",
    eventType: "recipe_saved",
    first: USER_PROGRESS_XP_POLICY.recipe_saved.first,
    label: "레시피 저장",
    note: "같은 레시피는 다시 저장해도 중복 적립되지 않아요.",
    repeat: USER_PROGRESS_XP_POLICY.recipe_saved.repeat,
  },
  {
    description: "나만의 커스텀 레시피북을 만들 때 반영돼요.",
    eventType: "custom_book_created",
    first: USER_PROGRESS_XP_POLICY.custom_book_created.first,
    label: "레시피북 만들기",
    note: "반복 적립은 하루 2회까지예요.",
    repeat: USER_PROGRESS_XP_POLICY.custom_book_created.repeat,
  },
  {
    description: "장보기 리스트를 완료 처리할 때 반영돼요.",
    eventType: "shopping_completed",
    first: USER_PROGRESS_XP_POLICY.shopping_completed.first,
    label: "장보기 완료",
    note: "같은 장보기 리스트는 한 번만 반영돼요.",
    repeat: USER_PROGRESS_XP_POLICY.shopping_completed.repeat,
  },
  {
    description: "요리 완료로 남은요리 기록이 만들어질 때 반영돼요.",
    eventType: "cooking_completed",
    first: USER_PROGRESS_XP_POLICY.cooking_completed.first,
    label: "요리 완료",
    note: "같은 요리 완료 기록은 한 번만 반영돼요.",
    repeat: USER_PROGRESS_XP_POLICY.cooking_completed.repeat,
  },
  {
    description: "플래너에 식사를 새로 등록할 때 반영돼요.",
    eventType: "planner_registered",
    first: USER_PROGRESS_XP_POLICY.planner_registered.first,
    label: "플래너 등록",
    note: "반복 적립은 하루 3회, 주 12회까지예요.",
    repeat: USER_PROGRESS_XP_POLICY.planner_registered.repeat,
  },
  {
    description: "남은요리를 직접 다먹음 처리할 때 반영돼요.",
    eventType: "leftover_eaten",
    first: USER_PROGRESS_XP_POLICY.leftover_eaten.first,
    label: "남은요리 다먹음",
    note: "같은 남은요리는 한 번만 반영돼요.",
    repeat: USER_PROGRESS_XP_POLICY.leftover_eaten.repeat,
  },
];
