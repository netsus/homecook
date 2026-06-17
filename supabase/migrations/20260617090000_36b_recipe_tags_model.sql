create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  normalized_key text not null unique,
  label text not null,
  kind text not null default 'user'
    check (kind in ('semantic', 'source', 'user')),
  is_system boolean not null default false,
  theme_eligible boolean not null default false,
  usage_count integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_label_not_blank check (btrim(label) <> ''),
  constraint tags_usage_count_non_negative check (usage_count >= 0)
);

create index if not exists tags_theme_eligible_idx
  on public.tags (theme_eligible, usage_count desc, normalized_key)
  where is_system = true;

create table if not exists public.recipe_tags (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  source text not null default 'system_suggested'
    check (source in ('system_suggested', 'user_reviewed', 'provider', 'backfill', 'admin')),
  confidence numeric(4, 3) not null default 1
    check (confidence >= 0 and confidence <= 1),
  visibility text not null default 'public'
    check (visibility in ('public', 'public_pending', 'private')),
  review_status text not null default 'approved'
    check (review_status in ('approved', 'pending', 'rejected')),
  sort_order integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (recipe_id, tag_id)
);

alter table public.tags enable row level security;
alter table public.recipe_tags enable row level security;

create index if not exists recipe_tags_tag_sort_idx
  on public.recipe_tags (tag_id, sort_order, recipe_id);

create index if not exists recipe_tags_recipe_sort_idx
  on public.recipe_tags (recipe_id, sort_order, tag_id);

create index if not exists recipe_tags_public_approved_idx
  on public.recipe_tags (tag_id, recipe_id)
  where visibility = 'public' and review_status = 'approved';

insert into public.tags (normalized_key, label, kind, is_system, theme_eligible)
values
  ('자취요리', '자취요리', 'semantic', true, true),
  ('초보가능', '초보가능', 'semantic', true, true),
  ('원팬요리', '원팬요리', 'semantic', true, true),
  ('에어프라이어', '에어프라이어', 'semantic', true, true),
  ('전자레인지', '전자레인지', 'semantic', true, true),
  ('밀프렙', '밀프렙', 'semantic', true, true),
  ('고단백', '고단백', 'semantic', true, true),
  ('다이어트', '다이어트', 'semantic', true, true),
  ('저당', '저당', 'semantic', true, true),
  ('한식', '한식', 'semantic', true, true),
  ('국물요리', '국물요리', 'semantic', true, true),
  ('밑반찬', '밑반찬', 'semantic', true, true),
  ('디저트', '디저트', 'semantic', true, true),
  ('매콤', '매콤', 'semantic', true, true),
  ('바삭', '바삭', 'semantic', true, true),
  ('간단요리', '간단요리', 'semantic', true, true),
  ('15분컷', '15분컷', 'semantic', true, true),
  ('혼밥', '혼밥', 'semantic', true, true),
  ('도시락', '도시락', 'semantic', true, true),
  ('냉털요리', '냉털요리', 'semantic', true, true),
  ('해장요리', '해장요리', 'semantic', true, true),
  ('안주', '안주', 'semantic', true, true),
  ('아이반찬', '아이반찬', 'semantic', true, true),
  ('채식', '채식', 'semantic', true, true),
  ('비건', '비건', 'semantic', true, true),
  ('저탄수', '저탄수', 'semantic', true, true),
  ('글루텐프리', '글루텐프리', 'semantic', true, true),
  ('양식', '양식', 'semantic', true, true),
  ('일식', '일식', 'semantic', true, true),
  ('중식', '중식', 'semantic', true, true),
  ('분식', '분식', 'semantic', true, true),
  ('면요리', '면요리', 'semantic', true, true),
  ('밥요리', '밥요리', 'semantic', true, true),
  ('구이', '구이', 'semantic', true, true),
  ('볶음요리', '볶음요리', 'semantic', true, true),
  ('유튜브레시피', '유튜브레시피', 'source', true, true)
on conflict (normalized_key) do update
set label = excluded.label,
    kind = excluded.kind,
    is_system = excluded.is_system,
    theme_eligible = excluded.theme_eligible,
    updated_at = now();

create or replace function public.normalize_recipe_tag_key(p_label text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(regexp_replace(btrim(coalesce(p_label, '')), '^#+', ''), '[[:space:]]+', '', 'g'));
$$;

create or replace function public.build_recipe_tag_payload(
  p_tags text[],
  p_source text default 'system_suggested'
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with normalized as (
    select regexp_replace(btrim(raw_tags.tag), '^#+', '') as label,
           raw_tags.ordinality
      from unnest(coalesce(p_tags, '{}'::text[])) with ordinality as raw_tags(tag, ordinality)
     where btrim(coalesce(raw_tags.tag, '')) <> ''
  ),
  keyed as (
    select public.normalize_recipe_tag_key(label) as normalized_key,
           label,
           ordinality
      from normalized
     where public.normalize_recipe_tag_key(label) <> ''
  ),
  deduped as (
    select distinct on (normalized_key)
           normalized_key,
           label,
           ordinality
      from keyed
     order by normalized_key, ordinality
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'label', coalesce(seed.label, deduped.label),
        'normalized_key', deduped.normalized_key,
        'kind', coalesce(seed.kind, 'user'),
        'source', coalesce(nullif(p_source, ''), 'system_suggested'),
        'confidence', case when coalesce(nullif(p_source, ''), 'system_suggested') = 'user_reviewed' then 1 else 0.8 end,
        'visibility', case
          when seed.id is not null then 'public'
          when coalesce(nullif(p_source, ''), 'system_suggested') = 'user_reviewed' then 'public_pending'
          else 'private'
        end,
        'review_status', case when seed.id is not null then 'approved' else 'pending' end,
        'theme_eligible', coalesce(seed.theme_eligible, false),
        'is_system', coalesce(seed.is_system, false)
      )
      order by deduped.ordinality
    ),
    '[]'::jsonb
  )
  from deduped
  left join public.tags seed
    on seed.normalized_key = deduped.normalized_key
   and seed.is_system = true;
$$;

create or replace function public.set_recipe_tags(
  p_recipe_id uuid,
  p_tags jsonb,
  p_actor_user_id uuid default null,
  p_source text default 'system_suggested'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_tag_id uuid;
  v_touched_tag_ids uuid[] := '{}'::uuid[];
  v_sort_order integer := 0;
begin
  select coalesce(array_agg(rt.tag_id), '{}'::uuid[])
    into v_touched_tag_ids
    from public.recipe_tags rt
   where rt.recipe_id = p_recipe_id;

  delete from public.recipe_tags
   where recipe_id = p_recipe_id;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
  loop
    insert into public.tags (
      normalized_key,
      label,
      kind,
      is_system,
      theme_eligible,
      created_by
    ) values (
      v_item ->> 'normalized_key',
      v_item ->> 'label',
      coalesce(nullif(v_item ->> 'kind', ''), 'user'),
      coalesce((v_item ->> 'is_system')::boolean, false),
      coalesce((v_item ->> 'theme_eligible')::boolean, false),
      case when coalesce((v_item ->> 'is_system')::boolean, false) then null else p_actor_user_id end
    )
    on conflict (normalized_key) do update
    set label = case when public.tags.is_system then public.tags.label else excluded.label end,
        kind = case when public.tags.is_system then public.tags.kind else excluded.kind end,
        updated_at = now()
    returning id into v_tag_id;

    insert into public.recipe_tags (
      recipe_id,
      tag_id,
      source,
      confidence,
      visibility,
      review_status,
      sort_order,
      created_by
    ) values (
      p_recipe_id,
      v_tag_id,
      coalesce(nullif(v_item ->> 'source', ''), p_source, 'system_suggested'),
      coalesce(nullif(v_item ->> 'confidence', '')::numeric, 1),
      coalesce(nullif(v_item ->> 'visibility', ''), 'public'),
      coalesce(nullif(v_item ->> 'review_status', ''), 'approved'),
      v_sort_order,
      p_actor_user_id
    )
    on conflict (recipe_id, tag_id) do update
    set source = excluded.source,
        confidence = excluded.confidence,
        visibility = excluded.visibility,
        review_status = excluded.review_status,
        sort_order = excluded.sort_order,
        created_by = excluded.created_by;

    if array_position(v_touched_tag_ids, v_tag_id) is null then
      v_touched_tag_ids := array_append(v_touched_tag_ids, v_tag_id);
    end if;

    v_sort_order := v_sort_order + 1;
  end loop;

  update public.recipes
     set tags = coalesce((
           select array_agg(t.label order by rt.sort_order, t.label)
             from public.recipe_tags rt
             join public.tags t on t.id = rt.tag_id
            where rt.recipe_id = p_recipe_id
         ), '{}'::text[]),
         updated_at = now()
   where id = p_recipe_id;

  update public.tags
     set usage_count = (
       select count(*)::integer
         from public.recipe_tags rt
        where rt.tag_id = public.tags.id
          and rt.visibility = 'public'
          and rt.review_status = 'approved'
     ),
     updated_at = now()
   where id = any(v_touched_tag_ids);
end;
$$;

drop function if exists public.create_manual_recipe(uuid, text, integer, text, text[], jsonb, jsonb);

create or replace function public.create_manual_recipe(
  p_user_id uuid,
  p_title text,
  p_base_servings integer,
  p_thumbnail_url text,
  p_tags text[] default '{}',
  p_tag_source text default 'system_suggested',
  p_ingredients jsonb default '[]'::jsonb,
  p_steps jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipe public.recipes%rowtype;
  v_item jsonb;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '내 레시피만 등록할 수 있어요.'
    );
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
    'manual',
    p_user_id,
    p_thumbnail_url,
    coalesce(p_tags, '{}'::text[])
  )
  returning * into v_recipe;

  perform public.set_recipe_tags(
    v_recipe.id,
    public.build_recipe_tag_payload(coalesce(p_tags, '{}'::text[]), p_tag_source),
    p_user_id,
    p_tag_source
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
      scalable,
      sort_order
    ) values (
      v_recipe.id,
      (v_item ->> 'ingredient_id')::uuid,
      nullif(v_item ->> 'amount', '')::numeric,
      nullif(v_item ->> 'unit', ''),
      (v_item ->> 'ingredient_type')::public.recipe_ingredient_type,
      nullif(v_item ->> 'display_text', ''),
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
      cooking_method_id,
      ingredients_used,
      heat_level,
      duration_seconds,
      duration_text
    ) values (
      v_recipe.id,
      (v_item ->> 'step_number')::integer,
      v_item ->> 'instruction',
      (v_item ->> 'cooking_method_id')::uuid,
      coalesce(v_item -> 'ingredients_used', '[]'::jsonb),
      nullif(v_item ->> 'heat_level', ''),
      nullif(v_item ->> 'duration_seconds', '')::integer,
      nullif(v_item ->> 'duration_text', '')
    );
  end loop;

  return jsonb_build_object(
    'id', v_recipe.id,
    'title', v_recipe.title,
    'source_type', v_recipe.source_type,
    'created_by', v_recipe.created_by,
    'base_servings', v_recipe.base_servings
  );
end;
$$;

drop function if exists public.register_youtube_recipe_from_session(uuid, uuid, text, integer, text, text, jsonb, jsonb);

create or replace function public.register_youtube_recipe_from_session(
  p_extraction_id uuid,
  p_user_id uuid,
  p_title text,
  p_base_servings integer,
  p_youtube_url text,
  p_youtube_video_id text,
  p_tags text[] default null,
  p_tag_source text default 'system_suggested',
  p_ingredients jsonb default '[]'::jsonb,
  p_steps jsonb default '[]'::jsonb
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

  if p_tags is null then
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
            limit 8
        ) normalized_tags;
    end if;
  else
    v_tags := p_tags;
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

  perform public.set_recipe_tags(
    v_recipe_id,
    public.build_recipe_tag_payload(v_tags, p_tag_source),
    p_user_id,
    p_tag_source
  );

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

revoke execute on function public.build_recipe_tag_payload(text[], text) from public;
revoke execute on function public.build_recipe_tag_payload(text[], text) from anon;
revoke execute on function public.build_recipe_tag_payload(text[], text) from authenticated;
revoke execute on function public.set_recipe_tags(uuid, jsonb, uuid, text) from public;
revoke execute on function public.set_recipe_tags(uuid, jsonb, uuid, text) from anon;
revoke execute on function public.set_recipe_tags(uuid, jsonb, uuid, text) from authenticated;
grant execute on function public.build_recipe_tag_payload(text[], text) to service_role;
grant execute on function public.set_recipe_tags(uuid, jsonb, uuid, text) to service_role;
revoke execute on function public.create_manual_recipe(
  uuid,
  text,
  integer,
  text,
  text[],
  text,
  jsonb,
  jsonb
) from public;
revoke execute on function public.create_manual_recipe(
  uuid,
  text,
  integer,
  text,
  text[],
  text,
  jsonb,
  jsonb
) from anon;
grant execute on function public.create_manual_recipe(
  uuid,
  text,
  integer,
  text,
  text[],
  text,
  jsonb,
  jsonb
) to authenticated, service_role;
revoke execute on function public.register_youtube_recipe_from_session(
  uuid,
  uuid,
  text,
  integer,
  text,
  text,
  text[],
  text,
  jsonb,
  jsonb
) from public;
revoke execute on function public.register_youtube_recipe_from_session(
  uuid,
  uuid,
  text,
  integer,
  text,
  text,
  text[],
  text,
  jsonb,
  jsonb
) from anon;
grant execute on function public.register_youtube_recipe_from_session(
  uuid,
  uuid,
  text,
  integer,
  text,
  text,
  text[],
  text,
  jsonb,
  jsonb
) to authenticated, service_role;
