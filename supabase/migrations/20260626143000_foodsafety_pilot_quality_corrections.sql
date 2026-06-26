-- FoodSafety pilot recipe quality corrections
-- Generated from docs/workpacks/28-external-ingredient-data-ingest-gate/pilot-30-quality-decisions-2026-06-26.json.
-- Reviewed directly by Codex for pilot 30 public recipes.

insert into public.tags (normalized_key, label, kind, is_system, theme_eligible)
values
  ('간단요리'::text, '간단요리'::text, 'semantic'::text, true, true),
  ('고단백'::text, '고단백'::text, 'semantic'::text, true, true),
  ('국물요리'::text, '국물요리'::text, 'semantic'::text, true, true),
  ('다이어트'::text, '다이어트'::text, 'semantic'::text, true, true),
  ('디저트'::text, '디저트'::text, 'semantic'::text, true, true),
  ('매콤'::text, '매콤'::text, 'semantic'::text, true, true),
  ('면요리'::text, '면요리'::text, 'semantic'::text, true, true),
  ('밑반찬'::text, '밑반찬'::text, 'semantic'::text, true, true),
  ('샐러드'::text, '샐러드'::text, 'semantic'::text, true, true),
  ('한그릇요리'::text, '한그릇요리'::text, 'semantic'::text, true, true),
  ('한식'::text, '한식'::text, 'semantic'::text, true, true)
on conflict (normalized_key) do update
set label = excluded.label,
    kind = excluded.kind,
    is_system = excluded.is_system,
    theme_eligible = excluded.theme_eligible,
    updated_at = now();

insert into public.ingredients (standard_name, category, default_unit)
values
  ('치커리'::text, '채소'::text, null::varchar)
on conflict (standard_name) do nothing;

create temp table tmp_foodsafety_quality_recipes (
  recipe_id uuid primary key,
  title text not null,
  thumbnail_url text,
  visible_tags text[] not null,
  meta_patch jsonb not null
) on commit drop;

insert into tmp_foodsafety_quality_recipes (recipe_id, title, thumbnail_url, visible_tags, meta_patch)
values
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '감자느타리버섯국'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/20141118/20141118102104_1416273664244.jpg'::text, array['한식'::text, '국물요리'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","국물요리"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/20141118/20141118102104_1416273664244.jpg"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/674-1.jpg"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/674-2.jpg"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/674-3.jpg"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/674-4.jpg"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/674-5.jpg"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/674-6.jpg"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '다이어트국수'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00386_2.png'::text, array['면요리'::text, '다이어트'::text, '한그릇요리'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["면요리","다이어트","한그릇요리"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00386_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00386_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00386_01.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00386_02.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00386_03.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00386_04.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00386_05.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00386_06.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, '된장국'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00037_2.png'::text, array['한식'::text, '국물요리'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","국물요리"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00037_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00037_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00037_2.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00037_4.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00037_6.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, '백김치콩비지찌개'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00273_2.png'::text, array['한식'::text, '국물요리'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","국물요리"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00273_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00273_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00273_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00273_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00273_3.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00273_4.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00273_5.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '근채류주먹밥'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00337_2.png'::text, array['한식'::text, '한그릇요리'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","한그릇요리"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00337_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00337_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00337_01.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00337_02.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00337_03.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00337_04.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00337_05.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00337_06.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '삼색샌드위치'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00441_2.png'::text, array['한그릇요리'::text, '간단요리'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한그릇요리","간단요리"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00441_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00441_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00441_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00441_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00441_3.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00441_4.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00441_5.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00441_6.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, '새우아욱죽'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00395_2.png'::text, array['한식'::text, '한그릇요리'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","한그릇요리"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00395_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00395_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00395_01.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00395_02.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00395_03.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00395_04.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00395_05.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00395_06.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '연어오븐구이'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00571_2.png'::text, array['한그릇요리'::text, '고단백'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한그릇요리","고단백"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00571_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00571_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00571_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00571_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00571_3.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00571_4.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00571_5.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00571_6.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '고추김치'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/20230306/20230306052031_1678090831734.jpg'::text, array['한식'::text, '밑반찬'::text, '매콤'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","밑반찬","매콤"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/20230306/20230306052031_1678090831734.jpg"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/20230306/20230306052044_1678090844312.jpg"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/20230306/20230306052119_1678090879888.jpg"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/20230306/20230306052136_1678090896972.jpg"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/20230306/20230306052154_1678090914303.jpg"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/20230306/20230306052208_1678090928991.jpg"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/20230306/20230306052224_1678090944885.jpg"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/20230306/20230306052240_1678090960385.jpg"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '구운채소와 간장레몬 소스'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00093_2.png'::text, array['밑반찬'::text, '간단요리'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["밑반찬","간단요리"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00093_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00093_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00093_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00093_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00093_3.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, '매실동치미'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00415_2.png'::text, array['한식'::text, '밑반찬'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","밑반찬"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00415_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00415_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00415_01.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00415_02.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00415_03.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00415_04.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00415_05.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00415_06.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '방울토마토 소박이'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00031_2.png'::text, array['한식'::text, '밑반찬'::text, '매콤'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","밑반찬","매콤"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00031_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00031_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00031_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00031_4.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00031_5.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '단호박소고기롤'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00537_2.png'::text, array['한식'::text, '밑반찬'::text, '고단백'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","밑반찬","고단백"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00537_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00537_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00537_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00537_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00537_3.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00537_4.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00537_5.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00537_6.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, '돌나물 샐러드'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00074_2.png'::text, array['샐러드'::text, '다이어트'::text, '밑반찬'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["샐러드","다이어트","밑반찬"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00074_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00074_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00074_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00074_4.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00074_5.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, '토마토 가지 카프레제'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00202_2.png'::text, array['샐러드'::text, '다이어트'::text, '간단요리'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["샐러드","다이어트","간단요리"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00202_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00202_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00202_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00202_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00202_5.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '치즈감자크로켓'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00502_2.png'::text, array['디저트'::text, '고단백'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["디저트","고단백"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00502_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00502_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00502_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00502_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00502_3.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00502_4.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00502_5.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00502_6.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, '민들레 샐러드'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00201_2.png'::text, array['샐러드'::text, '다이어트'::text, '밑반찬'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["샐러드","다이어트","밑반찬"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00201_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00201_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00201_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00201_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00201_4.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, '새우 두부 계란찜'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00028_2.png'::text, array['한식'::text, '밑반찬'::text, '고단백'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","밑반찬","고단백"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00028_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00028_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00028_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00028_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00028_3.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '석류 보쌈김치'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00159_2.png'::text, array['한식'::text, '밑반찬'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","밑반찬"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00159_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00159_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00159_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00159_3.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00159_4.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, '스트로베리 샐러드'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00087_2.png'::text, array['샐러드'::text, '다이어트'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["샐러드","다이어트"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00087_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00087_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00087_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00087_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00087_4.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, '시금치 우유 소스와 그린매쉬드포테이토'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00089_2.png'::text, array['밑반찬'::text, '다이어트'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["밑반찬","다이어트"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00089_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00089_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00089_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00089_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00089_5.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, '애호박들깨볶음'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00531_2.png'::text, array['한식'::text, '밑반찬'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","밑반찬"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00531_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00531_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00531_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00531_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00531_3.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00531_4.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00531_5.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00531_6.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '양배추감자전'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00181_2.png'::text, array['한식'::text, '밑반찬'::text, '고단백'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","밑반찬","고단백"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00181_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00181_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00181_4.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00181_5.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00181_6.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, '연근부각'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00665_2.png'::text, array['한식'::text, '밑반찬'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","밑반찬"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00665_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00665_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00665_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00665_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00665_3.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00665_4.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00665_5.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00665_6.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '연근초무침'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00419_2.png'::text, array['한식'::text, '밑반찬'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한식","밑반찬"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00419_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00419_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00419_01.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00419_02.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00419_03.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00419_04.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00419_05.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00419_06.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '연어차우더스프'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00514_2.png'::text, array['국물요리'::text, '한그릇요리'::text, '고단백'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["국물요리","한그릇요리","고단백"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00514_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00514_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00514_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00514_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00514_3.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00514_4.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00514_5.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00514_6.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '열무김치파스타'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00330_2.png'::text, array['면요리'::text, '한그릇요리'::text, '한식'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["면요리","한그릇요리","한식"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00330_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00330_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00330_01.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00330_02.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00330_03.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00330_04.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00330_05.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00330_06.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '오징어콩순대'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00390_2.png'::text, array['한그릇요리'::text, '고단백'::text, '한식'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한그릇요리","고단백","한식"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00390_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00390_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00390_01.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00390_02.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00390_03.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00390_04.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00390_05.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00390_06.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '전복리조또'::text, 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00576_2.png'::text, array['한그릇요리'::text, '고단백'::text]::text[], '{"reviewed_scope":"pilot_30_quality_corrected","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["한그릇요리","고단백"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00576_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00576_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00576_1.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00576_2.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00576_3.png"},{"role":"step","source_key":"MANUAL_IMG04","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00576_4.png"},{"role":"step","source_key":"MANUAL_IMG05","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00576_5.png"},{"role":"step","source_key":"MANUAL_IMG06","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00576_6.png"}],"corrections":{"step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb);

do $$
declare
  v_missing text;
begin
  select string_agg(q.title, ', ' order by q.title)
    into v_missing
    from tmp_foodsafety_quality_recipes q
    left join public.recipes r on r.id = q.recipe_id
   where r.id is null;

  if v_missing is not null then
    raise exception 'FoodSafety quality correction missing recipes: %', v_missing;
  end if;
end $$;

update public.recipes r
   set thumbnail_url = q.thumbnail_url,
       tags = q.visible_tags,
       updated_at = now()
  from tmp_foodsafety_quality_recipes q
 where r.id = q.recipe_id;

update public.recipe_sources s
   set extraction_meta_json = s.extraction_meta_json || q.meta_patch,
       extraction_methods = (
         select array_agg(distinct method_name order by method_name)
           from unnest(s.extraction_methods || array['manual_pilot_quality_review']::text[]) as method(method_name)
       )
  from tmp_foodsafety_quality_recipes q
 where s.recipe_id = q.recipe_id;

do $$
declare
  v_recipe record;
begin
  for v_recipe in select recipe_id, visible_tags from tmp_foodsafety_quality_recipes loop
    perform public.set_recipe_tags(
      v_recipe.recipe_id,
      public.build_recipe_tag_payload(v_recipe.visible_tags, 'user_reviewed'),
      null,
      'user_reviewed'
    );
  end loop;
end $$;

create temp table tmp_foodsafety_quality_step_methods (
  recipe_id uuid not null,
  step_number integer not null,
  method_label text not null,
  primary key (recipe_id, step_number)
) on commit drop;

insert into tmp_foodsafety_quality_step_methods (recipe_id, step_number, method_label)
values
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 1::integer, '끓이기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 2::integer, '썰기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 3::integer, '데치기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 4::integer, '썰기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 5::integer, '끓이기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 6::integer, '섞기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 1::integer, '썰기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 2::integer, '섞기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 3::integer, '삶기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 4::integer, '삶기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 5::integer, '밑간'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 6::integer, '섞기'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 1::integer, '굽기'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 2::integer, '끓이기'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 3::integer, '끓이기'::text),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 1::integer, '다지기'::text),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 2::integer, '썰기'::text),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 3::integer, '볶기'::text),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 4::integer, '끓이기'::text),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, 5::integer, '끓이기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 1::integer, '끓이기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 2::integer, '다지기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 3::integer, '볶기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 4::integer, '볶기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 5::integer, '섞기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 6::integer, '섞기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 1::integer, '썰기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 2::integer, '삶기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 3::integer, '삶기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 4::integer, '썰기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 5::integer, '썰기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 6::integer, '섞기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 1::integer, '끓이기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 2::integer, '섞기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 3::integer, '데치기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 4::integer, '끓이기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 5::integer, '끓이기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 6::integer, '끓이기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 1::integer, '밑간'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 2::integer, '다지기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 3::integer, '볶기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 4::integer, '섞기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 5::integer, '졸이기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 6::integer, '오븐굽기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 1::integer, '절이기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 2::integer, '다지기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 3::integer, '절이기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 4::integer, '섞기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 5::integer, '섞기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 6::integer, '섞기'::text),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 1::integer, '섞기'::text),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 2::integer, '썰기'::text),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, 3::integer, '굽기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 1::integer, '썰기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 2::integer, '절이기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 3::integer, '썰기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 4::integer, '끓이기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 5::integer, '섞기'::text),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, 6::integer, '절이기'::text),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 1::integer, '섞기'::text),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 2::integer, '썰기'::text),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 3::integer, '무치기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 1::integer, '찌기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 2::integer, '볶기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 3::integer, '썰기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 4::integer, '섞기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 5::integer, '섞기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 6::integer, '부치기'::text),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 1::integer, '볶기'::text),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 2::integer, '굽기'::text),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 3::integer, '무치기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 1::integer, '섞기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 2::integer, '오븐굽기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 3::integer, '굽기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 1::integer, '삶기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 2::integer, '썰기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 3::integer, '절이기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 4::integer, '섞기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 5::integer, '섞기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 6::integer, '튀기기'::text),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 1::integer, '섞기'::text),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 2::integer, '썰기'::text),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, 3::integer, '섞기'::text),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 1::integer, '데치기'::text),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 2::integer, '섞기'::text),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 3::integer, '찌기'::text),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 1::integer, '절이기'::text),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 2::integer, '썰기'::text),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 3::integer, '섞기'::text),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 1::integer, '삶기'::text),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 2::integer, '썰기'::text),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, 3::integer, '섞기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 1::integer, '데치기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 2::integer, '찌기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 3::integer, '섞기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 1::integer, '썰기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 2::integer, '절이기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 3::integer, '썰기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 4::integer, '볶기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 5::integer, '볶기'::text),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, 6::integer, '볶기'::text),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 1::integer, '다지기'::text),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 2::integer, '섞기'::text),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 3::integer, '부치기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 1::integer, '썰기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 2::integer, '썰기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 3::integer, '섞기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 4::integer, '절이기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 5::integer, '섞기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 6::integer, '튀기기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 1::integer, '썰기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 2::integer, '데치기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 3::integer, '썰기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 4::integer, '섞기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 5::integer, '섞기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 6::integer, '무치기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 1::integer, '절이기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 2::integer, '썰기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 3::integer, '썰기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 4::integer, '볶기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 5::integer, '끓이기'::text),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, 6::integer, '끓이기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 1::integer, '삶기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 2::integer, '볶기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 3::integer, '볶기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 4::integer, '볶기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 5::integer, '볶기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 6::integer, '볶기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 1::integer, '다지기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 2::integer, '삶기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 3::integer, '다지기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 4::integer, '볶기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 5::integer, '섞기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 6::integer, '굽기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 1::integer, '절이기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 2::integer, '섞기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 3::integer, '굽기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 4::integer, '다지기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 5::integer, '볶기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 6::integer, '끓이기'::text);

do $$
declare
  v_missing text;
begin
  select string_agg(distinct method_label, ', ' order by method_label)
    into v_missing
    from tmp_foodsafety_quality_step_methods q
    left join public.cooking_methods method on method.label = q.method_label
   where method.id is null;

  if v_missing is not null then
    raise exception 'FoodSafety quality correction missing cooking methods: %', v_missing;
  end if;
end $$;

update public.recipe_steps step
   set cooking_method_id = method.id
  from tmp_foodsafety_quality_step_methods q
  join public.cooking_methods method on method.label = q.method_label
 where step.recipe_id = q.recipe_id
   and step.step_number = q.step_number;

create temp table tmp_foodsafety_quality_ingredient_order (
  recipe_id uuid not null,
  standard_name text not null,
  display_text text,
  component_label text,
  previous_sort_order integer not null,
  sort_order integer not null
) on commit drop;

insert into tmp_foodsafety_quality_ingredient_order (
  recipe_id, standard_name, display_text, component_label, previous_sort_order, sort_order
)
values
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '물'::text, '물 300g'::text, null::text, 4::integer, 0::integer),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '멸치'::text, '국멸치 5g'::text, null::text, 5::integer, 1::integer),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '다시마'::text, '건다시마 3g'::text, null::text, 7::integer, 2::integer),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '느타리버섯'::text, '느타리버섯 15g'::text, null::text, 1::integer, 3::integer),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '감자'::text, '감자 30g'::text, null::text, 0::integer, 4::integer),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '두부'::text, '두부 8g'::text, null::text, 2::integer, 5::integer),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '홍고추'::text, '홍고추 3g'::text, null::text, 6::integer, 6::integer),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '파'::text, '파 5g'::text, null::text, 3::integer, 7::integer),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '다진마늘'::text, '다진 마늘 3g'::text, null::text, 8::integer, 8::integer),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '소금'::text, '소금 0.5g'::text, null::text, 9::integer, 9::integer),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '양파'::text, '양파 50g'::text, null::text, 5::integer, 0::integer),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '당근'::text, '당근 20g'::text, null::text, 4::integer, 1::integer),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '오이'::text, '오이 25g'::text, null::text, 2::integer, 2::integer),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '열무김치 국물'::text, '물김치국물 200g'::text, '국수 국물'::text, 1::integer, 3::integer),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '탄산수'::text, '탄산수 50ml'::text, '국수 국물'::text, 8::integer, 4::integer),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '어간장'::text, '어간장 5g'::text, '국수 국물'::text, 9::integer, 5::integer),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '달걀'::text, '달걀 1개(60g)'::text, null::text, 3::integer, 6::integer),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '실곤약'::text, '실곤약 200g'::text, null::text, 0::integer, 7::integer),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '레몬즙'::text, '레몬즙 15g'::text, null::text, 7::integer, 8::integer),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '통깨'::text, '통깨 3g'::text, null::text, 6::integer, 9::integer),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, '감자'::text, '감자 10g(4×3×1cm)'::text, null::text, 2::integer, 0::integer),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, '양파'::text, '양파 10g(2×1cm)'::text, null::text, 3::integer, 1::integer),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, '애느타리버섯'::text, '애느타리버섯 20g(4가닥)'::text, null::text, 1::integer, 2::integer),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, '물'::text, '물 300ml(11⁄2컵)'::text, null::text, 6::integer, 3::integer),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, '된장'::text, '된장 5g(1작은술)'::text, null::text, 5::integer, 4::integer),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, '두부'::text, '두부 20g(2×2×2cm)'::text, null::text, 0::integer, 5::integer),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, '대파'::text, '대파 10g(5cm)'::text, null::text, 4::integer, 6::integer),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, '풋고추'::text, '풋고추(10g)'::text, '재료'::text, 0::integer, 0::integer),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, '백김치'::text, '백김치(100g)'::text, '재료'::text, 2::integer, 1::integer),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, '참기름'::text, '참기름(8g)'::text, '양념'::text, 4::integer, 2::integer),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, '후추'::text, '후춧가루(0.2g)'::text, '양념'::text, 5::integer, 3::integer),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, '다진마늘'::text, '다진 마늘(10g)'::text, '양념'::text, 6::integer, 4::integer),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, '물'::text, '물(200g)'::text, null::text, 1::integer, 5::integer),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, '비지'::text, '콩비지(100g)'::text, '재료'::text, 3::integer, 6::integer),
  ('8a680421-7dad-54c1-8815-83f65908187c'::uuid, '간장'::text, '간장(2g)'::text, '양념'::text, 7::integer, 7::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '쌀'::text, '쌀 100g'::text, null::text, 6::integer, 0::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '우엉'::text, '우엉 20g'::text, null::text, 0::integer, 1::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '연근'::text, '연근 20g'::text, null::text, 1::integer, 2::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '감자'::text, '감자 20g'::text, null::text, 2::integer, 3::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '고추'::text, '청고추 10g'::text, null::text, 3::integer, 4::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '양파'::text, '양파 10g'::text, null::text, 4::integer, 5::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '당근'::text, '당근 10g'::text, null::text, 5::integer, 6::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '소금'::text, '함초소금 2g'::text, null::text, 12::integer, 7::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '오이'::text, '오이 70g'::text, null::text, 7::integer, 8::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '통깨'::text, '통깨 1g'::text, null::text, 8::integer, 9::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '간장'::text, '맛간장 15g'::text, null::text, 9::integer, 10::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '참기름'::text, '참기름 5g'::text, null::text, 10::integer, 11::integer),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '마늘기름'::text, '마늘기름 15g'::text, null::text, 11::integer, 12::integer),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '식빵'::text, '식빵(100g)'::text, null::text, 0::integer, 0::integer),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '감자'::text, '감자(30g)'::text, null::text, 4::integer, 1::integer),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '올리고당'::text, '올리고당(20g)'::text, null::text, 5::integer, 2::integer),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '달걀'::text, '달걀(60g)'::text, null::text, 6::integer, 3::integer),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '당근'::text, '당근(20g)'::text, null::text, 7::integer, 4::integer),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '양파'::text, '양파(20g)'::text, null::text, 9::integer, 5::integer),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '오이'::text, '오이(20g)'::text, null::text, 8::integer, 6::integer),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '토마토'::text, '토마토(20g)'::text, null::text, 1::integer, 7::integer),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '소금'::text, '소금(0.3g)'::text, null::text, 10::integer, 8::integer),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '치즈'::text, '어린이치즈(20g)'::text, null::text, 2::integer, 9::integer),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, '양상추'::text, '양상추(30g)'::text, null::text, 3::integer, 10::integer),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, '된장'::text, '저염 된장 30g'::text, null::text, 4::integer, 0::integer),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, '건새우'::text, '건새우 25g'::text, null::text, 2::integer, 1::integer),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, '귀리밥'::text, '귀리밥 100g'::text, null::text, 0::integer, 2::integer),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, '칵테일새우'::text, '칵테일새우 25g'::text, null::text, 3::integer, 3::integer),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, '아욱'::text, '아욱 30g'::text, null::text, 1::integer, 4::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '연어'::text, '연어(150g)'::text, null::text, 0::integer, 0::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '소금'::text, '소금(0.3g)'::text, null::text, 8::integer, 1::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '후추'::text, '후춧가루(0.01g)'::text, null::text, 9::integer, 2::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '레몬'::text, '레몬(1/4개)'::text, null::text, 7::integer, 3::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '양파'::text, '양파(50g)'::text, null::text, 1::integer, 4::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '마늘'::text, '마늘(20g)'::text, null::text, 5::integer, 5::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '토마토'::text, '토마토(100g)'::text, null::text, 2::integer, 6::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '파프리카'::text, '파프리카(50g)'::text, null::text, 3::integer, 7::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '피망'::text, '청피망(30g)'::text, null::text, 6::integer, 8::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '당근'::text, '당근(30g)'::text, null::text, 4::integer, 9::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '화이트크림'::text, '화이트크림(50g)'::text, null::text, 11::integer, 10::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '생크림'::text, '생크림(20g)'::text, null::text, 10::integer, 11::integer),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, '버터'::text, '버터(20g)'::text, null::text, 12::integer, 12::integer),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '오이고추'::text, '오이고추(40g)'::text, '필수 재료'::text, 0::integer, 0::integer),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '해물육수'::text, '해물육수(8g)'::text, '절임물'::text, 4::integer, 1::integer),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '어간장'::text, '어간장(3g)'::text, '절임물'::text, 5::integer, 2::integer),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '부추'::text, '영양부추(5g)'::text, '필수 재료'::text, 1::integer, 3::integer),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '연근'::text, '연근(5g)'::text, '필수 재료'::text, 2::integer, 4::integer),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '무'::text, '무(5g)'::text, '필수 재료'::text, 3::integer, 5::integer),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '고춧가루'::text, '고춧가루(3g)'::text, '양념'::text, 6::integer, 6::integer),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '생강청'::text, '생강청(3g)'::text, '양념'::text, 7::integer, 7::integer),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '통깨'::text, '통깨(1g)'::text, '양념'::text, 8::integer, 8::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '간장'::text, '저염간장 5g(1작은술)'::text, '간장 레몬 소스'::text, 9::integer, 0::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '식초'::text, '식초 15g(1큰술)'::text, '간장 레몬 소스'::text, 10::integer, 1::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '레몬즙'::text, '레몬즙 5g(1작은술)'::text, '간장 레몬 소스'::text, 12::integer, 2::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '설탕'::text, '설탕 10g(1큰술)'::text, '간장 레몬 소스'::text, 11::integer, 3::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '호박'::text, '호박 50g(1/3개)'::text, null::text, 1::integer, 4::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '가지'::text, '구운채소 : 가지 20g(3cm)'::text, null::text, 0::integer, 5::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '새송이버섯'::text, '새송이버섯 15g(3개)'::text, null::text, 2::integer, 6::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '양파'::text, '양파 15g(1/8개)'::text, null::text, 3::integer, 7::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '파프리카'::text, '빨강 파프리카 3g(3×1cm)'::text, null::text, 5::integer, 8::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '파프리카'::text, '노랑 파프리카 3g(3×1cm)'::text, null::text, 6::integer, 9::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '피망'::text, '청피망 3g(3×1cm)'::text, null::text, 7::integer, 10::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '올리브 오일'::text, '올리브유 약간'::text, null::text, 8::integer, 11::integer),
  ('426ae2a2-04f0-552d-98e8-6c6d144bc1f7'::uuid, '발사믹 식초'::text, '발사믹크레마 15g(1큰술)'::text, null::text, 4::integer, 12::integer),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, '무'::text, '무 50g'::text, null::text, 0::integer, 0::integer),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, '연근'::text, '연근 25g'::text, null::text, 1::integer, 1::integer),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, '소금'::text, '함초소금 2g'::text, null::text, 4::integer, 2::integer),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, '사과'::text, '사과 25g'::text, null::text, 2::integer, 3::integer),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, '배'::text, '배 30g'::text, null::text, 3::integer, 4::integer),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, '청양고추'::text, '청양고추 10g'::text, '국물'::text, 8::integer, 5::integer),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, '매실청'::text, '매실청 30g'::text, '국물'::text, 5::integer, 6::integer),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, '생강청'::text, '생강청 15g'::text, '국물'::text, 6::integer, 7::integer),
  ('d6b476b5-7b6f-5a68-8f61-55ae8f00a783'::uuid, '소금'::text, '함초소금 1g'::text, '국물'::text, 7::integer, 8::integer),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '부추'::text, '부추 10g(5줄기)'::text, null::text, 2::integer, 0::integer),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '양파'::text, '양파 10g(3×1cm)'::text, null::text, 1::integer, 1::integer),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '고춧가루'::text, '고춧가루 4g(1작은술)'::text, '양념장'::text, 3::integer, 2::integer),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '멸치액젓'::text, '멸치액젓 3g(2/3작은술)'::text, '양념장'::text, 4::integer, 3::integer),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '다진마늘'::text, '다진 마늘 2.5g(1/2쪽)'::text, '양념장'::text, 5::integer, 4::integer),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '매실청'::text, '매실액 2g(1/3작은술)'::text, '양념장'::text, 6::integer, 5::integer),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '설탕'::text, '설탕 2g(1/3작은술)'::text, '양념장'::text, 7::integer, 6::integer),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '물'::text, '물 2ml(1/3작은술)'::text, '양념장'::text, 8::integer, 7::integer),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '통깨'::text, '통깨 약간'::text, '양념장'::text, 9::integer, 8::integer),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '방울토마토'::text, '방울토마토 150g(5개)'::text, null::text, 0::integer, 9::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '단호박'::text, '밀전병 : 단호박(100g)'::text, '밀전병'::text, 11::integer, 0::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '소고기'::text, '소고기(70g)'::text, null::text, 0::integer, 1::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '간장'::text, '저염간장(10g)'::text, null::text, 1::integer, 2::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '다진마늘'::text, '다진 마늘(10g)'::text, null::text, 2::integer, 3::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '설탕'::text, '설탕(10g)'::text, null::text, 3::integer, 4::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '파프리카'::text, '파프리카(30g)'::text, null::text, 4::integer, 5::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '오이'::text, '오이(20g)'::text, null::text, 5::integer, 6::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '적양배추'::text, '적양배추(20g)'::text, null::text, 6::integer, 7::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '무순'::text, '무순(5g)'::text, null::text, 10::integer, 8::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '사과'::text, '사과(20g)'::text, null::text, 7::integer, 9::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '팽이버섯'::text, '팽이버섯(20g)'::text, null::text, 9::integer, 10::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '다진마늘'::text, '다진 마늘(10g)'::text, '소스'::text, 14::integer, 11::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '양파'::text, '다진 양파(20g)'::text, '소스'::text, 15::integer, 12::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '올리브 오일'::text, '올리브오일(20g)'::text, '소스'::text, 16::integer, 13::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '설탕'::text, '설탕(10g)'::text, null::text, 8::integer, 14::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '식초'::text, '식초(20g)'::text, '소스'::text, 18::integer, 15::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '소금'::text, '소금(0.5g)'::text, '밀전병'::text, 13::integer, 16::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '밀가루'::text, '밀가루(50g)'::text, '밀전병'::text, 12::integer, 17::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '소금'::text, '소금(0.5g)'::text, '소스'::text, 19::integer, 18::integer),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, '설탕'::text, '설탕(10g)'::text, '소스'::text, 17::integer, 19::integer),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, '청양고추'::text, '청양고추 5g(1/2개)'::text, '레몬마요네즈 소스'::text, 5::integer, 0::integer),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, '홍고추'::text, '홍고추 5g(1/2개)'::text, '레몬마요네즈 소스'::text, 6::integer, 1::integer),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, '참기름'::text, '참기름 약간'::text, null::text, 2::integer, 2::integer),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, '마요네즈'::text, '마요네즈 10g(2작은술)'::text, '레몬마요네즈 소스'::text, 3::integer, 3::integer),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, '레몬즙'::text, '레몬즙 20g(11⁄3큰술)'::text, '레몬마요네즈 소스'::text, 4::integer, 4::integer),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, '돌나물'::text, '돌나물 샐러드 : 돌나물 90g'::text, null::text, 0::integer, 5::integer),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, '미니새송이버섯'::text, '미니새송이버섯 60g(7개)'::text, null::text, 1::integer, 6::integer),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, '참기름'::text, '참기름 약간'::text, '레몬마요네즈 소스'::text, 7::integer, 7::integer),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, '올리브 오일'::text, '올리브오일 5g(1작은술)'::text, '주 재료'::text, 4::integer, 0::integer),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, '발사믹 식초'::text, '발사믹식초 60g(4큰술)'::text, '드레싱'::text, 6::integer, 1::integer),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, '후추'::text, '후춧가루 2g(1/2작은술)'::text, '드레싱'::text, 7::integer, 2::integer),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, '가지'::text, '가지 100g(1개)'::text, '주 재료'::text, 0::integer, 3::integer),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, '토마토'::text, '토마토 200g(11⁄2개)'::text, '주 재료'::text, 1::integer, 4::integer),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, '올리브 오일'::text, '올리브오일 25g(2큰술)'::text, '드레싱'::text, 5::integer, 5::integer),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, '마늘'::text, '마늘 10g(2개)'::text, '주 재료'::text, 3::integer, 6::integer),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, '무순'::text, '무순 20g'::text, '주 재료'::text, 2::integer, 7::integer),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '감자'::text, '감자(150g)'::text, null::text, 0::integer, 0::integer),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '오이'::text, '오이(20g)'::text, null::text, 4::integer, 1::integer),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '당근'::text, '당근(20g)'::text, null::text, 2::integer, 2::integer),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '양파'::text, '양파(20g)'::text, null::text, 3::integer, 3::integer),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '소금'::text, '소금(0.5g)'::text, null::text, 5::integer, 4::integer),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '생크림'::text, '생크림(20g)'::text, null::text, 1::integer, 5::integer),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '모짜렐라 치즈'::text, '모짜렐라치즈(50g)'::text, null::text, 6::integer, 6::integer),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '밀가루'::text, '밀가루(20g)'::text, null::text, 7::integer, 7::integer),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '달걀'::text, '달걀(50g)'::text, null::text, 8::integer, 8::integer),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '빵가루'::text, '빵가루(50g)'::text, null::text, 9::integer, 9::integer),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '식용유'::text, '튀김기름(400g)'::text, null::text, 10::integer, 10::integer),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, '간장'::text, '간장 20g(11⁄3큰술)'::text, '드레싱'::text, 3::integer, 0::integer),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, '레몬즙'::text, '레몬즙 60g(4큰술)'::text, '드레싱'::text, 5::integer, 1::integer),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, '설탕'::text, '설탕 6g(1작은술)'::text, '드레싱'::text, 6::integer, 2::integer),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, '홍고추'::text, '다진 홍고추 10g(1개)'::text, '드레싱'::text, 4::integer, 3::integer),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, '민들레 잎'::text, '민들레 잎 40g'::text, '주 재료'::text, 0::integer, 4::integer),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, '비트'::text, '비트 5g(1작은술)'::text, '주 재료'::text, 1::integer, 5::integer),
  ('b1e4550e-f9a9-516a-b11b-29a410ade9d9'::uuid, '오렌지 껍질'::text, '오렌지(껍질) 40g(1/5개)'::text, '주 재료'::text, 2::integer, 6::integer),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, '칵테일새우'::text, '칵테일새우 20g(5마리)'::text, null::text, 1::integer, 0::integer),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, '연두부'::text, '연두부 75g(3/4모)'::text, null::text, 0::integer, 1::integer),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, '달걀'::text, '달걀 30g(1/2개)'::text, null::text, 2::integer, 2::integer),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, '생크림'::text, '생크림 13g(1큰술)'::text, null::text, 3::integer, 3::integer),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, '설탕'::text, '설탕 5g(1작은술)'::text, null::text, 4::integer, 4::integer),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, '무염버터'::text, '무염버터 5g(1작은술)'::text, null::text, 5::integer, 5::integer),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, '시금치'::text, '시금치 10g(3줄기)'::text, '고명'::text, 6::integer, 6::integer),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '배추'::text, '배추 70g(1/10개)'::text, '주 재료'::text, 0::integer, 0::integer),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '소금'::text, '소금 5g(1/2작은술)'::text, '주 재료'::text, 2::integer, 1::integer),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '석류즙'::text, '석류즙 10g(2작은술)'::text, '주 재료'::text, 1::integer, 2::integer),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '무'::text, '무 10g(3cm)'::text, '소'::text, 3::integer, 3::integer),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '쪽파'::text, '쪽파 10g(1개)'::text, '소'::text, 5::integer, 4::integer),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '미나리'::text, '미나리 10g'::text, '소'::text, 4::integer, 5::integer),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '다진마늘'::text, '다진 마늘 5g(1작은술)'::text, '소'::text, 6::integer, 6::integer),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '다진생강'::text, '다진 생강 5g(1작은술)'::text, '소'::text, 7::integer, 7::integer),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '새우젓'::text, '새우젓국 15g(1큰술)'::text, '소'::text, 8::integer, 8::integer),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, '식초'::text, '식초 약간'::text, null::text, 5::integer, 0::integer),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, '소금'::text, '소금 약간'::text, null::text, 6::integer, 1::integer),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, '메추리알'::text, '메추리알 30g(3개)'::text, null::text, 3::integer, 2::integer),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, '딸기'::text, '딸기 70g(7개)'::text, null::text, 0::integer, 3::integer),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, '양상추'::text, '양상추 70g(2장)'::text, null::text, 2::integer, 4::integer),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, '블루베리'::text, '블루베리 15g(1큰술)'::text, null::text, 4::integer, 5::integer),
  ('e168bb81-7c6b-5b96-b111-8c53fb8f0336'::uuid, '플레인요거트'::text, '플레인요거트 85g(1개)'::text, null::text, 1::integer, 6::integer),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, '시금치'::text, '시금치 10g'::text, '시금치우유 소스'::text, 5::integer, 0::integer),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, '우유'::text, '우유 10g(2작은술)'::text, '시금치우유 소스'::text, 6::integer, 1::integer),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, '감자'::text, '그린매쉬드포테이토 : 감자 80g(1/2개)'::text, '그린매쉬드포테이토'::text, 0::integer, 2::integer),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, '아몬드'::text, '아몬드 2g(1알)'::text, '그린매쉬드포테이토'::text, 1::integer, 3::integer),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, '치커리'::text, '치커리 약간'::text, '그린매쉬드포테이토'::text, 4::integer, 4::integer),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, '설탕'::text, '설탕 2g(1/3작은술)'::text, '그린매쉬드포테이토'::text, 2::integer, 5::integer),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, '크랜베리'::text, '크랜베리 3g'::text, '그린매쉬드포테이토'::text, 3::integer, 6::integer),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, '애호박'::text, '애호박(150g)'::text, null::text, 0::integer, 0::integer),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, '소금'::text, '소금(0.5g)'::text, null::text, 1::integer, 1::integer),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, '양파'::text, '양파(20g)'::text, null::text, 2::integer, 2::integer),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, '대파'::text, '대파(10g)'::text, null::text, 3::integer, 3::integer),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, '홍고추'::text, '홍고추(10g)'::text, null::text, 4::integer, 4::integer),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, '들기름'::text, '들기름(20g)'::text, null::text, 5::integer, 5::integer),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, '다진마늘'::text, '다진 마늘(5g)'::text, null::text, 6::integer, 6::integer),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, '건새우'::text, '건새우(20g)'::text, null::text, 7::integer, 7::integer),
  ('d8159d8a-d32c-50d0-96ef-d669a6518c41'::uuid, '들깨가루'::text, '들깨가루(30g)'::text, null::text, 8::integer, 8::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '감자'::text, '감자 100g(1개)'::text, '주 재료'::text, 0::integer, 0::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '양배추'::text, '양배추 150g(1/2개)'::text, '주 재료'::text, 1::integer, 1::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '돼지고기'::text, '돼지고기 30g'::text, '주 재료'::text, 4::integer, 2::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '당근'::text, '당근 15g(1/10개)'::text, '주 재료'::text, 2::integer, 3::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '청양고추'::text, '청양고추 5g(1개)'::text, '주 재료'::text, 5::integer, 4::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '두부'::text, '두부 20g(1/20모)'::text, '주 재료'::text, 3::integer, 5::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '부침가루'::text, '부침가루 45g(3큰술)'::text, '주 재료'::text, 6::integer, 6::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '달걀'::text, '달걀 60g(1개)'::text, '주 재료'::text, 7::integer, 7::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '식용유'::text, '식용유 15g(1큰술)'::text, '주 재료'::text, 8::integer, 8::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '오렌지즙'::text, '오렌지즙 15g(1큰술)'::text, '소스'::text, 9::integer, 9::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '간장'::text, '간장 2g(1/2작은술)'::text, '소스'::text, 10::integer, 10::integer),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, '식초'::text, '식초 10g(2작은술)'::text, '소스'::text, 11::integer, 11::integer),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, '연근'::text, '연근(60g)'::text, null::text, 0::integer, 0::integer),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, '식초'::text, '식초(10g)'::text, null::text, 1::integer, 1::integer),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, '식용유'::text, '식용유(200g)'::text, null::text, 4::integer, 2::integer),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, '소금'::text, '천일염(0.1g)'::text, null::text, 2::integer, 3::integer),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, '계피가루'::text, '계피가루(20g)'::text, null::text, 3::integer, 4::integer),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '양파'::text, '양파 60g'::text, null::text, 1::integer, 0::integer),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '오이'::text, '오이 40g'::text, null::text, 2::integer, 1::integer),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '연근'::text, '연근 200g'::text, null::text, 0::integer, 2::integer),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '밤'::text, '밤 60g'::text, null::text, 3::integer, 3::integer),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '유자청'::text, '유자청 25g'::text, '소스'::text, 4::integer, 4::integer),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '강황가루'::text, '강황가루 2g'::text, '소스'::text, 5::integer, 5::integer),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '잣'::text, '잣 2g'::text, '소스'::text, 6::integer, 6::integer),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '설탕'::text, '설탕 5g'::text, '소스'::text, 7::integer, 7::integer),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '식초'::text, '식초 15g'::text, '소스'::text, 8::integer, 8::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '모시조개'::text, '모시조개(50g)'::text, null::text, 0::integer, 0::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '연어'::text, '연어(100g)'::text, null::text, 1::integer, 1::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '당근'::text, '당근(20g)'::text, null::text, 3::integer, 2::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '양파'::text, '양파(20g)'::text, null::text, 4::integer, 3::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '감자'::text, '감자(50g)'::text, null::text, 5::integer, 4::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '피망'::text, '청피망(20g)'::text, null::text, 2::integer, 5::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '버터'::text, '버터(5g)'::text, null::text, 7::integer, 6::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '밀가루'::text, '밀가루(10g)'::text, null::text, 6::integer, 7::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '육수'::text, '육수(200g)'::text, null::text, 8::integer, 8::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '월계수잎'::text, '월계수잎(1장)'::text, null::text, 9::integer, 9::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '통후추'::text, '통후추(3알)'::text, null::text, 10::integer, 10::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '마늘'::text, '통마늘(10g)'::text, null::text, 12::integer, 11::integer),
  ('83cea47d-8eab-5799-b70d-649f2e17c5ad'::uuid, '생크림'::text, '생크림(30g)'::text, null::text, 11::integer, 12::integer),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '파스타면'::text, '파스타면 50g'::text, null::text, 0::integer, 0::integer),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '청양고추'::text, '청양고추 30g'::text, null::text, 10::integer, 1::integer),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '들기름'::text, '생들기름 30g'::text, null::text, 8::integer, 2::integer),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '열무 김치'::text, '열무김치 100g'::text, null::text, 1::integer, 3::integer),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '오이'::text, '오이 20g'::text, null::text, 2::integer, 4::integer),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '고추'::text, '청홍고추 각각 15g'::text, null::text, 3::integer, 5::integer),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '홍고추'::text, '청홍고추 각각 15g'::text, null::text, 4::integer, 6::integer),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '파프리카'::text, '노란 파프리카 30g'::text, null::text, 5::integer, 7::integer),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '당근'::text, '당근 25g'::text, null::text, 7::integer, 8::integer),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '양파'::text, '양파 30g'::text, null::text, 6::integer, 9::integer),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '통깨'::text, '통깨 2g'::text, null::text, 9::integer, 10::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '오징어'::text, '오징어 1마리(220g)'::text, null::text, 0::integer, 0::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '레몬즙'::text, '레몬즙 15g'::text, null::text, 14::integer, 1::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '강낭콩'::text, '강낭콩 20g'::text, null::text, 3::integer, 2::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '피망'::text, '피망 20g'::text, null::text, 6::integer, 3::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '당근'::text, '당근 20g'::text, null::text, 4::integer, 4::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '양파'::text, '양파 25g'::text, null::text, 8::integer, 5::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '대파'::text, '대파 10g'::text, null::text, 7::integer, 6::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '파프리카'::text, '미니파프리카 20g'::text, null::text, 5::integer, 7::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '다진마늘'::text, '다진마늘 5g'::text, null::text, 11::integer, 8::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '귀리밥'::text, '귀리밥 50g'::text, null::text, 2::integer, 9::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '카레가루'::text, '카레가루 25g'::text, '소'::text, 9::integer, 10::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '옥수수'::text, '옥수수 30g'::text, null::text, 1::integer, 11::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '후추'::text, '흰후추 1g'::text, null::text, 10::integer, 12::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '참기름'::text, '참기름 15g'::text, null::text, 12::integer, 13::integer),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '밀가루'::text, '밀가루 15g'::text, null::text, 13::integer, 14::integer),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '쌀'::text, '쌀(100g)'::text, null::text, 0::integer, 0::integer),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '전복'::text, '전복(1개)'::text, null::text, 1::integer, 1::integer),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '소금'::text, '소금(0.2g)'::text, null::text, 7::integer, 2::integer),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '버터'::text, '버터(10g)'::text, null::text, 9::integer, 3::integer),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '당근'::text, '당근(20g)'::text, null::text, 2::integer, 4::integer),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '양파'::text, '양파(30g)'::text, null::text, 3::integer, 5::integer),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '양송이버섯'::text, '양송이버섯(3개)'::text, null::text, 4::integer, 6::integer),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '올리브 오일'::text, '올리브오일(10g)'::text, null::text, 6::integer, 7::integer),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '우유'::text, '우유(200g)'::text, null::text, 5::integer, 8::integer),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, '후추'::text, '후춧가루(0.01g)'::text, null::text, 8::integer, 9::integer);

do $$
declare
  v_missing text;
begin
  select string_agg(q.standard_name || ' / ' || coalesce(q.display_text, ''), ', ' order by q.standard_name, q.display_text)
    into v_missing
    from tmp_foodsafety_quality_ingredient_order q
    left join public.ingredients ingredient on ingredient.standard_name = q.standard_name
    left join public.recipe_ingredients ri
      on ri.recipe_id = q.recipe_id
     and ri.ingredient_id = ingredient.id
     and coalesce(ri.display_text, '') = coalesce(q.display_text, '')
     and coalesce(ri.component_label, '') = coalesce(q.component_label, '')
     and ri.sort_order = q.previous_sort_order
   where ri.id is null;

  if v_missing is not null then
    raise exception 'FoodSafety quality correction missing ingredient rows: %', v_missing;
  end if;
end $$;

update public.recipe_ingredients ri
   set sort_order = q.sort_order
  from tmp_foodsafety_quality_ingredient_order q
  join public.ingredients ingredient on ingredient.standard_name = q.standard_name
 where ri.recipe_id = q.recipe_id
   and ri.ingredient_id = ingredient.id
   and coalesce(ri.display_text, '') = coalesce(q.display_text, '')
   and coalesce(ri.component_label, '') = coalesce(q.component_label, '')
   and ri.sort_order = q.previous_sort_order;

create temp table tmp_foodsafety_replacement_ingredients (
  sort_order integer not null,
  standard_name text not null,
  amount numeric,
  unit text,
  ingredient_type public.recipe_ingredient_type not null,
  display_text text,
  component_label text,
  scalable boolean not null
) on commit drop;

insert into tmp_foodsafety_replacement_ingredients (
  sort_order, standard_name, amount, unit, ingredient_type, display_text, component_label, scalable
)
values
  (0::integer, '올리브 오일'::text, 10::numeric, 'g'::text, 'QUANT'::public.recipe_ingredient_type, '올리브유 10g(2작은술)'::text, '올리브마늘 드레싱'::text, true),
  (1::integer, '식초'::text, 5::numeric, 'g'::text, 'QUANT'::public.recipe_ingredient_type, '식초 5g(1작은술)'::text, '올리브마늘 드레싱'::text, true),
  (2::integer, '설탕'::text, 5::numeric, 'g'::text, 'QUANT'::public.recipe_ingredient_type, '설탕 5g(1작은술)'::text, '올리브마늘 드레싱'::text, true),
  (3::integer, '마늘'::text, 5::numeric, 'g'::text, 'QUANT'::public.recipe_ingredient_type, '마늘 5g(1쪽)'::text, '올리브마늘 드레싱'::text, true),
  (4::integer, '치커리'::text, 30::numeric, 'g'::text, 'QUANT'::public.recipe_ingredient_type, '치커리 30g(10줄기)'::text, null::text, true),
  (5::integer, '적양배추'::text, 15::numeric, 'g'::text, 'QUANT'::public.recipe_ingredient_type, '적양배추 15g(5×3cm)'::text, null::text, true),
  (6::integer, '양파'::text, 10::numeric, 'g'::text, 'QUANT'::public.recipe_ingredient_type, '양파 10g(2×1cm)'::text, null::text, true),
  (7::integer, '당근'::text, 5::numeric, 'g'::text, 'QUANT'::public.recipe_ingredient_type, '당근 5g(3×1×1cm)'::text, null::text, true);

do $$
declare
  v_missing text;
begin
  select string_agg(distinct seed.standard_name, ', ' order by seed.standard_name)
    into v_missing
    from tmp_foodsafety_replacement_ingredients seed
    left join public.ingredients ingredient on ingredient.standard_name = seed.standard_name
   where ingredient.id is null;

  if v_missing is not null then
    raise exception 'FoodSafety replacement recipe missing ingredients: %', v_missing;
  end if;
end $$;

create temp table tmp_foodsafety_replacement_steps (
  step_number integer primary key,
  method_label text not null,
  instruction text not null,
  component_label text
) on commit drop;

insert into tmp_foodsafety_replacement_steps (step_number, method_label, instruction, component_label)
values
  (1::integer, '섞기'::text, '올리브유, 식초, 설탕, 다진 마늘을 섞어 거품기로 충분히 저어주어 올리브마늘 드레싱을 만든다.'::text, '올리브마늘 드레싱'::text),
  (2::integer, '썰기'::text, '치커리는 싱싱하게 찬물에 담갔다가 물기를 뺀 후 한입 크기로 자르고, 적양배추, 양파, 당근은 곱게 채를 썬다.'::text, null::text),
  (3::integer, '섞기'::text, '접시에 준비한 치커리, 적양배추, 양파, 당근을 담고 올리브마늘 드레싱을 뿌린다.'::text, '올리브마늘 드레싱'::text);

update public.recipes
   set title = '치커리샐러드와 올리브 마늘 소스'::text,
       description = '반찬 · 식약처 공공 레시피'::text,
       thumbnail_url = 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00095_2.png'::text,
       base_servings = 1,
       tags = array['샐러드'::text, '다이어트'::text, '밑반찬'::text]::text[],
       source_type = 'system'::public.recipe_source_type,
       updated_at = now()
 where id = '7e169300-b4d5-5a14-9b31-aa989035d862'::uuid;

do $$
begin
  if not exists (
    select 1
      from public.recipes
     where id = '7e169300-b4d5-5a14-9b31-aa989035d862'::uuid
  ) then
    raise exception 'FoodSafety replacement target recipe not found: %', '7e169300-b4d5-5a14-9b31-aa989035d862'::text;
  end if;
end $$;

delete from public.recipe_sources where recipe_id = '7e169300-b4d5-5a14-9b31-aa989035d862'::uuid;
delete from public.recipe_ingredients where recipe_id = '7e169300-b4d5-5a14-9b31-aa989035d862'::uuid;
delete from public.recipe_steps where recipe_id = '7e169300-b4d5-5a14-9b31-aa989035d862'::uuid;
delete from public.recipe_tags where recipe_id = '7e169300-b4d5-5a14-9b31-aa989035d862'::uuid;

insert into public.recipe_sources (
  recipe_id, extraction_methods, extraction_meta_json, raw_extracted_text
)
values (
  '7e169300-b4d5-5a14-9b31-aa989035d862'::uuid,
  array['foodsafety_cookrcp_api', 'user_reviewed_pilot_30', 'manual_pilot_quality_review']::text[],
  '{"source_provider":"foodsafety-cookrcp","source_recipe_id":"95","candidate_id":"foodsafety-cookrcp:95","pilot_order":15,"external_category":"반찬","source_method_label":"기타","source_image_url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00095_1.png","nutrition":{"serving_weight":null,"calories":"170","carbohydrates":"13","protein":"3","fat":"12","sodium":"74"},"reviewed_scope":"pilot_30_quality_corrected_replacement","reviewed_at":"2026-06-26T00:00:00.000Z","replacement_reason":"Replaces FoodSafety source row 587 because source ingredients and steps are inconsistent.","quality_reviewed_at":"2026-06-26T00:00:00.000Z","quality_reviewed_by":"Codex 코실장","visible_tags":["샐러드","다이어트","밑반찬"],"internal_source_tags":["공공레시피","식약처레시피"],"image_candidates":[{"role":"primary_candidate","source_key":"ATT_FILE_NO_MAIN","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00095_2.png"},{"role":"alternate_finished","source_key":"ATT_FILE_NO_MK","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00095_1.png"},{"role":"step","source_key":"MANUAL_IMG01","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00095_2.png"},{"role":"step","source_key":"MANUAL_IMG02","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00095_3.png"},{"role":"step","source_key":"MANUAL_IMG03","url":"http://www.foodsafetykorea.go.kr/uploadimg/cook/20_00095_4.png"}],"corrections":{"replacement":"in_place_source_recipe_replacement","replacement_of_source_recipe_id":"587","replacement_reason":"FoodSafety source row 587 has mismatched ingredients for the visible tofu caprese steps.","step_methods":"manual_per_step_review","ingredient_order":"step_first_review","visible_tags":"source_tags_internalized"}}'::jsonb,
  '●치커리 샐러드 : 치커리 30g(10줄기), 적양배추 15g(5×3cm), 양파 10g(2×1cm), 당근 5g(3×1×1cm)
●올리브마늘 드레싱 : 올리브유 10g(2작은술), 식초 5g(1작은술), 설탕 5g(1작은술), 마늘 5g(1쪽)'::text
);

select public.set_recipe_tags(
  '7e169300-b4d5-5a14-9b31-aa989035d862'::uuid,
  public.build_recipe_tag_payload(array['샐러드'::text, '다이어트'::text, '밑반찬'::text]::text[], 'user_reviewed'),
  null,
  'user_reviewed'
);

insert into public.recipe_ingredients (
  recipe_id, ingredient_id, amount, unit, ingredient_type, display_text, component_label, sort_order, scalable
)
select
  '7e169300-b4d5-5a14-9b31-aa989035d862'::uuid,
  ingredient.id,
  seed.amount,
  seed.unit,
  seed.ingredient_type,
  seed.display_text,
  seed.component_label,
  seed.sort_order,
  seed.scalable
from tmp_foodsafety_replacement_ingredients seed
join public.ingredients ingredient on ingredient.standard_name = seed.standard_name
order by seed.sort_order;

insert into public.recipe_steps (
  recipe_id, step_number, instruction, component_label, cooking_method_id, ingredients_used, heat_level, duration_seconds, duration_text
)
select
  '7e169300-b4d5-5a14-9b31-aa989035d862'::uuid,
  seed.step_number,
  seed.instruction,
  seed.component_label,
  method.id,
  '[]'::jsonb,
  null::varchar,
  null::integer,
  null::varchar
from tmp_foodsafety_replacement_steps seed
join public.cooking_methods method on method.label = seed.method_label
order by seed.step_number;

do $$
declare
  v_quality_count integer;
  v_source_tag_count integer;
  v_bad_step_count integer;
begin
  select count(*)
    into v_quality_count
    from public.recipe_sources
   where extraction_meta_json->>'reviewed_scope' in (
     'pilot_30_quality_corrected',
     'pilot_30_quality_corrected_replacement'
   );

  if v_quality_count <> 30 then
    raise exception 'FoodSafety quality correction expected 30 pilot recipes, got %', v_quality_count;
  end if;

  select count(*)
    into v_source_tag_count
    from public.recipes recipe
    join public.recipe_sources source on source.recipe_id = recipe.id
   where source.extraction_meta_json->>'reviewed_scope' in (
     'pilot_30_quality_corrected',
     'pilot_30_quality_corrected_replacement'
   )
     and recipe.tags && array['공공레시피', '식약처레시피']::text[];

  if v_source_tag_count <> 0 then
    raise exception 'FoodSafety quality correction still has visible source tags on % recipes', v_source_tag_count;
  end if;

  select count(*)
    into v_bad_step_count
    from tmp_foodsafety_quality_step_methods expected
    join public.recipe_steps step
      on step.recipe_id = expected.recipe_id
     and step.step_number = expected.step_number
    join public.cooking_methods method on method.id = step.cooking_method_id
   where method.label <> expected.method_label;

  if v_bad_step_count <> 0 then
    raise exception 'FoodSafety quality correction step method mismatch count: %', v_bad_step_count;
  end if;
end $$;
