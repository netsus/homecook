begin;

select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  v_binding public.user_session_generation_bindings%rowtype;
  v_extraction_id uuid := '21000000-0000-4000-8000-000000000001';
  v_key uuid := '61000000-0000-4000-8000-000000000001';
  v_result jsonb;
  v_draft_id uuid;
  v_content jsonb := '{
    "title":"실제 권한 검사","base_servings":1,"tags":[],
    "ingredients":[{"row_id":"41000000-0000-4000-8000-000000000001","source_draft_ingredient_id":null,"standard_name":"미연결 재료","quantity_mode":"unknown","amount":null,"unit":null,"display_text":null,"component_label":null}],
    "steps":[{"row_id":"51000000-0000-4000-8000-000000000001","source_step_index":null,"instruction":"확인한다","component_label":null,"duration_text":null}]
  }'::jsonb;
begin
  select * into v_binding
  from public.user_session_generation_bindings
  where revoked_at is null
    and binding_state = 'active'
    and binding_expires_at > clock_timestamp()
  order by bound_at desc
  limit 1;
  if v_binding.owner_uuid is null then
    raise exception 'active canonical session fixture is required';
  end if;

  set local session_replication_role = replica;
  insert into public.youtube_extraction_sessions(
    id,user_id,youtube_url,youtube_video_id,classification_status,draft_json,
    extraction_meta_json,expires_at,status,created_at,updated_at
  ) values (
    v_extraction_id,v_binding.owner_uuid,
    'https://www.youtube.com/watch?v=authority01','authority01','recipe',
    '{"ingredients":[],"steps":[]}'::jsonb,'{"authority_fixture":true}'::jsonb,
    clock_timestamp()+interval '1 hour','draft',clock_timestamp(),clock_timestamp()
  );
  set local session_replication_role = origin;

  v_result := public.write_youtube_saved_recipe_result(
    v_binding.owner_uuid,v_binding.auth_identity_created_at_snapshot,
    v_binding.session_key_hash,v_binding.hmac_key_version,v_binding.session_issued_at,
    'create',null,v_extraction_id,null,v_content,v_key,clock_timestamp()
  );
  v_draft_id := (v_result #>> '{data,draft_id}')::uuid;
  if v_draft_id is null then raise exception 'canonical authority create failed'; end if;

  update public.user_session_generation_bindings
  set revoked_at=clock_timestamp(), binding_state='revoked'
  where session_key_hash=v_binding.session_key_hash;

  begin
    perform public.read_youtube_saved_recipe_results(
      v_binding.owner_uuid,v_binding.auth_identity_created_at_snapshot,
      v_binding.session_key_hash,v_binding.hmac_key_version,v_binding.session_issued_at,
      v_draft_id
    );
    raise exception 'revoked canonical session unexpectedly retained access';
  exception when object_not_in_prerequisite_state then
    if position('ACCOUNT_SESSION_STALE' in sqlerrm)=0 then raise; end if;
  end;
end;
$$;

-- The new exact RPC paths are accepted only under the existing scoped service
-- transport. Other paths/scopes still delegate to the previous verifier chain.
select set_config('request.headers','{"x-homecook-internal-scope":"recipe-future-propagation"}',true);
select set_config('request.method','POST',true);
select set_config('request.path','/rpc/read_youtube_saved_recipe_results',true);
select private.verify_full_local_internal_scope();
select set_config('request.path','/rpc/ensure_youtube_saved_recipe_result',true);
select private.verify_full_local_internal_scope();

do $$
begin
  perform set_config('request.path','/rpc/not_allowed_saved_result',true);
  begin
    perform private.verify_full_local_internal_scope();
    raise exception 'unknown scoped RPC path unexpectedly accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
  perform set_config('request.path','/rpc/read_youtube_saved_recipe_results',true);
  perform set_config('request.method','GET',true);
  begin
    perform private.verify_full_local_internal_scope();
    raise exception 'wrong scoped RPC method unexpectedly accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
  if has_function_privilege('anon','public.read_youtube_saved_recipe_results(uuid,timestamptz,text,integer,timestamptz,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.read_youtube_saved_recipe_results(uuid,timestamptz,text,integer,timestamptz,uuid)','EXECUTE')
    or not has_function_privilege('service_role','public.read_youtube_saved_recipe_results(uuid,timestamptz,text,integer,timestamptz,uuid)','EXECUTE') then
    raise exception 'saved-result RPC ACL mismatch';
  end if;
  if has_function_privilege('anon','public.ensure_youtube_saved_recipe_result(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,timestamptz)','EXECUTE')
    or has_function_privilege('authenticated','public.ensure_youtube_saved_recipe_result(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,timestamptz)','EXECUTE')
    or not has_function_privilege('service_role','public.ensure_youtube_saved_recipe_result(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,timestamptz)','EXECUTE') then
    raise exception 'ensure RPC ACL mismatch';
  end if;
end;
$$;

select jsonb_build_object(
  'status','PASS',
  'checks',array[
    'canonical_session_authority','canonical_session_revocation',
    'exact_scoped_rpc_path','unknown_scoped_rpc_rejected',
    'wrong_method_rejected','rpc_role_acl'
  ]
);

rollback;
