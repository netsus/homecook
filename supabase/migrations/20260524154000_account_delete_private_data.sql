create or replace function public.delete_user_private_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authored_recipe_ids uuid[] := '{}'::uuid[];
  v_saved_recipe_ids uuid[] := '{}'::uuid[];
  v_liked_recipe_ids uuid[] := '{}'::uuid[];
  v_deleted_user_count integer := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'cannot delete another user private data'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
    into v_authored_recipe_ids
    from public.recipes
    where created_by = p_user_id;

  select coalesce(array_agg(distinct recipe_id), '{}'::uuid[])
    into v_liked_recipe_ids
    from public.recipe_likes
    where user_id = p_user_id;

  select coalesce(array_agg(distinct rbi.recipe_id), '{}'::uuid[])
    into v_saved_recipe_ids
    from public.recipe_book_items rbi
    join public.recipe_books rb
      on rb.id = rbi.book_id
    where rb.user_id = p_user_id;

  -- Keep authored recipes, but remove the user row so all user-owned
  -- private data cascades and recipes.created_by becomes null.
  delete from public.users
    where id = p_user_id;
  get diagnostics v_deleted_user_count = row_count;

  if cardinality(v_saved_recipe_ids) > 0 then
    update public.recipes recipe
      set save_count = (
        select count(*)::integer
        from public.recipe_book_items item
        where item.recipe_id = recipe.id
      )
      where recipe.id = any(v_saved_recipe_ids);
  end if;

  if cardinality(v_liked_recipe_ids) > 0 then
    update public.recipes recipe
      set like_count = (
        select count(*)::integer
        from public.recipe_likes like_row
        where like_row.recipe_id = recipe.id
      )
      where recipe.id = any(v_liked_recipe_ids);
  end if;

  return jsonb_build_object(
    'deleted', true,
    'user_deleted', v_deleted_user_count > 0,
    'preserved_recipe_count', cardinality(v_authored_recipe_ids)
  );
end;
$$;

grant execute on function public.delete_user_private_data(uuid) to authenticated, service_role;

do $$
declare
  v_deleted_user_id uuid;
begin
  for v_deleted_user_id in
    select id
    from public.users
    where deleted_at is not null
  loop
    perform public.delete_user_private_data(v_deleted_user_id);
  end loop;
end;
$$;
