-- Slice 28: reviewed external ingredient seed promotion.
-- DML-only, idempotent. Existing ingredients are intentionally not
-- overwritten because their category/default_unit may have been curated
-- by earlier dictionary seeds.

insert into public.ingredients (standard_name, category, default_unit)
values
  ('귀리', '곡류', null),
  ('기장', '곡류', null),
  ('강낭콩', '곡류', null),
  ('녹두', '곡류', null),
  ('도토리', '곡류', null),
  ('도토리묵', '곡류', null),
  ('가지', '채소', null),
  ('다랑어', '해산물', null),
  ('고등어', '해산물', null),
  ('고추기름', '양념', null),
  ('땅콩 버터', '양념', null),
  ('겨자', '양념', null)
on conflict (standard_name) do nothing;
