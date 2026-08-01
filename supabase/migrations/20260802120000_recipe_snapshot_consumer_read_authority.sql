begin;

alter table public.recipe_content_snapshots enable row level security;
revoke all on table public.recipe_content_snapshots
  from public, anon, authenticated;
grant select on table public.recipe_content_snapshots
  to authenticated, service_role;

drop policy if exists recipe_content_snapshots_authenticated_read
  on public.recipe_content_snapshots;
create policy recipe_content_snapshots_authenticated_read
  on public.recipe_content_snapshots
  for select
  to authenticated
  using (
    owner_user_id is null
    or auth.uid() = owner_user_id
  );

alter table public.recipe_nutrition_snapshots enable row level security;
revoke all on table public.recipe_nutrition_snapshots
  from public, anon, authenticated;
grant select on table public.recipe_nutrition_snapshots
  to authenticated, service_role;

drop policy if exists recipe_nutrition_snapshots_authenticated_read
  on public.recipe_nutrition_snapshots;
create policy recipe_nutrition_snapshots_authenticated_read
  on public.recipe_nutrition_snapshots
  for select
  to authenticated
  using (
    owner_user_id is null
    or auth.uid() = owner_user_id
  );

commit;
