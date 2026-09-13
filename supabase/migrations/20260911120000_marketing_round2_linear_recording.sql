begin;

-- Add recording r2.2 without rewriting existing answers, rows, constraints, or RPCs.
create or replace function private.marketing_round2_answers(topic text, survey_version text, value jsonb) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select coalesce(case
 when survey_version = 'r2.1-' || topic then private.marketing_round2_answers(topic, value)
 when topic = 'homeflow' and survey_version = 'r2.2-homeflow' then
  private.marketing_round2_keys(value, array['q1','q2','q3','q4'])
  and jsonb_typeof(value->'q1') = 'string' and jsonb_typeof(value->'q2') = 'string'
  and jsonb_typeof(value->'q3') = 'string' and jsonb_typeof(value->'q4') = 'string'
  and value->>'q1' in ('none','one_two','three_four','five_seven')
  and value->>'q2' in ('none','once','two_three','four_plus')
  and value->>'q3' in ('spontaneous','mental','memo','scheduled')
  and value->>'q4' in ('planning','shopping','video','none')
 when topic = 'recording' and survey_version = 'r2.2-recording' then
  private.marketing_round2_keys(value, array['q1','q2','q3','q4'])
  and jsonb_typeof(value->'q1') = 'string' and jsonb_typeof(value->'q2') = 'string'
  and jsonb_typeof(value->'q3') = 'string' and jsonb_typeof(value->'q4') = 'string'
  and value->>'q1' in ('daily','3_5','1_2','none')
  and value->>'q2' in ('none','1_2','3_5','6_plus')
  and value->>'q3' in ('pass','eyeball','track','measure')
  and value->>'q4' in ('ingredients','weight','search','none')
 else false end, false) $$;

alter function private.marketing_round2_answers(text,text,jsonb) owner to postgres;
revoke all on function private.marketing_round2_answers(text,text,jsonb) from public, anon, authenticated, service_role;

commit;
