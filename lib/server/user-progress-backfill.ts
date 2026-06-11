import {
  buildUserProgressEventInsert,
  buildUserProgressSummary,
  isUserProgressRepeatCapExceeded,
  type UserProgressAwardInput,
  type UserProgressEventRow,
} from "@/lib/server/user-progress";

export interface PlannerRegisteredBackfillMealRow {
  id: string;
  created_at: string;
}

export function buildPlannerRegisteredBackfillEvents(input: {
  userId: string;
  meals: PlannerRegisteredBackfillMealRow[];
  existingEvents?: Parameters<typeof buildUserProgressSummary>[0]["events"];
}) {
  const existingEvents: UserProgressEventRow[] = [...(input.existingEvents ?? [])];
  const inserts: ReturnType<typeof buildUserProgressEventInsert>[] = [];

  for (const meal of [...input.meals]
    .sort((left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      || left.id.localeCompare(right.id)
    )) {
    const draft: UserProgressAwardInput = {
      userId: input.userId,
      eventType: "planner_registered",
      sourceTable: "meals",
      sourceId: meal.id,
      occurredAt: meal.created_at,
    };
    const insert = buildUserProgressEventInsert(draft, { existingEvents, backfill: true });

    if (existingEvents.some((event) =>
      event.event_type === "planner_registered"
        && (event.source_id === meal.id || event.source_key === insert.source_key)
    )) {
      continue;
    }

    if (isUserProgressRepeatCapExceeded(draft.eventType, insert.source_meta_json, existingEvents)) {
      continue;
    }

    existingEvents.push(insert);
    inserts.push(insert);
  }

  return inserts;
}

export function dryRunUserProgressBackfill(input: {
  userId: string;
  existingEvents: Parameters<typeof buildUserProgressSummary>[0]["events"];
  plannerMeals?: PlannerRegisteredBackfillMealRow[];
}) {
  const plannerEvents = buildPlannerRegisteredBackfillEvents({
    userId: input.userId,
    meals: input.plannerMeals ?? [],
    existingEvents: input.existingEvents,
  });
  const summary = buildUserProgressSummary({
    userId: input.userId,
    events: [...input.existingEvents, ...plannerEvents],
  });

  return {
    summary,
    would_insert_progress_events: plannerEvents.length,
    would_insert_notifications: 0,
  };
}
