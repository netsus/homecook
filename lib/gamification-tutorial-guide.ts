import type {
  UserGamificationAchievementMilestoneData,
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
    body: "레시피의 저장 버튼을 눌러 레시피를 저장해보세요.",
    questKey: "first_recipe_saved",
    title: "마음에 드는 레시피 저장하기",
  },
  tutorial_planner_registered: {
    body: "레시피에서 플래너에 추가를 누르면 플래너에 끼니를 등록할 수 있어요.",
    questKey: "first_planner_registered",
    title: "플래너에 끼니 등록하기",
  },
  tutorial_shopping_list_create: {
    body: "플래너에 등록한 끼니에서 장보기를 누르면, 장보기 목록을 만들 수 있어요.",
    questKey: "first_shopping_list_created",
    title: "첫 장보기 목록 만들기",
  },
  tutorial_shopping_list_complete: {
    body: "장보기 목록에서 구매한 재료는 장보기를 완료하면 팬트리에 반영할 수 있어요.",
    questKey: "first_shopping_done",
    title: "첫 장보기 완료하기",
  },
  tutorial_cooking_complete: {
    body: "장보기 완료한 끼니에서 요리하기를 누르면 요리모드에 들어갈 수 있어요.",
    questKey: "first_cook_done",
    title: "첫 요리 완료하기",
  },
  tutorial_recipebook_created: {
    body: "마이페이지에서 나만의 새 레시피북을 만들어보세요.",
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
  return tutorialAchievementRank(step.achievement_key);
}

function tutorialAchievementRank(achievementKey: string) {
  const index = TUTORIAL_STEP_ORDER.indexOf(
    achievementKey as (typeof TUTORIAL_STEP_ORDER)[number],
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
      body: guide?.body ?? quest.description ?? `${quest.title}부터 차근차근 시작해 보세요.`,
      questKey: quest.quest_key,
      title: guide?.title ?? quest.title ?? "다음 튜토리얼 퀘스트",
    };
  }

  const quest = findMatchingQuest(activeQuests, step);
  const guide = TUTORIAL_GUIDE_BY_ACHIEVEMENT_KEY[step.achievement_key];
  const questKey =
    quest?.quest_key ??
    guide?.questKey ??
    TUTORIAL_QUEST_KEY_BY_ACHIEVEMENT_KEY[step.achievement_key] ??
    null;
  const title = guide?.title ?? quest?.title ?? step.title ?? "다음 튜토리얼 퀘스트";
  const body = guide?.body ?? quest?.description ?? `${title}부터 차근차근 시작해 보세요.`;

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

  return createTutorialGuideNotificationItem(guide, {
    createdAt: gamification?.last_updated_at ?? new Date(0).toISOString(),
    deliveryChannel: "toast",
    status: "active",
    toastEligible: true,
  });
}

function createTutorialGuideNotificationItem(
  guide: TutorialGuide,
  options: {
    createdAt: string;
    deliveryChannel: UserGamificationNotificationData["delivery_channel"];
    status: "active" | "completed";
    toastEligible: boolean;
  },
): UserGamificationNotificationData {
  return {
    body: `${guide.title} · ${guide.body}`,
    category: "tutorial",
    created_at: options.createdAt,
    delivery_channel: options.deliveryChannel,
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
      tutorial_guide_status: options.status,
    },
    priority: 0,
    seen_at: null,
    title: "튜토리얼 안내",
    toast_eligible: options.toastEligible,
  };
}

function tutorialGuideForAchievementKey(achievementKey: string): TutorialGuide | null {
  const guide = TUTORIAL_GUIDE_BY_ACHIEVEMENT_KEY[achievementKey];

  if (!guide) {
    return null;
  }

  return {
    achievementKey,
    body: guide.body,
    questKey: guide.questKey,
    title: guide.title,
  };
}

function timestamp(value: string | null | undefined) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function isCompletedTutorialMilestone(milestone: UserGamificationAchievementMilestoneData) {
  return milestone.status === "earned" ||
    (milestone.target > 0 && milestone.current >= milestone.target);
}

export function createTutorialGuideHistoryNotifications(
  gamification: UserGamificationData | null,
): UserGamificationNotificationData[] {
  if (!gamification) {
    return [];
  }

  const currentGuide = createTutorialGuideNotification(gamification);
  const tutorialCategory = (gamification.achievement_album?.categories ?? []).find(
    (category) => category.category_key === "tutorial",
  );
  const completedGuideMap = new Map<string, { earnedAt: string; guide: TutorialGuide }>();
  const addCompletedGuide = (achievementKey: string, earnedAt: string | null | undefined) => {
    const guide = tutorialGuideForAchievementKey(achievementKey);

    if (!guide) {
      return;
    }

    const nextEarnedAt = earnedAt ?? gamification.last_updated_at;
    const previous = completedGuideMap.get(achievementKey);

    if (!previous || timestamp(nextEarnedAt) > timestamp(previous.earnedAt)) {
      completedGuideMap.set(achievementKey, { earnedAt: nextEarnedAt, guide });
    }
  };

  const activeRank = currentGuide
    ? tutorialAchievementRank(String(currentGuide.payload.achievement_key ?? ""))
    : -1;
  if (activeRank > 0) {
    TUTORIAL_STEP_ORDER.slice(0, activeRank).forEach((achievementKey) => {
      addCompletedGuide(achievementKey, gamification.last_updated_at);
    });
  }

  const completedCount = Math.min(
    Math.max(gamification.tutorial?.completed_count ?? 0, 0),
    TUTORIAL_STEP_ORDER.length,
  );
  TUTORIAL_STEP_ORDER.slice(0, completedCount).forEach((achievementKey) => {
    addCompletedGuide(achievementKey, gamification.last_updated_at);
  });

  (tutorialCategory?.milestones ?? [])
    .filter(isCompletedTutorialMilestone)
    .forEach((milestone) => {
      addCompletedGuide(milestone.achievement_key, milestone.earned_at);
    });

  const completedGuides = [...completedGuideMap.values()]
    .sort((left, right) => {
      const timeDiff = timestamp(right.earnedAt) - timestamp(left.earnedAt);
      if (timeDiff !== 0) return timeDiff;
      return tutorialAchievementRank(right.guide.achievementKey) -
        tutorialAchievementRank(left.guide.achievementKey);
    })
    .map((item) =>
      createTutorialGuideNotificationItem(item.guide, {
        createdAt: item.earnedAt,
        deliveryChannel: "archive_only",
        status: "completed",
        toastEligible: false,
      })
    );
  const notifications = currentGuide
    ? [currentGuide, ...completedGuides.filter((item) => item.id !== currentGuide.id)]
    : completedGuides;

  return notifications;
}
