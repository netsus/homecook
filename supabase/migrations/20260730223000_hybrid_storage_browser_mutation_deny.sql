begin;

drop policy if exists recipe_images_insert_own
  on storage.objects;
drop policy if exists recipe_images_update_own
  on storage.objects;
drop policy if exists recipe_images_delete_own
  on storage.objects;

do $remove_recipe_image_browser_mutation_policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (
        coalesce(qual, '') ilike '%recipe-images%'
        or coalesce(qual, '') ilike '%recipe-images-private%'
        or coalesce(with_check, '') ilike '%recipe-images%'
        or coalesce(with_check, '') ilike '%recipe-images-private%'
      )
  loop
    execute format(
      'drop policy %I on storage.objects',
      v_policy.policyname
    );
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (
        coalesce(qual, '') ilike '%recipe-images%'
        or coalesce(qual, '') ilike '%recipe-images-private%'
        or coalesce(with_check, '') ilike '%recipe-images%'
        or coalesce(with_check, '') ilike '%recipe-images-private%'
      )
  ) then
    raise exception
      'recipe image browser Storage mutation policies must be absent';
  end if;
end;
$remove_recipe_image_browser_mutation_policies$;

commit;
