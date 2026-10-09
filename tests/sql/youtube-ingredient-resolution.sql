begin;

do $test$
declare
  v_tofu uuid;
  v_cooking_wine uuid;
  v_pasta uuid;
  v_basil_leaf uuid;
  v_olive_oil uuid;
begin
  select id into strict v_tofu from public.ingredients where standard_name = '두부';
  select id into strict v_cooking_wine from public.ingredients where standard_name = '맛술';
  select id into strict v_pasta from public.ingredients where standard_name = '파스타면';
  select id into strict v_basil_leaf from public.ingredients where standard_name = '바질 잎';
  select id into strict v_olive_oil from public.ingredients where standard_name = '올리브 오일';

  if v_cooking_wine <> 'd8e4b087-3629-4f58-8ccd-2185a07d3da5'::uuid
    or not exists (
      select 1 from public.ingredient_synonyms
      where ingredient_id = v_cooking_wine
        and search_name = public.normalize_ingredient_search_name('맛술(미림)')
    ) then
    raise exception 'reviewed cooking-wine synonym migration was not applied';
  end if;
  if (select array_agg(id order by id) from public.match_ingredient_name_exact('큰 사이즈 두부'))
      is distinct from array[v_tofu] then
    raise exception 'size-wrapper resolver parity failed';
  end if;
  if (select array_agg(id order by id) from public.match_ingredient_name_exact('맛술(미림)'))
      is distinct from array[v_cooking_wine] then
    raise exception 'reviewed synonym resolver parity failed';
  end if;
  if exists (select 1 from public.match_ingredient_name_exact('스파게티')) then
    raise exception 'name-only spaghetti must stay unresolved';
  end if;
  if (select array_agg(id order by id) from public.match_ingredient_name_exact_with_context(
        '스파게티', 'g', 'Spaghetti 250g')) is distinct from array[v_pasta] then
    raise exception 'contextual spaghetti resolver parity failed';
  end if;
  if exists (select 1 from public.match_ingredient_name_exact_with_context(
        '스파게티', '인분', 'Spaghetti')) then
    raise exception 'weak spaghetti context must stay unresolved';
  end if;
  if exists (
    select 1
    from (values
      ('Spaghetti sauce 250g'),
      ('Spaghetti squash 250g'),
      ('Barilla Spaghetti 250g'),
      ('Cooked Spaghetti 250g'),
      ('Spaghetti 250kg')
    ) control(raw_text)
    cross join lateral public.match_ingredient_name_exact_with_context(
      '스파게티', 'g', control.raw_text
    ) matched
  ) then
    raise exception 'identity-bearing or mismatched-mass spaghetti context was linked';
  end if;
  if (select array_agg(id order by id) from public.match_ingredient_name_exact('바질 잎'))
      is distinct from array[v_basil_leaf] then
    raise exception 'leaf-specific basil identity was lost';
  end if;
  if (select array_agg(id order by id) from public.match_ingredient_name_exact('올리브 오일'))
      is distinct from array[v_olive_oil] then
    raise exception 'olive oil canonical identity failed';
  end if;
  if exists (select 1 from public.match_ingredient_name_exact('곰곰 두부'))
    or exists (select 1 from public.match_ingredient_name_exact('부침용 두부'))
    or exists (select 1 from public.match_ingredient_name_exact('말린 바질 잎'))
    or exists (select 1 from public.match_ingredient_name_exact('엑스트라버진 올리브 오일')) then
    raise exception 'identity-bearing modifier was erased';
  end if;
  if strpos(pg_get_functiondef(
      'public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'::regprocedure),
      'public.match_ingredient_name_exact_with_context(') = 0 then
    raise exception 'async YouTube resolver did not receive contextual lookup';
  end if;
  if strpos(private.youtube_extraction_shared_dependency_contract_v1(),
      'public.ingredient_lookup_name_candidates(text,text,text)') = 0
    or strpos(private.youtube_extraction_shared_dependency_contract_v1(),
      'public.match_ingredient_name_exact_with_context(text,text,text)') = 0
    or strpos(private.youtube_extraction_shared_dependency_contract_v1(),
      '|definition_sha256=') = 0
    or strpos(private.youtube_extraction_shared_dependency_contract_v1(),
      '|security_definer=false') = 0 then
    raise exception 'resolver helper authority was not added to shared dependency attestation';
  end if;
end;
$test$;

rollback;
