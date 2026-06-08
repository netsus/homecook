-- Seed data for local development
-- Reproducible local demo dataset for slices 01-05:
--   pnpm local:reset:demo
--   pnpm local:seed:demo
--
-- Local DB smoke data for slices 01-05 is seeded with:
--   pnpm qa:seed:01-05 -- --user-id <supabase-user-uuid>
--
-- The repo now carries the baseline schema required for slices 01-05, but the
-- richer smoke dataset still lives in the service-role seeder script so a
-- tester can target a specific authenticated user account on demand.

insert into public.ingredients (id, standard_name, category, category_code, default_unit)
values
  ('550e8400-e29b-41d4-a716-446655440010', '양파', '채소', 'root_stem', '개'),
  ('550e8400-e29b-41d4-a716-446655440011', '대파', '채소', 'root_stem', '대'),
  ('550e8400-e29b-41d4-a716-446655440012', '소고기', '육류', 'pork_beef_lamb', 'g'),
  ('550e8400-e29b-41d4-a716-446655440013', '김치', '기타', 'kimchi_pickle_can', 'g'),
  ('550e8400-e29b-41d4-a716-446655440014', '돼지고기', '육류', 'pork_beef_lamb', 'g'),
  ('550e8400-e29b-41d4-a716-446655440015', '소금', '양념', 'spice_herb', null)
on conflict (standard_name) do update set
  category = excluded.category,
  category_code = excluded.category_code,
  default_unit = excluded.default_unit;

insert into public.ingredient_synonyms (id, ingredient_id, synonym)
select '550e8400-e29b-41d4-a716-446655440110', ingredients.id, '파'
from public.ingredients
where ingredients.standard_name = '대파'
on conflict (ingredient_id, synonym) do nothing;

insert into public.ingredient_bundles (id, name, display_order)
values
  ('660e8400-e29b-41d4-a716-446655440501', '조미료 모음', 1),
  ('660e8400-e29b-41d4-a716-446655440502', '김치찌개 모음', 2)
on conflict (id) do update set
  name = excluded.name,
  display_order = excluded.display_order;

with seed_bundle_items (id, bundle_id, standard_name) as (
  values
    (
      '660e8400-e29b-41d4-a716-446655440511'::uuid,
      '660e8400-e29b-41d4-a716-446655440501'::uuid,
      '소금'
    ),
    (
      '660e8400-e29b-41d4-a716-446655440521'::uuid,
      '660e8400-e29b-41d4-a716-446655440502'::uuid,
      '김치'
    ),
    (
      '660e8400-e29b-41d4-a716-446655440522'::uuid,
      '660e8400-e29b-41d4-a716-446655440502'::uuid,
      '돼지고기'
    ),
    (
      '660e8400-e29b-41d4-a716-446655440523'::uuid,
      '660e8400-e29b-41d4-a716-446655440502'::uuid,
      '양파'
    ),
    (
      '660e8400-e29b-41d4-a716-446655440524'::uuid,
      '660e8400-e29b-41d4-a716-446655440502'::uuid,
      '대파'
    )
)
insert into public.ingredient_bundle_items (id, bundle_id, ingredient_id)
select seed_bundle_items.id, seed_bundle_items.bundle_id, ingredients.id
from seed_bundle_items
join public.ingredients
  on ingredients.standard_name = seed_bundle_items.standard_name
on conflict (bundle_id, ingredient_id) do nothing;
