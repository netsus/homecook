-- Normalize duplicate ingredient names and preserve user data references.
-- DML-only and idempotent.

create or replace function pg_temp.ensure_ingredient(
  p_standard_name text,
  p_category text,
  p_default_unit text default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.ingredients (standard_name, category, default_unit)
  values (p_standard_name, p_category, p_default_unit)
  on conflict (standard_name) do update set
    category = excluded.category,
    default_unit = coalesce(public.ingredients.default_unit, excluded.default_unit);

  select id
    into v_id
    from public.ingredients
   where standard_name = p_standard_name;

  return v_id;
end;
$$;

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
  values (v_ingredient_id, v_synonym)
  on conflict (ingredient_id, synonym) do nothing;
end;
$$;

create or replace function pg_temp.merge_or_rename_ingredient(
  p_old_name text,
  p_new_name text,
  p_category text default null,
  p_default_unit text default null
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

    v_new_id := pg_temp.ensure_ingredient(p_new_name, p_category, p_default_unit);
  elsif v_new_id is null then
    update public.ingredients
       set standard_name = p_new_name,
           category = coalesce(p_category, category),
           default_unit = coalesce(default_unit, p_default_unit)
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

  if lower(trim(p_old_name)) <> lower(trim(p_new_name)) then
    perform pg_temp.attach_ingredient_synonym(p_new_name, p_old_name);
  end if;

  delete from public.ingredient_synonyms
   where ingredient_id = v_new_id
     and lower(trim(synonym)) = lower(trim(p_new_name));
end;
$$;

select pg_temp.merge_or_rename_ingredient('강력밀가루', '강력분', '곡류', 'g');
select pg_temp.merge_or_rename_ingredient('굴 소스', '굴소스', '양념', null);
select pg_temp.merge_or_rename_ingredient('계란', '달걀', '기타', '개');
select pg_temp.merge_or_rename_ingredient('노른자', '달걀노른자', '기타', '개');
select pg_temp.merge_or_rename_ingredient('마늘쫑', '마늘종', '채소', null);
select pg_temp.merge_or_rename_ingredient('게맛살', '맛살', '해산물', null);
select pg_temp.merge_or_rename_ingredient('모차렐라 치즈', '모짜렐라 치즈', '유제품', null);
select pg_temp.merge_or_rename_ingredient('박력밀가루', '박력분', '곡류', 'g');
select pg_temp.merge_or_rename_ingredient('바닐라빈 페이스트', '바닐라 페이스트', '양념', 'g');
select pg_temp.merge_or_rename_ingredient('전분가루', '전분', '곡류', null);
select pg_temp.merge_or_rename_ingredient('중력밀가루', '중력분', '곡류', null);
select pg_temp.merge_or_rename_ingredient('체다치즈', '체다 치즈', '유제품', null);
select pg_temp.merge_or_rename_ingredient('치킨 스톡', '치킨스톡', '양념', null);

select pg_temp.ensure_ingredient('머스타드 소스', '양념', null);
select pg_temp.ensure_ingredient('참치액', '양념', null);
select pg_temp.ensure_ingredient('가염버터', '유제품', 'g');

select pg_temp.merge_or_rename_ingredient('유채씨기름', '카놀라유', '양념', null);
select pg_temp.merge_or_rename_ingredient('오리엔탈', '오리엔탈 소스', '양념', null);
select pg_temp.ensure_ingredient('크림', '유제품', null);
select pg_temp.ensure_ingredient('크림 소스', '유제품', null);

delete from public.ingredient_synonyms
 where (ingredient_id = (select id from public.ingredients where standard_name = '연겨자')
        and lower(trim(synonym)) = lower('겨자'))
    or (ingredient_id = (select id from public.ingredients where standard_name = '액젓')
        and lower(trim(synonym)) in (lower('까나리액젓'), lower('까나리 액젓'), lower('멸치액젓')))
    or (ingredient_id = (select id from public.ingredients where standard_name = '버터')
        and lower(trim(synonym)) in (lower('가염버터'), lower('무염버터')))
    or (ingredient_id = (select id from public.ingredients where standard_name = '식용유')
        and lower(trim(synonym)) in (lower('카놀라유'), lower('포도씨유')))
    or (ingredient_id = (select id from public.ingredients where standard_name = '크림 소스')
        and lower(trim(synonym)) in (lower('크림'), lower('생크림')));

select pg_temp.attach_ingredient_synonym('까나리액젓', '까나리 액젓');
select pg_temp.attach_ingredient_synonym('멸치액젓', '멸치 액젓');
select pg_temp.attach_ingredient_synonym('참치액', '참치 액');
select pg_temp.attach_ingredient_synonym('참치액', '참치액젓');
select pg_temp.attach_ingredient_synonym('가염버터', '가염 버터');

select pg_temp.attach_ingredient_synonym('카놀라유', '유채유');
select pg_temp.attach_ingredient_synonym('카놀라유', '유채씨기름');
select pg_temp.attach_ingredient_synonym('카놀라유', '채종유');
select pg_temp.attach_ingredient_synonym('카놀라유', '식용유');

select pg_temp.attach_ingredient_synonym('오리엔탈 소스', '오리엔탈');
select pg_temp.attach_ingredient_synonym('오리엔탈 소스', '오리엔탈 드레싱');
select pg_temp.attach_ingredient_synonym('크림 소스', '크림소스');
