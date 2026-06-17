alter table public.tags
  add column if not exists slug text;

alter table public.tags
  drop constraint if exists tags_kind_check;

alter table public.tags
  add constraint tags_kind_check
  check (kind in ('semantic', 'ingredient', 'method', 'source', 'user'));

create unique index if not exists tags_slug_unique_idx
  on public.tags (slug)
  where slug is not null;

insert into public.tags (normalized_key, label, slug, kind, is_system, theme_eligible)
values
  ('자취요리', '자취요리', 'self-cook', 'semantic', true, true),
  ('초보가능', '초보가능', 'beginner', 'semantic', true, true),
  ('원팬요리', '원팬요리', 'one-pan', 'semantic', true, true),
  ('에어프라이어', '에어프라이어', 'air-fryer', 'semantic', true, true),
  ('전자레인지', '전자레인지', 'microwave', 'semantic', true, true),
  ('밀프렙', '밀프렙', 'meal-prep', 'semantic', true, true),
  ('고단백', '고단백', 'high-protein', 'semantic', true, true),
  ('다이어트', '다이어트', 'diet', 'semantic', true, true),
  ('저당', '저당', 'low-sugar', 'semantic', true, true),
  ('한식', '한식', 'korean', 'semantic', true, true),
  ('국물요리', '국물요리', 'soup', 'semantic', true, true),
  ('밑반찬', '밑반찬', 'side-dish', 'semantic', true, true),
  ('디저트', '디저트', 'dessert', 'semantic', true, true),
  ('매콤', '매콤', 'spicy', 'semantic', true, true),
  ('바삭', '바삭', 'crispy', 'semantic', true, true),
  ('간단요리', '간단요리', 'easy', 'semantic', true, true),
  ('15분컷', '15분컷', 'fifteen-minute', 'semantic', true, true),
  ('혼밥', '혼밥', 'solo-meal', 'semantic', true, true),
  ('도시락', '도시락', 'lunchbox', 'semantic', true, true),
  ('냉털요리', '냉털요리', 'fridge-clear', 'semantic', true, true),
  ('해장요리', '해장요리', 'hangover', 'semantic', true, true),
  ('안주', '안주', 'drinking-snack', 'semantic', true, true),
  ('아이반찬', '아이반찬', 'kid-side', 'semantic', true, true),
  ('채식', '채식', 'vegetarian', 'semantic', true, true),
  ('비건', '비건', 'vegan', 'semantic', true, true),
  ('저탄수', '저탄수', 'low-carb', 'semantic', true, true),
  ('글루텐프리', '글루텐프리', 'gluten-free', 'semantic', true, true),
  ('양식', '양식', 'western', 'semantic', true, true),
  ('일식', '일식', 'japanese', 'semantic', true, true),
  ('중식', '중식', 'chinese', 'semantic', true, true),
  ('분식', '분식', 'bunsik', 'semantic', true, true),
  ('면요리', '면요리', 'noodles', 'semantic', true, true),
  ('밥요리', '밥요리', 'rice-meal', 'semantic', true, true),
  ('구이', '구이', 'grilled', 'semantic', true, true),
  ('볶음요리', '볶음요리', 'stir-fry', 'semantic', true, true),
  ('유튜브레시피', '유튜브레시피', 'youtube-recipe', 'source', true, true)
on conflict (normalized_key) do update
set label = excluded.label,
    slug = excluded.slug,
    kind = excluded.kind,
    is_system = excluded.is_system,
    theme_eligible = excluded.theme_eligible,
    updated_at = now();

drop policy if exists tags_public_read on public.tags;
create policy tags_public_read
  on public.tags
  for select
  to anon, authenticated
  using (is_system = true or usage_count > 0);

drop policy if exists recipe_tags_public_approved_read on public.recipe_tags;
create policy recipe_tags_public_approved_read
  on public.recipe_tags
  for select
  to anon, authenticated
  using (visibility = 'public' and review_status = 'approved');

grant select on public.tags to anon, authenticated;
grant select on public.recipe_tags to anon, authenticated;

create or replace function public.find_recipe_ids_by_public_tags(
  p_q text default null,
  p_tag text default null
)
returns table(recipe_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct rt.recipe_id
    from public.recipe_tags rt
    join public.tags t on t.id = rt.tag_id
   where rt.visibility = 'public'
     and rt.review_status = 'approved'
     and (p_tag is null or t.normalized_key = p_tag)
     and (
       p_q is null
       or t.label ilike '%' || p_q || '%'
       or t.normalized_key ilike '%' || p_q || '%'
     );
$$;

create or replace function public.list_public_recipe_tags(
  p_q text default null,
  p_kind text default null,
  p_theme_eligible boolean default null,
  p_limit integer default 30
)
returns table(
  normalized_key text,
  label text,
  slug text,
  kind text,
  is_system boolean,
  theme_eligible boolean,
  usage_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.normalized_key,
    t.label,
    t.slug,
    t.kind,
    t.is_system,
    t.theme_eligible,
    t.usage_count
  from public.tags t
  where (t.is_system = true or t.usage_count > 0)
    and (p_q is null or t.label ilike '%' || p_q || '%' or t.normalized_key ilike '%' || p_q || '%')
    and (p_kind is null or t.kind = p_kind)
    and (p_theme_eligible is null or t.theme_eligible = p_theme_eligible)
    and (
      p_theme_eligible is distinct from true
      or (t.is_system = true and t.kind in ('semantic', 'source'))
    )
  order by t.theme_eligible desc, t.usage_count desc, t.label asc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.list_home_theme_recipes(
  p_tag_limit integer default 8,
  p_recipes_per_tag integer default 10
)
returns table(
  tag_normalized_key text,
  tag_label text,
  tag_slug text,
  theme_rank integer,
  recipe_rank integer,
  id uuid,
  title varchar(200),
  thumbnail_url text,
  tags text[],
  base_servings integer,
  view_count integer,
  like_count integer,
  save_count integer,
  source_type public.recipe_source_type
)
language sql
stable
security definer
set search_path = public
as $$
  with seed_tags as (
    select
      t.id,
      t.normalized_key,
      t.label,
      t.slug,
      row_number() over (
        order by t.usage_count desc, t.label asc, t.normalized_key asc
      )::integer as theme_rank
    from public.tags t
    where t.is_system = true
      and t.theme_eligible = true
      and t.kind in ('semantic', 'source')
      and exists (
        select 1
          from public.recipe_tags rt
         where rt.tag_id = t.id
           and rt.visibility = 'public'
           and rt.review_status = 'approved'
      )
    order by t.usage_count desc, t.label asc, t.normalized_key asc
    limit least(greatest(coalesce(p_tag_limit, 8), 1), 12)
  ),
  ranked_recipes as (
    select
      st.normalized_key as tag_normalized_key,
      st.label as tag_label,
      st.slug as tag_slug,
      st.theme_rank,
      row_number() over (
        partition by st.id
        order by r.view_count desc, r.id asc
      )::integer as recipe_rank,
      r.id,
      r.title,
      r.thumbnail_url,
      r.tags,
      r.base_servings,
      r.view_count,
      r.like_count,
      r.save_count,
      r.source_type
    from seed_tags st
    join public.recipe_tags rt on rt.tag_id = st.id
    join public.recipes r on r.id = rt.recipe_id
    where rt.visibility = 'public'
      and rt.review_status = 'approved'
  )
  select
    ranked_recipes.tag_normalized_key,
    ranked_recipes.tag_label,
    ranked_recipes.tag_slug,
    ranked_recipes.theme_rank,
    ranked_recipes.recipe_rank,
    ranked_recipes.id,
    ranked_recipes.title,
    ranked_recipes.thumbnail_url,
    ranked_recipes.tags,
    ranked_recipes.base_servings,
    ranked_recipes.view_count,
    ranked_recipes.like_count,
    ranked_recipes.save_count,
    ranked_recipes.source_type
  from ranked_recipes
  where ranked_recipes.recipe_rank <= least(greatest(coalesce(p_recipes_per_tag, 10), 1), 10)
  order by ranked_recipes.theme_rank asc, ranked_recipes.recipe_rank asc;
$$;

grant execute on function public.find_recipe_ids_by_public_tags(text, text)
  to anon, authenticated, service_role;
grant execute on function public.list_public_recipe_tags(text, text, boolean, integer)
  to anon, authenticated, service_role;
grant execute on function public.list_home_theme_recipes(integer, integer)
  to anon, authenticated, service_role;
