begin;

do $hosted_search_compatibility$
declare
  v_definition text;
  v_threshold_config text :=
    'SET "pg_trgm.word_similarity_threshold" TO ''0.3''';
  v_declaration_needle text := E'  v_result jsonb;\n';
  v_declaration_replacement text :=
    E'  v_result jsonb;\n'
    || E'  v_query_bigrams text[];\n';
  v_actor_assertion_needle text :=
    E'  perform public.assert_food_product_actor(p_actor_id);\n';
  v_actor_assertion_replacement text :=
    E'  perform public.assert_food_product_actor(p_actor_id);\n\n'
    || E'  select coalesce(\n'
    || E'    array_agg(distinct substr(\n'
    || E'      v_compact_query,\n'
    || E'      bigram_position.start_at,\n'
    || E'      2\n'
    || E'    )),\n'
    || E'    array[]::text[]\n'
    || E'  )\n'
    || E'  into v_query_bigrams\n'
    || E'  from generate_series(\n'
    || E'    1,\n'
    || E'    greatest(0, char_length(v_compact_query) - 1)\n'
    || E'  ) bigram_position(start_at);\n';
  v_ingredient_word_match text :=
    E'\n            or v_compact_query '
    || E'<% public.normalize_food_search_text(\n'
    || E'              ingredient.standard_name::text,\n'
    || E'              true\n'
    || E'            )';
  v_ingredient_word_match_replacement text :=
    E'\n            or (\n'
    || E'              public.food_search_short_ngrams(\n'
    || E'                ingredient.standard_name::text\n'
    || E'              ) && v_query_bigrams\n'
    || E'              and public.word_similarity(\n'
    || E'                v_compact_query,\n'
    || E'                public.normalize_food_search_text(\n'
    || E'                  ingredient.standard_name::text,\n'
    || E'                  true\n'
    || E'                )\n'
    || E'              ) > 0.3\n'
    || E'            )';
  v_product_word_match text :=
    E'\n            or v_compact_query '
    || E'<% public.normalize_food_search_text(\n'
    || E'              coalesce(product.brand::text || '' '', '''') '
    || E'|| product.name::text,\n'
    || E'              true\n'
    || E'            )';
  v_product_word_match_replacement text :=
    E'\n            or (\n'
    || E'              public.food_search_short_ngrams(\n'
    || E'                coalesce(product.brand::text || '' '', '''') '
    || E'|| product.name::text\n'
    || E'              ) && v_query_bigrams\n'
    || E'              and public.word_similarity(\n'
    || E'                v_compact_query,\n'
    || E'                public.normalize_food_search_text(\n'
    || E'                  coalesce(product.brand::text || '' '', '''') '
    || E'|| product.name::text,\n'
    || E'                  true\n'
    || E'                )\n'
    || E'              ) > 0.3\n'
    || E'            )';
  v_threshold_config_count integer;
  v_ingredient_word_match_count integer;
  v_product_word_match_count integer;
  v_explicit_word_match_count integer;
begin
  select pg_get_functiondef(
    'public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)'
      ::regprocedure
  )
  into v_definition;

  v_threshold_config_count := (
    length(v_definition)
      - length(replace(v_definition, v_threshold_config, ''))
  ) / length(v_threshold_config);
  v_ingredient_word_match_count := (
    length(v_definition)
      - length(replace(v_definition, v_ingredient_word_match, ''))
  ) / length(v_ingredient_word_match);
  v_product_word_match_count := (
    length(v_definition)
      - length(replace(v_definition, v_product_word_match, ''))
  ) / length(v_product_word_match);
  v_explicit_word_match_count := (
    length(v_definition)
      - length(replace(v_definition, 'public.word_similarity(', ''))
  ) / length('public.word_similarity(');

  if (
    v_threshold_config_count = 1
    and v_ingredient_word_match_count = 1
    and v_product_word_match_count = 2
    and v_explicit_word_match_count = 0
  ) then
    if (
      length(v_definition)
        - length(replace(v_definition, v_declaration_needle, ''))
    ) / length(v_declaration_needle) <> 1 then
      raise exception 'HOSTED_SEARCH_DECLARATION_ANCHOR_MISMATCH';
    end if;
    if (
      length(v_definition)
        - length(replace(v_definition, v_actor_assertion_needle, ''))
    ) / length(v_actor_assertion_needle) <> 1 then
      raise exception 'HOSTED_SEARCH_ACTOR_ASSERTION_ANCHOR_MISMATCH';
    end if;

    v_definition := replace(
      v_definition,
      v_declaration_needle,
      v_declaration_replacement
    );
    v_definition := replace(
      v_definition,
      v_actor_assertion_needle,
      v_actor_assertion_replacement
    );
    v_definition := replace(
      v_definition,
      v_ingredient_word_match,
      v_ingredient_word_match_replacement
    );
    v_definition := replace(
      v_definition,
      v_product_word_match,
      v_product_word_match_replacement
    );
    v_definition := replace(
      v_definition,
      E' ' || v_threshold_config || E'\n',
      ''
    );
    execute v_definition;
  elsif (
    v_threshold_config_count = 0
    and v_ingredient_word_match_count = 0
    and v_product_word_match_count = 0
    and v_explicit_word_match_count = 3
  ) then
    null;
  elsif v_ingredient_word_match_count not in (0, 1) then
    raise exception 'HOSTED_SEARCH_INGREDIENT_WORD_MATCH_ANCHOR_MISMATCH';
  elsif v_product_word_match_count not in (0, 2) then
    raise exception 'HOSTED_SEARCH_PRODUCT_WORD_MATCH_ANCHOR_MISMATCH';
  else
    raise exception 'HOSTED_SEARCH_THRESHOLD_CONFIG_ANCHOR_MISMATCH';
  end if;

  select pg_get_functiondef(
    'public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)'
      ::regprocedure
  )
  into v_definition;
  v_explicit_word_match_count := (
    length(v_definition)
      - length(replace(v_definition, 'public.word_similarity(', ''))
  ) / length('public.word_similarity(');

  if position('pg_trgm.word_similarity_threshold' in v_definition) > 0
    or position(' <%' in v_definition) > 0
    or v_explicit_word_match_count <> 3
    or position('v_query_bigrams' in v_definition) = 0
  then
    raise exception 'HOSTED_SEARCH_COMPATIBILITY_POSTCONDITION_FAILED';
  end if;
end
$hosted_search_compatibility$;

commit;
