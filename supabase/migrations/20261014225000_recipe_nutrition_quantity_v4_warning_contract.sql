begin;
set local lock_timeout = '5s';

-- Extend only the existing payload validator's exact v4 warning contract.
-- Keep its signature, owner, ACL, security mode, settings and all row guards.
-- No application row, table, RPC path or grant changes.
do $quantity_warning_contract$
declare
  v_function regprocedure := to_regprocedure('public.validate_recipe_nutrition_snapshot_payload(jsonb)');
  v_definition text;
  v_metadata jsonb;
  v_after_metadata jsonb;
  v_patch record;
begin
  if v_function is null then raise exception 'RECIPE_QUANTITY_WARNING_VALIDATOR_MISSING'; end if;
  select pg_get_functiondef(v_function), jsonb_build_object(
    'oid', oid, 'owner', proowner, 'acl', proacl, 'config', proconfig,
    'security_definer', prosecdef, 'volatility', provolatile, 'parallel', proparallel
  ) into v_definition, v_metadata from pg_proc where oid = v_function;
  if position('UNIT_MEASUREMENT_ESTIMATE_USED' in v_definition) > 0 then
    raise exception 'RECIPE_QUANTITY_WARNING_VALIDATOR_ALREADY_CHANGED';
  end if;
  for v_patch in select * from (values
    ($old$      or item #>> '{}' <> all(v_allowed_warnings)$old$,
     $new$      or (item #>> '{}' <> all(v_allowed_warnings)
        and (p_snapshot ->> 'calculation_version' is distinct from 'recipe-nutrition-v4'
          or item #>> '{}' <> all(array[
            'UNIT_DEFINITION_REQUIRED', 'UNIT_DEFINITION_CONFLICT', 'PIECE_IDENTITY_REQUIRED',
            'DENSITY_REQUIRED', 'AMBIGUOUS_EVIDENCE', 'UNIT_MEASUREMENT_ESTIMATE_USED'
          ])))$new$, 1),
    ($old$      or item #>> '{}' !~ '^(TO_TASTE_EXCLUDED|PREDECESSOR_NOT_APPROVED|NUTRITION_PROFILE_MISSING|INVALID_QUANTITY|UNIT_CONVERSION_MISSING|PIECE_WEIGHT_REQUIRED):[0-9A-Za-z-]+$|^NUTRIENT_VALUE_MISSING:[0-9A-Za-z-]+:(energy_kcal|carbohydrate_g|protein_g|fat_g|sodium_mg|sugars_g|saturated_fat_g|fiber_g)$'$old$,
     $new$      or (item #>> '{}' !~ '^(TO_TASTE_EXCLUDED|PREDECESSOR_NOT_APPROVED|NUTRITION_PROFILE_MISSING|INVALID_QUANTITY|UNIT_CONVERSION_MISSING|PIECE_WEIGHT_REQUIRED):[0-9A-Za-z-]+$|^NUTRIENT_VALUE_MISSING:[0-9A-Za-z-]+:(energy_kcal|carbohydrate_g|protein_g|fat_g|sodium_mg|sugars_g|saturated_fat_g|fiber_g)$'
        and (p_snapshot ->> 'calculation_version' is distinct from 'recipe-nutrition-v4'
          or item #>> '{}' !~ '^(UNIT_DEFINITION_REQUIRED|UNIT_DEFINITION_CONFLICT|PIECE_IDENTITY_REQUIRED|DENSITY_REQUIRED|AMBIGUOUS_EVIDENCE):[0-9A-Za-z-]+$'))$new$, 1),
    ($old$(p_snapshot -> 'warnings') ?| array['REPRESENTATIVE_VOLUME_CONVERSION_USED', 'PIECE_WEIGHT_CONVERSION_USED', 'AI_NUTRITION_ESTIMATE_USED']$old$,
     $new$(p_snapshot -> 'warnings') ?| array['REPRESENTATIVE_VOLUME_CONVERSION_USED', 'PIECE_WEIGHT_CONVERSION_USED', 'AI_NUTRITION_ESTIMATE_USED', 'UNIT_MEASUREMENT_ESTIMATE_USED']$new$, 2)
  ) as patches(before_text, after_text, expected_count) loop
    if (length(v_definition) - length(replace(v_definition, v_patch.before_text, ''))) / length(v_patch.before_text)
      <> v_patch.expected_count then
      raise exception 'RECIPE_QUANTITY_WARNING_VALIDATOR_PREIMAGE_MISMATCH';
    end if;
    v_definition := replace(v_definition, v_patch.before_text, v_patch.after_text);
  end loop;
  execute v_definition;
  select jsonb_build_object(
    'oid', oid, 'owner', proowner, 'acl', proacl, 'config', proconfig,
    'security_definer', prosecdef, 'volatility', provolatile, 'parallel', proparallel
  ) into v_after_metadata from pg_proc where oid = v_function;
  if v_after_metadata is distinct from v_metadata then
    raise exception 'RECIPE_QUANTITY_WARNING_VALIDATOR_AUTHORITY_CHANGED';
  end if;
end;
$quantity_warning_contract$;

commit;
