-- Continue an existing owner's plan from its pre-deletion pin, never a new standalone source.
begin;
do $migration$
declare v_definition text; v_old text; v_new text;
begin
  v_definition := pg_get_functiondef('public.start_snapshot_v2_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,text,uuid[],jsonb,uuid,bigint,numeric,timestamptz)'::regprocedure);
  v_old := 'if v_recipe.id is null or v_recipe.deleted_at is not null then';
  v_new := $new$if v_recipe.id is null or (v_recipe.deleted_at is not null and not coalesce((
    p_mode='planner' and v_recipe.created_by=p_owner_uuid
    and recipe_visibility_guard.is_owner_publicly_visible(p_owner_uuid)
    and (v_recipe.visibility='private' or (v_recipe.visibility='public'
      and v_recipe.source_type='manual' and v_recipe.origin_recipe_id is null))
    and exists (
      select 1 from public.recipe_content_snapshots pinned
      where pinned.id=v_content_snapshot_id and pinned.recipe_id=v_recipe_id
        and pinned.created_at<=v_recipe.deleted_at
        and (pinned.owner_user_id=p_owner_uuid or (v_recipe.visibility='public' and pinned.owner_user_id is null))
    )
    and cardinality(p_meal_ids)>0
    and (select count(*) from public.meals where id=any(p_meal_ids))=cardinality(p_meal_ids)
    and not exists (
      select 1 from public.meals meal where meal.id=any(p_meal_ids)
        and not coalesce((meal.user_id=p_owner_uuid and meal.recipe_id=v_recipe_id
          and meal.recipe_content_snapshot_id=v_content_snapshot_id
          and meal.created_at<=v_recipe.deleted_at),false)
    )
  ),false)) then$new$;
  if strpos(v_definition,v_old)=0 then raise exception 'COOKING_DELETED_PLAN_START_GUARD_DRIFT'; end if;
  execute replace(v_definition,v_old,v_new);

  v_definition := pg_get_functiondef('public.read_snapshot_v2_cook_mode(uuid,timestamptz,text,integer,timestamptz,uuid,timestamptz)'::regprocedure);
  v_old := $old$if v_recipe_row.id is null
    or v_recipe_row.deleted_at is not null then$old$;
  v_new := $new$if v_recipe_row.id is null or (v_recipe_row.deleted_at is not null and not coalesce((
    v_session.session_kind='planner' and v_recipe_row.created_by=p_owner_uuid
    and recipe_visibility_guard.is_owner_publicly_visible(p_owner_uuid)
    and (v_recipe_row.visibility='private' or (v_recipe_row.visibility='public'
      and v_recipe_row.source_type='manual' and v_recipe_row.origin_recipe_id is null))
    and v_snapshot.recipe_id=v_session.recipe_id
    and v_snapshot.created_at<=v_recipe_row.deleted_at
    and (v_snapshot.owner_user_id=p_owner_uuid or (v_recipe_row.visibility='public' and v_snapshot.owner_user_id is null))
    and exists(select 1 from public.cooking_session_meals where session_id=v_session.id)
    and not exists (
      select 1 from public.cooking_session_meals link
      left join public.meals meal on meal.id=link.meal_id
      where link.session_id=v_session.id and not coalesce((
        meal.user_id=p_owner_uuid and meal.recipe_id=v_session.recipe_id
        and link.recipe_id=v_session.recipe_id
        and meal.recipe_content_snapshot_id=v_snapshot.id
        and meal.created_at<=v_recipe_row.deleted_at
      ),false)
    )
  ),false)) then$new$;
  if strpos(v_definition,v_old)=0 then raise exception 'COOKING_DELETED_PLAN_READ_GUARD_DRIFT'; end if;
  execute replace(v_definition,v_old,v_new);
end;
$migration$;
notify pgrst,'reload schema';
commit;
