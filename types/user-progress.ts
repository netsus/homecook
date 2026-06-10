export type UserProgressEventType =
  | "cooking_completed"
  | "shopping_completed"
  | "recipe_saved"
  | "custom_book_created";

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
}

export interface UserProgressData {
  level: UserProgressLevelData;
  event_counts: UserProgressEventCounts;
  last_updated_at: string;
}
