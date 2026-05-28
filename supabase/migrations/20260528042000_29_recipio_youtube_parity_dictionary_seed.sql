-- Recipio YouTube parity follow-up: resolve ingredients observed while
-- comparing three live Recipio imports. DML-only and idempotent.

insert into public.ingredients (standard_name, category, default_unit)
values
  ('계란', '기타', '개'),
  ('토마토 소스', '양념', null),
  ('모짜렐라 치즈', '유제품', null),
  ('파슬리 가루', '양념', null),
  ('스팸', '육류', null),
  ('즉석밥 작은 거', '곡류', null),
  ('체다치즈', '유제품', null),
  ('김', '기타', null),
  ('미원', '양념', null),
  ('잿방어', '해산물', null),
  ('초밥용 밥', '곡류', null),
  ('강력분', '곡류', 'g'),
  ('인스턴트 드라이 이스트', '기타', 'g'),
  ('연유', '유제품', 'g'),
  ('무염버터', '유제품', 'g'),
  ('달걀노른자', '기타', '개'),
  ('바닐라빈 페이스트', '양념', 'g'),
  ('옥수수전분', '곡류', 'g'),
  ('따뜻한 우유', '유제품', 'g')
on conflict (standard_name) do nothing;

insert into public.ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(v.synonym))
from (values
  ('토마토 소스', '토마토소스'),
  ('토마토 소스', 'tomato sauce'),
  ('모짜렐라 치즈', '모짜렐라치즈'),
  ('모짜렐라 치즈', '모차렐라 치즈'),
  ('파슬리 가루', '파슬리가루'),
  ('즉석밥 작은 거', '즉석밥(소)'),
  ('즉석밥 작은 거', '즉석밥 소'),
  ('체다치즈', '체다 치즈'),
  ('초밥용 밥', '샤리'),
  ('초밥용 밥', '초밥 밥'),
  ('강력분', 'bread flour'),
  ('인스턴트 드라이 이스트', '드라이 이스트'),
  ('인스턴트 드라이 이스트', '이스트'),
  ('인스턴트 드라이 이스트', 'instant dry yeast'),
  ('연유', 'condensed milk'),
  ('무염버터', '무염 버터'),
  ('무염버터', 'unsalted butter'),
  ('달걀노른자', '달걀 노른자'),
  ('달걀노른자', '계란노른자'),
  ('달걀노른자', '계란 노른자'),
  ('바닐라빈 페이스트', '바닐라빈페이스트'),
  ('바닐라빈 페이스트', '바닐라 페이스트'),
  ('옥수수전분', '옥수수 전분'),
  ('따뜻한 우유', '따뜻한우유')
) as v(standard_name, synonym)
join public.ingredients i on i.standard_name = v.standard_name
where trim(v.synonym) <> ''
on conflict (ingredient_id, synonym) do nothing;
