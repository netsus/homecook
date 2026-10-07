begin;

-- Read the same current evidence as a new meal entry. Never create a temporary
-- entry or consume/reverse a cooked batch just to calculate a preview.
create function public.preview_meal_log_nutrition(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,
  p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_source_type text,p_source_id uuid,p_amount numeric,p_unit text
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private,pg_temp as $function$
declare
  v_batch public.leftover_dishes%rowtype;
  v_profile uuid; v_product_version uuid; v_product_profile uuid; v_relations jsonb;
  v_amount numeric:=p_amount; v_unit text:=p_unit; v_count integer; v_nutrition jsonb;
begin
  -- The shared authority function locks account/session liveness against cutover;
  -- its verified generation is mandatory even though this RPC does not write.
  perform public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,
    p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  if p_source_type is null or p_source_type not in ('cooked_batch','ingredient','food_product')
    or p_source_id is null or p_amount is null or p_amount<=0
    or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_unit is null or length(p_unit)=0 or length(p_unit)>24 then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;
  if p_source_type='cooked_batch' then
    if p_unit<>'g' then raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023'; end if;
    select * into v_batch from public.leftover_dishes where id=p_source_id and user_id=p_owner_uuid;
    if v_batch.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
    perform private.assert_cooked_batch_cached_projection(v_batch.id,p_owner_uuid);
    if v_batch.weight_status='unrecoverable' then raise exception 'WEIGHT_UNRECOVERABLE' using errcode='55000'; end if;
    if v_batch.weight_status is distinct from 'known' or v_batch.batch_status is distinct from 'available'
      or v_batch.finished_weight_g is null or v_batch.finished_weight_g<=0
      or v_batch.remaining_weight_g is null or p_amount>v_batch.remaining_weight_g then
      raise exception 'CONFLICT' using errcode='55000';
    end if;
    v_nutrition:=private.resolve_cooked_batch_nutrition(v_batch.id,p_owner_uuid);
    return private.compact_meal_log_nutrition(coalesce(v_nutrition->>'calculation_status','unavailable'),
      coalesce(v_nutrition->'values','{}'::jsonb),p_amount/v_batch.finished_weight_g);
  elsif p_source_type='food_product' then
    select current_nutrition_version_id into v_product_version from public.food_products
    where id=p_source_id and deleted_at is null and moderation_status='visible'
      and (visibility='public' or owner_user_id=p_owner_uuid);
    if v_product_version is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
    select nutrition_profile_id,basis_relations_json into v_product_profile,v_relations
    from public.food_product_nutrition_versions where id=v_product_version and product_id=p_source_id;
    if v_product_profile is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
    return private.resolve_meal_log_product_nutrition(v_product_profile,v_relations,p_amount,p_unit,false);
  end if;

  select id into v_profile from public.ingredient_nutrition_profiles
  where ingredient_id=p_source_id and is_primary and is_active and review_status='approved';
  if v_profile is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
  -- Keep conversion eligibility identical to the create branch of mutate_meal_log_entry.
  if p_unit in ('tbsp','tsp','cup') then
    select count(distinct evidence.id),
      (array_agg(p_amount*(case p_unit when 'tbsp' then 15 when 'tsp' then 5 else 200 end)/15*evidence.normalized_g_per_15ml order by evidence.id))[1]
    into v_count,v_amount
    from public.ingredient_nutrition_profiles profile
    join public.ingredient_conversion_assignments assignment on assignment.ingredient_id=profile.ingredient_id
      and assignment.preparation_state=profile.preparation_state and assignment.is_active and assignment.review_status='approved'
    join public.measurement_source_evidence evidence on evidence.id=assignment.evidence_id and evidence.evidence_kind='volume_weight'
      and evidence.is_active and evidence.review_status='approved'
    join public.nutrition_sources source on source.id=evidence.source_id
      and source.is_active and source.review_status='approved' and source.freshness_status='current'
    where profile.id=v_profile;
    if v_count<>1 or v_amount is null then raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023'; end if;
    v_unit:='g';
  elsif lower(p_unit) in ('개','장','piece','pieces') then
    select count(*),(array_agg(p_amount*piece.weight_g order by piece.id))[1] into v_count,v_amount
    from public.ingredient_nutrition_profiles profile
    join public.piece_unit_weights piece on piece.ingredient_id=profile.ingredient_id
      and piece.preparation_state=profile.preparation_state and piece.is_active and piece.review_status='approved'
    join public.measurement_source_evidence evidence on evidence.id=piece.evidence_id
      and piece.size_code=evidence.size_code and piece.preparation_state=evidence.preparation_state
      and evidence.evidence_kind='piece_weight' and evidence.is_active and evidence.review_status='approved'
      and lower(evidence.source_observed_unit) in ('개','장','piece','pieces')
    join public.nutrition_sources source on source.id=evidence.source_id
      and source.is_active and source.review_status='approved' and source.freshness_status='current'
    where profile.id=v_profile;
    if v_count<>1 or v_amount is null then raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023'; end if;
    v_unit:='g';
  elsif p_unit not in ('g','kg') then
    raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023';
  end if;
  select nutrition_profile_id into v_product_profile from public.ingredient_nutrition_profiles where id=v_profile;
  return private.resolve_meal_log_profile_nutrition(v_product_profile,v_amount,v_unit,false);
end;
$function$;
alter function public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text) owner to postgres;
revoke all on function public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text) to service_role;

-- Delegate every pre-existing path unchanged; allow only this exact RPC/scope.
alter function private.verify_full_local_internal_scope() rename to verify_scope_pre_meal_log_preview_20261006;
create function private.verify_full_local_internal_scope() returns void language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp as $$
begin
  if coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope'='snapshot-v2-session'
    and current_setting('request.method',true)='POST'
    and current_setting('request.path',true)='/rpc/preview_meal_log_nutrition' then return; end if;
  perform private.verify_scope_pre_meal_log_preview_20261006();
end;
$$;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.verify_full_local_internal_scope(),private.verify_scope_pre_meal_log_preview_20261006() from public,anon,authenticated,service_role;
commit;
