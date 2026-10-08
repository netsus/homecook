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
begin
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
    'saved_result_source_projection_preserves_trust','no_public_catalog_mutation'
  )
);

rollback;
