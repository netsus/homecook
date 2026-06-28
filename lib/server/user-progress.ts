import type {
  UserProgressData,
  UserProgressEventCounts,
  UserProgressEventType,
  UserProgressGradeData,
  UserProgressLevelData,
} from "@/types/user-progress";
import type { UserGamificationDbClient } from "@/lib/server/user-gamification";
import { USER_PROGRESS_XP_POLICY } from "@/lib/user-progress-xp-policy";

export { USER_PROGRESS_XP_POLICY } from "@/lib/user-progress-xp-policy";

interface QueryError {
  code?: string;
  message: string;
}

export interface UserProgressEventRow {
  event_type: UserProgressEventType;
  source_id?: string | null;
  source_key: string;
  xp_delta: number;
  occurred_at: string;
  source_meta_json?: unknown;
}

interface UserProgressSummaryRow {
  user_id: string;
  total_xp: number;
  current_level: number;
  level_curve_version?: "v1" | "v2";
  event_counts: unknown;
  last_event_at: string | null;
  last_updated_at: string;
}

interface UserProgressEventInsert {
  user_id: string;
  event_type: UserProgressEventType;
  source_key: string;
  source_table: string;
  source_id: string;
  xp_delta: number;
  occurred_at: string;
  source_meta_json: Record<string, unknown>;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface ProgressEventInsertQuery {
  select(columns: string): ProgressEventInsertSelectQuery;
}

interface ProgressEventInsertSelectQuery {
  maybeSingle(): MaybeSingleResult<{ id: string }>;
}

interface ProgressEventsSelectQuery {
  eq(column: string, value: string): ProgressEventsSelectQuery;
  then: ArrayResult<UserProgressEventRow>["then"];
}

interface ProgressSummarySelectQuery {
  eq(column: string, value: string): ProgressSummarySelectQuery;
  maybeSingle(): MaybeSingleResult<UserProgressSummaryRow>;
}

interface ProgressSummaryUpsertQuery {
  select(columns: string): ProgressSummaryUpsertSelectQuery;
}

interface ProgressSummaryUpsertSelectQuery {
  maybeSingle(): MaybeSingleResult<UserProgressSummaryRow>;
}

interface ProgressEventsTable {
  insert(values: UserProgressEventInsert): ProgressEventInsertQuery;
  select(columns: string): ProgressEventsSelectQuery;
}

interface ProgressSummaryTable {
  select(columns: string): ProgressSummarySelectQuery;
  upsert(values: UserProgressSummaryRow, options: { onConflict: "user_id" }): ProgressSummaryUpsertQuery;
}

export interface UserProgressDbClient {
  from(table: "user_progress_events"): ProgressEventsTable;
  from(table: "user_progress_summary"): ProgressSummaryTable;
}

type RecipeSavedAwardInput = {
  userId: string;
  eventType: "recipe_saved";
  sourceTable: "recipe_book_items";
  sourceId: string;
  recipeId: string;
  occurredAt?: string;
};

type GenericAwardInput = {
  userId: string;
  eventType: Exclude<UserProgressEventType, "recipe_saved">;
  sourceTable: "leftover_dishes" | "shopping_lists" | "recipe_books" | "meals";
  sourceId: string;
  occurredAt?: string;
};

export type UserProgressAwardInput = RecipeSavedAwardInput | GenericAwardInput;

export interface UserProgressAwardResult {
  awarded: boolean;
  duplicate: boolean;
  error: QueryError | null;
  summary: UserProgressData | null;
}

const USER_PROGRESS_LEVEL_CURVE_VERSION = "v2" as const;

export const USER_PROGRESS_XP_AWARDS: Record<UserProgressEventType, number> = {
  cooking_completed: USER_PROGRESS_XP_POLICY.cooking_completed.first,
  shopping_completed: USER_PROGRESS_XP_POLICY.shopping_completed.first,
  recipe_saved: USER_PROGRESS_XP_POLICY.recipe_saved.first,
  custom_book_created: USER_PROGRESS_XP_POLICY.custom_book_created.first,
  planner_registered: USER_PROGRESS_XP_POLICY.planner_registered.first,
  leftover_eaten: USER_PROGRESS_XP_POLICY.leftover_eaten.first,
};

const ZERO_EVENT_COUNTS: UserProgressEventCounts = {
  cooking_completed: 0,
  shopping_completed: 0,
  recipe_saved_distinct_ever: 0,
  custom_book_created: 0,
  planner_registered_first: 0,
  planner_registered_repeat: 0,
  leftover_eaten: 0,
};

const FIRST_XP_EVENT_TYPES = new Set<UserProgressEventType>([
  "recipe_saved",
  "custom_book_created",
  "shopping_completed",
  "cooking_completed",
  "planner_registered",
  "leftover_eaten",
]);

const REPEAT_CAPS: Partial<Record<UserProgressEventType, { daily?: number; weekly?: number }>> = {
  custom_book_created: { daily: 2 },
  planner_registered: { daily: 3, weekly: 12 },
};

const GRADE_BANDS: UserProgressGradeData[] = [
  {
    grade_key: "clay",
    label: "Clay",
    level_min: 1,
    level_max: 3,
    icon_url: "/assets/growth/grades/clay-spoon-badge.png",
    character_url: "/assets/growth/grades/clay-spoon.png",
  },
  {
    grade_key: "wood",
    label: "Wood",
    level_min: 4,
    level_max: 7,
    icon_url: "/assets/growth/grades/wood-spoon-badge.png",
    character_url: "/assets/growth/grades/wood-spoon.png",
  },
  {
    grade_key: "steel",
    label: "Steel",
    level_min: 8,
    level_max: 12,
    icon_url: "/assets/growth/grades/steel-spoon-badge.png",
    character_url: "/assets/growth/grades/steel-spoon.png",
  },
  {
    grade_key: "silver",
    label: "Silver",
    level_min: 13,
    level_max: 20,
    icon_url: "/assets/growth/grades/silver-spoon-badge.png",
    character_url: "/assets/growth/grades/silver-spoon.png",
  },
  {
    grade_key: "gold",
    label: "Gold",
    level_min: 21,
    level_max: 34,
    icon_url: "/assets/growth/grades/gold-spoon-badge.png",
    character_url: "/assets/growth/grades/gold-spoon.png",
  },
  {
    grade_key: "diamond",
    label: "Diamond",
    level_min: 35,
    level_max: 49,
    icon_url: "/assets/growth/grades/diamond-spoon-badge.png",
    character_url: "/assets/growth/grades/diamond-spoon.png",
  },
  {
    grade_key: "titanium",
    label: "Titanium",
    level_min: 50,
    level_max: null,
    icon_url: "/assets/growth/grades/titanium-spoon-badge.png",
    character_url: "/assets/growth/grades/titanium-spoon.png",
  },
];

export function calculateUserProgressLevel(totalXp: number): UserProgressLevelData {
  const normalizedTotalXp = Math.max(0, Math.floor(totalXp));
  let currentLevel = 1;

  while (getLevelStartXp(currentLevel + 1) <= normalizedTotalXp) {
    currentLevel += 1;
  }

  const currentLevelStartXp = getLevelStartXp(currentLevel);
  const nextLevelStartXp = getLevelStartXp(currentLevel + 1);
  const xpIntoCurrentLevel = normalizedTotalXp - currentLevelStartXp;
  const xpToNextLevel = nextLevelStartXp - normalizedTotalXp;
  const levelSpan = nextLevelStartXp - currentLevelStartXp;
  const progressRatio = levelSpan > 0
    ? Number((xpIntoCurrentLevel / levelSpan).toFixed(4))
    : 0;

  return {
    current_level: currentLevel,
    total_xp: normalizedTotalXp,
    current_level_start_xp: currentLevelStartXp,
    next_level_start_xp: nextLevelStartXp,
    xp_into_current_level: xpIntoCurrentLevel,
    xp_to_next_level: xpToNextLevel,
    progress_ratio: progressRatio,
    progress_percent: Math.round(progressRatio * 100),
  };
}

export function levelStartXp(level: number) {
  const normalizedLevel = Math.max(1, Math.floor(level));
  return Math.max(0, 40 * (normalizedLevel - 1) ** 2 + 60 * (normalizedLevel - 1));
}

function getLevelStartXp(level: number) {
  return levelStartXp(level);
}

export function getUserProgressGrade(level: number): UserProgressGradeData {
  const normalizedLevel = Math.max(1, Math.floor(level));
  return GRADE_BANDS.find((band) =>
    normalizedLevel >= band.level_min && (band.level_max === null || normalizedLevel <= band.level_max)
  ) ?? GRADE_BANDS[0];
}

function buildProgressSourceKey(input: UserProgressAwardInput) {
  if (input.eventType === "planner_registered") {
    return `planner_registered:${input.sourceId}`;
  }

  if (input.eventType === "recipe_saved") {
    return `recipe_saved:${input.userId}:${input.recipeId}`;
  }

  return `${input.eventType}:${input.sourceId}`;
}

export function buildUserProgressEventInsert(
  input: UserProgressAwardInput,
  options: { existingEvents?: UserProgressEventRow[]; backfill?: boolean } = {},
): UserProgressEventInsert {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const existingEvents = options.existingEvents ?? [];
  const xpKind = getXpKind(input.eventType, existingEvents);
  const sourceKey = input.eventType === "planner_registered" && xpKind === "first"
    ? `planner_registered:first:${input.userId}`
    : buildProgressSourceKey(input);
  const sourceMeta = buildSourceMetaJson({
    eventType: input.eventType,
    occurredAt,
    xpKind,
    backfill: options.backfill === true,
  });

  return {
    user_id: input.userId,
    event_type: input.eventType,
    source_key: sourceKey,
    source_table: input.sourceTable,
    source_id: input.sourceId,
    xp_delta: USER_PROGRESS_XP_POLICY[input.eventType][xpKind],
    occurred_at: occurredAt,
    source_meta_json: sourceMeta,
  };
}

export function buildUserProgressSummary({
  userId,
  events,
  now = new Date().toISOString(),
}: {
  userId: string;
  events: UserProgressEventRow[];
  now?: string;
}): UserProgressSummaryRow {
  const recipeSavedKeys = new Set<string>();
  const eventCounts = { ...ZERO_EVENT_COUNTS };
  let totalXp = 0;
  let lastEventAt: string | null = null;

  events.forEach((event) => {
    totalXp += Math.max(0, Math.floor(event.xp_delta));

    if (event.event_type === "recipe_saved") {
      recipeSavedKeys.add(event.source_key);
    } else if (event.event_type === "cooking_completed") {
      eventCounts.cooking_completed += 1;
    } else if (event.event_type === "shopping_completed") {
      eventCounts.shopping_completed += 1;
    } else if (event.event_type === "custom_book_created") {
      eventCounts.custom_book_created += 1;
    } else if (event.event_type === "planner_registered") {
      const sourceMeta = normalizeSourceMeta(event.source_meta_json);
      if (sourceMeta.xp_kind === "repeat") {
        eventCounts.planner_registered_repeat += 1;
      } else {
        eventCounts.planner_registered_first += 1;
      }
    } else if (event.event_type === "leftover_eaten") {
      eventCounts.leftover_eaten = (eventCounts.leftover_eaten ?? 0) + 1;
    }

    if (!lastEventAt || new Date(event.occurred_at).getTime() > new Date(lastEventAt).getTime()) {
      lastEventAt = event.occurred_at;
    }
  });

  eventCounts.recipe_saved_distinct_ever = recipeSavedKeys.size;

  return {
    user_id: userId,
    total_xp: totalXp,
    current_level: calculateUserProgressLevel(totalXp).current_level,
    level_curve_version: USER_PROGRESS_LEVEL_CURVE_VERSION,
    event_counts: eventCounts,
    last_event_at: lastEventAt,
    last_updated_at: now,
  };
}

export async function awardUserProgressEvent(
  dbClient: UserProgressDbClient,
  input: UserProgressAwardInput,
): Promise<UserProgressAwardResult> {
  try {
    const existingEventsResult = await dbClient
      .from("user_progress_events")
      .select("event_type, source_id, source_key, xp_delta, occurred_at, source_meta_json")
      .eq("user_id", input.userId);

    if (existingEventsResult.error || !existingEventsResult.data) {
      return {
        awarded: false,
        duplicate: false,
        error: existingEventsResult.error ?? { message: "missing progress events result" },
        summary: null,
      };
    }

    const eventInsert = buildUserProgressEventInsert(input, {
      existingEvents: existingEventsResult.data,
    });

    if (isDuplicateSource(input, eventInsert.source_key, existingEventsResult.data)) {
      return { awarded: false, duplicate: true, error: null, summary: null };
    }

    if (isUserProgressRepeatCapExceeded(input.eventType, eventInsert.source_meta_json, existingEventsResult.data)) {
      return { awarded: false, duplicate: false, error: null, summary: null };
    }

    const previousLevel = calculateUserProgressLevel(
      existingEventsResult.data.reduce((sum, event) => sum + Math.max(0, Math.floor(event.xp_delta)), 0),
    ).current_level;

    const insertResult = await dbClient
      .from("user_progress_events")
      .insert(eventInsert)
      .select("id")
      .maybeSingle();

    if (isDuplicateInsert(insertResult.error)) {
      return { awarded: false, duplicate: true, error: null, summary: null };
    }

    if (insertResult.error || !insertResult.data) {
      return {
        awarded: false,
        duplicate: false,
        error: insertResult.error ?? { message: "missing progress event insert result" },
        summary: null,
      };
    }

    const summaryResult = await recalculateUserProgressSummary(dbClient, input.userId);

    if (summaryResult.error || !summaryResult.data) {
      return {
        awarded: true,
        duplicate: false,
        error: summaryResult.error ?? { message: "missing progress summary result" },
        summary: null,
      };
    }

    try {
      const { projectUserGamificationAfterProgressEvent } = await import(
        "@/lib/server/user-gamification"
      );

      await projectUserGamificationAfterProgressEvent(
        dbClient as unknown as UserGamificationDbClient,
        {
          userId: input.userId,
          progressEventId: insertResult.data.id,
          awardInput: input,
          xpDelta: eventInsert.xp_delta,
          previousLevel,
          progress: toUserProgressData(summaryResult.data),
        },
      );
    } catch {
      // Gamification projection is secondary; the canonical progress award remains authoritative.
    }

    return {
      awarded: true,
      duplicate: false,
      error: null,
      summary: toUserProgressData(summaryResult.data),
    };
  } catch (error) {
    return {
      awarded: false,
      duplicate: false,
      error: { message: error instanceof Error ? error.message : "unknown progress writer failure" },
      summary: null,
    };
  }
}

export async function readUserProgress(
  dbClient: UserProgressDbClient,
  userId: string,
): Promise<{ data: UserProgressData | null; error: QueryError | null }> {
  try {
    const summaryResult = await dbClient
      .from("user_progress_summary")
      .select("user_id, total_xp, current_level, level_curve_version, event_counts, last_event_at, last_updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (summaryResult.error) {
      return { data: null, error: summaryResult.error };
    }

    if (summaryResult.data) {
      return { data: toUserProgressData(summaryResult.data), error: null };
    }

    const recalculatedResult = await recalculateUserProgressSummary(dbClient, userId);

    if (recalculatedResult.error || !recalculatedResult.data) {
      return {
        data: null,
        error: recalculatedResult.error ?? { message: "missing progress summary result" },
      };
    }

    return { data: toUserProgressData(recalculatedResult.data), error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : "unknown progress read failure" },
    };
  }
}

async function recalculateUserProgressSummary(
  dbClient: UserProgressDbClient,
  userId: string,
): Promise<{ data: UserProgressSummaryRow | null; error: QueryError | null }> {
  const eventsResult = await dbClient
    .from("user_progress_events")
    .select("event_type, source_id, source_key, xp_delta, occurred_at, source_meta_json")
    .eq("user_id", userId);

  if (eventsResult.error || !eventsResult.data) {
    return {
      data: null,
      error: eventsResult.error ?? { message: "missing progress events result" },
    };
  }

  const summary = buildUserProgressSummary({
    userId,
    events: eventsResult.data,
  });

  const upsertResult = await dbClient
    .from("user_progress_summary")
    .upsert(summary, { onConflict: "user_id" })
    .select("user_id, total_xp, current_level, level_curve_version, event_counts, last_event_at, last_updated_at")
    .maybeSingle();

  if (upsertResult.error || !upsertResult.data) {
    return {
      data: null,
      error: upsertResult.error ?? { message: "missing progress summary upsert result" },
    };
  }

  return { data: upsertResult.data, error: null };
}

function toUserProgressData(summary: UserProgressSummaryRow): UserProgressData {
  return {
    level: calculateUserProgressLevel(summary.total_xp),
    event_counts: normalizeEventCounts(summary.event_counts),
    last_updated_at: summary.last_updated_at,
  };
}

export function buildLowerBoundUserProgressBackfillEvents({
  userId,
  rows,
}: {
  userId: string;
  rows: {
    leftoverDishes?: Array<{ id: string; cooked_at: string }>;
    completedShoppingLists?: Array<{ id: string; completed_at: string }>;
    savedRecipeMemberships?: Array<{
      recipe_id: string;
      recipe_book_item_id: string;
      created_at: string;
    }>;
    customRecipeBooks?: Array<{ id: string; created_at: string }>;
  };
}): UserProgressAwardInput[] {
  return [
    ...(rows.leftoverDishes ?? []).map((row): UserProgressAwardInput => ({
      userId,
      eventType: "cooking_completed",
      sourceTable: "leftover_dishes",
      sourceId: row.id,
      occurredAt: row.cooked_at,
    })),
    ...(rows.completedShoppingLists ?? []).map((row): UserProgressAwardInput => ({
      userId,
      eventType: "shopping_completed",
      sourceTable: "shopping_lists",
      sourceId: row.id,
      occurredAt: row.completed_at,
    })),
    ...(rows.savedRecipeMemberships ?? []).map((row): UserProgressAwardInput => ({
      userId,
      eventType: "recipe_saved",
      sourceTable: "recipe_book_items",
      sourceId: row.recipe_book_item_id,
      recipeId: row.recipe_id,
      occurredAt: row.created_at,
    })),
    ...(rows.customRecipeBooks ?? []).map((row): UserProgressAwardInput => ({
      userId,
      eventType: "custom_book_created",
      sourceTable: "recipe_books",
      sourceId: row.id,
      occurredAt: row.created_at,
    })),
  ];
}

function normalizeEventCounts(value: unknown): UserProgressEventCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...ZERO_EVENT_COUNTS };
  }

  const record = value as Record<string, unknown>;

  return {
    cooking_completed: normalizeCount(record.cooking_completed),
    shopping_completed: normalizeCount(record.shopping_completed),
    recipe_saved_distinct_ever: normalizeCount(record.recipe_saved_distinct_ever),
    custom_book_created: normalizeCount(record.custom_book_created),
    planner_registered_first: normalizeCount(record.planner_registered_first),
    planner_registered_repeat: normalizeCount(record.planner_registered_repeat),
    leftover_eaten: normalizeCount(record.leftover_eaten),
  };
}

function getXpKind(eventType: UserProgressEventType, existingEvents: UserProgressEventRow[]) {
  return FIRST_XP_EVENT_TYPES.has(eventType)
    && !existingEvents.some((event) => event.event_type === eventType)
    ? "first"
    : "repeat";
}

function buildSourceMetaJson({
  eventType,
  occurredAt,
  xpKind,
  backfill,
}: {
  eventType: UserProgressEventType;
  occurredAt: string;
  xpKind: "first" | "repeat";
  backfill: boolean;
}) {
  const meta: Record<string, unknown> = {
    xp_kind: xpKind,
    level_curve_version: USER_PROGRESS_LEVEL_CURVE_VERSION,
  };

  if (backfill) {
    meta.backfill = true;
  }

  if (xpKind === "repeat" && REPEAT_CAPS[eventType]) {
    meta.cap_day_key = getKstDateKey(occurredAt);
    meta.cap_week_key = getKstIsoWeekKey(occurredAt);
  }

  return meta;
}

function isDuplicateSource(
  input: UserProgressAwardInput,
  sourceKey: string,
  existingEvents: UserProgressEventRow[],
) {
  if (existingEvents.some((event) => event.event_type === input.eventType && event.source_key === sourceKey)) {
    return true;
  }

  if (input.eventType === "recipe_saved") {
    const recipeSourceKey = `recipe_saved:${input.userId}:${input.recipeId}`;
    return existingEvents.some((event) =>
      event.event_type === "recipe_saved" && event.source_key === recipeSourceKey
    );
  }

  if (input.eventType === "planner_registered") {
    const repeatSourceKey = `planner_registered:${input.sourceId}`;
    return existingEvents.some((event) =>
      event.event_type === "planner_registered"
        && (event.source_id === input.sourceId || event.source_key === repeatSourceKey)
    );
  }

  return false;
}

export function isUserProgressRepeatCapExceeded(
  eventType: UserProgressEventType,
  sourceMetaJson: unknown,
  existingEvents: UserProgressEventRow[],
) {
  const sourceMeta = normalizeSourceMeta(sourceMetaJson);
  if (sourceMeta.xp_kind !== "repeat") {
    return false;
  }

  const caps = REPEAT_CAPS[eventType];
  if (!caps) {
    return false;
  }

  const repeatEvents = existingEvents.filter((event) => {
    if (event.event_type !== eventType) {
      return false;
    }

    return normalizeSourceMeta(event.source_meta_json).xp_kind === "repeat";
  });

  if (caps.daily && sourceMeta.cap_day_key) {
    const dailyCount = repeatEvents.filter((event) =>
      normalizeSourceMeta(event.source_meta_json).cap_day_key === sourceMeta.cap_day_key
        || getKstDateKey(event.occurred_at) === sourceMeta.cap_day_key
    ).length;
    if (dailyCount >= caps.daily) {
      return true;
    }
  }

  if (caps.weekly && sourceMeta.cap_week_key) {
    const weeklyCount = repeatEvents.filter((event) =>
      normalizeSourceMeta(event.source_meta_json).cap_week_key === sourceMeta.cap_week_key
        || getKstIsoWeekKey(event.occurred_at) === sourceMeta.cap_week_key
    ).length;
    if (weeklyCount >= caps.weekly) {
      return true;
    }
  }

  return false;
}

function normalizeSourceMeta(value: unknown): {
  xp_kind?: "first" | "repeat";
  cap_day_key?: string;
  cap_week_key?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const xpKind = record.xp_kind === "repeat" || record.xp_kind === "first"
    ? record.xp_kind
    : undefined;

  return {
    xp_kind: xpKind,
    cap_day_key: typeof record.cap_day_key === "string" ? record.cap_day_key : undefined,
    cap_week_key: typeof record.cap_week_key === "string" ? record.cap_week_key : undefined,
  };
}

function getKstDate(isoString: string) {
  return new Date(new Date(isoString).getTime() + 9 * 60 * 60 * 1000);
}

function getKstDateKey(isoString: string) {
  return getKstDate(isoString).toISOString().slice(0, 10);
}

function getKstIsoWeekKey(isoString: string) {
  const date = getKstDate(isoString);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function normalizeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function isDuplicateInsert(error: QueryError | null | undefined) {
  if (!error) {
    return false;
  }

  return error.code === "23505" || error.message.toLowerCase().includes("duplicate key");
}
