-- Roll back data changes from 20260627103000_recipe_step_multi_methods_and_pilot30_edits.sql.
-- This keeps the additive recipe_step_cooking_methods table in place and collapses the pilot 30 reviewed steps back to the previous single-method values.

create temp table tmp_pilot30_step_method_rollback (
  recipe_id uuid not null,
  step_number integer not null,
  method_label text not null
) on commit drop;

insert into tmp_pilot30_step_method_rollback (recipe_id, step_number, method_label)
values
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 1::integer, '끓이기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 6::integer, '섞기'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 6::integer, '섞기'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 1::integer, '굽기'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 2::integer, '끓이기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 1::integer, '끓이기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 6::integer, '섞기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 4::integer, '볶기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 1::integer, '썰기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 2::integer, '삶기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 2::integer, '섞기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 3::integer, '볶기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 5::integer, '졸이기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 2::integer, '다지기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 5::integer, '섞기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 6::integer, '섞기'::text),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 1::integer, '섞기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 2::integer, '볶기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 5::integer, '섞기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 6::integer, '부치기'::text),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 1::integer, '볶기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 2::integer, '오븐굽기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 3::integer, '굽기'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 4::integer, '섞기'::text),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 2::integer, '섞기'::text),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 3::integer, '섞기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 1::integer, '데치기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 2::integer, '찌기'::text),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 1::integer, '다지기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 1::integer, '썰기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 5::integer, '섞기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 2::integer, '데치기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 4::integer, '섞기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 5::integer, '볶기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 1::integer, '다지기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 6::integer, '굽기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 1::integer, '절이기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 2::integer, '섞기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 6::integer, '끓이기'::text);

do $$
declare
  v_missing text;
begin
  select string_agg(distinct q.method_label, ', ' order by q.method_label)
    into v_missing
    from tmp_pilot30_step_method_rollback q
    left join public.cooking_methods method on method.label = q.method_label
   where method.id is null;

  if v_missing is not null then
    raise exception 'Pilot 30 rollback missing cooking methods: %', v_missing;
  end if;
end $$;

update public.recipe_steps step
   set cooking_method_id = method.id
  from tmp_pilot30_step_method_rollback q
  join public.cooking_methods method on method.label = q.method_label
 where step.recipe_id = q.recipe_id
   and step.step_number = q.step_number;

delete from public.recipe_step_cooking_methods link
 using public.recipe_steps step
 where link.step_id = step.id
   and exists (
     select 1
       from tmp_pilot30_step_method_rollback q
      where q.recipe_id = step.recipe_id
        and q.step_number = step.step_number
   );

insert into public.recipe_step_cooking_methods (step_id, method_id, position)
select step.id, step.cooking_method_id, 1
  from public.recipe_steps step
  join tmp_pilot30_step_method_rollback q
    on q.recipe_id = step.recipe_id
   and q.step_number = step.step_number
 where step.cooking_method_id is not null
on conflict (step_id, method_id) do nothing;

update public.recipe_ingredients ingredient
   set component_label = null
  from public.ingredients master
 where ingredient.ingredient_id = master.id
   and ingredient.recipe_id = 'f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid
   and master.standard_name = '참기름'
   and ingredient.display_text = '참기름 약간'
   and ingredient.sort_order = 2
   and ingredient.component_label = '레몬마요네즈 소스';

update public.recipe_ingredients ingredient
   set ingredient_id = old_master.id
  from public.ingredients current_master,
       public.ingredients old_master
 where ingredient.ingredient_id = current_master.id
   and ingredient.recipe_id = '7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid
   and current_master.standard_name = '미니파프리카'
   and old_master.standard_name = '파프리카'
   and ingredient.display_text = '미니파프리카 20g';

update public.recipes
   set thumbnail_url = 'http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00386_2.png',
       updated_at = now()
 where id = '9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid;

update public.recipe_sources
   set extraction_meta_json = extraction_meta_json
     - 'pilot30_multi_method_corrected_at'
     - 'pilot30_multi_method_correction_source'
 where recipe_id in ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, '9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, '298da2db-51e4-50da-9295-034d6e77045b'::uuid, '12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, '0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 'c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 'a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 'ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, '2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, '72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 'f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 'dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 'bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, '2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, '4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, '3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 'bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 'ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 'b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, '8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, '7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, '381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid);
