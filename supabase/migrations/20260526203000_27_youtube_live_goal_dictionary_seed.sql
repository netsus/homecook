-- Slice 27 goal-mode: additional reviewed dictionary seeds from the balanced
-- 30 URL live YouTube smoke after parser hardening.
-- DML-only, idempotent. Dish names and parser-noise names are intentionally excluded.

insert into public.ingredients (standard_name, category, default_unit)
values
  ('감미료', '양념', null),
  ('닭다리살', '육류', null),
  ('들기름', '양념', null),
  ('마늘쫑', '채소', null),
  ('매실청', '양념', null),
  ('밀가루', '곡류', null),
  ('바닐라익스트랙', '양념', null),
  ('베이킹파우더', '양념', null),
  ('새우', '해산물', null),
  ('숙주나물', '채소', null),
  ('슈가파우더', '양념', null),
  ('알배추', '채소', null),
  ('액젓', '양념', null),
  ('원당', '양념', null),
  ('육수', '기타', null),
  ('쪽파', '채소', null),
  ('초콜릿', '기타', null),
  ('코코아 파우더', '양념', null),
  ('팽이버섯', '채소', null),
  ('홍고추', '채소', null),
  ('황태채', '해산물', null)
on conflict (standard_name) do nothing;

insert into public.ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(v.synonym))
from (values
  ('간장', '맛간장'),
  ('김', '생김'),
  ('매실청', '매실액'),
  ('맛살', '크래미'),
  ('식용유', '기름'),
  ('액젓', '까나리 액젓'),
  ('액젓', '까나리액젓'),
  ('액젓', '멸치액젓'),
  ('육수', '멸치다시마 육수'),
  ('육수', '멸치다시마육수'),
  ('초콜릿', '다크초콜릿'),
  ('초콜릿', '다크 초콜릿'),
  ('초콜릿', '밀크 초콜릿'),
  ('코코아 파우더', '코코아파우더'),
  ('바닐라익스트랙', '바닐라 익스트랙')
) as v(standard_name, synonym)
join public.ingredients i on i.standard_name = v.standard_name
where trim(v.synonym) <> ''
on conflict (ingredient_id, synonym) do nothing;
