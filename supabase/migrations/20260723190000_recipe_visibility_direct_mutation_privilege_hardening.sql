begin;

revoke insert, update, delete, truncate, references, trigger
  on table
    public.recipes,
    public.recipe_sources,
    public.recipe_ingredients,
    public.recipe_steps,
    public.recipe_step_cooking_methods,
    public.recipe_tags,
    public.tags
  from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.recipe_tags
  from service_role;

do $privilege_hardening$
declare
  relation_name text;
  qualified_name text;
  column_names text;
  grantees text;
begin
  foreach relation_name in array array[
    'public.recipes',
    'public.recipe_sources',
    'public.recipe_ingredients',
    'public.recipe_steps',
    'public.recipe_step_cooking_methods',
    'public.recipe_tags',
    'public.tags'
  ]
  loop
    select
      format('%I.%I', namespace.nspname, relation.relname),
      string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum)
      into qualified_name, column_names
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = relation.oid
     and attribute.attnum > 0
     and not attribute.attisdropped
    where relation.oid = relation_name::pg_catalog.regclass
    group by namespace.nspname, relation.relname;

    grantees := case
      when relation_name = 'public.recipe_tags'
        then 'anon, authenticated, service_role'
      else 'anon, authenticated'
    end;

    execute format(
      'revoke insert (%1$s), update (%1$s), references (%1$s) on table %2$s from %3$s',
      column_names,
      qualified_name,
      grantees
    );
  end loop;
end;
$privilege_hardening$;

grant select on table
  public.recipes,
  public.recipe_sources,
  public.recipe_ingredients,
  public.recipe_steps,
  public.recipe_step_cooking_methods,
  public.recipe_tags
to anon, authenticated;

revoke select on table public.tags from anon, authenticated;
grant select (
  id,
  normalized_key,
  label,
  slug,
  kind,
  is_system,
  theme_eligible
) on table public.tags to anon, authenticated;

do $assert_privilege_hardening$
declare
  relation_name text;
  grantee_name text;
  privilege_name text;
  tag_column_name text;
begin
  foreach grantee_name in array array['anon', 'authenticated']
  loop
    foreach relation_name in array array[
      'public.recipes',
      'public.recipe_sources',
      'public.recipe_ingredients',
      'public.recipe_steps',
      'public.recipe_step_cooking_methods',
      'public.recipe_tags',
      'public.tags'
    ]
    loop
      foreach privilege_name in array array[
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      ]
      loop
        if pg_catalog.has_table_privilege(
          grantee_name,
          relation_name,
          privilege_name
        ) then
          raise exception
            'Direct table mutation privilege remains: role=%, relation=%, privilege=%',
            grantee_name,
            relation_name,
            privilege_name;
        end if;
      end loop;

      foreach privilege_name in array array['INSERT', 'UPDATE', 'REFERENCES']
      loop
        if pg_catalog.has_any_column_privilege(
          grantee_name,
          relation_name,
          privilege_name
        ) then
          raise exception
            'Direct column mutation privilege remains: role=%, relation=%, privilege=%',
            grantee_name,
            relation_name,
            privilege_name;
        end if;
      end loop;
    end loop;

    foreach relation_name in array array[
      'public.recipes',
      'public.recipe_sources',
      'public.recipe_ingredients',
      'public.recipe_steps',
      'public.recipe_step_cooking_methods',
      'public.recipe_tags'
    ]
    loop
      if not pg_catalog.has_table_privilege(
        grantee_name,
        relation_name,
        'SELECT'
      ) then
        raise exception
          'Required table read privilege is missing: role=%, relation=%',
          grantee_name,
          relation_name;
      end if;
    end loop;

    foreach tag_column_name in array array[
      'id',
      'normalized_key',
      'label',
      'slug',
      'kind',
      'is_system',
      'theme_eligible'
    ]
    loop
      if not pg_catalog.has_column_privilege(
        grantee_name,
        'public.tags',
        tag_column_name,
        'SELECT'
      ) then
        raise exception
          'Required tag projection is missing: role=%, column=%',
          grantee_name,
          tag_column_name;
      end if;
    end loop;
  end loop;

  foreach privilege_name in array array[
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER'
  ]
  loop
    if pg_catalog.has_table_privilege(
      'service_role',
      'public.recipe_tags',
      privilege_name
    ) then
      raise exception
        'Service role recipe_tags mutation privilege remains: privilege=%',
        privilege_name;
    end if;
  end loop;

  foreach privilege_name in array array['INSERT', 'UPDATE', 'REFERENCES']
  loop
    if pg_catalog.has_any_column_privilege(
      'service_role',
      'public.recipe_tags',
      privilege_name
    ) then
      raise exception
        'Service role recipe_tags column mutation privilege remains: privilege=%',
        privilege_name;
    end if;
  end loop;
end;
$assert_privilege_hardening$;

commit;
