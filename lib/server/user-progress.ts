import type {
  UserProgressData,
  UserProgressEventCounts,
  UserProgressEventType,
  UserProgressLevelData,
} from "@/types/user-progress";
import type { UserGamificationDbClient } from "@/lib/server/user-gamification";

interface QueryError {
  code?: string;
  message: string;
}

interface UserProgressEventRow {
  event_type: UserProgressEventType;
  source_key: string;
  xp_delta: number;
  occurred_at: string;
}

interface UserProgressSummaryRow {
  user_id: string;
  total_xp: number;
  current_level: number;
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
  sourceTable: "leftover_dishes" | "shopping_lists" | "recipe_books";
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

export const USER_PROGRESS_XP_AWARDS: Record<UserProgressEventType, number> = {
  cooking_completed: 50,
  shopping_completed: 30,
  recipe_saved: 10,
  custom_book_created: 20,
};

const ZERO_EVENT_COUNTS: UserProgressEventCounts = {
  cooking_completed: 0,
  shopping_completed: 0,
  recipe_saved_distinct_ever: 0,
  custom_book_created: 0,
};

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

function getLevelStartXp(level: number) {
  return Math.max(0, (100 * (level - 1) * level) / 2);
}

export function buildProgressSourceKey(input: UserProgressAwardInput) {
  if (input.eventType === "recipe_saved") {
    return `recipe_saved:${input.userId}:${input.recipeId}`;
  }

  return `${input.eventType}:${input.sourceId}`;
}

export function buildUserProgressEventInsert(input: UserProgressAwardInput): UserProgressEventInsert {
  return {
    user_id: input.userId,
    event_type: input.eventType,
    source_key: buildProgressSourceKey(input),
    source_table: input.sourceTable,
    source_id: input.sourceId,
    xp_delta: USER_PROGRESS_XP_AWARDS[input.eventType],
    occurred_at: input.occurredAt ?? new Date().toISOString(),
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
    const insertResult = await dbClient
      .from("user_progress_events")
      .insert(buildUserProgressEventInsert(input))
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
      .select("user_id, total_xp, current_level, event_counts, last_event_at, last_updated_at")
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

export async function recalculateUserProgressSummary(
  dbClient: UserProgressDbClient,
  userId: string,
): Promise<{ data: UserProgressSummaryRow | null; error: QueryError | null }> {
  const eventsResult = await dbClient
    .from("user_progress_events")
    .select("event_type, source_key, xp_delta, occurred_at")
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
    .select("user_id, total_xp, current_level, event_counts, last_event_at, last_updated_at")
    .maybeSingle();

  if (upsertResult.error || !upsertResult.data) {
    return {
      data: null,
      error: upsertResult.error ?? { message: "missing progress summary upsert result" },
    };
  }

  return { data: upsertResult.data, error: null };
}

export function toUserProgressData(summary: UserProgressSummaryRow): UserProgressData {
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
  };
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
