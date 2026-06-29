-- Normalize FoodSafetyKorea image URLs before launch to prevent mixed-content
-- warnings on public recipe, planner, shopping, and recipe-book surfaces.

do $$
declare
  v_http_host constant text := 'http://www.foodsafetykorea.go.kr';
  v_https_host constant text := 'https://www.foodsafetykorea.go.kr';
begin
  update public.recipes
  set thumbnail_url = v_https_host || substring(thumbnail_url from length(v_http_host) + 1)
  where thumbnail_url like v_http_host || '/%';

  update public.recipe_sources as source
  set extraction_meta_json = normalized_meta.extraction_meta_json
  from (
    select
      with_candidates.id,
      with_candidates.extraction_meta_json
    from (
      select
        with_source_image.id,
        case
          when jsonb_typeof(with_source_image.extraction_meta_json -> 'image_candidates') = 'array'
          then jsonb_set(
            with_source_image.extraction_meta_json,
            '{image_candidates}',
            coalesce(
              (
                select jsonb_agg(
                  case
                    when jsonb_typeof(candidate.value) = 'object'
                      and candidate.value ->> 'url' like v_http_host || '/%'
                    then jsonb_set(
                      candidate.value,
                      '{url}',
                      to_jsonb(
                        v_https_host ||
                        substring(candidate.value ->> 'url' from length(v_http_host) + 1)
                      ),
                      false
                    )
                    else candidate.value
                  end
                  order by candidate.ordinality
                )
                from jsonb_array_elements(
                  with_source_image.extraction_meta_json -> 'image_candidates'
                ) with ordinality as candidate(value, ordinality)
              ),
              '[]'::jsonb
            ),
            false
          )
          else with_source_image.extraction_meta_json
        end as extraction_meta_json
      from (
        select
          id,
          case
            when jsonb_typeof(extraction_meta_json) = 'object'
              and extraction_meta_json ->> 'source_image_url' like v_http_host || '/%'
            then jsonb_set(
              extraction_meta_json,
              '{source_image_url}',
              to_jsonb(
                v_https_host ||
                substring(extraction_meta_json ->> 'source_image_url' from length(v_http_host) + 1)
              ),
              false
            )
            else extraction_meta_json
          end as extraction_meta_json
        from public.recipe_sources
        where extraction_meta_json::text like '%' || v_http_host || '%'
      ) as with_source_image
    ) as with_candidates
  ) as normalized_meta
  where source.id = normalized_meta.id
    and source.extraction_meta_json is distinct from normalized_meta.extraction_meta_json;
end $$;
