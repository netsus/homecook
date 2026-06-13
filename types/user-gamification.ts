export type UserGamificationNotificationType =
  | "xp_awarded"
  | "achievement_unlocked"
  | "badge_unlocked"
  | "quest_completed"
  | "level_up";

export type UserGamificationNotificationDeliveryChannel =
  | "toast"
  | "archive_only"
  | "silent";

export type UserGamificationBadgeCategory =
  | "tutorial"
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
  icon_url?: string;
  character_url?: string;
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

export type UserGamificationAchievementStatus = "earned" | "active" | "locked";

export interface UserGamificationAchievementBadgeData {
  badge_key: string;
  shape_key: UserGamificationBadgeShapeKey;
  category: UserGamificationBadgeCategory;
}

export interface UserGamificationAchievementMilestoneData {
  achievement_key: string;
  track_key: string | null;
  title: string;
  description: string;
  current: number;
  target: number;
  status: UserGamificationAchievementStatus;
  earned_at: string | null;
  locked_hint: string | null;
  badge: UserGamificationAchievementBadgeData;
}

export interface UserGamificationAchievementCategoryData {
  category_key: UserGamificationBadgeCategory;
  label: string;
  earned_count: number;
  total_count: number;
  milestones: UserGamificationAchievementMilestoneData[];
}

export interface UserGamificationAchievementAlbumData {
  summary: {
    earned_count: number;
    total_count: number;
    completed_category_count: number;
  };
  categories: UserGamificationAchievementCategoryData[];
}

export interface UserGamificationTutorialStepData {
  achievement_key: string;
  title: string;
  current: number;
  target: number;
  status: UserGamificationAchievementStatus;
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
    category_key: "tutorial";
    completed_count: number;
    total_count: number;
    active_steps: UserGamificationTutorialStepData[];
  };
  achievement_album: UserGamificationAchievementAlbumData;
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
