export type UserGamificationNotificationType =
  | "xp_awarded"
  | "badge_unlocked"
  | "quest_completed";

export type UserGamificationQuestType = "standard" | "tutorial";

export type UserGamificationQuestStatus = "active" | "completed" | "dismissed";

export interface UserGamificationLevelData {
  current_level: number;
  total_xp: number;
  xp_to_next_level: number;
  progress_percent: number;
}

export interface UserGamificationBadgeData {
  badge_key: string;
  label: string;
  description: string;
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
  payload: Record<string, unknown>;
  created_at: string;
}

export interface UserGamificationData {
  level: UserGamificationLevelData;
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
  };
  last_updated_at: string;
}

export interface UserGamificationSeenData {
  seen_notification_ids: string[];
}

export interface UserGamificationTutorialDismissData {
  quest_key: string;
  status: "dismissed";
}
