-- User-requested ingredient dictionary follow-up corrections.
-- DML-only and idempotent. Renames preserve existing pantry/shopping/recipe
-- references; pure deletions remove dependent rows before deleting the
-- canonical ingredient row.

create or replace function pg_temp.attach_ingredient_synonym(
  p_standard_name text,
  p_synonym text
)
returns void
language plpgsql
as $$
declare
  v_ingredient_id uuid;
  v_synonym text := nullif(trim(coalesce(p_synonym, '')), '');
begin
  if v_synonym is null then
    return;
  end if;

  select id
    into v_ingredient_id
    from public.ingredients
   where standard_name = p_standard_name;

  if v_ingredient_id is null then
    return;
  end if;

  if lower(trim(p_standard_name)) = lower(v_synonym) then
    delete from public.ingredient_synonyms
     where ingredient_id = v_ingredient_id
       and lower(trim(synonym)) = lower(v_synonym);

    return;
  end if;

  insert into public.ingredient_synonyms (ingredient_id, synonym)
  values (v_ingredient_id, lower(v_synonym))
  on conflict (ingredient_id, synonym) do nothing;
end;
$$;

create or replace function pg_temp.merge_ingredient_name(
  p_old_name text,
  p_new_name text,
  p_category text default null,
  p_default_unit text default null,
  p_keep_old_as_synonym boolean default true
)
returns void
language plpgsql
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
begin
  select id
    into v_old_id
    from public.ingredients
   where standard_name = p_old_name;

  select id
    into v_new_id
    from public.ingredients
   where standard_name = p_new_name;

  if v_old_id is null and v_new_id is null then
    if p_category is null then
      return;
    end if;

    insert into public.ingredients (standard_name, category, default_unit)
    values (p_new_name, p_category, p_default_unit)
    on conflict (standard_name) do nothing;

    select id
      into v_new_id
      from public.ingredients
     where standard_name = p_new_name;
  elsif v_new_id is null then
    update public.ingredients
       set standard_name = p_new_name,
           category = coalesce(p_category, category),
           default_unit = coalesce(default_unit, p_default_unit)
     where id = v_old_id;

    v_new_id := v_old_id;
    v_old_id := null;
  elsif v_old_id is not null and v_old_id <> v_new_id then
    insert into public.ingredient_synonyms (ingredient_id, synonym)
    select v_new_id, lower(trim(synonym))
      from public.ingredient_synonyms
     where ingredient_id = v_old_id
       and trim(synonym) <> ''
       and lower(trim(synonym)) <> lower(trim(p_new_name))
       and (p_keep_old_as_synonym or lower(trim(synonym)) <> lower(trim(p_old_name)))
    on conflict (ingredient_id, synonym) do nothing;

    delete from public.ingredient_synonyms
     where ingredient_id = v_old_id;

    delete from public.pantry_items duplicate_pantry
     where duplicate_pantry.ingredient_id = v_old_id
       and exists (
         select 1
           from public.pantry_items canonical_pantry
          where canonical_pantry.user_id = duplicate_pantry.user_id
            and canonical_pantry.ingredient_id = v_new_id
       );

    update public.pantry_items
       set ingredient_id = v_new_id
     where ingredient_id = v_old_id;

    delete from public.ingredient_bundle_items duplicate_bundle_item
     where duplicate_bundle_item.ingredient_id = v_old_id
       and exists (
         select 1
           from public.ingredient_bundle_items canonical_bundle_item
          where canonical_bundle_item.bundle_id = duplicate_bundle_item.bundle_id
            and canonical_bundle_item.ingredient_id = v_new_id
       );

    update public.ingredient_bundle_items
       set ingredient_id = v_new_id
     where ingredient_id = v_old_id;

    update public.recipe_ingredients
       set ingredient_id = v_new_id
     where ingredient_id = v_old_id;

    delete from public.shopping_list_items duplicate_item
     where duplicate_item.ingredient_id = v_old_id
       and exists (
         select 1
           from public.shopping_list_items canonical_item
          where canonical_item.shopping_list_id = duplicate_item.shopping_list_id
            and canonical_item.ingredient_id = v_new_id
       );

    update public.shopping_list_items
       set ingredient_id = v_new_id
     where ingredient_id = v_old_id;

    update public.recipe_steps
       set ingredients_used = replace(ingredients_used::text, v_old_id::text, v_new_id::text)::jsonb
     where ingredients_used::text like '%' || v_old_id::text || '%';

    delete from public.ingredients
     where id = v_old_id;
  end if;

  update public.ingredients
     set category = coalesce(p_category, category),
         default_unit = coalesce(default_unit, p_default_unit)
   where id = v_new_id;

  if p_keep_old_as_synonym and lower(trim(p_old_name)) <> lower(trim(p_new_name)) then
    perform pg_temp.attach_ingredient_synonym(p_new_name, p_old_name);
  end if;

  delete from public.ingredient_synonyms
   where ingredient_id = v_new_id
     and lower(trim(synonym)) = lower(trim(p_new_name));
end;
$$;

create or replace function pg_temp.delete_ingredient_name(p_name text)
returns void
language plpgsql
as $$
declare
  v_ingredient_id uuid;
begin
  select id
    into v_ingredient_id
    from public.ingredients
   where standard_name = p_name;

  if v_ingredient_id is null then
    return;
  end if;

  delete from public.recipe_ingredients
   where ingredient_id = v_ingredient_id;

  delete from public.shopping_list_items
   where ingredient_id = v_ingredient_id;

  update public.recipe_steps
     set ingredients_used = coalesce(
       (
         select jsonb_agg(ingredient_used)
           from jsonb_array_elements(recipe_steps.ingredients_used) as ingredient_used
          where ingredient_used::text not like '%' || v_ingredient_id::text || '%'
       ),
       '[]'::jsonb
     )
   where ingredients_used::text like '%' || v_ingredient_id::text || '%';

  delete from public.ingredient_synonyms
   where ingredient_id = v_ingredient_id;

  delete from public.pantry_items
   where ingredient_id = v_ingredient_id;

  delete from public.ingredient_bundle_items
   where ingredient_id = v_ingredient_id;

  delete from public.ingredients
   where id = v_ingredient_id;
end;
$$;

select pg_temp.merge_ingredient_name('해물육수', '해물육수코인', '양념', null, true);
select pg_temp.merge_ingredient_name('허니머스타드 소스', '머스타드 소스', '양념', null, true);
select pg_temp.merge_ingredient_name('파', '대파', null, null, true);
select pg_temp.attach_ingredient_synonym('머스타드 소스', '허니머스타드');
select pg_temp.attach_ingredient_synonym('머스타드 소스', '허니 머스타드 소스');
select pg_temp.attach_ingredient_synonym('머스타드 소스', '허니머스타드소스');
select pg_temp.attach_ingredient_synonym('머스타드 소스', '머스타드소스');

select pg_temp.delete_ingredient_name(v.standard_name)
from (values
  ('풋고추')
) as v(standard_name);

delete from public.ingredient_synonyms
 where lower(trim(synonym)) = lower('풋고추');
