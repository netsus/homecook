begin;

drop function if exists public.read_recipe_image_projections(uuid[]);

create function public.read_recipe_image_projections(
  p_recipe_ids uuid[]
)
returns table (
  recipe_id uuid,
  legacy_thumbnail_url text,
  image_object_id uuid,
  bucket_id text,
  object_path text,
  owner_uuid uuid,
  account_generation bigint,
  visibility text,
  state text,
  reference_type text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_input_count bigint;
  v_distinct_count bigint;
begin
  if p_recipe_ids is null
    or cardinality(p_recipe_ids) not between 1 and 100
    or array_position(p_recipe_ids, null) is not null
  then
    raise exception using
      errcode = '22023',
      message = 'recipe image projection input is invalid';
  end if;

  select
    count(*),
    count(distinct input.recipe_id)
  into
    v_input_count,
    v_distinct_count
  from unnest(p_recipe_ids) as input(recipe_id);

  if v_input_count <> v_distinct_count then
    raise exception using
      errcode = '22023',
      message = 'recipe image projection input contains duplicate recipe IDs';
  end if;

  return query
  select
    input.recipe_id,
    recipe.thumbnail_url as legacy_thumbnail_url,
    reference.image_object_id,
    image_object.bucket_id,
    image_object.object_path,
    image_object.owner_uuid,
    image_object.account_generation,
    image_object.visibility,
    image_object.state,
    reference.reference_type
  from unnest(p_recipe_ids) with ordinality
    as input(recipe_id, ordinality)
  join public.recipes as recipe
    on recipe.id = input.recipe_id
  left join public.recipe_image_object_references as reference
    on reference.reference_type = 'recipe_thumbnail'
    and reference.consumer_id = input.recipe_id
  left join public.recipe_image_objects as image_object
    on image_object.id = reference.image_object_id
  order by input.ordinality;
end
$function$;

revoke all on function public.read_recipe_image_projections(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.read_recipe_image_projections(uuid[])
  to service_role;

drop function if exists public.read_recipe_book_image_projections(uuid[]);

create function public.read_recipe_book_image_projections(
  p_book_ids uuid[]
)
returns table (
  book_id uuid,
  legacy_cover_image_url text,
  image_object_id uuid,
  bucket_id text,
  object_path text,
  owner_uuid uuid,
  account_generation bigint,
  visibility text,
  state text,
  reference_type text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_input_count bigint;
  v_distinct_count bigint;
begin
  if p_book_ids is null
    or cardinality(p_book_ids) not between 1 and 100
    or array_position(p_book_ids, null) is not null
  then
    raise exception using
      errcode = '22023',
      message = 'recipe book image projection input is invalid';
  end if;

  select
    count(*),
    count(distinct input.book_id)
  into
    v_input_count,
    v_distinct_count
  from unnest(p_book_ids) as input(book_id);

  if v_input_count <> v_distinct_count then
    raise exception using
      errcode = '22023',
      message = 'recipe book image projection input contains duplicate book IDs';
  end if;

  return query
  select
    input.book_id,
    recipe_book.cover_image_url as legacy_cover_image_url,
    reference.image_object_id,
    image_object.bucket_id,
    image_object.object_path,
    image_object.owner_uuid,
    image_object.account_generation,
    image_object.visibility,
    image_object.state,
    reference.reference_type
  from unnest(p_book_ids) with ordinality
    as input(book_id, ordinality)
  join public.recipe_books as recipe_book
    on recipe_book.id = input.book_id
  left join public.recipe_image_object_references as reference
    on reference.reference_type = 'recipe_book_cover'
    and reference.consumer_id = input.book_id
  left join public.recipe_image_objects as image_object
    on image_object.id = reference.image_object_id
  order by input.ordinality;
end
$function$;

revoke all on function public.read_recipe_book_image_projections(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.read_recipe_book_image_projections(uuid[])
  to service_role;

commit;
