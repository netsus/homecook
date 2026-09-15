-- Rotate i031 to Luna medium selection and Sol medium final extraction.
-- Keep enqueue closed until matching artifacts and a fresh credential are installed.
select pg_catalog.pg_advisory_xact_lock(86120317);

lock table private.youtube_extraction_current_policy,
  public.youtube_extraction_jobs, public.youtube_extractor_permits
  in share row exclusive mode;

do $migration$
declare
  v_policy private.youtube_extraction_current_policy%rowtype;
  v_previous_options constant jsonb :=
    '{"codexEffort":"low","frameMode":"hybrid","hybridAnchorBudget":36,"interval":4,"keyframeTotalLimit":8,"keyframesPerRecipe":8,"packetPromptTextOnly":false,"publicSourceBundle":null,"recipeMode":"single","screenOcrMode":"auto","selectorCandidateLimit":12,"selectorEffort":"low","singleRecipeOnly":true,"sourceMode":"source-text","useApifyFallback":true,"useEvidencePackets":false,"useVisual":true}'::jsonb;
  v_next_options constant jsonb :=
    '{"codexEffort":"medium","frameMode":"hybrid","hybridAnchorBudget":36,"interval":4,"keyframeTotalLimit":8,"keyframesPerRecipe":8,"packetPromptTextOnly":false,"publicSourceBundle":null,"recipeMode":"single","screenOcrMode":"auto","selectorCandidateLimit":12,"selectorEffort":"medium","singleRecipeOnly":true,"sourceMode":"source-text","useApifyFallback":true,"useEvidencePackets":false,"useVisual":true}'::jsonb;
begin
  select * into strict v_policy
  from private.youtube_extraction_current_policy
  where policy_key = 'primary';

  if v_policy.policy_version = 3
    and v_policy.pipeline_identity = '1cc9db22bff1be9fd3d7f8f829e661d5e53905013781e7179b9490a6cc247d5a'
    and v_policy.extractor_mode = 'i031_codex_vision'
    and v_policy.result_affecting_options = v_next_options then
    return;
  end if;

  if v_policy.policy_version <> 2
    or v_policy.pipeline_identity <> '5e80ffc32ab63ec1e4b015222692597e18bbce8520271a7130689dd138ff808c'
    or v_policy.extractor_mode <> 'i031_codex_vision'
    or v_policy.result_affecting_options <> v_previous_options then
    raise exception 'YOUTUBE_PIPELINE_POLICY_DRIFT';
  end if;

  if exists (select 1 from public.youtube_extraction_jobs where status in ('queued', 'processing'))
    or exists (select 1 from public.youtube_extractor_permits where owner_id is not null) then
    raise exception 'YOUTUBE_PIPELINE_DRAIN_REQUIRED';
  end if;

  update private.youtube_extraction_current_policy
  set policy_version = 3,
      pipeline_identity = '1cc9db22bff1be9fd3d7f8f829e661d5e53905013781e7179b9490a6cc247d5a',
      result_affecting_options = v_next_options,
      enabled = false,
      updated_at = clock_timestamp()
  where policy_key = 'primary';
end;
$migration$;
