begin;

-- Piece families are semantic: a sheet cannot borrow a whole-item weight.
-- A leading literal 1 is accepted only in source observations, never user units.
create function private.ingredient_piece_unit_family(p_unit text, p_observation boolean default false)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $function$
  select case
    when unit in ('개','알','통','piece','pieces') then 'count'
    when unit = '장' then 'sheet'
    when unit in ('대','줄기') then 'stalk'
    when unit = '모' then 'block'
    when unit in ('줌','handful','handfuls') then 'handful'
    when unit in ('꼬집','pinch','pinches') then 'pinch'
  end
  from (select case when p_observation
    then regexp_replace(lower(btrim(p_unit,chars)), '^1[' || chars || ']*', '')
    else lower(btrim(p_unit,chars)) end as unit
    from (select chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
      chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||
      chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279) as chars) whitespace
    ) normalized;
$function$;

create function private.ingredient_piece_default_size(p_unit text)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $function$
  select case private.ingredient_piece_unit_family(p_unit)
    when 'handful' then 'handful' when 'pinch' then 'pinch' else 'medium' end;
$function$;

-- Shared by newly selected and pinned meal evidence. Review/current checks for
-- pinned historical evidence remain at the caller; quantity equality stays frozen.
create function private.ingredient_piece_observation_matches(
  p_input_unit text, p_size text, p_weight numeric,
  p_observed_unit text, p_observed_amount numeric, p_observed_weight numeric)
returns boolean language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $function$
  select coalesce(
    private.ingredient_piece_unit_family(p_input_unit) =
      private.ingredient_piece_unit_family(p_observed_unit,true)
    and p_size = private.ingredient_piece_default_size(p_input_unit)
    and p_observed_amount = 1 and p_weight > 0
    and p_weight::text not in ('NaN','Infinity','-Infinity')
    and p_weight = p_observed_weight, false);
$function$;

create function private.ingredient_piece_candidates(p_ingredient_id uuid)
returns jsonb language sql stable
set search_path = pg_catalog, public, pg_temp
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'piece_weight_id', piece.id, 'evidence_id', evidence.id, 'source_id', source.id,
    'preparation_state', piece.preparation_state, 'size_code', piece.size_code,
    'weight_g', piece.weight_g, 'evidence_kind', evidence.evidence_kind,
    'evidence_preparation_state', evidence.preparation_state,
    'evidence_size_code', evidence.size_code,
    'source_observed_amount', evidence.source_observed_amount,
    'source_observed_unit', evidence.source_observed_unit,
    'observed_weight_g', evidence.observed_weight_g,
    'source', jsonb_build_object('provider',source.provider_code,
      'dataset',source.dataset_name,'source_version',source.source_version,
      'data_basis_date',source.data_basis_date,'license',source.license_name,
      'source_url',source.source_url)
  ) order by piece.id::text collate "C"), '[]'::jsonb)
  from public.piece_unit_weights piece
  join public.measurement_source_evidence evidence on evidence.id=piece.evidence_id
  join public.nutrition_sources source on source.id=evidence.source_id
  where piece.ingredient_id=p_ingredient_id
    and piece.is_active and piece.review_status='approved'
    and evidence.evidence_kind='piece_weight'
    and piece.size_code=evidence.size_code
    and piece.preparation_state=evidence.preparation_state
    and evidence.is_active and evidence.review_status='approved'
    and source.is_active and source.review_status='approved' and source.freshness_status='current'
    and evidence.source_observed_amount=1
    and private.ingredient_piece_unit_family(evidence.source_observed_unit,true) is not null
    and piece.weight_g>0 and piece.weight_g::text not in ('NaN','Infinity','-Infinity')
    and evidence.observed_weight_g=piece.weight_g;
$function$;

create function private.select_ingredient_piece_candidate(
  p_candidates jsonb, p_unit text, p_preparation_state text)
returns jsonb language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $function$
  select case when count(*)=1 then (jsonb_agg(candidate))[0] else null end
  from jsonb_array_elements(coalesce(p_candidates,'[]'::jsonb)) candidate
  where candidate->>'preparation_state'=p_preparation_state
    and candidate->>'evidence_preparation_state'=p_preparation_state
    and candidate->>'evidence_kind'='piece_weight'
    and candidate->>'evidence_size_code'=candidate->>'size_code'
    and private.ingredient_piece_observation_matches(p_unit,candidate->>'size_code',
      (candidate->>'weight_g')::numeric,candidate->>'source_observed_unit',
      (candidate->>'source_observed_amount')::numeric,(candidate->>'observed_weight_g')::numeric);
$function$;
alter function private.ingredient_piece_unit_family(text,boolean) owner to postgres;
revoke all on function private.ingredient_piece_unit_family(text,boolean) from public, anon, authenticated, service_role;
alter function private.ingredient_piece_default_size(text) owner to postgres;
revoke all on function private.ingredient_piece_default_size(text) from public, anon, authenticated, service_role;
alter function private.ingredient_piece_observation_matches(text,text,numeric,text,numeric,numeric) owner to postgres;
revoke all on function private.ingredient_piece_observation_matches(text,text,numeric,text,numeric,numeric) from public, anon, authenticated, service_role;
alter function private.ingredient_piece_candidates(uuid) owner to postgres;
revoke all on function private.ingredient_piece_candidates(uuid) from public, anon, authenticated, service_role;
alter function private.select_ingredient_piece_candidate(jsonb,text,text) owner to postgres;
revoke all on function private.select_ingredient_piece_candidate(jsonb,text,text) from public, anon, authenticated, service_role;

-- Fail closed if a concurrent migration has changed any consumer. Keep AI/product
-- wrappers, ownership, ACLs, idempotency, stale guards and historical branches.
do $patch_consumers$
declare patch record; v_definition text; v_owner oid; v_acl aclitem[]; v_count integer; v_signature text;
begin
  if md5(pg_get_functiondef('private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,timestamp with time zone)'::regprocedure)) <> '23e58e0684967713c05209bc306fd6e3' then
    raise exception 'PIECE_UNIT_FUNCTION_BASELINE_MISMATCH: mutate_meal_log_entry_prelaunch_20260919';
  end if;
  if md5(pg_get_functiondef('private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)'::regprocedure)) <> '86f9d5ecc2b115aadc00df99dfd70d58' then
    raise exception 'PIECE_UNIT_FUNCTION_BASELINE_MISMATCH: build_recipe_nutrition_input_guard_pre_product_20260922';
  end if;
  if md5(pg_get_functiondef('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)'::regprocedure)) <> 'd7bdfaf0ffa3ad749a2711af44982c1f' then
    raise exception 'PIECE_UNIT_FUNCTION_BASELINE_MISMATCH: build_recipe_draft_nutrition_guard_pre_product_20260922';
  end if;
  if md5(pg_get_functiondef('private.recipe_nutrition_sources_pre_product_20260922(jsonb)'::regprocedure)) <> '735ebf8b6d9324c7e13173b0fe2bc3c5' then
    raise exception 'PIECE_UNIT_FUNCTION_BASELINE_MISMATCH: recipe_nutrition_sources_pre_product_20260922';
  end if;
  if md5(pg_get_functiondef('public.preview_meal_log_nutrition(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,numeric,text)'::regprocedure)) <> '90072d4b71815710aa265b6bddae0cac' then
    raise exception 'PIECE_UNIT_FUNCTION_BASELINE_MISMATCH: preview_meal_log_nutrition';
  end if;
  if md5(pg_get_functiondef('public.get_ingredient_ai_recipe_refresh_input(uuid,uuid)'::regprocedure)) <> 'a0a13fb1756fde0c3f5d1bc7de65d9e7' then
    raise exception 'PIECE_UNIT_FUNCTION_BASELINE_MISMATCH: get_ingredient_ai_recipe_refresh_input';
  end if;
  for patch in select * from (values
    ('private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)', $old$'conversion_candidates', conversion.candidates,$old$, $new$'conversion_candidates', conversion.candidates,
          'piece_candidates', piece_candidates.candidates,
          'selected_piece_weight_id', piece_selected.candidate ->> 'piece_weight_id',$new$, 1, 0),
    ('private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)', $old$  ) selected$old$, $new$  ) selected
  cross join lateral (select private.ingredient_piece_candidates(ingredient.ingredient_id) as candidates) piece_candidates
  cross join lateral (
    select private.select_ingredient_piece_candidate(piece_candidates.candidates,ingredient.unit,
      (select candidate->>'preparation_state' from jsonb_array_elements(nutrition.candidates) candidate
       where candidate->>'link_id'=selected.link_id::text)) as candidate
  ) piece_selected$new$, 1, 1),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$'conversion_candidates', conversion.candidates,$old$, $new$'conversion_candidates', conversion.candidates,
          'piece_candidates', piece_candidates.candidates,
          'selected_piece_weight_id', piece_selected.candidate ->> 'piece_weight_id',$new$, 1, 2),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$'conversion_candidates', '[]'::jsonb,$old$, $new$'conversion_candidates', '[]'::jsonb,
          'piece_candidates', '[]'::jsonb,
          'selected_piece_weight_id', null,$new$, 1, 3),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$  ) as selected$old$, $new$  ) as selected
  cross join lateral (select private.ingredient_piece_candidates((ingredient.ingredient ->> 'ingredient_id')::uuid) as candidates) piece_candidates
  cross join lateral (
    select private.select_ingredient_piece_candidate(piece_candidates.candidates,ingredient.ingredient ->> 'unit',
      (select candidate->>'preparation_state' from jsonb_array_elements(nutrition.candidates) candidate
       where candidate->>'link_id'=selected.link_id::text)) as candidate
  ) piece_selected$new$, 1, 4),
    ('private.recipe_nutrition_sources_pre_product_20260922(jsonb)', $old$      select jsonb_build_object(
        'piece_weight_id', piece_weight.id,
        'size_code', piece_weight.size_code,
        'preparation_state', piece_weight.preparation_state,
        'weight_g', piece_weight.weight_g,
        'source', jsonb_build_object(
          'provider', source.provider_code,
          'dataset', source.dataset_name,
          'source_version', source.source_version,
          'data_basis_date', source.data_basis_date,
          'license', source.license_name,
          'source_url', source.source_url
        )
      ) as candidate
      from public.piece_unit_weights piece_weight
      join public.measurement_source_evidence evidence
        on evidence.id = piece_weight.evidence_id
      join public.nutrition_sources source on source.id = evidence.source_id
      where piece_weight.ingredient_id::text =
          (guard_ingredient.ingredient ->> 'ingredient_id')
        and piece_weight.size_code = 'medium'
        and piece_weight.preparation_state =
          (nutrition.candidate ->> 'preparation_state')
        and piece_weight.review_status = 'approved'
        and piece_weight.is_active
        and evidence.evidence_kind = 'piece_weight'
        and evidence.size_code = 'medium'
        and evidence.preparation_state = piece_weight.preparation_state
        and evidence.review_status = 'approved'
        and evidence.is_active
        and source.review_status = 'approved'
        and source.freshness_status = 'current'
        and source.is_active
      order by piece_weight.id::text collate "C"
      limit 1$old$, $new$      select private.select_ingredient_piece_candidate(
        coalesce(guard_ingredient.ingredient -> 'piece_candidates','[]'::jsonb),
        guard_ingredient.ingredient ->> 'unit',nutrition.candidate ->> 'preparation_state') as candidate
      where guard_ingredient.ingredient ->> 'selected_piece_weight_id' = (
        private.select_ingredient_piece_candidate(
          coalesce(guard_ingredient.ingredient -> 'piece_candidates','[]'::jsonb),
          guard_ingredient.ingredient ->> 'unit',nutrition.candidate ->> 'preparation_state') ->> 'piece_weight_id')$new$, 1, 5),
    ('private.recipe_nutrition_sources_pre_product_20260922(jsonb)', $old$selected.unit in ('개', '장', '대', '모', 'piece', 'pieces')$old$, $new$private.ingredient_piece_unit_family(selected.ingredient ->> 'unit') is not null$new$, 1, 6),
    ('private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,timestamp with time zone)', $old$lower(v_unit) in ('개','장','piece','pieces')$old$, $new$private.ingredient_piece_unit_family(v_unit) is not null$new$, 1, 7),
    ('private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,timestamp with time zone)', $old$lower(evidence.source_observed_unit) in ('개','장','piece','pieces')$old$, $new$private.ingredient_piece_observation_matches(v_unit,piece.size_code,piece.weight_g,
              evidence.source_observed_unit,evidence.source_observed_amount,evidence.observed_weight_g)$new$, 2, 8),
    ('public.preview_meal_log_nutrition(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,numeric,text)', $old$lower(p_unit) in ('개','장','piece','pieces')$old$, $new$private.ingredient_piece_unit_family(p_unit) is not null$new$, 1, 9),
    ('public.preview_meal_log_nutrition(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,numeric,text)', $old$lower(evidence.source_observed_unit) in ('개','장','piece','pieces')$old$, $new$private.ingredient_piece_observation_matches(p_unit,piece.size_code,piece.weight_g,
              evidence.source_observed_unit,evidence.source_observed_amount,evidence.observed_weight_g)$new$, 1, 10),
    ('public.get_ingredient_ai_recipe_refresh_input(uuid,uuid)', $old$'preparation_state', evidence.preparation_state, 'size_code', evidence.size_code,$old$, $new$'preparation_state', evidence.preparation_state, 'size_code', evidence.size_code,
      'source_observed_unit', evidence.source_observed_unit,
      'source_observed_amount', evidence.source_observed_amount,
      'observed_weight_g', evidence.observed_weight_g,$new$, 1, 11)
  ) as patches(signature,old_text,new_text,expected_count,ordinal) order by ordinal loop
    if v_signature is distinct from patch.signature then
      if v_signature is not null then
        execute v_definition;
        if exists(select 1 from pg_proc where oid=v_signature::regprocedure
          and (proowner is distinct from v_owner or proacl is distinct from v_acl)) then
          raise exception 'PIECE_UNIT_PRIVILEGE_CHANGED: %',v_signature;
        end if;
      end if;
      v_signature:=patch.signature;
      select proowner,proacl into v_owner,v_acl from pg_proc where oid=v_signature::regprocedure;
      v_definition:=pg_get_functiondef(v_signature::regprocedure);
    end if;
    v_count:=(length(v_definition)-length(replace(v_definition,patch.old_text,'')))/length(patch.old_text);
    if v_count<>patch.expected_count then raise exception 'PIECE_UNIT_ANCHOR_MISMATCH: %',patch.signature; end if;
    v_definition:=replace(v_definition,patch.old_text,patch.new_text);
  end loop;
  execute v_definition;
  if exists(select 1 from pg_proc where oid=v_signature::regprocedure
    and (proowner is distinct from v_owner or proacl is distinct from v_acl)) then
    raise exception 'PIECE_UNIT_PRIVILEGE_CHANGED: %',v_signature;
  end if;
end;
$patch_consumers$;
commit;
