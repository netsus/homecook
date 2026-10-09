-- Full seeded isolated database, after 20261009090000. The final ambiguity
-- fixture adds one synonym; all data and local session claims are rolled back.
begin;
set local statement_timeout = '60s';
do $verify$
declare
  v_input text; v_char integer; v_alias record; v_count integer; v_id uuid;
  v_actor uuid; v_plain jsonb; v_variant jsonb; v_result jsonb; v_alias_count integer := 0;
  v_columns text[]; v_cutover uuid; v_other_id uuid;
begin
  foreach v_char in array array[9,10,13,32,160,8203,8204,8205,8288,65279,12288] loop
    v_input := '다진' || chr(v_char) || '마늘';
    if public.normalize_ingredient_search_name(v_input) is distinct from '다진마늘' then
      raise exception 'normalization failed for codepoint %', v_char;
    end if;
    if (select count(*) from public.match_ingredient_name_exact(v_input)) <> 1 then
      raise exception 'exact dictionary lookup failed for codepoint %', v_char;
    end if;
  end loop;
  if public.normalize_ingredient_search_name('Ｓｏｙ　Ｓａｕｃｅ') <> 'soysauce' then
    raise exception 'NFKC/case folding regressed';
  end if;
  if public.normalize_ingredient_search_name(chr(4358) || chr(8203) || chr(4449) || '늘') <> '마늘' then
    raise exception 'format removal left Hangul decomposed';
  end if;
  if public.normalize_ingredient_search_name('닭고기, 가슴, 삶은것') =
    public.normalize_ingredient_search_name('닭고기, 가슴, 생것') then
    raise exception 'preparation identities were collapsed';
  end if;
  if exists (select 1 from public.ingredients where search_name is distinct from
      public.normalize_ingredient_search_name(standard_name))
    or exists (select 1 from public.ingredient_synonyms where search_name is distinct from
      public.normalize_ingredient_search_name(synonym)) then
    raise exception 'stored generated search keys are stale';
  end if;
  if exists(select 1 from public.match_ingredient_name_exact('다쥔마늘')) then
    raise exception 'an unregistered typo was silently merged';
  end if;

  select array_agg(column_name::text order by ordinal_position) into v_columns
    from information_schema.columns where table_schema='public' and table_name='ingredient_catalog_aliases';
  if v_columns[cardinality(v_columns)-2:cardinality(v_columns)] is distinct from
    array['representative_standard_name','representative_category','representative_category_code'] then
    raise exception 'representative metadata not appended at end of view';
  end if;
  if not exists(select 1 from pg_class where oid='public.ingredient_catalog_aliases'::regclass
    and reloptions @> array['security_invoker=true']) then raise exception 'view lost invoker security'; end if;
  if has_table_privilege('anon','public.ingredient_representative_links','SELECT')
    or has_table_privilege('authenticated','public.ingredient_representative_links','SELECT') then
    raise exception 'private representative evidence access expanded';
  end if;

  select id into v_actor from public.users where deleted_at is null order by id limit 1;
  if v_actor is null then raise exception 'seeded actor required for ranked API fixture'; end if;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  for v_alias in select alias.ingredient_id,alias.representative_ingredient_id,
      alias.standard_name,alias.representative_standard_name
    from public.ingredient_catalog_aliases alias
  loop
    v_alias_count := v_alias_count + 1;
    select count(*), (array_agg(id))[1] into v_count,v_id
      from public.match_ingredient_name_exact(v_alias.standard_name);
    if v_count<>1 or v_id is distinct from v_alias.representative_ingredient_id then
      raise exception 'canonical alias did not resolve once: %',v_alias.standard_name;
    end if;
    if not exists(select 1 from public.ingredient_synonyms
      where ingredient_id=v_alias.representative_ingredient_id
        and search_name=public.normalize_ingredient_search_name(v_alias.standard_name)) then
      raise exception 'original standard name not attached to representative';
    end if;
    if not exists(select 1 from public.ingredients where id=v_alias.ingredient_id) then
      raise exception 'source ingredient identity was removed';
    end if;
    v_result:=public.search_food_catalog_ranked(v_actor,v_alias.standard_name,array['ingredient'],null,null,null,repeat('0',64),50);
    if exists(select 1 from jsonb_array_elements(v_result->'items') item where item->>'id'=v_alias.ingredient_id::text)
      or (select count(*) from jsonb_array_elements(v_result->'items') item
        where item->>'id'=v_alias.representative_ingredient_id::text)<>1 then
      raise exception 'ranked search did not collapse the pair: %',v_alias.standard_name;
    end if;
  end loop;
  if v_alias_count<>20 then raise exception 'operational fixture expects the reviewed twenty aliases'; end if;

  -- This old source-only alias is deliberately not copied; projection must keep
  -- it searchable while returning the representative, not the source ID.
  select count(*), (array_agg(id))[1] into v_count,v_id
    from public.match_ingredient_name_exact('생 마늘종 꽃줄기');
  if v_count<>1 or v_id is distinct from
      (select id from public.ingredients where standard_name='마늘종') then
    raise exception 'attached alias projection failed';
  end if;
  v_result:=public.search_food_catalog_ranked(v_actor,'생 마늘종 꽃줄기',array['ingredient'],null,null,null,repeat('0',64),50);
  if (select count(*) from jsonb_array_elements(v_result->'items') item where item->>'id'=v_id::text)<>1 then
    raise exception 'ranked attached alias projection failed';
  end if;
  if (select count(*) from public.match_ingredient_name_exact('닭고기, 가슴, 생것'))<>1 then
    raise exception 'same representative remains falsely ambiguous';
  end if;
  if (select count(*) from public.match_ingredient_name_exact('꽃줄기'))<2
    or (select count(*) from public.match_ingredient_name_exact('가슴'))<2 then
    raise exception 'genuinely different ingredients lost ambiguity';
  end if;
  if (select count(*) from public.match_ingredient_name_exact('닭가슴살'))<>1 then
    raise exception 'real canonical precedence regressed';
  end if;

  v_plain:=public.search_food_catalog_ranked(v_actor,'다진 마늘',array['ingredient'],null,null,null,repeat('0',64),50);
  foreach v_char in array array[8203,8204,8205,8288,65279] loop
    v_variant:=public.search_food_catalog_ranked(v_actor,'다진'||chr(v_char)||'마늘',array['ingredient'],null,null,null,repeat('0',64),50);
    -- Word spacing changes query_parts but must not change the leading exact ID.
    if v_plain->'items'->0->>'id' is distinct from v_variant->'items'->0->>'id' then
      raise exception 'format character changed ranked exact winner: %',v_char;
    end if;
  end loop;

  v_result:=public.search_food_catalog_ranked(v_actor,'',array['food_product'],'mine',null,null,repeat('1',64),50);
  if exists(select 1 from jsonb_array_elements(v_result->'items') item
    join public.food_products product on product.id=(item->>'id')::uuid
    where product.owner_user_id is distinct from v_actor or product.visibility<>'private') then
    raise exception 'private product owner filter regressed';
  end if;

  -- An old alias-standard name is a synonym, not a canonical override.
  -- A genuinely different ingredient sharing it must remain ambiguous.
  select current_cutover_attempt_id into v_cutover
    from public.account_generation_capability_state where singleton;
  perform public.set_account_generation_internal_writer_marker(v_cutover, true);
  select id into v_other_id from public.ingredients where standard_name='다진마늘';
  insert into public.ingredient_synonyms(ingredient_id,synonym)
    values(v_other_id,'슈가파우더') on conflict(ingredient_id,synonym) do nothing;
  if (select count(*) from public.match_ingredient_name_exact('슈가파우더'))<>2 then
    raise exception 'old alias canonical name hid a genuinely different synonym match';
  end if;
  if (select count(*) from public.match_ingredient_name_exact('가루 설탕'))<>1
    or (select count(*) from public.match_ingredient_name_exact('다진마늘'))<>1 then
    raise exception 'actual canonical priority regressed under synonym collision';
  end if;

  perform set_config('request.headers','{"x-homecook-public-read-scope":"ingredients"}',true);
  perform set_config('request.path','/ingredient_catalog_aliases',true);
  perform set_config('request.method','GET',true);
  perform private.verify_full_local_anonymous_authority();
  perform set_config('request.method','POST',true);
  begin
    perform private.verify_full_local_anonymous_authority();
    raise exception 'public alias view write unexpectedly admitted';
  exception when object_not_in_prerequisite_state then null; end;
  perform set_config('request.method','GET',true);
  perform set_config('request.headers','{"x-homecook-public-read-scope":"recipes"}',true);
  begin
    perform private.verify_full_local_anonymous_authority();
    raise exception 'unrelated public scope unexpectedly admitted alias view';
  exception when object_not_in_prerequisite_state then null; end;
end;
$verify$;
set local role youtube_extraction_worker_rpc_owner;
do $worker_verify$
begin
  if (select count(*) from public.match_ingredient_name_exact('슈 가 파우더')) <> 2 then
    raise exception 'async worker cannot resolve aliases with the collision fixture';
  end if;
  if (select count(*) from public.match_ingredient_name_exact('다진' || chr(8203) || '마늘')) <> 1 then
    raise exception 'async worker cannot normalize pasted formatting';
  end if;
  if exists (select 1 from public.ingredient_catalog_entries where presentation <> 'alias') then
    raise exception 'worker can read non-alias catalog review rows';
  end if;
  if has_table_privilege(current_user, 'public.ingredient_catalog_entries', 'SELECT')
    or has_column_privilege(current_user, 'public.ingredient_catalog_entries', 'review_state', 'SELECT')
    or has_column_privilege(current_user, 'public.ingredient_catalog_entries', 'ingredient_id', 'UPDATE')
    or has_table_privilege(current_user, 'public.ingredient_representative_links', 'SELECT') then
    raise exception 'worker alias access is broader than three public read-only fields';
  end if;
end;
$worker_verify$;
reset role;
rollback;
