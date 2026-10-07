export type ActionNotificationEventType =
  | "meal_planned"
  | "shopping_created"
  | "shopping_completed"
  | "cooking_completed"
  | "pantry_deducted"
  | "meal_logged"
  | "leftover_consumed";

export interface ActionNotification {
  id: string;
  event_type: ActionNotificationEventType;
  title: string;
  message: string;
  target_path: string;
  created_at: string;
  seen_at: string | null;
}

export interface ActionNotificationPage {
  items: ActionNotification[];
  next_cursor: string | null;
  has_next: boolean;
  unread_count: number;
}
