create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, ingredient_id)
);

create index if not exists pantry_items_user_ingredient_idx
  on public.pantry_items (user_id, ingredient_id);

alter table public.pantry_items enable row level security;

drop policy if exists pantry_items_select_own on public.pantry_items;
create policy pantry_items_select_own
  on public.pantry_items
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists pantry_items_insert_own on public.pantry_items;
create policy pantry_items_insert_own
  on public.pantry_items
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists pantry_items_delete_own on public.pantry_items;
create policy pantry_items_delete_own
  on public.pantry_items
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.pantry_items to authenticated;
grant all privileges on public.pantry_items to service_role;
