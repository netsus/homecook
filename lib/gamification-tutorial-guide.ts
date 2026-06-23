import type {
  UserGamificationData,
  UserGamificationNotificationData,
  UserGamificationQuestData,
  UserGamificationTutorialStepData,
} from "@/types/user-gamification";

const TUTORIAL_STEP_ORDER = [
  "tutorial_recipe_saved",
  "tutorial_planner_registered",
  "tutorial_shopping_list_create",
  "tutorial_shopping_list_complete",
  "tutorial_cooking_complete",
  "tutorial_recipebook_created",
] as const;

const TUTORIAL_QUEST_KEY_BY_ACHIEVEMENT_KEY: Record<string, string> = {
  tutorial_cooking_complete: "first_cook_done",
  tutorial_planner_registered: "first_planner_registered",
  tutorial_recipe_saved: "first_recipe_saved",
  tutorial_recipebook_created: "first_custom_book_created",
  tutorial_shopping_list_complete: "first_shopping_done",
  tutorial_shopping_list_create: "first_shopping_list_created",
};

const TUTORIAL_ACHIEVEMENT_KEY_BY_QUEST_KEY = Object.fromEntries(
  Object.entries(TUTORIAL_QUEST_KEY_BY_ACHIEVEMENT_KEY).map(
    ([achievementKey, questKey]) => [questKey, achievementKey],
  ),
) as Record<string, string>;

const TUTORIAL_GUIDE_BY_ACHIEVEMENT_KEY: Record<
  string,
  { body: string; questKey: string; title: string }
> = {
  tutorial_recipe_saved: {
    body: "다시 만들고 싶은 레시피를 하나 저장해보세요.",
    questKey: "first_recipe_saved",
    title: "마음에 드는 레시피 저장하기",
  },
  tutorial_planner_registered: {
    body: "오늘 먹을 끼니를 플래너에 하나 등록해보세요.",
    questKey: "first_planner_registered",
    title: "플래너에 끼니 등록하기",
  },
  tutorial_shopping_list_create: {
    body: "여러 끼니를 한 번에 장보기할 수 있어요.",
    questKey: "first_shopping_list_created",
    title: "첫 장보기 목록 만들기",
  },
  tutorial_shopping_list_complete: {
    body: "식사 준비에 필요한 장보기 리스트를 끝까지 체크해보세요.",
    questKey: "first_shopping_done",
    title: "첫 장보기 완료하기",
  },
  tutorial_cooking_complete: {
    body: "요리 완료를 기록하면 성장에 반영돼요.",
    questKey: "first_cook_done",
    title: "첫 집밥 완료하기",
  },
  tutorial_recipebook_created: {
    body: "직접 쓸 레시피북을 하나 만들어보세요.",
    questKey: "first_custom_book_created",
    title: "나만의 레시피북 생성하기",
  },
};

const TUTORIAL_TOAST_UUID_BY_ACHIEVEMENT_KEY: Record<string, string> = {
  tutorial_recipe_saved: "00000000-0000-4000-8000-000000000101",
  tutorial_planner_registered: "00000000-0000-4000-8000-000000000102",
  tutorial_shopping_list_create: "00000000-0000-4000-8000-000000000103",
  tutorial_shopping_list_complete: "00000000-0000-4000-8000-000000000104",
  tutorial_cooking_complete: "00000000-0000-4000-8000-000000000105",
  tutorial_recipebook_created: "00000000-0000-4000-8000-000000000106",
};

export interface TutorialGuide {
  achievementKey: string;
  body: string;
  questKey: string | null;
  title: string;
}

function tutorialStepRank(step: UserGamificationTutorialStepData) {
  const index = TUTORIAL_STEP_ORDER.indexOf(
    step.achievement_key as (typeof TUTORIAL_STEP_ORDER)[number],
  );

  return index === -1 ? TUTORIAL_STEP_ORDER.length : index;
}

function tutorialQuestRank(quest: UserGamificationQuestData) {
  const achievementKey = TUTORIAL_ACHIEVEMENT_KEY_BY_QUEST_KEY[quest.quest_key];
  const index = TUTORIAL_STEP_ORDER.indexOf(
    achievementKey as (typeof TUTORIAL_STEP_ORDER)[number],
  );

  return index === -1 ? TUTORIAL_STEP_ORDER.length : index;
}

function findMatchingQuest(
  quests: UserGamificationQuestData[],
  step: UserGamificationTutorialStepData,
) {
  const questKey = TUTORIAL_QUEST_KEY_BY_ACHIEVEMENT_KEY[step.achievement_key];

  return quests.find((quest) => quest.quest_key === questKey) ?? null;
}

export function getNextTutorialGuide(
  gamification: UserGamificationData | null,
): TutorialGuide | null {
  if (!gamification) {
    return null;
  }

  const activeQuests = gamification.quests?.active ?? [];
  const step = [...(gamification.tutorial?.active_steps ?? [])]
    .filter((item) => item.status === "active")
    .sort((left, right) => tutorialStepRank(left) - tutorialStepRank(right))[0];

  if (!step) {
    const quest = [...activeQuests]
      .filter((item) => item.quest_type === "tutorial" && item.status === "active")
      .sort((left, right) => tutorialQuestRank(left) - tutorialQuestRank(right))[0];

    if (!quest) {
      return null;
    }

    const achievementKey = TUTORIAL_ACHIEVEMENT_KEY_BY_QUEST_KEY[quest.quest_key] ?? quest.quest_key;
    const guide = TUTORIAL_GUIDE_BY_ACHIEVEMENT_KEY[achievementKey];

    return {
      achievementKey,
      body: quest.description ?? guide?.body ?? `${quest.title}부터 차근차근 시작해 보세요.`,
      questKey: quest.quest_key,
      title: quest.title ?? guide?.title ?? "다음 튜토리얼 퀘스트",
    };
  }

  const quest = findMatchingQuest(activeQuests, step);
  const guide = TUTORIAL_GUIDE_BY_ACHIEVEMENT_KEY[step.achievement_key];
  const questKey =
    quest?.quest_key ??
    guide?.questKey ??
    TUTORIAL_QUEST_KEY_BY_ACHIEVEMENT_KEY[step.achievement_key] ??
    null;
  const title = quest?.title ?? guide?.title ?? step.title ?? "다음 튜토리얼 퀘스트";
  const body = quest?.description ?? guide?.body ?? `${title}부터 차근차근 시작해 보세요.`;

  return {
    achievementKey: step.achievement_key,
    body,
    questKey,
    title,
  };
}

export function createTutorialGuideNotification(
  gamification: UserGamificationData | null,
): UserGamificationNotificationData | null {
  const guide = getNextTutorialGuide(gamification);

  if (!guide) {
    return null;
  }

  return {
    body: `${guide.title} · ${guide.body}`,
    category: "tutorial",
    created_at: gamification?.last_updated_at ?? new Date(0).toISOString(),
    delivery_channel: "toast",
    group_key: null,
    id:
      TUTORIAL_TOAST_UUID_BY_ACHIEVEMENT_KEY[guide.achievementKey] ??
      "00000000-0000-4000-8000-000000000199",
    notification_type: "xp_awarded",
    payload: {
      achievement_key: guide.achievementKey,
      merged_notification_ids: [],
      quest_key: guide.questKey,
      synthetic: true,
      tutorial_guide: true,
    },
    priority: 0,
    seen_at: null,
    title: "튜토리얼 안내",
    toast_eligible: true,
  };
}
