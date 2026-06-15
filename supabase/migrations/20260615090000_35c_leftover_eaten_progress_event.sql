alter table public.user_progress_events
  drop constraint if exists user_progress_events_event_type_check;

alter table public.user_progress_events
  add constraint user_progress_events_event_type_check
  check (event_type in (
    'cooking_completed',
    'shopping_completed',
    'recipe_saved',
    'custom_book_created',
    'planner_registered',
    'leftover_eaten'
  ));
