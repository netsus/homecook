export type UserGamificationNotificationType =
  | "xp_awarded"
  | "badge_unlocked"
  | "quest_completed"
  | "level_up";

export type UserGamificationNotificationDeliveryChannel =
  | "toast"
  | "archive_only"
  | "silent";

export type UserGamificationBadgeCategory =
  | "recipe"
  | "planner"
  | "shopping"
  | "cooking"
  | "pantry"
  | "leftovers"
  | "recipebook";

export type UserGamificationBadgeShapeKey =
  | "plate"
  | "shield"
  | "ribbon"
  | "bookmark"
  | "pot"
  | "leaf"
  | "bowl";

export type UserGamificationQuestType = "standard" | "tutorial";

export type UserGamificationQuestStatus = "active" | "completed" | "dismissed";

export interface UserGamificationLevelData {
  current_level: number;
  total_xp: number;
  xp_to_next_level: number;
  progress_percent: number;
}

export interface UserGamificationGradeData {
  grade_key: string;
  label: string;
  level_min: number;
  level_max: number | null;
}

export interface UserGamificationBadgeData {
  badge_key: string;
  label: string;
  description: string;
  category: UserGamificationBadgeCategory;
  shape_key: UserGamificationBadgeShapeKey;
  locked_hint: string | null;
  earned_at: string | null;
  is_new: boolean;
  progress_current?: number;
  progress_target?: number;
  progress_percent?: number;
}

export interface UserGamificationQuestData {
  quest_key: string;
  quest_type: UserGamificationQuestType;
  status: UserGamificationQuestStatus;
  title: string;
  description: string;
  progress_current: number;
  progress_target: number;
  progress_percent: number;
  completed_at: string | null;
  dismissed_at: string | null;
  is_new: boolean;
}

export interface UserGamificationNotificationData {
  id: string;
  notification_type: UserGamificationNotificationType;
  priority: number;
  delivery_channel: UserGamificationNotificationDeliveryChannel;
  toast_eligible: boolean;
  group_key: string | null;
  title: string;
  body: string;
  category: UserGamificationBadgeCategory;
  payload: Record<string, unknown>;
  created_at: string;
  seen_at: string | null;
}

export interface UserGamificationData {
  level: UserGamificationLevelData;
  grade: UserGamificationGradeData;
  featured_badges: UserGamificationBadgeData[];
  badges: {
    earned: UserGamificationBadgeData[];
    locked: UserGamificationBadgeData[];
  };
  quests: {
    active: UserGamificationQuestData[];
    completed_recent: UserGamificationQuestData[];
  };
  tutorial: {
    active_steps: UserGamificationQuestData[];
  };
  notifications: {
    unseen: UserGamificationNotificationData[];
    priority_unseen: UserGamificationNotificationData[];
    archive_preview: UserGamificationNotificationData[];
  };
  last_updated_at: string;
}

export interface UserGamificationArchiveData {
  items: UserGamificationNotificationData[];
  next_cursor: string | null;
  has_next: boolean;
}

export interface UserGamificationSeenData {
  seen_notification_ids: string[];
}

export interface UserGamificationTutorialDismissData {
  quest_key: string;
  status: "dismissed";
}
