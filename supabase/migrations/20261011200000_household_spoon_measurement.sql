-- Only the explicit canonical 밥숟가락 uses ingredient-specific household weights.
-- Legacy 스푼/숟가락/밥숟갈/T retain their existing 15ml behavior. No data is seeded.
-- Reviewed existing source rows retain this unit through the existing writer exception;
-- no public writer whitelist or worker catalog function changes.
begin;
do $household_spoon$
declare
  patch record; v_oid oid; v_definition text; v_before jsonb; v_after jsonb;
begin
  for patch in select * from (values
    ('private.ingredient_piece_unit_family(text,boolean)', '12c4889a954e7252958fea64271518d0', '1fb1b6097f136a2bba06659adaa27de7',
      $before$    when unit = '장' then 'sheet'$before$,
      $after$    when unit = '밥숟가락' then 'household_spoon'
    when unit = '장' then 'sheet'$after$),
    ('private.ingredient_piece_default_size(text)', '572f9dc1ef89ca651b2cd675d5df0267', '1d7a2ac1b809d733e1c2cf963ed75dd3',
      $before$    when 'handful' then 'handful'$before$,
      $after$    when 'household_spoon' then 'household_spoon'
    when 'handful' then 'handful'$after$)
  ) as patches(signature, pre_md5, post_md5, old_text, new_text) loop
    v_oid := to_regprocedure(patch.signature);
    if v_oid is null then raise exception 'HOUSEHOLD_SPOON_FUNCTION_MISSING: %', patch.signature; end if;
    v_definition := pg_get_functiondef(v_oid);
    if md5(v_definition) = patch.post_md5 then continue; end if;
    if md5(v_definition) <> patch.pre_md5 then
      raise exception 'HOUSEHOLD_SPOON_FUNCTION_BASELINE_MISMATCH: %', patch.signature;
    end if;
    if (length(v_definition) - length(replace(v_definition,patch.old_text,''))) / length(patch.old_text) <> 1 then
      raise exception 'HOUSEHOLD_SPOON_PATCH_ANCHOR_MISMATCH: %', patch.signature;
    end if;
    select jsonb_build_object('owner',proowner,'acl',proacl::text,'config',proconfig,
      'security_definer',prosecdef,'volatility',provolatile,'parallel',proparallel,'strict',proisstrict)
      into strict v_before from pg_proc where oid=v_oid;
    execute replace(v_definition,patch.old_text,patch.new_text);
    select jsonb_build_object('owner',proowner,'acl',proacl::text,'config',proconfig,
      'security_definer',prosecdef,'volatility',provolatile,'parallel',proparallel,'strict',proisstrict)
      into strict v_after from pg_proc where oid=v_oid;
    if v_after is distinct from v_before or md5(pg_get_functiondef(v_oid)) <> patch.post_md5 then
      raise exception 'HOUSEHOLD_SPOON_FUNCTION_POSTIMAGE_MISMATCH: %', patch.signature;
    end if;
  end loop;
end;
$household_spoon$;
commit;
