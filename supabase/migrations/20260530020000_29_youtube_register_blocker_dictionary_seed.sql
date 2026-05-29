-- Slice 29 follow-up: seed common ingredients that blocked real YouTube registration.
-- DML-only and idempotent. Existing curated ingredients are not overwritten.

insert into public.ingredients (standard_name, category, default_unit)
values
  ('중력분', '곡류', null),
  ('허브솔트', '양념', null),
  ('배', '기타', null)
on conflict (standard_name) do nothing;
