-- i031 source/frame/OCR/prompt flow with new models and a new execution identity.
-- Keep enqueue closed until matching artifacts and a fresh credential are installed.
-- Take the exclusive counterpart of enqueue's shared lock before any table lock.
select pg_catalog.pg_advisory_xact_lock(86120317);

lock table private.youtube_extraction_current_policy,
  public.youtube_extraction_jobs, public.youtube_extractor_permits
  in share row exclusive mode;

do $migration$
declare
  v_policy private.youtube_extraction_current_policy%rowtype;
begin
  select * into strict v_policy
  from private.youtube_extraction_current_policy
  where policy_key = 'primary';

  if v_policy.policy_version = 2
    and v_policy.pipeline_identity = '5e80ffc32ab63ec1e4b015222692597e18bbce8520271a7130689dd138ff808c'
    and v_policy.extractor_mode = 'i031_codex_vision' then
    return;
  end if;

  if v_policy.policy_version <> 1
    or v_policy.pipeline_identity <> '9adc7876a02c2da55a92e3a65369bf4e803c78efb9a791717201eedc242c1908'
    or v_policy.extractor_mode <> 'i031_codex_vision' then
    raise exception 'YOUTUBE_PIPELINE_POLICY_DRIFT';
  end if;

  if exists (select 1 from public.youtube_extraction_jobs where status in ('queued', 'processing'))
    or exists (select 1 from public.youtube_extractor_permits where owner_id is not null) then
    raise exception 'YOUTUBE_PIPELINE_DRAIN_REQUIRED';
  end if;

  update private.youtube_extraction_current_policy
  set policy_version = 2,
      pipeline_identity = '5e80ffc32ab63ec1e4b015222692597e18bbce8520271a7130689dd138ff808c',
      enabled = false,
      updated_at = clock_timestamp()
  where policy_key = 'primary';
end;
$migration$;
