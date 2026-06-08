-- Expand the canonical ingredient category list with fruit while keeping the
-- existing string-based ingredients.category contract.

create or replace function public.register_youtube_ingredient(
  p_standard_name text,
  p_category text,
  p_default_unit text,
  p_synonym text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_standard_name text := regexp_replace(trim(coalesce(p_standard_name, '')), '[[:space:]]+', ' ', 'g');
  v_category text := trim(coalesce(p_category, ''));
  v_default_unit text := nullif(trim(coalesce(p_default_unit, '')), '');
  v_synonym text := nullif(lower(trim(coalesce(p_synonym, ''))), '');
  v_ingredient public.ingredients%rowtype;
  v_synonym_status text := 'not_requested';
  v_warnings text[] := array[]::text[];
  v_inserted_count integer := 0;
begin
  if v_standard_name = ''
    or char_length(v_standard_name) > 100
    or coalesce(p_standard_name, '') ~ '[[:cntrl:]]'
    or v_category not in ('채소', '과일', '육류', '해산물', '양념', '유제품', '곡류', '기타')
    or (v_default_unit is not null and char_length(v_default_unit) > 20)
    or (coalesce(p_default_unit, '') ~ '[[:cntrl:]]')
    or (v_synonym is not null and char_length(v_synonym) > 100)
    or (coalesce(p_synonym, '') ~ '[[:cntrl:]]')
  then
    raise exception 'invalid ingredient registration input';
  end if;

  insert into public.ingredients (standard_name, category, default_unit)
  values (v_standard_name, v_category, v_default_unit)
  on conflict (standard_name) do nothing;

  select *
    into v_ingredient
    from public.ingredients
    where standard_name = v_standard_name;

  if not found then
    raise exception 'ingredient registration failed';
  end if;

  if v_synonym is null then
    v_synonym_status := 'not_requested';
  elsif lower(trim(v_synonym)) = lower(trim(v_ingredient.standard_name)) then
    v_synonym_status := 'skipped_same_as_standard';
  elsif exists (
    select 1
    from public.ingredient_synonyms
    where synonym = v_synonym
      and ingredient_id <> v_ingredient.id
  ) then
    v_synonym_status := 'skipped_ambiguous';
    v_warnings := array_append(v_warnings, '같은 동의어가 다른 재료에 이미 연결되어 동의어 저장을 건너뛰었어요.');
  else
    insert into public.ingredient_synonyms (ingredient_id, synonym)
    values (v_ingredient.id, v_synonym)
    on conflict (ingredient_id, synonym) do nothing;

    get diagnostics v_inserted_count = row_count;
    if v_inserted_count = 0 then
      v_synonym_status := 'already_attached';
    else
      v_synonym_status := 'attached';
    end if;
  end if;

  return jsonb_build_object(
    'ingredient_id', v_ingredient.id,
    'standard_name', v_ingredient.standard_name,
    'category', v_ingredient.category,
    'default_unit', v_ingredient.default_unit,
    'synonym_status', v_synonym_status,
    'warnings', to_jsonb(v_warnings)
  );
end;
$$;

grant execute on function public.register_youtube_ingredient(
  text,
  text,
  text,
  text
) to authenticated, service_role;

update public.ingredients
set category = '과일'
where category <> '과일'
  and standard_name in (
    '딸기',
    '생딸기',
    '사과',
    '바나나',
    '레몬',
    '라임',
    '오렌지',
    '귤',
    '배',
    '키위',
    '복숭아',
    '포도',
    '블루베리',
    '망고'
  );
