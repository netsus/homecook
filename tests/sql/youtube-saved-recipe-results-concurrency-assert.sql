do $$
begin
  if (select count(*) from public.youtube_saved_recipe_results
      where extraction_session_id='22000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'concurrent ensure did not converge to one result';
  end if;
  if exists (
    select 1 from public.youtube_saved_recipe_results
    where extraction_session_id='22000000-0000-4000-8000-000000000001'
      and (revision <> 1 or editable_content_json ->> 'title' <> '동시 자동 저장')
  ) then
    raise exception 'concurrent ensure changed initial source-derived content';
  end if;
  if (select count(*) from private.youtube_saved_recipe_result_mutations
      where operation='create') <> 0 then
    raise exception 'ensure unexpectedly wrote manual-create receipts';
  end if;
end;
$$;
select '{"status":"PASS","checks":["two_connection_ensure","one_result","initial_source_content_intact"]}'::jsonb;
