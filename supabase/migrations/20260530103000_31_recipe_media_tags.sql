insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists recipe_images_public_read
  on storage.objects;

create policy recipe_images_public_read
  on storage.objects
  for select
  using (bucket_id = 'recipe-images');

drop policy if exists recipe_images_insert_own
  on storage.objects;

create policy recipe_images_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recipe_images_update_own
  on storage.objects;

create policy recipe_images_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recipe_images_delete_own
  on storage.objects;

create policy recipe_images_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.register_youtube_recipe_from_session(
  p_extraction_id uuid,
  p_user_id uuid,
  p_title text,
  p_base_servings integer,
  p_youtube_url text,
  p_youtube_video_id text,
  p_ingredients jsonb,
  p_steps jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.youtube_extraction_sessions%rowtype;
  v_recipe_id uuid;
  v_now timestamptz := now();
  v_item jsonb;
  v_tags text[] := '{}'::text[];
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    return jsonb_build_object(
      'error_code', 'EXTRACTION_NOT_FOUND',
      'message', '추출 세션을 찾을 수 없어요.'
    );
  end if;

  if p_base_servings < 1 then
    return jsonb_build_object(
      'error_code', 'VALIDATION_ERROR',
      'message', '기준 인분을 확인해주세요.'
    );
  end if;

  select *
    into v_session
    from public.youtube_extraction_sessions
    where id = p_extraction_id
    for update;

  if not found or v_session.user_id <> p_user_id then
    return jsonb_build_object(
      'error_code', 'EXTRACTION_NOT_FOUND',
      'message', '추출 세션을 찾을 수 없어요.'
    );
  end if;

  if v_session.status = 'expired' or v_session.expires_at <= v_now then
    update public.youtube_extraction_sessions
      set status = 'expired',
          updated_at = v_now
      where id = v_session.id
        and status <> 'expired';

    return jsonb_build_object(
      'error_code', 'EXTRACTION_EXPIRED',
      'message', '추출 세션이 만료됐어요. 다시 가져와 주세요.'
    );
  end if;

  if v_session.status = 'consumed' then
    return jsonb_build_object(
      'error_code', 'EXTRACTION_ALREADY_REGISTERED',
      'message', '이미 등록된 추출 결과예요.'
    );
  end if;

  if v_session.session_kind = 'multi_parent' then
    return jsonb_build_object(
      'error_code', 'CANDIDATE_PROMOTION_REQUIRED',
      'message', '저장할 요리를 먼저 선택해주세요.'
    );
  end if;

  if v_session.youtube_url <> p_youtube_url
    or v_session.youtube_video_id <> p_youtube_video_id then
    return jsonb_build_object(
      'error_code', 'EXTRACTION_MISMATCH',
      'message', '추출한 영상과 등록 요청이 일치하지 않아요.'
    );
  end if;

  if jsonb_typeof(v_session.draft_json -> 'tags') = 'array' then
    select coalesce(array_agg(tag order by ordinality), '{}'::text[])
      into v_tags
      from (
        select btrim(draft_tags.value) as tag,
               draft_tags.ordinality
          from jsonb_array_elements_text(v_session.draft_json -> 'tags')
            with ordinality as draft_tags(value, ordinality)
          where btrim(draft_tags.value) <> ''
          order by draft_tags.ordinality
          limit 6
      ) normalized_tags;
  end if;

  insert into public.recipes (
    title,
    base_servings,
    source_type,
    created_by,
    thumbnail_url,
    tags
  ) values (
    p_title,
    p_base_servings,
    'youtube',
    p_user_id,
    nullif(v_session.thumbnail_url, ''),
    v_tags
  )
  returning id into v_recipe_id;

  insert into public.recipe_sources (
    recipe_id,
    youtube_url,
    youtube_video_id,
    youtube_extraction_session_id,
    extraction_methods,
    extraction_meta_json,
    raw_extracted_text
  ) values (
    v_recipe_id,
    v_session.youtube_url,
    v_session.youtube_video_id,
    v_session.id,
    v_session.extraction_methods,
    v_session.extraction_meta_json || jsonb_build_object(
      'extraction_id', v_session.id,
      'provider_version', v_session.provider_version,
      'source_providers', v_session.source_providers,
      'classification_status', v_session.classification_status
    ),
    v_session.raw_source_text
  );

  for v_item in
    select value from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    insert into public.recipe_ingredients (
      recipe_id,
      ingredient_id,
      amount,
      unit,
      ingredient_type,
      display_text,
      component_label,
      scalable,
      sort_order
    ) values (
      v_recipe_id,
      (v_item ->> 'ingredient_id')::uuid,
      nullif(v_item ->> 'amount', '')::numeric,
      nullif(v_item ->> 'unit', ''),
      (v_item ->> 'ingredient_type')::public.recipe_ingredient_type,
      nullif(v_item ->> 'display_text', ''),
      nullif(btrim(v_item ->> 'component_label'), ''),
      coalesce((v_item ->> 'scalable')::boolean, true),
      coalesce((v_item ->> 'sort_order')::integer, 0)
    );
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    insert into public.recipe_steps (
      recipe_id,
      step_number,
      instruction,
      component_label,
      cooking_method_id,
      ingredients_used,
      heat_level,
      duration_seconds,
      duration_text
    ) values (
      v_recipe_id,
      (v_item ->> 'step_number')::integer,
      v_item ->> 'instruction',
      nullif(btrim(v_item ->> 'component_label'), ''),
      (v_item ->> 'cooking_method_id')::uuid,
      coalesce(v_item -> 'ingredients_used', '[]'::jsonb),
      nullif(v_item ->> 'heat_level', ''),
      nullif(v_item ->> 'duration_seconds', '')::integer,
      nullif(v_item ->> 'duration_text', '')
    );
  end loop;

  update public.youtube_extraction_sessions
    set status = 'consumed',
        recipe_id = v_recipe_id,
        consumed_at = v_now,
        updated_at = v_now
    where id = v_session.id;

  if v_session.session_kind = 'candidate_child'
    and v_session.parent_extraction_session_id is not null
    and v_session.parent_candidate_id is not null then
    update public.youtube_extraction_candidates
      set status = 'registered',
          recipe_id = v_recipe_id,
          registered_at = v_now,
          updated_at = v_now
      where extraction_session_id = v_session.parent_extraction_session_id
        and candidate_id = v_session.parent_candidate_id;
  end if;

  return jsonb_build_object(
    'recipe_id', v_recipe_id,
    'title', p_title
  );
end;
$$;

grant execute on function public.register_youtube_recipe_from_session(
  uuid,
  uuid,
  text,
  integer,
  text,
  text,
  jsonb,
  jsonb
) to authenticated, service_role;
