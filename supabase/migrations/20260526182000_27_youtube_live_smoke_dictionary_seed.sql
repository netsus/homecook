-- Slice 27: evidence-based ingredient dictionary seed from live YouTube smoke.
-- DML-only, idempotent. Parser noise terms are intentionally excluded.

insert into public.ingredients (standard_name, category, default_unit)
values
  ('맛살', '해산물', null),
  ('부추', '채소', null),
  ('김', '기타', null),
  ('단무지', '채소', null),
  ('당면', '곡류', null),
  ('파프리카', '채소', null),
  ('표고버섯', '채소', null),
  ('시금치', '채소', null),
  ('사과', '기타', null)
on conflict (standard_name) do nothing;

insert into public.ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(v.synonym))
from (values
  ('햄', '김밥 햄'),
  ('소금', '맛소금'),
  ('간장', '진/양조간장'),
  ('식초', '양조 식초'),
  ('다진마늘', '간마늘'),
  ('맛살', '게맛살'),
  ('표고버섯', '표고 버섯')
) as v(standard_name, synonym)
join public.ingredients i on i.standard_name = v.standard_name
where trim(v.synonym) <> ''
on conflict (ingredient_id, synonym) do nothing;
