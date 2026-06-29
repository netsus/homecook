-- FoodSafety reviewed pilot recipe seed.
-- Generated from docs/workpacks/28-external-ingredient-data-ingest-gate/recipe-review-decisions-pilot-30-2026-06-26.json.
-- Inserts only the 30 user-reviewed pilot recipes; unreviewed candidates are not promoted.

insert into public.tags (normalized_key, label, kind, is_system, theme_eligible)
values
  ('공공레시피', '공공레시피', 'source', true, true),
  ('식약처레시피', '식약처레시피', 'source', true, true),
  ('샐러드', '샐러드', 'semantic', true, true),
  ('한그릇요리', '한그릇요리', 'semantic', true, true)
on conflict (normalized_key) do update
set label = excluded.label,
    kind = excluded.kind,
    is_system = excluded.is_system,
    theme_eligible = excluded.theme_eligible,
    updated_at = now();

create temp table tmp_foodsafety_pilot_recipes (
  id uuid primary key,
  title text not null,
  description text,
  thumbnail_url text,
  base_servings integer not null,
  source_recipe_id text not null,
  candidate_id text not null,
  tags text[] not null,
  raw_extracted_text text,
  extraction_meta_json jsonb not null
) on commit drop;

insert into tmp_foodsafety_pilot_recipes (
  id,
  title,
  description,
  thumbnail_url,
  base_servings,
  source_recipe_id,
  candidate_id,
  tags,
  raw_extracted_text,
  extraction_meta_json
)
values
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '감자느타리버섯국'::text, '국&찌개 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/20141118/20141118102104_1416273664244.jpg'::text, 1::integer, '674'::text, 'foodsafety-cookrcp:674'::text, array['공공레시피', '식약처레시피', '국물요리', '고단백', '한식']::text[], '감자 30g, 느타리버섯 15g, 두부 8g, 파 5g, 물 300g, 국멸치 5g, 홍고추 3g, 건다시마 3g, 다진 마늘 3g, 소금 0.5g'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"674","candidate_id":"foodsafety-cookrcp:674","pilot_order":1,"external_category":"국&찌개","source_method_label":"끓이기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/20141118/20141118102104_1416273664244.jpg","nutrition":{"serving_weight":null,"calories":"53.3","carbohydrates":"6.8","protein":"5.2","fat":"0.8","sodium":"404"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '다이어트국수'::text, '일품 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00386_2.png'::text, 1::integer, '386'::text, 'foodsafety-cookrcp:386'::text, array['공공레시피', '식약처레시피', '국물요리', '한그릇요리', '면요리', '고단백', '다이어트', '한식']::text[], '실곤약 200g, 물김치국물 200g, 오이 25g, 달걀 1개(60g)
당근 20g, 양파 50g, 통깨 3g, 레몬즙 15g
탄산수 50ml, 어간장 5g'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"386","candidate_id":"foodsafety-cookrcp:386","pilot_order":2,"external_category":"일품","source_method_label":"기타","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00386_1.png","nutrition":{"serving_weight":null,"calories":"36.9","carbohydrates":"6.1","protein":"0.1","fat":"1.4","sodium":"490.7"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, '된장국'::text, '국&찌개 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00037_2.png'::text, 1::integer, '37'::text, 'foodsafety-cookrcp:37'::text, array['공공레시피', '식약처레시피', '국물요리', '고단백', '한식']::text[], '된장국
두부 20g(2×2×2cm), 애느타리버섯 20g(4가닥), 감자 10g(4×3×1cm), 양파 10g(2×1cm), 대파 10g(5cm), 된장 5g(1작은술), 물 300ml(1½컵)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"37","candidate_id":"foodsafety-cookrcp:37","pilot_order":3,"external_category":"국&찌개","source_method_label":"끓이기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00037_1.png","nutrition":{"serving_weight":null,"calories":"20","carbohydrates":"3","protein":"2","fat":"0","sodium":"260"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, '백김치콩비지찌개'::text, '국&찌개 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00273_2.png'::text, 1::integer, '273'::text, 'foodsafety-cookrcp:273'::text, array['공공레시피', '식약처레시피', '국물요리', '한식']::text[], '재료 풋고추(10g), 백김치(100g), 콩비지(100g)
양념 참기름(8g), 후춧가루(0.2g), 다진 마늘(10g), 간장(2g)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"273","candidate_id":"foodsafety-cookrcp:273","pilot_order":4,"external_category":"국&찌개","source_method_label":"끓이기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00273_1.png","nutrition":{"serving_weight":null,"calories":"195.3","carbohydrates":"3.13","protein":"2.99","fat":"2.99","sodium":"447.2"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '근채류주먹밥'::text, '밥 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00337_2.png'::text, 1::integer, '337'::text, 'foodsafety-cookrcp:337'::text, array['공공레시피', '식약처레시피', '한그릇요리', '한식']::text[], '우엉 20g, 연근 20g, 감자 20g, 청고추 10g, 양파 10g, 당근 10g
쌀 100g, 오이 70g, 통깨 1g, 맛간장 15g, 참기름 5g, 마늘기름 15g, 함초소금 2g'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"337","candidate_id":"foodsafety-cookrcp:337","pilot_order":5,"external_category":"밥","source_method_label":"볶기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00337_1.png","nutrition":{"serving_weight":null,"calories":"117.3","carbohydrates":"25.2","protein":"2.4","fat":"0.8","sodium":"11.3"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '삼색샌드위치'::text, '일품 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00441_2.png'::text, 1::integer, '441'::text, 'foodsafety-cookrcp:441'::text, array['공공레시피', '식약처레시피', '한그릇요리', '고단백']::text[], '식빵(100g), 토마토(20g), 어린이치즈(20g), 양상추(30g)
감자(30g), 올리고당(20g), 달걀(60g), 당근(20g), 오이(20g)
양파(20g), 소금(0.3g)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"441","candidate_id":"foodsafety-cookrcp:441","pilot_order":6,"external_category":"일품","source_method_label":"기타","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00441_1.png","nutrition":{"serving_weight":null,"calories":"356.4","carbohydrates":"47.9","protein":"14.1","fat":"12.4","sodium":"497.3"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, '새우아욱죽'::text, '밥 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00395_2.png'::text, 1::integer, '395'::text, 'foodsafety-cookrcp:395'::text, array['공공레시피', '식약처레시피', '한그릇요리', '다이어트', '한식']::text[], '귀리밥 100g, 아욱 30g, 건새우 25g, 칵테일새우 25g, 저염 된장 30g'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"395","candidate_id":"foodsafety-cookrcp:395","pilot_order":7,"external_category":"밥","source_method_label":"끓이기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00395_1.png","nutrition":{"serving_weight":null,"calories":"201.3","carbohydrates":"34","protein":"13.1","fat":"1.4","sodium":"471.6"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '연어오븐구이'::text, '일품 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00571_2.png'::text, 1::integer, '571'::text, 'foodsafety-cookrcp:571'::text, array['공공레시피', '식약처레시피', '한그릇요리']::text[], '연어(150g), 양파(50g), 토마토(100g), 파프리카(50g),
당근(30g), 마늘(20g), 청피망(30g), 레몬(1/4개), 소금(0.3g),
후춧가루(0.01g), 생크림(20g), 화이트크림(50g), 버터(20g)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"571","candidate_id":"foodsafety-cookrcp:571","pilot_order":8,"external_category":"일품","source_method_label":"볶기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00571_1.png","nutrition":{"serving_weight":null,"calories":"285.9","carbohydrates":"8.1","protein":"28.7","fat":"15.4","sodium":"222.1"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '고추김치'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/20230306/20230306052031_1678090831734.jpg'::text, 1::integer, '399'::text, 'foodsafety-cookrcp:399'::text, array['공공레시피', '식약처레시피', '밑반찬', '매콤', '한식']::text[], '•필수재료 : 오이고추(40g), 영양부추(5g), 연근(5g), 무(5g)
•절임물 : 해물육수(8g), 어간장(3g)
•양념 : 고춧가루(3g), 생강청(3g), 통깨(1g)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"399","candidate_id":"foodsafety-cookrcp:399","pilot_order":9,"external_category":"반찬","source_method_label":"기타","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/20230306/20230306052044_1678090844312.jpg","nutrition":{"serving_weight":"40","calories":"16.1","carbohydrates":"2.6","protein":"0.6","fat":"0.3","sodium":"16.8"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '구운채소와 간장레몬 소스'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00093_2.png'::text, 1::integer, '93'::text, 'foodsafety-cookrcp:93'::text, array['공공레시피', '식약처레시피', '밑반찬', '한식']::text[], '●구운채소 : 가지 20g(3cm), 호박 50g(1/3개), 새송이버섯 15g(3개), 양파 15g(1/8개), 발사믹크레마 15g(1큰술), 빨강 파프리카 3g(3×1cm), 노랑 파프리카 3g(3×1cm), 청피망 3g(3×1cm), 올리브유 약간
●간장 레몬 소스 : 저염간장 5g(1작은술), 식초 15g(1큰술), 설탕 10g(1큰술), 레몬즙 5g(1작은술)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"93","candidate_id":"foodsafety-cookrcp:93","pilot_order":10,"external_category":"반찬","source_method_label":"굽기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00093_1.png","nutrition":{"serving_weight":null,"calories":"175","carbohydrates":"19","protein":"4","fat":"9","sodium":"38"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, '매실동치미'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00415_2.png'::text, 1::integer, '415'::text, 'foodsafety-cookrcp:415'::text, array['공공레시피', '식약처레시피', '밑반찬', '한식']::text[], '무 50g, 연근 25g, 사과 25g, 배 30g, 함초소금 2g
국물 : 매실청 30g, 생강청 15g, 함초소금 1g, 청양고추 10g'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"415","candidate_id":"foodsafety-cookrcp:415","pilot_order":11,"external_category":"반찬","source_method_label":"기타","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00415_1.png","nutrition":{"serving_weight":null,"calories":"76.8","carbohydrates":"18.4","protein":"0.7","fat":"0","sodium":"79.2"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '방울토마토 소박이'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00031_2.png'::text, 1::integer, '31'::text, 'foodsafety-cookrcp:31'::text, array['공공레시피', '식약처레시피', '밑반찬', '한식']::text[], '●방울토마토 소박이 :
방울토마토 150g(5개), 양파 10g(3×1cm), 부추 10g(5줄기)
●양념장 : 
고춧가루 4g(1작은술), 멸치액젓 3g(2/3작은술), 다진 마늘 2.5g(1/2쪽), 매실액 2g(1/3작은술), 설탕 2g(1/3작은술), 물 2ml(1/3작은술), 통깨 약간'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"31","candidate_id":"foodsafety-cookrcp:31","pilot_order":12,"external_category":"반찬","source_method_label":"기타","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00031_1.png","nutrition":{"serving_weight":null,"calories":"45","carbohydrates":"9","protein":"2","fat":"1","sodium":"277"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '단호박소고기롤'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00537_2.png'::text, 1::integer, '537'::text, 'foodsafety-cookrcp:537'::text, array['공공레시피', '식약처레시피', '밑반찬', '고단백', '한식']::text[], '소고기(70g), 저염간장(10g), 다진 마늘(10g), 설탕(10g)
파프리카(30g), 오이(20g), 적양배추(20g), 사과(20g)
설탕(10g), 팽이버섯(20g), 무순(5g)
- 밀전병 : 단호박(100g), 밀가루(50g), 소금(0.5g)
- 소스 : 다진 마늘(10g), 다진 양파(20g), 올리브오일(20g)
설탕(10g), 식초(20g), 소금(0.5g)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"537","candidate_id":"foodsafety-cookrcp:537","pilot_order":13,"external_category":"반찬","source_method_label":"굽기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00537_1.png","nutrition":{"serving_weight":null,"calories":"444.9","carbohydrates":"66.9","protein":"10.2","fat":"15.2","sodium":"248.3"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, '돌나물 샐러드'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00074_2.png'::text, 1::integer, '74'::text, 'foodsafety-cookrcp:74'::text, array['공공레시피', '식약처레시피', '밑반찬', '샐러드', '다이어트', '한식']::text[], '●돌나물 샐러드 : 돌나물 90g, 미니새송이버섯 60g(7개), 참기름 약간
●레몬마요네즈 소스 : 마요네즈 10g(2작은술), 레몬즙 20g(1⅓큰술), 청양고추 5g(1/2개), 홍고추 5g(1/2개), 참기름 약간'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"74","candidate_id":"foodsafety-cookrcp:74","pilot_order":14,"external_category":"반찬","source_method_label":"기타","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00074_1.png","nutrition":{"serving_weight":null,"calories":"235","carbohydrates":"2","protein":"3","fat":"24","sodium":"151"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, '두부 카프리제'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00587_2.png'::text, 1::integer, '587'::text, 'foodsafety-cookrcp:587'::text, array['공공레시피', '식약처레시피', '밑반찬', '고단백', '한식']::text[], '소고기(100g), 돼지고기(100g), 표고버섯(2개), 마(100g),
연근(20g), 감자(60g), 깻잎(3장), 애호박(1/3개), 마늘(20g),
두유(100g), 설탕(20g), 소금(0.2g), 저염간장(20g)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"587","candidate_id":"foodsafety-cookrcp:587","pilot_order":15,"external_category":"반찬","source_method_label":"기타","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00587_1.png","nutrition":{"serving_weight":null,"calories":"140.2","carbohydrates":"6.8","protein":"11.1","fat":"7.6","sodium":"229.6"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, '토마토 가지 카프레제'::text, '후식 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00202_2.png'::text, 1::integer, '202'::text, 'foodsafety-cookrcp:202'::text, array['공공레시피', '식약처레시피', '디저트']::text[], '●주재료 : 가지 100g(1개), 토마토 200g(1½개), 무순 20g, 마늘 10g(2개), 올리브오일 5g(1작은술)
●드레싱 : 올리브오일 25g(2큰술), 발사믹식초 60g(4큰술), 후춧가루 2g(1/2작은술)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"202","candidate_id":"foodsafety-cookrcp:202","pilot_order":16,"external_category":"후식","source_method_label":"굽기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00202_1.png","nutrition":{"serving_weight":null,"calories":"90.5","carbohydrates":"7.4","protein":"1.2","fat":"6.2","sodium":"11.3"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '치즈감자크로켓'::text, '후식 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00502_2.png'::text, 1::integer, '502'::text, 'foodsafety-cookrcp:502'::text, array['공공레시피', '식약처레시피', '디저트', '고단백']::text[], '감자(150g), 생크림(20g), 당근(20g), 양파(20g), 오이(20g)
소금(0.5g), 모짜렐라치즈(50g), 밀가루(20g), 달걀(50g)
빵가루(50g), 튀김기름(400g)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"502","candidate_id":"foodsafety-cookrcp:502","pilot_order":17,"external_category":"후식","source_method_label":"튀기기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00502_1.png","nutrition":{"serving_weight":null,"calories":"588.5","carbohydrates":"40.1","protein":"14.8","fat":"41","sodium":"362.3"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, '민들레 샐러드'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00201_2.png'::text, 1::integer, '201'::text, 'foodsafety-cookrcp:201'::text, array['공공레시피', '식약처레시피', '밑반찬', '샐러드', '다이어트', '한식']::text[], '●주재료 : 민들레 잎 40g, 비트 5g(1작은술), 오렌지(껍질) 40g(1/5개)
●드레싱 : 간장 20g(1⅓큰술), 다진 홍고추 10g(1개), 레몬즙 60g(4큰술), 설탕 6g(1작은술)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"201","candidate_id":"foodsafety-cookrcp:201","pilot_order":18,"external_category":"반찬","source_method_label":"기타","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00201_1.png","nutrition":{"serving_weight":null,"calories":"53.9","carbohydrates":"10.9","protein":"2.4","fat":"0","sodium":"874.2"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, '새우 두부 계란찜'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00028_2.png'::text, 1::integer, '28'::text, 'foodsafety-cookrcp:28'::text, array['공공레시피', '식약처레시피', '밑반찬', '고단백', '한식']::text[], '새우두부계란찜
연두부 75g(3/4모), 칵테일새우 20g(5마리), 달걀 30g(1/2개), 생크림 13g(1큰술), 설탕 5g(1작은술), 무염버터 5g(1작은술)
고명
시금치 10g(3줄기)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"28","candidate_id":"foodsafety-cookrcp:28","pilot_order":19,"external_category":"반찬","source_method_label":"찌기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00028_1.png","nutrition":{"serving_weight":null,"calories":"220","carbohydrates":"3","protein":"14","fat":"17","sodium":"99"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '석류 보쌈김치'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00159_2.png'::text, 1::integer, '159'::text, 'foodsafety-cookrcp:159'::text, array['공공레시피', '식약처레시피', '밑반찬', '한식']::text[], '●주재료 : 배추 70g(1/10개), 석류즙 10g(2작은술), 소금 5g(1/2작은술)
●양념 : 무 10g(3cm), 미나리 10g, 쪽파 10g(1개), 다진 마늘 5g(1작은술), 다진 생강 5g(1작은술), 새우젓국 15g(1큰술)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"159","candidate_id":"foodsafety-cookrcp:159","pilot_order":20,"external_category":"반찬","source_method_label":"기타","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00159_1.png","nutrition":{"serving_weight":null,"calories":"24.5","carbohydrates":"4.7","protein":"1.4","fat":"0","sodium":"171.3"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, '스트로베리 샐러드'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00087_2.png'::text, 1::integer, '87'::text, 'foodsafety-cookrcp:87'::text, array['공공레시피', '식약처레시피', '밑반찬', '샐러드', '다이어트', '한식']::text[], '스트로베리 샐러드
딸기 70g(7개), 플레인요거트 85g(1개), 양상추 70g(2장), 메추리알 30g(3개), 블루베리 15g(1큰술), 식초 약간, 소금 약간'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"87","candidate_id":"foodsafety-cookrcp:87","pilot_order":21,"external_category":"반찬","source_method_label":"기타","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00087_1.png","nutrition":{"serving_weight":null,"calories":"195","carbohydrates":"30","protein":"7","fat":"5","sodium":"138"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, '시금치 우유 소스와 그린매쉬드포테이토'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00089_2.png'::text, 1::integer, '89'::text, 'foodsafety-cookrcp:89'::text, array['공공레시피', '식약처레시피', '밑반찬', '한식']::text[], '●그린매쉬드포테이토 : 감자 80g(1/2개), 시금치우유 소스 5g(1작은술), 아몬드 2g(1알), 설탕 2g(1/3작은술), 크랜베리 3g, 치커리 약간
●시금치우유 소스 : 시금치 10g, 우유 10g(2작은술)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"89","candidate_id":"foodsafety-cookrcp:89","pilot_order":22,"external_category":"반찬","source_method_label":"찌기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00089_1.png","nutrition":{"serving_weight":null,"calories":"155","carbohydrates":"32","protein":"5","fat":"1","sodium":"24"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, '애호박들깨볶음'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00531_2.png'::text, 1::integer, '531'::text, 'foodsafety-cookrcp:531'::text, array['공공레시피', '식약처레시피', '밑반찬', '한식']::text[], '애호박(150g), 소금(0.5g), 양파(20g), 대파(10g)
홍고추(10g), 들기름(20g), 다진 마늘(5g), 건새우(20g)
들깨가루(30g)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"531","candidate_id":"foodsafety-cookrcp:531","pilot_order":23,"external_category":"반찬","source_method_label":"볶기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00531_1.png","nutrition":{"serving_weight":null,"calories":"184.6","carbohydrates":"16.2","protein":"10.4","fat":"8.7","sodium":"202"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '양배추감자전'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00181_2.png'::text, 1::integer, '181'::text, 'foodsafety-cookrcp:181'::text, array['공공레시피', '식약처레시피', '밑반찬', '고단백', '한식']::text[], '●주재료 : 감자 100g(1개), 양배추 150g(1/2개), 당근 15g(1/10개), 두부 20g(1/20모), 돼지고기 30g, 청양고추 5g(1개), 부침가루 45g(3큰술), 달걀 60g(1개), 식용유 15g(1큰술)
●소스 : 오렌지즙 15g(1큰술), 간장 2g(1/2작은술), 식초 10g(2작은술)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"181","candidate_id":"foodsafety-cookrcp:181","pilot_order":24,"external_category":"반찬","source_method_label":"굽기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00181_1.png","nutrition":{"serving_weight":null,"calories":"148.9","carbohydrates":"14.7","protein":"7.7","fat":"6.6","sodium":"107.1"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, '연근부각'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00665_2.png'::text, 1::integer, '665'::text, 'foodsafety-cookrcp:665'::text, array['공공레시피', '식약처레시피', '밑반찬', '한식']::text[], '연근(60g), 식초(10g), 천일염(0.1g), 계피가루(20g),
식용유(200g)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"665","candidate_id":"foodsafety-cookrcp:665","pilot_order":25,"external_category":"반찬","source_method_label":"튀기기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00665_1.png","nutrition":{"serving_weight":null,"calories":"162.2","carbohydrates":"25.3","protein":"2.6","fat":"5.6","sodium":"67.7"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '연근초무침'::text, '반찬 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00419_2.png'::text, 1::integer, '419'::text, 'foodsafety-cookrcp:419'::text, array['공공레시피', '식약처레시피', '밑반찬', '한식']::text[], '연근 200g, 양파 60g, 오이 40g, 밤 60g
소스 : 유자청 25g, 강황가루 2g, 잣 2g, 설탕 5g, 식초 15g'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"419","candidate_id":"foodsafety-cookrcp:419","pilot_order":26,"external_category":"반찬","source_method_label":"기타","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00419_1.png","nutrition":{"serving_weight":null,"calories":"119.1","carbohydrates":"20.4","protein":"1.6","fat":"3.5","sodium":"81.4"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '연어차우더스프'::text, '일품 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00514_2.png'::text, 1::integer, '514'::text, 'foodsafety-cookrcp:514'::text, array['공공레시피', '식약처레시피', '한그릇요리']::text[], '모시조개(50g), 연어(100g), 청피망(20g), 당근(20g)
양파(20g), 감자(50g), 밀가루(10g), 버터(5g), 육수(200g)
월계수잎(1장), 통후추(3알), 생크림(30g), 통마늘(10g)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"514","candidate_id":"foodsafety-cookrcp:514","pilot_order":27,"external_category":"일품","source_method_label":"끓이기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00514_1.png","nutrition":{"serving_weight":null,"calories":"217.6","carbohydrates":"23.2","protein":"11.7","fat":"8.7","sodium":"215.4"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '열무김치파스타'::text, '일품 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00330_2.png'::text, 1::integer, '330'::text, 'foodsafety-cookrcp:330'::text, array['공공레시피', '식약처레시피', '한그릇요리', '면요리', '한식']::text[], '파스타면 50g, 열무김치 100g, 오이 20g, 청홍고추 각각 15g
노란 파프리카 30g, 양파 30g, 당근 25g
생들기름 30g, 통깨 2g, 청양고추 30g'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"330","candidate_id":"foodsafety-cookrcp:330","pilot_order":28,"external_category":"일품","source_method_label":"볶기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00330_1.png","nutrition":{"serving_weight":null,"calories":"270.4","carbohydrates":"42.1","protein":"6.6","fat":"8.4","sodium":"371"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '오징어콩순대'::text, '일품 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00390_2.png'::text, 1::integer, '390'::text, 'foodsafety-cookrcp:390'::text, array['공공레시피', '식약처레시피', '한그릇요리']::text[], '오징어 1마리(220g), 옥수수 30g, 귀리밥 50g, 강낭콩 20g
당근 20g, 미니파프리카 20g, 피망 20g, 대파 10g, 양파 25g
카레가루 25g, 흰후추 1g, 다진마늘 5g, 참기름 15g, 밀가루 15g, 레몬즙 15g'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"390","candidate_id":"foodsafety-cookrcp:390","pilot_order":29,"external_category":"일품","source_method_label":"굽기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00390_1.png","nutrition":{"serving_weight":null,"calories":"213.5","carbohydrates":"25","protein":"17.9","fat":"4.7","sodium":"295.4"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '전복리조또'::text, '밥 · 식약처 공공 레시피'::text, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00576_2.png'::text, 1::integer, '576'::text, 'foodsafety-cookrcp:576'::text, array['공공레시피', '식약처레시피', '한그릇요리', '한식']::text[], '쌀(100g), 전복(1개), 당근(20g), 양파(30g), 양송이버섯(3개),
우유(200g), 올리브오일(10g), 소금(0.2g), 후춧가루(0.01g),
버터(10g)'::text, '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"576","candidate_id":"foodsafety-cookrcp:576","pilot_order":30,"external_category":"밥","source_method_label":"끓이기","source_image_url":"https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00576_1.png","nutrition":{"serving_weight":null,"calories":"282.9","carbohydrates":"53.1","protein":"7.1","fat":"4.7","sodium":"92.1"},"reviewed_scope":"pilot_30_user_reviewed","reviewed_at":"2026-06-26T00:00:00.000Z"}'::jsonb);

create temp table tmp_foodsafety_pilot_ingredients (
  recipe_id uuid not null,
  sort_order integer not null,
  standard_name text not null,
  amount numeric,
  unit varchar(20),
  ingredient_type public.recipe_ingredient_type not null,
  display_text varchar(200),
  component_label text,
  scalable boolean not null
) on commit drop;

insert into tmp_foodsafety_pilot_ingredients (
  recipe_id,
  sort_order,
  standard_name,
  amount,
  unit,
  ingredient_type,
  display_text,
  component_label,
  scalable
)
values
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 0::integer, '감자'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '감자 30g'::varchar, null::text, true::boolean),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 1::integer, '느타리버섯'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '느타리버섯 15g'::varchar, null::text, true::boolean),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 2::integer, '두부'::text, 8::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '두부 8g'::varchar, null::text, true::boolean),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 3::integer, '파'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '파 5g'::varchar, null::text, true::boolean),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 4::integer, '물'::text, 300::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '물 300g'::varchar, null::text, true::boolean),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 5::integer, '멸치'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '국멸치 5g'::varchar, null::text, true::boolean),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 6::integer, '홍고추'::text, 3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '홍고추 3g'::varchar, null::text, true::boolean),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 7::integer, '다시마'::text, 3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '건다시마 3g'::varchar, null::text, true::boolean),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 8::integer, '다진마늘'::text, 3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '다진 마늘 3g'::varchar, null::text, true::boolean),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 9::integer, '소금'::text, 0.5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소금 0.5g'::varchar, null::text, true::boolean),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 0::integer, '실곤약'::text, 200::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '실곤약 200g'::varchar, null::text, true::boolean),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 1::integer, '열무김치 국물'::text, 200::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '물김치국물 200g'::varchar, '국수 국물'::text, true::boolean),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 2::integer, '오이'::text, 25::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '오이 25g'::varchar, null::text, true::boolean),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 3::integer, '달걀'::text, 60::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '달걀 1개(60g)'::varchar, null::text, true::boolean),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 4::integer, '당근'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '당근 20g'::varchar, null::text, true::boolean),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 5::integer, '양파'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파 50g'::varchar, null::text, true::boolean),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 6::integer, '통깨'::text, 3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '통깨 3g'::varchar, null::text, true::boolean),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 7::integer, '레몬즙'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '레몬즙 15g'::varchar, null::text, true::boolean),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 8::integer, '탄산수'::text, 50::numeric, 'ml'::varchar, 'QUANT'::public.recipe_ingredient_type, '탄산수 50ml'::varchar, '국수 국물'::text, true::boolean),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 9::integer, '어간장'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '어간장 5g'::varchar, '국수 국물'::text, true::boolean),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 0::integer, '두부'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '두부 20g(2×2×2cm)'::varchar, null::text, true::boolean),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 1::integer, '애느타리버섯'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '애느타리버섯 20g(4가닥)'::varchar, null::text, true::boolean),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 2::integer, '감자'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '감자 10g(4×3×1cm)'::varchar, null::text, true::boolean),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 3::integer, '양파'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파 10g(2×1cm)'::varchar, null::text, true::boolean),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 4::integer, '대파'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '대파 10g(5cm)'::varchar, null::text, true::boolean),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 5::integer, '된장'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '된장 5g(1작은술)'::varchar, null::text, true::boolean),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 6::integer, '물'::text, 300::numeric, 'ml'::varchar, 'QUANT'::public.recipe_ingredient_type, '물 300ml(11⁄2컵)'::varchar, null::text, true::boolean),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 0::integer, '풋고추'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '풋고추(10g)'::varchar, '재료'::text, true::boolean),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 1::integer, '물'::text, 200::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '물(200g)'::varchar, null::text, true::boolean),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 2::integer, '백김치'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '백김치(100g)'::varchar, '재료'::text, true::boolean),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 3::integer, '비지'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '콩비지(100g)'::varchar, '재료'::text, true::boolean),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 4::integer, '참기름'::text, 8::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '참기름(8g)'::varchar, '양념'::text, true::boolean),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 5::integer, '후추'::text, 0.2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '후춧가루(0.2g)'::varchar, '양념'::text, true::boolean),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 6::integer, '다진마늘'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '다진 마늘(10g)'::varchar, '양념'::text, true::boolean),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 7::integer, '간장'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '간장(2g)'::varchar, '양념'::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 0::integer, '우엉'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '우엉 20g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 1::integer, '연근'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '연근 20g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 2::integer, '감자'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '감자 20g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 3::integer, '고추'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '청고추 10g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 4::integer, '양파'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파 10g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 5::integer, '당근'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '당근 10g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 6::integer, '쌀'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '쌀 100g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 7::integer, '오이'::text, 70::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '오이 70g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 8::integer, '통깨'::text, 1::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '통깨 1g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 9::integer, '간장'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '맛간장 15g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 10::integer, '참기름'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '참기름 5g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 11::integer, '마늘기름'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '마늘기름 15g'::varchar, null::text, true::boolean),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 12::integer, '소금'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '함초소금 2g'::varchar, null::text, true::boolean),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 0::integer, '식빵'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '식빵(100g)'::varchar, null::text, true::boolean),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 1::integer, '토마토'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '토마토(20g)'::varchar, null::text, true::boolean),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 2::integer, '치즈'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '어린이치즈(20g)'::varchar, null::text, true::boolean),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 3::integer, '양상추'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양상추(30g)'::varchar, null::text, true::boolean),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 4::integer, '감자'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '감자(30g)'::varchar, null::text, true::boolean),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 5::integer, '올리고당'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '올리고당(20g)'::varchar, null::text, true::boolean),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 6::integer, '달걀'::text, 60::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '달걀(60g)'::varchar, null::text, true::boolean),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 7::integer, '당근'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '당근(20g)'::varchar, null::text, true::boolean),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 8::integer, '오이'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '오이(20g)'::varchar, null::text, true::boolean),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 9::integer, '양파'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파(20g)'::varchar, null::text, true::boolean),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 10::integer, '소금'::text, 0.3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소금(0.3g)'::varchar, null::text, true::boolean),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 0::integer, '귀리밥'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '귀리밥 100g'::varchar, null::text, true::boolean),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 1::integer, '아욱'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '아욱 30g'::varchar, null::text, true::boolean),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 2::integer, '건새우'::text, 25::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '건새우 25g'::varchar, null::text, true::boolean),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 3::integer, '칵테일새우'::text, 25::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '칵테일새우 25g'::varchar, null::text, true::boolean),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 4::integer, '된장'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '저염 된장 30g'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 0::integer, '연어'::text, 150::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '연어(150g)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 1::integer, '양파'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파(50g)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 2::integer, '토마토'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '토마토(100g)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 3::integer, '파프리카'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '파프리카(50g)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 4::integer, '당근'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '당근(30g)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 5::integer, '마늘'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '마늘(20g)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 6::integer, '피망'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '청피망(30g)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 7::integer, '레몬'::text, 0.25::numeric, '개'::varchar, 'QUANT'::public.recipe_ingredient_type, '레몬(1/4개)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 8::integer, '소금'::text, 0.3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소금(0.3g)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 9::integer, '후추'::text, 0.01::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '후춧가루(0.01g)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 10::integer, '생크림'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '생크림(20g)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 11::integer, '화이트크림'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '화이트크림(50g)'::varchar, null::text, true::boolean),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 12::integer, '버터'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '버터(20g)'::varchar, null::text, true::boolean),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 0::integer, '오이고추'::text, 40::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '오이고추(40g)'::varchar, '필수 재료'::text, true::boolean),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 1::integer, '부추'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '영양부추(5g)'::varchar, '필수 재료'::text, true::boolean),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 2::integer, '연근'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '연근(5g)'::varchar, '필수 재료'::text, true::boolean),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 3::integer, '무'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '무(5g)'::varchar, '필수 재료'::text, true::boolean),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 4::integer, '해물육수'::text, 8::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '해물육수(8g)'::varchar, '절임물'::text, true::boolean),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 5::integer, '어간장'::text, 3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '어간장(3g)'::varchar, '절임물'::text, true::boolean),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 6::integer, '고춧가루'::text, 1::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '고춧가루(3g)'::varchar, '양념'::text, true::boolean),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 7::integer, '생강청'::text, 3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '생강청(3g)'::varchar, '양념'::text, true::boolean),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 8::integer, '통깨'::text, 1::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '통깨(1g)'::varchar, '양념'::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 0::integer, '가지'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '구운채소 : 가지 20g(3cm)'::varchar, null::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 1::integer, '호박'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '호박 50g(1/3개)'::varchar, null::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 2::integer, '새송이버섯'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '새송이버섯 15g(3개)'::varchar, null::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 3::integer, '양파'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파 15g(1/8개)'::varchar, null::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 4::integer, '발사믹 식초'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '발사믹크레마 15g(1큰술)'::varchar, null::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 5::integer, '파프리카'::text, 3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '빨강 파프리카 3g(3×1cm)'::varchar, null::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 6::integer, '파프리카'::text, 3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '노랑 파프리카 3g(3×1cm)'::varchar, null::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 7::integer, '피망'::text, 3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '청피망 3g(3×1cm)'::varchar, null::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 8::integer, '올리브 오일'::text, null::numeric, null::varchar, 'TO_TASTE'::public.recipe_ingredient_type, '올리브유 약간'::varchar, null::text, false::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 9::integer, '간장'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '저염간장 5g(1작은술)'::varchar, '간장 레몬 소스'::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 10::integer, '식초'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '식초 15g(1큰술)'::varchar, '간장 레몬 소스'::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 11::integer, '설탕'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '설탕 10g(1큰술)'::varchar, '간장 레몬 소스'::text, true::boolean),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 12::integer, '레몬즙'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '레몬즙 5g(1작은술)'::varchar, '간장 레몬 소스'::text, true::boolean),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 0::integer, '무'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '무 50g'::varchar, null::text, true::boolean),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 1::integer, '연근'::text, 25::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '연근 25g'::varchar, null::text, true::boolean),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 2::integer, '사과'::text, 25::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '사과 25g'::varchar, null::text, true::boolean),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 3::integer, '배'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '배 30g'::varchar, null::text, true::boolean),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 4::integer, '소금'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '함초소금 2g'::varchar, null::text, true::boolean),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 5::integer, '매실청'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '매실청 30g'::varchar, '국물'::text, true::boolean),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 6::integer, '생강청'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '생강청 15g'::varchar, '국물'::text, true::boolean),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 7::integer, '소금'::text, 1::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '함초소금 1g'::varchar, '국물'::text, true::boolean),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 8::integer, '청양고추'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '청양고추 10g'::varchar, '국물'::text, true::boolean),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 0::integer, '방울토마토'::text, 150::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '방울토마토 150g(5개)'::varchar, null::text, true::boolean),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 1::integer, '양파'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파 10g(3×1cm)'::varchar, null::text, true::boolean),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 2::integer, '부추'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '부추 10g(5줄기)'::varchar, null::text, true::boolean),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 3::integer, '고춧가루'::text, 4::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '고춧가루 4g(1작은술)'::varchar, '양념장'::text, true::boolean),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 4::integer, '멸치액젓'::text, 3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '멸치액젓 3g(2/3작은술)'::varchar, '양념장'::text, true::boolean),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 5::integer, '다진마늘'::text, 2.5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '다진 마늘 2.5g(1/2쪽)'::varchar, '양념장'::text, true::boolean),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 6::integer, '매실청'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '매실액 2g(1/3작은술)'::varchar, '양념장'::text, true::boolean),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 7::integer, '설탕'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '설탕 2g(1/3작은술)'::varchar, '양념장'::text, true::boolean),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 8::integer, '물'::text, 2::numeric, 'ml'::varchar, 'QUANT'::public.recipe_ingredient_type, '물 2ml(1/3작은술)'::varchar, '양념장'::text, true::boolean),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 9::integer, '통깨'::text, null::numeric, null::varchar, 'TO_TASTE'::public.recipe_ingredient_type, '통깨 약간'::varchar, '양념장'::text, false::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 0::integer, '소고기'::text, 70::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소고기(70g)'::varchar, null::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 1::integer, '간장'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '저염간장(10g)'::varchar, null::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 2::integer, '다진마늘'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '다진 마늘(10g)'::varchar, null::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 3::integer, '설탕'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '설탕(10g)'::varchar, null::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 4::integer, '파프리카'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '파프리카(30g)'::varchar, null::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 5::integer, '오이'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '오이(20g)'::varchar, null::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 6::integer, '적양배추'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '적양배추(20g)'::varchar, null::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 7::integer, '사과'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '사과(20g)'::varchar, null::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 8::integer, '설탕'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '설탕(10g)'::varchar, null::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 9::integer, '팽이버섯'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '팽이버섯(20g)'::varchar, null::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 10::integer, '무순'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '무순(5g)'::varchar, null::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 11::integer, '단호박'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '밀전병 : 단호박(100g)'::varchar, '밀전병'::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 12::integer, '밀가루'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '밀가루(50g)'::varchar, '밀전병'::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 13::integer, '소금'::text, 0.5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소금(0.5g)'::varchar, '밀전병'::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 14::integer, '다진마늘'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '다진 마늘(10g)'::varchar, '소스'::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 15::integer, '양파'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '다진 양파(20g)'::varchar, '소스'::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 16::integer, '올리브 오일'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '올리브오일(20g)'::varchar, '소스'::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 17::integer, '설탕'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '설탕(10g)'::varchar, '소스'::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 18::integer, '식초'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '식초(20g)'::varchar, '소스'::text, true::boolean),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 19::integer, '소금'::text, 0.5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소금(0.5g)'::varchar, '소스'::text, true::boolean),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 0::integer, '돌나물'::text, 90::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '돌나물 샐러드 : 돌나물 90g'::varchar, null::text, true::boolean),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 1::integer, '미니새송이버섯'::text, 60::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '미니새송이버섯 60g(7개)'::varchar, null::text, true::boolean),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 2::integer, '참기름'::text, null::numeric, null::varchar, 'TO_TASTE'::public.recipe_ingredient_type, '참기름 약간'::varchar, null::text, false::boolean),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 3::integer, '마요네즈'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '마요네즈 10g(2작은술)'::varchar, '레몬마요네즈 소스'::text, true::boolean),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 4::integer, '레몬즙'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '레몬즙 20g(11⁄3큰술)'::varchar, '레몬마요네즈 소스'::text, true::boolean),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 5::integer, '청양고추'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '청양고추 5g(1/2개)'::varchar, '레몬마요네즈 소스'::text, true::boolean),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 6::integer, '홍고추'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '홍고추 5g(1/2개)'::varchar, '레몬마요네즈 소스'::text, true::boolean),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 7::integer, '참기름'::text, null::numeric, null::varchar, 'TO_TASTE'::public.recipe_ingredient_type, '참기름 약간'::varchar, '레몬마요네즈 소스'::text, false::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 0::integer, '소고기'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소고기(100g)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 1::integer, '돼지고기'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '돼지고기(100g)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 2::integer, '표고버섯'::text, 2::numeric, '개'::varchar, 'QUANT'::public.recipe_ingredient_type, '표고버섯(2개)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 3::integer, '마'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '마(100g)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 4::integer, '연근'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '연근(20g)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 5::integer, '감자'::text, 60::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '감자(60g)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 6::integer, '깻잎'::text, 3::numeric, '장'::varchar, 'QUANT'::public.recipe_ingredient_type, '깻잎(3장)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 7::integer, '애호박'::text, 0.3333::numeric, '개'::varchar, 'QUANT'::public.recipe_ingredient_type, '애호박(1/3개)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 8::integer, '마늘'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '마늘(20g)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 9::integer, '두유'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '두유(100g)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 10::integer, '설탕'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '설탕(20g)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 11::integer, '소금'::text, 0.2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소금(0.2g)'::varchar, null::text, true::boolean),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 12::integer, '간장'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '저염간장(20g)'::varchar, null::text, true::boolean),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 0::integer, '가지'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '가지 100g(1개)'::varchar, '주 재료'::text, true::boolean),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 1::integer, '토마토'::text, 200::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '토마토 200g(11⁄2개)'::varchar, '주 재료'::text, true::boolean),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 2::integer, '무순'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '무순 20g'::varchar, '주 재료'::text, true::boolean),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 3::integer, '마늘'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '마늘 10g(2개)'::varchar, '주 재료'::text, true::boolean),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 4::integer, '올리브 오일'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '올리브오일 5g(1작은술)'::varchar, '주 재료'::text, true::boolean),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 5::integer, '올리브 오일'::text, 25::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '올리브오일 25g(2큰술)'::varchar, '드레싱'::text, true::boolean),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 6::integer, '발사믹 식초'::text, 60::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '발사믹식초 60g(4큰술)'::varchar, '드레싱'::text, true::boolean),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 7::integer, '후추'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '후춧가루 2g(1/2작은술)'::varchar, '드레싱'::text, true::boolean),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 0::integer, '감자'::text, 150::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '감자(150g)'::varchar, null::text, true::boolean),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 1::integer, '생크림'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '생크림(20g)'::varchar, null::text, true::boolean),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 2::integer, '당근'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '당근(20g)'::varchar, null::text, true::boolean),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 3::integer, '양파'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파(20g)'::varchar, null::text, true::boolean),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 4::integer, '오이'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '오이(20g)'::varchar, null::text, true::boolean),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 5::integer, '소금'::text, 0.5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소금(0.5g)'::varchar, null::text, true::boolean),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 6::integer, '모짜렐라 치즈'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '모짜렐라치즈(50g)'::varchar, null::text, true::boolean),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 7::integer, '밀가루'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '밀가루(20g)'::varchar, null::text, true::boolean),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 8::integer, '달걀'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '달걀(50g)'::varchar, null::text, true::boolean),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 9::integer, '빵가루'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '빵가루(50g)'::varchar, null::text, true::boolean),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 10::integer, '식용유'::text, 400::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '튀김기름(400g)'::varchar, null::text, true::boolean),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 0::integer, '민들레 잎'::text, 40::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '민들레 잎 40g'::varchar, '주 재료'::text, true::boolean),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 1::integer, '비트'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '비트 5g(1작은술)'::varchar, '주 재료'::text, true::boolean),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 2::integer, '오렌지 껍질'::text, 40::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '오렌지(껍질) 40g(1/5개)'::varchar, '주 재료'::text, true::boolean),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 3::integer, '간장'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '간장 20g(11⁄3큰술)'::varchar, '드레싱'::text, true::boolean),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 4::integer, '홍고추'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '다진 홍고추 10g(1개)'::varchar, '드레싱'::text, true::boolean),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 5::integer, '레몬즙'::text, 60::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '레몬즙 60g(4큰술)'::varchar, '드레싱'::text, true::boolean),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 6::integer, '설탕'::text, 6::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '설탕 6g(1작은술)'::varchar, '드레싱'::text, true::boolean),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 0::integer, '연두부'::text, 75::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '연두부 75g(3/4모)'::varchar, null::text, true::boolean),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 1::integer, '칵테일새우'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '칵테일새우 20g(5마리)'::varchar, null::text, true::boolean),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 2::integer, '달걀'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '달걀 30g(1/2개)'::varchar, null::text, true::boolean),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 3::integer, '생크림'::text, 13::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '생크림 13g(1큰술)'::varchar, null::text, true::boolean),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 4::integer, '설탕'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '설탕 5g(1작은술)'::varchar, null::text, true::boolean),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 5::integer, '무염버터'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '무염버터 5g(1작은술)'::varchar, null::text, true::boolean),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 6::integer, '시금치'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '시금치 10g(3줄기)'::varchar, '고명'::text, true::boolean),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 0::integer, '배추'::text, 70::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '배추 70g(1/10개)'::varchar, '주 재료'::text, true::boolean),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 1::integer, '석류즙'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '석류즙 10g(2작은술)'::varchar, '주 재료'::text, true::boolean),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 2::integer, '소금'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소금 5g(1/2작은술)'::varchar, '주 재료'::text, true::boolean),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 3::integer, '무'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '무 10g(3cm)'::varchar, '소'::text, true::boolean),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 4::integer, '미나리'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '미나리 10g'::varchar, '소'::text, true::boolean),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 5::integer, '쪽파'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '쪽파 10g(1개)'::varchar, '소'::text, true::boolean),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 6::integer, '다진마늘'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '다진 마늘 5g(1작은술)'::varchar, '소'::text, true::boolean),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 7::integer, '다진생강'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '다진 생강 5g(1작은술)'::varchar, '소'::text, true::boolean),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 8::integer, '새우젓'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '새우젓국 15g(1큰술)'::varchar, '소'::text, true::boolean),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 0::integer, '딸기'::text, 70::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '딸기 70g(7개)'::varchar, null::text, true::boolean),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 1::integer, '플레인요거트'::text, 85::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '플레인요거트 85g(1개)'::varchar, null::text, true::boolean),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 2::integer, '양상추'::text, 70::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양상추 70g(2장)'::varchar, null::text, true::boolean),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 3::integer, '메추리알'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '메추리알 30g(3개)'::varchar, null::text, true::boolean),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 4::integer, '블루베리'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '블루베리 15g(1큰술)'::varchar, null::text, true::boolean),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 5::integer, '식초'::text, null::numeric, null::varchar, 'TO_TASTE'::public.recipe_ingredient_type, '식초 약간'::varchar, null::text, false::boolean),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 6::integer, '소금'::text, null::numeric, null::varchar, 'TO_TASTE'::public.recipe_ingredient_type, '소금 약간'::varchar, null::text, false::boolean),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 0::integer, '감자'::text, 80::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '그린매쉬드포테이토 : 감자 80g(1/2개)'::varchar, '그린매쉬드포테이토'::text, true::boolean),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 1::integer, '아몬드'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '아몬드 2g(1알)'::varchar, '그린매쉬드포테이토'::text, true::boolean),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 2::integer, '설탕'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '설탕 2g(1/3작은술)'::varchar, '그린매쉬드포테이토'::text, true::boolean),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 3::integer, '크랜베리'::text, 3::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '크랜베리 3g'::varchar, '그린매쉬드포테이토'::text, true::boolean),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 4::integer, '치커리'::text, null::numeric, null::varchar, 'TO_TASTE'::public.recipe_ingredient_type, '치커리 약간'::varchar, '그린매쉬드포테이토'::text, false::boolean),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 5::integer, '시금치'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '시금치 10g'::varchar, '시금치우유 소스'::text, true::boolean),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 6::integer, '우유'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '우유 10g(2작은술)'::varchar, '시금치우유 소스'::text, true::boolean),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 0::integer, '애호박'::text, 150::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '애호박(150g)'::varchar, null::text, true::boolean),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 1::integer, '소금'::text, 0.5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소금(0.5g)'::varchar, null::text, true::boolean),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 2::integer, '양파'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파(20g)'::varchar, null::text, true::boolean),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 3::integer, '대파'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '대파(10g)'::varchar, null::text, true::boolean),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 4::integer, '홍고추'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '홍고추(10g)'::varchar, null::text, true::boolean),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 5::integer, '들기름'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '들기름(20g)'::varchar, null::text, true::boolean),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 6::integer, '다진마늘'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '다진 마늘(5g)'::varchar, null::text, true::boolean),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 7::integer, '건새우'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '건새우(20g)'::varchar, null::text, true::boolean),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 8::integer, '들깨가루'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '들깨가루(30g)'::varchar, null::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 0::integer, '감자'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '감자 100g(1개)'::varchar, '주 재료'::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 1::integer, '양배추'::text, 150::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양배추 150g(1/2개)'::varchar, '주 재료'::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 2::integer, '당근'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '당근 15g(1/10개)'::varchar, '주 재료'::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 3::integer, '두부'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '두부 20g(1/20모)'::varchar, '주 재료'::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 4::integer, '돼지고기'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '돼지고기 30g'::varchar, '주 재료'::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 5::integer, '청양고추'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '청양고추 5g(1개)'::varchar, '주 재료'::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 6::integer, '부침가루'::text, 45::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '부침가루 45g(3큰술)'::varchar, '주 재료'::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 7::integer, '달걀'::text, 60::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '달걀 60g(1개)'::varchar, '주 재료'::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 8::integer, '식용유'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '식용유 15g(1큰술)'::varchar, '주 재료'::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 9::integer, '오렌지즙'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '오렌지즙 15g(1큰술)'::varchar, '소스'::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 10::integer, '간장'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '간장 2g(1/2작은술)'::varchar, '소스'::text, true::boolean),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 11::integer, '식초'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '식초 10g(2작은술)'::varchar, '소스'::text, true::boolean),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 0::integer, '연근'::text, 60::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '연근(60g)'::varchar, null::text, true::boolean),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 1::integer, '식초'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '식초(10g)'::varchar, null::text, true::boolean),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 2::integer, '소금'::text, 0.1::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '천일염(0.1g)'::varchar, null::text, true::boolean),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 3::integer, '계피가루'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '계피가루(20g)'::varchar, null::text, true::boolean),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 4::integer, '식용유'::text, 200::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '식용유(200g)'::varchar, null::text, true::boolean),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 0::integer, '연근'::text, 200::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '연근 200g'::varchar, null::text, true::boolean),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 1::integer, '양파'::text, 60::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파 60g'::varchar, null::text, true::boolean),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 2::integer, '오이'::text, 40::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '오이 40g'::varchar, null::text, true::boolean),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 3::integer, '밤'::text, 60::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '밤 60g'::varchar, null::text, true::boolean),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 4::integer, '유자청'::text, 25::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '유자청 25g'::varchar, '소스'::text, true::boolean),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 5::integer, '강황가루'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '강황가루 2g'::varchar, '소스'::text, true::boolean),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 6::integer, '잣'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '잣 2g'::varchar, '소스'::text, true::boolean),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 7::integer, '설탕'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '설탕 5g'::varchar, '소스'::text, true::boolean),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 8::integer, '식초'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '식초 15g'::varchar, '소스'::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 0::integer, '모시조개'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '모시조개(50g)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 1::integer, '연어'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '연어(100g)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 2::integer, '피망'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '청피망(20g)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 3::integer, '당근'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '당근(20g)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 4::integer, '양파'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파(20g)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 5::integer, '감자'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '감자(50g)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 6::integer, '밀가루'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '밀가루(10g)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 7::integer, '버터'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '버터(5g)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 8::integer, '육수'::text, 200::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '육수(200g)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 9::integer, '월계수잎'::text, 1::numeric, '장'::varchar, 'QUANT'::public.recipe_ingredient_type, '월계수잎(1장)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 10::integer, '통후추'::text, 3::numeric, '알'::varchar, 'QUANT'::public.recipe_ingredient_type, '통후추(3알)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 11::integer, '생크림'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '생크림(30g)'::varchar, null::text, true::boolean),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 12::integer, '마늘'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '통마늘(10g)'::varchar, null::text, true::boolean),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 0::integer, '파스타면'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '파스타면 50g'::varchar, null::text, true::boolean),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 1::integer, '열무 김치'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '열무김치 100g'::varchar, null::text, true::boolean),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 2::integer, '오이'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '오이 20g'::varchar, null::text, true::boolean),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 3::integer, '고추'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '청홍고추 각각 15g'::varchar, null::text, true::boolean),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 4::integer, '홍고추'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '청홍고추 각각 15g'::varchar, null::text, true::boolean),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 5::integer, '파프리카'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '노란 파프리카 30g'::varchar, null::text, true::boolean),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 6::integer, '양파'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파 30g'::varchar, null::text, true::boolean),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 7::integer, '당근'::text, 25::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '당근 25g'::varchar, null::text, true::boolean),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 8::integer, '들기름'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '생들기름 30g'::varchar, null::text, true::boolean),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 9::integer, '통깨'::text, 2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '통깨 2g'::varchar, null::text, true::boolean),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 10::integer, '청양고추'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '청양고추 30g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 0::integer, '오징어'::text, 220::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '오징어 1마리(220g)'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 1::integer, '옥수수'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '옥수수 30g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 2::integer, '귀리밥'::text, 50::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '귀리밥 50g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 3::integer, '강낭콩'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '강낭콩 20g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 4::integer, '당근'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '당근 20g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 5::integer, '파프리카'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '미니파프리카 20g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 6::integer, '피망'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '피망 20g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 7::integer, '대파'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '대파 10g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 8::integer, '양파'::text, 25::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파 25g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 9::integer, '카레가루'::text, 25::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '카레가루 25g'::varchar, '소'::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 10::integer, '후추'::text, 1::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '흰후추 1g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 11::integer, '다진마늘'::text, 5::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '다진마늘 5g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 12::integer, '참기름'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '참기름 15g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 13::integer, '밀가루'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '밀가루 15g'::varchar, null::text, true::boolean),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 14::integer, '레몬즙'::text, 15::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '레몬즙 15g'::varchar, null::text, true::boolean),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 0::integer, '쌀'::text, 100::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '쌀(100g)'::varchar, null::text, true::boolean),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 1::integer, '전복'::text, 1::numeric, '개'::varchar, 'QUANT'::public.recipe_ingredient_type, '전복(1개)'::varchar, null::text, true::boolean),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 2::integer, '당근'::text, 20::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '당근(20g)'::varchar, null::text, true::boolean),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 3::integer, '양파'::text, 30::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '양파(30g)'::varchar, null::text, true::boolean),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 4::integer, '양송이버섯'::text, 3::numeric, '개'::varchar, 'QUANT'::public.recipe_ingredient_type, '양송이버섯(3개)'::varchar, null::text, true::boolean),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 5::integer, '우유'::text, 200::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '우유(200g)'::varchar, null::text, true::boolean),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 6::integer, '올리브 오일'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '올리브오일(10g)'::varchar, null::text, true::boolean),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 7::integer, '소금'::text, 0.2::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '소금(0.2g)'::varchar, null::text, true::boolean),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 8::integer, '후추'::text, 0.01::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '후춧가루(0.01g)'::varchar, null::text, true::boolean),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 9::integer, '버터'::text, 10::numeric, 'g'::varchar, 'QUANT'::public.recipe_ingredient_type, '버터(10g)'::varchar, null::text, true::boolean);

create temp table tmp_foodsafety_pilot_steps (
  recipe_id uuid not null,
  step_number integer not null,
  instruction text not null,
  component_label text,
  cooking_method_label text not null
) on commit drop;

insert into tmp_foodsafety_pilot_steps (
  recipe_id,
  step_number,
  instruction,
  component_label,
  cooking_method_label
)
values
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 1::integer, '물 1컵 반에 국멸치와 건다시마를 넣어 멸치다시마국물을 만든다.'::text, null::text, '끓이기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 2::integer, '국물을 우린 다시마는 채썬다.'::text, null::text, '끓이기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 3::integer, '느타리버섯은 끓는 물에 데친 후 찢는다.'::text, null::text, '끓이기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 4::integer, '감자와 두부는 3~4cm 가량으로 채를 썰고 홍고추와 대파는 어슷썬다.'::text, null::text, '끓이기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 5::integer, '멸치다시마국물 1컵에 감자를 넣고 끓인 뒤 느타리버섯을 넣어 한소끔 끓이고 두부, 파, 다진 마늘, 홍고추를 넣고 소금으로 간 한다.'::text, null::text, '끓이기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 6::integer, '채 썬 다시마를 고명으로 얹는다'::text, null::text, '끓이기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 1::integer, '양파, 당근, 오이는 채 썰어준다.'::text, null::text, '끓이기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 2::integer, '열무 물김치와 탄산수, 어간장을 넣어 국수 국물을 만들어준다.'::text, null::text, '끓이기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 3::integer, '달걀은 삶아준다.'::text, null::text, '끓이기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 4::integer, '실곤약은 삶을 때 레몬즙을 넣어서 곤약의 특이한 냄새를 제거한다.'::text, null::text, '끓이기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 5::integer, '물기를 제거한 곤약에 어간장을 넣어 밑간을 해준다.'::text, null::text, '끓이기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 6::integer, '그릇에 담고 국물을 부어주고, 채소와 달걀을 곁들여 완성한다.'::text, null::text, '끓이기'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 1::integer, '감자, 양파는 얇게 썰고 애느타리 버섯은 썰어 달궈진 팬에 굽는다.'::text, null::text, '끓이기'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 2::integer, '냄비에 물을 붓고 된장을 푼 뒤 감자, 양파, 두부를 넣어 재료가 투명해지게 끓인 후 된장국의 재료를 건져서 믹서에 넣어 갈고 된장국에 넣어 한번 더 끓인다.'::text, null::text, '끓이기'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 3::integer, '구운 애느타리버섯과 대파를 국에 넣어 끓인 후 그릇에 담는다.'::text, null::text, '끓이기'::text),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 1::integer, '풋고추는 잘게 다진다.'::text, null::text, '끓이기'::text),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 2::integer, '백김치는 먹기 좋은 크기로 썬다.'::text, null::text, '끓이기'::text),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 3::integer, '냄비에 백김치를 볶다가 김치가 익으면 참기름, 후춧가루, 다진 마늘을 넣고 볶는다.'::text, null::text, '끓이기'::text),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 4::integer, '물(200g)을 넣고 끓인다.'::text, null::text, '끓이기'::text),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 5::integer, '물이 끓으면 콩비지와 간장, 풋고추를 넣어 약한 불에서 15분 정도 끓여 마무리한다.'::text, null::text, '끓이기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 1::integer, '쌀을 깨끗하게 씻은 후에 쌀뜨물은 따로 보관하고 불려준 쌀로 밥을 해주고 접시에 펼쳐 식혀준다.'::text, null::text, '볶기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 2::integer, '우엉과 연근, 감자는 송송 다져준 후 아린 맛을 빼기위해 물에 담가준다.'::text, null::text, '볶기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 3::integer, '우엉과 연근, 감자는 물기를 빼고 볶아준다.'::text, null::text, '볶기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 4::integer, '청고추, 양파, 당근은 송송 다져서 함께 볶아준 뒤, 함초 소금을 이용해 1차 간을 해준다.'::text, null::text, '볶기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 5::integer, '그릇에 모든 재료를 넣고 오니기리를 만들어준다.'::text, null::text, '볶기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 6::integer, '그릇에 담아 완성한다.'::text, null::text, '볶기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 1::integer, '식빵은 가장 자리를 잘라 밀대를 이용 하여 얇게 밀어 준비한다.'::text, null::text, '삶기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 2::integer, '감자는 삶은 뒤 곱게 으깨어 올리고당을 넣고 골고루 섞는다.'::text, null::text, '삶기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 3::integer, '달걀은 약 13분 정도 삶아 껍질을 벗기고, 반으로 갈라 썰어놓는다.'::text, null::text, '삶기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 4::integer, '당근과 양파 오이도 얇게 썰어놓는다.'::text, null::text, '삶기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 5::integer, '토마토는 포를 떠서 준비한다.'::text, null::text, '삶기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 6::integer, '으깬 감자(2)에 준비한 달걀(3)과 채소(4)를 넣고 소금을 약간 넣은 뒤 골고루 섞어, 밀어 놓은 식빵에 토마토, 치즈, 양상추와 함께 넣어 돌돌 말아 완성한다.'::text, null::text, '삶기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 1::integer, '저염 된장을 물 300cc에 풀어준 뒤 건새우를 담가 30분 정도 담가준 뒤 살짝 끓여준다.'::text, null::text, '끓이기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 2::integer, '새우를 풀어준 된장 물을 체에 걸러준다.'::text, null::text, '끓이기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 3::integer, '아욱은 뜨거운 물에 데쳐서 먹기 좋게 썬다.'::text, null::text, '끓이기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 4::integer, '냄비에 밥과 된장 물을 풀어 끓인다.'::text, null::text, '끓이기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 5::integer, '어느 정도 끓으면 칵테일새우와 건져 놓았던 새우를 다시 넣어준다.'::text, null::text, '끓이기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 6::integer, '불을 끄기 전에 아욱을 넣어 한 번 더 끓여준 후 완성한다.'::text, null::text, '끓이기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 1::integer, '연어는 소금, 후춧가루, 레몬으로 마리네이드 한다.'::text, null::text, '볶기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 2::integer, '양파, 마늘은 입자있게 다진다.'::text, null::text, '볶기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 3::integer, '토마토는 씨를 제거하고 입자있게 썰고, 파프리카, 피망은 채 썬 뒤 볶는다.'::text, null::text, '볶기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 4::integer, '화이트크림, 생크림을 골고루 섞어 크림소스를 만든다.'::text, null::text, '볶기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 5::integer, '팬에 버터를 넣고 양파, 마늘을 볶다가 만들어 놓은 크림소스를 넣고 졸인다.'::text, null::text, '볶기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 6::integer, '접시에 볶은 야채를 담고, 200°C 오븐에서 10분 정도 구운 연어를 담은 뒤 크림소스를 올린다.'::text, null::text, '볶기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 1::integer, '오이고추는 배를 갈라 씨를 제거하고 세척 후 절임물에 절여준다.'::text, null::text, '섞기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 2::integer, '영양부추, 연근은 송송 다지고 무는 채 썬다.'::text, null::text, '섞기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 3::integer, '손질한 부추와 연근, 무에 절임물을 조금 넣고 절인다.'::text, null::text, '섞기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 4::integer, '고춧가루, 생강청, 통깨를 절임채소에 섞어 소를 만든다.'::text, null::text, '섞기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 5::integer, '오이고추 속에 소를 채워 넣는다.'::text, null::text, '섞기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 6::integer, '오이고추를 그릇에 담고 남은 물을 부어 마무리한다.'::text, null::text, '섞기'::text),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 1::integer, '저염간장, 식초, 레몬즙, 설탕을 혼합하여 간장레몬 소스를 만든다.'::text, '간장 레몬 소스'::text, '굽기'::text),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 2::integer, '호박, 가지, 새송이버섯은 3cm 길이로 자른 후 얇은 편으로 채 썰고, 양파, 파프리카, 피망은 호박 길이로 썬다.'::text, null::text, '굽기'::text),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 3::integer, '가지, 호박, 새송이버섯, 양파, 파프리카, 피망에 올리브유를 바르고 달궈진 그릴 팬에 구운 후 접시에 담고 발사믹크레마를 뿌리고 간장레몬 소스를 곁들인다.'::text, null::text, '굽기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 1::integer, '무는 모양 틀로 자른다.'::text, null::text, '끓이기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 2::integer, '무와 연근을 손질해 놓은 후 소금에 살짝 절여준다.'::text, null::text, '끓이기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 3::integer, '사과와 배는 먹기 좋게 잘라 레몬즙에 뿌려 갈변을 막아준다.'::text, null::text, '끓이기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 4::integer, '물에 청양고추를 넣어 끓여서 식힌다.'::text, null::text, '끓이기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 5::integer, '식힌 물에 국물 재료를 넣어 국물을 만든다.'::text, '국물'::text, '끓이기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 6::integer, '만들어진 국물에 절여진 무, 연근, 사과, 배를 넣어주어 완성한다. 24시간 이후부터 시원하게 먹는다.'::text, null::text, '끓이기'::text),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 1::integer, '물기를 빼고 2cm 정도의 크기로 썰은 부추와 양파를 양념장에 섞어 양념속을 만든다.'::text, '양념장'::text, '섞기'::text),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 2::integer, '깨끗이 씻은 방울토마토는 꼭지를 떼고 윗부분에 칼로 십자모양으로 칼집을 낸다.'::text, null::text, '섞기'::text),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 3::integer, '칼집을 낸 방울토마토에 양념속을 사이사이에 넣어 버무린다.'::text, '양념장'::text, '섞기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 1::integer, '단호박은 1/8 등분으로 갈라 속을 파내고 찜통에서 약 15~20분 정도 충분히 쪄낸다.'::text, null::text, '굽기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 2::integer, '소고기는 채를 썰어 마늘, 간장, 설탕에 양념을 하고 팬에 볶아서 식힌다.'::text, null::text, '굽기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 3::integer, '파프리카와 오이, 적양배추는 채를 썰고, 무순은 물에 잠시 담그어 놓고, 사과는 채를 썰어 설탕물에 잠시 담그어 놓고, 팽이버섯은 밑둥만 잘라 한 줌 집기 좋은 크기로 준비해 놓는다.'::text, null::text, '굽기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 4::integer, '다진마늘과 다진 양파 ,올리브오일, 설탕, 식초, 소금을 넣고, 골고루 섞어 소스를 만들어 놓는다.'::text, '소스'::text, '굽기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 5::integer, '쪄 낸 단호박은 껍질을 벗기고 채에 곱게 내려 밀가루와 물, 소금을 조금 섞어 단호박 반죽을 만들어 놓는다.'::text, '밀전병'::text, '굽기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 6::integer, '팬에 올리브 오일을 바르고, 만들어 놓은 단호박 반죽을 한 국자씩 떠 넣어, 밀전병을 만들고, 밀전병이 익으면, 한 김 식혀, 그 안에 소고기 볶음과 채소를 넣어 돌돌 말아 소스와 함께 완성한다.'::text, null::text, '굽기'::text),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 1::integer, '청양고추와 홍고추를 다져서 참기름에 살짝 볶은 후 볶은 고추에 마요네즈와 레몬즙을 넣어 소스를 만든다.'::text, '레몬마요네즈 소스'::text, '볶기'::text),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 2::integer, '돌나물은 손질하여 찬물에 담구고 새송이버섯은 달군 프라이팬에 참기름을 두르고 노릇 하게 굽는다.'::text, null::text, '볶기'::text),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 3::integer, '돌나물은 물기를 빼고 구운 새송이버섯과 레몬마요네즈 소스를 넣고 버무려 접시에 담는다.'::text, null::text, '볶기'::text),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 1::integer, '토마토는 깨끗이 씻어 슬라이스한다.'::text, null::text, '끓이기'::text),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 2::integer, '두부는 원형틀을 이용해서 토마토와 같은 크기로 만들고 소금을 살짝 뿌린 뒤 물기를 제거한다.'::text, null::text, '끓이기'::text),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 3::integer, '팬에 올리브오일을 두르고 두부를 살짝 굽는다.'::text, null::text, '끓이기'::text),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 4::integer, '어린잎은 찬물에 담근다.'::text, null::text, '끓이기'::text),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 5::integer, '발사믹소스에 설탕과 레몬즙을 넣고 골고루 섞어 소스를 만든다.'::text, null::text, '끓이기'::text),
  ('7e169300-b4d5-5a14-9b31-aa989035d862'::uuid, 6::integer, '두부와 준비한 토마토를 접시에 돌려 담고 어린잎을 위에 올린 뒤 먹기 직전에 발사믹소스와 파마산치즈를 뿌려 완성한다.'::text, null::text, '끓이기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 1::integer, '올리브오일, 발사믹식초, 후춧가루를 섞어 차게 식혀 드레싱을 만든다.'::text, '드레싱'::text, '굽기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 2::integer, '가지와 토마토는 5mm두께로 썰고 120도 오븐에 20분 구운 후 구운 가지는 물기를 제거한다.'::text, null::text, '굽기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 3::integer, '팬에 올리브오일을 두르고 약불에서 채 썬 마늘을 볶다가, 가지를 넣고 구운 후 접시에 토마토, 가지를 번갈아 담고 무순으로 장식하고 드레싱을 곁들인다.'::text, null::text, '굽기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 1::integer, '감자는 껍질을 벗겨 삶는다.'::text, null::text, '튀기기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 2::integer, '오이와 당근은 어슷썰기를 하고 양파는 채를 썰어놓는다.'::text, null::text, '튀기기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 3::integer, '썰어 놓은 채소에 소금과 물을 넣고 살짝 절여, 물기를 짜놓는다.'::text, null::text, '튀기기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 4::integer, '삶아 놓은 감자를 채에 내리고 생크림을 넣어 섞는다.'::text, null::text, '튀기기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 5::integer, '생크림을 넣은 감자에 절여 놓은 채소와 모짜렐라치즈를 넣고 골고루 섞는다.'::text, null::text, '튀기기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 6::integer, '섞여진 감자를 크로켓 모양을 만들어 밀가루, 달걀물, 빵가루를 묻혀 튀김기름 170~180°C 온도에서 바삭하게 튀겨 냅킨에 올려 기름을 제거하고, 접시에 담아 완성한다.'::text, null::text, '튀기기'::text),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 1::integer, '간장, 레몬즙, 설탕, 다진 홍고추를 섞어 드레싱을 만든다.'::text, '드레싱'::text, '끓이기'::text),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 2::integer, '민들레 잎은 4×4cm로 썰고, 비트는 채 썰고 물에 담가 색을 뺀다.'::text, null::text, '끓이기'::text),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 3::integer, '오렌지는 씻어 껍질만 발라 채 썰고 민들레 잎, 비트, 오렌지 껍질을 섞어 접시에 담고 드레싱을 곁들인다.'::text, null::text, '끓이기'::text),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 1::integer, '손질된 새우를 끓는 물에 데쳐 건진다.'::text, null::text, '찌기'::text),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 2::integer, '연두부, 달걀, 생크림, 설탕에 녹인 무염버터를 믹서에 넣고 간 뒤 새우(1)를 함께 섞어 그릇에 담는다.'::text, null::text, '찌기'::text),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 3::integer, '시금치를 잘게 다져 혼합물 그릇(2)에 뿌리고 찜기에 넣고 중간 불에서 10분 정도 찐다.'::text, null::text, '찌기'::text),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 1::integer, '배추를 소금물에 하루 동안 절인 후 물기를 빼고 석류는 즙을 낸다.'::text, null::text, '섞기'::text),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 2::integer, '무는 채 썰고, 쪽파와 미나리는 4cm로 자른다.'::text, null::text, '섞기'::text),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 3::integer, '무채, 미나리, 쪽파, 다진 마늘, 다진 생강, 새우젓국을 넣고 섞어 소를 만들고 절인 배추에 소를 넣고 오므려 싼다. 석류즙에 소를 채운 배추를 담가 완성한다.'::text, null::text, '섞기'::text),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 1::integer, '찬물이 담긴 냄비에 식초, 소금을 넣고 메추리알을 삶는다. 물이 끓어오르면 5분 정도 더 삶아 찬물에 헹군 후 껍질을 벗기고 반으로 자른다.'::text, null::text, '끓이기'::text),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 2::integer, '딸기를 흐르는 물에 가볍게 씻어 꼭지를 제거한 후 물기를 빼고 반으로 자른다.'::text, null::text, '끓이기'::text),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 3::integer, '양상추는 찬물에 담갔다가 물기를 빼고 한입 크기로 찢은 후 접시에 양상추, 딸기, 블루베리, 메추리알을 담고 플레인요거트를 끼얹는다.'::text, null::text, '끓이기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 1::integer, '시금치는 끓는 소금물에 데쳐 찬물에 헹구어 물기를 짜고 우유를 넣고 블렌더에 곱게 갈아 체에 거른다.'::text, '시금치우유 소스'::text, '찌기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 2::integer, '껍질 벗긴 감자는 찜기에 넣어 20분 정도 삶고 꺼내서 으깨고, 아몬드는 잘게 다지며, 치커리는 곱게 다진다.'::text, '그린매쉬드포테이토'::text, '찌기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 3::integer, '으깬 감자, 다진 치커리, 시금치 우유소스, 설탕을 넣고 섞어 접시에 담고 아몬드, 크랜베리를 올리고 시금치우유 소스를 곁들인다.'::text, '그린매쉬드포테이토'::text, '찌기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 1::integer, '애호박은 반달 모양으로 썰어 준다.'::text, null::text, '볶기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 2::integer, '썰어 놓은 호박에 소금을 넣고 살짝 절여 물기를 제거하고 준비한다.'::text, null::text, '볶기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 3::integer, '양파는 채를 썰고, 대파는 1/4로 자르고, 홍고추는 어슷썰어 자연스럽게 씨를 제거해 놓는다.'::text, null::text, '볶기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 4::integer, '팬에 들기름을 넣고, 마늘을 먼저 볶는다.'::text, null::text, '볶기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 5::integer, '볶아진 팬에 건새우를 넣어 볶아준다.'::text, null::text, '볶기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 6::integer, '건새우가 볶아지면, 썰어 놓은 호박을 넣어 볶다가 양파와 대파를 넣어 볶으면서 들깨 가루와 넣어 살짝 볶으면서 마지막에 썰어 놓은 홍고추를 넣어 한 번만 더 볶아 완성한다.'::text, null::text, '볶기'::text),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 1::integer, '감자는 믹서에 갈고 양배추는 채 썰고 고기, 당근, 청양고추, 두부는 다진다.'::text, null::text, '굽기'::text),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 2::integer, '준비해둔 재료를 모두 섞고 부침가루와 계란을 넣어 반죽한다.'::text, null::text, '굽기'::text),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 3::integer, '가열된 팬에 기름을 두르고 반죽을 부어 굽고 소스를 함께 곁들인다.'::text, '소스'::text, '굽기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 1::integer, '연근은 껍질을 벗긴다.'::text, null::text, '튀기기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 2::integer, '껍질벗긴 연근은 얇게 썬다.'::text, null::text, '튀기기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 3::integer, '물 200g에 식초 10g을 섞는다'::text, null::text, '튀기기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 4::integer, '식촛물에 썬 연근을 담근다.'::text, null::text, '튀기기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 5::integer, '연근을 체에 건져 물기를 뺀다.'::text, null::text, '튀기기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 6::integer, '연근을 바삭하게 튀긴 뒤 천일염을 살짝 뿌리고, 계피가루를 묻힌다.'::text, null::text, '튀기기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 1::integer, '양파는 채 썰어 물에 담가주고, 오이는 돌려 깎기 해서 물에 담가준다.'::text, null::text, '부치기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 2::integer, '연근은 껍질을 까고 얇게 썰어서 식초 2방울을 넣은 물에 데쳐준다.'::text, null::text, '부치기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 3::integer, '밤도 아주 얇게 썰어서 물에 담가준다.'::text, null::text, '부치기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 4::integer, '소스 재료를 모두 넣고 믹서에 간다.'::text, '소스'::text, '부치기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 5::integer, '물에 데쳐낸 연근은 키친타월에 올려서 물기를 완전히 제거한다.'::text, null::text, '부치기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 6::integer, '모든 재료를 넣고 소스에 버무려준다.'::text, null::text, '부치기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 1::integer, '모시조개는 물에 소금을 넣고, 담그어 해감을 한다.'::text, null::text, '끓이기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 2::integer, '연어는 사각지게 썰어 준비한다.'::text, null::text, '끓이기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 3::integer, '당근, 양파, 감자는 사각크기로 썰어 놓고, 청피망은 채를 썰어 당근과 비슷한 길이로 잘라둔다.'::text, null::text, '끓이기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 4::integer, '냄비에 버터와 밀가루를 넣고 볶다가 채소를 넣어 같이 볶는다.'::text, null::text, '끓이기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 5::integer, '볶아지는 냄비에 모시조개와 육수를 넣고 끓인다.'::text, null::text, '끓이기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 6::integer, '거품을 걷어내고, 월계수 잎과 통후추, 통마늘을 넣고 끓이다가 연어와 생크림을 넣어 한 소큼 끓으면 완성한다.'::text, null::text, '끓이기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 1::integer, '뜨거운 물에 파스타면을 삶아낸 뒤 물기를 빼준다.'::text, null::text, '볶기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 2::integer, '송송 썬 청양고추를 생들기름에 볶아주다 면을 볶는다.'::text, null::text, '볶기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 3::integer, '볶아준 청양고추에 삶아진 면을 볶아준다.'::text, null::text, '볶기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 4::integer, '열무김치는 송송 썰어서 들기름에 살짝 볶아준다.'::text, null::text, '볶기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 5::integer, '오이는 돌려깎기 해서 채 썰어주고 청고추, 2가지색 파프리카, 당근도 채 썰어 각각 볶아 준다.'::text, null::text, '볶기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 6::integer, '청양고추에 볶아진 파스타면을 볶은 채소와 한 번 더 볶아 완성한다.'::text, null::text, '볶기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 1::integer, '오징어는 내장을 빼서 흐르는 물에 깨끗이 씻은 후, 다리는 송송 다져주고 레몬즙을 살짝 뿌려준다.'::text, null::text, '굽기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 2::integer, '강낭콩은 먼저 삶아준다.'::text, null::text, '굽기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 3::integer, '피망, 당근, 양파, 대파, 파프리카는 송송 다져준다.'::text, null::text, '굽기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 4::integer, '잘라준 오징어다리는 다진마늘과 살짝 볶아준다.'::text, null::text, '굽기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 5::integer, '볼에 귀리밥을 넣고 카레가루를 넣고 모든 재료를 섞어 소 재료를 만든다.'::text, null::text, '굽기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 6::integer, '오징어 안쪽에 밀가루를 묻혀주고 소를 채워 팬에 구워준다.'::text, null::text, '굽기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 1::integer, '쌀은 깨끗이 씻어 30분 정도 불린다'::text, null::text, '끓이기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 2::integer, '전복은 수저로 떼어 내어 소금으로 세척한다.'::text, null::text, '끓이기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 3::integer, '준비된 전복에 버터를 두르고 굽는다'::text, null::text, '끓이기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 4::integer, '당근, 양파, 양송이는 입자 있게 다진다.'::text, null::text, '끓이기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 5::integer, '냄비에 올리브 오일을 넣고 불린 쌀을 볶는다.'::text, null::text, '끓이기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 6::integer, '쌀이 어느 정도 볶아지면 다져 놓은 야채를 넣어 볶다가 우유를 넣어 끓이고, 쌀이 퍼지면 구워 놓은 전복을 넣어 다시 끓인다.'::text, null::text, '끓이기'::text);

do $$
declare
  v_missing_ingredients text;
  v_missing_methods text;
begin
  select string_agg(distinct seed.standard_name, ', ' order by seed.standard_name)
    into v_missing_ingredients
    from tmp_foodsafety_pilot_ingredients seed
    left join public.ingredients ingredient
      on ingredient.standard_name = seed.standard_name
   where ingredient.id is null;

  if v_missing_ingredients is not null then
    raise exception 'FoodSafety pilot seed has missing ingredients: %', v_missing_ingredients;
  end if;

  select string_agg(distinct seed.cooking_method_label, ', ' order by seed.cooking_method_label)
    into v_missing_methods
    from tmp_foodsafety_pilot_steps seed
    left join public.cooking_methods method
      on method.label = seed.cooking_method_label
   where method.id is null;

  if v_missing_methods is not null then
    raise exception 'FoodSafety pilot seed has missing cooking methods: %', v_missing_methods;
  end if;
end $$;

insert into public.recipes (
  id,
  title,
  description,
  thumbnail_url,
  base_servings,
  tags,
  source_type,
  created_by,
  view_count,
  like_count,
  save_count,
  plan_count,
  cook_count,
  created_at,
  updated_at
)
select
  id,
  title,
  description,
  thumbnail_url,
  base_servings,
  tags,
  'system'::public.recipe_source_type,
  null::uuid,
  0,
  0,
  0,
  0,
  0,
  now(),
  now()
from tmp_foodsafety_pilot_recipes
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    thumbnail_url = excluded.thumbnail_url,
    base_servings = excluded.base_servings,
    tags = excluded.tags,
    source_type = excluded.source_type,
    updated_at = now();

delete from public.recipe_sources
 where recipe_id in (select id from tmp_foodsafety_pilot_recipes);

delete from public.recipe_ingredients
 where recipe_id in (select id from tmp_foodsafety_pilot_recipes);

delete from public.recipe_steps
 where recipe_id in (select id from tmp_foodsafety_pilot_recipes);

delete from public.recipe_tags
 where recipe_id in (select id from tmp_foodsafety_pilot_recipes);

insert into public.recipe_sources (
  recipe_id,
  extraction_methods,
  extraction_meta_json,
  raw_extracted_text
)
select
  id,
  array['foodsafety_cookrcp_api', 'user_reviewed_pilot_30']::text[],
  extraction_meta_json,
  raw_extracted_text
from tmp_foodsafety_pilot_recipes;

do $$
declare
  v_recipe record;
begin
  for v_recipe in
    select id, tags from tmp_foodsafety_pilot_recipes
  loop
    perform public.set_recipe_tags(
      v_recipe.id,
      public.build_recipe_tag_payload(v_recipe.tags, 'provider'),
      null,
      'provider'
    );
  end loop;
end $$;

insert into public.recipe_ingredients (
  recipe_id,
  ingredient_id,
  amount,
  unit,
  ingredient_type,
  display_text,
  component_label,
  sort_order,
  scalable
)
select
  seed.recipe_id,
  ingredient.id,
  seed.amount,
  seed.unit,
  seed.ingredient_type,
  seed.display_text,
  seed.component_label,
  seed.sort_order,
  seed.scalable
from tmp_foodsafety_pilot_ingredients seed
join public.ingredients ingredient
  on ingredient.standard_name = seed.standard_name
order by seed.recipe_id, seed.sort_order;

insert into public.recipe_steps (
  recipe_id,
  step_number,
  instruction,
  component_label,
  cooking_method_id,
  ingredients_used,
  heat_level,
  duration_seconds,
  duration_text
)
select
  seed.recipe_id,
  seed.step_number,
  seed.instruction,
  seed.component_label,
  method.id,
  '[]'::jsonb,
  null::varchar,
  null::integer,
  null::varchar
from tmp_foodsafety_pilot_steps seed
join public.cooking_methods method
  on method.label = seed.cooking_method_label
order by seed.recipe_id, seed.step_number;
