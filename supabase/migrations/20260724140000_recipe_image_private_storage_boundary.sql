begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'recipe-images-private',
  'recipe-images-private',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists recipe_images_private_select
  on storage.objects;
drop policy if exists recipe_images_private_insert
  on storage.objects;
drop policy if exists recipe_images_private_update
  on storage.objects;
drop policy if exists recipe_images_private_delete
  on storage.objects;

do $remove_private_recipe_image_browser_policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%recipe-images-private%'
        or coalesce(with_check, '') ilike '%recipe-images-private%'
      )
  loop
    execute format(
      'drop policy %I on storage.objects',
      v_policy.policyname
    );
  end loop;
end;
$remove_private_recipe_image_browser_policies$;

commit;
