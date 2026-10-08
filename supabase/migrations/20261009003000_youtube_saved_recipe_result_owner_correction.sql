begin;

do $authority$
declare
  v_private_owner text;
begin
  select pg_get_userbyid(c.relowner) into v_private_owner
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname='youtube_saved_recipe_result_mutations' and c.relkind='r';

  if v_private_owner not in ('postgres','supabase_admin') then
    raise exception 'unexpected saved-result mutation table owner: %', v_private_owner;
  end if;
end;
$authority$;

-- The write RPC is a SECURITY DEFINER function owned by postgres. Keep its
-- private idempotency table under that same authority regardless of which
-- reviewed deployment role created the table. The public result table already
-- has the reviewed postgres DML grant and is deliberately left unchanged.
alter table private.youtube_saved_recipe_result_mutations owner to postgres;

revoke all on table private.youtube_saved_recipe_result_mutations
  from public, anon, authenticated, service_role;

do $verify$
begin
  if (select pg_get_userbyid(c.relowner) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='private' and c.relname='youtube_saved_recipe_result_mutations') <> 'postgres' then
    raise exception 'saved-result table owner correction failed';
  end if;

  if has_table_privilege('anon','private.youtube_saved_recipe_result_mutations','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','private.youtube_saved_recipe_result_mutations','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role','private.youtube_saved_recipe_result_mutations','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'saved-result backing table direct privilege boundary changed';
  end if;
end;
$verify$;

commit;
