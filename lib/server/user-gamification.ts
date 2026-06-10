import {
  readUserProgress,
  type UserProgressAwardInput,
  type UserProgressDbClient,
  USER_PROGRESS_XP_AWARDS,
} from "@/lib/server/user-progress";
import type {
  UserGamificationData,
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

interface UserBadgeDefinition {
  badge_key: string;
  label: string;
  description: string;
  metric: MetricKey;
  target: number;
}

interface UserQuestDefinition {
  quest_key: string;
  quest_type: UserGamificationQuestType;
  title: string;
  description: string;
  metric: MetricKey;
  target: number;
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

export interface UserProgressNotificationRow {
  id: string;
  notification_type: UserGamificationNotificationType;
  payload_json: unknown;
  created_at: string;
  seen_at: string | null;
}

interface UserBadgeAwardInsert {
  user_id: string;
  badge_key: string;
  source_event_id: string | null;
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

interface QuestProgressSelectQuery {
  eq(column: string, value: string): QuestProgressSelectQuery;
  then: ArrayResult<UserQuestProgressRow>["then"];
}

interface NotificationSelectQuery {
  eq(column: string, value: string): NotificationSelectQuery;
  is(column: string, value: null): NotificationSelectQuery;
  order(column: string, options: { ascending: boolean }): NotificationSelectQuery;
  limit(count: number): NotificationSelectQuery;
  then: ArrayResult<UserProgressNotificationRow>["then"];
}

interface NotificationUpdateFilterQuery {
  eq(column: string, value: string): NotificationUpdateFilterQuery;
  in(column: string, values: string[]): NotificationUpdateFilterQuery;
  select(columns: string): ArrayResult<{ id: string }>;
}

interface BadgeAwardsTable {
  insert(values: UserBadgeAwardInsert): InsertQuery<UserBadgeAwardRow>;
  select(columns: string): BadgeAwardsSelectQuery;
}

interface QuestProgressTable {
  select(columns: string): QuestProgressSelectQuery;
  upsert(
    values: UserQuestProgressUpsert,
    options: { onConflict: "user_id,quest_key" },
  ): UpsertQuery<UserQuestProgressRow>;
}

interface NotificationsTable {
  insert(values: UserProgressNotificationInsert): InsertQuery<{ id: string }>;
  select(columns: string): NotificationSelectQuery;
  update(values: { seen_at: string }): NotificationUpdateFilterQuery;
}

export interface UserGamificationDbClient {
  from(table: "user_badge_awards"): BadgeAwardsTable;
  from(table: "user_quest_progress"): QuestProgressTable;
  from(table: "user_progress_notifications"): NotificationsTable;
}

export const USER_BADGE_DEFINITIONS: UserBadgeDefinition[] = [
  {
    badge_key: "first_recipe_saved",
    label: "첫 레시피 저장",
    description: "처음으로 다시 보고 싶은 레시피를 저장했어요.",
    metric: "recipe_saved_distinct_ever",
    target: 1,
  },
  {
    badge_key: "first_shopping_done",
    label: "첫 장보기 완료",
    description: "첫 장보기 리스트를 끝까지 완료했어요.",
    metric: "shopping_completed",
    target: 1,
  },
  {
    badge_key: "first_cook_done",
    label: "첫 집밥 완성",
    description: "첫 요리 완료를 기록했어요.",
    metric: "cooking_completed",
    target: 1,
  },
  {
    badge_key: "first_custom_book_created",
    label: "나만의 책 시작",
    description: "직접 레시피북을 만들어 집밥 기록을 정리했어요.",
    metric: "custom_book_created",
    target: 1,
  },
  {
    badge_key: "recipe_collector",
    label: "레시피 수집가",
    description: "레시피 5개를 저장해 다음 식사를 준비했어요.",
    metric: "recipe_saved_distinct_ever",
    target: 5,
  },
  {
    badge_key: "kitchen_routine_starter",
    label: "루틴의 시작",
    description: "요리 완료를 3번 기록했어요.",
    metric: "cooking_completed",
    target: 3,
  },
  {
    badge_key: "shopping_rhythm",
    label: "장보기 리듬",
    description: "장보기 완료를 3번 기록했어요.",
    metric: "shopping_completed",
    target: 3,
  },
  {
    badge_key: "level_5_homecook",
    label: "집밥 러너",
    description: "레벨 5에 도달했어요.",
    metric: "current_level",
    target: 5,
  },
];

export const USER_QUEST_DEFINITIONS: UserQuestDefinition[] = [
  {
    quest_key: "first_recipe_saved",
    quest_type: "tutorial",
    title: "마음에 드는 레시피 저장하기",
    description: "다시 만들고 싶은 레시피를 하나 저장해보세요.",
    metric: "recipe_saved_distinct_ever",
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
    quest_key: "save_five_recipes",
    quest_type: "standard",
    title: "이번 주 후보 모으기",
    description: "저장한 레시피 5개로 다음 식사를 준비해요.",
    metric: "recipe_saved_distinct_ever",
    target: 5,
  },
  {
    quest_key: "cook_three_meals",
    quest_type: "standard",
    title: "집밥 루틴 만들기",
    description: "요리 완료를 3번 기록해 루틴을 시작해요.",
    metric: "cooking_completed",
    target: 3,
  },
  {
    quest_key: "complete_three_shopping_lists",
    quest_type: "standard",
    title: "장보기 리듬 잡기",
    description: "장보기 완료 3번으로 준비 흐름을 만들어보세요.",
    metric: "shopping_completed",
    target: 3,
  },
];

const SOURCE_EVENT_LABELS: Record<UserProgressEventType, string> = {
  cooking_completed: "요리 완료",
  shopping_completed: "장보기 완료",
  recipe_saved: "레시피 저장",
  custom_book_created: "레시피북 생성",
};

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

    const reconcileResult = await reconcileUserGamification(dbClient, {
      userId,
      progress: progressResult.data,
    });

    if (reconcileResult.error) {
      return { data: null, error: reconcileResult.error };
    }

    const [badgesResult, questsResult, notificationsResult] = await Promise.all([
      readBadgeAwardRows(dbClient, userId),
      readQuestProgressRows(dbClient, userId),
      readUnseenNotificationRows(dbClient, userId),
    ]);

    const error = badgesResult.error ?? questsResult.error ?? notificationsResult.error;

    if (error) {
      return { data: null, error };
    }

    return {
      data: buildUserGamificationData({
        progress: progressResult.data,
        badgeRows: badgesResult.data ?? [],
        questRows: questsResult.data ?? [],
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
    progress: UserProgressData;
  },
): Promise<{ error: QueryError | null }> {
  try {
    const now = input.awardInput.occurredAt ?? new Date().toISOString();
    const notificationResult = await insertProgressNotification(dbClient, {
      userId: input.userId,
      notificationKey: `xp-toast:${input.progressEventId}`,
      notificationType: "xp_awarded",
      sourceEventId: input.progressEventId,
      payload: {
        event_type: input.awardInput.eventType,
        label: SOURCE_EVENT_LABELS[input.awardInput.eventType],
        xp_delta: USER_PROGRESS_XP_AWARDS[input.awardInput.eventType],
      },
      now,
    });

    if (notificationResult.error) {
      return { error: notificationResult.error };
    }

    return reconcileUserGamification(dbClient, {
      userId: input.userId,
      progress: input.progress,
      sourceEventId: input.progressEventId,
      now,
    });
  } catch (error) {
    return { error: toQueryError(error, "unknown gamification projection failure") };
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
    const updateResult = await dbClient
      .from("user_progress_notifications")
      .update({ seen_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", uniqueIds)
      .select("id");

    if (updateResult.error || !updateResult.data) {
      return {
        data: null,
        error: updateResult.error ?? { message: "missing notification seen result" },
      };
    }

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
    const progressCurrent = getMetricValue(progressResult.data, definition.metric);
    const questRowsResult = await readQuestProgressRows(dbClient, userId);

    if (questRowsResult.error) {
      return { data: null, error: questRowsResult.error };
    }

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
  notificationRows,
}: {
  progress: UserProgressData;
  badgeRows: UserBadgeAwardRow[];
  questRows: UserQuestProgressRow[];
  notificationRows: UserProgressNotificationRow[];
}): UserGamificationData {
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
    toQuestData(definition, questRowsByKey.get(definition.quest_key), progress),
  );
  const activeQuests = questData
    .filter((quest) => quest.quest_type === "standard" && quest.status === "active")
    .sort(compareActiveQuests)
    .slice(0, 2);
  const completedRecent = questData
    .filter((quest) => quest.quest_type === "standard" && quest.status === "completed")
    .sort(compareCompletedQuests)
    .slice(0, 3);
  const activeTutorialSteps = questData
    .filter((quest) => quest.quest_type === "tutorial" && quest.status === "active")
    .slice(0, 3);

  return {
    level: {
      current_level: progress.level.current_level,
      total_xp: progress.level.total_xp,
      xp_to_next_level: progress.level.xp_to_next_level,
      progress_percent: progress.level.progress_percent,
    },
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
      active_steps: activeTutorialSteps,
    },
    notifications: {
      unseen: notificationRows
        .filter((row) => !row.seen_at)
        .map(toNotificationData),
    },
    last_updated_at: progress.last_updated_at,
  };
}

async function reconcileUserGamification(
  dbClient: UserGamificationDbClient,
  input: {
    userId: string;
    progress: UserProgressData;
    sourceEventId?: string;
    now?: string;
  },
): Promise<{ error: QueryError | null }> {
  const now = input.now ?? new Date().toISOString();
  const questRowsResult = await readQuestProgressRows(dbClient, input.userId);

  if (questRowsResult.error) {
    return { error: questRowsResult.error };
  }

  const existingQuestRows = new Map((questRowsResult.data ?? []).map((row) => [row.quest_key, row]));

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

    if (badgeResult.created) {
      const notificationResult = await insertProgressNotification(dbClient, {
        userId: input.userId,
        notificationKey: `badge:${definition.badge_key}:${input.userId}`,
        notificationType: "badge_unlocked",
        sourceEventId: input.sourceEventId ?? null,
        payload: {
          badge_key: definition.badge_key,
          label: definition.label,
          description: definition.description,
        },
        now,
      });

      if (notificationResult.error) {
        return { error: notificationResult.error };
      }
    }
  }

  for (const definition of USER_QUEST_DEFINITIONS) {
    const existing = existingQuestRows.get(definition.quest_key);
    const progressCurrent = getMetricValue(input.progress, definition.metric);
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

    if (status === "completed" && existing?.status !== "completed") {
      const notificationResult = await insertProgressNotification(dbClient, {
        userId: input.userId,
        notificationKey: `quest:${definition.quest_key}:${input.userId}`,
        notificationType: "quest_completed",
        sourceEventId: input.sourceEventId ?? null,
        payload: {
          quest_key: definition.quest_key,
          title: definition.title,
          description: definition.description,
        },
        now,
      });

      if (notificationResult.error) {
        return { error: notificationResult.error };
      }
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

async function readUnseenNotificationRows(
  dbClient: UserGamificationDbClient,
  userId: string,
): Promise<{ data: UserProgressNotificationRow[] | null; error: QueryError | null }> {
  const result = await dbClient
    .from("user_progress_notifications")
    .select("id, notification_type, payload_json, created_at, seen_at")
    .eq("user_id", userId)
    .is("seen_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  return result;
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
): UserGamificationQuestData {
  const progressCurrent = row?.progress_current ?? getMetricValue(progress, definition.metric);
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

function toNotificationData(row: UserProgressNotificationRow): UserGamificationNotificationData {
  return {
    id: row.id,
    notification_type: row.notification_type,
    payload: normalizePayload(row.payload_json),
    created_at: row.created_at,
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

function getMetricValue(progress: UserProgressData, metric: MetricKey) {
  if (metric === "current_level") {
    return progress.level.current_level;
  }

  return progress.event_counts[metric];
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
