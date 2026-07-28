begin;

do $repair$
declare
  v_signature regprocedure :=
    'public.prepare_recipe_image_legacy_visibility_migration(uuid,uuid,uuid,bigint,uuid[])'
      ::regprocedure;
  v_definition text;
  v_original text := $original$
    if exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.reference_type = v_positive.reference_type
        and reference.consumer_id = v_positive.consumer_id
    ) then
      raise exception 'legacy visibility migration source drifted'
        using errcode = '40001';
    end if;
$original$;
  v_repaired text := $repaired$
    if exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.reference_type = v_positive.reference_type
        and reference.consumer_id = v_positive.consumer_id
        and not exists (
          select 1
          from public.recipe_image_legacy_visibility_migration_runs
            as existing_run
          join public.recipe_image_legacy_visibility_targets
            as existing_target
            on existing_target.migration_run_id = existing_run.id
          join public.recipe_image_legacy_visibility_target_references
            as existing_target_reference
            on existing_target_reference.migration_target_id
              = existing_target.id
          where existing_run.migration_key = p_migration_key
            and existing_run.inventory_run_id = p_inventory_run_id
            and existing_run.cutover_attempt_id = p_cutover_attempt_id
            and existing_run.capability_revision
              = p_expected_capability_revision
            and existing_target.state = 'finalized'
            and existing_target.target_object_id
              = reference.image_object_id
            and existing_target_reference.positive_reference_id
              = v_positive.id
            and existing_target_reference.reference_type
              = v_positive.reference_type
            and existing_target_reference.consumer_id
              = v_positive.consumer_id
        )
    ) then
      raise exception 'legacy visibility migration source drifted'
        using errcode = '40001';
    end if;
$repaired$;
begin
  select pg_catalog.pg_get_functiondef(v_signature::oid)
  into v_definition;

  if pg_catalog.strpos(v_definition, v_repaired) > 0 then
    return;
  end if;

  if pg_catalog.strpos(v_definition, v_original) = 0 then
    raise exception
      'legacy visibility prepare replay repair target is unavailable'
      using errcode = '55000';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    v_original,
    v_repaired
  );
  execute v_definition;
end;
$repair$;

commit;
