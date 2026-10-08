begin;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format('grant youtube_extraction_worker_rpc_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  else
    execute format('grant youtube_extraction_worker_rpc_owner to %I', current_user);
  end if;
end;
$membership$;

grant create on schema public to youtube_extraction_worker_rpc_owner;
set local role youtube_extraction_worker_rpc_owner;

do $quantity_bridge$
declare
  v_signature regprocedure := 'public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_old text;
  v_new text;
begin
  if strpos(v_definition, 'public.match_ingredient_name_exact(v_ingredient_name)') = 0
    or strpos(v_definition, 'v_amount_fraction text[]') = 0
    or strpos(v_definition, 'v_quantity_state text;') > 0 then
    raise exception 'YouTube trial quantity bridge predecessor drifted' using errcode = '55000';
  end if;

  v_old := '  v_draft jsonb;';
  v_new := $declarations$  v_draft jsonb;
  v_has_quantity_metadata boolean;
  v_quantity_state text;
  v_amount_basis text;
  v_original_name text;
  v_alternative_names jsonb;
  v_evidence_refs jsonb;
  v_evidence_ref jsonb;
  v_evidence_key text;
  v_quantity_source text;
  v_quantity_raw_text text;
  v_quantity_review_required boolean;$declarations$;
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'YouTube trial quantity declaration source drifted' using errcode = '55000';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $amount$    v_amount_text := nullif(btrim(regexp_replace(v_ingredient ->> 'amount', '[[:cntrl:][:space:]]+', ' ', 'g')), '');$amount$;
  v_new := $metadata$    v_has_quantity_metadata := v_ingredient ?| array[
      'quantityState', 'amountBasis', 'originalName', 'alternativeNames', 'evidenceRefs'
    ];
    v_quantity_state := v_ingredient ->> 'quantityState';
    v_amount_basis := v_ingredient ->> 'amountBasis';
    v_original_name := coalesce(v_ingredient ->> 'originalName', v_ingredient_name);
    v_alternative_names := coalesce(v_ingredient -> 'alternativeNames', '[]'::jsonb);
    v_evidence_refs := coalesce(v_ingredient -> 'evidenceRefs', '[]'::jsonb);

    if v_has_quantity_metadata then
      if not (v_ingredient ? 'quantityState')
        or jsonb_typeof(v_ingredient -> 'quantityState') is distinct from 'string'
        or v_quantity_state not in ('explicit', 'estimated', 'to_taste', 'unknown', 'conflicting')
        or (v_ingredient ? 'amountBasis' and jsonb_typeof(v_ingredient -> 'amountBasis') not in ('string', 'null'))
        or length(v_amount_basis) > 80
        or (v_ingredient ? 'originalName' and jsonb_typeof(v_ingredient -> 'originalName') is distinct from 'string')
        or coalesce(length(btrim(v_original_name)), 0) not between 1 and 160
        or jsonb_typeof(v_alternative_names) is distinct from 'array'
        or jsonb_typeof(v_evidence_refs) is distinct from 'array'
        or jsonb_array_length(v_alternative_names) > 4
        or jsonb_array_length(v_evidence_refs) > 6 then
        raise exception 'VALIDATION_ERROR' using errcode = '22023';
      end if;

      if exists (
        select 1
        from jsonb_array_elements(v_alternative_names) alternative
        where jsonb_typeof(alternative) is distinct from 'string'
          or length(btrim(alternative #>> '{}')) not between 1 and 160
      ) then
        raise exception 'VALIDATION_ERROR' using errcode = '22023';
      end if;

      for v_evidence_ref in select value from jsonb_array_elements(v_evidence_refs) loop
        if jsonb_typeof(v_evidence_ref) is distinct from 'object'
          or jsonb_typeof(v_evidence_ref -> 'source_method') is distinct from 'string'
          or v_evidence_ref ->> 'source_method' not in ('description', 'comment', 'caption', 'visual')
          or jsonb_typeof(v_evidence_ref -> 'source_provider') is distinct from 'string'
          or length(btrim(v_evidence_ref ->> 'source_provider')) not between 1 and 80
          or jsonb_typeof(v_evidence_ref -> 'snippet') is distinct from 'string'
          or length(v_evidence_ref ->> 'snippet') > 200
          or exists (
            select 1 from jsonb_object_keys(v_evidence_ref) field
            where field not in ('evidence_id', 'source_method', 'source_provider',
              'line_index', 'start_ms', 'end_ms', 'frame_ts_ms', 'snippet', 'locator_hash')
          ) then
          raise exception 'VALIDATION_ERROR' using errcode = '22023';
        end if;

        if v_evidence_ref ? 'evidence_id' and (
          jsonb_typeof(v_evidence_ref -> 'evidence_id') is distinct from 'string'
          or v_evidence_ref ->> 'evidence_id' !~ '^[A-Za-z0-9_-]{1,80}$'
        ) then
          raise exception 'VALIDATION_ERROR' using errcode = '22023';
        end if;

        if v_evidence_ref ? 'locator_hash'
          and jsonb_typeof(v_evidence_ref -> 'locator_hash') <> 'null'
          and (jsonb_typeof(v_evidence_ref -> 'locator_hash') is distinct from 'string'
            or length(btrim(v_evidence_ref ->> 'locator_hash')) not between 1 and 128) then
          raise exception 'VALIDATION_ERROR' using errcode = '22023';
        end if;

        foreach v_evidence_key in array array['line_index', 'start_ms', 'end_ms', 'frame_ts_ms'] loop
          if v_evidence_ref ? v_evidence_key
            and jsonb_typeof(v_evidence_ref -> v_evidence_key) <> 'null'
            and (jsonb_typeof(v_evidence_ref -> v_evidence_key) is distinct from 'number'
              or (v_evidence_ref ->> v_evidence_key)::numeric < 0
              or (v_evidence_ref ->> v_evidence_key)::numeric > 86400000
              or trunc((v_evidence_ref ->> v_evidence_key)::numeric) <> (v_evidence_ref ->> v_evidence_key)::numeric) then
            raise exception 'VALIDATION_ERROR' using errcode = '22023';
          end if;
        end loop;

        if v_evidence_ref ? 'start_ms' and v_evidence_ref ? 'end_ms'
          and jsonb_typeof(v_evidence_ref -> 'start_ms') <> 'null'
          and jsonb_typeof(v_evidence_ref -> 'end_ms') <> 'null'
          and (v_evidence_ref ->> 'end_ms')::numeric < (v_evidence_ref ->> 'start_ms')::numeric then
          raise exception 'VALIDATION_ERROR' using errcode = '22023';
        end if;
      end loop;

      if (v_quantity_state = 'explicit' and (
          v_amount_basis not in ('stated', 'spoken', 'onscreen')
          or not exists (
            select 1 from jsonb_array_elements(v_evidence_refs) evidence
            where (v_amount_basis = 'stated' and evidence ->> 'source_method' in ('description', 'comment'))
              or (v_amount_basis = 'spoken' and evidence ->> 'source_method' = 'caption')
              or (v_amount_basis = 'onscreen' and evidence ->> 'source_method' = 'visual'
                and evidence ->> 'source_provider' = 'macos-vision-ocr')
          )
        )) or (v_quantity_state = 'estimated' and (
          v_amount_basis not in ('visual-estimate', 'source-approximate', 'source-adjustable')
          or not exists (
            select 1 from jsonb_array_elements(v_evidence_refs) evidence
            where (v_amount_basis = 'visual-estimate' and evidence ->> 'source_method' = 'visual')
              or (v_amount_basis in ('source-approximate', 'source-adjustable')
                and (evidence ->> 'source_method' in ('description', 'comment', 'caption')
                  or (evidence ->> 'source_method' = 'visual'
                    and evidence ->> 'source_provider' = 'macos-vision-ocr')))
          )
        )) or (v_quantity_state in ('unknown', 'conflicting', 'to_taste') and v_amount_basis is not null) then
        raise exception 'VALIDATION_ERROR' using errcode = '22023';
      end if;
    end if;

    v_amount_text := nullif(btrim(regexp_replace(v_ingredient ->> 'amount', '[[:cntrl:][:space:]]+', ' ', 'g')), '');$metadata$;
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'YouTube trial quantity metadata source drifted' using errcode = '55000';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $display$    v_display_text := btrim(v_ingredient_name || ' ' || coalesce(v_amount_text, '') || coalesce(v_unit, ''));$display$;
  v_new := $quantity$    if v_has_quantity_metadata then
      if v_quantity_state in ('unknown', 'conflicting', 'to_taste') then
        if v_amount_text is not null or v_unit is not null then
          raise exception 'VALIDATION_ERROR' using errcode = '22023';
        end if;
        v_amount := null;
        v_unit := null;
      elsif v_quantity_state in ('explicit', 'estimated') then
        if v_amount is null or v_unit is null or jsonb_array_length(v_evidence_refs) = 0 then
          raise exception 'VALIDATION_ERROR' using errcode = '22023';
        end if;
      elsif v_quantity_state is not null then
        raise exception 'VALIDATION_ERROR' using errcode = '22023';
      end if;

      if v_quantity_state = 'to_taste' and not exists (
        select 1 from jsonb_array_elements(v_evidence_refs) evidence
        where evidence ->> 'source_method' in ('description', 'comment', 'caption')
          or (evidence ->> 'source_method' = 'visual'
            and evidence ->> 'source_provider' = 'macos-vision-ocr')
      ) then
        raise exception 'VALIDATION_ERROR' using errcode = '22023';
      end if;

      v_quantity_source := case
        when v_quantity_state = 'estimated' then 'recipe_inferred'
        when v_quantity_state in ('explicit', 'to_taste')
          and not exists (
            select 1 from jsonb_array_elements(v_evidence_refs) evidence
            where evidence ->> 'source_method' <> 'visual'
              or evidence ->> 'source_provider' = 'macos-vision-ocr'
          ) then 'visual_explicit'
        when v_quantity_state in ('explicit', 'to_taste') then 'text_explicit'
        else 'unknown'
      end;
      v_quantity_review_required := v_quantity_state in ('estimated', 'unknown', 'conflicting')
        or (v_quantity_state = 'explicit' and (v_amount is null or v_unit is null));
      v_quantity_raw_text := case
        when jsonb_array_length(v_evidence_refs) > 0 then v_evidence_refs -> 0 ->> 'snippet'
        else null
      end;
    else
      v_quantity_source := 'unknown';
      v_quantity_review_required := (v_amount is not null and v_unit is null)
        or (strpos(coalesce(v_amount_text, ''), '/') > 0 and v_amount is null);
      v_quantity_raw_text := btrim(v_ingredient_name || ' ' || coalesce(v_amount_text, '') || coalesce(v_unit, ''));
    end if;

    v_display_text := case
      when v_quantity_state in ('unknown', 'conflicting') then v_ingredient_name || ' 수량 미확인'
      when v_quantity_state = 'to_taste' then v_ingredient_name || ' 취향껏'
      when v_quantity_state = 'estimated' then btrim(v_ingredient_name || ' 약 ' || coalesce(v_amount_text, '') || coalesce(v_unit, ''))
      else btrim(v_ingredient_name || ' ' || coalesce(v_amount_text, '') || coalesce(v_unit, ''))
    end;$quantity$;
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'YouTube trial quantity state source drifted' using errcode = '55000';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $oldkind$'ingredient_type', case when v_amount is null then 'TO_TASTE' else 'QUANT' end,$oldkind$;
  v_new := $kind$'ingredient_type', case
        when v_quantity_state = 'to_taste' then 'TO_TASTE'
        when v_quantity_state is not null then 'QUANT'
        when v_amount is null then 'TO_TASTE'
        else 'QUANT'
      end,$kind$;
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'YouTube trial quantity kind source drifted' using errcode = '55000';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$      'quantity_source', 'unknown',
      'quantity_confidence', null,
      'quantity_raw_text', v_display_text,
      'quantity_evidence_refs', jsonb_build_array(),
      'quantity_review_required', (v_amount is not null and v_unit is null) or (strpos(coalesce(v_amount_text, ''), '/') > 0 and v_amount is null),
      'quantity_user_confirmed', false
    );$old$;
  v_new := $new$      'quantity_source', v_quantity_source,
      'quantity_confidence', case
        when v_quantity_source = 'recipe_inferred' then 0.65
        when v_quantity_source in ('text_explicit', 'visual_explicit') then 0.9
        else null
      end,
      'quantity_raw_text', coalesce(v_quantity_raw_text, v_display_text),
      'quantity_evidence_refs', case when v_has_quantity_metadata then v_evidence_refs else '[]'::jsonb end,
      'quantity_review_required', v_quantity_review_required,
      'quantity_user_confirmed', false
    );
    if v_has_quantity_metadata then
      v_ingredient_row := v_ingredient_row || jsonb_build_object(
        'original_name', v_original_name,
        'alternative_names', v_alternative_names,
        'amount_basis', v_amount_basis,
        'quantity_state', v_quantity_state,
        'raw_text', btrim(v_original_name || ' ' || coalesce(v_amount_text, '') || coalesce(v_unit, ''))
      );
    end if;$new$;
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'YouTube trial quantity draft source drifted' using errcode = '55000';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  execute v_definition;
end;
$quantity_bridge$;

reset role;
revoke create on schema public from youtube_extraction_worker_rpc_owner;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format('revoke youtube_extraction_worker_rpc_owner from %I granted by %I', current_user, current_user);
  else
    execute format('revoke youtube_extraction_worker_rpc_owner from %I', current_user);
  end if;
end;
$membership$;

commit;
