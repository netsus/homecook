create or replace function public.increment_recipe_view_count(p_recipe_id uuid)
returns table(id uuid, view_count integer)
language sql
security definer
set search_path = public
as $$
  update public.recipes
     set view_count = view_count + 1
   where recipes.id = p_recipe_id
  returning recipes.id, recipes.view_count;
$$;
