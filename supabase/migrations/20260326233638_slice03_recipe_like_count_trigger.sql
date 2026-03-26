create or replace function public.sync_recipe_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.recipes
    set like_count = like_count + 1
    where id = new.recipe_id;

    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.recipes
    set like_count = greatest(0, like_count - 1)
    where id = old.recipe_id;

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists recipe_likes_sync_like_count on public.recipe_likes;

create trigger recipe_likes_sync_like_count
after insert or delete on public.recipe_likes
for each row
execute function public.sync_recipe_like_count();
