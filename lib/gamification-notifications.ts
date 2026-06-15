import type { UserGamificationNotificationData } from "@/types/user-gamification";

const DISPLAY_PRIORITY: Record<UserGamificationNotificationData["notification_type"], number> = {
  level_up: 1,
  achievement_unlocked: 2,
  badge_unlocked: 3,
  quest_completed: 4,
  xp_awarded: 5,
};

export function isHiddenGrowthNotification(
  item: UserGamificationNotificationData,
) {
  if (item.delivery_channel === "silent") return true;
  return false;
}

export function isVisibleGrowthNotification(
  item: UserGamificationNotificationData,
) {
  return !isHiddenGrowthNotification(item);
}

export function isVisibleGrowthToastNotification(
  item: UserGamificationNotificationData,
) {
  return (
    isVisibleGrowthNotification(item) &&
    item.toast_eligible !== false &&
    !item.seen_at
  );
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function compareDisplayPriority(
  left: UserGamificationNotificationData,
  right: UserGamificationNotificationData,
) {
  return DISPLAY_PRIORITY[left.notification_type] - DISPLAY_PRIORITY[right.notification_type];
}

function mergedIdsFor(group: UserGamificationNotificationData[]) {
  return [...new Set(group.flatMap(getGrowthNotificationIdsForSeen))];
}

function mergedTypesFor(group: UserGamificationNotificationData[]) {
  return [...new Set(group.map((item) => item.notification_type))];
}

function mergedXpDeltaFor(group: UserGamificationNotificationData[]) {
  return group
    .filter((item) => item.notification_type === "xp_awarded")
    .reduce((sum, item) => sum + toNumber(item.payload.xp_delta), 0);
}

function appendXp(body: string, xpDelta: number) {
  if (xpDelta <= 0) return body;
  if (body.includes(`+${xpDelta} XP`)) return body;
  return body ? `${body} +${xpDelta} XP` : `+${xpDelta} XP`;
}

function isGradeUpNotification(item: UserGamificationNotificationData) {
  return item.notification_type === "level_up" && item.payload.grade_upgrade === true;
}

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function achievementIdentity(item: UserGamificationNotificationData) {
  if (item.notification_type === "achievement_unlocked") {
    return toText(item.payload.achievement_key) ||
      toText(item.payload.badge_key) ||
      item.id;
  }
  if (item.notification_type === "badge_unlocked") {
    return toText(item.payload.badge_key) ||
      toText(item.payload.achievement_key) ||
      item.id;
  }
  if (item.notification_type === "quest_completed") {
    return toText(item.payload.achievement_key) ||
      toText(item.payload.quest_key) ||
      item.id;
  }
  return item.id;
}

function withMergedPayload(
  representative: UserGamificationNotificationData,
  group: UserGamificationNotificationData[],
  options: { appendXp?: boolean } = {},
) {
  const mergedNotificationTypes = mergedTypesFor(group);
  const mergedXpDelta = mergedXpDeltaFor(group);
  const first = group[0]!;
  const allSeen = group.every((item) => item.seen_at);

  return {
    ...representative,
    created_at: first.created_at,
    delivery_channel: group.some((item) => item.delivery_channel === "toast")
      ? "toast"
      : representative.delivery_channel,
    toast_eligible: group.some((item) => item.toast_eligible),
    seen_at: allSeen ? representative.seen_at : null,
    body:
      representative.notification_type === "xp_awarded" || options.appendXp === false
        ? representative.body
        : appendXp(representative.body, mergedXpDelta),
    payload: {
      ...representative.payload,
      merged_notification_ids: mergedIdsFor(group),
      merged_notification_types: mergedNotificationTypes,
      merged_xp_delta: mergedXpDelta,
    },
  } satisfies UserGamificationNotificationData;
}

function compactGroup(group: UserGamificationNotificationData[]) {
  if (group.length <= 1) return [group[0]!];

  const xpRows = group.filter((item) => item.notification_type === "xp_awarded");
  const levelRows = group.filter((item) =>
    item.notification_type === "level_up" && !isGradeUpNotification(item)
  );
  const gradeRows = group.filter(isGradeUpNotification);
  const achievementUnlockRows = group.filter((item) => item.notification_type === "achievement_unlocked");
  const badgeRows = group.filter((item) => item.notification_type === "badge_unlocked");
  const questRows = group.filter((item) => item.notification_type === "quest_completed");
  const achievementRows = [...achievementUnlockRows, ...badgeRows, ...questRows];
  const output: UserGamificationNotificationData[] = [];
  const levelRepresentative = [...levelRows].sort(compareDisplayPriority)[0];
  const gradeRepresentative = [...gradeRows].sort(compareDisplayPriority)[0];
  const xpRepresentative = [...xpRows].sort(compareDisplayPriority)[0];
  const achievementRepresentatives: UserGamificationNotificationData[] = [];
  const seenAchievementIdentities = new Set<string>();

  [...achievementRows].sort(compareDisplayPriority).forEach((item) => {
    const identity = achievementIdentity(item);
    if (seenAchievementIdentities.has(identity)) return;
    seenAchievementIdentities.add(identity);
    achievementRepresentatives.push(item);
  });

  achievementRepresentatives.forEach((representative, index) => {
    const identity = achievementIdentity(representative);
    const relatedRows = achievementRows.filter(
      (item) => item.id === representative.id || achievementIdentity(item) === identity,
    );
    output.push(withMergedPayload(
      representative,
      index === 0 ? [...relatedRows, ...xpRows] : relatedRows,
      { appendXp: index === 0 },
    ));
  });

  if (levelRepresentative) {
    output.push(withMergedPayload(
      levelRepresentative,
      output.length > 0 ? levelRows : [...levelRows, ...xpRows],
      { appendXp: output.length === 0 },
    ));
  }

  if (gradeRepresentative) {
    output.push(withMergedPayload(
      gradeRepresentative,
      output.length === 0 ? [...gradeRows, ...xpRows] : gradeRows,
      { appendXp: output.length === 0 },
    ));
  }

  if (
    achievementRepresentatives.length === 0 &&
    !levelRepresentative &&
    !gradeRepresentative &&
    xpRepresentative
  ) {
    output.push(withMergedPayload(xpRepresentative, xpRows, { appendXp: false }));
  }

  if (output.length > 0) {
    return output;
  }

  return [withMergedPayload([...group].sort(compareDisplayPriority)[0]!, group)];
}

export function getGrowthNotificationIdsForSeen(
  item: UserGamificationNotificationData,
) {
  const mergedIds = item.payload.merged_notification_ids;
  if (!Array.isArray(mergedIds)) return [item.id];

  const ids = mergedIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  return ids.length > 0 ? ids : [item.id];
}

export function compactGrowthNotificationsForDisplay(
  items: UserGamificationNotificationData[],
) {
  const buckets: Array<{
    firstIndex: number;
    group: UserGamificationNotificationData[];
  }> = [];
  const bucketByGroupKey = new Map<string, (typeof buckets)[number]>();

  items.forEach((item, index) => {
    if (!item.group_key) {
      buckets.push({ firstIndex: index, group: [item] });
      return;
    }

    const existing = bucketByGroupKey.get(item.group_key);
    if (existing) {
      existing.group.push(item);
      return;
    }

    const bucket = { firstIndex: index, group: [item] };
    bucketByGroupKey.set(item.group_key, bucket);
    buckets.push(bucket);
  });

  return buckets
    .sort((left, right) => left.firstIndex - right.firstIndex)
    .flatMap((bucket) => compactGroup(bucket.group));
}
