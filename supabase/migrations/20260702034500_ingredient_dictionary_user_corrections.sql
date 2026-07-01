-- User-requested ingredient dictionary corrections.
-- DML-only and idempotent. Canonical replacements preserve existing
-- recipe/pantry/shopping references; pure deletions remove rows that still
-- point at the deleted canonical ingredient.

insert into public.ingredients (standard_name, category, category_code, default_unit)
values
  ('방울토마토', '채소', 'fruiting_vegetable_mushroom', null),
  ('오리엔탈 소스', '양념', 'paste_sauce', null),
  ('참깨', '양념', 'spice_herb', null),
  ('발사믹 식초', '양념', 'oil_vinegar_sugar_stock', null),
  ('크림 소스', '양념', 'paste_sauce', null)
on conflict (standard_name) do nothing;

create or replace function pg_temp.merge_ingredient_name(
  p_old_name text,
  p_new_name text,
  p_keep_old_as_synonym boolean
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
    return;
  end if;

  if v_new_id is null then
    update public.ingredients
       set standard_name = p_new_name
     where id = v_old_id;

    v_new_id := v_old_id;
    v_old_id := null;
  end if;

  if p_keep_old_as_synonym and lower(trim(p_old_name)) <> lower(trim(p_new_name)) then
    insert into public.ingredient_synonyms (ingredient_id, synonym)
    values (v_new_id, lower(trim(p_old_name)))
    on conflict (ingredient_id, synonym) do nothing;
  end if;

  if v_old_id is null or v_old_id = v_new_id then
    delete from public.ingredient_synonyms
     where ingredient_id = v_new_id
       and lower(trim(synonym)) = lower(trim(p_new_name));

    if not p_keep_old_as_synonym then
      delete from public.ingredient_synonyms
       where ingredient_id = v_new_id
         and lower(trim(synonym)) = lower(trim(p_old_name));
    end if;

    return;
  end if;

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

  update public.shopping_list_items
     set ingredient_id = v_new_id
   where ingredient_id = v_old_id;

  update public.recipe_steps
     set ingredients_used = replace(ingredients_used::text, v_old_id::text, v_new_id::text)::jsonb
   where ingredients_used::text like '%' || v_old_id::text || '%';

  delete from public.ingredients
   where id = v_old_id;

  delete from public.ingredient_synonyms
   where ingredient_id = v_new_id
     and lower(trim(synonym)) = lower(trim(p_new_name));

  if not p_keep_old_as_synonym then
    delete from public.ingredient_synonyms
     where ingredient_id = v_new_id
       and lower(trim(synonym)) = lower(trim(p_old_name));
  end if;
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

select pg_temp.merge_ingredient_name('체리토마토', '방울토마토', true);
select pg_temp.merge_ingredient_name('오리엔탈', '오리엔탈 소스', true);
select pg_temp.merge_ingredient_name('깨', '참깨', true);
select pg_temp.merge_ingredient_name('통깨', '참깨', true);
select pg_temp.merge_ingredient_name('발사믹', '발사믹 식초', true);
select pg_temp.merge_ingredient_name('발사믹 소스', '발사믹 식초', false);
select pg_temp.merge_ingredient_name('월계수', '월계수잎', false);

insert into public.ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(v.synonym))
from (values
  ('방울토마토', '체리토마토'),
  ('오리엔탈 소스', '오리엔탈'),
  ('참깨', '통깨'),
  ('참깨', '깨'),
  ('발사믹 식초', '발사믹')
) as v(standard_name, synonym)
join public.ingredients i
  on i.standard_name = v.standard_name
where trim(v.synonym) <> ''
  and lower(trim(v.synonym)) <> lower(trim(i.standard_name))
on conflict (ingredient_id, synonym) do nothing;

select pg_temp.delete_ingredient_name(v.standard_name)
from (values
  ('견과류'),
  ('가공당'),
  ('과당'),
  ('감미료'),
  ('고기 소스'),
  ('굴 소스'),
  ('껌'),
  ('돼지불고기 양념'),
  ('바닐라빈 페이스트'),
  ('샐러드 드레싱'),
  ('소불고기 양념'),
  ('쇠기름'),
  ('쇼트닝'),
  ('스파게티 소스'),
  ('양념닭 소스'),
  ('연어기름')
) as v(standard_name);
