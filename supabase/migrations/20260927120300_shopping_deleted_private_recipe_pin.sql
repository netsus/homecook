-- An owner's existing plan keeps its immutable recipe after source soft-delete.
-- This does not expose deleted recipes or authorize new plans/forks from them.
begin;
do $preserve_deleted_recipe_plans$
declare
  v_signature regprocedure;
  v_definition text;
  v_old text;
  v_new text;
  v_expected integer;
  v_count integer;
begin
  foreach v_signature in array array[
    'public.create_shopping_list_with_snapshot_authority(uuid,timestamptz,text,integer,timestamptz,uuid,text,date,date,boolean,uuid[],jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure,
    'public.create_shopping_list_from_payload(uuid,text,date,date,boolean,uuid[],jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_signature);
    if strpos(v_definition, 'shopping_deleted_private_pin_v1') > 0 then continue; end if;
    if v_signature::text like 'create_shopping_list_with_snapshot_authority(%'
      or v_signature::text like 'public.create_shopping_list_with_snapshot_authority(%' then
      v_expected := 1;
      v_old := $old_outer$   and recipe.deleted_at is null
   and (
     recipe.created_by = p_owner_uuid
     or (
       recipe.visibility = 'public'
       and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
     )
   )$old_outer$;
      v_new := $new_outer$   and (
     (
     recipe.deleted_at is null
     and (
       recipe.created_by = p_owner_uuid
       or (
         recipe.visibility = 'public'
         and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
       )
     )
     )
     or (
       -- shopping_deleted_private_pin_v1: existing owner history only.
       recipe.deleted_at is not null
       and recipe.visibility = 'private'
       and recipe.created_by = p_owner_uuid
       and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
       and meal.created_at <= recipe.deleted_at
       and exists (
         select 1 from public.recipe_content_snapshots as pinned
         where pinned.id = meal.recipe_content_snapshot_id
           and pinned.recipe_id = meal.recipe_id
           and pinned.owner_user_id = p_owner_uuid
           and pinned.created_at <= recipe.deleted_at
       )
     )
   )$new_outer$;
    else
      v_expected := 2;
      v_old := $old_inner$   and recipe.deleted_at is null
   and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
   and (
     recipe.visibility = 'public'
     or recipe.created_by = p_user_id
   )$old_inner$;
      v_new := $new_inner$   and (
     (
     recipe.deleted_at is null
     and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
     and (
       recipe.visibility = 'public'
       or recipe.created_by = p_user_id
     )
     )
     or (
       -- shopping_deleted_private_pin_v1: existing owner history only.
       recipe.deleted_at is not null
       and recipe.visibility = 'private'
       and recipe.created_by = p_user_id
       and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
       and meal.created_at <= recipe.deleted_at
       and exists (
         select 1 from public.recipe_content_snapshots as pinned
         where pinned.id = meal.recipe_content_snapshot_id
           and pinned.recipe_id = meal.recipe_id
           and pinned.owner_user_id = p_user_id
           and pinned.created_at <= recipe.deleted_at
       )
     )
   )$new_inner$;
    end if;
    v_count := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
    if v_count <> v_expected then raise exception 'SHOPPING_DELETED_SOURCE_GUARD_DRIFT: %',v_signature; end if;
    execute replace(v_definition,v_old,v_new);
  end loop;
end;
$preserve_deleted_recipe_plans$;
notify pgrst, 'reload schema';
commit;
