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

insert into public.ingredients (id, standard_name, category, default_unit)
values
  ('550e8400-e29b-41d4-a716-446655440010', '양파', '채소', '개'),
  ('550e8400-e29b-41d4-a716-446655440011', '대파', '채소', '대'),
  ('550e8400-e29b-41d4-a716-446655440012', '소고기', '육류', 'g'),
  ('550e8400-e29b-41d4-a716-446655440013', '김치', '기타', 'g'),
  ('550e8400-e29b-41d4-a716-446655440014', '돼지고기', '육류', 'g'),
  ('550e8400-e29b-41d4-a716-446655440015', '소금', '양념', null)
on conflict (id) do update set
  standard_name = excluded.standard_name,
  category = excluded.category,
  default_unit = excluded.default_unit;

insert into public.ingredient_synonyms (id, ingredient_id, synonym)
values
  ('550e8400-e29b-41d4-a716-446655440110', '550e8400-e29b-41d4-a716-446655440011', '파')
on conflict (ingredient_id, synonym) do nothing;

insert into public.ingredient_bundles (id, name, display_order)
values
  ('660e8400-e29b-41d4-a716-446655440501', '조미료 모음', 1),
  ('660e8400-e29b-41d4-a716-446655440502', '김치찌개 모음', 2)
on conflict (id) do update set
  name = excluded.name,
  display_order = excluded.display_order;

insert into public.ingredient_bundle_items (id, bundle_id, ingredient_id)
values
  (
    '660e8400-e29b-41d4-a716-446655440511',
    '660e8400-e29b-41d4-a716-446655440501',
    '550e8400-e29b-41d4-a716-446655440015'
  ),
  (
    '660e8400-e29b-41d4-a716-446655440521',
    '660e8400-e29b-41d4-a716-446655440502',
    '550e8400-e29b-41d4-a716-446655440013'
  ),
  (
    '660e8400-e29b-41d4-a716-446655440522',
    '660e8400-e29b-41d4-a716-446655440502',
    '550e8400-e29b-41d4-a716-446655440014'
  ),
  (
    '660e8400-e29b-41d4-a716-446655440523',
    '660e8400-e29b-41d4-a716-446655440502',
    '550e8400-e29b-41d4-a716-446655440010'
  ),
  (
    '660e8400-e29b-41d4-a716-446655440524',
    '660e8400-e29b-41d4-a716-446655440502',
    '550e8400-e29b-41d4-a716-446655440011'
  )
on conflict (bundle_id, ingredient_id) do nothing;
