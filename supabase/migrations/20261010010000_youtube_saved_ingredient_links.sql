begin;

-- Catalog identity is derived at response time. It deliberately stays outside
-- editable_content_json so reads cannot revise user content, quantities,
-- hashes, revisions, or the immutable extraction snapshot.
create or replace function private.project_youtube_saved_recipe_ingredient_links(
  p_result public.youtube_saved_recipe_results
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_links jsonb := '{}'::jsonb;
  v_editable jsonb;
  v_source jsonb;
  v_link jsonb;
  v_candidates jsonb;
  v_row_id text;
  v_source_id text;
  v_current_name text;
  v_source_name text;
  v_source_status text;
  v_source_ingredient_id text;
  v_occurrence_raw_text text;
  v_match_count integer;
  v_match_id uuid;
begin
  for v_editable in
    select item
    from jsonb_array_elements(
      coalesce(p_result.editable_content_json -> 'ingredients', '[]'::jsonb)
    ) rows(item)
  loop
    v_row_id := v_editable ->> 'row_id';
    v_source_id := v_editable ->> 'source_draft_ingredient_id';
    v_current_name := btrim(coalesce(v_editable ->> 'standard_name', ''));
    v_link := jsonb_build_object(
      'ingredient_id', null,
      'resolution_status', 'unresolved',
      'candidates', '[]'::jsonb
    );
    v_source := null;

    if nullif(v_source_id, '') is not null then
      select source_item
        into v_source
      from jsonb_array_elements(
        coalesce(
          p_result.source_snapshot_json -> 'draft_json' -> 'ingredients',
          '[]'::jsonb
        )
      ) source_rows(source_item)
      where source_item ->> 'draft_ingredient_id' = v_source_id
      limit 1;
    end if;

    v_source_name := btrim(coalesce(
      v_source ->> 'standard_name',
      v_source ->> 'raw_text',
      ''
    ));

    -- A missing source pointer or any source/current name mismatch means the
    -- user changed identity. Never revive the old source id in that case.
    if v_source is not null
      and v_current_name <> ''
      and v_current_name = v_source_name then
      v_source_status := v_source ->> 'resolution_status';
      v_source_ingredient_id := v_source ->> 'ingredient_id';

      if v_source_status = 'resolved'
        and coalesce(v_source_ingredient_id, '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.ingredients ingredient
          where ingredient.id = v_source_ingredient_id::uuid
            and public.is_selectable_catalog_ingredient(ingredient.id)
        ) then
        v_link := jsonb_build_object(
          'ingredient_id', v_source_ingredient_id,
          'resolution_status', 'resolved',
          'candidates', '[]'::jsonb
        );
      elsif v_source_status = 'needs_review' then
        select coalesce(jsonb_agg(jsonb_build_object(
          'ingredient_id', ingredient.id,
          'standard_name', ingredient.standard_name,
          'confidence', case
            when jsonb_typeof(candidate -> 'confidence') = 'number'
              then candidate -> 'confidence'
            else '1'::jsonb
          end
        ) order by candidate_rows.ordinality), '[]'::jsonb)
          into v_candidates
        from jsonb_array_elements(coalesce(v_source -> 'candidates', '[]'::jsonb))
          with ordinality candidate_rows(candidate, ordinality)
        join public.ingredients ingredient
          on ingredient.id = case
            when coalesce(candidate ->> 'ingredient_id', '')
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then (candidate ->> 'ingredient_id')::uuid
            else null
          end
        where public.is_selectable_catalog_ingredient(ingredient.id);
        v_link := jsonb_build_object(
          'ingredient_id', null,
          'resolution_status', 'needs_review',
          'candidates', coalesce(v_candidates, '[]'::jsonb)
        );
      elsif v_source_status is null or v_source_status = 'unresolved' then
        -- Older rows may predate resolver metadata, while cached unresolved
        -- rows can gain a newly warranted exact match under the hardened
        -- catalog helper. Reconstruct only occurrence-owned context: original
        -- name plus this row's own amount and unit. Never use display text or
        -- another row, and never run this path for renamed/detached rows.
        v_occurrence_raw_text := case
          when nullif(btrim(v_source ->> 'original_name'), '') is null then null
          else concat_ws(' ',
            btrim(v_source ->> 'original_name'),
            nullif(btrim(v_source ->> 'amount'), ''),
            nullif(btrim(v_source ->> 'unit'), '')
          )
        end;
        select count(*)::integer,
          (array_agg(matched.id order by matched.standard_name, matched.id))[1],
          coalesce(jsonb_agg(jsonb_build_object(
            'ingredient_id', matched.id,
            'standard_name', matched.standard_name,
            'confidence', 1
          ) order by matched.standard_name, matched.id), '[]'::jsonb)
          into v_match_count, v_match_id, v_candidates
        from public.match_ingredient_name_exact_with_context(
          v_current_name,
          nullif(btrim(v_source ->> 'unit'), ''),
          v_occurrence_raw_text
        ) matched;

        if v_match_count = 1 then
          v_link := jsonb_build_object(
            'ingredient_id', v_match_id,
            'resolution_status', 'resolved',
            'candidates', '[]'::jsonb
          );
        elsif v_match_count > 1 then
          v_link := jsonb_build_object(
            'ingredient_id', null,
            'resolution_status', 'needs_review',
            'candidates', v_candidates
          );
        end if;
      end if;
    end if;

    v_links := v_links || jsonb_build_object(v_row_id, v_link);
  end loop;

  return v_links;
end;
$function$;

create or replace function private.project_youtube_saved_recipe_result(
  p_result public.youtube_saved_recipe_results
)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'draft_id', p_result.id,
    'revision', p_result.revision,
    'created_at', p_result.created_at,
    'updated_at', p_result.updated_at,
    'content', p_result.editable_content_json,
    'ingredient_links', private.project_youtube_saved_recipe_ingredient_links(p_result),
    'source', jsonb_build_object(
      'extraction_id', p_result.extraction_session_id,
      'youtube_url', p_result.source_snapshot_json ->> 'youtube_url',
      'youtube_video_id', p_result.source_snapshot_json ->> 'youtube_video_id',
      'thumbnail_url', p_result.source_snapshot_json -> 'thumbnail_url'
    )
  );
$function$;

alter function private.project_youtube_saved_recipe_ingredient_links(
  public.youtube_saved_recipe_results
) owner to postgres;
alter function private.project_youtube_saved_recipe_result(
  public.youtube_saved_recipe_results
) owner to postgres;

revoke all on function private.project_youtube_saved_recipe_ingredient_links(
  public.youtube_saved_recipe_results
) from public, anon, authenticated, service_role;
revoke all on function private.project_youtube_saved_recipe_result(
  public.youtube_saved_recipe_results
) from public, anon, authenticated, service_role;

commit;
