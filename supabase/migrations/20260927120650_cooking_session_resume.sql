-- Reopening the same unfinished cooking source resumes it; completed attempts stay historical.
begin;
do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef('public.start_snapshot_v2_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,text,uuid[],jsonb,uuid,bigint,numeric,timestamptz)'::regprocedure);
  v_old := E'  v_owner_uuid uuid;\nbegin';
  v_new := E'  v_owner_uuid uuid;\n  v_resume public.cooking_sessions%rowtype;\nbegin';
  if strpos(v_definition,v_old)=0 then raise exception 'COOKING_RESUME_DECLARATION_DRIFT'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  v_old := $old$      if exists (
        select 1 from public.cooking_session_meal_claims as claim
        where claim.meal_id = v_meal.id
      ) then
        raise exception 'MEAL_COOKING_ALREADY_STARTED' using errcode = '23505';
      end if;$old$;
  if strpos(v_definition,v_old)=0 then raise exception 'COOKING_RESUME_CLAIM_DRIFT'; end if;
  v_definition := replace(v_definition,v_old,'');
  v_old := $old$  if current_setting('homecook.snapshot_v2_creation', true) is distinct from 'on' then
    raise exception 'SNAPSHOT_V2_CREATION_DISABLED' using errcode = '55000';
  end if;
$old$;
  if strpos(v_definition,v_old)=0 then raise exception 'COOKING_RESUME_FEATURE_DRIFT'; end if;
  v_definition := replace(v_definition,v_old,'');
  v_old := $old$  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, true
  );
  set constraints all deferred;
  insert into public.cooking_sessions ($old$;
  v_new := $new$  -- Recipe/account/meal locks and the preceding access/revision checks still apply.
  select session.* into v_resume from public.cooking_sessions session
  where session.user_id=p_owner_uuid and session.contract_version='snapshot_v2'
    and session.session_kind=p_mode and session.status='in_progress'
    and session.recipe_id=v_recipe_id
    and session.recipe_content_snapshot_id=v_content_snapshot_id
    and session.cooking_servings=v_cooking_servings
    and (
      (p_mode='standalone' and session.base_recipe_revision=p_expected_recipe_revision)
      or (p_mode='planner'
        and (select array_agg(link.meal_id order by link.meal_id) from public.cooking_session_meals link where link.session_id=session.id)
          = (select array_agg(id order by id) from unnest(p_meal_ids) requested(id))
        and (select count(*) from public.cooking_session_meal_claims claim
          where claim.session_id=session.id and claim.owner_user_id=p_owner_uuid and claim.meal_id=any(p_meal_ids))=cardinality(p_meal_ids)
      )
    )
  order by session.created_at desc,session.id
  limit 1 for update;
  if v_resume.id is not null then
    v_session_id := v_resume.id;
  else
    if p_mode='planner' and exists(select 1 from public.cooking_session_meal_claims where meal_id=any(p_meal_ids)) then
      raise exception 'MEAL_COOKING_ALREADY_STARTED' using errcode='23505';
    end if;
    if current_setting('homecook.snapshot_v2_creation',true) is distinct from 'on' then
      raise exception 'SNAPSHOT_V2_CREATION_DISABLED' using errcode='55000';
    end if;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, true
  );
  set constraints all deferred;
  insert into public.cooking_sessions ($new$;
  if strpos(v_definition,v_old)=0 then raise exception 'COOKING_RESUME_INSERT_DRIFT'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  v_old := $old$  v_result := jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'session_id', v_session_id,$old$;
  v_new := $new$  end if;

  v_result := jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'session_id', v_session_id,$new$;
  if strpos(v_definition,v_old)=0 then raise exception 'COOKING_RESUME_RESULT_DRIFT'; end if;
  execute replace(v_definition,v_old,v_new);
end;
$migration$;
notify pgrst,'reload schema';
commit;
