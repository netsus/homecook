-- FoodSafety pilot recipe ingredient follow-up.
-- DML-only and idempotent. Keeps reviewed pilot recipe rows resolvable before
-- the recipe seed migration.

create or replace function pg_temp.merge_or_rename_ingredient(
  p_old_name text,
  p_new_name text
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
  elsif v_old_id is not null and v_old_id <> v_new_id then
    insert into public.ingredient_synonyms (ingredient_id, synonym)
    select v_new_id, synonym
      from public.ingredient_synonyms
     where ingredient_id = v_old_id
       and lower(trim(synonym)) <> lower(trim(p_new_name))
       and trim(synonym) <> ''
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
  end if;

  if lower(trim(p_old_name)) <> lower(trim(p_new_name)) then
    insert into public.ingredient_synonyms (ingredient_id, synonym)
    values (v_new_id, p_old_name)
    on conflict (ingredient_id, synonym) do nothing;
  end if;

  delete from public.ingredient_synonyms
   where ingredient_id = v_new_id
     and lower(trim(synonym)) = lower(trim(p_new_name));
end;
$$;

select pg_temp.merge_or_rename_ingredient('발사믹', '발사믹 식초');
select pg_temp.merge_or_rename_ingredient('월계수', '월계수잎');
select pg_temp.merge_or_rename_ingredient('스파게티면', '파스타면');

insert into public.ingredients (standard_name, category, default_unit)
values
  ('강황가루', '양념', null),
  ('건새우', '해산물', null),
  ('계피가루', '양념', null),
  ('귀리밥', '곡류', null),
  ('다진생강', '양념', null),
  ('들깨가루', '양념', null),
  ('마늘기름', '양념', null),
  ('멸치액젓', '양념', null),
  ('모시조개', '해산물', null),
  ('미니새송이버섯', '채소', null),
  ('민들레 잎', '채소', null),
  ('발사믹 식초', '양념', null),
  ('새송이버섯', '채소', null),
  ('생강청', '양념', null),
  ('석류즙', '과일', null),
  ('실곤약', '곡류', null),
  ('어간장', '양념', null),
  ('열무김치 국물', '양념', null),
  ('오렌지 껍질', '과일', null),
  ('오렌지즙', '과일', null),
  ('월계수잎', '양념', null),
  ('유자청', '양념', null),
  ('적양배추', '채소', null),
  ('칵테일새우', '해산물', null),
  ('탄산수', '기타', 'ml'),
  ('통후추', '양념', null),
  ('파스타면', '곡류', null),
  ('해물육수', '양념', null),
  ('홍고추', '채소', null),
  ('화이트크림', '유제품', null)
on conflict (standard_name) do nothing;

insert into public.ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(v.synonym))
from (values
  ('강황가루', '강황 가루'),
  ('계피가루', '계피 가루'),
  ('다진생강', '다진 생강'),
  ('들깨가루', '들깨 가루'),
  ('멸치액젓', '멸치 액젓'),
  ('미니새송이버섯', '미니 새송이버섯'),
  ('발사믹 식초', '발사믹'),
  ('발사믹 식초', '발사믹크레마'),
  ('발사믹 식초', '발사믹식초'),
  ('비지', '콩비지'),
  ('새송이버섯', '새송이 버섯'),
  ('식용유', '튀김기름'),
  ('열무김치 국물', '열무김치국물'),
  ('오렌지 껍질', '오렌지껍질'),
  ('오렌지즙', '오렌지 즙'),
  ('월계수잎', '월계수'),
  ('적양배추', '적 양배추'),
  ('칵테일새우', '칵테일 새우'),
  ('탄산수', 'sparkling water'),
  ('통후추', '통 후추'),
  ('파스타면', '스파게티면'),
  ('해물육수', '해물 육수')
) as v(standard_name, synonym)
join public.ingredients i on i.standard_name = v.standard_name
where trim(v.synonym) <> ''
  and lower(trim(v.synonym)) <> lower(trim(i.standard_name))
on conflict (ingredient_id, synonym) do nothing;
