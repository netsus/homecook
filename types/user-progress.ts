export type UserProgressEventType =
  | "cooking_completed"
  | "shopping_completed"
  | "recipe_saved"
  | "custom_book_created"
  | "planner_registered";

export type UserProgressLevelCurveVersion = "v1" | "v2";

export interface UserProgressGradeData {
  grade_key: string;
  label: string;
  level_min: number;
  level_max: number | null;
  icon_url?: string;
  character_url?: string;
}

export interface UserProgressLevelData {
  current_level: number;
  total_xp: number;
  current_level_start_xp: number;
  next_level_start_xp: number;
  xp_into_current_level: number;
  xp_to_next_level: number;
  progress_ratio: number;
  progress_percent: number;
}

export interface UserProgressEventCounts {
  cooking_completed: number;
  shopping_completed: number;
  recipe_saved_distinct_ever: number;
  custom_book_created: number;
  planner_registered_first: number;
  planner_registered_repeat: number;
}

export interface UserProgressData {
  level: UserProgressLevelData;
  event_counts: UserProgressEventCounts;
  last_updated_at: string;
}
