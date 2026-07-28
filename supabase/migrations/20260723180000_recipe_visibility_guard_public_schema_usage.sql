begin;

grant usage on schema public
  to homecook_recipe_visibility_guard_owner;
revoke create on schema public
  from homecook_recipe_visibility_guard_owner;

do $guard_public_schema_privileges$
begin
  if not pg_catalog.has_schema_privilege(
    'homecook_recipe_visibility_guard_owner',
    'public',
    'USAGE'
  ) then
    raise exception 'recipe visibility guard owner lacks public schema usage'
      using errcode = '42501';
  end if;

  if pg_catalog.has_schema_privilege(
    'homecook_recipe_visibility_guard_owner',
    'public',
    'CREATE'
  ) then
    raise exception 'recipe visibility guard owner retained public schema create'
      using errcode = '42501';
  end if;
end;
$guard_public_schema_privileges$;

commit;
