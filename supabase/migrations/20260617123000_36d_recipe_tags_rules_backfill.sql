update public.tags
   set slug = null,
       theme_eligible = false,
       updated_at = now()
 where normalized_key in (
   '15분컷',
   '혼밥',
   '도시락',
   '안주',
   '채식',
   '비건',
   '글루텐프리',
   '양식',
   '일식',
   '중식',
   '밥요리',
   '구이',
   '볶음요리'
 )
   and is_system = true;

insert into public.tags (normalized_key, label, slug, kind, is_system, theme_eligible)
values
  ('자취요리', '자취요리', 'self-cook', 'semantic', true, true),
  ('초보가능', '초보가능', 'beginner', 'semantic', true, true),
  ('밀프렙', '밀프렙', 'meal-prep', 'semantic', true, true),
  ('도시락반찬', '도시락반찬', 'lunchbox-side', 'semantic', true, true),
  ('냉털요리', '냉털요리', 'fridge-clear', 'semantic', true, true),
  ('아이반찬', '아이반찬', 'kid-side', 'semantic', true, true),
  ('술안주', '술안주', 'drinking-snack', 'semantic', true, true),
  ('캠핑요리', '캠핑요리', 'camping', 'semantic', true, true),
  ('10분컷', '10분컷', 'ten-minute', 'semantic', true, true),
  ('30분이내', '30분이내', 'thirty-minute', 'semantic', true, true),
  ('간단요리', '간단요리', 'easy', 'semantic', true, true),
  ('원팬요리', '원팬요리', 'one-pan', 'semantic', true, true),
  ('에어프라이어', '에어프라이어', 'air-fryer', 'semantic', true, true),
  ('전자레인지', '전자레인지', 'microwave', 'semantic', true, true),
  ('불없이', '불없이', 'no-heat', 'semantic', true, true),
  ('노오븐', '노오븐', 'no-oven', 'semantic', true, true),
  ('고단백', '고단백', 'high-protein', 'semantic', true, true),
  ('다이어트', '다이어트', 'diet', 'semantic', true, true),
  ('저당', '저당', 'low-sugar', 'semantic', true, true),
  ('저탄수', '저탄수', 'low-carb', 'semantic', true, true),
  ('채식한끼', '채식한끼', 'vegetarian-meal', 'semantic', true, true),
  ('발효한끼', '발효한끼', 'fermented-meal', 'semantic', true, true),
  ('한식', '한식', 'korean', 'semantic', true, true),
  ('국물요리', '국물요리', 'soup', 'semantic', true, true),
  ('밑반찬', '밑반찬', 'side-dish', 'semantic', true, true),
  ('디저트', '디저트', 'dessert', 'semantic', true, true),
  ('k디저트', 'K디저트', 'k-dessert', 'semantic', true, true),
  ('면요리', '면요리', 'noodles', 'semantic', true, true),
  ('분식', '분식', 'bunsik', 'semantic', true, true),
  ('샐러드', '샐러드', 'salad', 'semantic', true, true),
  ('한그릇요리', '한그릇요리', 'bowl-meal', 'semantic', true, true),
  ('해장요리', '해장요리', 'hangover', 'semantic', true, true),
  ('매콤', '매콤', 'spicy', 'semantic', true, true),
  ('바삭', '바삭', 'crispy', 'semantic', true, true),
  ('밥도둑', '밥도둑', 'rice-thief', 'semantic', true, true),
  ('유튜브레시피', '유튜브레시피', 'youtube-recipe', 'source', true, true)
on conflict (normalized_key) do update
set label = excluded.label,
    slug = excluded.slug,
    kind = excluded.kind,
    is_system = excluded.is_system,
    theme_eligible = excluded.theme_eligible,
    updated_at = now();

update public.tags
   set slug = null,
       theme_eligible = false,
       updated_at = now()
 where normalized_key in (
   '15분컷',
   '혼밥',
   '도시락',
   '안주',
   '채식',
   '비건',
   '글루텐프리',
   '양식',
   '일식',
   '중식',
   '밥요리',
   '구이',
   '볶음요리'
 )
   and is_system = true;

create or replace function public.reconcile_recipe_tag_usage_counts(
  p_dry_run boolean default true
)
returns table(
  tag_id uuid,
  normalized_key text,
  label text,
  before_count integer,
  after_count integer,
  would_update boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  create temporary table if not exists pg_temp.recipe_tag_usage_reconcile_report (
    tag_id uuid,
    normalized_key text,
    label text,
    before_count integer,
    after_count integer,
    would_update boolean
  ) on commit drop;

  truncate table pg_temp.recipe_tag_usage_reconcile_report;

  insert into pg_temp.recipe_tag_usage_reconcile_report (
    tag_id,
    normalized_key,
    label,
    before_count,
    after_count,
    would_update
  )
  select
    t.id,
    t.normalized_key,
    t.label,
    t.usage_count,
    count(rt.recipe_id)::integer,
    t.usage_count is distinct from count(rt.recipe_id)::integer
  from public.tags t
  left join public.recipe_tags rt
    on rt.tag_id = t.id
   and rt.visibility = 'public'
   and rt.review_status = 'approved'
  group by t.id, t.normalized_key, t.label, t.usage_count;

  if p_dry_run is false then
    update public.tags t
       set usage_count = report.after_count,
           updated_at = now()
      from pg_temp.recipe_tag_usage_reconcile_report report
     where report.tag_id = t.id
       and report.would_update = true;
  end if;

  return query
  select
    report.tag_id,
    report.normalized_key,
    report.label,
    report.before_count,
    report.after_count,
    report.would_update
  from pg_temp.recipe_tag_usage_reconcile_report report
  where report.would_update = true
  order by report.normalized_key asc;
end;
$$;

create or replace function public.dry_run_recipe_tag_projection_backfill(
  p_limit integer default 100
)
returns table(
  recipe_id uuid,
  current_tags text[],
  suggested_tags text[],
  reason_codes text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    coalesce(r.tags, '{}'::text[]) as current_tags,
    coalesce(r.tags, '{}'::text[]) as suggested_tags,
    array['legacy_projection_only']::text[] as reason_codes
  from public.recipes r
  where cardinality(coalesce(r.tags, '{}'::text[])) > 0
    and not exists (
      select 1
        from public.recipe_tags rt
       where rt.recipe_id = r.id
    )
  order by r.created_at asc, r.id asc
  limit least(greatest(coalesce(p_limit, 100), 1), 1000);
$$;

revoke execute on function public.reconcile_recipe_tag_usage_counts(boolean) from public;
revoke execute on function public.reconcile_recipe_tag_usage_counts(boolean) from anon;
revoke execute on function public.reconcile_recipe_tag_usage_counts(boolean) from authenticated;
grant execute on function public.reconcile_recipe_tag_usage_counts(boolean) to service_role;

revoke execute on function public.dry_run_recipe_tag_projection_backfill(integer) from public;
revoke execute on function public.dry_run_recipe_tag_projection_backfill(integer) from anon;
revoke execute on function public.dry_run_recipe_tag_projection_backfill(integer) from authenticated;
grant execute on function public.dry_run_recipe_tag_projection_backfill(integer) to service_role;
