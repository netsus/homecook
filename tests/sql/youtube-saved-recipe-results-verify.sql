begin;

-- The isolated fixture replaces only the existing session-authority verifier;
-- the production migration still calls the canonical verifier by exact name.
create or replace function public.assert_recipe_future_session_authority(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz
)
returns jsonb language plpgsql as $$
begin
  if p_session_key_hash = 'stale' then
    raise exception 'ACCOUNT_SESSION_STALE' using errcode='55000';
  end if;
  return jsonb_build_object('account_generation',1);
end;
$$;

set local session_replication_role = replica;

insert into public.users(id,nickname,social_provider,social_id) values
('10000000-0000-4000-8000-000000000001','owner-a','google','owner-a'),
('10000000-0000-4000-8000-000000000002','owner-b','google','owner-b');

insert into public.youtube_extraction_sessions(
  id,user_id,youtube_url,youtube_video_id,classification_status,draft_json,
  extraction_meta_json,expires_at,status,created_at,updated_at
) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 'https://www.youtube.com/watch?v=abcdefghijk','abcdefghijk','recipe',
 '{"title":"서버 원본","base_servings":2,"tags":["원본"],"ingredients":[{"draft_ingredient_id":"30000000-0000-4000-8000-000000000001","standard_name":"알 수 없는 소스","amount":null,"unit":null,"resolution_status":"unresolved","quantity_source":"unknown","quantity_evidence_refs":[{"snippet":"원본 근거"}]}],"steps":[{"instruction":"섞는다","cooking_method":null}]}'::jsonb,
 '{"trusted":"server-only"}'::jsonb,now()+interval '1 hour','draft',now(),now()),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
 'https://www.youtube.com/watch?v=lmnopqrstuv','lmnopqrstuv','recipe',
 '{"title":"만료 원본","base_servings":1,"tags":[],"ingredients":[],"steps":[]}'::jsonb,'{}'::jsonb,now()-interval '1 hour','draft',now()-interval '2 hours',now()-interval '2 hours'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
 'https://www.youtube.com/watch?v=sourceonly01','sourceonly01','recipe',
 '{"title":"자동 보관 원본","base_servings":3,"tags":["자동"],"ingredients":[{"draft_ingredient_id":"30000000-0000-4000-8000-000000000003","standard_name":"검토할 소스","amount":2,"unit":"큰술","display_text":"약 2큰술","ingredient_type":"QUANT","quantity_source":"recipe_inferred","quantity_review_required":true,"quantity_user_confirmed":false},{"draft_ingredient_id":"legacy-row","standard_name":"확인했지만 빈 정량","amount":null,"unit":null,"ingredient_type":"QUANT","quantity_source":"user_entered","quantity_review_required":false,"quantity_user_confirmed":true},{"draft_ingredient_id":"30000000-0000-4000-8000-000000000004","standard_name":"명시적 소금","amount":null,"unit":null,"ingredient_type":"TO_TASTE","quantity_source":"text_explicit","quantity_review_required":false,"quantity_user_confirmed":false},{"draft_ingredient_id":"30000000-0000-4000-8000-000000000005","standard_name":"옛 불명확 소금","amount":null,"unit":null,"ingredient_type":"TO_TASTE","quantity_source":"unknown","quantity_review_required":false,"quantity_user_confirmed":false}],"steps":[{"instruction":"잘 섞는다","duration_text":null}]}'::jsonb,
 '{"trusted":"source-only"}'::jsonb,now()+interval '1 hour','draft',now(),now());

set local session_replication_role = origin;

do $$
declare
  v_content jsonb := '{
    "title":"원본 미완성 레시피","base_servings":2,"tags":[],
    "ingredients":[
      {"row_id":"40000000-0000-4000-8000-000000000001","source_draft_ingredient_id":"30000000-0000-4000-8000-000000000001","standard_name":"알 수 없는 소스","quantity_mode":"unknown","amount":2,"unit":null,"display_text":"약 2","component_label":null},
      {"row_id":"40000000-0000-4000-8000-000000000002","source_draft_ingredient_id":null,"standard_name":"소금","quantity_mode":"to_taste","amount":null,"unit":null,"display_text":"취향껏","component_label":null},
      {"row_id":"40000000-0000-4000-8000-000000000003","source_draft_ingredient_id":null,"standard_name":"물","quantity_mode":"quantity","amount":100,"unit":"ml","display_text":null,"component_label":null}
    ],
    "steps":[
      {"row_id":"50000000-0000-4000-8000-000000000001","source_step_index":0,"instruction":"섞는다","component_label":null,"duration_text":null},
      {"row_id":"50000000-0000-4000-8000-000000000002","source_step_index":null,"instruction":"사용자가 마무리한다","component_label":null,"duration_text":null}
    ]
  }'::jsonb;
  v_first jsonb;
  v_replay jsonb;
  v_updated jsonb;
  v_id uuid;
  v_recipe_count bigint;
  v_ingredient_count bigint;
  v_ensured jsonb;
  v_ensure_id uuid;
begin
  select count(*) into v_recipe_count from public.recipes;
  select count(*) into v_ingredient_count from public.ingredients;
  v_first := public.write_youtube_saved_recipe_result(
    '10000000-0000-4000-8000-000000000001',now(),'session-key',1,now(),
    'create',null,'20000000-0000-4000-8000-000000000001',null,v_content,
    '60000000-0000-4000-8000-000000000001',now()
  );
  v_id := (v_first #>> '{data,draft_id}')::uuid;
  if v_id is null
    or v_first #>> '{data,content,ingredients,0,quantity_mode}' <> 'unknown'
    or v_first #>> '{data,content,ingredients,0,amount}' <> '2'
    or v_first #>> '{data,content,ingredients,0,unit}' is not null
    or v_first #>> '{data,content,ingredients,1,quantity_mode}' <> 'to_taste'
    or v_first #>> '{data,content,ingredients,2,quantity_mode}' <> 'quantity' then
    raise exception 'quantity-mode preservation failed';
  end if;
  if (select source_snapshot_json #>> '{draft_json,ingredients,0,quantity_evidence_refs,0,snippet}'
      from public.youtube_saved_recipe_results where id=v_id) <> '원본 근거' then
    raise exception 'trusted raw/evidence snapshot was not preserved';
  end if;
  if (select count(*) from public.recipes) <> v_recipe_count
    or (select count(*) from public.ingredients) <> v_ingredient_count then
    raise exception 'private draft unexpectedly changed canonical catalogs';
  end if;

  v_replay := public.write_youtube_saved_recipe_result(
    '10000000-0000-4000-8000-000000000001',now(),'session-key',1,now(),
    'create',null,'20000000-0000-4000-8000-000000000001',null,v_content,
    '60000000-0000-4000-8000-000000000001',now()+interval '2 hours'
  );
  if v_replay #>> '{data,draft_id}' <> v_id::text then raise exception 'durable replay failed'; end if;

  v_updated := public.write_youtube_saved_recipe_result(
    '10000000-0000-4000-8000-000000000001',now(),'session-key',1,now(),
    'update',v_id,null,1,jsonb_set(v_content,'{title}','"수정한 레시피"'),
    '60000000-0000-4000-8000-000000000002',now()
  );
  if (v_updated #>> '{data,revision}')::integer <> 2 then raise exception 'revision update failed'; end if;

  v_ensured := public.ensure_youtube_saved_recipe_result(
    '10000000-0000-4000-8000-000000000001',now(),'session-key',1,now(),
    '20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000010',now()+interval '2 hours'
  );
  if v_ensured #>> '{data,draft_id}' <> v_id::text
    or (v_ensured #>> '{data,revision}')::integer <> 2
    or v_ensured #>> '{data,content,title}' <> '수정한 레시피' then
    raise exception 'ensure did not return latest durable edit after source expiry';
  end if;

  v_ensured := public.ensure_youtube_saved_recipe_result(
    '10000000-0000-4000-8000-000000000001',now(),'session-key',1,now(),
    '20000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000011',now()
  );
  v_ensure_id := (v_ensured #>> '{data,draft_id}')::uuid;
  if v_ensure_id is null
    or v_ensured #>> '{data,content,title}' <> '자동 보관 원본'
    or v_ensured #>> '{data,content,ingredients,0,row_id}' <> '30000000-0000-4000-8000-000000000003'
    or v_ensured #>> '{data,content,ingredients,0,quantity_mode}' <> 'unknown'
    or v_ensured #>> '{data,content,ingredients,0,amount}' <> '2'
    or v_ensured #>> '{data,content,ingredients,0,unit}' <> '큰술'
    or v_ensured #>> '{data,content,ingredients,1,quantity_mode}' <> 'unknown'
    or nullif(v_ensured #>> '{data,content,ingredients,1,row_id}','')::uuid is null then
    raise exception 'source-only ensure projection failed';
  end if;
  if v_ensured #>> '{data,content,ingredients,2,quantity_mode}' <> 'to_taste'
    or v_ensured #>> '{data,content,ingredients,3,quantity_mode}' <> 'unknown' then
    raise exception 'conservative to-taste derivation failed';
  end if;

  v_replay := public.write_youtube_saved_recipe_result(
    '10000000-0000-4000-8000-000000000001',now(),'session-key',1,now(),
    'create',null,'20000000-0000-4000-8000-000000000001',null,v_content,
    '60000000-0000-4000-8000-000000000001',now()+interval '2 hours'
  );
  if (v_replay #>> '{data,revision}')::integer <> 1
    or v_replay #>> '{data,content,title}' <> '원본 미완성 레시피' then
    raise exception 'create replay changed after saved-result patch';
  end if;

  begin
    perform public.write_youtube_saved_recipe_result(
      '10000000-0000-4000-8000-000000000001',now(),'session-key',1,now(),
      'update',v_id,null,1,v_content,'60000000-0000-4000-8000-000000000003',now()
    );
    raise exception 'stale revision unexpectedly accepted';
  exception when serialization_failure then null; end;

  begin
    perform public.read_youtube_saved_recipe_results(
      '10000000-0000-4000-8000-000000000002',now(),'session-key',1,now(),v_id
    );
    raise exception 'cross-owner read unexpectedly accepted';
  exception when no_data_found then null; end;

  begin
    perform public.write_youtube_saved_recipe_result(
      '10000000-0000-4000-8000-000000000001',now(),'session-key',1,now(),
      'create',null,'20000000-0000-4000-8000-000000000002',null,v_content,
      '60000000-0000-4000-8000-000000000004',now()
    );
    raise exception 'expired initial save unexpectedly accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'EXTRACTION_EXPIRED' then raise; end if;
  end;

  begin
    perform public.write_youtube_saved_recipe_result(
      '10000000-0000-4000-8000-000000000001',now(),'session-key',1,now(),
      'create',null,'20000000-0000-4000-8000-000000000001',null,
      jsonb_set(v_content,'{ingredients,0,quantity_evidence_refs}','[]'::jsonb),
      '60000000-0000-4000-8000-000000000005',now()
    );
    raise exception 'spoofed evidence unexpectedly accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.read_youtube_saved_recipe_results(
      '10000000-0000-4000-8000-000000000001',now(),'stale',1,now(),v_id
    );
    raise exception 'revoked authority unexpectedly accepted';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'ACCOUNT_SESSION_STALE' then raise; end if;
  end;
end;
$$;

select jsonb_build_object(
  'status','PASS',
  'checks',array[
    'owner_isolation','expired_initial','durable_replay','optimistic_revision',
    'quantity_modes_and_raw_preserved','spoofed_evidence_rejected',
    'source_only_ensure','ensure_latest_after_expiry','stable_server_row_ids',
    'confirmed_empty_quant_stays_unknown','explicit_to_taste_preserved','legacy_unknown_to_taste_stays_unknown',
    'stubbed_authority_boundary_only','no_catalog_or_recipe_insert'
  ]
);

rollback;
