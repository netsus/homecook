alter table public.recipe_books
  add column if not exists cover_color_key varchar(20),
  add column if not exists cover_image_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recipe_books_cover_color_key_check'
  ) then
    alter table public.recipe_books
      add constraint recipe_books_cover_color_key_check
      check (
        cover_color_key is null
        or cover_color_key in ('sage', 'sky', 'coral', 'lavender', 'sand')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recipe_books_cover_image_url_length_check'
  ) then
    alter table public.recipe_books
      add constraint recipe_books_cover_image_url_length_check
      check (cover_image_url is null or char_length(cover_image_url) <= 2048);
  end if;
end $$;

update public.recipe_books
set cover_color_key = case book_type
  when 'my_added' then 'lavender'
  when 'saved' then 'sky'
  when 'liked' then 'coral'
  when 'custom' then (
    case mod(greatest(sort_order, 0), 5)
      when 0 then 'sage'
      when 1 then 'sky'
      when 2 then 'coral'
      when 3 then 'lavender'
      else 'sand'
    end
  )
  else cover_color_key
end
where cover_color_key is null;
