-- Complete with a server-derived 75% ingredient-weight estimate, retaining the
-- client's original idempotency payload and all existing owner/session fences.
begin;

alter table public.leftover_dishes add column if not exists weight_source text
  check (weight_source is null or weight_source in ('estimated', 'measured'));

do $migration$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef('public.complete_snapshot_v2_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,timestamptz)'::regprocedure)
    into v_definition;
  if position('estimate_from_ingredients' in v_definition) = 0 then
    v_original := $old$or p_weight_action not in ('set_finished_weight','weigh_later')$old$;
    if position(v_original in v_definition) = 0 then raise exception 'completion validation anchor missing'; end if;
    v_definition := replace(v_definition, v_original, $new$or p_weight_action not in ('set_finished_weight','weigh_later','estimate_from_ingredients')
    or (p_weight_action = 'estimate_from_ingredients' and p_finished_weight_g is not null
      and (p_finished_weight_g <= 0 or p_finished_weight_g::text in ('NaN','Infinity','-Infinity')))$new$);
    v_original := $old$'weight_action', p_weight_action, 'finished_weight_g', p_finished_weight_g)$old$;
    if position(v_original in v_definition) = 0 then raise exception 'completion receipt anchor missing'; end if;
    v_definition := replace(v_definition, v_original, $new$'weight_action', case when p_weight_action='estimate_from_ingredients' then 'weigh_later' else p_weight_action end,
      'finished_weight_g', case when p_weight_action='estimate_from_ingredients' then null else p_finished_weight_g end)$new$);
    v_original := 'finished_weight_g, remaining_weight_g, weight_status, batch_status, depleted_reason, revision, event_checksum';
    if position(v_original in v_definition) = 0 then raise exception 'completion insert anchor missing'; end if;
    v_definition := replace(v_definition, v_original, 'finished_weight_g, remaining_weight_g, weight_status, weight_source, batch_status, depleted_reason, revision, event_checksum');
    v_original := $old$case when p_weight_action='set_finished_weight' then 'known' else 'missing' end,$old$;
    if position(v_original in v_definition) = 0 then raise exception 'completion weight anchor missing'; end if;
    v_definition := replace(v_definition, v_original, $new$case when p_finished_weight_g is not null then 'known' else 'missing' end,
    case when p_finished_weight_g is null then null when p_weight_action='estimate_from_ingredients' then 'estimated' else 'measured' end,$new$);
    execute v_definition;
  end if;

  select pg_get_functiondef('private.project_cooked_batch(uuid,uuid)'::regprocedure) into v_definition;
  if position('weight_source' in v_definition) = 0 then
    v_original := $old$'weight_status', batch.weight_status,$old$;
    if position(v_original in v_definition) = 0 then raise exception 'batch projection anchor missing'; end if;
    v_definition := replace(v_definition, v_original, $new$'weight_status', batch.weight_status,
    'weight_source', case when batch.weight_status='known' then coalesce(batch.weight_source,'measured') else null end,$new$);
    execute v_definition;
  end if;

  select pg_get_functiondef('public.mutate_cooked_batch_weight(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,timestamptz)'::regprocedure) into v_definition;
  if position('weight_source' in v_definition) = 0 then
    v_original := $old$or v_batch.weight_status<>'missing'$old$;
    if position(v_original in v_definition) = 0 then raise exception 'measured weight validation anchor missing'; end if;
    v_definition := replace(v_definition, v_original, $new$or (v_batch.weight_status<>'missing' and not (
      v_batch.weight_status='known' and v_batch.weight_source is not distinct from 'estimated'))$new$);
    -- Keep the existing no-events/empty-checksum and expected-revision checks.
    -- Once consumed, only the existing remaining-weight adjustment is allowed.
    v_original := $old$weight_status='known',revision=revision+1$old$;
    if position(v_original in v_definition) = 0 then raise exception 'measured weight update anchor missing'; end if;
    v_definition := replace(v_definition, v_original, $new$weight_status='known',weight_source='measured',revision=revision+1$new$);
    execute v_definition;
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
