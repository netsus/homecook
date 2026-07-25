create or replace function public.normalize_food_search_text(
  p_value text,
  p_compact boolean default false
)
returns text
language sql
immutable
parallel safe
returns null on null input
set search_path = pg_catalog, pg_temp
as $$
  with normalized as (
    select lower(
      regexp_replace(normalize(p_value, NFKC), '[[:space:]]+', ' ', 'g')
    ) as value
  )
  select case
    when p_compact
      then regexp_replace(value, '[[:space:][:punct:]]+', '', 'g')
    else btrim(value)
  end
  from normalized
$$;

revoke all on function public.normalize_food_search_text(text, boolean)
  from public, anon, authenticated, service_role;
