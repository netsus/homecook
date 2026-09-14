begin;

grant select on table public.recipe_nutrition_snapshots to anon;

drop policy if exists recipe_nutrition_snapshots_anon_public_current_read
  on public.recipe_nutrition_snapshots;
create policy recipe_nutrition_snapshots_anon_public_current_read
  on public.recipe_nutrition_snapshots
  for select
  to anon
  using (
    owner_user_id is null
    and is_current
    and exists (
      select 1
      from public.recipes recipe
      where recipe.id = recipe_nutrition_snapshots.recipe_id
        and recipe.visibility = 'public'
        and recipe.deleted_at is null
    )
  );

comment on policy recipe_nutrition_snapshots_anon_public_current_read
  on public.recipe_nutrition_snapshots is
  'Anonymous recipe detail may read only the current nutrition snapshot of an undeleted public recipe.';

commit;
