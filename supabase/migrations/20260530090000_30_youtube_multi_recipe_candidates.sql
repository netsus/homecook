alter table public.youtube_extraction_sessions
  add column if not exists session_kind varchar(20) not null default 'single',
  add column if not exists parent_extraction_session_id uuid
    references public.youtube_extraction_sessions(id) on delete cascade,
  add column if not exists parent_candidate_id text;

alter table public.youtube_extraction_sessions
  drop constraint if exists youtube_extraction_sessions_session_kind_check;

alter table public.youtube_extraction_sessions
  add constraint youtube_extraction_sessions_session_kind_check
    check (session_kind in ('single', 'multi_parent', 'candidate_child'));

create index if not exists youtube_extraction_sessions_parent_idx
  on public.youtube_extraction_sessions (parent_extraction_session_id, parent_candidate_id)
  where parent_extraction_session_id is not null;

create unique index if not exists youtube_extraction_sessions_candidate_child_uidx
  on public.youtube_extraction_sessions (user_id, parent_extraction_session_id, parent_candidate_id)
  where session_kind = 'candidate_child';

create table if not exists public.youtube_extraction_candidates (
  id uuid primary key default gen_random_uuid(),
  extraction_session_id uuid not null
    references public.youtube_extraction_sessions(id) on delete cascade,
  candidate_id text not null,
  status varchar(20) not null default 'draft',
  child_extraction_session_id uuid
    references public.youtube_extraction_sessions(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  title text not null,
  start_ms integer,
  end_ms integer,
  confidence numeric,
  draft_ingredient_ids_json jsonb not null default '[]'::jsonb,
  source_meta_json jsonb not null default '{}'::jsonb,
  promoted_at timestamptz,
  registered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint youtube_extraction_candidates_status_check
    check (status in ('draft', 'promoted', 'registered', 'skipped', 'expired')),
  constraint youtube_extraction_candidates_candidate_id_check
    check (candidate_id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  constraint youtube_extraction_candidates_time_check
    check (
      (start_ms is null or start_ms >= 0)
      and (end_ms is null or end_ms >= 0)
      and (start_ms is null or end_ms is null or end_ms >= start_ms)
    ),
  constraint youtube_extraction_candidates_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint youtube_extraction_candidates_unique
    unique (extraction_session_id, candidate_id)
);

create index if not exists youtube_extraction_candidates_session_idx
  on public.youtube_extraction_candidates (extraction_session_id);

create index if not exists youtube_extraction_candidates_child_idx
  on public.youtube_extraction_candidates (child_extraction_session_id)
  where child_extraction_session_id is not null;

alter table public.youtube_extraction_candidates enable row level security;

drop policy if exists youtube_extraction_candidates_select_own
  on public.youtube_extraction_candidates;

create policy youtube_extraction_candidates_select_own
  on public.youtube_extraction_candidates
  for select
  using (
    exists (
      select 1
        from public.youtube_extraction_sessions s
        where s.id = youtube_extraction_candidates.extraction_session_id
          and s.user_id = auth.uid()
    )
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

  insert into public.recipes (
    title,
    base_servings,
    source_type,
    created_by
  ) values (
    p_title,
    p_base_servings,
    'youtube',
    p_user_id
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
