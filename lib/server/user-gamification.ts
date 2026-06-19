import {
  getUserProgressGrade,
  readUserProgress,
  type UserProgressAwardInput,
  type UserProgressDbClient,
} from "@/lib/server/user-progress";
import {
  compactGrowthNotificationsForDisplay,
  isVisibleGrowthNotification,
} from "@/lib/gamification-notifications";
import type {
  UserGamificationArchiveData,
  UserGamificationBadgeCategory,
  UserGamificationData,
  UserGamificationAchievementStatus,
  UserGamificationNotificationDeliveryChannel,
  UserGamificationNotificationData,
  UserGamificationNotificationType,
  UserGamificationQuestData,
  UserGamificationQuestStatus,
  UserGamificationQuestType,
  UserGamificationSeenData,
  UserGamificationTutorialDismissData,
} from "@/types/user-gamification";
import type {
  UserProgressData,
  UserProgressEventCounts,
  UserProgressEventType,
} from "@/types/user-progress";

interface QueryError {
  code?: string;
  message: string;
}

type MetricKey = keyof UserProgressEventCounts | "current_level";
type AchievementMetricKey =
  | "recipe_saved"
  | "recipe_registered"
  | "planner_registered"
  | "shopping_list_created"
  | "shopping_completed"
  | "cooking_completed"
  | "pantry_distinct_ingredients"
  | "leftover_eaten_manual"
  | "custom_book_created"
  | "tutorial_complete";
type QuestMetricKey = Exclude<AchievementMetricKey, "tutorial_complete">;

interface UserBadgeDefinition {
  badge_key: string;
  label: string;
  description: string;
  metric: MetricKey;
  target: number;
  category: UserGamificationBadgeCategory;
  shape_key: UserGamificationBadgeDataShapeKey;
  locked_hint: string;
}

type UserGamificationBadgeDataShapeKey =
  import("@/types/user-gamification").UserGamificationBadgeShapeKey;

interface UserQuestDefinition {
  quest_key: string;
  quest_type: UserGamificationQuestType;
  title: string;
  description: string;
  metric: QuestMetricKey;
  target: number;
}

interface UserAchievementCategoryDefinition {
  category_key: UserGamificationBadgeCategory;
  label: string;
}

interface UserAchievementDefinition {
  achievement_key: string;
  category_key: UserGamificationBadgeCategory;
  track_key: string | null;
  title: string;
  description: string;
  metric: AchievementMetricKey;
  target: number;
  badge_key: string;
  shape_key: UserGamificationBadgeDataShapeKey;
  locked_hint: string;
}

export interface UserBadgeAwardRow {
  badge_key: string;
  earned_at: string;
  seen_at: string | null;
}

export interface UserQuestProgressRow {
  quest_key: string;
  quest_type: UserGamificationQuestType;
  status: UserGamificationQuestStatus;
  progress_current: number;
  progress_target: number;
  source_event_id?: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  seen_at: string | null;
  updated_at: string;
}

export interface UserAchievementAwardRow {
  achievement_key: string;
  category_key: UserGamificationBadgeCategory;
  track_key: string | null;
  target_value: number;
  achieved_value: number;
  badge_key: string | null;
  earned_at: string;
  seen_at: string | null;
}

export interface UserGrowthActivityEventRow {
  id?: string;
  activity_type: string;
  category?: string;
  source_id: string;
  source_meta_json: unknown;
  occurred_at?: string;
}

export interface UserAchievementCounts {
  pantry_distinct_ingredients: number;
  leftover_eaten_manual: number;
  recipe_registered: number;
  shopping_list_created: number;
}

export interface UserProgressNotificationRow {
  id: string;
  notification_type: UserGamificationNotificationType;
  priority?: number | null;
  delivery_channel?: UserGamificationNotificationDeliveryChannel | null;
  toast_eligible?: boolean | null;
  group_key?: string | null;
  payload_json: unknown;
  created_at: string;
  seen_at: string | null;
}

interface NotificationSeenUpdateRow {
  id: string;
  notification_type: UserGamificationNotificationType;
  payload_json: unknown;
}

interface UserBadgeAwardInsert {
  user_id: string;
  badge_key: string;
  source_event_id: string | null;
  idempotency_key: string;
  earned_at: string;
}

interface UserAchievementAwardInsert {
  user_id: string;
  achievement_key: string;
  category_key: UserGamificationBadgeCategory;
  track_key: string | null;
  target_value: number;
  achieved_value: number;
  badge_key: string;
  source_event_id: string | null;
  source_activity_id: string | null;
  idempotency_key: string;
  earned_at: string;
}

interface UserQuestProgressUpsert {
  user_id: string;
  quest_key: string;
  quest_type: UserGamificationQuestType;
  status: UserGamificationQuestStatus;
  progress_current: number;
  progress_target: number;
  source_event_id: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  updated_at: string;
}

interface UserProgressNotificationInsert {
  user_id: string;
  notification_key: string;
  notification_type: UserGamificationNotificationType;
  source_event_id: string | null;
  payload_json: Record<string, unknown>;
  priority: number;
  delivery_channel: UserGamificationNotificationDeliveryChannel;
  toast_eligible: boolean;
  group_key: string | null;
  created_at: string;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface InsertSelectQuery<T> {
  maybeSingle(): MaybeSingleResult<T>;
}

interface InsertQuery<T> {
  select(columns: string): InsertSelectQuery<T>;
}

interface UpsertSelectQuery<T> {
  maybeSingle(): MaybeSingleResult<T>;
}

interface UpsertQuery<T> {
  select(columns: string): UpsertSelectQuery<T>;
}

interface BadgeAwardsSelectQuery {
  eq(column: string, value: string): BadgeAwardsSelectQuery;
  then: ArrayResult<UserBadgeAwardRow>["then"];
}

interface AchievementAwardsSelectQuery {
  eq(column: string, value: string): AchievementAwardsSelectQuery;
  then: ArrayResult<UserAchievementAwardRow>["then"];
}

interface QuestProgressSelectQuery {
  eq(column: string, value: string): QuestProgressSelectQuery;
  then: ArrayResult<UserQuestProgressRow>["then"];
}

interface GrowthActivitySelectQuery {
  eq(column: string, value: string): GrowthActivitySelectQuery;
  in(column: string, values: string[]): GrowthActivitySelectQuery;
  then: ArrayResult<UserGrowthActivityEventRow>["then"];
}

interface CountFilterQuery {
  eq(column: string, value: string | boolean): CountFilterQuery;
  in(column: string, values: string[]): CountFilterQuery;
  then: PromiseLike<{
    data: null;
    error: QueryError | null;
    count: number | null;
  }>["then"];
}

interface NotificationSelectQuery {
  eq(column: string, value: string): NotificationSelectQuery;
  is(column: string, value: null): NotificationSelectQuery;
  in(column: string, values: string[]): NotificationSelectQuery;
  lt(column: string, value: string): NotificationSelectQuery;
  or(expression: string): NotificationSelectQuery;
  order(column: string, options: { ascending: boolean }): NotificationSelectQuery;
  limit(count: number): NotificationSelectQuery;
  then: ArrayResult<UserProgressNotificationRow>["then"];
}

interface NotificationUpdateFilterQuery {
  eq(column: string, value: string): NotificationUpdateFilterQuery;
  in(column: string, values: string[]): NotificationUpdateFilterQuery;
  select(columns: string): ArrayResult<NotificationSeenUpdateRow>;
}

interface BadgeAwardUpdateFilterQuery {
  eq(column: string, value: string): BadgeAwardUpdateFilterQuery;
  in(column: string, values: string[]): BadgeAwardUpdateFilterQuery;
  select(columns: string): ArrayResult<{ badge_key: string }>;
}

interface AchievementAwardUpdateFilterQuery {
  eq(column: string, value: string): AchievementAwardUpdateFilterQuery;
  in(column: string, values: string[]): AchievementAwardUpdateFilterQuery;
  select(columns: string): ArrayResult<{ achievement_key: string }>;
}

interface BadgeAwardsTable {
  insert(values: UserBadgeAwardInsert): InsertQuery<UserBadgeAwardRow>;
  select(columns: string): BadgeAwardsSelectQuery;
  update(values: { seen_at: string }): BadgeAwardUpdateFilterQuery;
}

interface AchievementAwardsTable {
  insert(values: UserAchievementAwardInsert): InsertQuery<UserAchievementAwardRow>;
  select(columns: string): AchievementAwardsSelectQuery;
  update(values: { seen_at: string }): AchievementAwardUpdateFilterQuery;
}

interface QuestProgressTable {
  select(columns: string): QuestProgressSelectQuery;
  upsert(
    values: UserQuestProgressUpsert,
    options: { onConflict: "user_id,quest_key" },
  ): UpsertQuery<UserQuestProgressRow>;
}

interface GrowthActivityTable {
  select(columns: string): GrowthActivitySelectQuery;
}

interface CountTable {
  select(columns: string, options: { count: "exact"; head: true }): CountFilterQuery;
}

interface NotificationsTable {
  insert(values: UserProgressNotificationInsert): InsertQuery<{ id: string }>;
  select(columns: string): NotificationSelectQuery;
  update(values: { seen_at: string }): NotificationUpdateFilterQuery;
}

export interface UserGamificationDbClient {
  from(table: "user_badge_awards"): BadgeAwardsTable;
  from(table: "user_achievement_awards"): AchievementAwardsTable;
  from(table: "user_quest_progress"): QuestProgressTable;
  from(table: "user_progress_notifications"): NotificationsTable;
  from(table: "user_growth_activity_events"): GrowthActivityTable;
  from(table: "shopping_lists"): CountTable;
  from(table: "recipes"): CountTable;
}

export const USER_NOTIFICATION_PRIORITIES: Record<UserGamificationNotificationType, number> = {
  level_up: 1,
  achievement_unlocked: 2,
  badge_unlocked: 2,
  xp_awarded: 4,
};

export const USER_BADGE_METADATA: Record<string, {
  category: UserGamificationBadgeCategory;
  shape_key: UserGamificationBadgeDataShapeKey;
  locked_hint: string;
}> = {
  first_recipe_saved: {
    category: "recipe",
    shape_key: "bookmark",
    locked_hint: "레시피를 하나 저장해 보세요.",
  },
  recipe_collector: {
    category: "recipe",
    shape_key: "ribbon",
    locked_hint: "레시피 5개를 저장해 보세요.",
  },
  first_shopping_done: {
    category: "shopping",
    shape_key: "leaf",
    locked_hint: "장보기 리스트를 완료해 보세요.",
  },
  shopping_rhythm: {
    category: "shopping",
    shape_key: "shield",
    locked_hint: "장보기 완료를 3번 기록해 보세요.",
  },
  first_cook_done: {
    category: "cooking",
    shape_key: "pot",
    locked_hint: "요리 완료를 한 번 기록해 보세요.",
  },
  kitchen_routine_starter: {
    category: "cooking",
    shape_key: "bowl",
    locked_hint: "요리 완료를 3번 기록해 보세요.",
  },
  first_custom_book_created: {
    category: "recipebook",
    shape_key: "plate",
    locked_hint: "나만의 레시피북을 만들어 보세요.",
  },
  level_5_homecook: {
    category: "cooking",
    shape_key: "shield",
    locked_hint: "레벨 5에 도달해 보세요.",
  },
};

export const USER_BADGE_DEFINITIONS: UserBadgeDefinition[] = [
  {
    badge_key: "first_recipe_saved",
    label: "첫 레시피 저장",
    description: "처음으로 다시 보고 싶은 레시피를 저장했어요.",
    metric: "recipe_saved_distinct_ever",
    target: 1,
    ...USER_BADGE_METADATA.first_recipe_saved,
  },
  {
    badge_key: "first_shopping_done",
    label: "첫 장보기 완료",
    description: "첫 장보기 리스트를 끝까지 완료했어요.",
    metric: "shopping_completed",
    target: 1,
    ...USER_BADGE_METADATA.first_shopping_done,
  },
  {
    badge_key: "first_cook_done",
    label: "첫 집밥 완성",
    description: "첫 요리 완료를 기록했어요.",
    metric: "cooking_completed",
    target: 1,
    ...USER_BADGE_METADATA.first_cook_done,
  },
  {
    badge_key: "first_custom_book_created",
    label: "나만의 책 시작",
    description: "직접 레시피북을 만들어 집밥 기록을 정리했어요.",
    metric: "custom_book_created",
    target: 1,
    ...USER_BADGE_METADATA.first_custom_book_created,
  },
  {
    badge_key: "recipe_collector",
    label: "레시피 수집가",
    description: "레시피 5개를 저장해 다음 식사를 준비했어요.",
    metric: "recipe_saved_distinct_ever",
    target: 5,
    ...USER_BADGE_METADATA.recipe_collector,
  },
  {
    badge_key: "kitchen_routine_starter",
    label: "루틴의 시작",
    description: "요리 완료를 3번 기록했어요.",
    metric: "cooking_completed",
    target: 3,
    ...USER_BADGE_METADATA.kitchen_routine_starter,
  },
  {
    badge_key: "shopping_rhythm",
    label: "장보기 리듬",
    description: "장보기 완료를 3번 기록했어요.",
    metric: "shopping_completed",
    target: 3,
    ...USER_BADGE_METADATA.shopping_rhythm,
  },
  {
    badge_key: "level_5_homecook",
    label: "집밥 러너",
    description: "레벨 5에 도달했어요.",
    metric: "current_level",
    target: 5,
    ...USER_BADGE_METADATA.level_5_homecook,
  },
];

export const USER_ACHIEVEMENT_CATEGORIES: UserAchievementCategoryDefinition[] = [
  { category_key: "tutorial", label: "튜토리얼" },
  { category_key: "recipe", label: "레시피" },
  { category_key: "planner", label: "플래너" },
  { category_key: "shopping", label: "장보기" },
  { category_key: "cooking", label: "요리" },
  { category_key: "pantry", label: "팬트리" },
  { category_key: "leftovers", label: "남은요리" },
  { category_key: "recipebook", label: "레시피북" },
];

const TUTORIAL_BASE_ACHIEVEMENT_KEYS = [
  "tutorial_recipe_saved",
  "tutorial_planner_registered",
  "tutorial_shopping_list_create",
  "tutorial_shopping_list_complete",
  "tutorial_cooking_complete",
  "tutorial_recipebook_created",
] as const;

const DEFAULT_ACHIEVEMENT_COUNTS: UserAchievementCounts = {
  pantry_distinct_ingredients: 0,
  leftover_eaten_manual: 0,
  recipe_registered: 0,
  shopping_list_created: 0,
};

function createThresholdAchievements(input: {
  categoryKey: UserGamificationBadgeCategory;
  trackKey: string;
  metric: AchievementMetricKey;
  titlePrefix: string;
  description: string;
  thresholds: number[];
  shapeKey: UserGamificationBadgeDataShapeKey;
  lockedHint: string;
}): UserAchievementDefinition[] {
  return input.thresholds.map((target) => ({
    achievement_key: `${input.trackKey}_${target}`,
    category_key: input.categoryKey,
    track_key: input.trackKey,
    title: `${input.titlePrefix} ${target}`,
    description: input.description,
    metric: input.metric,
    target,
    badge_key: `${input.trackKey}_${target}`,
    shape_key: input.shapeKey,
    locked_hint: input.lockedHint,
  }));
}

export const USER_ACHIEVEMENT_DEFINITIONS: UserAchievementDefinition[] = [
  {
    achievement_key: "tutorial_recipe_saved",
    category_key: "tutorial",
    track_key: "tutorial",
    title: "첫 레시피 저장",
    description: "마음에 드는 레시피를 처음 저장했어요.",
    metric: "recipe_saved",
    target: 1,
    badge_key: "tutorial_recipe_saved",
    shape_key: "bookmark",
    locked_hint: "마음에 드는 레시피를 저장해 보세요.",
  },
  {
    achievement_key: "tutorial_planner_registered",
    category_key: "tutorial",
    track_key: "tutorial",
    title: "첫 식단 등록",
    description: "플래너에 첫 끼니를 등록했어요.",
    metric: "planner_registered",
    target: 1,
    badge_key: "tutorial_planner_registered",
    shape_key: "shield",
    locked_hint: "플래너에 끼니를 하나 등록해 보세요.",
  },
  {
    achievement_key: "tutorial_shopping_list_create",
    category_key: "tutorial",
    track_key: "tutorial",
    title: "첫 장보기 목록 만들기",
    description: "처음으로 장보기 목록을 만들었어요.",
    metric: "shopping_list_created",
    target: 1,
    badge_key: "tutorial_shopping_list_create",
    shape_key: "leaf",
    locked_hint: "레시피 1개 이상으로 장보기 목록을 만들어 보세요.",
  },
  {
    achievement_key: "tutorial_shopping_list_complete",
    category_key: "tutorial",
    track_key: "tutorial",
    title: "첫 장보기 완료",
    description: "첫 장보기 목록을 끝까지 완료했어요.",
    metric: "shopping_completed",
    target: 1,
    badge_key: "tutorial_shopping_list_complete",
    shape_key: "leaf",
    locked_hint: "장보기 목록을 완료해 보세요.",
  },
  {
    achievement_key: "tutorial_cooking_complete",
    category_key: "tutorial",
    track_key: "tutorial",
    title: "첫 집밥 완료",
    description: "첫 요리 완료를 기록했어요.",
    metric: "cooking_completed",
    target: 1,
    badge_key: "tutorial_cooking_complete",
    shape_key: "pot",
    locked_hint: "요리 완료를 기록해 보세요.",
  },
  {
    achievement_key: "tutorial_recipebook_created",
    category_key: "tutorial",
    track_key: "tutorial",
    title: "첫 레시피북 생성",
    description: "나만의 레시피북을 처음 만들었어요.",
    metric: "custom_book_created",
    target: 1,
    badge_key: "tutorial_recipebook_created",
    shape_key: "plate",
    locked_hint: "나만의 레시피북을 만들어 보세요.",
  },
  {
    achievement_key: "tutorial_complete",
    category_key: "tutorial",
    track_key: "tutorial_complete",
    title: "튜토리얼 완료",
    description: "집밥의 기본 흐름을 모두 경험했어요.",
    metric: "tutorial_complete",
    target: TUTORIAL_BASE_ACHIEVEMENT_KEYS.length,
    badge_key: "tutorial_complete",
    shape_key: "ribbon",
    locked_hint: "튜토리얼 업적 6개를 모두 채워 보세요.",
  },
  ...createThresholdAchievements({
    categoryKey: "recipe",
    trackKey: "recipe_saved",
    metric: "recipe_saved",
    titlePrefix: "레시피 보관",
    description: "저장한 레시피와 내가 등록한 레시피를 꾸준히 모았어요.",
    thresholds: [5, 20, 50, 100, 300, 1000],
    shapeKey: "bookmark",
    lockedHint: "저장하거나 직접 등록한 레시피 수를 늘려 보세요.",
  }),
  ...createThresholdAchievements({
    categoryKey: "recipe",
    trackKey: "recipe_registered",
    metric: "recipe_registered",
    titlePrefix: "레시피 등록",
    description: "직접 만들거나 유튜브로 가져온 레시피를 기록했어요.",
    thresholds: [3, 10, 30, 100, 300, 600, 1000],
    shapeKey: "ribbon",
    lockedHint: "직접 등록 또는 유튜브 등록으로 레시피를 추가해 보세요.",
  }),
  ...createThresholdAchievements({
    categoryKey: "planner",
    trackKey: "planner_registered",
    metric: "planner_registered",
    titlePrefix: "플래너 등록",
    description: "끼니를 플래너에 꾸준히 등록했어요.",
    thresholds: [3, 10, 30, 100, 300, 1000, 3000],
    shapeKey: "shield",
    lockedHint: "플래너에 끼니를 등록해 보세요.",
  }),
  ...createThresholdAchievements({
    categoryKey: "shopping",
    trackKey: "shopping_completed",
    metric: "shopping_completed",
    titlePrefix: "장보기 완료",
    description: "장보기 목록을 끝까지 완료했어요.",
    thresholds: [3, 10, 30, 100, 300, 700, 1300],
    shapeKey: "leaf",
    lockedHint: "장보기 목록을 완료해 보세요.",
  }),
  ...createThresholdAchievements({
    categoryKey: "cooking",
    trackKey: "cooking_completed",
    metric: "cooking_completed",
    titlePrefix: "요리 완료",
    description: "집밥 완료 기록을 꾸준히 남겼어요.",
    thresholds: [3, 10, 30, 100, 300, 1000, 3000],
    shapeKey: "pot",
    lockedHint: "요리 완료를 기록해 보세요.",
  }),
  ...createThresholdAchievements({
    categoryKey: "pantry",
    trackKey: "pantry_distinct",
    metric: "pantry_distinct_ingredients",
    titlePrefix: "팬트리 재료",
    description: "팬트리에 서로 다른 재료를 채웠어요.",
    thresholds: [10, 30, 60, 120, 250, 600],
    shapeKey: "plate",
    lockedHint: "팬트리에 새로운 재료를 추가해 보세요.",
  }),
  ...createThresholdAchievements({
    categoryKey: "leftovers",
    trackKey: "leftover_eaten",
    metric: "leftover_eaten_manual",
    titlePrefix: "남은요리 정리",
    description: "남은요리를 직접 다먹음 처리했어요.",
    thresholds: [3, 10, 30, 100, 300, 1000],
    shapeKey: "bowl",
    lockedHint: "남은요리를 직접 다먹음 처리해 보세요.",
  }),
];

export const USER_QUEST_DEFINITIONS: UserQuestDefinition[] = [
  {
    quest_key: "first_recipe_saved",
    quest_type: "tutorial",
    title: "마음에 드는 레시피 저장하기",
    description: "다시 만들고 싶은 레시피를 하나 저장해보세요.",
    metric: "recipe_saved",
    target: 1,
  },
  {
    quest_key: "first_planner_registered",
    quest_type: "tutorial",
    title: "플래너에 끼니 등록하기",
    description: "오늘 먹을 끼니를 플래너에 하나 등록해보세요.",
    metric: "planner_registered",
    target: 1,
  },
  {
    quest_key: "first_shopping_list_created",
    quest_type: "tutorial",
    title: "첫 장보기 목록 만들기",
    description: "여러 끼니를 한번에 장보기할 수 있어요.",
    metric: "shopping_list_created",
    target: 1,
  },
  {
    quest_key: "first_shopping_done",
    quest_type: "tutorial",
    title: "첫 장보기 완료하기",
    description: "식사 준비에 필요한 장보기 리스트를 끝까지 체크해보세요.",
    metric: "shopping_completed",
    target: 1,
  },
  {
    quest_key: "first_cook_done",
    quest_type: "tutorial",
    title: "첫 집밥 완료하기",
    description: "요리 완료를 기록하면 성장에 반영돼요.",
    metric: "cooking_completed",
    target: 1,
  },
  {
    quest_key: "first_custom_book_created",
    quest_type: "tutorial",
    title: "나만의 레시피북 생성하기",
    description: "직접 쓸 레시피북을 하나 만들어보세요.",
    metric: "custom_book_created",
    target: 1,
  },
];

const SOURCE_EVENT_LABELS: Record<UserProgressEventType, string> = {
  cooking_completed: "요리 완료",
  shopping_completed: "장보기 완료",
  recipe_saved: "레시피 저장",
  custom_book_created: "레시피북 생성",
  planner_registered: "플래너 등록",
  leftover_eaten: "남은요리 정리",
};

const SOURCE_EVENT_CATEGORIES: Record<UserProgressEventType, UserGamificationBadgeCategory> = {
  cooking_completed: "cooking",
  shopping_completed: "shopping",
  recipe_saved: "recipe",
  custom_book_created: "recipebook",
  planner_registered: "planner",
  leftover_eaten: "leftovers",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readUserGamification(
  dbClient: UserGamificationDbClient & UserProgressDbClient,
  userId: string,
): Promise<{ data: UserGamificationData | null; error: QueryError | null }> {
  try {
    const progressResult = await readUserProgress(dbClient, userId);

    if (progressResult.error || !progressResult.data) {
      return {
        data: null,
        error: progressResult.error ?? { message: "missing user progress result" },
      };
    }

    const [activityRowsResult, achievementCountsResult] = await Promise.all([
      readGrowthActivityRows(dbClient, userId),
      readAchievementCounts(dbClient, userId),
    ]);

    const contextError = activityRowsResult.error ?? achievementCountsResult.error;

    if (contextError) {
      return { data: null, error: contextError };
    }

    const activityRows = activityRowsResult.data ?? [];
    const achievementCounts = mergeAchievementCounts(
      achievementCountsResult.data ?? DEFAULT_ACHIEVEMENT_COUNTS,
      deriveAchievementCountsFromActivityRows(activityRows),
    );

    const reconcileResult = await reconcileUserGamification(dbClient, {
      userId,
      progress: progressResult.data,
      achievementCounts,
      notificationMode: "silent",
    });

    if (reconcileResult.error) {
      return { data: null, error: reconcileResult.error };
    }

    const [badgesResult, questsResult, achievementsResult, notificationsResult] = await Promise.all([
      readBadgeAwardRows(dbClient, userId),
      readQuestProgressRows(dbClient, userId),
      readAchievementAwardRows(dbClient, userId),
      readNotificationRows(dbClient, userId),
    ]);

    const error = badgesResult.error ?? questsResult.error ?? achievementsResult.error ?? notificationsResult.error;

    if (error) {
      return { data: null, error };
    }

    return {
      data: buildUserGamificationData({
        progress: progressResult.data,
        badgeRows: badgesResult.data ?? [],
        questRows: questsResult.data ?? [],
        achievementRows: achievementsResult.data ?? [],
        activityRows,
        achievementCounts,
        notificationRows: notificationsResult.data ?? [],
      }),
      error: null,
    };
  } catch (error) {
    return { data: null, error: toQueryError(error, "unknown gamification read failure") };
  }
}

export async function projectUserGamificationAfterProgressEvent(
  dbClient: UserGamificationDbClient,
  input: {
    userId: string;
    progressEventId: string;
    awardInput: UserProgressAwardInput;
    xpDelta: number;
    previousLevel: number;
    progress: UserProgressData;
  },
): Promise<{ error: QueryError | null }> {
  try {
    const now = input.awardInput.occurredAt ?? new Date().toISOString();
    const groupKey = `progress-event:${input.progressEventId}`;
    const notificationResult = await insertProgressNotification(dbClient, {
      userId: input.userId,
      notificationKey: `xp-toast:${input.progressEventId}`,
      notificationType: "xp_awarded",
      sourceEventId: input.progressEventId,
      payload: {
        event_type: input.awardInput.eventType,
        label: SOURCE_EVENT_LABELS[input.awardInput.eventType],
        xp_delta: input.xpDelta,
      },
      groupKey,
      now,
    });

    if (notificationResult.error) {
      return { error: notificationResult.error };
    }

    if (input.previousLevel < input.progress.level.current_level) {
      const previousGrade = getUserProgressGrade(input.previousLevel);
      const currentGrade = getUserProgressGrade(input.progress.level.current_level);
      const levelUpResult = await insertProgressNotification(dbClient, {
        userId: input.userId,
        notificationKey: `level-up:${input.userId}:${input.progress.level.current_level}`,
        notificationType: "level_up",
        sourceEventId: input.progressEventId,
        payload: {
          previous_level: input.previousLevel,
          current_level: input.progress.level.current_level,
          previous_grade: previousGrade,
          grade: currentGrade,
          grade_upgrade: false,
        },
        groupKey,
        now,
      });

      if (levelUpResult.error) {
        return { error: levelUpResult.error };
      }

      if (previousGrade.grade_key !== currentGrade.grade_key) {
        const gradeUpResult = await insertProgressNotification(dbClient, {
          userId: input.userId,
          notificationKey: `grade-up:${input.userId}:${currentGrade.grade_key}`,
          notificationType: "level_up",
          sourceEventId: input.progressEventId,
          payload: {
            previous_level: input.previousLevel,
            current_level: input.progress.level.current_level,
            previous_grade: previousGrade,
            grade: currentGrade,
            grade_upgrade: true,
          },
          groupKey,
          now,
        });

        if (gradeUpResult.error) {
          return { error: gradeUpResult.error };
        }
      }
    }

    return reconcileUserGamification(dbClient, {
      userId: input.userId,
      progress: input.progress,
      sourceEventId: input.progressEventId,
      notificationMode: "live",
      now,
    });
  } catch (error) {
    return { error: toQueryError(error, "unknown gamification projection failure") };
  }
}

export async function projectUserGamificationAfterActivityEvent(
  dbClient: UserGamificationDbClient & UserProgressDbClient,
  input: {
    userId: string;
    activityId: string;
    occurredAt?: string;
  },
): Promise<{ error: QueryError | null }> {
  try {
    const progressResult = await readUserProgress(dbClient, input.userId);

    if (progressResult.error || !progressResult.data) {
      return {
        error: progressResult.error ?? { message: "missing user progress result" },
      };
    }

    const [activityRowsResult, achievementCountsResult] = await Promise.all([
      readGrowthActivityRows(dbClient, input.userId),
      readAchievementCounts(dbClient, input.userId),
    ]);
    const error = activityRowsResult.error ?? achievementCountsResult.error;

    if (error) {
      return { error };
    }

    const achievementCounts = mergeAchievementCounts(
      achievementCountsResult.data ?? DEFAULT_ACHIEVEMENT_COUNTS,
      deriveAchievementCountsFromActivityRows(activityRowsResult.data ?? []),
    );

    return reconcileUserGamification(dbClient, {
      userId: input.userId,
      progress: progressResult.data,
      sourceActivityId: input.activityId,
      achievementCounts,
      notificationMode: "live",
      now: input.occurredAt ?? new Date().toISOString(),
    });
  } catch (error) {
    return { error: toQueryError(error, "unknown gamification activity projection failure") };
  }
}

export async function markUserGamificationNotificationsSeen(
  dbClient: UserGamificationDbClient,
  userId: string,
  notificationIds: string[],
): Promise<{ data: UserGamificationSeenData | null; error: QueryError | null }> {
  const uniqueIds = [...new Set(notificationIds)];

  if (uniqueIds.length === 0) {
    return { data: { seen_notification_ids: [] }, error: null };
  }

  try {
    const seenAt = new Date().toISOString();
    const updateResult = await dbClient
      .from("user_progress_notifications")
      .update({ seen_at: seenAt })
      .eq("user_id", userId)
      .in("id", uniqueIds)
      .select("id, notification_type, payload_json");

    if (updateResult.error || !updateResult.data) {
      return {
        data: null,
        error: updateResult.error ?? { message: "missing notification seen result" },
      };
    }

    await markAwardRowsSeenForNotifications(
      dbClient,
      userId,
      seenAt,
      updateResult.data,
    );

    return {
      data: {
        seen_notification_ids: updateResult.data.map((row) => row.id),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: toQueryError(error, "unknown notification seen failure") };
  }
}

async function markAwardRowsSeenForNotifications(
  dbClient: UserGamificationDbClient,
  userId: string,
  seenAt: string,
  rows: NotificationSeenUpdateRow[],
) {
  const achievementKeys = new Set<string>();
  const badgeKeys = new Set<string>();

  for (const row of rows) {
    if (
      row.notification_type !== "achievement_unlocked" &&
      row.notification_type !== "badge_unlocked"
    ) {
      continue;
    }

    const payload = normalizePayload(row.payload_json);
    const badgeKey = readPayloadString(payload, "badge_key");

    if (badgeKey) {
      badgeKeys.add(badgeKey);
    }

    if (row.notification_type === "achievement_unlocked") {
      const achievementKey = readPayloadString(payload, "achievement_key");

      if (achievementKey) {
        achievementKeys.add(achievementKey);
      }
    }
  }

  const updates: Array<Promise<unknown>> = [];

  if (achievementKeys.size > 0) {
    updates.push(
      Promise.resolve(
        dbClient
          .from("user_achievement_awards")
          .update({ seen_at: seenAt })
          .eq("user_id", userId)
          .in("achievement_key", [...achievementKeys])
          .select("achievement_key"),
      ),
    );
  }

  if (badgeKeys.size > 0) {
    updates.push(
      Promise.resolve(
        dbClient
          .from("user_badge_awards")
          .update({ seen_at: seenAt })
          .eq("user_id", userId)
          .in("badge_key", [...badgeKeys])
          .select("badge_key"),
      ),
    );
  }

  if (updates.length === 0) {
    return;
  }

  await Promise.all(updates).catch(() => undefined);
}

export async function dismissUserGamificationTutorialQuest(
  dbClient: UserGamificationDbClient & UserProgressDbClient,
  userId: string,
  questKey: string,
): Promise<{ data: UserGamificationTutorialDismissData | null; error: QueryError | null }> {
  const definition = USER_QUEST_DEFINITIONS.find(
    (quest) => quest.quest_key === questKey && quest.quest_type === "tutorial",
  );

  if (!definition) {
    return {
      data: null,
      error: { code: "UNKNOWN_TUTORIAL_QUEST", message: "unknown tutorial quest" },
    };
  }

  try {
    const progressResult = await readUserProgress(dbClient, userId);

    if (progressResult.error || !progressResult.data) {
      return {
        data: null,
        error: progressResult.error ?? { message: "missing user progress result" },
      };
    }

    const now = new Date().toISOString();
    const [activityRowsResult, achievementCountsResult, questRowsResult] = await Promise.all([
      readGrowthActivityRows(dbClient, userId),
      readAchievementCounts(dbClient, userId),
      readQuestProgressRows(dbClient, userId),
    ]);
    const contextError = activityRowsResult.error ?? achievementCountsResult.error ?? questRowsResult.error;

    if (contextError) {
      return { data: null, error: contextError };
    }

    const achievementCounts = mergeAchievementCounts(
      achievementCountsResult.data ?? DEFAULT_ACHIEVEMENT_COUNTS,
      deriveAchievementCountsFromActivityRows(activityRowsResult.data ?? []),
    );
    const progressCurrent = getQuestMetricValue(progressResult.data, achievementCounts, definition.metric);
    const existing = (questRowsResult.data ?? []).find((row) => row.quest_key === questKey);
    const upsertResult = await dbClient
      .from("user_quest_progress")
      .upsert(
        {
          user_id: userId,
          quest_key: definition.quest_key,
          quest_type: definition.quest_type,
          status: "dismissed",
          progress_current: progressCurrent,
          progress_target: definition.target,
          source_event_id: existing?.source_event_id ?? null,
          completed_at: existing?.completed_at ?? (progressCurrent >= definition.target ? now : null),
          dismissed_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,quest_key" },
      )
      .select("quest_key, quest_type, status, progress_current, progress_target, completed_at, dismissed_at, seen_at, updated_at")
      .maybeSingle();

    if (upsertResult.error || !upsertResult.data) {
      return {
        data: null,
        error: upsertResult.error ?? { message: "missing tutorial dismiss result" },
      };
    }

    return {
      data: {
        quest_key: questKey,
        status: "dismissed",
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: toQueryError(error, "unknown tutorial dismiss failure") };
  }
}

export function buildUserGamificationData({
  progress,
  badgeRows,
  questRows,
  achievementRows = [],
  activityRows = [],
  achievementCounts = DEFAULT_ACHIEVEMENT_COUNTS,
  notificationRows,
}: {
  progress: UserProgressData;
  badgeRows: UserBadgeAwardRow[];
  questRows: UserQuestProgressRow[];
  achievementRows?: UserAchievementAwardRow[];
  activityRows?: UserGrowthActivityEventRow[];
  achievementCounts?: UserAchievementCounts;
  notificationRows: UserProgressNotificationRow[];
}): UserGamificationData {
  const mergedAchievementCounts = mergeAchievementCounts(
    achievementCounts,
    deriveAchievementCountsFromActivityRows(activityRows),
  );
  const badgeRowsByKey = new Map(badgeRows.map((row) => [row.badge_key, row]));
  const earned = USER_BADGE_DEFINITIONS
    .map((definition) => {
      const row = badgeRowsByKey.get(definition.badge_key);
      return row ? toEarnedBadgeData(definition, row) : null;
    })
    .filter((badge): badge is NonNullable<typeof badge> => Boolean(badge))
    .sort(compareEarnedBadges);
  const locked = USER_BADGE_DEFINITIONS
    .filter((definition) => !badgeRowsByKey.has(definition.badge_key))
    .map((definition) => toLockedBadgeData(definition, progress));
  const questRowsByKey = new Map(questRows.map((row) => [row.quest_key, row]));
  const questData = USER_QUEST_DEFINITIONS.map((definition) =>
    toQuestData(definition, questRowsByKey.get(definition.quest_key), progress, mergedAchievementCounts),
  );
  const activeQuests = questData
    .filter((quest) => quest.quest_type === "tutorial" && quest.status === "active")
    .sort(compareActiveQuests)
    .slice(0, 3);
  const completedRecent = questData
    .filter((quest) => quest.quest_type === "standard" && quest.status === "completed")
    .sort(compareCompletedQuests)
    .slice(0, 3);
  const achievementAlbum = buildAchievementAlbumData({
    progress,
    achievementRows,
    achievementCounts: mergedAchievementCounts,
  });
  const tutorialCategory = achievementAlbum.categories.find(
    (category) => category.category_key === "tutorial",
  );
  const dismissedAchievementKeys = new Set(
    questRows
      .filter((row) => row.status === "dismissed")
      .map((row) => getTutorialAchievementKeyForQuest(row.quest_key))
      .filter((key): key is string => Boolean(key)),
  );
  const activeTutorialSteps = (tutorialCategory?.milestones ?? [])
    .filter((milestone) =>
      milestone.status === "active" && !dismissedAchievementKeys.has(milestone.achievement_key)
    )
    .map((milestone) => ({
      achievement_key: milestone.achievement_key,
      title: milestone.title,
      current: milestone.current,
      target: milestone.target,
      status: milestone.status,
    }));
  const notificationData = notificationRows
    .map(toNotificationData)
    .filter(isVisibleGrowthNotification);
  const unseen = compactGrowthNotificationsForDisplay(
    notificationData
      .filter((notification) => !notification.seen_at)
      .sort(compareNotificationPriority),
  );
  const priorityUnseen = compactGrowthNotificationsForDisplay(
    notificationData
      .filter((notification) => !notification.seen_at && notification.toast_eligible)
      .sort(compareNotificationPriority),
  );
  const archivePreview = compactGrowthNotificationsForDisplay(
    notificationData.sort(compareNotificationArchive),
  ).slice(0, 5);

  return {
    level: {
      current_level: progress.level.current_level,
      total_xp: progress.level.total_xp,
      xp_to_next_level: progress.level.xp_to_next_level,
      progress_percent: progress.level.progress_percent,
    },
    grade: getUserProgressGrade(progress.level.current_level),
    featured_badges: earned.slice(0, 3),
    badges: {
      earned,
      locked,
    },
    quests: {
      active: activeQuests,
      completed_recent: completedRecent,
    },
    tutorial: {
      category_key: "tutorial",
      completed_count: tutorialCategory?.earned_count ?? 0,
      total_count: tutorialCategory?.total_count ?? 0,
      active_steps: activeTutorialSteps,
    },
    achievement_album: achievementAlbum,
    notifications: {
      unseen,
      priority_unseen: priorityUnseen,
      archive_preview: archivePreview,
    },
    last_updated_at: progress.last_updated_at,
  };
}

function buildAchievementAlbumData({
  progress,
  achievementRows,
  achievementCounts,
}: {
  progress: UserProgressData;
  achievementRows: UserAchievementAwardRow[];
  achievementCounts: UserAchievementCounts;
}) {
  const rowsByKey = new Map(achievementRows.map((row) => [row.achievement_key, row]));
  const activatedTracks = new Set<string>();
  const milestones = USER_ACHIEVEMENT_DEFINITIONS.map((definition) => {
    const row = rowsByKey.get(definition.achievement_key);
    const current = getAchievementMetricValue(progress, achievementCounts, rowsByKey, definition);
    const trackKey = definition.track_key ?? definition.category_key;
    const activationKey = `${definition.category_key}:${trackKey}`;
    let status: UserGamificationAchievementStatus = "locked";

    if (row) {
      status = "earned";
    } else if (
      definition.achievement_key !== "tutorial_complete" &&
      !activatedTracks.has(activationKey)
    ) {
      status = "active";
      activatedTracks.add(activationKey);
    } else if (definition.achievement_key === "tutorial_complete" && current >= definition.target) {
      status = "active";
    }

    if (row) {
      activatedTracks.add(activationKey);
    }

    return {
      achievement_key: definition.achievement_key,
      track_key: definition.track_key,
      title: definition.title,
      description: definition.description,
      current,
      target: definition.target,
      status,
      earned_at: row?.earned_at ?? null,
      locked_hint: status === "earned" ? null : definition.locked_hint,
      badge: {
        badge_key: definition.badge_key,
        shape_key: definition.shape_key,
        category: definition.category_key,
      },
    };
  });

  const categories = USER_ACHIEVEMENT_CATEGORIES.map((category) => {
    const categoryMilestones = milestones.filter(
      (milestone) => milestone.badge.category === category.category_key,
    );
    const earnedCount = categoryMilestones.filter((milestone) => milestone.status === "earned").length;

    return {
      category_key: category.category_key,
      label: category.label,
      earned_count: earnedCount,
      total_count: categoryMilestones.length,
      milestones: categoryMilestones,
    };
  });
  const earnedCount = categories.reduce((sum, category) => sum + category.earned_count, 0);
  const totalCount = categories.reduce((sum, category) => sum + category.total_count, 0);
  const completedCategoryCount = categories.filter(
    (category) => category.total_count > 0 && category.earned_count === category.total_count,
  ).length;

  return {
    summary: {
      earned_count: earnedCount,
      total_count: totalCount,
      completed_category_count: completedCategoryCount,
    },
    categories,
  };
}

export async function readUserGamificationArchive(
  dbClient: UserGamificationDbClient,
  userId: string,
  options: { limit: number; cursor: string | null },
): Promise<{ data: UserGamificationArchiveData | null; error: QueryError | null }> {
  try {
    const cursor = options.cursor ? decodeArchiveCursor(options.cursor) : null;
    const pageSize = options.limit + 1;
    let query = dbClient
      .from("user_progress_notifications")
      .select("id, notification_type, priority, delivery_channel, toast_eligible, group_key, payload_json, created_at, seen_at")
      .eq("user_id", userId)
      .in("delivery_channel", ["toast", "archive_only"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageSize);

    if (cursor) {
      query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }

    const result = await query;

    if (result.error || !result.data) {
      return {
        data: null,
        error: result.error ?? { message: "missing gamification archive result" },
      };
    }

    const visibleRows = result.data
      .map((row) => ({
        data: toNotificationData(row),
        row,
      }))
      .filter((entry) => isVisibleGrowthNotification(entry.data));
    const rows = visibleRows.slice(0, options.limit);
    const hasNext = visibleRows.length > options.limit;
    const last = rows.at(-1);

    return {
      data: {
        items: rows.map((entry) => entry.data),
        next_cursor: hasNext && last ? encodeArchiveCursor(last.row) : null,
        has_next: hasNext,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: toQueryError(error, "unknown gamification archive failure") };
  }
}

async function reconcileUserGamification(
  dbClient: UserGamificationDbClient,
  input: {
    userId: string;
    progress: UserProgressData;
    sourceEventId?: string;
    sourceActivityId?: string;
    achievementCounts?: UserAchievementCounts;
    notificationMode?: "live" | "silent";
    now?: string;
  },
): Promise<{ error: QueryError | null }> {
  const now = input.now ?? new Date().toISOString();
  const notificationMode = input.notificationMode ?? "live";
  const achievementCounts = input.achievementCounts ?? DEFAULT_ACHIEVEMENT_COUNTS;
  const [achievementRowsResult, questRowsResult] = await Promise.all([
    readAchievementAwardRows(dbClient, input.userId),
    readQuestProgressRows(dbClient, input.userId),
  ]);

  const readError = achievementRowsResult.error ?? questRowsResult.error;

  if (readError) {
    return { error: readError };
  }

  const existingAchievementRows = new Map(
    (achievementRowsResult.data ?? []).map((row) => [row.achievement_key, row]),
  );
  const existingQuestRows = new Map((questRowsResult.data ?? []).map((row) => [row.quest_key, row]));

  for (const definition of USER_ACHIEVEMENT_DEFINITIONS) {
    const progressCurrent = getAchievementMetricValue(
      input.progress,
      achievementCounts,
      existingAchievementRows,
      definition,
    );

    if (progressCurrent < definition.target) {
      continue;
    }

    const achievementResult = await insertAchievementAward(dbClient, {
      userId: input.userId,
      definition,
      achievedValue: progressCurrent,
      sourceEventId: input.sourceEventId ?? null,
      sourceActivityId: input.sourceActivityId ?? null,
      now,
    });

    if (achievementResult.error) {
      return { error: achievementResult.error };
    }

    if (achievementResult.row) {
      existingAchievementRows.set(definition.achievement_key, achievementResult.row);
    }

    if (notificationMode === "live" && achievementResult.created) {
      const notificationResult = await insertProgressNotification(dbClient, {
        userId: input.userId,
        notificationKey: `achievement:${definition.achievement_key}:${input.userId}`,
        notificationType: "achievement_unlocked",
        sourceEventId: input.sourceEventId ?? null,
        payload: {
          achievement_key: definition.achievement_key,
          category_key: definition.category_key,
          track_key: definition.track_key,
          title: definition.title,
          description: definition.description,
          badge_key: definition.badge_key,
        },
        groupKey: input.sourceEventId
          ? `progress-event:${input.sourceEventId}`
          : input.sourceActivityId
            ? `growth-activity:${input.sourceActivityId}`
            : null,
        now,
      });

      if (notificationResult.error) {
        return { error: notificationResult.error };
      }
    }
  }

  for (const definition of USER_BADGE_DEFINITIONS) {
    const progressCurrent = getMetricValue(input.progress, definition.metric);

    if (progressCurrent < definition.target) {
      continue;
    }

    const badgeResult = await insertBadgeAward(dbClient, {
      userId: input.userId,
      definition,
      sourceEventId: input.sourceEventId ?? null,
      now,
    });

    if (badgeResult.error) {
      return { error: badgeResult.error };
    }
  }

  for (const definition of USER_QUEST_DEFINITIONS) {
    const existing = existingQuestRows.get(definition.quest_key);
    const progressCurrent = getQuestMetricValue(input.progress, achievementCounts, definition.metric);
    const completed = progressCurrent >= definition.target;
    const dismissedAt = existing?.dismissed_at ?? null;
    const status: UserGamificationQuestStatus = dismissedAt
      ? "dismissed"
      : completed
        ? "completed"
        : "active";
    const completedAt = completed ? existing?.completed_at ?? now : null;
    const upsertResult = await dbClient
      .from("user_quest_progress")
      .upsert(
        {
          user_id: input.userId,
          quest_key: definition.quest_key,
          quest_type: definition.quest_type,
          status,
          progress_current: progressCurrent,
          progress_target: definition.target,
          source_event_id: input.sourceEventId ?? existing?.source_event_id ?? null,
          completed_at: completedAt,
          dismissed_at: dismissedAt,
          updated_at: now,
        },
        { onConflict: "user_id,quest_key" },
      )
      .select("quest_key, quest_type, status, progress_current, progress_target, source_event_id, completed_at, dismissed_at, seen_at, updated_at")
      .maybeSingle();

    if (upsertResult.error || !upsertResult.data) {
      return {
        error: upsertResult.error ?? { message: "missing quest progress upsert result" },
      };
    }

  }

  return { error: null };
}

async function readBadgeAwardRows(
  dbClient: UserGamificationDbClient,
  userId: string,
): Promise<{ data: UserBadgeAwardRow[] | null; error: QueryError | null }> {
  const result = await dbClient
    .from("user_badge_awards")
    .select("badge_key, earned_at, seen_at")
    .eq("user_id", userId);

  return result;
}

async function readQuestProgressRows(
  dbClient: UserGamificationDbClient,
  userId: string,
): Promise<{ data: UserQuestProgressRow[] | null; error: QueryError | null }> {
  const result = await dbClient
    .from("user_quest_progress")
    .select("quest_key, quest_type, status, progress_current, progress_target, source_event_id, completed_at, dismissed_at, seen_at, updated_at")
    .eq("user_id", userId);

  return result;
}

async function readAchievementAwardRows(
  dbClient: UserGamificationDbClient,
  userId: string,
): Promise<{ data: UserAchievementAwardRow[] | null; error: QueryError | null }> {
  const result = await dbClient
    .from("user_achievement_awards")
    .select("achievement_key, category_key, track_key, target_value, achieved_value, badge_key, earned_at, seen_at")
    .eq("user_id", userId);

  return result;
}

async function readGrowthActivityRows(
  dbClient: UserGamificationDbClient,
  userId: string,
): Promise<{ data: UserGrowthActivityEventRow[] | null; error: QueryError | null }> {
  const result = await dbClient
    .from("user_growth_activity_events")
    .select("activity_type, source_id, source_meta_json")
    .eq("user_id", userId)
    .in("activity_type", ["pantry_item_added", "leftover_eaten", "recipe_registered"]);

  return result;
}

async function readAchievementCounts(
  dbClient: UserGamificationDbClient,
  userId: string,
): Promise<{ data: UserAchievementCounts | null; error: QueryError | null }> {
  const [shoppingListResult, recipeResult] = await Promise.all([
    dbClient
      .from("shopping_lists")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    dbClient
      .from("recipes")
      .select("id", { count: "exact", head: true })
      .eq("created_by", userId)
      .in("source_type", ["manual", "youtube"]),
  ]);

  const error = shoppingListResult.error ?? recipeResult.error;
  if (error) {
    return { data: null, error };
  }

  return {
    data: {
      ...DEFAULT_ACHIEVEMENT_COUNTS,
      shopping_list_created: shoppingListResult.count ?? 0,
      recipe_registered: recipeResult.count ?? 0,
    },
    error: null,
  };
}

async function readNotificationRows(
  dbClient: UserGamificationDbClient,
  userId: string,
): Promise<{ data: UserProgressNotificationRow[] | null; error: QueryError | null }> {
  const [unseenResult, archiveResult] = await Promise.all([
    dbClient
      .from("user_progress_notifications")
      .select("id, notification_type, priority, delivery_channel, toast_eligible, group_key, payload_json, created_at, seen_at")
      .eq("user_id", userId)
      .in("delivery_channel", ["toast", "archive_only"])
      .is("seen_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5),
    dbClient
      .from("user_progress_notifications")
      .select("id, notification_type, priority, delivery_channel, toast_eligible, group_key, payload_json, created_at, seen_at")
      .eq("user_id", userId)
      .in("delivery_channel", ["toast", "archive_only"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5),
  ]);

  const error = unseenResult.error ?? archiveResult.error;
  if (error) {
    return { data: null, error };
  }

  const rowsById = new Map<string, UserProgressNotificationRow>();
  for (const row of [...(unseenResult.data ?? []), ...(archiveResult.data ?? [])]) {
    rowsById.set(row.id, row);
  }

  return { data: [...rowsById.values()], error: null };
}

async function insertAchievementAward(
  dbClient: UserGamificationDbClient,
  input: {
    userId: string;
    definition: UserAchievementDefinition;
    achievedValue: number;
    sourceEventId: string | null;
    sourceActivityId: string | null;
    now: string;
  },
): Promise<{ created: boolean; row: UserAchievementAwardRow | null; error: QueryError | null }> {
  const result = await dbClient
    .from("user_achievement_awards")
    .insert({
      user_id: input.userId,
      achievement_key: input.definition.achievement_key,
      category_key: input.definition.category_key,
      track_key: input.definition.track_key,
      target_value: input.definition.target,
      achieved_value: input.achievedValue,
      badge_key: input.definition.badge_key,
      source_event_id: input.sourceEventId,
      source_activity_id: input.sourceActivityId,
      idempotency_key: `achievement:${input.definition.achievement_key}:${input.userId}`,
      earned_at: input.now,
    })
    .select("achievement_key, category_key, track_key, target_value, achieved_value, badge_key, earned_at, seen_at")
    .maybeSingle();

  if (isDuplicateInsert(result.error)) {
    return { created: false, row: null, error: null };
  }

  if (result.error || !result.data) {
    return {
      created: false,
      row: null,
      error: result.error ?? { message: "missing achievement award insert result" },
    };
  }

  return { created: true, row: result.data, error: null };
}

async function insertBadgeAward(
  dbClient: UserGamificationDbClient,
  input: {
    userId: string;
    definition: UserBadgeDefinition;
    sourceEventId: string | null;
    now: string;
  },
): Promise<{ created: boolean; error: QueryError | null }> {
  const result = await dbClient
    .from("user_badge_awards")
    .insert({
      user_id: input.userId,
      badge_key: input.definition.badge_key,
      source_event_id: input.sourceEventId,
      idempotency_key: `badge:${input.definition.badge_key}:${input.userId}`,
      earned_at: input.now,
    })
    .select("badge_key, earned_at, seen_at")
    .maybeSingle();

  if (isDuplicateInsert(result.error)) {
    return { created: false, error: null };
  }

  if (result.error || !result.data) {
    return {
      created: false,
      error: result.error ?? { message: "missing badge award insert result" },
    };
  }

  return { created: true, error: null };
}

async function insertProgressNotification(
  dbClient: UserGamificationDbClient,
  input: {
    userId: string;
    notificationKey: string;
    notificationType: UserGamificationNotificationType;
    sourceEventId: string | null;
    payload: Record<string, unknown>;
    groupKey?: string | null;
    now: string;
  },
): Promise<{ created: boolean; error: QueryError | null }> {
  const result = await dbClient
    .from("user_progress_notifications")
    .insert({
      user_id: input.userId,
      notification_key: input.notificationKey,
      notification_type: input.notificationType,
      source_event_id: input.sourceEventId,
      payload_json: input.payload,
      priority: USER_NOTIFICATION_PRIORITIES[input.notificationType],
      delivery_channel: "toast",
      toast_eligible: true,
      group_key: input.groupKey ?? null,
      created_at: input.now,
    })
    .select("id")
    .maybeSingle();

  if (isDuplicateInsert(result.error)) {
    return { created: false, error: null };
  }

  if (result.error || !result.data) {
    return {
      created: false,
      error: result.error ?? { message: "missing notification insert result" },
    };
  }

  return { created: true, error: null };
}

function toEarnedBadgeData(definition: UserBadgeDefinition, row: UserBadgeAwardRow) {
  return {
    badge_key: definition.badge_key,
    label: definition.label,
    description: definition.description,
    category: definition.category,
    shape_key: definition.shape_key,
    locked_hint: null,
    earned_at: row.earned_at,
    is_new: !row.seen_at,
  };
}

function toLockedBadgeData(definition: UserBadgeDefinition, progress: UserProgressData) {
  const progressCurrent = getMetricValue(progress, definition.metric);
  const progressPercent = calculateProgressPercent(progressCurrent, definition.target);

  return {
    badge_key: definition.badge_key,
    label: definition.label,
    description: definition.description,
    category: definition.category,
    shape_key: definition.shape_key,
    locked_hint: definition.locked_hint,
    earned_at: null,
    is_new: false,
    progress_current: progressCurrent,
    progress_target: definition.target,
    progress_percent: progressPercent,
  };
}

function toQuestData(
  definition: UserQuestDefinition,
  row: UserQuestProgressRow | undefined,
  progress: UserProgressData,
  achievementCounts: UserAchievementCounts,
): UserGamificationQuestData {
  const progressCurrent = row?.progress_current ?? getQuestMetricValue(
    progress,
    achievementCounts,
    definition.metric,
  );
  const completed = progressCurrent >= definition.target;
  const status = row?.status ?? (completed ? "completed" : "active");

  return {
    quest_key: definition.quest_key,
    quest_type: definition.quest_type,
    status,
    title: definition.title,
    description: definition.description,
    progress_current: progressCurrent,
    progress_target: definition.target,
    progress_percent: calculateProgressPercent(progressCurrent, definition.target),
    completed_at: row?.completed_at ?? null,
    dismissed_at: row?.dismissed_at ?? null,
    is_new: status === "completed" && !row?.seen_at,
  };
}

export function toNotificationData(row: UserProgressNotificationRow): UserGamificationNotificationData {
  const payload = normalizePayload(row.payload_json);
  const presentation = buildNotificationPresentation(row.notification_type, payload);

  return {
    id: row.id,
    notification_type: row.notification_type,
    priority: normalizeNotificationPriority(row),
    delivery_channel: normalizeDeliveryChannel(row.delivery_channel),
    toast_eligible: row.toast_eligible !== false,
    group_key: row.group_key ?? null,
    title: presentation.title,
    body: presentation.body,
    category: presentation.category,
    payload,
    created_at: row.created_at,
    seen_at: row.seen_at,
  };
}

function compareEarnedBadges(
  left: ReturnType<typeof toEarnedBadgeData>,
  right: ReturnType<typeof toEarnedBadgeData>,
) {
  return new Date(right.earned_at).getTime() - new Date(left.earned_at).getTime();
}

function compareActiveQuests(left: UserGamificationQuestData, right: UserGamificationQuestData) {
  return right.progress_percent - left.progress_percent
    || left.progress_target - right.progress_target
    || left.quest_key.localeCompare(right.quest_key);
}

function compareCompletedQuests(left: UserGamificationQuestData, right: UserGamificationQuestData) {
  return new Date(right.completed_at ?? 0).getTime() - new Date(left.completed_at ?? 0).getTime()
    || left.quest_key.localeCompare(right.quest_key);
}

function compareNotificationPriority(
  left: UserGamificationNotificationData,
  right: UserGamificationNotificationData,
) {
  return left.priority - right.priority
    || new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    || right.id.localeCompare(left.id);
}

function compareNotificationArchive(
  left: UserGamificationNotificationData,
  right: UserGamificationNotificationData,
) {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    || right.id.localeCompare(left.id);
}

function getMetricValue(progress: UserProgressData, metric: MetricKey) {
  if (metric === "current_level") {
    return progress.level.current_level;
  }

  return progress.event_counts[metric] ?? 0;
}

function getQuestMetricValue(
  progress: UserProgressData,
  counts: UserAchievementCounts,
  metric: QuestMetricKey,
) {
  if (metric === "recipe_saved") {
    return progress.event_counts.recipe_saved_distinct_ever;
  }

  if (metric === "recipe_registered") {
    return counts.recipe_registered;
  }

  if (metric === "planner_registered") {
    return progress.event_counts.planner_registered_first + progress.event_counts.planner_registered_repeat;
  }

  if (metric === "shopping_list_created") {
    return counts.shopping_list_created;
  }

  if (metric === "shopping_completed") {
    return progress.event_counts.shopping_completed;
  }

  if (metric === "cooking_completed") {
    return progress.event_counts.cooking_completed;
  }

  if (metric === "pantry_distinct_ingredients") {
    return counts.pantry_distinct_ingredients;
  }

  if (metric === "leftover_eaten_manual") {
    return Math.max(progress.event_counts.leftover_eaten ?? 0, counts.leftover_eaten_manual);
  }

  return progress.event_counts.custom_book_created;
}

function getAchievementMetricValue(
  progress: UserProgressData,
  counts: UserAchievementCounts,
  achievementRowsByKey: Map<string, UserAchievementAwardRow>,
  definition: UserAchievementDefinition,
) {
  if (definition.metric === "recipe_saved") {
    return progress.event_counts.recipe_saved_distinct_ever;
  }

  if (definition.metric === "recipe_registered") {
    return counts.recipe_registered;
  }

  if (definition.metric === "planner_registered") {
    return progress.event_counts.planner_registered_first + progress.event_counts.planner_registered_repeat;
  }

  if (definition.metric === "shopping_list_created") {
    return counts.shopping_list_created;
  }

  if (definition.metric === "shopping_completed") {
    return progress.event_counts.shopping_completed;
  }

  if (definition.metric === "cooking_completed") {
    return progress.event_counts.cooking_completed;
  }

  if (definition.metric === "pantry_distinct_ingredients") {
    return counts.pantry_distinct_ingredients;
  }

  if (definition.metric === "leftover_eaten_manual") {
    return Math.max(progress.event_counts.leftover_eaten ?? 0, counts.leftover_eaten_manual);
  }

  if (definition.metric === "custom_book_created") {
    return progress.event_counts.custom_book_created;
  }

  return TUTORIAL_BASE_ACHIEVEMENT_KEYS.filter((key) => achievementRowsByKey.has(key)).length;
}

function deriveAchievementCountsFromActivityRows(rows: UserGrowthActivityEventRow[]): UserAchievementCounts {
  const pantryIngredientKeys = new Set<string>();
  let leftoverEatenManual = 0;
  let recipeRegistered = 0;

  for (const row of rows) {
    const sourceMeta = normalizePayload(row.source_meta_json);

    if (row.activity_type === "pantry_item_added") {
      const ingredientId = typeof sourceMeta.ingredient_id === "string"
        ? sourceMeta.ingredient_id
        : row.source_id;
      pantryIngredientKeys.add(ingredientId);
    }

    if (row.activity_type === "leftover_eaten" && sourceMeta.auto_eaten !== true) {
      leftoverEatenManual += 1;
    }

    if (row.activity_type === "recipe_registered") {
      recipeRegistered += 1;
    }
  }

  return {
    pantry_distinct_ingredients: pantryIngredientKeys.size,
    leftover_eaten_manual: leftoverEatenManual,
    recipe_registered: recipeRegistered,
    shopping_list_created: 0,
  };
}

function mergeAchievementCounts(
  primary: UserAchievementCounts,
  secondary: UserAchievementCounts,
): UserAchievementCounts {
  return {
    pantry_distinct_ingredients: Math.max(
      primary.pantry_distinct_ingredients,
      secondary.pantry_distinct_ingredients,
    ),
    leftover_eaten_manual: Math.max(primary.leftover_eaten_manual, secondary.leftover_eaten_manual),
    recipe_registered: Math.max(primary.recipe_registered, secondary.recipe_registered),
    shopping_list_created: Math.max(primary.shopping_list_created, secondary.shopping_list_created),
  };
}

function getTutorialAchievementKeyForQuest(questKey: string) {
  const mapping: Record<string, string> = {
    first_recipe_saved: "tutorial_recipe_saved",
    first_planner_registered: "tutorial_planner_registered",
    first_shopping_list_created: "tutorial_shopping_list_create",
    first_shopping_done: "tutorial_shopping_list_complete",
    first_cook_done: "tutorial_cooking_complete",
    first_custom_book_created: "tutorial_recipebook_created",
  };

  return mapping[questKey] ?? null;
}

function calculateProgressPercent(current: number, target: number) {
  if (target <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((Math.max(0, current) / target) * 100));
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readPayloadString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNotificationPriority(row: UserProgressNotificationRow) {
  return typeof row.priority === "number" && Number.isFinite(row.priority)
    ? row.priority
    : USER_NOTIFICATION_PRIORITIES[row.notification_type];
}

function normalizeDeliveryChannel(
  value: UserGamificationNotificationDeliveryChannel | null | undefined,
): UserGamificationNotificationDeliveryChannel {
  if (value === "archive_only" || value === "silent") {
    return value;
  }

  return "toast";
}

function encodeArchiveCursor(row: UserProgressNotificationRow) {
  return Buffer.from(`${row.created_at}|${row.id}`, "utf8").toString("base64url");
}

export function decodeArchiveCursor(value: string) {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const [createdAt, id, ...rest] = decoded.split("|");
    if (
      !createdAt
      || !id
      || rest.length > 0
      || Number.isNaN(new Date(createdAt).getTime())
      || !UUID_PATTERN.test(id)
    ) {
      return null;
    }

    return { createdAt, id };
  } catch {
    return null;
  }
}

function buildNotificationPresentation(
  notificationType: UserGamificationNotificationType,
  payload: Record<string, unknown>,
): {
  title: string;
  body: string;
  category: UserGamificationBadgeCategory;
} {
  if (notificationType === "level_up") {
    const currentLevel = typeof payload.current_level === "number"
      ? payload.current_level
      : typeof payload.level === "number"
        ? payload.level
        : null;
    const isGradeUpgrade = payload.grade_upgrade === true;
    const grade = normalizePayload(payload.grade);
    const gradeLabel = typeof grade.label === "string" && grade.label
      ? grade.label
      : typeof grade.grade_key === "string" && grade.grade_key
        ? grade.grade_key
        : "";
    const levelBody = currentLevel ? `Lv.${currentLevel} 달성` : "새로운 레벨에 도달했어요.";

    return {
      title: isGradeUpgrade ? "등급 획득!" : "레벨업!",
      body: isGradeUpgrade && gradeLabel ? `${gradeLabel} 등급 획득, ${levelBody}` : levelBody,
      category: "cooking",
    };
  }

  if (notificationType === "badge_unlocked") {
    const badgeKey = typeof payload.badge_key === "string" ? payload.badge_key : "";
    const badgeMetadata = USER_BADGE_METADATA[badgeKey];

    return {
      title: "새 배지 획득!",
      body: "마이페이지에서 새 배지를 확인해 보세요.",
      category: badgeMetadata?.category ?? "recipe",
    };
  }

  if (notificationType === "achievement_unlocked") {
    const achievementKey = typeof payload.achievement_key === "string" ? payload.achievement_key : "";
    const definition = USER_ACHIEVEMENT_DEFINITIONS.find(
      (achievement) => achievement.achievement_key === achievementKey,
    );

    return {
      title: "업적 달성!",
      body: `${typeof payload.title === "string" ? payload.title : definition?.title ?? "새 업적"} 배지를 획득했어요.`,
      category: definition?.category_key ?? "tutorial",
    };
  }

  const eventType = typeof payload.event_type === "string" ? payload.event_type : "";
  const xpDelta = typeof payload.xp_delta === "number" ? payload.xp_delta : null;
  const label = typeof payload.label === "string" ? payload.label : "경험치 획득";

  return {
    title: xpDelta ? `+${xpDelta} XP 획득` : "XP 획득",
    body: `${label} XP`,
    category: SOURCE_EVENT_CATEGORIES[eventType as UserProgressEventType] ?? "recipe",
  };
}

function isDuplicateInsert(error: QueryError | null | undefined) {
  if (!error) {
    return false;
  }

  return error.code === "23505" || error.message.toLowerCase().includes("duplicate key");
}

function toQueryError(error: unknown, fallbackMessage: string): QueryError {
  return {
    message: error instanceof Error ? error.message : fallbackMessage,
  };
}
