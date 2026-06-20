alter table public.leftover_dishes
  add column if not exists stale_reviewed_at timestamptz;

comment on column public.leftover_dishes.stale_reviewed_at is
  'Timestamp when the user confirmed a stale leftover should keep being stored.';
