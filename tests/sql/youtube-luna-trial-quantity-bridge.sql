\set ON_ERROR_STOP on

-- Required harness inputs: a real processing job owned by the current worker
-- role/claims, with a live job lease and extractor permit. The harness must set:
-- job_id, worker_id, lease_generation, permit_generation, youtube_video_id.
-- This test never stubs or replaces worker authority/fence functions.
\if :{?job_id}
\else
  \quit 3
\endif

begin;

-- Transaction-local ambiguity fixture. These identities exist only for this
-- rolled-back isolated test and are not assertions about the real catalog.
set local session_replication_role = replica;
insert into public.ingredients(id, standard_name, category, default_unit) values
  ('64000000-0000-4000-8000-000000000001', '저장 링크 후보 A', '테스트', null),
  ('64000000-0000-4000-8000-000000000002', '저장 링크 후보 B', '테스트', null);
insert into public.ingredient_synonyms(id, ingredient_id, synonym) values
  ('64000000-0000-4000-8000-000000000011', '64000000-0000-4000-8000-000000000001', '저장 링크 모호'),
  ('64000000-0000-4000-8000-000000000012', '64000000-0000-4000-8000-000000000002', '저장 링크 모호');
set local session_replication_role = origin;

create temporary table youtube_trial_quantity_bridge_catalog_count on commit drop as
select count(*)::bigint as ingredient_count from public.ingredients;

select set_config('homecook.test.youtube_job_id', :'job_id', true);
select set_config('homecook.test.youtube_worker_id', :'worker_id', true);
select set_config('homecook.test.youtube_lease_generation', :'lease_generation', true);
select set_config('homecook.test.youtube_permit_generation', :'permit_generation', true);
select set_config('homecook.test.youtube_video_id', :'youtube_video_id', true);

set local role youtube_extraction_worker;
create temporary table youtube_trial_quantity_bridge_result on commit drop as
select public.resolve_youtube_extraction_job_draft(
  :'job_id'::uuid,
  :'worker_id',
  :'lease_generation'::bigint,
  :'permit_generation'::bigint,
  :'youtube_video_id',
  jsonb_build_object(
    'identity', jsonb_build_object('provider','codex-vision-keyframes','model','gpt-5.6-luna'),
    'recipe', jsonb_build_object(
      'title','수량 브리지 격리 검증',
      'ingredients', jsonb_build_array(
        jsonb_build_object(
          'name','두부','originalName','큰 사이즈 두부','alternativeNames',jsonb_build_array('부침용 두부'),
          'amount','1','unit','모','optional',false,'groupLabel',null,
          'quantityState','explicit','amountBasis','stated',
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','S1','source_method','description','source_provider','youtube',
            'line_index',4,'snippet','두부 1모','locator_hash','literal-owner'
          ))
        ),
        jsonb_build_object(
          'name','참기름','amount','1','unit','큰술','optional',false,'groupLabel',null,
          'quantityState','estimated','amountBasis','source-adjustable',
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','O2','source_method','visual','source_provider','macos-vision-ocr',
            'frame_ts_ms',1000,'snippet','참기름 1큰술 정도'
          ))
        ),
        jsonb_build_object(
          'name','소금','amount',null,'unit',null,'optional',false,'groupLabel',null,
          'quantityState','unknown','amountBasis',null,
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','S3','source_method','caption','source_provider','youtube','snippet','소금'
          ))
        ),
        jsonb_build_object(
          'name','마늘','amount',null,'unit',null,'optional',false,'groupLabel',null,
          'quantityState','conflicting','amountBasis',null,
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','S4','source_method','description','source_provider','youtube','snippet','마늘 1~2쪽'
          ))
        ),
        jsonb_build_object(
          'name','후추','amount',null,'unit',null,'optional',false,'groupLabel',null,
          'quantityState','to_taste','amountBasis',null,
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','S5','source_method','caption','source_provider','youtube','snippet','후추 약간'
          ))
        ),
        jsonb_build_object(
          'name','레거시 물','amount','300','unit','ml','optional',false,'groupLabel',null
        ),
        jsonb_build_object(
          'name','OCR 소금','amount',null,'unit',null,'optional',false,'groupLabel',null,
          'quantityState','to_taste','amountBasis',null,
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','O6','source_method','visual','source_provider','macos-vision-ocr',
            'frame_ts_ms',2000,'snippet','소금 약간'
          ))
        ),
        jsonb_build_object(
          'name','OCR 물','amount','300','unit','ml','optional',false,'groupLabel',null,
          'quantityState','explicit','amountBasis','onscreen',
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','O7','source_method','visual','source_provider','macos-vision-ocr',
            'frame_ts_ms',3000,'snippet','물 300ml'
          ))
        ),
        jsonb_build_object(
          'name','스파게티','originalName','Spaghetti','amount','250','unit','g',
          'optional',false,'groupLabel',null,'quantityState','explicit','amountBasis','stated',
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','S8','source_method','description','source_provider','youtube',
            'snippet','Spaghetti 250g'
          ))
        ),
        jsonb_build_object(
          'name','스파게티','originalName','Spaghetti sauce','amount','250','unit','g',
          'optional',false,'groupLabel',null,'quantityState','explicit','amountBasis','stated',
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','S9','source_method','description','source_provider','youtube',
            'snippet','Spaghetti sauce 250g'
          ))
        ),
        jsonb_build_object(
          'name','스파게티','originalName','Spaghetti squash','amount','250','unit','g',
          'optional',false,'groupLabel',null,'quantityState','explicit','amountBasis','stated',
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','S10','source_method','description','source_provider','youtube',
            'snippet','Spaghetti squash 250g'
          ))
        ),
        jsonb_build_object(
          'name','스파게티','originalName','Barilla Spaghetti','amount','250','unit','g',
          'optional',false,'groupLabel',null,'quantityState','explicit','amountBasis','stated',
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','S11','source_method','description','source_provider','youtube',
            'snippet','Barilla Spaghetti 250g'
          ))
        ),
        jsonb_build_object(
          'name','스파게티','originalName','Cooked Spaghetti','amount','250','unit','g',
          'optional',false,'groupLabel',null,'quantityState','explicit','amountBasis','stated',
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','S12','source_method','description','source_provider','youtube',
            'snippet','Cooked Spaghetti 250g'
          ))
        ),
        jsonb_build_object(
          'name','저장 링크 모호','amount','1','unit','큰술','optional',false,'groupLabel',null,
          'quantityState','explicit','amountBasis','stated',
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','S13','source_method','description','source_provider','youtube',
            'snippet','저장 링크 모호 1큰술'
          ))
        ),
        jsonb_build_object(
          'name','스파게티','originalName','Spaghetti','amount','100','unit','g',
          'optional',false,'groupLabel',null,'quantityState','explicit','amountBasis','stated',
          'evidenceRefs',jsonb_build_array(jsonb_build_object(
            'evidence_id','S14','source_method','description','source_provider','youtube',
            'snippet','Spaghetti 100g'
          ))
        )
      ),
      'steps', jsonb_build_array('잘 섞는다.')
    ),
    'meta', jsonb_build_object('sourceAvailability',jsonb_build_object(
      'description',true,'authorComment',false,'transcript',true,'onscreen',false
    ))
  )
) as resolved;
reset role;

do $verify$
declare
  v_draft jsonb := (select resolved -> 'draft' from youtube_trial_quantity_bridge_result);
  v_content jsonb;
  v_pasta uuid;
begin
  select id into strict v_pasta from public.ingredients where standard_name = '파스타면';
  if v_draft #>> '{ingredients,0,ingredient_type}' <> 'QUANT'
    or v_draft #>> '{ingredients,0,amount}' <> '1'
    or v_draft #>> '{ingredients,0,unit}' <> '모'
    or v_draft #>> '{ingredients,0,quantity_source}' <> 'text_explicit'
    or (v_draft #>> '{ingredients,0,quantity_review_required}')::boolean
    or v_draft #>> '{ingredients,0,original_name}' <> '큰 사이즈 두부'
    or v_draft #>> '{ingredients,0,alternative_names,0}' <> '부침용 두부'
    or v_draft #>> '{ingredients,0,quantity_evidence_refs,0,evidence_id}' <> 'S1' then
    raise exception 'verified explicit quantity bridge failed';
  end if;

  if v_draft #>> '{ingredients,1,ingredient_type}' <> 'QUANT'
    or v_draft #>> '{ingredients,1,amount}' <> '1'
    or v_draft #>> '{ingredients,1,unit}' <> '큰술'
    or v_draft #>> '{ingredients,1,quantity_source}' <> 'recipe_inferred'
    or not (v_draft #>> '{ingredients,1,quantity_review_required}')::boolean
    or v_draft #>> '{ingredients,1,display_text}' <> '참기름 약 1큰술' then
    raise exception 'estimated quantity bridge failed';
  end if;

  if exists (
    select 1 from (values (2),(3)) row(index)
    where v_draft #>> array['ingredients',row.index::text,'ingredient_type'] <> 'QUANT'
      or v_draft #> array['ingredients',row.index::text,'amount'] <> 'null'::jsonb
      or v_draft #> array['ingredients',row.index::text,'unit'] <> 'null'::jsonb
      or v_draft #>> array['ingredients',row.index::text,'quantity_source'] <> 'unknown'
      or not (v_draft #>> array['ingredients',row.index::text,'quantity_review_required'])::boolean
  ) then
    raise exception 'unknown/conflicting quantity safety failed';
  end if;

  if v_draft #>> '{ingredients,4,ingredient_type}' <> 'TO_TASTE'
    or v_draft #>> '{ingredients,4,quantity_source}' <> 'text_explicit'
    or (v_draft #>> '{ingredients,4,quantity_review_required}')::boolean then
    raise exception 'verified to-taste bridge failed';
  end if;

  if v_draft #>> '{ingredients,5,ingredient_type}' <> 'QUANT'
    or v_draft #>> '{ingredients,5,amount}' <> '300'
    or v_draft #>> '{ingredients,5,unit}' <> 'ml'
    or v_draft #>> '{ingredients,5,quantity_source}' <> 'unknown' then
    raise exception 'legacy quantity compatibility failed';
  end if;

  if v_draft #>> '{ingredients,6,ingredient_type}' <> 'TO_TASTE'
    or v_draft #>> '{ingredients,6,quantity_source}' <> 'text_explicit'
    or (v_draft #>> '{ingredients,6,quantity_review_required}')::boolean then
    raise exception 'OCR text to-taste bridge failed';
  end if;

  if v_draft #>> '{ingredients,7,ingredient_type}' <> 'QUANT'
    or v_draft #>> '{ingredients,7,amount}' <> '300'
    or v_draft #>> '{ingredients,7,unit}' <> 'ml'
    or v_draft #>> '{ingredients,7,quantity_source}' <> 'text_explicit'
    or (v_draft #>> '{ingredients,7,quantity_review_required}')::boolean then
    raise exception 'OCR text explicit bridge failed';
  end if;

  if v_draft #>> '{ingredients,8,ingredient_id}' <> v_pasta::text
    or v_draft #>> '{ingredients,8,standard_name}' <> '파스타면'
    or v_draft #>> '{ingredients,8,resolution_status}' <> 'resolved'
    or v_draft #>> '{ingredients,8,original_name}' <> 'Spaghetti'
    or v_draft #>> '{ingredients,8,amount}' <> '250'
    or v_draft #>> '{ingredients,8,unit}' <> 'g' then
    raise exception 'occurrence-bound spaghetti resolution failed';
  end if;

  if exists (
    select 1 from (values
      (9, 'Spaghetti sauce'),
      (10, 'Spaghetti squash'),
      (11, 'Barilla Spaghetti'),
      (12, 'Cooked Spaghetti')
    ) control(index, original_name)
    where v_draft #>> array['ingredients',control.index::text,'ingredient_id'] <> ''
      or v_draft #>> array['ingredients',control.index::text,'standard_name'] <> '스파게티'
      or v_draft #>> array['ingredients',control.index::text,'resolution_status'] <> 'unresolved'
      or v_draft #>> array['ingredients',control.index::text,'original_name'] <> control.original_name
      or v_draft #>> array['ingredients',control.index::text,'amount'] <> '250'
      or v_draft #>> array['ingredients',control.index::text,'unit'] <> 'g'
      or v_draft #> array['ingredients',control.index::text,'candidates'] <> '[]'::jsonb
  ) then
    raise exception 'identity-bearing spaghetti original was linked or mutated';
  end if;

  if v_draft #>> '{ingredients,13,resolution_status}' <> 'needs_review'
    or v_draft #>> '{ingredients,13,ingredient_id}' <> ''
    or jsonb_array_length(v_draft #> '{ingredients,13,candidates}') <> 2 then
    raise exception 'transaction-local ambiguous source ingredient was not preserved for review';
  end if;

  if (select count(*) from public.ingredients)
    <> (select ingredient_count from youtube_trial_quantity_bridge_catalog_count) then
    raise exception 'quantity bridge unexpectedly mutated public ingredient catalog';
  end if;

  v_content := private.build_youtube_saved_recipe_content_from_source(v_draft);
  if v_content #>> '{ingredients,1,quantity_mode}' <> 'unknown'
    or v_content #>> '{ingredients,1,amount}' <> '1'
    or v_content #>> '{ingredients,1,unit}' <> '큰술'
    or v_content #>> '{ingredients,1,display_text}' <> '참기름 약 1큰술'
    or v_content #>> '{ingredients,2,quantity_mode}' <> 'unknown'
    or v_content #> '{ingredients,2,amount}' <> 'null'::jsonb
    or v_content #>> '{ingredients,3,quantity_mode}' <> 'unknown'
    or v_content #>> '{ingredients,4,quantity_mode}' <> 'to_taste'
    or v_content #>> '{ingredients,6,quantity_mode}' <> 'to_taste' then
    raise exception 'saved-result source projection did not preserve quantity trust state';
  end if;
end;
$verify$;

-- Carry the real cached resolver output through the durable saved-result
-- boundary. The transaction-local source row represents the normal async
-- finalizer handoff without consuming the worker lease needed by the invalid
-- resolver calls below. Resolver authority/body and saved RPC bodies stay real.
set local session_replication_role = replica;
insert into public.youtube_extraction_sessions(
  id,user_id,youtube_url,youtube_video_id,classification_status,draft_json,
  extraction_meta_json,expires_at,status,created_at,updated_at
)
select
  '65000000-0000-4000-8000-000000000001',job.user_id,
  'https://www.youtube.com/watch?v=' || :'youtube_video_id',:'youtube_video_id',
  'recipe',resolved -> 'draft','{"fixture":"real-cached-resolver-output"}'::jsonb,
  now()+interval '1 hour','draft',now(),now()
from youtube_trial_quantity_bridge_result
cross join public.youtube_extraction_jobs job
where job.id = :'job_id'::uuid;
set local session_replication_role = origin;

do $prepare_legacy_source$
declare
  v_extraction_id uuid := '65000000-0000-4000-8000-000000000001';
begin
  -- Simulate an archived unchanged source-bound row that was stored as
  -- unresolved before the hardened occurrence lookup. The projector may
  -- recover it only from its own original_name + amount + unit occurrence.
  update public.youtube_extraction_sessions
  set draft_json = jsonb_set(
    jsonb_set(draft_json, '{ingredients,14,resolution_status}', '"unresolved"'::jsonb, false),
    '{ingredients,14,ingredient_id}',
    '""'::jsonb,
    false
  )
  where id = v_extraction_id;
end;
$prepare_legacy_source$;

create or replace function public.assert_recipe_future_session_authority(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz
)
returns jsonb
language plpgsql
as $function$
begin
  return jsonb_build_object('account_generation', 1);
end;
$function$;

do $saved_link_flow$
declare
  v_owner_id uuid := (
    select user_id from public.youtube_extraction_jobs
    where id = current_setting('homecook.test.youtube_job_id')::uuid
  );
  v_extraction_id uuid := '65000000-0000-4000-8000-000000000001';
  v_pasta_id uuid;
  v_result_id uuid;
  v_resolved_row_id text;
  v_ambiguous_row_id text;
  v_unresolved_row_id text;
  v_legacy_row_id text;
  v_ensure jsonb;
  v_read jsonb;
  v_write jsonb;
  v_content jsonb;
  v_hash_before text;
  v_hash_after text;
  v_source_before jsonb;
  v_source_after jsonb;
  v_revision_before bigint;
  v_revision_after bigint;
begin
  select id into strict v_pasta_id
  from public.ingredients where standard_name = '파스타면';

  v_ensure := public.ensure_youtube_saved_recipe_result(
    v_owner_id, now(), 'saved-link-fixture', 1, now(), v_extraction_id,
    '63000000-0000-4000-8000-000000000001', now()
  );
  v_result_id := (v_ensure #>> '{data,draft_id}')::uuid;
  v_resolved_row_id := v_ensure #>> '{data,content,ingredients,8,row_id}';
  v_unresolved_row_id := v_ensure #>> '{data,content,ingredients,9,row_id}';
  v_ambiguous_row_id := v_ensure #>> '{data,content,ingredients,13,row_id}';
  v_legacy_row_id := v_ensure #>> '{data,content,ingredients,14,row_id}';

  if v_result_id is null
    or v_ensure #>> array['data','ingredient_links',v_resolved_row_id,'ingredient_id']
      <> v_pasta_id::text
    or v_ensure #>> array['data','ingredient_links',v_resolved_row_id,'resolution_status']
      <> 'resolved'
    or v_ensure #>> array['data','ingredient_links',v_ambiguous_row_id,'resolution_status']
      <> 'needs_review'
    or (v_ensure #> array['data','ingredient_links',v_ambiguous_row_id,'ingredient_id'])
      <> 'null'::jsonb
    or jsonb_array_length(v_ensure #> array['data','ingredient_links',v_ambiguous_row_id,'candidates'])
      <> 2
    or v_ensure #>> array['data','ingredient_links',v_unresolved_row_id,'resolution_status']
      <> 'unresolved'
    or v_ensure #>> array['data','ingredient_links',v_legacy_row_id,'ingredient_id']
      <> v_pasta_id::text
    or v_ensure #>> '{data,content,ingredients,8,standard_name}' <> '파스타면'
    or v_ensure #>> '{data,content,ingredients,8,amount}' <> '250'
    or v_ensure #>> '{data,content,ingredients,8,unit}' <> 'g'
    or v_ensure #>> '{data,content,ingredients,13,standard_name}' <> '저장 링크 모호'
    or v_ensure #>> '{data,content,ingredients,13,amount}' <> '1'
    or v_ensure #>> '{data,content,ingredients,13,unit}' <> '큰술' then
    raise exception 'ensure did not project source-bound saved ingredient links safely';
  end if;

  select editable_content_hash, source_snapshot_json, revision
    into v_hash_before, v_source_before, v_revision_before
  from public.youtube_saved_recipe_results where id = v_result_id;
  v_read := public.read_youtube_saved_recipe_results(
    v_owner_id, now(), 'saved-link-fixture', 1, now(), v_result_id
  );
  select editable_content_hash, source_snapshot_json, revision
    into v_hash_after, v_source_after, v_revision_after
  from public.youtube_saved_recipe_results where id = v_result_id;
  if v_read -> 'data' -> 'ingredient_links'
      is distinct from v_ensure -> 'data' -> 'ingredient_links'
    or v_hash_after is distinct from v_hash_before
    or v_source_after is distinct from v_source_before
    or v_revision_after is distinct from v_revision_before then
    raise exception 'read-only saved link projection mutated durable saved content';
  end if;

  -- Preserve a mismatched source pointer to exercise the server-side fail
  -- closed path independently from the UI, which detaches it before writing.
  v_content := jsonb_set(
    v_read #> '{data,content}',
    '{ingredients,8,standard_name}',
    to_jsonb('사용자 파스타'::text),
    false
  );
  v_write := public.write_youtube_saved_recipe_result(
    v_owner_id, now(), 'saved-link-fixture', 1, now(), 'update',
    v_result_id, null, 1, v_content,
    '63000000-0000-4000-8000-000000000002', now()
  );
  if v_write #>> array['data','ingredient_links',v_resolved_row_id,'resolution_status']
      <> 'unresolved'
    or v_write #> array['data','ingredient_links',v_resolved_row_id,'ingredient_id']
      <> 'null'::jsonb then
    raise exception 'source/current name mismatch restored the old source link';
  end if;

  -- Match the UI write: a renamed row severs its source pointer. Reopening
  -- must remain unresolved and must keep its own amount/unit verbatim.
  v_content := jsonb_set(
    v_write #> '{data,content}',
    '{ingredients,8,source_draft_ingredient_id}',
    'null'::jsonb,
    false
  );
  perform public.write_youtube_saved_recipe_result(
    v_owner_id, now(), 'saved-link-fixture', 1, now(), 'update',
    v_result_id, null, 2, v_content,
    '63000000-0000-4000-8000-000000000003', now()
  );
  v_read := public.read_youtube_saved_recipe_results(
    v_owner_id, now(), 'saved-link-fixture', 1, now(), v_result_id
  );
  if v_read #>> array['data','ingredient_links',v_resolved_row_id,'resolution_status']
      <> 'unresolved'
    or v_read #> array['data','ingredient_links',v_resolved_row_id,'ingredient_id']
      <> 'null'::jsonb
    or v_read #> '{data,content,ingredients,8,source_draft_ingredient_id}'
      <> 'null'::jsonb
    or v_read #>> '{data,content,ingredients,8,standard_name}' <> '사용자 파스타'
    or v_read #>> '{data,content,ingredients,8,amount}' <> '250'
    or v_read #>> '{data,content,ingredients,8,unit}' <> 'g'
    or (select source_snapshot_json from public.youtube_saved_recipe_results where id = v_result_id)
      is distinct from v_source_before then
    raise exception 'renamed saved row restored an old link or changed source quantity context';
  end if;
end;
$saved_link_flow$;

set local role youtube_extraction_worker;
do $invalid_metadata$
declare
  v_invalid jsonb;
begin
  begin
    perform public.resolve_youtube_extraction_job_draft(
      current_setting('homecook.test.youtube_job_id')::uuid,
      current_setting('homecook.test.youtube_worker_id'),
      current_setting('homecook.test.youtube_lease_generation')::bigint,
      current_setting('homecook.test.youtube_permit_generation')::bigint,
      current_setting('homecook.test.youtube_video_id'),
      '{"identity":{},"recipe":{"title":"invalid explicit","ingredients":[{"name":"오일","amount":"1","unit":"큰술","optional":false,"groupLabel":null,"quantityState":"explicit","evidenceRefs":[]}],"steps":[]}}'::jsonb
    );
    raise exception 'explicit quantity without evidence unexpectedly accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.resolve_youtube_extraction_job_draft(
      current_setting('homecook.test.youtube_job_id')::uuid,
      current_setting('homecook.test.youtube_worker_id'),
      current_setting('homecook.test.youtube_lease_generation')::bigint,
      current_setting('homecook.test.youtube_permit_generation')::bigint,
      current_setting('homecook.test.youtube_video_id'),
      '{"identity":{},"recipe":{"title":"invalid taste","ingredients":[{"name":"소금","amount":null,"unit":null,"optional":false,"groupLabel":null,"quantityState":"to_taste","evidenceRefs":[{"source_method":"visual","source_provider":"frame","snippet":"영상 장면"}]}],"steps":[]}}'::jsonb
    );
    raise exception 'visual-only to-taste unexpectedly accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  for v_invalid in select value from jsonb_array_elements(jsonb_build_array(
    '{"identity":{},"recipe":{"title":"partial metadata","ingredients":[{"name":"두부","originalName":"큰 두부","amount":"1","unit":"모","optional":false,"groupLabel":null}],"steps":[]}}'::jsonb,
    '{"identity":{},"recipe":{"title":"explicit wrong basis","ingredients":[{"name":"두부","amount":"1","unit":"모","optional":false,"groupLabel":null,"quantityState":"explicit","amountBasis":"visual-estimate","evidenceRefs":[{"source_method":"description","source_provider":"youtube","snippet":"두부 1모"}]}],"steps":[]}}'::jsonb,
    '{"identity":{},"recipe":{"title":"estimated wrong basis","ingredients":[{"name":"두부","amount":"1","unit":"모","optional":false,"groupLabel":null,"quantityState":"estimated","amountBasis":"stated","evidenceRefs":[{"source_method":"description","source_provider":"youtube","snippet":"두부 1모 정도"}]}],"steps":[]}}'::jsonb,
    '{"identity":{},"recipe":{"title":"unknown wrong basis","ingredients":[{"name":"두부","amount":null,"unit":null,"optional":false,"groupLabel":null,"quantityState":"unknown","amountBasis":"stated","evidenceRefs":[{"source_method":"description","source_provider":"youtube","snippet":"두부"}]}],"steps":[]}}'::jsonb,
    '{"identity":{},"recipe":{"title":"onscreen frame is not OCR","ingredients":[{"name":"물","amount":"300","unit":"ml","optional":false,"groupLabel":null,"quantityState":"explicit","amountBasis":"onscreen","evidenceRefs":[{"source_method":"visual","source_provider":"codex-vision-keyframes","snippet":"영상 장면"}]}],"steps":[]}}'::jsonb
  )) loop
    begin
      perform public.resolve_youtube_extraction_job_draft(
        current_setting('homecook.test.youtube_job_id')::uuid,
        current_setting('homecook.test.youtube_worker_id'),
        current_setting('homecook.test.youtube_lease_generation')::bigint,
        current_setting('homecook.test.youtube_permit_generation')::bigint,
        current_setting('homecook.test.youtube_video_id'),
        v_invalid
      );
      raise exception 'inconsistent quantity metadata unexpectedly accepted';
    exception when invalid_parameter_value then
      if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
    end;
  end loop;
end;
$invalid_metadata$;
reset role;

select jsonb_build_object(
  'status','PASS',
  'checks',jsonb_build_array(
    'real_resolver_worker_fence','explicit_source_quantity','estimated_review_required',
    'unknown_conflicting_quant_null','verified_to_taste_only','legacy_compatibility',
    'original_name_alternatives_evidence_preserved','invalid_metadata_rejected',
    'saved_result_source_projection_preserves_trust','no_public_catalog_mutation',
    'spaghetti_exact_original_mass_resolved','spaghetti_identity_modifiers_unresolved'
  )
);

rollback;
